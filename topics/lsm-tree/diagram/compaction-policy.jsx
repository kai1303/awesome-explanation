import { policies, sandboxLimits } from '../compaction-planner.js';
import React, { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';

export function CompactionPolicy({ plan, activePolicy }) {
  const [policy, setPolicy] = useState('Size-tiered');
  const tiered = (policies[activePolicy] ?? policy) === 'Size-tiered';
  return <>
    {plan && <p className="merge-selection"><strong>{policies[plan.policy] ?? 'Full merge'}</strong> · {plan.reason}
      {' '}Outside this merge: {plan.untouched.map(file => file.name).join(', ') || 'none'}.</p>}
    <details className="compaction-policy">
    <summary>When does compaction start, and which files merge?</summary>
    <p>A flush adds a file. A database schedules background compaction when its files reach a policy threshold.</p>
    <p>The sandbox flushes at {sandboxLimits.memtableBytes} B. Size-tiered compaction groups files into doubling size bands and merges four peers. Leveled compaction starts at four L0 files or when a deeper level exceeds its byte budget.</p>
    {!policies[activePolicy] && <div className="policy-choices" role="group" aria-label="Compare compaction policies">
      {['Size-tiered', 'Leveled'].map(name =>
        <Button key={name} size="sm" label={name} variant={policy === name ? 'secondary' : 'ghost'}
          aria-pressed={policy === name} onClick={() => setPolicy(name)} />)}
    </div>}
    {tiered ? <>
      <p>Suppose four flushes each produce a 64 MiB file. With a threshold of four, this size tier can merge now.</p>
      <dl>
        <div><dt>Merge</dt><dd>4 × 64 MiB → one larger SSTable</dd></div>
        <div><dt>Leave on disk</dt><dd>1 × 512 MiB · different size tier</dd></div>
      </dl>
      <p>The larger file can wait for peers of its own size. A key such as <code>cedar</code> can still occur in both sizes, so a read may need to check both.</p>
    </> : <>
      <p>LevelDB checks the file count in level 0 and the total bytes in each deeper level. Suppose level 1 exceeds its size budget and the engine picks its birch–elm file. It includes every file in level 2 whose key range overlaps that input.</p>
      <dl>
        <div><dt>Merge</dt><dd>L1 birch–elm + L2 ash–cedar + L2 dogwood–maple</dd></div>
        <div><dt>Leave on disk</dt><dd>L2 oak–yew · outside birch–elm</dd></div>
      </dl>
      <p>The engine writes sorted output files with disjoint ranges in level 2. A read for <code>cedar</code> has at most one candidate there. Keeping ranges disjoint can require rewriting older data.</p>
    </>}
    <a href="#compaction-policies">Read about compaction policies ↓</a>
  </details></>;
}
