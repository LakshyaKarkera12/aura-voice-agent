// policies.js — Aura Skincare's brand rules, written as code.
//
// Why in code and not only in the prompt? An LLM can be argued into
// "just this once" or miscount 14 vs 7 days. Code can't (DECISIONS.md D-04).
// The tools return these results to Aria; she only puts them into words.
//
// Every function returns a short `note` too: a plain-English reason
// Aria can use when explaining the decision to the customer.

export const POLICY = {
  FREE_SHIPPING_MIN_INR: 499, // ₹499 and above ships free (D-13)
  SHIPPING_FEE_INR: 50,
  RETURN_WINDOW_DAYS: 7,      // day 7 still counts (D-14)
  DAMAGE_WINDOW_HOURS: 48,
  COD_MAX_INR: 2500,          // cash on delivery allowed up to and including ₹2,500
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// "1 day" / "14 days"
function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ---------- Shipping & payment (general questions) ----------

export function shippingFee(valueInr) {
  return valueInr >= POLICY.FREE_SHIPPING_MIN_INR ? 0 : POLICY.SHIPPING_FEE_INR;
}

export function codAllowed(valueInr) {
  return valueInr <= POLICY.COD_MAX_INR;
}

// ---------- Order-specific rules ----------

// Cancellation: only while the order is still Processing.
export function canCancel(order) {
  switch (order.status) {
    case 'Processing':
      return { allowed: true, note: 'Order is still Processing, so it can be cancelled.' };
    case 'Shipped':
    case 'Out for Delivery':
      return {
        allowed: false,
        note: `Order is ${order.status}, so it can't be cancelled. The customer may refuse delivery at the doorstep.`,
      };
    case 'Delivered':
      return {
        allowed: false,
        note: "Order is already delivered, so it can't be cancelled. Check return eligibility instead.",
      };
    case 'Cancelled':
      return { allowed: false, note: 'Order is already cancelled.' };
    default:
      // Unknown status: refuse safely rather than guess.
      return { allowed: false, note: `Unknown status "${order.status}". Don't promise a cancellation.` };
  }
}

// Returns: within 7 days of delivery. The "unopened, unused" condition can't
// be checked by code (we don't know), so the note tells Aria to confirm it.
export function isReturnEligible(order, now = new Date()) {
  if (order.status !== 'Delivered' || !order.deliveredAt) {
    return { eligible: false, note: 'Returns apply only after delivery.' };
  }

  // Whole days since delivery, rounded down (13.9 days → 13).
  const days = Math.floor((now - order.deliveredAt) / DAY_MS);

  if (days <= POLICY.RETURN_WINDOW_DAYS) {
    return {
      eligible: true,
      note: `Delivered ${plural(days, 'day')} ago, within the 7-day return window. Only unopened, unused products in original packaging can be returned, so confirm this with the customer.`,
    };
  }
  return {
    eligible: false,
    note: `Delivered ${plural(days, 'day')} ago, outside the 7-day return window.`,
  };
}

// Damaged / defective: must be reported within 48 hours of delivery, with photos.
export function isDamageClaimEligible(order, now = new Date()) {
  if (order.status !== 'Delivered' || !order.deliveredAt) {
    return { eligible: false, note: 'Damage claims apply only after delivery.' };
  }

  const hours = Math.floor((now - order.deliveredAt) / HOUR_MS);

  if (hours <= POLICY.DAMAGE_WINDOW_HOURS) {
    return {
      eligible: true,
      note: `Delivered ${plural(hours, 'hour')} ago, within the 48-hour damage window. Ask the customer to share photos for a replacement.`,
    };
  }
  return {
    eligible: false,
    note: `Delivered more than 48 hours ago, so the damage reporting window has passed.`,
  };
}
