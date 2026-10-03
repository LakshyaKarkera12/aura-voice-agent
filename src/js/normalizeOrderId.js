// normalizeOrderId.js — turn whatever speech-to-text heard into "ORD-101".
//
// Why: voice transcription rarely gives a clean "ORD-101". It gives
// "ORD 101", "ord101", "order one zero one", "O R D one oh one" or just "101".
// This is the most common real failure in voice order lookup (DECISIONS.md D-05).
//
// Approach: pull out every digit (written as numbers OR spoken as words),
// ignore filler words like "order", "number", "is", then rebuild "ORD-<digits>".

const DIGIT_WORDS = {
  zero: '0', oh: '0', o: '0', // people say "one oh one"; spelled "O" counts as zero
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
};

// "one double zero" → "100"
const REPEAT_WORDS = { double: 2, triple: 3 };

// Longer numbers are probably a phone number or pincode, not an order ID.
const MAX_DIGITS = 6;

// Returns { ok: true, orderId: 'ORD-101' } or { ok: false }.
export function normalizeOrderId(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { ok: false };
  }

  const text = String(raw)
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2') // "ord101" → "ord 101"
    .replace(/(\d)([a-z])/g, '$1 $2') // "101a"   → "101 a"
    .replace(/[^a-z0-9]+/g, ' ')      // dashes, dots, # → spaces
    .trim();

  let digits = '';
  let repeat = 1;

  for (const token of text.split(' ')) {
    if (REPEAT_WORDS[token]) {
      repeat = REPEAT_WORDS[token];
      continue;
    }

    let digit = null;
    if (/^\d+$/.test(token)) digit = token;
    else if (token in DIGIT_WORDS) digit = DIGIT_WORDS[token];

    if (digit === null) {
      // Filler word ("order", "ord", "number", "my"...): skip it.
      repeat = 1;
      continue;
    }

    digits += digit.repeat(repeat);
    repeat = 1;
  }

  // Leading zeros carry no meaning ("ORD-0101" = "ORD-101"). This also drops
  // the "O" of a spelled-out "O R D", which we turned into a 0 above.
  digits = digits.replace(/^0+/, '');

  if (digits.length === 0 || digits.length > MAX_DIGITS) {
    return { ok: false };
  }
  return { ok: true, orderId: `ORD-${digits}` };
}
