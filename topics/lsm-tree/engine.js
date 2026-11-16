import { buildBloom, keyMask } from './bloom.js';
import { newestVersion, payloadBytes, policies, sandboxLimits, selectInputs } from './compaction-planner.js';
export { sandboxLimits } from './compaction-planner.js';

export const conditionalWrites = ['create', 'update', 'delete'];
export const recordValue = record => record.operation === 'delete' ? 'Tombstone' : record.value;

// A single writer, one active log and memtable, newest-first immutable runs.
export class StorageEngine {
  constructor(policy = 'all') { this.policy = policy; }

  seq = 0;
  history = []; // Teaching trace, independent of the active WAL.
  file = 0;
  log = [];
  memory = new Map();
  tables = [];
  status = 'online';

  requireOnline() {
    if (this.status !== 'online') throw new Error('The engine is offline.');
  }

  get memtableBytes() {
    return payloadBytes(this.memory.values());
  }

  *runSandbox(op, key, value) {
    const before = this.seq;
    if (conditionalWrites.includes(op)) yield* this.mutate(op, key, value);
    else if (op === 'compact') yield* this.compact();
    else yield* this[op](key, value);
    const canFlush = (this.seq !== before || op === 'restart') && this.memtableBytes >= sandboxLimits.memtableBytes;
    if (canFlush) {
      const reason = `Automatic flush at ${this.memtableBytes} bytes (limit ${sandboxLimits.memtableBytes}).`;
      for (const step of this.flush()) {
        yield {...step, automatic:'flush', reason:step.phase === 'freeze' ? reason : null};
      }
    }
    if (op === 'flush' || canFlush || op === 'compact') {
      let plan;
      while ((plan = this.planCompaction(true))) {
        for (const step of this.compact(plan)) {
          yield {...step, automatic:'compact', reason:step.phase === 'compare' ? 'Automatic compaction. ' + plan.reason : null};
        }
      }
    }
  }

  *crash() {
    this.requireOnline();
    this.memory.clear();
    this.status = 'crashed';
    yield { node: 'mem', text: 'Crash cleared the memtable. The WAL and installed SSTables survived.' };
  }

  *restart() {
    if (this.status !== 'crashed') throw new Error('Crash the engine before restarting.');
    this.status = 'recovering';
    yield { node: 'wal', text: this.log.length ? 'Open the surviving WAL at its first entry.' : 'The WAL is empty. There are no entries to replay.' };
    for (const record of this.log) {
      this.memory.set(record.key, record);
      yield { node: 'mem', record, text: record.operation === 'delete'
        ? `Replay #${record.seq}. Restore the tombstone for “${record.key}” in the memtable.`
        : `Replay #${record.seq}. Set “${record.key}” to “${record.value}” in the memtable.` };
    }
    this.status = 'online';
    yield { node: 'client', text: 'Recovery complete. The engine can serve reads and writes.' };
  }

  *mutate(operation, key, value) {
    this.requireOnline();
    const current = yield* this.read(key);
    const exists = current && current.operation !== 'delete';
    if (operation === 'create' ? exists : !exists) {
      const reason = exists ? 'already exists' : 'does not exist';
      yield {node:'client', text:`${operation.toUpperCase()} skipped. “${key}” ${reason}. No WAL entry was written.`};
      return;
    }
    yield* this.write(key, value, operation);
  }

  *write(key, value, operation = 'write') {
    this.requireOnline();
    const deleted = operation === 'delete';
    const record = { seq: ++this.seq, key, operation, value:deleted ? null : value };
    this.history.push(record);
    yield { node:'client', record, text:deleted ? `Delete “${key}” with a new tombstone #${record.seq}.`
      : `${operation.toUpperCase()} “${key}” = “${value}” as version #${record.seq}.` };
    this.log.push(record);
    yield { node:'wal', record, text:`Append ${deleted ? 'tombstone' : 'record'} #${record.seq} to the write-ahead log.` };
    this.memory.set(key, record);
    yield { node:'mem', record, text:deleted ? `Tombstone #${record.seq} now hides older versions of “${key}”. Reads return Not found.`
      : `Store “${value}” in memory under “${key}”. Write acknowledged.` };
  }

