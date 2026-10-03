// validation.js — checks the sign up / log in form values.
//
// Kept separate from auth.js (which touches the page) so these pure
// functions can be tested with `npm test` without a browser.
//
// Each function returns an object of error messages keyed by field name.
// An empty object {} means "everything is valid".

// Simple shape check: something@something.something, no spaces.
// Supabase does the final check; this just catches typos early.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 6; // Supabase's default minimum
const MAX_NAME_LENGTH = 60;

function checkEmail(email) {
  const value = email.trim();
  if (!value) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email, like name@example.com.';
  return null;
}

export function validateSignup({ fullName = '', email = '', password = '' }) {
  const errors = {};

  const name = fullName.trim();
  if (!name) errors.fullName = 'Enter your full name.';
  else if (name.length > MAX_NAME_LENGTH) errors.fullName = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;

  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;

  // Passwords are NOT trimmed: a space can be a deliberate character.
  if (!password) errors.password = 'Create a password.';
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return errors;
}

// Turns a Supabase Auth error into a message a customer understands.
// Supabase gives a machine-readable `code` (e.g. "user_already_exists");
// we fall back to matching the message text for older error shapes.
const AUTH_ERROR_MESSAGES = {
  user_already_exists: 'This email is already registered. Log in instead.',
  email_exists: 'This email is already registered. Log in instead.',
  invalid_credentials: "That email and password don't match. Check them and try again.",
  weak_password: `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`,
  email_address_invalid: 'Enter a valid email address.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  email_not_confirmed: 'This account needs email confirmation, which is turned off for this demo. Contact the developer.',
  signup_disabled: 'Sign-ups are turned off right now.',
};

export function authErrorMessage(error) {
  if (!error) return '';
  if (AUTH_ERROR_MESSAGES[error.code]) return AUTH_ERROR_MESSAGES[error.code];

  const message = String(error.message || '').toLowerCase();
  if (message.includes('already registered')) return AUTH_ERROR_MESSAGES.user_already_exists;
  if (message.includes('invalid login credentials')) return AUTH_ERROR_MESSAGES.invalid_credentials;
  if (message.includes('failed to fetch') || error.status === 0) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  return 'Something went wrong. Please try again.';
}

export function validateLogin({ email = '', password = '' }) {
  const errors = {};

  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;

  // No length rule on login: just make sure something was typed.
  if (!password) errors.password = 'Enter your password.';

  return errors;
}
