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

test('a crash preserves disk and WAL, and restart replays each version before serving reads', () => {
  const engine = exampleEngine();
  Array.from(engine.write('cedar', 'teal'));
  const wal = [...engine.log];
  const tables = [...engine.tables];
  const history = [...engine.history];
  Array.from(engine.crash());
  assert.equal(engine.memory.size, 0);
  assert.deepEqual(engine.tables, tables);
  assert.deepEqual(engine.log, wal);
  for (const op of ['write', 'read', 'flush', 'compact']) {
    assert.throws(() => engine[op]('cedar', 'invalid').next(), /offline/);
  }
  const restart = engine.restart();
  restart.next();
  for (const record of wal) {
    assert.equal(restart.next().value.record, record);
    assert.equal(engine.memory.get(record.key), record);
    assert.throws(() => engine.read('cedar').next(), /offline/);
  }
  Array.from(restart);
  assert.match([...engine.read('cedar')].at(-1).text, /teal.*memtable/);
  assert.deepEqual(engine.history, history);
  assert.deepEqual(engine.log, wal);
  assert.deepEqual(engine.tables, tables);
  Array.from(engine.flush());
  Array.from(engine.crash());
  assert.equal([...engine.restart()].filter(step => step.record).length, 0);
  assert.match([...engine.read('cedar')].at(-1).text, /teal.*run-002/);
});

test('read trace reports only sources actually probed, with the stable winning version', () => {
  const engine = exampleEngine();
  const probes = key => [...engine.read(key)]
    .filter(step => step.source && step.bloom !== 'negative')
    .map(step => [step.source, step.found?.seq ?? null]);
  assert.deepEqual(probes('cedar'), [['RAM',3]]);
  Array.from(engine.flush());
  assert.deepEqual(probes('cedar'), [['RAM',null],['run-002.sst',3]]);
  assert.deepEqual(probes('juniper'), [['RAM',null]]);
  assert.equal([...engine.read('juniper')].at(-1).exhausted,true);
});

test('sandbox chains maintenance at its byte and file limits and preserves current versions', () => {
  const engine = new StorageEngine();
  const run = (op, key, value) => [...engine.runSandbox(op, key, value)];
  for (let i = 0; i < 3; i++) {
    run('write', 'k', 'old' + i);
    assert.equal(run('flush').some(step => step.automatic), false);
  }
  run('write', 'k', 'x'.repeat(30));
  assert.equal(engine.memtableBytes, 31);
  const steps = run('write', 'k', '界'.repeat(10) + '!');
  assert.deepEqual(steps.filter(s => s.automatic).map(s => s.phase),
    ['freeze','install','retire','compare','install']);
  assert.equal(steps.filter(s => s.reason).length, 2);
  assert.equal(engine.tables.length, 1);
  assert.equal(engine.memtableBytes, 0);
  assert.equal(engine.log.length, 0);
  assert.equal(run('read','k').at(-1).found.value, '界'.repeat(10) + '!');
});

test('identical flushes select different files by size and by level overlap', () => {
  for (const policy of ['tiered','leveled']) {
    const engine = new StorageEngine(policy);
    for (const key of ['cedar','cedar','cedar','yew']) {
      [...engine.runSandbox('write',key,String(engine.seq))];
      [...engine.runSandbox('flush')];
    }
    assert.equal(engine.lastCompaction.inputs.length,policy === 'tiered' ? 4 : 3);
    assert.deepEqual(engine.lastCompaction.untouched.map(t=>t.name),policy === 'tiered' ? [] : ['run-004.sst']);
    assert.equal(engine.lastCompaction.output.level,policy === 'tiered' ? 0 : 1);
    assert.equal([...engine.read('cedar')].at(-1).found.value,'2');
  }
});

test('a mixed-age size-tiered output cannot hide a newer write in an untouched file', () => {
  const engine = new StorageEngine('tiered');
  for (const [key,value] of [['k','old'],['k','x'.repeat(40)],['a','1'],['b','2'],['c','3']]) {
    [...engine.runSandbox('write',key,value)];
    [...engine.runSandbox('flush')];
  }
  assert.deepEqual(engine.lastCompaction.untouched.map(t=>t.name),['run-002.sst']);
  const probes=[...engine.read('k')];
  assert.equal(probes.at(-2).candidate?.value,'old');
  assert.equal(probes.at(-1).found.value,'x'.repeat(40));
});

test('conditional mutations probe the visible key and persist delete markers across recovery and merges', () => {
  for (const policy of ['tiered','leveled']) {
    const engine = new StorageEngine(policy);
    const run = (op,value) => [...engine.runSandbox(op,'juniper',value)];
    run('update','missing');
    run('delete');
    assert.equal(engine.seq,0);
    run('create','moss');
    const duplicate = run('create','duplicate');
    assert.match(duplicate.at(-1).text,/already exists/);
    assert.equal(engine.log.length,1);
    run('flush');
    run('update','pine');
    assert.equal(run('read').at(-1).found.value,'pine');
    run('flush');
    run('delete');
    const marker = engine.log.at(-1);
    assert.equal(marker.operation,'delete');
    assert.equal(engine.memtableBytes,7);
    run('crash');
    run('restart');
    assert.equal(run('read').at(-1).found,marker);
    run('flush');
    run('compact');
    assert.equal(run('read').at(-1).found,marker);
    assert.match(run('read').at(-1).text,/Not found/);
    run('update','absent');
    assert.equal(engine.seq,3);
    run('create','Tombstone');
    assert.equal(run('read').at(-1).found.value,'Tombstone');
    assert.equal(engine.seq,4);
  }
});

test('a negative filter bypasses file rows and a false positive still checks the key', () => {
  const engine = new StorageEngine();
  [...engine.write('ash', 'silver')];
  [...engine.flush()];
  const table = engine.tables[0];
  const rows = table.rows;
  Object.defineProperty(table, 'rows', {get() { throw new Error('Read skipped rows'); }, configurable:true});
  assert.equal([...engine.read('juniper')].find(step => step.source === table.name).bloom, 'negative');
  Object.defineProperty(table, 'rows', {value:rows});
  // Rowan and ash set the same two bits in this small filter.
  const miss = [...engine.read('rowan')];
  assert.equal(miss.find(step => step.source === table.name).bloom, 'maybe');
  assert.equal(miss.at(-1).exhausted, true);
  assert.equal([...engine.read('ash')].at(-1).found.value, 'silver');
});
