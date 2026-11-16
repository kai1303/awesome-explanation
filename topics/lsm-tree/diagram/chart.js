import { bloomBits, keyMask } from '../bloom.js';
import { recordValue } from '../engine.js';
import { fileLabel, newestVersion } from '../compaction-planner.js';
import { Disclosure } from '../../../design-system/controls.jsx';
import { KeyPaging, mountControl } from '../controls.jsx';
// Ribbon geometry and measured DOM anchors adapted from Polo Club's
// Transformer Explainer, Sankey.svelte. See public/transformer-explainer-LICENSE.txt.
import { OperationInspector, StageInspector } from './stage-inspector.jsx';
import { flushView } from './flush.js';
import { compactionView } from './compaction.js';
import { select } from 'd3-selection';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const stages = {
  history: ['Write history', 'Sequence order', 'Each accepted write or delete creates a new version. Sequence numbers distinguish writes to the same key. The history remains visible after a log is retired.'],
  route: ['Write path', 'Log & flush', 'Unflushed records belong to the active write-ahead log. The disk branch shows versions that still belong to an installed SSTable. A discarded version ends in the history column.'],
  sources: ['Read sources', 'Memory & sorted tables', 'The memtable holds the latest value or tombstone per key. Each immutable disk run holds its own sorted rows. The newest runs appear first.'],
  lookup: ['Version lookup', 'Probe order', 'Each row is a key and each column is a read source. Scan from memory through the runs, newest first. The highest write sequence wins. A winning tombstone means the key is absent. Read a key to see the sources checked in order. A read stops once the remaining sources cannot contain a newer version.'],
  output: ['Visible values', 'Latest per key', 'Each row shows the winning key and value, its write sequence number, and the source that would serve it.']
};
const gradients = [['history','log'],['history','file'],['log','ram'],['file','file'],['ram','winner'],['file','winner'],['winner','winner']];
const fmtSeq = n => '#' + String(n).padStart(2,'0');
function element(tag, cls, content) {
  const el = document.createElement(tag);
  el.className = cls;
  if (content !== undefined) el.textContent = content;
  return el;
}
function rowsByKey(a,b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }

