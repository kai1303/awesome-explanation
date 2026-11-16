import { newLookup, trackProbe } from './bloom.js';
import { StorageEngine } from './engine.js';

const batches = [
  [['maple','red'], ['birch','gold'], ['cedar','sage']],
  [['elm','olive'], ['birch','amber']],
  [['oak','umber'], ['cedar','jade'], ['ash','silver']]
];

function writeBatch(engine, batch) {
  for (const [key, value] of batch) Array.from(engine.write(key, value));
}

export function articleEngine({seedJuniper = false, pendingWrites = batches[2]} = {}) {
  const engine = new StorageEngine();
  for (const batch of batches.slice(0, 2)) {
    writeBatch(engine, batch);
    if (seedJuniper && batch === batches[1]) Array.from(engine.write('juniper', 'needles'));
    Array.from(engine.flush());
  }
  writeBatch(engine, pendingWrites);
  return engine;
}

// A snapshot keeps shared record identities across the history, lookup and tables.
// The chart uses those identities to draw the winning path.
export function articleFrames() {
  let engine = new StorageEngine();
  let chapter = 'write';
  const frames = [];
  function save(caption, highlight, lookup = null, detail = null) {
    const frame = structuredClone({ chapter, caption, engine, highlight, lookup, detail });
    frame.engine = Object.assign(new StorageEngine(), frame.engine);
    frames.push(frame);
  }
  const stages = { client:'history', wal:'route', mem:'sources', disk:'sources' };
  function play(operation, key, value) {
    const lookup = operation === 'read' ? newLookup(key) : null;
    for (const step of engine[operation](key, value)) {
      if (lookup) trackProbe(lookup, step);
      let caption = step.text;
      let detail = null;
      if (step.flush) detail = { operation, phase:step.phase, flush:step.flush };
      if (operation === 'compact') {
        detail = { operation, step };
        const group = (step.plan ?? engine.lastCompaction).groups.find(item => item.key === 'cedar');
        const [keep, drop] = group.versions;
        caption += ' For cedar, keep #' + keep.seq + ' (' + keep.value + ') and drop #' + drop.seq + ' (' + drop.value + ').';
      }
      if (step.flush && step.phase === 'install') caption += ' Key order: ' + step.flush.rows.map(row => row.key).join(', ') + '.';
      const stage = lookup ? (lookup.complete ? 'output' : 'lookup') : stages[step.node];
      save(caption, {stage, key:step.record?.key ?? key ?? 'cedar', seq:step.record?.seq ?? (operation === 'write' ? engine.seq : undefined), source:step.source, replay:step.record}, lookup, detail);
    }
  }

  writeBatch(engine, batches[0].slice(0, 2));
  play('write', ...batches[0][2]);
  chapter = 'first-flush';
  play('flush');
  writeBatch(engine, batches[1]);
  Array.from(engine.flush());
  save('The next batch writes elm and birch, then flushes them to ' + engine.tables[0].name + '. Cedar is still in the first file.', {stage:'sources', key:'cedar'});
  chapter = 'update';
  writeBatch(engine, batches[2].slice(0, 1));
  play('write', ...batches[2][1]);
  writeBatch(engine, batches[2].slice(2));
  play('read', 'cedar');
  play('read', 'maple');
  chapter = 'next-flush';
  play('flush');
  play('read', 'cedar');
  play('read', 'juniper');
  chapter = 'merge';
  play('compact');
  play('read', 'juniper');
  for (const flushFirst of [false, true]) {
    chapter = flushFirst ? 'crash-after' : 'crash-before';
    engine = articleEngine();
    if (flushFirst) Array.from(engine.flush());
    save(flushFirst
      ? 'Try the crash again after flushing the same batch. The active WAL now has ' + engine.log.length + ' entries.'
      : 'Return to the eight-write example, before its third flush. Which copy of jade can survive a crash?', {stage:'route', key:'cedar'});
    play('crash');
    play('restart');
    play('read', 'cedar');
  }
  return frames;
}
