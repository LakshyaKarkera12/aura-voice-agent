// auth.js — everything interactive on the Sign up / Log in page:
// tabs, show/hide password, validation, loading state, and real
// Supabase sign up / log in.

import { validateSignup, validateLogin, authErrorMessage } from './validation.js';
import { supabase, getSession } from './supabaseClient.js';

// Already logged in? Skip this page and go straight to the call page
// (CLAUDE.md rule 8). `replace` so the Back button doesn't return here.
if (await getSession()) {
  window.location.replace('/app.html');
}

// ---------- Tabs ----------

const tabs = {
  signup: document.getElementById('tab-signup'),
  login: document.getElementById('tab-login'),
};
const panels = {
  signup: document.getElementById('panel-signup'),
  login: document.getElementById('panel-login'),
};

function showTab(name, { focus = null } = {}) {
  for (const key of Object.keys(tabs)) {
    const isActive = key === name;
    tabs[key].setAttribute('aria-selected', String(isActive));
    // Only the active tab is reachable with the Tab key; arrows move between tabs.
    tabs[key].tabIndex = isActive ? 0 : -1;
    panels[key].hidden = !isActive;
  }
  hideBanner(); // an old error from the other form would be confusing

  if (focus === 'tab') tabs[name].focus();
  if (focus === 'firstField') panels[name].querySelector('input').focus();
}

tabs.signup.addEventListener('click', () => showTab('signup'));
tabs.login.addEventListener('click', () => showTab('login'));

// Left/Right arrow keys switch tabs: the standard keyboard pattern for tabs.
document.querySelector('.tabs').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const next = tabs.signup.getAttribute('aria-selected') === 'true' ? 'login' : 'signup';
  showTab(next, { focus: 'tab' });
});

// "Already have an account? Log in" / "New here? Create an account"
document.querySelectorAll('[data-switch-to]').forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.switchTo, { focus: 'firstField' }));
});

// ---------- Show / hide password ----------

document.querySelectorAll('.password-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    button.querySelector('.toggle-text').textContent = willShow ? 'Hide' : 'Show';
  });
});

// ---------- Error banner (for server errors) ----------

const banner = document.getElementById('form-banner');

function showBanner(message) {
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
  banner.textContent = '';
}

// ---------- Form helpers ----------

// Shows (or clears) the message under one field.
function setFieldError(form, fieldName, message) {
  const input = form.elements[fieldName];
  const errorEl = document.getElementById(`${input.id}-error`);
  errorEl.textContent = message || '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

// FormData reads every input by its `name` attribute → { email: '...', ... }
function readForm(form) {
  return Object.fromEntries(new FormData(form));
}

// Disables the button and shows the spinner, so the user can't double-submit.
function setLoading(form, isLoading, loadingText) {
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('.btn-label');

  button.disabled = isLoading;
  button.setAttribute('aria-busy', String(isLoading));
  button.querySelector('.spinner').hidden = !isLoading;

  if (isLoading) {
    button.dataset.idleText = label.textContent;
    label.textContent = loadingText;
  } else {
    label.textContent = button.dataset.idleText;
  }
}

// Shared submit logic for both forms: validate → show errors or submit.
function wireForm(form, { fields, validate, loadingText, submit }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // stop the browser reloading the page
    hideBanner();

    const values = readForm(form);
    const errors = validate(values);
    fields.forEach((name) => setFieldError(form, name, errors[name]));

    // Move focus to the first problem so keyboard/screen-reader users find it.
    const firstInvalid = fields.find((name) => errors[name]);
    if (firstInvalid) {
      form.elements[firstInvalid].focus();
      return;
    }

    setLoading(form, true, loadingText);
    try {
      await submit(values);
    } catch (error) {
      showBanner(error.message);
    } finally {
      setLoading(form, false);
    }
  });

  // Once a field shows an error, re-check it as the user types, so the
  // message disappears as soon as it's fixed (not only on the next submit).
  form.addEventListener('input', (event) => {
    const input = event.target;
    if (input.getAttribute('aria-invalid') !== 'true') return;
    const errors = validate(readForm(form));
    setFieldError(form, input.name, errors[input.name]);
  });
}

wireForm(document.getElementById('signup-form'), {
  fields: ['fullName', 'email', 'password'],
  validate: validateSignup,
  loadingText: 'Creating account…',
  submit: createAccount,
});

wireForm(document.getElementById('login-form'), {
  fields: ['email', 'password'],
  validate: validateLogin,
  loadingText: 'Logging in…',
  submit: logIn,
});

// ---------- Supabase ----------
// Throwing an Error shows its message in the red banner (see wireForm).

async function createAccount({ fullName, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // Stored on the user as user_metadata.full_name. Aria greets them with it.
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw new Error(authErrorMessage(error));

  // With "Confirm email" OFF, signUp returns a session straight away.
  // No session means confirmation is still ON in the Supabase dashboard.
  if (!data.session) {
    throw new Error(authErrorMessage({ code: 'email_not_confirmed' }));
  }
  window.location.replace('/app.html');
}

async function logIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authErrorMessage(error));
  window.location.replace('/app.html');
}
