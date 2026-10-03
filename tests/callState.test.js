// Checks for the call state machine. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCallStateMachine, isActiveState, CALL_STATES } from '../src/js/voice.js';

// Silence the console.warn for ignored changes during tests.
console.warn = () => {};

describe('call state machine', () => {
  it('starts idle', () => {
    assert.equal(createCallStateMachine().state, 'idle');
  });

  it('follows a normal call: idle → connecting → speaking → listening → thinking → speaking → ended', () => {
    const seen = [];
    const m = createCallStateMachine((state) => seen.push(state));
    for (const s of ['connecting', 'speaking', 'listening', 'thinking', 'speaking', 'ended']) {
      assert.equal(m.setState(s), true, `should allow → ${s}`);
    }
    assert.deepEqual(seen, ['connecting', 'speaking', 'listening', 'thinking', 'speaking', 'ended']);
  });

  it('ignores a late "listening" event after the call ended', () => {
    const m = createCallStateMachine();
    m.setState('connecting');
    m.setState('ended');
    assert.equal(m.setState('listening'), false);
    assert.equal(m.state, 'ended');
  });

  it('cannot jump from idle straight to speaking', () => {
    const m = createCallStateMachine();
    assert.equal(m.setState('speaking'), false);
    assert.equal(m.state, 'idle');
  });

  it('failed connection can go back to idle', () => {
    const m = createCallStateMachine();
    m.setState('connecting');
    assert.equal(m.setState('idle'), true);
  });

  it('a new call can start after one ended', () => {
    const m = createCallStateMachine();
    m.setState('connecting');
    m.setState('ended');
    assert.equal(m.setState('connecting'), true);
  });

  it('setting the same state twice does not call onChange again', () => {
    let calls = 0;
    const m = createCallStateMachine(() => calls++);
    m.setState('connecting');
    m.setState('connecting');
    assert.equal(calls, 1);
  });

  it('passes the label/hint to onChange', () => {
    let info;
    const m = createCallStateMachine((_, i) => { info = i; });
    m.setState('connecting');
    assert.equal(info.label, 'Connecting');
  });

  it('isActiveState: only in-call states', () => {
    assert.deepEqual(
      Object.keys(CALL_STATES).filter(isActiveState),
      ['connecting', 'listening', 'thinking', 'speaking'],
    );
  });
});
