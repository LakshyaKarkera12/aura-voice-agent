// app.js — wires the call page together.
//
// Session guard, header, call card (orb + buttons), live transcript,
// summary card, Test Orders.

import { orderStore } from './orders.js';
import { createCallStateMachine, isActiveState, startVoiceSession, CALL_STATES } from './voice.js';
import { createClientTools } from './tools.js';
import { createTranscript } from './transcript.js';
import { createSummaryView } from './summaryView.js';
import { supabase, getSession, getFullName } from './supabaseClient.js';

// ---------- Session guard (CLAUDE.md rule 8) ----------
// No session → back to the sign up / log in page. The page stays invisible
// (body.auth-pending in app.css) until this check passes, so logged-out
// visitors never see a flash of the call page.
const session = await getSession();
if (!session) {
  window.location.replace('/');
  throw new Error('Not logged in'); // stop running the rest of this file
}
document.body.classList.remove('auth-pending');

const fullName = getFullName(session);
// First name only: Aria says "Hi Lakshya", not "Hi Lakshya Karkera".
const firstName = fullName.split(/\s+/)[0];
document.getElementById('user-first-name').textContent = firstName;

document.getElementById('logout-button').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.replace('/');
});

// Calls one of our /api functions with the user's login token (rule 4).
// getSession() is called each time because Supabase refreshes the token
// (access tokens expire after about an hour).
async function callApi(path, options = {}) {
  const current = await getSession();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${current?.access_token ?? ''}`,
    },
  });
  if (!res.ok) {
    const error = new Error(`${path} answered ${res.status}`);
    error.status = res.status; // lets voice.js show "not available" for 403
    throw error;
  }
  return res.json();
}

// Asks our server for a signed URL so the agent can stay private (D-12).
async function getSignedConnection() {
  const { signedUrl } = await callApi('/api/signed-url');
  return { signedUrl };
}

const transcript = createTranscript(
  document.getElementById('transcript-list'),
  document.getElementById('transcript-empty'),
);
const summaryView = createSummaryView();

// ---------- Call card: orb, labels, buttons ----------

const orb = document.getElementById('orb');
const stateLabel = document.getElementById('state-label');
const stateHint = document.getElementById('state-hint');
const callAlert = document.getElementById('call-alert');
const startButton = document.getElementById('start-call');
const endButton = document.getElementById('end-call');

// Runs every time the call state changes. The ONLY place that updates the
// call card, so the orb, label and buttons can never get out of sync.
// Restarts the little fade-in on the label/hint each time the text changes.
function animateText(element, text) {
  element.textContent = text;
  element.classList.remove('is-changing');
  void element.offsetWidth; // forces the browser to notice the removal, so the animation can replay
  element.classList.add('is-changing');
}

function renderCallState(state, info) {
  orb.dataset.state = state; // app.css picks colour + animation from this
  animateText(stateLabel, info.label);
  animateText(stateHint, info.hint);

  const inCall = isActiveState(state);
  startButton.disabled = inCall;
  endButton.disabled = !inCall;
  startButton.textContent = state === 'ended' ? 'Start new call' : 'Start call';
}

const call = createCallStateMachine((state, info) => {
  renderCallState(state, info);
  // Summarise whenever the call ends: whether the user pressed End call
  // or Aria ended it herself.
  if (state === 'ended') {
    activeCall = null;
    finishCall();
  }
});

let activeCall = null;    // the running call, so End call can stop it
let callStartedAt = null; // for call_duration_seconds
let toolEvents = [];      // what the order tools really returned this call (sent with the summary)

// One set of tools for the whole page visit, so a cancellation is
// remembered across calls until the page is refreshed (DECISIONS D-15).
const tools = createClientTools();

function showCallError(message) {
  callAlert.textContent = message;
  callAlert.hidden = false;
}

// Makes the orb move with the voice. While Aria speaks it follows her
// volume; otherwise it follows the user's mic. Values are smoothed so the
// orb glides instead of jittering. Sets the CSS variable --level (0–1).
let smoothedLevel = 0;
function updateOrbLevel(inputVolume, outputVolume) {
  const target = call.state === 'speaking' ? outputVolume : inputVolume * 0.6;
  smoothedLevel += (Math.min(1, target * 1.6) - smoothedLevel) * 0.25; // ease towards the target
  orb.style.setProperty('--level', smoothedLevel.toFixed(3));
}

startButton.addEventListener('click', () => {
  callAlert.hidden = true;
  transcript.clear();  // a new call starts with a clean slate
  summaryView.hide();
  callStartedAt = Date.now();
  toolEvents = [];

  activeCall = startVoiceSession({
    getConnection: getSignedConnection,
    userName: firstName,
    machine: call,
    transcript,
    tools,
    onToolResult: (name, result) => {
      // Remember the verified outcome so the summary can't contradict it
      // (e.g. a real cancellation must never be summarised as "unresolved").
      toolEvents.push({
        tool: name,
        orderId: result.order_id ?? result.heard ?? null,
        success: result.success === true,
        found: result.found === true,
        status: result.status ?? null,
        reason: result.reason ?? null,
      });
      // Show "Cancelled" on the Test Orders card straight away.
      if (name === 'cancel_order' && result.success) renderTestOrders();
    },
    onError: showCallError,
    onLevels: updateOrbLevel,
  });
  // Start is now disabled, so focus must go somewhere. NOT to End call:
  // pressing Space to scroll would then "click" End call and drop the call
  // (that was a real bug). The call card is a safe, non-clickable target.
  document.getElementById('call-card').focus({ preventScroll: true });
});

endButton.addEventListener('click', async () => {
  const ending = activeCall;
  activeCall = null;
  await ending?.stop();
  startButton.focus(); // after stop(), so the button is enabled again and can take focus
});

renderCallState(call.state, CALL_STATES[call.state]);

// ---------- After the call: summary + email ----------

async function finishCall() {
  const messages = transcript.getMessages();
  if (messages.length === 0) return; // nothing was said, nothing to summarise

  const durationSeconds = Math.round((Date.now() - callStartedAt) / 1000);
  summaryView.showLoading();

  try {
    // Only role + text are sent. The server takes the email and name from
    // the verified token, never from this body.
    const { summary, email } = await callApi('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(({ role, text }) => ({ role, text })),
        durationSeconds,
        toolEvents,
      }),
    });
    summaryView.showSummary(summary);
    summaryView.showEmailStatus(email); // shown separately: a failed email never hides the summary
  } catch (error) {
    console.error('[summary]', error);
    summaryView.showError("Couldn't generate a summary. Your transcript is still shown above.");
  }
}

// ---------- Test Orders panel ----------

// What to try saying for each order: each one hits a different policy trap.
const TRY_SAYING = {
  'ORD-101': 'Can I cancel ORD-101?',
  'ORD-102': 'I opened ORD-102, can I return it?',
  'ORD-103': 'Please cancel ORD-103.',
};

// Which pill colour each status gets (classes defined in app.css).
const STATUS_CLASS = {
  'Out for Delivery': 'status-transit',
  Shipped: 'status-transit',
  Delivered: 'status-delivered',
  Processing: 'status-processing',
  Cancelled: 'status-cancelled',
};

const orderList = document.getElementById('order-list');
const copyStatus = document.getElementById('copy-status');

// 699 → "₹699", 2500 → "₹2,500" (Indian number formatting).
function formatInr(value) {
  return `₹${value.toLocaleString('en-IN')}`;
}

// Small helper: create an element with a class and text.
// We use textContent (not innerHTML) so data can never inject HTML.
function el(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function createOrderCard(order) {
  const button = el('button', 'order-card');
  button.type = 'button';
  button.dataset.orderId = order.orderId;

  const top = el('span', 'order-top');
  top.append(
    el('span', 'order-id', order.orderId),
    el('span', `status-pill ${STATUS_CLASS[order.status] ?? 'status-cancelled'}`, order.status),
    el('span', 'order-copy', 'Copy ID'),
  );

  button.append(
    top,
    el('span', 'order-meta', `${order.customerName} · ${order.product} · ${formatInr(order.valueInr)}`),
    el('span', 'order-try', `Try: “${TRY_SAYING[order.orderId]}”`),
  );

  const item = document.createElement('li');
  item.append(button);
  return item;
}

// Builds the cards from the SAME data the voice tool uses, so the panel can
// never disagree with what Aria says. Exported so it can be re-run after a
// cancellation (the pill will then show "Cancelled").
export function renderTestOrders() {
  orderList.replaceChildren(...orderStore.listOrders().map(createOrderCard));
}

async function copyOrderId(button) {
  const orderId = button.dataset.orderId;
  const label = button.querySelector('.order-copy');

  try {
    await navigator.clipboard.writeText(orderId);
    label.textContent = 'Copied ✓';
    copyStatus.textContent = `${orderId} copied`;
  } catch {
    // Clipboard can be blocked (e.g. non-HTTPS pages or browser settings).
    label.textContent = 'Copy failed';
  }

  setTimeout(() => {
    label.textContent = 'Copy ID';
  }, 1500);
}

// One listener on the list instead of one per card ("event delegation").
// It still works after renderTestOrders() replaces the cards.
orderList.addEventListener('click', (event) => {
  const button = event.target.closest('.order-card');
  if (button) copyOrderId(button);
});

renderTestOrders();

// On phones, start with Test Orders collapsed so the call card is visible first.
if (window.matchMedia('(max-width: 899px)').matches) {
  document.getElementById('test-orders').open = false;
}