  *read(key) {
    this.requireOnline();
    yield { node: 'client', text: `Look up “${key}”.` };
    const hit = this.memory.get(key);
    yield { node: 'mem', source: 'RAM', found: hit, text: hit?.operation === 'delete'
      ? `Tombstone #${hit.seq} in the memtable. “${key}” was deleted. Return Not found.` : hit ? `Found “${hit.value}” in the memtable.` : 'Memtable miss. Check sorted tables, newest first.' };
    if (hit) return hit;
    let best = null;
    const mask = keyMask(key);
    for (const [i,table] of this.tables.entries()) {
      const maybe = (table.bloom & mask) === mask;
      const record = maybe ? table.rows.find(row => row.key === key) : undefined;
      best = newestVersion([best,record]);
      const remainingMax = this.tables[i+1]?.maxSeq ?? 0;
      const resolved = best && best.seq >= remainingMax;
      const text = record?.operation === 'delete' ? `Tombstone #${record.seq} in ${table.name}.` : record ? `Found “${record.value}” in ${table.name}.` : `“${key}” is absent from ${table.name}.`;
      const decision = maybe ? 'Bloom filter says possibly present. Checked file rows. ' + text
        : `Bloom filter rules out “${key}” in ${table.name}. Skipped file rows.`;
      yield { node:'disk', source:table.name, bloom:maybe ? 'maybe' : 'negative', found:resolved ? best : undefined, candidate:best,
        text:decision + (resolved && best.operation === 'delete' ? ' The newest version is a tombstone. Return Not found.' : best && !resolved ? ' Check remaining files for a newer write.' : '') };
      if (resolved) return best;
    }
    yield { node: 'disk', exhausted:true, text: `Lookup complete. Key “${key}” was not found.` };
  }

  lastFlush = null;

  planFlush() {
    if (!this.memory.size) return null;
    return {
      log: [...this.log],
      rows: [...this.memory.values()].sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    };
  }

  *flush() {
    this.requireOnline();
    const flush = this.planFlush();
    if (!flush) {
      yield { node: 'mem', text: 'The memtable is empty. Write a key before flushing.' };
      return;
    }
    yield { node: 'mem', flush, phase: 'freeze', text: `Freeze the memtable with ${flush.rows.length} distinct keys.` };
    const table = this.newTable(flush.rows);
    this.tables.unshift(table);
    flush.output = table;
    yield { node: 'disk', flush, phase: 'install', text: `Install ${table.name} with its records in key order.` };
    this.memory.clear();
    this.log = [];
    this.lastFlush = flush;
    yield { node: 'wal', flush, phase: 'retire', text: 'Retire the covered log and start an empty memtable.' };
  }

  lastCompaction = null;

  planCompaction(automatic = false) {
    const selection = selectInputs(this.tables, this.policy, automatic);
    if (!selection) return null;
    const byKey = new Map();
    for (const table of selection.inputs) {
      for (const row of table.rows) {
        if (!byKey.has(row.key)) byKey.set(row.key, []);
        byKey.get(row.key).push(row);
      }
    }
    // Tables are immutable. Retain their identities so the completed merge can be inspected.
    const groups = [...byKey.keys()].sort().map(key => ({ key, versions: byKey.get(key).sort((a,b) => b.seq-a.seq) }));
    return {...selection, policy:this.policy, groups, untouched:this.tables.filter(t => !selection.inputs.includes(t))};
  }

  *compact(plan = this.planCompaction()) {
    this.requireOnline();
    if (!plan) {
      yield { node: 'disk', text: this.policy === 'tiered' ? 'No size tier has two files to merge.' : 'No eligible compaction inputs. Write and flush to create another SSTable.' };
      return;
    }
    yield { node: 'disk', plan, phase:'compare', text: `${policies[this.policy] ?? 'Full merge'} · ${plan.reason} Inputs: ${plan.inputs.map(t=>t.name).join(', ')}.` };
    const table = this.newTable(plan.groups.map(group => group.versions[0]), plan.level);
    this.tables = [table,...plan.untouched].sort((a,b) => b.maxSeq-a.maxSeq);
    this.lastCompaction = { ...plan, output: table };
    const dropped = plan.groups.reduce((total, group) => total + group.versions.length - 1, 0);
    yield { node: 'disk', plan:this.lastCompaction, phase:'install', text: `Install ${table.name}. Discard ${dropped} superseded record(s).` };
  }

  newTable(records, level = 0) {
    const rows = [...records].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return { name: `run-${String(++this.file).padStart(3, '0')}.sst`, rows, bloom:buildBloom(rows), level, bytes:payloadBytes(rows), maxSeq:newestVersion(rows).seq };
  }
}

export function exampleEngine() {
  const engine = new StorageEngine();
  for (const [key, value] of [['birch', 'gold'], ['cedar', 'sage']]) Array.from(engine.write(key, value));
  Array.from(engine.flush());
  Array.from(engine.write('cedar', 'jade'));
  Array.from(engine.write('elm', 'olive'));
  return engine;
}
