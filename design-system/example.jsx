import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { CommandRow, Disclosure } from './controls.jsx';
import { drawRibbon, reducedMotion } from '../topics/chart-motion.js';
import { exampleEngine } from '../topics/lsm-tree/engine.js';
import './guide.css';

const engine = exampleEngine();
const keys = ['cedar', 'birch'];

function Record({ role, children, endpoint }) {
  return <div className={'record ' + role} data-endpoint={endpoint}>
    <i className="pin" aria-hidden="true" />{children}
  </div>;
}

function ReadExample() {
  const [key, choose] = useState('cedar');
  const [expanded, inspect] = useState(false);
  const board = useRef(null);
  const trace = Array.from(engine.read(key));
  const hit = trace.find(step => step.found);
  const fromRam = hit.node === 'mem';
  const file = engine.tables[0];
  const source = fromRam ? 'Memtable' : file.name;

  useLayoutEffect(() => {
    const host = board.current;
    const path = host.querySelector('path');
    let motion;
    function connect(animate) {
      motion?.revert();
      const origin = host.getBoundingClientRect();
      const start = host.querySelector('[data-endpoint="source"]').getBoundingClientRect();
      const end = host.querySelector('[data-endpoint="result"]').getBoundingClientRect();
      const x = start.right - origin.left, y = start.top + start.height / 2 - origin.top;
      const u = end.left - origin.left, v = end.top + end.height / 2 - origin.top;
      const mid = (x + u) / 2;
      path.setAttribute('d', `M ${x},${y} C ${mid},${y} ${mid},${v} ${u},${v}`);
      if (animate && !reducedMotion.matches) {
        motion = gsap.timeline();
        drawRibbon(motion, path);
      }
    }
    connect(true);
    let width = host.clientWidth;
    const observer = new ResizeObserver(() => {
      if (host.clientWidth !== width) { width = host.clientWidth; connect(false); }
    });
    observer.observe(host);
    return () => { observer.disconnect(); motion?.revert(); };
  }, [key]);

  return <>
    <div className="flow-viewport" role="region" aria-label="Example of an LSM read" tabIndex={0}>
      <div className="demo-board" ref={board}>
        <svg aria-hidden="true"><path className={fromRam ? 'ram' : 'file'}/></svg>
        <section><h3>Client</h3><p className="subtitle">Read request</p>
          <div className="client-group" role="group" aria-label="Choose a key">{keys.map(k =>
            <CommandRow key={k} label={'Read ' + k} active={key === k} aria-pressed={key === k} onClick={() => choose(k)} />)}
          </div></section>
        <section><h3>Read sources</h3><p className="subtitle">Probe order</p>
          <div className="sample-rows">
            <Record role="ram" endpoint={fromRam ? 'source' : undefined}>RAM · {fromRam ? 'Hit' : 'Miss'}</Record>
            <Record role="file" endpoint={fromRam ? undefined : 'source'}>{file.name} · {fromRam ? 'Skipped' : 'Hit'}</Record>
          </div></section>
        <section><Disclosure label="Visible value" expanded={expanded} controls="read-detail" onClick={() => inspect(!expanded)} />
          <p className="subtitle">Newest version</p>
          <div className="sample-rows"><Record role="winner" endpoint="result">{key} = {hit.found.value}</Record></div>
        </section>
      </div>
    </div>
    <div className="demo-detail" id="read-detail" hidden={!expanded}>
      <strong>Version #{hit.found.seq} from {source}</strong>
      <p>{trace.slice(1).map(step => step.text).join(' ')}</p>
    </div>
    <div className="footline" role="status">{fromRam ? 'The memtable supplies the newest value. The file is skipped.' : 'The memtable misses. The engine checks the file and returns its matching record.'}</div>
  </>;
}
createRoot(document.getElementById('example')).render(<ReadExample/>);
