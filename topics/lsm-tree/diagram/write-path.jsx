import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { gsap } from 'gsap';
import { mountControl } from '../controls.jsx';
import { recordValue } from '../engine.js';
import { reducedMotion } from '../../chart-motion.js';

function WriteControls({status, action, onClick}) {
  return <>
    <p role="status">{status}</p>
    {action && <Button size="sm" variant="ghost" label={action} onClick={onClick} />}
  </>;
}

export function writeTransfer(chart, host) {
  const render = host ? mountControl(host, WriteControls) : null;
  const phaseKey = host ? 'writePhase' : 'recoveryPhase';
  const label = document.createElement('span');
  label.className = 'travelling-write';
  label.setAttribute('aria-hidden','true');
  label.hidden = true;
  chart.append(label);
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  const cursor = {progress:0};
  let record, state, timeline, distance = 0, availability;

  function position() {
    if (label.hidden || !distance) return;
    const point = path.getPointAtLength(cursor.progress * distance);
    label.style.left = point.x + 'px';
    label.style.top = point.y + 'px';
  }

  function phase(next) {
    state = next;
    chart.dataset[phaseKey] = state;
    label.hidden = state !== 'moving';
    position();
    if (!render) return;
    const done = state === 'arrived';
    const status = done ? record.key + ' is in the memtable. Its WAL entry remains.'
      : 'Follow ' + record.key + ' from the WAL to the memtable.';
    const action = reducedMotion.matches ? null : done ? 'Replay' : timeline?.paused() ? 'Resume replay' : 'Pause replay';
    render({status, action, onClick:() => {
      if (done) start();
      else {
        timeline.paused(!timeline.paused());
        phase(state);
      }
    }});
  }

  function start() {
    timeline?.kill();
    cursor.progress = 0;
    if (reducedMotion.matches) { phase('arrived'); return; }
    timeline = gsap.timeline()
      .call(() => phase('moving'), [], .55)
      .to(cursor, {progress:1, duration:1.65, ease:'power2.inOut', onUpdate:position}, .55)
      .call(() => phase('arrived'));
    phase('wal');
    return timeline;
  }

  return {
    get seq() { return availability === 'ready' ? record?.seq : null; },
    show(next, reason) {
      if (record?.seq === next?.seq && availability === reason) return;
      timeline?.kill();
      record = next;
      availability = reason;
      if (reason === 'ready') {
        label.textContent = record.key + ' = ' + recordValue(record);
        return start();
      } else {
        label.hidden = true;
        delete chart.dataset[phaseKey];
        render?.({status:reason});
      }
    },
    // Use the ribbon's own edge coordinates and bend. The short horizontal
    // segments carry the label from the center of one real row to the other.
    measure(a, b, box, bend) {
      const x = a.right - box.left, end = b.left - box.left;
      const y = a.top + a.height / 2 - box.top, endY = b.top + b.height / 2 - box.top;
      path.setAttribute('d', `M${x-a.width/2},${y} H${x} C${x+bend},${y} ${end-bend},${endY} ${end},${endY} H${end+b.width/2}`);
      distance = path.getTotalLength();
      position();
    },
    close() {
      timeline?.kill();
      record = availability = null;
      distance = 0;
      label.hidden = true;
      delete chart.dataset[phaseKey];
      render?.(null);
    }
  };
}
