// tools.js — the "client tools" Aria can call during a call.
//
// How it works: when the LLM decides it needs order data, ElevenLabs sends a
// tool call to the browser. The SDK runs the function with the same name here
// and sends the return value back to the LLM, which speaks the result.
//
// Function names MUST exactly match the tool names in the ElevenLabs
// dashboard: get_order_details, cancel_order (see docs/SYSTEM_PROMPT.md).
//
// These functions return plain objects so they're easy to test.
// voice.js will convert them to text when handing them to the SDK.

import { normalizeOrderId } from './normalizeOrderId.js';
import { orderStore } from './orders.js';
import { canCancel, isReturnEligible, isDamageClaimEligible } from './policies.js';

// Shared step for both tools: clean up the ID, then find the order.
// Returns { order } on success, or { error } with an answer ready for the LLM.
// The error answers deliberately contain NO order details, so Aria has
// nothing to invent from (guardrail layer 3 in ARCHITECTURE.md).
function findOrder(rawOrderId, store) {
  const normalized = normalizeOrderId(rawOrderId);

  if (!normalized.ok) {
    return {
      error: {
        reason: 'INVALID_FORMAT',
        heard: String(rawOrderId ?? ''),
        message_for_agent:
          "Couldn't make out an order ID. Ask the customer to say it again, for example 'O-R-D one-oh-one'. Do not invent details.",
      },
    };
  }

  const order = store.getOrder(normalized.orderId);
  if (!order) {
    return {
      error: {
        reason: 'NOT_FOUND',
        heard: normalized.orderId,
        message_for_agent:
          'No order with this ID. Ask the customer to repeat or verify it. Do not invent details.',
      },
    };
  }

  return { order };
}

// `store` and `getNow` are parameters so tests can pass a fresh store and a
// fixed time. The app just calls createClientTools() and gets the defaults.
export function createClientTools(store = orderStore, getNow = () => new Date()) {
  return {
    // Read-only: look up an order and report what the policies allow.
    get_order_details({ order_id } = {}) {
      const { order, error } = findOrder(order_id, store);
      if (error) return { found: false, ...error };

      const now = getNow();
      const cancel = canCancel(order);
      const ret = isReturnEligible(order, now);
      const damage = isDamageClaimEligible(order, now);

      // snake_case keys: this object is read by the LLM, matching the
      // contract in docs/ARCHITECTURE.md.
      return {
        found: true,
        order_id: order.orderId,
        customer_name: order.customerName,
        product: order.product,
        value_inr: order.valueInr,
        status: order.status,
        courier: order.courier,
        tracking_id: order.trackingId,
        status_note: order.statusNote,
        can_cancel: cancel.allowed,
        cancel_note: cancel.note,
        return_eligible: ret.eligible,
        return_note: ret.note,
        damage_claim_eligible: damage.eligible,
        damage_claim_note: damage.note,
      };
    },

    // Action: cancel an order. We check canCancel() AGAIN here and never trust
    // the LLM's judgement, so Aria can't be talked into cancelling a shipped order.
    cancel_order({ order_id } = {}) {
      const { order, error } = findOrder(order_id, store);
      if (error) return { success: false, ...error };

      if (order.status === 'Cancelled') {
        return {
          success: false,
          reason: 'ALREADY_CANCELLED',
          order_id: order.orderId,
          message_for_agent: 'This order was already cancelled earlier in the call.',
        };
      }

      const cancel = canCancel(order);
      if (!cancel.allowed) {
        return {
          success: false,
          reason: 'NOT_CANCELLABLE',
          order_id: order.orderId,
          message_for_agent: cancel.note,
        };
      }

      store.markCancelled(order.orderId);
      return {
        success: true,
        order_id: order.orderId,
        status: 'Cancelled',
        message_for_agent:
          'Order cancelled. Any prepaid amount is refunded to the original payment method.',
      };
    },
  };
}
