// summarySchema.js — the ONE place that defines the summary's allowed values
// and their human-readable labels.
//
// Used by the browser (summaryView.js) AND the server (server/gemini.js,
// server/emailTemplate.js). It uses no browser or Node features, so both can
// import it. One source means the UI, the email and the validator can never
// disagree about what "DECLINED_PER_POLICY" means.
// Schema: docs/ARCHITECTURE.md §7.

export const INTENT_LABELS = {
  ORDER_TRACKING: 'Order tracking',
  CANCELLATION: 'Cancellation',
  RETURN_REFUND: 'Return or refund',
  DAMAGED_PRODUCT: 'Damaged product',
  SHIPPING_INFO: 'Shipping info',
  COD_PAYMENT: 'Cash on delivery',
  PRODUCT_INFO: 'Product info',
  OUT_OF_SCOPE: 'Out of scope',
  OTHER: 'Other',
};

export const RESOLUTION_LABELS = {
  RESOLVED: 'Resolved',
  DECLINED_PER_POLICY: 'Declined per policy',
  UNRESOLVED: 'Unresolved',
  NEEDS_HUMAN_FOLLOWUP: 'Needs follow-up',
};

export const SENTIMENT_LABELS = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
};

// The allowed codes are simply the keys of the label maps.
export const INTENTS = Object.keys(INTENT_LABELS);
export const RESOLUTIONS = Object.keys(RESOLUTION_LABELS);
export const SENTIMENTS = Object.keys(SENTIMENT_LABELS);

// 85 → "1 min 25 s"
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
}
