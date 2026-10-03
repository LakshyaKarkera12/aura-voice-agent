// orders.js — the mock order "database".
//
// In a real company this would be an API call to an orders service.
// Here it's three hard-coded orders, each designed to test one policy trap
// (see docs/PLAN.md, "The three built-in traps").

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Dates are calculated relative to `now` instead of being fixed dates.
// Why: "delivered 14 days ago" must stay true whenever the evaluator tests,
// otherwise the policy traps would drift over time (docs/DECISIONS.md D-16).
function buildOrders(now) {
  const t = now.getTime();

  return [
    {
      // Trap: customer asks to cancel, but it's already out for delivery.
      orderId: 'ORD-101',
      customerName: 'Priya Sharma',
      product: 'Vitamin C Glow Serum',
      valueInr: 699,
      status: 'Out for Delivery',
      courier: 'BlueDart',
      trackingId: 'BD-982103',
      orderedAt: new Date(t - 3 * DAY_MS),
      deliveredAt: null,
      statusNote: 'Out for delivery, expected by 6 PM today',
    },
    {
      // Trap: customer asks to return, but delivery was 14 days ago (> 7).
      orderId: 'ORD-102',
      customerName: 'Rahul Verma',
      product: 'Aloe Vera Soothing Gel',
      valueInr: 499,
      status: 'Delivered',
      courier: 'Delhivery',
      trackingId: 'DL-441029',
      orderedAt: new Date(t - 18 * DAY_MS),
      deliveredAt: new Date(t - 14 * DAY_MS),
      statusNote: 'Delivered 14 days ago',
    },
    {
      // Happy path: still Processing, so cancelling is allowed.
      orderId: 'ORD-103',
      customerName: 'Ananya Patel',
      product: 'Green Tea Face Wash + Toner',
      valueInr: 850,
      status: 'Processing',
      courier: null,
      trackingId: null,
      orderedAt: new Date(t - 3 * HOUR_MS),
      deliveredAt: null,
      statusNote: 'Ordered 3 hours ago, not shipped yet',
    },
  ];
}

// Creates an order store: the orders plus a memory of which ones were
// cancelled during this page visit (docs/DECISIONS.md D-15).
// It's a function (not just a global list) so tests can create a fresh
// store with a fixed "now" and not affect each other.
export function createOrderStore(now = new Date()) {
  const orders = buildOrders(now);
  const cancelledIds = new Set();

  // Returns a COPY of the order (so callers can't accidentally change the
  // original), or null if the ID doesn't exist.
  function getOrder(orderId) {
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) return null;

    if (cancelledIds.has(orderId)) {
      return { ...order, status: 'Cancelled', statusNote: 'Cancelled during this call' };
    }
    return { ...order };
  }

  function markCancelled(orderId) {
    cancelledIds.add(orderId);
  }

  // Used later by the Test Orders panel.
  function listOrders() {
    return orders.map((o) => getOrder(o.orderId));
  }

  return { getOrder, markCancelled, listOrders };
}

// The one shared store the app uses. Refreshing the page creates a new one,
// which resets any mock cancellations.
export const orderStore = createOrderStore();
