import { recordValue } from '../engine.js';
import { newestVersion } from '../compaction-planner.js';
import React, { useLayoutEffect, useRef } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { StagePopover } from '../../../design-system/inspectors.jsx';

const seqLabel = seq => '#' + String(seq).padStart(2, '0');
const version = record => seqLabel(record.seq) + ' · ' + recordValue(record);

function Entry({ label, children, selected }) {
  return <div className={'inspection-entry' + (selected ? ' selected' : '')}>
    <dt>{label}</dt><dd>{children}</dd>
  </div>;
}

function Writes({ engine, stage, keyName, selectedSeq }) {
  const writes = engine.history.filter(record => record.key === keyName);
  return <>
    <p>{stage === 'history'
      ? 'Each accepted mutation gets a sequence number. Follow each version below to see where the engine still keeps a copy.'
      : 'Each mutation enters the WAL before it enters RAM. A flush installs the latest value per key in a sorted file before retiring the covered log.'}</p>
    {writes.length === 0 && <p>No mutation for <strong>{keyName}</strong> appears in the write history.</p>}
    <dl>{writes.map(record => {
      const places = [];
      if (engine.log.includes(record)) places.push('Active WAL');
      if (engine.memory.get(keyName) === record) places.push('memtable');
      for (const table of engine.tables) if (table.rows.includes(record)) places.push(table.name);
      return <Entry key={record.seq} label={(record.operation ?? 'write').toUpperCase()+' '+version(record)} selected={selectedSeq === record.seq}>
        {places.length ? places.join(' · ') : record === engine.history.at(-1) ? 'Received by the writer' : 'Only in write history'}
      </Entry>;
    })}</dl>
    {stage === 'route' && <p>The active WAL has {engine.log.length} {engine.log.length === 1 ? 'entry' : 'entries'} available for recovery.</p>}
  </>;
}

function readContext(stage, engine, keyName, lookup, sourceName) {
  const sources = [
    {name:'RAM', record:engine.memory.get(keyName), count:engine.memory.size},
    ...engine.tables.map(table => ({name:table.name, record:table.rows.find(r => r.key === keyName), count:table.rows.length}))
  ];
  const trace = lookup?.key === keyName ? lookup : null;
  const winner = trace ? trace.winner : newestVersion(sources.map(s => s.record));
  const lastChecked = trace && [...trace.checked].at(-1);
  const selected = sources.find(s => s.name === sourceName) ??
    (stage === 'lookup' ? sources.find(s => s.name === lastChecked) ?? sources[0] : null);
  return {sources, trace, winner, selected};
}

