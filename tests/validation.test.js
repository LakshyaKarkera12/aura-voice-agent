// Checks for the sign up / log in form rules. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateSignup, validateLogin, authErrorMessage } from '../src/js/validation.js';

describe('authErrorMessage', () => {
  it('existing email → "log in instead"', () => {
    assert.match(authErrorMessage({ code: 'user_already_exists' }), /Log in instead/);
  });
  it('old-style "User already registered" message → same friendly text', () => {
    assert.match(authErrorMessage({ message: 'User already registered' }), /Log in instead/);
  });
  it('wrong password → clear message', () => {
    assert.match(authErrorMessage({ code: 'invalid_credentials' }), /don't match/);
  });
  it('network failure → internet message', () => {
    assert.match(authErrorMessage({ message: 'Failed to fetch', status: 0 }), /internet/);
  });
  it('unknown error → generic message, never raw text', () => {
    assert.equal(authErrorMessage({ code: 'weird', message: 'stack trace...' }), 'Something went wrong. Please try again.');
  });
});

const good = { fullName: 'Lakshya Karkera', email: 'lakshya@example.com', password: 'secret1' };

describe('validateSignup', () => {
  it('valid details → no errors', () => {
    assert.deepEqual(validateSignup(good), {});
  });

  it('empty name (or only spaces) → error', () => {
    assert.ok(validateSignup({ ...good, fullName: '   ' }).fullName);
  });

  it('name over 60 characters → error', () => {
    assert.ok(validateSignup({ ...good, fullName: 'a'.repeat(61) }).fullName);
  });

  for (const email of ['', 'lakshya', 'lakshya@', 'lakshya@example', 'la kshya@example.com']) {
    it(`bad email ${JSON.stringify(email)} → error`, () => {
      assert.ok(validateSignup({ ...good, email }).email);
    });
  }

  it('email with spaces around it is accepted (trimmed)', () => {
    assert.equal(validateSignup({ ...good, email: '  lakshya@example.com ' }).email, undefined);
  });

  it('5-character password → error', () => {
    assert.ok(validateSignup({ ...good, password: '12345' }).password);
  });

  it('6-character password → OK', () => {
    assert.equal(validateSignup({ ...good, password: '123456' }).password, undefined);
  });

  it('everything empty → three errors', () => {
    assert.deepEqual(Object.keys(validateSignup({})).sort(), ['email', 'fullName', 'password']);
  });
});

describe('validateLogin', () => {
  it('valid details → no errors', () => {
    assert.deepEqual(validateLogin({ email: good.email, password: 'x' }), {});
  });

  it('empty password → error (but no length rule on login)', () => {
    assert.ok(validateLogin({ email: good.email, password: '' }).password);
  });

  it('bad email → error', () => {
    assert.ok(validateLogin({ email: 'nope', password: 'x' }).email);
  });
});
