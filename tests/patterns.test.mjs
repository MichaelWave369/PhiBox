import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEmptyPattern, makeDemoPattern, makePatternBanks, midiToHz, isPattern, clamp } from '../src/audio/patterns.js';

test('patterns are 16 pads by 16 steps', () => {
  assert.equal(isPattern(makeEmptyPattern()), true);
  assert.equal(isPattern(makeDemoPattern()), true);
  assert.equal(isPattern([[]]), false);
});
test('pattern banks are independent', () => {
  const banks = makePatternBanks();
  banks[0][0][0] = false;
  assert.equal(banks[1][0][0], false);
  banks[1][0][0] = true;
  assert.equal(banks[2][0][0], false);
});
test('note conversion and parameter clamping', () => {
  assert.equal(midiToHz(69), 440);
  assert.equal(clamp(400, 40, 300), 300);
});
