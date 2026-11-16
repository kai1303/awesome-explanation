import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertionTrace } from './model.js';

test('the write follows the first empty probe and preserves the table for rewind', () => {
  const frames = insertionTrace();
  assert.deepEqual(frames.filter(f => f.phase === 'probe').map(f => [f.index, f.resident]), [[1,5],[2,6],[3,null]]);
  assert.deepEqual(frames.at(-2).slots, [null,5,6,null]);
  assert.deepEqual(frames.at(-1).slots, [null,5,6,17]);
});

test('filling slot 3 extends the same probe sequence across the array boundary', () => {
  const frames = insertionTrace(true);
  assert.deepEqual(frames.filter(f => f.phase === 'probe').map(f => f.index), [1,2,3,0]);
  assert.equal(frames.at(-1).probes, 4);
  assert.deepEqual(frames.at(-1).slots, [17,5,6,7]);
});
