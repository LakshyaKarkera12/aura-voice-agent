// server/emailTemplate.js — builds the summary email.
//
// Server-only. Returns { subject, html, text }: an HTML version plus a
// plain-text version (some email apps show only text; it also helps
// keep the email out of spam).
//
// Email apps ignore <style> blocks and CSS variables, so styles are written
// inline on each element, with colours copied from docs/UI_DESIGN.md.

import {
  INTENT_LABELS, RESOLUTION_LABELS, SENTIMENT_LABELS, formatDuration,
} from '../src/js/summarySchema.js';

// Colours (hex, because email can't use CSS variables).
const C = {
  cream: '#FAF6F0',
  surface: '#FFFFFF',
  forest: '#2F4A3A',
  muted: '#5F6E64',
  border: '#E7E1D8',
  gold: '#8A6D3B', // darker champagne gold: readable (4.9:1) on a white email background
};

// Badge colours per resolution: same pairs as the status pills on the page.
const BADGE = {
  RESOLVED: ['#2F6B3A', '#E3F0E4'],
  DECLINED_PER_POLICY: ['#7A5200', '#FBF0D6'],
  UNRESOLVED: ['#5A5A5A', '#ECEAE6'],
  NEEDS_HUMAN_FOLLOWUP: ['#2B5C8A', '#E4EEF7'],
};

// The summary contains text derived from what the caller said. Escaping
// turns < > & " ' into harmless codes so it can never inject HTML or links.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "Lakshya Karkera" → "Lakshya"
function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || 'there';
}

// Date in Indian format and time zone, e.g. "2 Oct 2026, 11:05 am".
function formatDate(date) {
  return date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

// The readable rows, shared by the HTML and text versions.
function summaryRows(summary) {
  const rows = [
    ['Intent', INTENT_LABELS[summary.customer_intent] ?? summary.customer_intent],
    ['Order', summary.order_id ?? 'None mentioned'],
    ['Resolution', RESOLUTION_LABELS[summary.resolution_status] ?? summary.resolution_status],
  ];
  if (summary.policy_applied) rows.push(['Policy applied', summary.policy_applied]);
  rows.push(
    ['Sentiment', SENTIMENT_LABELS[summary.customer_sentiment] ?? summary.customer_sentiment],
    ['Call length', formatDuration(summary.call_duration_seconds)],
  );
  return rows;
}

export function buildSummaryEmail({ name, summary, sentAt = new Date() }) {
  const first = firstName(name);
  const subject = summary.order_id
    ? `Your call with Aria about ${summary.order_id}`
    : 'Your call with Aria from Aura Skincare';

  const rows = summaryRows(summary);
  const [badgeFg, badgeBg] = BADGE[summary.resolution_status] ?? BADGE.UNRESOLVED;

  const rowHtml = rows.map(([label, value]) => {
    const cell = label === 'Resolution'
      ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${badgeBg};color:${badgeFg};font-size:13px;font-weight:600;">${escapeHtml(value)}</span>`
      : escapeHtml(value);
    return `<tr>
      <td style="padding:8px 0;width:130px;vertical-align:top;color:${C.muted};font-size:13px;font-weight:600;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;vertical-align:top;color:${C.forest};font-size:15px;">${cell}</td>
    </tr>`;
  }).join('');

  const actionsHtml = summary.action_items?.length
    ? `<p style="margin:20px 0 6px;color:${C.muted};font-size:13px;font-weight:600;">Next steps</p>
       <ul style="margin:0;padding-left:20px;color:${C.forest};font-size:15px;line-height:1.6;">
         ${summary.action_items.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
       </ul>`
    : '';

  // Tables for layout: the most reliable approach across email apps (incl. Outlook).
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${C.cream};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.surface};border:1px solid ${C.border};border-top:3px solid ${C.gold};border-radius:16px;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;color:${C.gold};font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Aura Skincare</p>
          <h1 style="margin:12px 0 4px;color:${C.forest};font-family:Georgia,serif;font-size:22px;font-weight:600;">Hi ${escapeHtml(first)}, here's a summary of your call with Aria</h1>
          <p style="margin:0;color:${C.muted};font-size:13px;">${escapeHtml(formatDate(sentAt))}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <p style="margin:0;color:${C.forest};font-size:15px;line-height:1.6;">${escapeHtml(summary.call_summary)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};">
            ${rowHtml}
          </table>
          ${actionsHtml}
        </td></tr>
        <tr><td style="padding:24px 28px 28px;">
          <p style="margin:0;padding-top:16px;border-top:1px solid ${C.border};color:${C.muted};font-size:12px;line-height:1.5;">
            This is an automated message from a demo project. Aura Skincare is a fictional brand.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${first}, here's a summary of your call with Aria (Aura Skincare).`,
    formatDate(sentAt),
    '',
    summary.call_summary,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(summary.action_items?.length ? ['', 'Next steps:', ...summary.action_items.map((a) => `- ${a}`)] : []),
    '',
    'This is an automated message from a demo project. Aura Skincare is a fictional brand.',
  ].join('\n');

  return { subject, html, text };
}
