// summaryView.js — the "Call summary" card shown after a call.
//
// States: hidden → loading (shimmer) → summary shown as readable rows, or error.
// The email status is a SEPARATE line, so a failed email never hides the
// summary (CLAUDE.md rule 9).

import {
  INTENT_LABELS, RESOLUTION_LABELS, SENTIMENT_LABELS, formatDuration,
} from './summarySchema.js';

// Badge colour for each resolution (reuses the status pill classes from app.css).
const RESOLUTION_BADGE = {
  RESOLVED: 'status-delivered',
  DECLINED_PER_POLICY: 'status-processing',
  UNRESOLVED: 'status-cancelled',
  NEEDS_HUMAN_FOLLOWUP: 'status-transit',
};

export function createSummaryView() {
  const section = document.getElementById('summary-section');
  const loading = document.getElementById('summary-loading');
  const errorBox = document.getElementById('summary-error');
  const content = document.getElementById('summary-content');
  const fields = document.getElementById('summary-fields');
  const emailStatus = document.getElementById('email-status');

  // Adds one "label: value" row to the <dl>. `value` can be text or an element.
  function addRow(label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value;
    fields.append(dt, dd);
  }

  function badge(text, className) {
    const span = document.createElement('span');
    span.className = `status-pill ${className}`;
    span.textContent = text;
    return span;
  }

  function list(items) {
    const ul = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.append(li);
    }
    return ul;
  }

  // Shows exactly one of: loading, error, content.
  function showOnly(part) {
    section.hidden = false;
    loading.hidden = part !== 'loading';
    errorBox.hidden = part !== 'error';
    content.hidden = part !== 'content';
  }

  function setEmailStatus(kind, text) {
    emailStatus.hidden = false;
    emailStatus.dataset.kind = kind; // app.css colours it: sending / sent / failed
    emailStatus.textContent = text;
  }

  return {
    hide() {
      section.hidden = true;
      emailStatus.hidden = true;
    },

    showLoading() {
      showOnly('loading');
      setEmailStatus('sending', 'Preparing your summary and emailing it to you…');
      section.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },

    showError(message) {
      showOnly('error');
      errorBox.textContent = message;
      emailStatus.hidden = true; // no summary → nothing was emailed
    },

    showSummary(summary) {
      fields.replaceChildren();
      const resolution = RESOLUTION_LABELS[summary.resolution_status] ? summary.resolution_status : 'UNRESOLVED';

      addRow('Intent', INTENT_LABELS[summary.customer_intent] ?? summary.customer_intent);
      addRow('Order', summary.order_id ?? 'None mentioned');
      addRow('Resolution', badge(RESOLUTION_LABELS[resolution], RESOLUTION_BADGE[resolution]));
      if (summary.policy_applied) addRow('Policy applied', summary.policy_applied);
      addRow('Sentiment', SENTIMENT_LABELS[summary.customer_sentiment] ?? summary.customer_sentiment);
      addRow('Summary', summary.call_summary);
      if (summary.action_items?.length) addRow('Action items', list(summary.action_items));
      addRow('Call length', formatDuration(summary.call_duration_seconds));

      // The structured JSON isn't shown on the page (design decision, D-34),
      // but it's logged so evaluators can inspect it in DevTools → Console.
      console.info('[summary] JSON:', summary);
      showOnly('content');
    },

    // email = { sent: true|false, to: 'you@example.com' }
    showEmailStatus(email) {
      if (email?.sent) {
        setEmailStatus('sent', `Summary emailed to ${email.to}. Check your spam folder if you don't see it.`);
      } else {
        setEmailStatus('failed', "Couldn't send the email. Your summary is shown above.");
      }
    },
  };
}
