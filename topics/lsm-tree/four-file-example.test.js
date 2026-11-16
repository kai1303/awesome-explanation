import assert from 'node:assert/strict';
import test from 'node:test';
import {fourFileExample} from './four-file-example.js';

test('the same four flushes rewrite different files but preserve the same visible records', () => {
  const tiered = fourFileExample('tiered'), leveled = fourFileExample('leveled');
  assert.deepEqual(tiered.files, leveled.files);
  assert.deepEqual(tiered.files.map(f => f.bytes), [24,24,24,24]);
  for (const [example, count, level] of [[tiered,4,0], [leveled,2,1]]) {
    const {engine,files,plan} = example;
    assert.deepEqual(plan.inputs.map(f=>f.name).sort(), files.slice(0,count).map(f=>f.name));
    Array.from(engine.compact(plan));
    assert.equal(engine.lastCompaction.output.level, level);
    assert.ok(files.slice(count).every(f => engine.tables.includes(f)));
    assert.deepEqual(engine.tables.flatMap(f => f.rows).filter(r => r.key === 'cedar').map(r => r.value), ['jade']);
  }
  const rows = engine => engine.tables.flatMap(f => f.rows).sort((a,b) => a.seq-b.seq);
  assert.deepEqual(rows(tiered.engine), rows(leveled.engine));
});