export function recordChart(root, onInspect, openBloom) {
  const svg = select(root.querySelector('svg'));
  const defs = svg.select('defs');
  for (const [a,b] of gradients) {
    const grad = defs.append('linearGradient').attr('id',a+'-'+b);
    grad.append('stop').attr('class', a).attr('stop-color', 'var(--ribbon)');
    grad.append('stop').attr('offset','100%').attr('class', b).attr('stop-color','var(--ribbon)');
  }
  let engine, expanded = null, focusedKey = null, keyPage = 0, runningStep = null;
  let lookup = null, selection = null;
  const renderInspector = mountControl(document.querySelector('#stage-inspection'), StageInspector);
  let anchors = new Map(), links = [], layout, reveal, sweep;
  const clip = defs.append('clipPath').attr('id','flow-reveal').attr('clipPathUnits','objectBoundingBox');
  const curtain = clip.append('rect').attr('width',1).attr('height',1).node();
  const pulses = svg.append('g').attr('class','pulses').attr('aria-hidden','true');
  const columns = {};
  for (const [id,[title,subtitle]] of Object.entries(stages)) {
    const col = element('section','column '+id);
    const head = element('div','heading');
    const renderHead = mountControl(head, Disclosure);
    const body = element('div','column-body');
    body.id = 'body-'+id;
    col.addEventListener('click', event => {
      if (event.target.closest('button, .operation-toggle, .operation-panel, .heading')) return;
      openAt(id, event.target);
    });
    body.addEventListener('keydown', event => {
      if (!event.target.matches('[data-anchor]:not(button)') || !['Enter',' '].includes(event.key)) return;
      event.preventDefault();
      openAt(id, event.target);
    });
    col.append(head,element('p','subtitle',subtitle),body);
    root.append(col);
    columns[id]={col,head,body,renderHead};
  }

  const client = root.querySelector('#sandbox-controls');
  const clientStatus = client.querySelector('#client-status');
  const exchange = svg.append('g').attr('aria-hidden','true').attr('visibility','hidden');
  const connection = exchange.append('path').attr('class','client-link');
  const packet = exchange.append('circle').attr('class','client-packet').attr('r',4);
  let transit = null;
  let flight = null;

  function positionExchange() {
    if (!transit) return;
    const box = root.getBoundingClientRect();
    const clientHead = client.querySelector('h2').getBoundingClientRect();
    const stageHead = transit.column.head.getBoundingClientRect();
    const from = transit.reply ? stageHead : clientHead;
    const to = transit.reply ? clientHead : stageHead;
    const x = from.left + from.width / 2 - box.left;
    const end = to.left + to.width / 2 - box.left;
    const y = from.top - box.top - 2;
    const endY = to.top - box.top - 2;
    const lane = Math.min(y,endY) - 18;
    const dir = Math.sign(end-x);
    connection.attr('d', `M${x},${y} Q${x},${lane} ${x+dir*18},${lane} H${end-dir*18} Q${end},${lane} ${end},${endY}`);
    const path = connection.node();
    const length = path.getTotalLength();
    const point = path.getPointAtLength(length * transit.progress);
    packet.attr('cx',point.x).attr('cy',point.y);
    connection.attr('stroke-dasharray',length).attr('stroke-dashoffset',length*(1-transit.progress));
  }

  function clearExchange() {
    flight?.kill();
    flight = null;
    transit?.column.col.classList.remove('client-endpoint');
    transit = null;
    client.classList.remove('client-endpoint');
    exchange.attr('visibility','hidden');
  }

  function clientExchange(stage, reply, caption) {
    clearExchange();
    const column = columns[stage];
    transit = {column, reply, progress:reduced() ? 1 : 0};
    clientStatus.dataset.phase = reply ? 'response' : 'request';
    clientStatus.textContent = caption;
    client.classList.add('client-endpoint');
    column.col.classList.add('client-endpoint');
    exchange.attr('visibility','visible');
    positionExchange();
    if (reduced()) return;
    flight = gsap.timeline().to(transit,{progress:1, duration:.7,ease:'power1.inOut',onUpdate:positionExchange});
    return flight;
  }

  let maintenance = null;
  const maintenanceFrame = document.querySelector('#maintenance-frame');
  const phaseNames = {
    flush:{freeze:'Freeze memtable', install:'Install SSTable', retire:'Retire WAL'},
    compact:{compare:'Compare input files', install:'Install merged file'}
  };

  function showMaintenance() {
    maintenanceFrame.hidden = !maintenance;
    if (!maintenance) return;
    const {operation, phase, plan, trigger, text} = maintenance;
    const title = operation === 'flush' ? 'Flush' : 'Compaction';
    maintenanceFrame.querySelector('strong').textContent = [title,phaseNames[operation][phase]].filter(Boolean).join(' · ');
    const inputs = plan?.output && plan.inputs.map(t=>t.name).join(' + ') + ' → ' + plan.output.name + '.';
    const reason = plan && trigger && phase === 'compare' ? 'Automatic compaction.' : trigger;
    maintenanceFrame.querySelector('span').textContent = [reason, inputs, text].filter(Boolean).join(' ');
  }

  function markGroup(group, label) {
    group.classList.add('maintenance-group');
    group.append(element('span','maintenance-label',label));
  }

  // Copy the visible winning records from their previous positions into the installed file.
  function captureInputs(step) {
    const positions = new Map();
    if (step?.phase !== 'install' || step.operation !== maintenance?.operation ||
        !['compare','freeze'].includes(maintenance.phase) || reduced()) return positions;
    for (const r of step.flush?.output?.rows ?? step.plan.output.rows) {
      const source = anchors.get((step.flush ? 'm' : 'd') + r.seq);
      if (source) positions.set(r.seq, source.getBoundingClientRect());
    }
    return positions;
  }
  let installTimeline;
  const transfer = element('small','transfer-status');
  maintenanceFrame.append(transfer);

  function animateInstall(positions) {
    if (!positions.size) return;
    const output = maintenance.flush?.output ?? maintenance.plan.output;
    const sources = new Map(maintenance.plan?.inputs.flatMap(t => t.rows.map(r => [r.seq, t.name])));
    installTimeline = gsap.timeline({onUpdate:wires});
    let index = 0;
    for (const [seq, from] of positions) {
      const dest = anchors.get('d'+seq);
      if (!dest) continue;
      const to = dest.getBoundingClientRect();
      const origin = sources.get(seq) ?? 'Memtable';
      const message = `${dest.dataset.key} ${fmtSeq(seq)} · ${origin} → ${output.name}`;
      const start = index++ * .38;
      installTimeline.call(() => { transfer.textContent = message; }, [], start);
      installTimeline.fromTo(dest,
        {x:from.left-to.left, y:from.top-to.top, opacity:.45, zIndex:2, outline:'2px solid #b77528'},
        {x:0, y:0, opacity:1, duration:.58, ease:'power2.inOut', clearProps:'transform,opacity,zIndex,outline'}, start);
    }
    installTimeline.call(() => {
      transfer.textContent = `${output.rows.length} records installed in ${output.name}.`;
    });
    return installTimeline;
  }
  function addDetail(id, title, owner, createView, description) {
    const toggle = element('div','operation-toggle');
    const renderToggle = mountControl(toggle, Disclosure);
    const panel = element('div','operation-panel');
    panel.id=id+'-detail';
    const host = element('div','operation-inspection');
    host.id = id + '-popover';
    host.hidden = true;
    document.querySelector('#operation-inspections').append(host);
    columns[owner].body.before(toggle);
    mountControl(host, OperationInspector)({title, panel, close:closeInspector});
    return { title, owner, toggle, panel, host, renderToggle, view:createView(panel), note:[title,'',description] };
  }
  const details = {
    compact:addDetail('compact','Compaction','sources',compactionView,
      'Read the old SSTables by key. The newest disk version continues into the merged SSTable. Older versions stop at Drop. Unflushed records stay in memory.'),
    flush:addDetail('flush','Flush','route',flushView,
      'Follow the latest value of each frozen key into a sorted file. Installing that file makes it safe to retire the covered WAL.')
  };

  function wires() {
    positionExchange();
    const box = root.getBoundingClientRect();
    const positions = new Map();
    for (const [id,node] of anchors) positions.set(id,node.getBoundingClientRect());
    const paths = svg.select('g').selectAll('path').data(links,l=>l.a+'>'+l.b).join('path')
      .attr('fill',l=>'url(#'+l.color+')').attr('data-kind',l=>l.color)
      .attr('d', l=>{
        const a=positions.get(l.a), b=positions.get(l.b);
        const x=a.right-box.left, X=b.left-box.left, y=a.top-box.top, Y=b.top-box.top;
        const bend=Math.min(84,Math.max(0,(X-x)*.6));
        return `M${x},${y} C${x+bend},${y} ${X-bend},${Y} ${X},${Y} L${X},${Y+b.height} C${X-bend},${Y+b.height} ${x+bend},${y+a.height} ${x},${y+a.height} Z`;
      });
    function carriesStep(l) {
      if (!runningStep || runningStep.key && runningStep.key !== l.key) return false;
      if (runningStep.seq && l.seq !== runningStep.seq) return false;
      if (runningStep.stage === 'lookup') return l.b.startsWith('q') && l.seq === runningStep.winningSeq;
      if (runningStep.stage === 'output') return l.b.startsWith('o');
      if (runningStep.source) return false;
      return l.stages.at(-1) === runningStep.stage;
    }
    const active = paths.nodes().filter(p => carriesStep(p.__data__));
    pulses.selectAll('path').data(active, p => p.__data__.a+'>'+p.__data__.b).join('path')
      .attr('d',p=>p.getAttribute('d')).attr('fill',p=>p.getAttribute('fill'))
      .attr('clip-path','url(#flow-reveal)');
    paths.classed('muted',l=>Boolean((focusedKey && focusedKey!==l.key) || (stages[expanded] && !l.stages.includes(expanded))))
      .classed('lit',l=>l.key===focusedKey);
  }
  function link(a,b,color,key,stages) {
    if (anchors.has(a) && anchors.has(b)) links.push({a,b,color,key,stages,seq:Number(a.slice(1))});
  }
  function group(parent, label, kind) {
    const g=element('div','group '+kind);
    g.append(element('div','group-name',label));
    parent.append(g);
    return g;
  }
  function row(parent, id, key, kind, label, extra) {
    const r=element('div','record '+kind);
    r.tabIndex=0; r.dataset.key=key; r.dataset.anchor=id;
    r.setAttribute('role','button');
    r.setAttribute('aria-haspopup','dialog');
    r.setAttribute('aria-label',label+(extra?' · '+extra:''));
    r.title=r.getAttribute('aria-label');
    const pin=element('i','pin');
    r.append(pin,element('span','record-label',label));
    if (extra) r.append(element('span','extra',extra));
    parent.append(r);
    anchors.set(id,r);
    return r;
  }
  function highlight(key) {
    focusedKey=key;
    for (const node of root.querySelectorAll('[data-key]')) node.classList.toggle('faint',key!==null && node.dataset.key!==key);
    wires();
  }
  // A playback frame can move a row beneath a stationary pointer.
  let pointer = null;
  function interactionKey(target, focus = document.activeElement) {
    const hovered = target?.closest?.('[data-key]');
    const focused = focus?.closest?.('[data-key]');
    return (root.contains(hovered) ? hovered : root.contains(focused) ? focused : null)?.dataset.key ?? null;
  }
  function syncHighlight(key) {
    if (key !== focusedKey) highlight(key);
  }
  function restoreInteraction(focusedAnchor) {
    anchors.get(focusedAnchor)?.focus({preventScroll:true});
    const target = pointer && document.elementFromPoint(pointer.x, pointer.y);
    highlight(interactionKey(target));
  }
  root.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    pointer = {x:event.clientX, y:event.clientY};
    syncHighlight(interactionKey(event.target));
  });
  root.addEventListener('pointerleave', () => { pointer=null; syncHighlight(interactionKey(null)); });
  root.addEventListener('focusin', event => syncHighlight(interactionKey(event.target)));
  root.addEventListener('focusout', event => syncHighlight(interactionKey(pointer && document.elementFromPoint(pointer.x,pointer.y), event.relatedTarget)));

  const renderPaging = mountControl(document.querySelector('#paging'), KeyPaging);
  function updateDisclosures() {
    for (const [id, {body, renderHead}] of Object.entries(columns)) {
      renderHead({ label:stages[id][0], controls:body.id+' stage-inspection', expanded:expanded===id,
        variant:'ghost', onClick:()=>inspect(expanded===id?null:id) });
    }
    for (const [id, detail] of Object.entries(details)) {
      detail.renderToggle({ label:detail.title, controls:detail.host.id, expanded:expanded===id,
        disabled:engine.status!=='online', variant:'secondary', onClick:()=>inspect(expanded===id?null:id) });
    }
  }
  function draw() {
    installTimeline?.progress(1).kill();
    installTimeline = null;
    const keys=[...new Set(engine.history.map(r=>r.key))].sort();
    const focusedAnchor = document.activeElement?.dataset.anchor;
    const size=6, pages=Math.max(1,Math.ceil(keys.length/size));
    keyPage=Math.min(keyPage,pages-1);
    const shown=keys.slice(keyPage*size,(keyPage+1)*size);
    const lookupKeys = lookup && !keys.includes(lookup.key) ? [...shown, lookup.key] : shown;
    const filter=r=>shown.includes(r.key);
    renderPaging({page:keyPage, pages, range:`Keys ${keyPage*size+1}–${Math.min(keys.length,(keyPage+1)*size)} of ${keys.length}`,
      change: delta => { keyPage+=delta; draw(); }});
    anchors=new Map();links=[];
    Object.values(columns).forEach(({body})=>body.replaceChildren());
    const history=columns.history.body, route=columns.route.body, sources=columns.sources.body;
    const recent=engine.history.filter(filter);
    const log=engine.log.filter(filter);
    // Keep the whole transfer visible even when the history and lookup are paginated.
    const {flush, plan, phase} = maintenance ?? {};
    const involved = new Set([...(plan?.inputs ?? []), plan?.output, flush?.output]);
    const runs=engine.tables.map(t=>({...t,rows:involved.has(t) ? t.rows : t.rows.filter(filter)}));
    const memory=[...engine.memory.values()].filter(r=>flush || filter(r)).sort(rowsByKey);
    const hGroup=group(history,'Mutation sequence','history');
    const locations=new Map(runs.flatMap(table=>table.rows.map(r=>[r.seq,table.name])));
    for(const r of log) locations.set(r.seq,'Active WAL');
    for(const r of recent) {
      const received=runningStep?.stage==='history' && runningStep.seq===r.seq;
      row(hGroup,'h'+r.seq,r.key,'history',fmtSeq(r.seq)+' '+(r.operation && r.operation !== 'write' ? r.operation.toUpperCase()+' ' : '')+r.key+(r.operation==='delete' ? '' : ' = '+r.value),
        locations.get(r.seq) ?? (received?'Received':'Superseded'));
    }
    const logGroup=group(route,'Active WAL','log');
    if (flush) markGroup(logGroup,phase==='retire' ? 'Covered WAL retired' : 'Retained until install');
    for(const r of log) {
      row(logGroup,'l'+r.seq,r.key,'log',fmtSeq(r.seq),r.key+' · '+recordValue(r));
      link('h'+r.seq,'l'+r.seq,'history-log',r.key,['history','route']);
    }
    if(!log.length) logGroup.append(element('small','empty','Empty log'));
    const flushed=group(route,'Versions still on disk','file');
    const diskRows=runs.flatMap(t=>t.rows).sort((a,b)=>a.seq-b.seq);
    for(const r of diskRows) {
      row(flushed,'f'+r.seq,r.key,'file',fmtSeq(r.seq),r.key+' · '+recordValue(r));
      link('h'+r.seq,'f'+r.seq,'history-file',r.key,['history','route']);
    }
    if(!diskRows.length) flushed.append(element('small','empty','No versions on disk'));
    const ram=group(sources,'Memtable','ram');
    if (flush) markGroup(ram,phase==='retire' ? 'Cleared after install' : 'Frozen batch');
    ram.classList.toggle('probing', runningStep?.source === 'RAM');
    for(const r of memory) {
      row(ram,'m'+r.seq,r.key,'ram',r.operation==='delete' ? r.key+' · deleted' : r.key,recordValue(r)+' · '+fmtSeq(r.seq));
      link('l'+r.seq,'m'+r.seq,'log-ram',r.key,['route','sources']);
    }
    if(!memory.length) ram.append(element('small','empty',engine.status==='crashed'?'Cleared by crash':'No matching keys'));
    const dropped = new Set(plan?.groups.flatMap(g=>g.versions.slice(1).map(r=>r.seq)));
    for(const t of runs) {
      const original=engine.tables.find(table=>table.name===t.name);
      const file=group(sources,engine.policy==='all'?t.name:fileLabel(original,engine.policy),'file');
      file.dataset.source=t.name;
      const probe = lookup?.filters.get(t.name);
      const bloom = element('button','file-bloom');
      bloom.type = 'button';
      const anchor = 'bloom-' + t.name;
      bloom.dataset.anchor = anchor;
      anchors.set(anchor, bloom);
      bloom.setAttribute('aria-haspopup', 'dialog');
      bloom.onclick = () => {
        if (expanded) inspect(null);
        openBloom(original, lookup, () => anchors.get(anchor)?.focus({preventScroll:true}));
      };
      const label = probe === 'negative' ? 'Skip file · absent' : probe === 'maybe' ? 'Check file · possible'
        : lookup?.winner ? 'Unused · read resolved' : lookup ? 'Waiting' : '';
      bloom.append(element('span','bloom-title','Bloom filter'));
      const bits = element('span','bloom-bits');
      bits.setAttribute('aria-hidden','true');
      const mask = probe ? keyMask(lookup.key) : 0;
      for (let i = 0; i < bloomBits; i++) {
        const bit = element('i', 'bloom-bit');
        bit.classList.toggle('set', Boolean(t.bloom & (1 << i)));
        bit.classList.toggle('tested', Boolean(mask & (1 << i)));
        bits.append(bit);
      }
      bloom.append(bits);
      if (label) bloom.append(element('span','bloom-decision',label));
      bloom.setAttribute('aria-label', [t.name, 'Bloom filter', lookup?.key, label].filter(Boolean).join(' · '));
      file.append(bloom);
      const input = phase==='compare' && plan?.inputs.includes(original);
      if (input) markGroup(file,'Merge input');
      else if (t.name === (plan?.output ?? flush?.output)?.name) markGroup(file,'Installed output');
      else if (plan?.untouched.includes(original)) file.append(element('span','maintenance-label retained','Outside merge'));
      file.classList.toggle('probing', runningStep?.source === t.name);
      for(const r of t.rows) {
        const record = row(file,'d'+r.seq,r.key,'file',r.operation==='delete' ? r.key+' · deleted' : r.key,recordValue(r)+' · '+fmtSeq(r.seq));
        if (input) {
          const decision = (dropped.has(r.seq) ? 'Drop ' : 'Keep ') + fmtSeq(r.seq);
          record.append(element('span','merge-decision',decision));
          record.setAttribute('aria-label',record.title+' · '+decision);
        }
        link('f'+r.seq,'d'+r.seq,'file-file',r.key,['route','sources']);
      }
    }
    updateDisclosures();
    updateInspector();
    if (engine.status !== 'online') {
      const message = engine.status === 'crashed' ? 'Offline until restart' : 'Waiting for WAL replay';
      columns.lookup.body.append(element('p','empty',message));
      columns.output.body.append(element('p','empty',message));
      const replay = runningStep?.replay;
      if (replay) {
        for (const prefix of ['l','m']) anchors.get(prefix+replay.seq)?.classList.add('replaying');
      }
      restoreInteraction(focusedAnchor);
      return;
    }
    const sourceList=[{name:'RAM',rows:memory},...runs];
    const matrix=element('div','matrix');
    const labels=element('div','matrix-labels');
    for(const source of sourceList) {
      const label=element('span','',source.name==='RAM'?'RAM':'SST '+Number(source.name.slice(4,-4)));
      label.title=source.name==='RAM'?'Memtable':source.name;
      labels.append(label);
    }
    matrix.append(labels); columns.lookup.body.append(matrix);
    matrix.classList.toggle('has-trace',Boolean(lookup));
    const result=group(columns.output.body,'Winning version','winner');
    for(const key of lookupKeys) {
      const traced = lookup?.key === key;
      const cells=sourceList.map(s=>s.rows.find(r=>r.key===key));
      const latest=newestVersion(cells);
      const first=cells.indexOf(latest);
      const line=element('div','matrix-row');line.tabIndex=0;line.dataset.key=key;
      line.append(element('span','matrix-key',key));
      const descriptions=[];
      const winner = traced ? lookup.winner : cells[first];
      cells.forEach((r,i)=>{
        const dot=element('span','cell '+(!r?'miss':i===first?'hit':'older'));
        dot.dataset.source=sourceList[i].name;
        dot.title=sourceList[i].name+' · '+key+' · '+(r?recordValue(r)+' '+fmtSeq(r.seq):'absent');
        dot.textContent=r?fmtSeq(r.seq):'–';
        dot.classList.toggle('probing-cell',runningStep?.source === sourceList[i].name && runningStep?.key === key);
        if (traced) {
          const source = sourceList[i].name;
          const outcome = lookup.filters.get(source) === 'negative' ? 'Filtered' : lookup.checked.has(source) ? (r ? 'Hit' : 'Miss') : (winner ? 'Skipped' : 'Waiting');
          dot.className = 'cell probe ' + outcome.toLowerCase();
          dot.textContent = outcome;
          dot.title = source + ' · ' + outcome + (outcome === 'Hit' ? ' · ' + recordValue(r) + ' ' + fmtSeq(r.seq) : '');
        }
        descriptions.push(dot.title);
        line.append(dot);
      });
      const answer=element('span','decision',winner?.operation==='delete'?'Not found':winner?'→ '+winner.value:(traced && lookup.complete?'Not found':'Pending'));line.append(answer);
      const a='q'+key; anchors.set(a,line);line.dataset.anchor=a;
      line.setAttribute('role','button');
      line.setAttribute('aria-haspopup','dialog');
      line.setAttribute('aria-label',key+' · '+descriptions.join(', '));
      matrix.append(line);
      cells.forEach((r,i)=>{if(r && (!traced || r===winner)) link((i?'d':'m')+r.seq,a,i?'file-winner':'ram-winner',key,['sources','lookup'])});
      if(winner) {
        const value=row(result,'o'+key,key,'winner',winner.operation==='delete' ? key+' · Not found' : key+' = '+winner.value,(winner.operation==='delete' ? 'Tombstone ' : '')+fmtSeq(winner.seq)+' · '+sourceList[first].name);
        const older=cells.filter(r=>r && r!==winner).map(r=>fmtSeq(r.seq)+' '+recordValue(r));
        value.append(element('span','version-detail',older.length?'Older: '+older.join(', '):'Only stored version'));
        link(a,'o'+key,'winner-winner',key,['lookup','output']);
      } else if (traced && lookup.complete) {
        row(result,'o'+key,key,'winner',key+' · Not found');
      }
    }
    matrix.style.setProperty('--sources',sourceList.length);
    columns.lookup.body.append(element('div','matrix-keyline','● Newest version　◐ Older　○ Absent'));
    restoreInteraction(focusedAnchor);
  }

  function animateStep() {
    sweep?.kill();
    if (!runningStep || reduced()) {curtain.setAttribute('width','1');return;}
    sweep=gsap.fromTo(curtain,{attr:{width:0}},{attr:{width:1},duration:.48,ease:'power2.inOut'});
  }

  function openAt(id, target) {
    const row = target.closest('[data-anchor]');
    const anchor = row?.dataset.anchor;
    const seq = anchor && ['history','route','sources'].includes(id) ? Number(anchor.slice(1)) : undefined;
    const source = target.closest('[data-source]')?.dataset.source ??
      (id === 'sources' ? row?.closest('.group')?.querySelector('.group-name')?.textContent : undefined);
    const next = row ? {anchor, key:row.dataset.key, seq, source:source === 'Memtable' ? 'RAM' : source} : null;
    if (expanded !== id) inspect(id, undefined, next);
    else { selection = next; updateInspector(); }
  }
  function closeInspector() {
    const trigger = anchors.get(selection?.anchor) ?? (details[expanded]?.toggle ?? columns[expanded]?.head)?.querySelector('button');
    inspect(null);
    trigger?.focus({preventScroll:true});
  }
  function updateInspector() {
    const stage = stages[expanded] && expanded;
    renderInspector({stage, title:stages[expanded]?.[0], selection, engine, lookup, step:runningStep,
      close:closeInspector, selectSource:source => { selection = {...selection, source}; updateInspector(); }});
  }
  function inspect(id, mode, nextSelection = null) {
    selection = nextSelection;
    layout?.progress(1); reveal?.progress(1);
    const items=Object.values(columns).map(c=>c.col);
    const before=Flip.getState(items);
    const detail=details[id];
    for(const [key, item] of Object.entries(details)) {
      const active = key===id;
      item.view.close();
      item.host.hidden=!active;
    }
    if(id==='compact') {
      if(maintenance?.plan) detail.view.live(maintenance);
      else detail.view.show(engine.planCompaction(),engine.lastCompaction,mode,engine.policy);
    }
    if(id==='flush') {
      if(maintenance?.flush) detail.view.live(maintenance.flush,maintenance.phase);
      else detail.view.show(engine.planFlush(),engine.lastFlush,mode);
    }
    expanded=id;
    updateDisclosures();
    updateInspector();
    root.classList.toggle('inspecting',Boolean(stages[id]));
    for(const [key,{col}] of Object.entries(columns)) {
      col.classList.toggle('open',key===id);
    }
    onInspect(detail?.note ?? stages[id] ?? null);
    if (detail && mode !== 'frame') detail.host.querySelector('h2')?.focus({preventScroll:true});
    if(!reduced()) {
      layout=Flip.from(before,{duration:.5,ease:'power2.inOut',onUpdate:wires,onComplete:wires});
      if(id && !detail) {
        const parts=columns[id].body.querySelectorAll(id==='lookup'?'.cell,.decision':'.extra');
        if(parts.length) reveal=gsap.fromTo(parts,{opacity:0},{opacity:1,delay:.42,duration:.28,stagger:{amount:.24}});
      }
    }
    wires();
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && expanded && !e.target.closest('.command-editor') && !document.querySelector('[role=combobox][aria-expanded=true]'))closeInspector()});
  document.addEventListener('click',e=>{if(expanded && !e.target.closest('.column, header, #policy-controls, .command-editor, #sandbox-controls, #lesson, #paging, #stage-inspection, #operation-inspections, [role=listbox], [role=option]'))inspect(null)});
  const observer=new ResizeObserver(wires);
  observer.observe(root);
  Object.values(columns).forEach(c=>observer.observe(c.col));
  observer.observe(client);
  return {
    clientExchange,
    showFrame(frame) {
      const step = frame.detail?.step ?? frame.detail;
      this.render(frame.engine, frame.highlight, frame.lookup,
        step && {...step, operation:frame.detail.operation, text:frame.caption});
      if (details[expanded] && !step) inspect(engine.status === 'online' ? expanded : null, 'frame');
    },
    render(state,step=null,readTrace=null,nextMaintenance=null) {
      clearExchange();
      if (step?.clientStatus) {
        clientStatus.dataset.phase = 'processing';
        clientStatus.textContent = step.clientStatus;
      }
      const positions = captureInputs(nextMaintenance);
      const changed = maintenance !== nextMaintenance;
      maintenance = nextMaintenance;
      showMaintenance();
      const startingRead = readTrace && lookup !== readTrace;
      const followKey = step?.key && (startingRead || runningStep?.key !== step.key);
      lookup=readTrace;
      engine=state; runningStep=step;
      for(const [id,c] of Object.entries(columns)) c.col.classList.toggle('playing',id===step?.stage);
      if (followKey) {
        const index=[...new Set(engine.history.map(r=>r.key))].sort().indexOf(step.key);
        if (index>=0) keyPage=Math.floor(index/6);
      }
      draw(); animateStep();
      if (changed) transfer.textContent = '';
      const installation = animateInstall(positions);
      if (changed && nextMaintenance?.flush && expanded==='flush') details.flush.view.live(maintenance.flush,maintenance.phase);
      if (changed && nextMaintenance?.plan && expanded==='compact') details.compact.view.live(maintenance);
      const viewport = root.parentElement;
      if (client.hidden && !expanded && viewport.scrollWidth > viewport.clientWidth) {
        if (startingRead) viewport.scrollLeft = columns.lookup.col.offsetLeft - 16;
        if (changed && ['freeze','compare','install'].includes(maintenance?.phase)) {
          const target = maintenance.phase === 'freeze' ? columns.route.col : columns.sources.col;
          const box = target.getBoundingClientRect();
          const visible = viewport.getBoundingClientRect();
          if (box.left < visible.left || box.right > visible.right) viewport.scrollLeft = target.offsetLeft - 16;
        }
      }
      return installation;
    },
    reset(){clearExchange();delete clientStatus.dataset.phase;clientStatus.textContent='SQL requests and results';maintenance=null;if(expanded)inspect(null);keyPage=0;focusedKey=null;}
  };
}
