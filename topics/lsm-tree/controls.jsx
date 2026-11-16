import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { policies } from './compaction-planner.js';
import { createRoot } from 'react-dom/client';
import { exampleSQL, sqlVerbs } from './sql.js';
import { CommandRow } from '../../design-system/controls.jsx';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

// The controls own their DOM. D3 measures the surrounding chart columns.
export function mountControl(host, Component) {
  const root = createRoot(host);
  return props => root.render(props === null ? null : <Component {...props} />);
}

const queryValues = {create: 'needles', read: null, update: 'pine', delete: null};

function queryFor(op) {
  return Object.hasOwn(queryValues, op) ? exampleSQL(op, 'juniper', queryValues[op]) : null;
}

export function OperationBar({ run, reset, policy, comparison, switchPolicy, demo, inspectingBloom }) {
  const [op, setOp] = useState(null);
  const [result, setResult] = useState(null);
  const sql = queryFor(op);
  const [playback, setPlayback] = useState(null);
  const busy = Boolean(playback);
  const [crashed, setCrashed] = useState(false);
  const recoveryRow = useRef(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!busy && restoreFocus.current) {
      recoveryRow.current?.focus();
      restoreFocus.current = false;
    }
  }, [busy]);

  function advance(frame) {
    const step = frame.steps.next();
    if (!step.done) {
      if (frame.paused) step.value?.pause();
      setPlayback({...frame, animation:step.value});
      return;
    }
    if (frame.op === 'crash' || frame.op === 'restart') {
      const offline = frame.op === 'crash';
      setCrashed(offline);
      restoreFocus.current = true;
    }
    if (step.value) setResult(step.value);
    setPlayback(null);
  }

  useEffect(() => {
    if (!playback || playback.paused) return;
    if (inspectingBloom) {
      playback.animation?.pause();
      return () => playback.animation?.resume();
    }
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800;
    const animation = playback.animation;
    let timer;
    const schedule = () => { timer = setTimeout(() => advance(playback), delay); };
    if (animation && animation.progress() < 1) {
      animation.eventCallback('onComplete', schedule);
    } else schedule();
    return () => {
      clearTimeout(timer);
      animation?.eventCallback('onComplete', null);
    };
  }, [playback, inspectingBloom]);

  function start(id) {
    if (busy || (crashed && id !== 'restart')) return;
    const statement = queryFor(id);
    setOp(id);
    setResult(null);
    advance({op:id, steps:run(id, statement ? 'juniper' : undefined, queryValues[id], statement), paused:false});
  }

  useEffect(() => {
    if (demo) start(demo);
  }, []);

  function togglePlayback() {
    playback.animation?.paused(!playback.paused);
    setPlayback({...playback, paused:!playback.paused});
  }

  function resetExample() {
    reset();
    setOp(null);
    setResult(null);
    setCrashed(false);
  }

  const playbackControls = playback && <div className="command-editor-actions">
          <Button label={playback.paused ? 'Resume' : 'Pause'} size="sm" variant="primary"
            onClick={togglePlayback} />
          <Button label="Next step" size="sm" onClick={() => {
            playback.animation?.eventCallback('onComplete', null);
            playback.animation?.progress(1);
            advance({...playback, paused:true});
          }} />
      </div>;

  return <section id="command" aria-label="Simulation controls">
    <div className="command-editor">
      <div className="client-group" role="group" aria-label="SQL queries">
        <p className="group-name">SQL · juniper</p>
        {Object.keys(queryValues).map(id => <CommandRow key={id}
          label={sqlVerbs[id]} title={queryFor(id)} active={op === id}
          isDisabled={busy || crashed} onClick={() => start(id)} />)}
      </div>
      <div className="client-group" role="group" aria-label="Engine operations">
        <p className="group-name">Engine</p>
        {['flush', 'compact', crashed ? 'restart' : 'crash'].map(id => <CommandRow key={id}
          ref={id === 'crash' || id === 'restart' ? recoveryRow : undefined}
          label={id[0].toUpperCase() + id.slice(1)}
          active={op === id} isDisabled={busy || (crashed && id !== 'restart')} onClick={() => start(id)} />)}
      </div>
      {sql && <code className="command-sql">{sql}</code>}
      {['compact','flush','crash','restart'].includes(playback?.op)
        ? createPortal(playbackControls, document.getElementById('maintenance-playback'))
        : playbackControls}
    </div>
    <Button className="client-reset" label="Reset example" size="sm" variant="ghost" isDisabled={busy} onClick={resetExample} />
    {createPortal(<>
      <div className="policy-choices" role="group" aria-label="Sandbox compaction policy">
        <strong>Compaction policy</strong>
        {Object.entries(policies).map(([id,name]) => <Button key={id} size="sm" label={name}
          variant={policy === id ? 'secondary' : 'ghost'} aria-pressed={policy === id}
          isDisabled={busy} onClick={() => switchPolicy(id)} />)}
      </div>
      <a className="four-file-link" href="#compare-four-files">Compare the same four files →</a>
      {comparison && <details className="policy-comparison">
        <summary>Compare merges · {comparison.command} · write #{comparison.seq}</summary>
        <table><thead><tr><th>Policy</th><th>Inputs → output</th><th>Files left out</th></tr></thead>
          <tbody>{Object.entries(policies).flatMap(([id,name]) => {
            const merges = comparison[id];
            if (!merges.length) return <tr key={id}><th>{name}</th><td>No merge triggered</td><td>All files retained</td></tr>;
            return merges.map(plan => <tr key={id+plan.output.name}><th>{name}</th>
              <td>{plan.inputs.map(t=>t.name).join(' + ')} → {plan.output.name}</td>
              <td>{plan.untouched.map(t=>t.name).join(', ') || 'None'}</td></tr>);
          })}</tbody>
        </table>
      </details>}
    </>, document.getElementById('policy-controls'))}
    {result && result.sql === sql && <section className="sql-result" aria-label="Query result" aria-live="polite">
      <strong>{result.message}</strong>
      {result.row && <table><thead><tr><th>key</th><th>value</th></tr></thead>
        <tbody><tr><td>{result.row.key}</td><td>{result.row.value}</td></tr></tbody></table>}
    </section>}
  </section>;
}

export function KeyPaging({ page, pages, range, change }) {
  if (pages < 2) return null;
  return <>
    <Button label="Previous keys" size="sm" isDisabled={page === 0} onClick={() => change(-1)} />
    <span>{range}</span>
    <Button label="Next keys" size="sm" isDisabled={page === pages - 1} onClick={() => change(1)} />
  </>;
}

const flushSteps = { freeze: 'Freeze memtable', install: 'Install SSTable', retire: 'Retire WAL' };

export function ReplayControls({ label, options, value, onChange, onReplay, live, empty, phase, onPhase }) {
  return <>
    <div className="merge-tools">
      {options.length > 0 && <Selector label={label} isLabelHidden size="sm" options={options}
        value={value} onChange={onChange} isDisabled={live} width={195} />}
      <Button label="Replay" size="sm" onClick={onReplay} isDisabled={empty || live} />
    </div>
    {onPhase && !empty && <div className="flush-phases" role="group" aria-label="Flush steps">
      {Object.entries(flushSteps).map(([id, title]) => <Button key={id} label={title} size="sm"
        variant={phase === id ? 'secondary' : 'ghost'} aria-pressed={phase === id}
        isDisabled={live} onClick={() => onPhase(id)} />)}
    </div>}
  </>;
}
