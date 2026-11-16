import { StorageEngine } from './engine.js';
import { recordChart } from './diagram/chart.js';
import './style.css';

const $=selector=>document.querySelector(selector);
const overview=[$('#noteTitle').textContent,$('#noteBody').textContent];
const chart=recordChart($('#chart'),stage=>{
  $('#noteTitle').textContent=stage?.[0]??overview[0];
  $('#noteBody').textContent=stage?.[2]??overview[1];
});
let engine, busy=false;
const names={client:'Client',wal:'Write-ahead log',mem:'Memtable',disk:'SSTables'};
const stageFor={client:'history',wal:'route',mem:'sources',disk:'sources'};

function trace(label,text) {
  const li=document.createElement('li'), title=document.createElement('b');
  title.textContent=label;
  li.append(title, document.createTextNode(text));
  $('#events').append(li); $('#events').scrollTop=$('#events').scrollHeight;
}
function selectOperation() {
  const op=$('#op').value;
  for(const [id,show] of [['key',op==='write'||op==='read'],['value',op==='write']]) {
    $('#'+id+'Label').hidden=!show; $('#'+id).disabled=!show;
  }
  $('#run').firstChild.textContent='Run '+op+' ';
}
function reset() {
  engine=new StorageEngine();
  for(const batch of [
    [['maple','red'],['birch','gold'],['cedar','sage']],
    [['elm','olive'],['birch','amber']],
    [['oak','umber'],['cedar','jade'],['ash','silver']]
  ]) {
    for(const [key,value] of batch) Array.from(engine.write(key,value));
    if(engine.seq<=5) Array.from(engine.flush());
  }
  $('#op').value='write';$('#key').value='cedar';$('#value').value='teal';
  selectOperation();chart.reset();chart.render(engine);
  $('#events').replaceChildren();
  trace('Example','Eight writes, two flushes. Read “cedar” to see why jade wins over sage.');
}
$('#op').onchange=()=>{
  selectOperation();
  chart.inspectOperation($('#op').value,'next');
};
$('#reset').onclick=reset;
$('#command').onsubmit=async e=>{
  e.preventDefault(); if(busy)return;
  const op=$('#op').value, key=$('#key').value, value=$('#value').value;
  const pause=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?Promise.resolve():new Promise(done=>setTimeout(done,620));
  const controls=[...document.querySelectorAll('header button, header select, header input:not(:disabled)')];
  busy=true;controls.forEach(c=>c.disabled=true);$('#events').replaceChildren();
  try {
    if(op==='write'||op==='read') chart.inspectOperation(op);
    for(const step of engine[op](key,value)) {
      chart.render(engine,{stage:stageFor[step.node],key:op==='read'||op==='write'?key:null,seq:op==='write'?engine.seq:null,source:step.source});
      if(step.flush) chart.showFlushStep(step);
      else if(op==='flush') chart.inspectOperation('flush','next');
      trace(names[step.node],step.text);await pause();
    }
    if(op==='compact') chart.inspectOperation('compact','last');
    if(op==='read'){
      const winner=engine.memory.get(key) ?? engine.tables.flatMap(t=>t.rows).find(r=>r.key===key);
      chart.render(engine,{stage:'lookup',key,winningSeq:winner?.seq}); await pause();
      chart.render(engine,{stage:'output',key}); await pause();
    }
  } finally {
    chart.render(engine);controls.forEach(c=>c.disabled=false);busy=false;
  }
};
reset();
