import test from 'node:test';
import assert from 'node:assert/strict';
import { makePatternBanks } from '../src/audio/patterns.js';
import { DEFAULT_VELOCITY, velocitiesFromBanks, normalizeVelocities, sanitizeChain, chooseCaptureStep } from '../src/audio/performance.js';

test('migrates old boolean projects to reliable 4x16x16 velocity layers', () => {
  const banks = makePatternBanks();
  const levels = normalizeVelocities(null, banks);
  assert.equal(levels.length, 4);
  assert.equal(levels[0][0][0], DEFAULT_VELOCITY);
  assert.equal(levels[0][0][1], 0);
  assert.equal(levels[1][0][0], 0);
});
test('preserves valid MIDI velocity and rejects corrupted values', () => {
  const banks = makePatternBanks(), input = velocitiesFromBanks(banks);
  input[0][0][0] = .42;
  input[0][0][4] = Infinity;
  assert.equal(normalizeVelocities(input, banks)[0][0][0], .42);
  assert.equal(normalizeVelocities(input, banks)[0][0][4], DEFAULT_VELOCITY);
});
test('sanitizes imported arrangements', () => {
  assert.deepEqual(sanitizeChain([0, 3, 2, 99, -1, 'A']), [0, 3, 2]);
  assert.deepEqual(sanitizeChain([]), [0]);
  assert.equal(sanitizeChain(Array(22).fill(2)).length, 16);
});
test('quantization chooses nearest 16th, 8th and beat including rollover', () => {
  const events = Array.from({length: 24}, (_, index) => ({
    step: index % 16, bank: index < 16 ? 0 : 2, time: 10 + index * 0.125
  }));
  assert.deepEqual(chooseCaptureStep(events, 10.38, '1/16'), {bank:0,step:3,time:10.375});
  assert.deepEqual(chooseCaptureStep(events, 10.38, '1/8'), {bank:0,step:4,time:10.5});
  assert.deepEqual(chooseCaptureStep(events, 11.98, '1/4'), {bank:2,step:0,time:12});
});
test('quantization never records without a valid timeline', () => {
  assert.equal(chooseCaptureStep([], 0), null);
  assert.equal(chooseCaptureStep([{step:1,bank:0,time:0}], 0, '1/4'), null);
});
