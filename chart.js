// Ribbon geometry and measured DOM anchors adapted from Polo Club's
// Transformer Explainer, Sankey.svelte. See public/transformer-explainer-LICENSE.txt.
import { flushView } from './flush.js';
import { compactionView } from './compaction.js';
import { select } from 'd3-selection';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const stages = {
  history: ['Write history', 'Sequence order', 'Each row is one PUT request. Sequence numbers distinguish writes to the same key. The history remains visible after a log is retired.'],
  route: ['Write path', 'Log & flush', 'Unflushed records belong to the active write-ahead log. The flushed branch traces versions that have been installed in a sorted run. A discarded version ends in the history column.'],
  sources: ['Read sources', 'Memory & sorted tables', 'The memtable exposes one current value per key. Each immutable disk run holds its own sorted rows. The newest runs appear first.'],
  lookup: ['Version lookup', 'Probe order', 'Each row is a key and each column is a read source. Scan from memory through the runs, newest first. The first filled dot wins. Later matches are older versions.'],
  output: ['Visible values', 'Latest per key', 'Each bar shows the value a read would return. Its length is the winning sequence number relative to the latest write in this example.']
};
const colors = {history:'#9ca3af',log:'#629afe',ram:'#30b990',file:'#f0a452',winner:'#9365eb'};
const gradients = [['history','log'],['history','file'],['log','ram'],['file','file'],['ram','winner'],['file','winner'],['winner','winner']];
const fmtSeq = n => '#' + String(n).padStart(2,'0');
function element(tag, cls, content) {
  const el = document.createElement(tag);
  el.className = cls;
  if (content !== undefined) el.textContent = content;
  return el;
}
function rowsByKey(a,b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }

