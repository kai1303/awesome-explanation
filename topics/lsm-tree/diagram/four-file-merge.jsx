import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {gsap} from 'gsap';
import {fourFileExample} from '../four-file-example.js';
import {policies} from '../compaction-planner.js';
import './four-file-merge.css';

const letter = i => String.fromCharCode(65+i);
const range = file => file.rows[0].key + '–' + file.rows.at(-1).key;
const rangeOfInputs = inputs => {
  const keys = inputs.flatMap(f => f.rows.map(r => r.key)).sort();
  return keys[0] + '–' + keys.at(-1);
};

export function FourFileMerge() {
  const [policy, setPolicy] = useState('tiered');
  const [revision, reset] = useState(0);
  return <section className="four-file-lesson" aria-labelledby="four-file-title">
    <div className="four-file-heading"><div><small>LSM TREE / COMPACTION</small>
      <h2 id="four-file-title">Which files should merge?</h2></div><a href="#policy-controls">Back to sandbox</a></div>
    <p>Four flushes wrote four 24-byte files. A arrived first, D last. Switch the policy to preview its choices on these same files.</p>
    <div className="policy-choices" role="group" aria-label="Four-file compaction policy">
      {Object.entries(policies).map(([id,label]) => <Button key={id} label={label} size="sm"
        aria-pressed={id===policy} variant={id===policy?'secondary':'ghost'} onClick={()=>setPolicy(id)} />)}
    </div>
    <MergeRun key={policy+revision} policy={policy} reset={()=>reset(n=>n+1)} />
  </section>;
}

function MergeRun({policy, reset}) {
  const {engine,files,plan} = useMemo(()=>fourFileExample(policy),[policy]);
  const [output, setOutput] = useState(null);
  const [finished, setFinished] = useState(false);
  const board = useRef(null);
  const tiered = policy==='tiered';
  const names = group => files.map((f,i)=>group.includes(f)?letter(i):null).filter(Boolean).join(' + ');
  function play() {
    Array.from(engine.compact(plan));
    setOutput(engine.lastCompaction.output);
  }
  useLayoutEffect(()=>{
    if (!output) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {setFinished(true);return;}
    const el = board.current;
    const ctx = gsap.context(()=>{
      const tl = gsap.timeline({onComplete:()=>setFinished(true)});
      for (const [i,row] of output.rows.entries()) {
        const from = el.querySelector('[data-input-seq="'+row.seq+'"]').getBoundingClientRect();
        const dest = el.querySelector('[data-output-seq="'+row.seq+'"]');
        const to = dest.getBoundingClientRect();
        tl.fromTo(dest,{x:from.left-to.left,y:from.top-to.top,opacity:0},
          {x:0,y:0,opacity:1,duration:.64,ease:'power2.inOut',clearProps:'transform,opacity'},.2+i*.34);
      }
    },el);
    return ()=>ctx.revert();
  },[output]);
  const old = plan.groups.find(g=>g.key==='cedar').versions;
  return <>
    <div className="four-file-rule" role="status"><strong>{plan.inputs.length} of 4 picked · {names(plan.inputs)}</strong>
      <span>{tiered ? 'All four fit the same size band (up to 32 B). The keys do not affect this choice.'
        : 'Four files in level 0 trigger a merge. Start at A and include overlapping ranges. Level 1 is empty.'}</span></div>
    <div className="four-file-board" ref={board}>
      <div><h3>Original files <small>oldest first</small></h3>
      <div className="four-file-inputs">{files.map((f,i)=>{
        const picked = plan.inputs.includes(f);
        const why = tiered ? f.bytes+' B · same size band.' : !i ? 'Oldest file in level 0.'
          : picked ? 'Overlaps A at cedar–elm.' : 'Outside '+rangeOfInputs(plan.inputs)+'.';
        return <div key={f.name} className="four-file-card" data-picked={picked}>
          <div className="four-file-label"><b>{letter(i)} · {range(f)}</b>
            <span>{picked ? finished?'Merged':'Picked' : 'Skipped'}</span></div>
          <small>{f.name} · {f.bytes} B</small>
          <p>{why}</p>
          <div className="four-file-records">{f.rows.map(r=><span key={r.seq} data-input-seq={r.seq}
            className={output && r.seq===old[1].seq?'superseded':''}>{r.key}{r.key==='cedar'?' = '+r.value:''}</span>)}</div>
        </div>;
      })}</div></div>
      <div className="four-file-dest"><h3>New SSTable</h3>
        <p className="four-file-output-name">{output ? output.name : 'Awaiting merge'}{!tiered && ' · L1'}</p>
        {output ? <div className="four-file-output-rows">{output.rows.map(r=><div key={r.seq} data-output-seq={r.seq}>
          <b>{r.key}</b><span>{r.value}</span></div>)}</div> :
          <p>Play the merge to follow the records from {names(plan.inputs)} into one sorted file.</p>}
      </div>
    </div>
    <div className="four-file-actions"><Button label={output?'Reset four files':'Play merge'} size="sm"
      variant={output?'secondary':'primary'} onClick={output?reset:play} />
      <p role="status">{finished ? 'Kept cedar = '+old[0].value+'; dropped the older '+old[1].value+'. '+
        (plan.untouched.length ? names(plan.untouched)+' stayed on disk unchanged.' : 'All four input files were replaced.') :
        output ? 'Copying the newest version of each key into '+output.name+'…' : 'Look at cedar in A and B. Which value should survive?'}</p></div>
  </>;
}
