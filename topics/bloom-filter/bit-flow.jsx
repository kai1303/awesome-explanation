import React, { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { drawRibbon, reducedMotion } from '../chart-motion.js';
import { bloomHash, hashPositions } from './filter.js';
import { bitAt, slots } from './model.js';

gsap.registerPlugin(MotionPathPlugin);

export function BitFlow({querying, step, frame, stageKey, action, evidence, inspecting, openDetail}) {
  const board = useRef(null);
  const previous = useRef({step, key:stageKey});
  const timeline = useRef(null);
  const done = frame.phase === 'result';
  const active = frame.active;
  const hash = bloomHash(stageKey);
  const {first, second} = hashPositions(hash);
  const outgoing = done ? active : [];
  useLayoutEffect(() => {
    const from = previous.current;
    const animate = step === from.step + 1 || (frame.phase === 'probe' && (from.step !== step || from.key !== stageKey));
    previous.current = {step, key:stageKey};
    const root = board.current;
    function draw(moving) {
      timeline.current?.revert();
      const sequence = gsap.timeline();
      timeline.current = sequence;
      const bounds = root.getBoundingClientRect();
      function point(element, edge) {
        const box = element.getBoundingClientRect();
        return {x:box[edge] - bounds.left, y:box.top + box.height/2 - bounds.top};
      }
      for (const path of root.querySelectorAll('path')) {
        const direction = path.dataset.route;
        const source = root.querySelector(path.dataset.from);
        const target = root.querySelector(path.dataset.to);
        const a = point(source,'right'), b = point(target,'left');
        const mid = (a.x + b.x) / 2;
        path.setAttribute('d', 'M ' + a.x + ' ' + a.y + ' C ' + mid + ' ' + a.y + ' ' + mid + ' ' + b.y + ' ' + b.x + ' ' + b.y);
        if (!moving || reducedMotion.matches || (done && direction !== 'out')) continue;
        const label = path.nextElementSibling;
        const at = Number(path.dataset.order) * .2 + (direction === 'in' ? .72 : 0);
        drawRibbon(sequence,path,at,.72);
        sequence.set(label,{opacity:1},at)
          .to(label,{motionPath:{path:path.getAttribute('d')},duration:.72,ease:'power2.inOut'},at)
          .to(label,{opacity:0,duration:.14},at+.72);
        if (direction !== 'out' || Number(path.dataset.order) === outgoing.length-1)
          sequence.fromTo(target,{scale:.94},{scale:1,duration:.2,clearProps:'transform'},at+.72);
      }
    }
    draw(animate);
    let width = root.clientWidth, height = root.clientHeight;
    const resize = new ResizeObserver(() => {
      if (width === root.clientWidth && height === root.clientHeight) return;
      width = root.clientWidth; height = root.clientHeight; draw(false);
    });
    resize.observe(root);
    return () => { resize.disconnect(); timeline.current?.revert(); };
  },[step,stageKey]);

  useLayoutEffect(() => {
    if (inspecting) timeline.current?.progress(1);
  },[inspecting]);

  function route(direction, order, from, to, label) {
    return <g key={direction + to + from} className={'route ' + direction}>
      <path data-from={from} data-to={to} data-route={direction} data-order={order}/>
      <g className="flow-label"><rect x="-25" y="-10" width="50" height="19" rx="5"/>
        <text textAnchor="middle" y="3">{label}</text></g>
    </g>;
  }
  const slot = i => '[data-bit="' + i + '"]';
  return <div className="board" data-operation={querying ? 'query' : 'insert'} ref={board}>
    <svg className="wires" aria-hidden="true">
      {active.length > 0 && route('hash', 0, '.key-tag', '.hash-value', stageKey)}
      {active.map((i, order) => route('in', order, '.hash-value', slot(i), 'bit ' + i))}
      {outgoing.map((i, order) => route('out', order, slot(i), '.verdict', 'bit ' + i))}
    </svg>
    <div className="stage"><button className="stage-title" onClick={() => openDetail('Key')}>Key +</button>
      <div className="stage-body"><span className="key-tag">{stageKey}</span></div></div>
    <div className="stage"><button className="stage-title" onClick={() => openDetail('Hash')}>Hash function +</button>
      <div className="stage-body"><code className="hash-value">{active.length ? '0x' + hash.toString(16).toUpperCase().padStart(8, '0') : '32-bit hash'}</code>
        <small>{active.length ? 'Positions ' + first + ' and ' + second : 'Maps the word to two positions'}</small></div></div>
    <div className="stage array"><button className="stage-title" onClick={() => openDetail('Bit array')}>Bit array +</button>
      <div className="slots">{slots.map(i => <button key={i} data-bit={i}
        className={'slot' + (bitAt(frame.bits,i) ? ' set':'') + (active.includes(i) ? ' active':'')}
        aria-label={'Bit ' + i + ', value ' + bitAt(frame.bits,i)} onClick={() => openDetail(i)}>
        <span>{i}</span><b>{bitAt(frame.bits,i)}</b></button>)}</div></div>
    {querying && <div className="stage decision"><button className="stage-title" onClick={() => openDetail('Filter answer')}>Filter answer +</button>
      <div className="stage-body"><strong className="verdict">{action}</strong><small>{evidence}</small></div></div>}
  </div>;
}
