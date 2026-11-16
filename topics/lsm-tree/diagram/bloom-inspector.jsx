import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { bloomBits, buildBloom, keyMask } from '../bloom.js';
import { lessonHref } from '../../bloom-filter/model.js';
import { recordValue } from '../engine.js';

const positions = Array.from({length:bloomBits}, (_, index) => index);
const bit = (bits, i) => (bits >>> i) & 1;

function BitRow({label, bits, kind, active, highlighted, inspect}) {
  return <tr className={kind} data-active={active || undefined}>
    <th scope="row">{label}</th>
    {positions.map(i => <td key={i} data-set={bit(bits,i)} data-lit={highlighted.includes(i) || undefined}>
      {inspect ? <button type="button" aria-label={`Bit ${i}, value ${bit(bits,i)}`}
        onPointerEnter={() => inspect(i)} onFocus={() => inspect(i)} onClick={() => inspect(i)}>
        {bit(bits,i)}
      </button> : bit(bits,i)}
    </td>)}
  </tr>;
}

export function BloomInspector({table, lookup, close}) {
  const [view, setView] = useState('probe');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [inspected, setInspected] = useState(null);
  const timeline = useRef(null);
  const building = view === 'build';
  const query = lookup?.key ?? 'juniper';
  const queryBits = keyMask(query);
  const tested = positions.filter(i => bit(queryBits,i));
  const end = building ? table.rows.length : tested.length + 1;
  const filter = building ? buildBloom(table.rows.slice(0,step)) : table.bloom;
  const current = building ? table.rows[step - 1] : null;
  const activeBits = building ? positions.filter(i => current && bit(keyMask(current.key),i))
    : step === end ? tested : tested.slice(Math.max(0,step - 1),step);
  const highlighted = inspected === null ? activeBits : [inspected];
  const possible = (table.bloom & queryBits) === queryBits;
  const probe = lookup?.filters.get(table.name);
  const match = table.rows.find(row => row.key === query);

  function play() {
    timeline.current?.kill();
    setInspected(null);
    setStep(0);
    setPlaying(true);
    const motion = gsap.timeline({onComplete:() => setPlaying(false)});
    timeline.current = motion;
    for (let i = 1; i <= end; i++) motion.call(() => setStep(i), [], i * .82);
  }

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(building ? 0 : end);
      setPlaying(false);
    } else play();
    return () => timeline.current?.kill();
  }, [view]);

  function seek(to) {
    timeline.current?.kill();
    setPlaying(false);
    setInspected(null);
    setStep(to);
  }

  let decision;
  if (probe === 'negative') decision = 'The engine skipped the file rows.';
  else if (probe === 'maybe') decision = match
    ? `The engine checked the rows and found ${recordValue(match)} at #${match.seq}.`
    : 'False positive. The engine checked the rows and found no matching key.';
  else if (lookup?.winner) decision = 'The read had already resolved before reaching this file.';
  else if (lookup) decision = 'The read has yet to reach this filter.';
  else decision = 'Example probe. No lookup is active.';

  const owners = inspected === null ? [] : (building ? table.rows.slice(0,step) : table.rows)
    .filter(row => bit(keyMask(row.key),inspected)).map(row => row.key);
  const equation = tested.map(i => bit(table.bloom,i)).join(' AND ');

  return <Dialog isOpen onOpenChange={close} width="min(700px, calc(100vw - 24px))"
    maxHeight="85dvh" padding={4} aria-label={`Bloom filter · ${table.name}`}>
    <DialogHeader title="Bloom filter" subtitle={table.name} onOpenChange={close} />
    <div className="bloom-inspection">
      <a href={lessonHref(table.name, table.rows.map(row => row.key), query, building ? 'insert' : 'query')} target="_blank" rel="noopener">
        How does a Bloom filter work? Explore this file step by step ↗
      </a>
      <SegmentedControl label="Filter operation" size="sm" value={view} onChange={value => {
        setInspected(null); setStep(0); setView(value);
      }} layout="fill">
        <SegmentedControlItem label="Build filter" value="build" />
        <SegmentedControlItem label="Test key" value="probe" />
      </SegmentedControl>
      <div className="bloom-calc-header">
        <h3>{building ? 'Stored keys → file filter' : `${query} → bits ${tested.join(' and ')}`}</h3>
        <Button size="sm" variant="ghost" label={playing ? 'Show result' : 'Replay'}
          onClick={playing ? () => seek(end) : play} />
      </div>
      <p>{building ? 'Hash each stored key into two positions. A column stays set once any key sets it.'
        : 'Compare the highlighted positions with the file filter. A single 0 rules out the key.'}</p>
      <div className="bloom-matrix-scroll">
        <table className="bloom-matrix" onPointerLeave={() => setInspected(null)}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInspected(null); }}
          aria-label="Stored keys, file filter and probe by bit position">
          <thead><tr><th>Bit</th>{positions.map(i => <th scope="col" key={i} data-lit={highlighted.includes(i) || undefined}>{i}</th>)}</tr></thead>
          <tbody>{table.rows.map((row,index) => <BitRow key={row.seq}
            label={row.key + (row.operation === 'delete' ? ' (deleted)' : '')} bits={keyMask(row.key)}
            kind={building && index >= step ? 'pending' : 'stored'}
            active={current === row} highlighted={highlighted} />)}</tbody>
          <tbody><BitRow label="File filter" kind="aggregate" bits={filter} highlighted={highlighted}
            inspect={i => { if (!playing) setInspected(i); }} />
          {!building && <BitRow label={`Test ${query}`} kind="probe-mask" bits={queryBits} highlighted={highlighted} />}</tbody>
        </table>
      </div>
      {inspected !== null && <p className="bit-detail">Bit {inspected} = {bit(filter,inspected)} · {owners.length ? 'Set by ' + owners.join(', ') : 'No stored key has set it.'}</p>}
      <div className="bloom-equation" aria-live="polite">
        {building ? <><strong>{current ? `Add ${current.key} · set bits ${positions.filter(i => bit(keyMask(current.key),i)).join(' and ')}` : 'Start with 16 clear bits'}</strong>
          <p>{step} of {end} keys added{step === end ? ' · Filter complete' : ''}</p></>
        : step === end ? <><strong>{equation} = {Number(possible)} · {possible ? 'Possibly present' : 'Definitely absent'}</strong><p>{decision}</p></>
        : <><strong>{step ? `Filter[${tested[step - 1]}] = ${bit(table.bloom,tested[step - 1])}` : `Hash “${query}”`}</strong>
          <p>{step ? `Inspecting bit ${tested[step - 1]} in ${table.name}.` : `The key selects positions ${tested.join(' and ')}.`}</p></>}
      </div>
      {building && <div className="bloom-step-controls">
        <Button label="Previous key" size="sm" isDisabled={!step} onClick={() => seek(step - 1)} />
        <Button label="Add next key" size="sm" isDisabled={step >= end} onClick={() => seek(step + 1)} />
      </div>}
    </div>
  </Dialog>;
}
