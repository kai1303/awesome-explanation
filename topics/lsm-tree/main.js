import { newLookup, trackProbe } from './bloom.js';
import { policies, sandboxLimits } from './compaction-planner.js';
import { conditionalWrites, StorageEngine } from './engine.js';
import { articleEngine, articleFrames } from './walkthrough.js';
import { BloomInspector } from './diagram/bloom-inspector.jsx';
import { recordChart } from './diagram/chart.js';
import { mountControl, OperationBar } from './controls.jsx';
import { FourFileMerge } from './diagram/four-file-merge.jsx';
import './style.css';

const $=selector=>document.querySelector(selector);
const overview=[$('#noteTitle').textContent,$('#noteBody').textContent];
const showBloom = mountControl($('#bloom-inspection'), BloomInspector);
let inspectingBloom = false;
const chart=recordChart($('#chart'),stage=>{
  $('#noteTitle').textContent=stage?.[0]??overview[0];
  $('#noteBody').textContent=stage?.[2]??overview[1];
}, (table, lookup, restoreFocus) => {
  inspectingBloom = true;
  if (!guided) refreshControls();
  showBloom({table, lookup, close:() => {
    inspectingBloom = false;
    showBloom(null);
    if (!guided) refreshControls();
    requestAnimationFrame(restoreFocus);
  }});
});
let engine, layouts, comparison;
let policy = 'tiered';
const params = new URLSearchParams(location.search);
const juniperDemo = params.get('demo');
const names={client:'Client',wal:'Write-ahead log',mem:'Memtable',disk:'SSTables'};
const stageFor={client:'history',wal:'route',mem:'sources',disk:'sources'};

function trace(label,text) {
  const li=document.createElement('li'), title=document.createElement('b');
  title.textContent=label;
  li.append(title, document.createTextNode(text));
  $('#events').append(li); $('#events').scrollTop=$('#events').scrollHeight;
}
function showThresholds() {
  const l0 = engine.tables.filter(t => t.level === 0).length;
  const threshold = policy === 'tiered' ? 'Merge at 4 files in one size tier' : `L0 · ${l0}/4 files · L1 budget 128 B`;
  $('#maintenance-status').textContent =
    `Auto flush · ${engine.memtableBytes}/${sandboxLimits.memtableBytes} B in RAM　 ${threshold}`;
}