export function recordChart(root, onInspect) {
  const svg = select(root.querySelector('svg'));
  const defs = svg.select('defs');
  for (const [a,b] of gradients) {
    const grad = defs.append('linearGradient').attr('id',a+'-'+b);
    grad.append('stop').attr('stop-color', colors[a]);
    grad.append('stop').attr('offset','100%').attr('stop-color',colors[b]);
  }
  let engine, expanded = null, focusedKey = null, keyPage = 0, runningStep = null;
  let anchors = new Map(), links = [], layout, reveal, sweep;
  const clip = defs.append('clipPath').attr('id','flow-reveal').attr('clipPathUnits','objectBoundingBox');
  const curtain = clip.append('rect').attr('width',1).attr('height',1).node();
  const pulses = svg.append('g').attr('class','pulses').attr('aria-hidden','true');
  const columns = {};
  for (const [id,[title,subtitle]] of Object.entries(stages)) {
    const col = element('section','column '+id);
    const head = element('button','heading');
    head.append(element('strong','',title),element('span','zoom','⊕'));
    head.setAttribute('aria-expanded','false');
    head.setAttribute('aria-controls','body-'+id);
    head.addEventListener('click',()=>inspect(expanded === id ? null : id));
    const body = element('div','column-body');
    body.id = 'body-'+id;
    body.addEventListener('click', () => { if (expanded !== id) inspect(id); });
    col.append(head,element('p','subtitle',subtitle),body);
    root.append(col);
    columns[id]={col,head,body};
  }

  let liveFlush = null;
  function addDetail(id, title, owner, createView, description) {
    const toggle = element('button',id+'-toggle operation-toggle',title+' ⊕');
    const panel = element('div','operation-panel');
    panel.id=id+'-detail';
    panel.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls',panel.id);
    columns[owner].body.before(toggle,panel);
    toggle.onclick=()=>inspect(expanded===id?null:id);
    return { title, owner, toggle, panel, view:createView(panel), note:[title,'',description] };
  }
  const details = {
    compact:addDetail('compact','Compaction','sources',compactionView,
      'Read the old SSTables by key. The newest disk version continues into the merged SSTable. Older versions stop at Drop. Unflushed records stay in memory.'),
    flush:addDetail('flush','Flush','route',flushView,
      'Follow the latest value of each frozen key into a sorted file. Installing that file makes it safe to retire the covered WAL.')
  };

  function wires() {
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
    paths.classed('muted',l=>Boolean((focusedKey && focusedKey!==l.key) || (expanded && !l.stages.includes(expanded))))
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
    r.tabIndex=0; r.dataset.key=key;
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
  root.addEventListener('pointerover',e=>{const row=e.target.closest('[data-key]'); if(row) highlight(row.dataset.key)});
  root.addEventListener('pointerout',e=>{if(e.target.closest('[data-key]') && !e.relatedTarget?.closest?.('[data-key]')) highlight(null)});
  root.addEventListener('focusin',e=>{if(e.target.dataset.key)highlight(e.target.dataset.key)});
  root.addEventListener('focusout',()=>highlight(null));

  function draw() {
    const keys=[...new Set(engine.history.map(r=>r.key))].sort();
    const size=6, pages=Math.max(1,Math.ceil(keys.length/size));
    keyPage=Math.min(keyPage,pages-1);
    const shown=keys.slice(keyPage*size,(keyPage+1)*size);
    const filter=r=>shown.includes(r.key);
    document.querySelector('#paging').hidden=pages===1;
    document.querySelector('#page').textContent=`Keys ${keyPage*size+1}–${Math.min(keys.length,(keyPage+1)*size)} of ${keys.length}`;
    document.querySelector('#prev').disabled=keyPage===0;
    document.querySelector('#next').disabled=keyPage===pages-1;
    anchors=new Map();links=[];
    Object.values(columns).forEach(({body})=>body.replaceChildren());
    const history=columns.history.body, route=columns.route.body, sources=columns.sources.body;
    const recent=engine.history.filter(filter);
    const log=engine.log.filter(filter);
    const runs=engine.tables.map(t=>({...t,rows:t.rows.filter(filter)}));
    const memory=[...engine.memory.values()].filter(filter).sort(rowsByKey);
    const hGroup=group(history,'PUT sequence','history');
    for(const r of recent) row(hGroup,'h'+r.seq,r.key,'history',r.key,fmtSeq(r.seq)+' · '+r.value);
    const logGroup=group(route,'Active WAL','log');
    for(const r of log) {
      row(logGroup,'l'+r.seq,r.key,'log',fmtSeq(r.seq),r.key+' = '+r.value);
      link('h'+r.seq,'l'+r.seq,'history-log',r.key,['history','route']);
    }
    if(!log.length) logGroup.append(element('small','empty','Empty log'));
    const flushed=group(route,'Flushed versions','file');
    const diskRows=runs.flatMap(t=>t.rows).sort((a,b)=>a.seq-b.seq);
    for(const r of diskRows) {
      row(flushed,'f'+r.seq,r.key,'file',fmtSeq(r.seq),r.key+' = '+r.value);
      link('h'+r.seq,'f'+r.seq,'history-file',r.key,['history','route']);
    }
    if(!diskRows.length) flushed.append(element('small','empty','No flushed versions'));
    const ram=group(sources,'Memtable','ram');
    ram.classList.toggle('probing', runningStep?.source === 'RAM');
    for(const r of memory) {
      row(ram,'m'+r.seq,r.key,'ram',r.key,r.value+' · '+fmtSeq(r.seq));
      link('l'+r.seq,'m'+r.seq,'log-ram',r.key,['route','sources']);
    }
    if(!memory.length) ram.append(element('small','empty','No matching keys'));
    for(const t of runs) {
      const file=group(sources,t.name,'file');
      file.classList.toggle('probing', runningStep?.source === t.name);
      for(const r of t.rows) {
        row(file,'d'+r.seq,r.key,'file',r.key,r.value+' · '+fmtSeq(r.seq));
        link('f'+r.seq,'d'+r.seq,'file-file',r.key,['route','sources']);
      }
    }
    const sourceList=[{name:'RAM',rows:memory},...runs];
    const matrix=element('div','matrix');
    const labels=element('div','matrix-labels');
    for(const s of sourceList) labels.append(element('span','',s.name==='RAM'?'M':'R'+Number(s.name.slice(4,-4))));
    matrix.append(labels); columns.lookup.body.append(matrix);
    const result=group(columns.output.body,'Sequence / '+fmtSeq(engine.seq),'winner');
    for(const key of shown) {
      const cells=sourceList.map(s=>s.rows.find(r=>r.key===key));
      const first=cells.findIndex(Boolean);
      const line=element('div','matrix-row');line.tabIndex=0;line.dataset.key=key;
      line.append(element('span','matrix-key',key));
      let winner;
      cells.forEach((r,i)=>{
        const dot=element('span','cell '+(!r?'miss':i===first?'hit':'older'));
        dot.title=sourceList[i].name+' · '+key+' · '+(r?r.value+' '+fmtSeq(r.seq):'absent');
        dot.textContent=r?fmtSeq(r.seq):'–';
        dot.classList.toggle('probing-cell',runningStep?.source === sourceList[i].name && runningStep?.key === key);
        line.append(dot);
        if(i===first)winner=r;
      });
      const answer=element('span','decision',winner?'→ '+winner.value:'pending');line.append(answer);
      const a='q'+key; anchors.set(a,line);
      line.setAttribute('aria-label',key+' · '+cells.map((r,i)=>sourceList[i].name+' '+(r?r.value:'absent')).join(', '));
      matrix.append(line);
      cells.forEach((r,i)=>{if(r) link((i?'d':'m')+r.seq,a,i?'file-winner':'ram-winner',key,['sources','lookup'])});
      if(winner) {
        const bar=row(result,'o'+key,key,'winner',winner.value, key+' · '+fmtSeq(winner.seq));
        bar.style.setProperty('--bar',100*winner.seq/engine.seq+'%');
        bar.title=key+' = '+winner.value+' · '+fmtSeq(winner.seq);
        link(a,'o'+key,'winner-winner',key,['lookup','output']);
      }
    }
    matrix.style.setProperty('--sources',sourceList.length);
    columns.lookup.body.append(element('div','matrix-keyline','● First match　◐ Older　○ Absent'));
    highlight(focusedKey);
  }

  function animateStep() {
    sweep?.kill();
    if (!runningStep || reduced()) {curtain.setAttribute('width','1');return;}
    sweep=gsap.fromTo(curtain,{attr:{width:0}},{attr:{width:1},duration:.48,ease:'power2.inOut'});
  }

  function inspect(id, mode) {
    layout?.progress(1); reveal?.progress(1);
    const items=Object.values(columns).map(c=>c.col);
    const before=Flip.getState(items);
    const detail=details[id];
    for(const [key, item] of Object.entries(details)) {
      const active = key===id;
      item.view.close();
      item.panel.hidden=!active;
      columns[item.owner].body.hidden=active;
      item.toggle.setAttribute('aria-expanded',String(active));
      item.toggle.textContent=item.title+(active?' ⊖':' ⊕');
    }
    root.classList.toggle('operation-open',Boolean(detail));
    if(id==='compact') detail.view.show(engine.planCompaction(),engine.lastCompaction,mode);
    if(id==='flush') {
      if(liveFlush) detail.view.live(liveFlush.flush,liveFlush.phase);
      else detail.view.show(engine.planFlush(),engine.lastFlush,mode);
    }
    expanded=id;
    root.classList.toggle('inspecting',Boolean(id));
    for(const [key,{col,head}] of Object.entries(columns)) {
      col.classList.toggle('open',key===id || key===detail?.owner);
      head.setAttribute('aria-expanded',String(key===id));
      head.querySelector('.zoom').textContent=key===id?'⊖':'⊕';
    }
    onInspect(detail?.note ?? stages[id] ?? null);
    if (detail) root.parentElement.scrollLeft=Math.max(0,columns[detail.owner].col.offsetLeft-20);
    if(!reduced()) {
      layout=Flip.from(before,{duration:.5,ease:'power2.inOut',onUpdate:wires,onComplete:wires});
      if(id && !detail) {
        const parts=columns[id].body.querySelectorAll(id==='lookup'?'.cell,.decision':'.extra');
        if(parts.length) reveal=gsap.fromTo(parts,{opacity:0},{opacity:1,delay:.42,duration:.28,stagger:{amount:.24}});
      }
    }
    wires();
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && expanded){const head=details[expanded]?.toggle ?? columns[expanded].head; inspect(null);head.focus()}});
  document.addEventListener('click',e=>{if(expanded && !e.target.closest('.column, header, #paging'))inspect(null)});
  const observer=new ResizeObserver(wires);
  observer.observe(root);
  Object.values(columns).forEach(c=>observer.observe(c.col));
  document.querySelector('#prev').onclick=()=>{keyPage--;draw()};
  document.querySelector('#next').onclick=()=>{keyPage++;draw()};
  return {
    inspectOperation(id,mode) {
      if(details[id]) inspect(id,mode);
      else if(details[expanded]) inspect(null);
    },
    showFlushStep(step) {
      liveFlush=step;
      if(step.phase==='freeze') inspect('flush');
      else if(expanded==='flush') details.flush.view.live(step.flush,step.phase);
      if(step.phase==='retire') liveFlush=null;
    },
    render(state,step=null) {
      engine=state; runningStep=step;
      for(const [id,c] of Object.entries(columns)) c.col.classList.toggle('playing',id===step?.stage);
      if (step?.key) {
        const index=[...new Set(engine.history.map(r=>r.key))].sort().indexOf(step.key);
        if (index>=0) keyPage=Math.floor(index/6);
      }
      draw(); animateStep();
    },
    reset(){if(expanded)inspect(null);keyPage=0;focusedKey=null;}
  };
}