function ReadDetails({ stage, engine, keyName, context, selectSource }) {
  const {sources, trace, winner, selected} = context;
  const owner = winner && sources.find(s => s.record === winner);
  const offline = engine.status !== 'online';
  if (offline && stage !== 'sources') return <p>{engine.status === 'crashed'
    ? 'The engine is offline. Restart it to rebuild the memtable from the surviving WAL.'
    : 'Recovery is replaying the WAL. Reads resume when the memtable is rebuilt.'}</p>;

  let explanation;
  if (stage === 'sources') {
    if (engine.status === 'crashed') {
      const entry = engine.log.findLast(record => record.key === keyName);
      explanation = entry
        ? 'The crash cleared the memtable. Restart will replay the WAL through ' + version(entry) + ' for ' + keyName + '.'
        : 'The crash cleared the memtable. The WAL has no entry to replay for ' + keyName + '.';
    } else if (engine.status === 'recovering') {
      explanation = 'Restart is rebuilding the memtable in WAL sequence order. Reads resume after the last entry.';
    } else explanation = 'RAM keeps one value per key. Each immutable file keeps its own sorted batch, so a key can appear in several places.';
  } else if (stage === 'output') {
    explanation = winner?.operation === 'delete' ? 'The highest sequence is a tombstone. Reads return Not found even if older files still hold a value.' : winner ? 'The highest write sequence supplies the visible value. The engine can return it even while an older version remains on disk.'
      : trace && !trace.complete ? 'The engine is still looking for a version to return.' : 'Every available source lacks this key.';
  } else {
    const next = sources.find(s => !trace?.checked.has(s.name) && !trace?.filters.has(s.name));
    if (!trace) {
      explanation = 'Storage snapshot. A read checks RAM first, then files from newest to oldest. Select a source to inspect its contents.';
    } else {
      let decision;
      if (winner?.operation === 'delete') decision = 'Return Not found. The newest version is a tombstone in ' + owner.name + '.';
      else if (winner) decision = 'Return “' + winner.value + '” ' + seqLabel(winner.seq) + ' from ' + owner.name + '. No remaining file can supply a newer version.';
      else if (next) decision = trace.checked.size ? (trace.candidate ? 'Best match so far is ' + version(trace.candidate) + '. ' : 'No match so far. ') + 'Next check ' + next.name + '.' : 'Start with the memtable in RAM.';
      else decision = trace.complete ? 'Key not found. All sources ruled out this key.' : 'All sources ruled out this key. The engine can now report the key as absent.';
      explanation = trace.checked.size + ' of ' + sources.length + ' sources checked. ' + decision;
    }
  }

  return <>
    <p>{explanation}</p>
    {stage === 'output' && <p className="inspection-result">{winner
      ? (winner.operation === 'delete' ? keyName + ' · Not found' : keyName + ' = ' + winner.value) + ' · ' + seqLabel(winner.seq) + ' from ' + owner.name
      : trace && !trace.complete ? 'Awaiting result' : 'Not found'}</p>}
    <dl>{sources.map(({name, record}) => {
      let status = record ? version(record) : 'Absent';
      if ((stage === 'lookup' || stage === 'sources') && trace) {
        status = trace.filters.get(name) === 'negative' ? 'Bloom negative · skipped file' : trace.checked.has(name) ? record ? 'Hit · ' + version(record) : 'Miss'
          : trace.winner ? 'Skipped' : 'Waiting';
      }
      return <Entry key={name} label={<Button label={name} size="sm" variant="ghost"
        aria-pressed={name === selected?.name} onClick={() => selectSource(name)} />}
        selected={name === selected?.name}>{status}</Entry>;
    })}</dl>
    {selected && <p className="inspection-reason"><strong>{selected.name}</strong>{' · '}
      {trace?.filters.get(selected.name) === 'negative'
        ? 'At least one tested bit is clear. The engine skipped the file rows. '
        : trace?.filters.get(selected.name) === 'maybe'
        ? 'Both tested bits are set. The engine searched the rows to verify the key. '
        : trace?.winner && !trace.checked.has(selected.name)
        ? 'The read resolved to ' + owner.name + '. '
        : selected.name === 'RAM' ? 'The memtable uses a key lookup. ' : 'Its Bloom filter has 16 bits. Each stored key, including a tombstone, sets two bits. A read tests the same positions. '}
      {stage === 'lookup' && (selected.name === 'RAM'
        ? selected.count + ' keys in memory. '
        : selected.count + ' sorted rows in this file. ')}
      {selected.record ? 'Stored version: ' + version(selected.record) + '.' : 'There is no entry for ' + keyName + ' here.'}
    </p>}
  </>;
}

const chartControls = '.column, header, #policy-controls, #maintenance-playback, #lesson, #paging, [role=listbox], [role=option]';

// Keep the SVG and its playback controls mounted as the popover opens and closes.
export function OperationInspector({ title, panel, close, open }) {
  const body = useRef(null);
  useLayoutEffect(() => { body.current.append(panel); }, [panel]);
  return <StagePopover id={panel.id + '-inspector'} title={title} wide open={open} keepOpen={chartControls} onDismiss={close}>
    <div ref={body} />
  </StagePopover>;
}

export function StageInspector({ stage, title, selection, engine, lookup, step, defaultKey, close, selectSource }) {
  if (!stage) return null;
  const keyName = selection?.key ?? lookup?.key ?? step?.key ?? defaultKey;
  const writes = stage === 'history' || stage === 'route';
  const context = writes ? null : readContext(stage, engine, keyName, lookup, selection?.source);
  const record = writes ? engine.history.findLast(row => row.key === keyName)
    : context.selected ? context.selected.record : context.winner;
  const seq = selection?.seq ?? record?.seq;
  const subtitle = seq == null ? keyName : keyName + ' ' + seqLabel(seq);
  return <StagePopover id="lsm-stage-detail" title={title} subtitle={subtitle}
    focusKey={selection?.anchor} keepOpen={chartControls} onDismiss={close}>
    {writes
      ? <Writes engine={engine} stage={stage} keyName={keyName} selectedSeq={seq} />
      : <ReadDetails stage={stage} engine={engine} keyName={keyName} context={context}
          selectSource={source => selectSource(source, keyName)} />}
  </StagePopover>;
}