function reset(demo = ['write-path','flush','compact','recovery'].includes(juniperDemo) ? juniperDemo : false) {
  const unflushedJuniper = demo === 'flush' || demo === 'recovery';
  layouts = {};
  comparison = null;
  for (const id of Object.keys(policies)) {
    if (demo === 'compact') {
      const seeded = new StorageEngine(id);
      for (const [op,value] of [['create','needles'], ['update','pine']]) {
        Array.from(seeded.runSandbox(op,'juniper',value));
        Array.from(seeded.runSandbox('flush'));
      }
      layouts[id] = seeded;
      continue;
    }
    layouts[id] = articleEngine({seedJuniper:demo === 'bloom', pendingWrites:unflushedJuniper ? [] : undefined});
    layouts[id].policy = id;
    if (['juniper', 'bloom', 'write-path'].includes(demo)) {
      Array.from(layouts[id].runSandbox('flush'));
    }
    if (demo === 'write-path' || unflushedJuniper) Array.from(layouts[id].runSandbox('create','juniper','needles'));
    if (demo === 'juniper') {
      Array.from(layouts[id].runSandbox('write','ash','silver'));
      Array.from(layouts[id].runSandbox('write','cedar','jade'));
    }
  }
  engine = layouts[policy];
  showThresholds();
  $('#engine-status').textContent='Follow a key across the engine.';
  $('#chart').classList.toggle('compare-versions',demo === 'compact');
  chart.reset();chart.render(engine);
  if (demo === 'write-path' || unflushedJuniper) {
    const viewport = $('#viewport');
    viewport.scrollLeft = unflushedJuniper ? 0 : $('#body-route').parentElement.offsetLeft - 16;
    $('#engine-status').textContent = demo === 'recovery'
      ? 'Juniper is in the WAL and memtable. Click Crash before it flushes, then Restart to replay its WAL entry.'
      : demo === 'flush' ? 'Click Flush to copy juniper into a new SSTable.' : 'Click Write path to follow juniper from the WAL into memory.';
  }
  if (demo === 'compact') {
    $('#viewport').scrollLeft = 0;
    $('#engine-status').textContent = 'Click Compact under Engine to merge the two juniper versions.';
  }
  if (demo === 'bloom') {
    const viewport = $('#viewport');
    viewport.scrollLeft = Math.min($('#body-sources').parentElement.offsetLeft - 16, viewport.scrollWidth - viewport.clientWidth);
  }
  $('#events').replaceChildren();
  if (demo === 'bloom') trace('Juniper','Follow the filters across three SSTables to find juniper.');
  else if (demo === 'write-path' || unflushedJuniper) trace('INSERT','juniper = needles was appended to the WAL and applied to the memtable.');
  else if (demo === 'compact') trace('Juniper','Flushed needles, updated it to pine, then flushed again.');
  else if (demo === 'juniper') trace('Juniper','Three files on disk. Writing juniper fills the memtable and triggers a flush, then a merge.');
  else trace('Example','Eight writes, two flushes. Cedar has two versions. Select INSERT to add juniper.');
  refreshControls(demo === 'bloom' ? 'read' : demo === 'juniper' ? 'create' : null);
}
function* run(op, key, value, sql) {
  if (['flush','compact','crash','restart'].includes(op)) chart.closeInspection();
  const previousSeq = engine.seq;
  const conditional = conditionalWrites.includes(op);
  let lookup = op === 'read' || conditional ? newLookup(key) : null;
  const merges = [];
  let maintenance = null;
  $('#events').replaceChildren();
  $('#engine-status').textContent = 'Follow a key across the engine.';
  const command = sql ? sql.split(/\s+/)[0].toUpperCase() : op[0].toUpperCase() + op.slice(1);
  if (sql) trace('SQL',sql);
  const [target, destination] = {
    flush:['sources','Memtable'], compact:['sources','SSTables'], crash:['sources','Memtable'],
    restart:['route','WAL'], write:['history','Write history']
  }[op] ?? ['lookup','Version lookup'];
  yield chart.clientExchange(target,false,`${command} → ${destination}`);
  try {
    for(const step of engine.runSandbox(op,key,value)) {
      showThresholds();
      const activeOp = step.automatic ?? op;
      if (conditional && step.record) lookup = null;
      if (!maintenance && (conditional || op === 'read')) $('#engine-status').textContent = step.text;
      if(op==='crash') $('#engine-status').textContent='Engine offline. Restart to replay the surviving WAL.';
      if(activeOp==='restart') $('#engine-status').textContent=step.text;
      if (step.plan && step.phase==='install') merges.push(step.plan);
      if (lookup) trackProbe(lookup, step);
      if (activeOp === 'flush' || activeOp === 'compact') {
        maintenance = {...step, operation:activeOp, trigger:step.reason ?? (maintenance?.operation === activeOp ? maintenance.trigger : null)};
      }
      let stage = stageFor[step.node];
      let location = step.source ?? names[step.node];
      if (step.node === 'client') {
        stage = lookup ? 'lookup' : step.record ? 'history' : null;
        location = lookup ? 'Version lookup' : step.record ? 'Write history' : 'Client';
      }
      const action = step.automatic ?? command;
      const installation = chart.render(engine,{clientStatus:`${action} · ${location}`,stage,operation:activeOp,key:step.record?.key ?? (activeOp==='read'||activeOp==='write'||conditionalWrites.includes(activeOp)?key:null),seq:step.record?.seq ?? (activeOp==='write'?engine.seq:null),source:step.source, replay:step.record},lookup,maintenance);
      if (step.reason) trace('Threshold reached',step.reason);
      trace(names[step.node],step.text);yield installation;
    }
    if(op==='read'){
      lookup.complete = true;
      chart.render(engine,{clientStatus:`${command} · Version lookup`,stage:'lookup',key,winningSeq:lookup.winner?.seq},lookup); yield;
      chart.render(engine,{clientStatus:`${command} · Visible values`,stage:'output',key},lookup); yield;
    }
    // Both layouts receive the user's commands; each schedules its own maintenance.
    const other = policy === 'tiered' ? 'leveled' : 'tiered';
    const otherMerges = [];
    for (const step of layouts[other].runSandbox(op,key,value)) {
      if (step.plan && step.phase === 'install') otherMerges.push(step.plan);
    }
    if (merges.length || otherMerges.length || op === 'compact') {
      comparison = {command:op === 'delete' ? `Delete ${key}` : (conditional || op === 'write') ? `${op[0].toUpperCase()+op.slice(1)} ${key} = ${value}` : op, seq:engine.seq,
        [policy]:merges, [other]:otherMerges};
      refreshControls();
    }
    if (sql) {
      let result;
      if (op === 'read') {
        const row = lookup.winner?.operation === 'delete' ? null : lookup.winner;
        result = {sql, row, message:row ? '1 row returned' : '0 rows returned'};
      } else if (op === 'create' && engine.seq === previousSeq) {
        result = {sql, message:'Duplicate primary key. Insert rejected.'};
      } else {
        result = {sql, message:engine.seq === previousSeq ? '0 rows affected' : '1 row affected'};
      }
      const source = op === 'read' ? 'output' : engine.seq === previousSeq ? 'lookup' : 'sources';
      trace('Client', result.message);
      yield chart.clientExchange(source,true,result.message);
      return result;
    }
  } finally {
    chart.render(engine,null,lookup,maintenance);
  }
}
const frames = articleFrames();
const chapterSelect = $('#lesson-chapter');
const firstFrame = new Map();
for (const [index, frame] of frames.entries()) {
  if (firstFrame.has(frame.chapter)) continue;
  firstFrame.set(frame.chapter, index);
  const label = frame.chapter === 'crash-after' ? 'Crash after flushing' : document.getElementById(frame.chapter).textContent;
  chapterSelect.add(new Option(label, frame.chapter));
}

