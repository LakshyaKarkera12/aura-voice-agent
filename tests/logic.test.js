// Automatic checks for the order/policy logic.
// Run with:  npm test
// Uses Node's built-in test runner (node:test), so nothing extra to install.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOrderId } from '../src/js/normalizeOrderId.js';
import { createOrderStore } from '../src/js/orders.js';
import {
  shippingFee, codAllowed, canCancel, isReturnEligible, isDamageClaimEligible,
} from '../src/js/policies.js';
import { createClientTools } from '../src/js/tools.js';

// A fixed "now" so results never depend on when the tests are run.
const NOW = new Date('2026-10-02T10:00:00+05:30');
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Fresh store + tools for each test, so a cancellation in one test
// doesn't leak into another.
function freshTools() {
  const store = createOrderStore(NOW);
  return createClientTools(store, () => NOW);
}

describe('normalizeOrderId', () => {
  const shouldBecome101 = [
    'ORD-101', 'ord-101', 'ORD 101', 'ord101', 'order 101', '101', 101,
    'order one zero one', 'one oh one', 'O R D one oh one', 'O-R-D 1 0 1',
  ];

  for (const input of shouldBecome101) {
    it(`"${input}" → ORD-101`, () => {
      assert.deepEqual(normalizeOrderId(input), { ok: true, orderId: 'ORD-101' });
    });
  }

  it('"one double zero" → ORD-100', () => {
    assert.equal(normalizeOrderId('order number one double zero').orderId, 'ORD-100');
  });

  it('"ORD-999" stays ORD-999 (normalising is not the same as finding)', () => {
    assert.equal(normalizeOrderId('ORD-999').orderId, 'ORD-999');
  });

  for (const bad of ['', 'my order', 'hmm', '9876543210', null, undefined]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.equal(normalizeOrderId(bad).ok, false);
    });
  }
});

describe('policies: shipping & COD', () => {
  it('₹300 pays ₹50 shipping', () => assert.equal(shippingFee(300), 50));
  it('₹498 pays ₹50 shipping', () => assert.equal(shippingFee(498), 50));
  it('exactly ₹499 ships free (D-13)', () => assert.equal(shippingFee(499), 0));
  it('₹850 ships free', () => assert.equal(shippingFee(850), 0));

  it('COD allowed at ₹2,500', () => assert.equal(codAllowed(2500), true));
  it('COD not allowed at ₹3,000', () => assert.equal(codAllowed(3000), false));
});

describe('policies: returns & damage boundaries', () => {
  const deliveredDaysAgo = (d) => ({ status: 'Delivered', deliveredAt: new Date(NOW - d * DAY_MS) });
  const deliveredHoursAgo = (h) => ({ status: 'Delivered', deliveredAt: new Date(NOW - h * HOUR_MS) });

  it('day 7 is still returnable (D-14)', () => {
    assert.equal(isReturnEligible(deliveredDaysAgo(7), NOW).eligible, true);
  });
  it('day 8 is not returnable', () => {
    assert.equal(isReturnEligible(deliveredDaysAgo(8), NOW).eligible, false);
  });
  it('not delivered → no return', () => {
    assert.equal(isReturnEligible({ status: 'Processing', deliveredAt: null }, NOW).eligible, false);
  });

  it('48 hours → damage claim OK', () => {
    assert.equal(isDamageClaimEligible(deliveredHoursAgo(48), NOW).eligible, true);
  });
  it('49 hours → damage window passed', () => {
    assert.equal(isDamageClaimEligible(deliveredHoursAgo(49), NOW).eligible, false);
  });

  it('Shipped cannot be cancelled', () => {
    assert.equal(canCancel({ status: 'Shipped' }).allowed, false);
  });
  it('unknown status refuses safely', () => {
    assert.equal(canCancel({ status: 'Lost in space' }).allowed, false);
  });
});

describe('tool: get_order_details (the three traps)', () => {
  it('ORD-101: out for delivery, cannot cancel, refuse at doorstep', () => {
    const r = freshTools().get_order_details({ order_id: 'ORD-101' });
    assert.equal(r.found, true);
    assert.equal(r.customer_name, 'Priya Sharma');
    assert.equal(r.status, 'Out for Delivery');
    assert.equal(r.courier, 'BlueDart');
    assert.equal(r.can_cancel, false);
    assert.match(r.cancel_note, /refuse delivery/);
  });

  it('ORD-102: delivered 14 days ago, no return, no damage claim', () => {
    const r = freshTools().get_order_details({ order_id: 'ORD-102' });
    assert.equal(r.status, 'Delivered');
    assert.equal(r.return_eligible, false);
    assert.match(r.return_note, /14 days/);
    assert.equal(r.damage_claim_eligible, false);
  });

  it('ORD-103: processing, can cancel', () => {
    const r = freshTools().get_order_details({ order_id: 'ORD-103' });
    assert.equal(r.status, 'Processing');
    assert.equal(r.can_cancel, true);
  });

  it('spoken ID "order one oh three" finds ORD-103', () => {
    const r = freshTools().get_order_details({ order_id: 'order one oh three' });
    assert.equal(r.order_id, 'ORD-103');
  });

  it('ORD-999: not found, and no invented details', () => {
    const r = freshTools().get_order_details({ order_id: 'ORD-999' });
    assert.equal(r.found, false);
    assert.equal(r.reason, 'NOT_FOUND');
    assert.equal(r.status, undefined);
  });

  it('gibberish: INVALID_FORMAT', () => {
    const r = freshTools().get_order_details({ order_id: 'umm' });
    assert.equal(r.reason, 'INVALID_FORMAT');
  });

  it('missing order_id: INVALID_FORMAT, no crash', () => {
    const r = freshTools().get_order_details({});
    assert.equal(r.reason, 'INVALID_FORMAT');
  });
});

describe('tool: cancel_order', () => {
  it('ORD-101 refused even if the LLM tries (code re-checks policy)', () => {
    const r = freshTools().cancel_order({ order_id: 'ORD-101' });
    assert.equal(r.success, false);
    assert.equal(r.reason, 'NOT_CANCELLABLE');
  });

  it('ORD-102 refused (already delivered)', () => {
    const r = freshTools().cancel_order({ order_id: 'ORD-102' });
    assert.equal(r.reason, 'NOT_CANCELLABLE');
  });

  it('ORD-103 cancels, then lookup shows Cancelled, then cancelling again is refused', () => {
    const tools = freshTools();

    assert.equal(tools.cancel_order({ order_id: 'ORD-103' }).success, true);

    const after = tools.get_order_details({ order_id: 'ORD-103' });
    assert.equal(after.status, 'Cancelled');
    assert.equal(after.can_cancel, false);

    assert.equal(tools.cancel_order({ order_id: 'ORD-103' }).reason, 'ALREADY_CANCELLED');
  });

  it('ORD-999 not found', () => {
    assert.equal(freshTools().cancel_order({ order_id: 'ORD-999' }).reason, 'NOT_FOUND');
  });
});
