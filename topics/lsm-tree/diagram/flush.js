import { recordValue } from '../engine.js';
import { sandboxLimits } from '../engine.js';
import { mountControl, ReplayControls } from '../controls.jsx';
import { select } from 'd3-selection';
import { gsap } from 'gsap';
import { recordDiagram, seq, stepY, rowH, left, middle, right, rowWidth, svgWidth } from './record-diagram.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function flushView(panel) {
  panel.innerHTML = `
    <div class="replay-controls"></div>
    <p class="flush-status" role="status"></p>
    <details class="compaction-policy">
      <summary>When does a database flush?</summary>
      <p>Suppose the memtable has a 64 MiB write buffer. A write that takes it from 63 to 65 MiB crosses the limit. The engine freezes that memtable, accepts new writes in a fresh one, and schedules the frozen batch for a background flush.</p>
      <p>RocksDB can also flush earlier when total memtable memory or retained WAL bytes exceed their configured budgets. Flushing the oldest outstanding writes can free WAL files for deletion. <a href="https://github.com/facebook/rocksdb/wiki/MemTable#flush">RocksDB flush triggers</a></p>
      <p class="flush-trigger-example"></p>
    </details>
    <div class="merge-scroll"><svg class="merge-svg" aria-label="WAL, frozen memtable and sorted SSTable"></svg></div>
    <p class="merge-explain" aria-live="polite"></p>`;
  const renderControls = mountControl(panel.querySelector('.replay-controls'), ReplayControls);
  const status = panel.querySelector('.flush-status');
  const caption = panel.querySelector('.merge-explain');
  const scroll = panel.querySelector('.merge-scroll');
  const svg = select(scroll.querySelector('svg'));
  let current, timeline, sweep, logLabel, fileLabel;
  let next, last, selection, live;
  function controls() {
    const options = live ? [{value:'live',label:'Current flush'}] : [
      {value:'next',label:'Next flush · preview'},
      ...(last ? [{value:'last',label:'Last completed flush'}] : [])
    ];
    renderControls({label:'Flush to inspect', options, value:selection, live, empty:!current,
      phase:panel.dataset.phase, onPhase:name=>{stop();phase(name);}, onReplay:play, onChange:choose});
  }

  function stop() {
    timeline?.kill();
    sweep?.progress(1).kill();
  }

  function phase(name) {
    const installed = name !== 'freeze';
    const retired = name === 'retire';
    const filename = current.output?.name ?? 'the new SSTable';
    status.textContent = retired
      ? `The SSTable covers the frozen keys. Retire all ${current.log.length} entries in this WAL.`
      : installed ? `Install ${filename} in key order. The WAL is still available.`
      : 'Freeze the latest value for each key. The WAL still covers these writes.';
    logLabel.text(retired ? 'Retired · covered by SSTable' : 'Active · recovery log');
    fileLabel.text(installed ? current.output?.name ?? 'Installed in preview' : 'Awaiting installation');
    panel.dataset.phase = name;
    controls();
    svg.selectAll('.flush-output,.into-file').attr('visibility', installed ? 'visible' : 'hidden');
    svg.selectAll('.flush-output').attr('tabindex', installed ? 0 : -1);
    sweep?.progress(1).kill();
    if (!reduced() && !retired) {
      const paths = svg.selectAll(installed ? '.into-file' : '.into-memory').nodes();
      sweep = gsap.fromTo(paths, {
        strokeDasharray: i => paths[i].getTotalLength(),
        strokeDashoffset: i => paths[i].getTotalLength()
      }, {strokeDashoffset:0,duration:.42,stagger:{amount:.13},clearProps:'strokeDasharray,strokeDashoffset'});
    }
  }

  function play() {
    stop();
    if (reduced()) {phase('retire');return;}
    phase('freeze');
    timeline = gsap.timeline().call(()=>phase('install'),null,1.1).call(()=>phase('retire'),null,2.5);
  }

  function render(snapshot) {
    stop();
    current = snapshot;
    svg.selectAll('*').remove();
    caption.textContent = '';
    scroll.hidden = !snapshot;
    const keys = snapshot?.rows.length ?? 0;
    panel.querySelector('.flush-trigger-example').textContent = keys
      ? `This batch contains ${keys} distinct ${keys === 1 ? 'key' : 'keys'}. The sandbox flushes automatically at ${sandboxLimits.memtableBytes} bytes of keys and values. You can also flush this batch early.`
      : 'The sandbox needs at least one in-memory key for a flush. Write a key, then choose Flush.';
    controls();
    if (!snapshot) {
      status.textContent = 'The memtable is empty. Write a key to prepare another flush.';
      return;
    }
    const byKey = new Map(snapshot.rows.map((r,i)=>[r.key,{record:r,y:53+i*stepY}]));
    const summary = 'Select a record to follow the same key across the flush.';
    const diagram = recordDiagram(svg, key=>{
      svg.selectAll('[data-key]').classed('unrelated',function(){return key != null && this.dataset.key !== key;});
      const match = byKey.get(key)?.record;
      if (!match) {caption.textContent=summary;return;}
      const older = snapshot.log.filter(r=>r.key===key && r.seq!==match.seq);
      caption.textContent = `${key} = “${recordValue(match)}” ${seq(match.seq)} is the frozen version copied to disk.` +
        (older.length ? ' Earlier WAL versions superseded in memory: '+older.map(r=>seq(r.seq)+' “'+recordValue(r)+'”').join(', ')+'.' : '');
    });
    diagram.label(left,16,'Write-ahead log','merge-heading');
    diagram.label(middle,16,'Frozen memtable','merge-heading');
    diagram.label(right,16,'Sorted SSTable','merge-heading');
    logLabel = diagram.label(left,39,'','merge-filename');
    diagram.label(middle,39,'Latest value per key','merge-filename');
    fileLabel = diagram.label(right,39,'','merge-filename');
    snapshot.log.forEach((r,i)=>{
      const y = 53+i*stepY;
      const target = byKey.get(r.key);
      const superseded = r.seq !== target?.record.seq;
      const text = `${r.key} · ${recordValue(r)} ${seq(r.seq)}`;
      diagram.record(left,y,r,'flush-log'+(superseded?' superseded':''),text,
        'WAL · '+text+(!target?' · awaiting memtable':superseded?' · superseded in memory':''));
      if (!superseded) diagram.connect(left+rowWidth,y+rowH/2,middle,target.y+rowH/2,r.key,'into-memory');
    });
    const rows = snapshot.output?.rows ?? snapshot.rows;
    rows.forEach((r,i)=>{
      const y = 53+i*stepY;
      const fromY = byKey.get(r.key).y;
      const text = `${r.key} · ${recordValue(r)} ${seq(r.seq)}`;
      diagram.record(middle,fromY,r,'flush-memory',text,'Frozen memtable · '+text);
      diagram.record(right,y,r,'flush-output',text,'Sorted SSTable · '+text);
      diagram.connect(middle+rowWidth,fromY+rowH/2,right,y+rowH/2,r.key,'into-file');
    });
    const height = 61+Math.max(snapshot.log.length,rows.length)*stepY;
    svg.attr('viewBox',`0 0 ${svgWidth} ${height}`).attr('width',svgWidth).attr('height',height);
    caption.textContent=summary;
  }

  function choose(value) {
    selection = value;
    render(selection==='last' ? last : next);
    if(current) play();
  }
  return {
    show(plan, previous, mode) {
      live=false; next=plan; last=previous;
      choose(last && (mode==='last' || (!mode && !next)) ? 'last' : 'next');
    },
    live(snapshot, name) {
      if (current!==snapshot || name==='freeze') {
        live=true; selection='live';
        render(snapshot);
      }
      if(name==='retire'){
        live=false; next=null; last=snapshot; selection='last';
      }
      phase(name);
    },
    close:stop
  };
}
