import test from 'node:test';
import assert from 'node:assert/strict';
import { articleEngine, articleFrames } from './walkthrough.js';

test('the walkthrough preserves intermediate writes and winners when revisiting earlier frames', () => {
  const frames = articleFrames();
  const [received, logged, inMemory] = frames;
  assert.equal(received.engine.history.at(-1).key, 'cedar');
  assert.equal(received.engine.log.length, 2);
  assert.equal(logged.engine.log.at(-1).value, 'sage');
  assert.equal(logged.engine.memory.has('cedar'), false);
  assert.equal(inMemory.engine.memory.get('cedar').value, 'sage');
  const seed = articleEngine();
  const ramHit = frames.find(f => f.chapter === 'update' && f.lookup?.winner);
  assert.deepEqual(ramHit.engine.tables, seed.tables);
  assert.equal(ramHit.lookup.winner, ramHit.engine.memory.get('cedar'));
  const diskHit = frames.find(f => f.chapter === 'next-flush' && f.lookup?.winner);
  assert.deepEqual([...diskHit.lookup.checked], ['RAM','run-003.sst']);
  assert.equal(diskHit.lookup.winner, diskHit.engine.tables[0].rows.find(r => r.key === 'cedar'));
});

test('the two crash paths start from the same writes and recover jade from different sources', () => {
  const frames = articleFrames();
  const before = frames.filter(f => f.chapter === 'crash-before');
  const after = frames.filter(f => f.chapter === 'crash-after');
  assert.deepEqual(before[0].engine.history, after[0].engine.history);
  assert.deepEqual(before.flatMap(f => f.highlight.replay ? [f.highlight.replay.seq] : []), [6,7,8]);
  assert.equal(after.some(f => f.highlight.replay), false);
  assert.deepEqual([...before.at(-1).lookup.checked], ['RAM']);
  assert.deepEqual([...after.at(-1).lookup.checked], ['RAM','run-003.sst']);
  assert.equal(before.at(-1).lookup.winner.value, after.at(-1).lookup.winner.value);
});