let position = 0;
let guided;
const showControls = mountControl($('#operation-bar'), OperationBar);

function refreshControls(demo = false) {
  showControls({run, reset, policy, comparison, switchPolicy, demo, inspectingBloom});
}

function switchPolicy(id) {
  if (policy === id) return;
  policy = id;
  engine = layouts[id];
  chart.reset();
  const last = comparison?.[id].at(-1);
  chart.render(engine, null, null, last && engine.status === 'online' ? {
    operation:'compact', phase:'install', plan:last, text:last.reason
  } : null);
  $('#engine-status').textContent = engine.status === 'online' ? 'Follow a key across the engine.' : 'Engine offline. Restart to replay the surviving WAL.';
  showThresholds();
  $('#events').replaceChildren();
  trace(policies[id], `Same writes through #${engine.seq}. ${engine.tables.length} installed SSTables.`);
  refreshControls();
}

function showFrame(index) {
  position = index;
  const frame = frames[index];
  chapterSelect.value = frame.chapter;
  $('#lesson-count').textContent = 'Step ' + (index + 1) + ' of ' + frames.length;
  $('#lesson-caption').textContent = frame.caption;
  $('#lesson-read').href = '#' + frame.chapter;
  $('#lesson-back').disabled = index === 0;
  $('#lesson-next').disabled = index === frames.length - 1;
  $('#engine-status').textContent = { online:'Engine online', crashed:'Engine offline', recovering:'Replaying WAL' }[frame.engine.status];
  chart.showFrame(frame);
  const stage = $('#chart .playing');
  if (stage) {
    for (const row of stage.querySelectorAll('[data-key]')) {
      if (row.dataset.key === frame.highlight.key) row.classList.add('lesson-focus');
    }
    const viewport = $('#viewport');
    if (viewport.scrollWidth > viewport.clientWidth) viewport.scrollLeft = stage.offsetLeft - 16;
  }
  $('#events').replaceChildren();
  let start = index;
  while (start > 0 && frames[start - 1].chapter === frame.chapter) start--;
  for (const past of frames.slice(start, index + 1)) trace('Step', past.caption);
}

function setGuided(on) {
  if (on === guided) return;
  const firstVisit = guided === undefined;
  guided = on;
  $('#lesson').hidden = !on;
  $('#maintenance-status').hidden = on;
  $('#sandbox-controls').hidden = on;
  if (on) {
    showControls(null);
    chart.reset();
    showFrame(position);
  } else {
    reset(firstVisit && juniperDemo);
  }
}

$('#lesson-back').onclick = () => showFrame(position - 1);
$('#lesson-next').onclick = () => showFrame(position + 1);
$('#lesson-reset').onclick = () => showFrame(0);
chapterSelect.onchange = () => showFrame(firstFrame.get(chapterSelect.value));
$('#sandbox-mode').onclick = () => setGuided(false);
for (const link of document.querySelectorAll('[data-lesson]')) {
  link.onclick = () => {
    position = firstFrame.get(link.dataset.lesson);
    if (guided) showFrame(position);
    else setGuided(true);
    $('#lesson').focus();
  };
}
setGuided(false);
if (params.has('inspect')) chart.openRecord(params.get('inspect'));

const mergeHost = $('#compare-four-files');
const showFourFiles = mountControl(mergeHost, FourFileMerge);
function syncFourFileLesson() {
  const open = location.hash === '#compare-four-files';
  const wasOpen = !mergeHost.hidden;
  mergeHost.hidden = !open;
  showFourFiles(open ? {} : null);
  if (open) mergeHost.focus();
  else if (wasOpen && location.hash === '#policy-controls') {
    if (guided) setGuided(false);
    requestAnimationFrame(() => $('#policy-controls .four-file-link')?.focus());
  }
}
window.addEventListener('hashchange',syncFourFileLesson);
syncFourFileLesson();
