// A single writer, one active log and memtable, newest-first immutable runs.
export class StorageEngine {
  seq = 0;
  history = []; // Teaching trace, independent of the active WAL.
  file = 0;
  log = [];
  memory = new Map();
  tables = [];

  *write(key, value) {
    const record = { seq: ++this.seq, key, value };
    this.history.push(record);
    yield { node: 'client', text: `Put “${key}” = “${value}”.` };
    this.log.push(record);
    yield { node: 'wal', text: `Append record #${record.seq} to the write-ahead log.` };
    this.memory.set(key, record);
    yield { node: 'mem', text: `Store “${value}” in memory under “${key}”. Write acknowledged.` };
  }

  *read(key) {
    yield { node: 'client', text: `Look up “${key}”.` };
    const hit = this.memory.get(key);
    yield { node: 'mem', source: 'RAM', text: hit ? `Found “${hit.value}” in the memtable.` : 'Memtable miss. Check sorted tables, newest first.' };
    if (hit) return;
    for (const table of this.tables) {
      const record = table.rows.find(row => row.key === key);
      yield { node: 'disk', source: table.name, text: record ? `Found “${record.value}” in ${table.name}.` : `“${key}” is absent from ${table.name}.` };
      if (record) return;
    }
    yield { node: 'disk', text: `Lookup complete. Key “${key}” was not found.` };
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

  planCompaction() {
    if (this.tables.length < 2) return null;
    const byKey = new Map();
    for (const table of this.tables) {
      for (const row of table.rows) {
        if (!byKey.has(row.key)) byKey.set(row.key, []);
        byKey.get(row.key).push(row);
      }
    }
    // Tables are immutable. Retain their identities so the completed merge can be inspected.
    const groups = [...byKey.keys()].sort().map(key => ({ key, versions: byKey.get(key) }));
    return { inputs: this.tables.slice(), groups };
  }

  *compact() {
    const plan = this.planCompaction();
    if (!plan) {
      yield { node: 'disk', text: 'Compaction needs two sorted tables. Write and flush to create another.' };
      return;
    }
    yield { node: 'disk', plan, text: `Merge ${plan.inputs.length} sorted tables in key order. Compare versions newest first.` };
    const table = this.newTable(plan.groups.map(group => group.versions[0]));
    this.tables = [table];
    this.lastCompaction = { ...plan, output: table };
    const dropped = plan.groups.reduce((total, group) => total + group.versions.length - 1, 0);
    yield { node: 'disk', text: `Install ${table.name}. Discard ${dropped} superseded record(s).` };
  }

  newTable(records) {
    const rows = [...records].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return { name: `run-${String(++this.file).padStart(3, '0')}.sst`, rows };
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
