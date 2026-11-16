import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleEngine, StorageEngine } from './engine.js';

test('reads pick newest versions through writes, flushes and compaction', () => {
  const engine = exampleEngine();
  const result = key => [...engine.read(key)].at(-1).text;
  assert.match(result('cedar'), /jade.*memtable/);
  assert.match(result('birch'), /gold.*run-001/);
  const write = engine.write('cedar', 'teal');
  write.next();
  write.next();
  assert.equal(engine.log.at(-1).value, 'teal');
  assert.equal(engine.memory.get('cedar').value, 'jade');
  write.next();
  assert.match(result('cedar'), /teal/);
  Array.from(engine.flush());
  assert.equal(engine.memory.size + engine.log.length, 0);
  assert.match(result('cedar'), /teal.*run-002/);
  Array.from(engine.compact());
  assert.deepEqual(engine.tables[0].rows.map(r => r.key), ['birch', 'cedar', 'elm']);
  assert.match(result('cedar'), /teal.*run-003/);
  assert.match(result('missing'), /not found/);
});
test('empty maintenance leaves the engine intact', () => {
  const engine = new StorageEngine();
  Array.from(engine.flush());
  Array.from(engine.compact());
  assert.equal(engine.tables.length, 0);
});

test('merge decisions retain disk provenance, exclude RAM, and match installed rows', () => {
  const engine = new StorageEngine();
  for (const value of ['first', 'second', 'third']) {
    Array.from(engine.write('k', value));
    Array.from(engine.write(value, 'unique'));
    Array.from(engine.flush());
  }
  Array.from(engine.write('k', 'RAM only'));
  const inputs = [...engine.tables];
  const steps = Array.from(engine.compact());
  const { groups, output } = engine.lastCompaction;
  assert.deepEqual(steps[0].plan.inputs, inputs);
  assert.deepEqual(groups.find(g => g.key === 'k').versions.map(v => v.value), ['third','second','first']);
  assert.deepEqual(output.rows, groups.map(g => g.versions[0]));
  assert.equal(engine.tables[0], output);
  Array.from(engine.compact());
  Array.from(engine.flush());
  assert.deepEqual(engine.lastCompaction.inputs, inputs);
  assert.equal(engine.lastCompaction.output, output);
});

test('flush installs one sorted version per key before retiring the covered WAL', () => {
  const engine = new StorageEngine();
  for (const [key,value] of [['z','old'],['a','one'],['z','new']]) Array.from(engine.write(key,value));
  const flush = engine.flush();
  const frozen = flush.next().value;
  assert.equal(frozen.phase, 'freeze');
  assert.deepEqual(frozen.flush.log.map(r => r.seq), [1,2,3]);
  assert.equal(engine.tables.length, 0);
  const installed = flush.next().value;
  assert.equal(installed.phase, 'install');
  assert.equal(installed.flush.output, engine.tables[0]);
  assert.deepEqual(installed.flush.output.rows.map(r => [r.key,r.seq]), [['a',2],['z',3]]);
  assert.equal(engine.log.length, 3);
  assert.equal(flush.next().value.phase, 'retire');
  assert.equal(engine.log.length, 0);
  Array.from(engine.flush());
  Array.from(engine.write('another','later'));
  assert.equal(engine.lastFlush, frozen.flush);
  assert.deepEqual(engine.lastFlush.log.map(r => r.seq), [1,2,3]);
});
