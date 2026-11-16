import { select } from 'd3-selection';
import { gsap } from 'gsap';
import { recordDiagram, seq, stepY, rowH, left, middle, right, rowWidth, svgWidth } from './record-diagram.js';

const phases = ['freeze', 'install', 'retire'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function flushView(panel) {
  panel.innerHTML = `
    <div class="merge-tools">
      <select aria-label="Flush to inspect"></select><button type="button" class="replay">↻ Replay</button>
    </div>
    <div class="flush-phases" aria-label="Flush steps">
      <button type="button" data-phase="freeze">Freeze memtable</button><span aria-hidden="true">→</span>
      <button type="button" data-phase="install">Install SSTable</button><span aria-hidden="true">→</span>
      <button type="button" data-phase="retire">Retire WAL</button>
    </div>
    <p class="flush-status" role="status"></p>
    <div class="merge-scroll"><svg class="merge-svg" aria-label="WAL, frozen memtable and sorted SSTable"></svg></div>
    <p class="merge-explain" aria-live="polite"></p>`;
  const picker = panel.querySelector('select');
  const replay = panel.querySelector('.replay');
  const phaseButtons = [...panel.querySelectorAll('[data-phase]')];
  const status = panel.querySelector('.flush-status');
  const caption = panel.querySelector('.merge-explain');
  const scroll = panel.querySelector('.merge-scroll');
  const svg = select(scroll.querySelector('svg'));
  let current, timeline, sweep, logLabel, fileLabel;
  let next, last;

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
    phaseButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.phase === name)));
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

  function render(snapshot, live=false) {
    stop();
    current = snapshot;
    svg.selectAll('*').remove();
    caption.textContent = '';
    scroll.hidden = !snapshot;
    panel.querySelector('.flush-phases').hidden = !snapshot;
    replay.disabled = !snapshot || live;
    picker.disabled = live;
    phaseButtons.forEach(button=>button.disabled=live);
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
      caption.textContent = `${key} = “${match.value}” ${seq(match.seq)} is the frozen version copied to disk.` +
        (older.length ? ' Earlier WAL versions superseded in memory: '+older.map(r=>seq(r.seq)+' “'+r.value+'”').join(', ')+'.' : '');
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
      const superseded = r.seq !== target.record.seq;
      const text = `${r.key} · ${r.value} ${seq(r.seq)}`;
      diagram.record(left,y,r,'flush-log'+(superseded?' superseded':''),text,
        'WAL · '+text+(superseded?' · superseded in memory':''));
      if (!superseded) diagram.connect(left+rowWidth,y+rowH/2,middle,target.y+rowH/2,r.key,'into-memory');
    });
    const rows = snapshot.output?.rows ?? snapshot.rows;
    rows.forEach((r,i)=>{
      const y = 53+i*stepY;
      const fromY = byKey.get(r.key).y;
      const text = `${r.key} · ${r.value} ${seq(r.seq)}`;
      diagram.record(middle,fromY,r,'flush-memory',text,'Frozen memtable · '+text);
      diagram.record(right,y,r,'flush-output',text,'Sorted SSTable · '+text);
      diagram.connect(middle+rowWidth,fromY+rowH/2,right,y+rowH/2,r.key,'into-file');
    });
    const height = 61+Math.max(snapshot.log.length,rows.length)*stepY;
    svg.attr('viewBox',`0 0 ${svgWidth} ${height}`).attr('width',svgWidth).attr('height',height);
    caption.textContent=summary;
  }

  function choose() {
    render(picker.value==='last' ? last : next);
    if(current) play();
  }
  replay.onclick=play;
  picker.onchange=choose;
  phaseButtons.forEach(button=>button.onclick=()=>{stop();phase(button.dataset.phase);});
  return {
    show(plan, previous, mode) {
      next=plan;last=previous;
      picker.replaceChildren(new Option('Next flush · preview','next'));
      if(last) picker.add(new Option('Last completed flush','last'));
      picker.value = mode==='last' && last || !mode && !next && last ? 'last' : 'next';
      choose();
    },
    live(snapshot, name) {
      if (current!==snapshot || name==='freeze') {
        picker.replaceChildren(new Option('Current flush','live'));
        render(snapshot,true);
      }
      phase(name);
      if(name==='retire'){
        next=null;last=snapshot;
        picker.replaceChildren(new Option('Last completed flush','last'));
        replay.disabled=false;picker.disabled=false;
        phaseButtons.forEach(button=>button.disabled=false);
      }
    },
    close:stop
  };
}
