import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { BitFlow } from './bit-flow.jsx';
import { bitAt, casesFor, frameFor, outcome, positions, readExample } from './model.js';
import { KeyDetail } from './key-detail.jsx';
import './style.css';

const {file, keys, query: initial} = readExample(location.search);
const choices = casesFor(keys, initial);
const readLSM = '../lsm-tree/?demo=bloom';
const first = keys[0], firstPair = positions(first).join(' and ');

const openHash = location.hash === '#key-hash';

function App() {
  const [mode, setMode] = useState(openHash || new URLSearchParams(location.search).get('mode') === 'query' ? 'query' : 'insert');
  const [query, choose] = useState(initial);
  const [steps, setSteps] = useState({insert: 0, query: openHash ? 1 : 0});
  const read = mode === 'query';
  const step = steps[mode];
  const last = read ? 2 : keys.length;
  const finished = step === last;
  const [playing, play] = useState(false), [detail, inspect] = useState(openHash ? 'Key' : null);
  const [guess, predict] = useState('');
  const f = frameFor(keys,query,mode,step);
  const tested = positions(query), zero = tested.find(i => !bitAt(f.bits,i));
  const result = outcome(keys, query), done = f.phase === 'result';
  const absent = zero !== undefined;
  const action = done ? (absent ? 'Definitely absent' : 'Possibly present') : 'Awaiting query';
  const pair = f.active.join(' and ');
  const prior = f.phase === 'build' ? frameFor(keys,query,mode,step-1).bits : 0;
  const retained = f.active.filter(i => bitAt(prior,i));
  const title = f.phase === 'empty' ? 'Start with sixteen zeros' : f.phase === 'build' ? 'Add ' + f.key
    : f.phase === 'ready' ? 'Start with the finished filter' : !done ? 'What can these two bits tell you?' : absent ? 'One zero rules out ' + query
    : result === 'found' ? 'An inserted word returns “possibly present”' : 'A word we never inserted also returns “possibly present”';
  const caption = f.phase === 'empty' ? 'Each square holds one bit. Before any keys are added, every bit is 0.'
    : f.phase === 'build' ? 'Hash “' + f.key + '” to positions ' + pair + ' and set both to 1. ' +
      (retained.length ? 'Already set: ' + retained.join(', ') + '. A shared bit stays 1.' : 'Leave every other bit as it was.')
    : f.phase === 'ready' ? 'This filter already includes ' + keys.join(', ') + '. Follow “' + query + '” to its two positions.'
    : !done ? 'Hash “' + query + '” with the same rule. Read bits ' + pair + ' without changing them. What do their values tell you?'
    : absent ? 'Bit ' + zero + ' is 0. Inserting “' + query + '” would have set it to 1, so we know that word was never inserted.'
    : 'Both positions are 1. ' + (result === 'found'
      ? 'We can see “' + query + '” in the insertion list. The filter alone can only say “possibly present.”'
      : 'Compare with the insertion list: “' + query + '” is missing. Other words set both positions. This is a false positive.');

  function seek(n, target = mode) {
    play(false);
    predict('');
    setSteps(previous => ({...previous, [target]: n}));
  }
  function switchMode(target) {
    play(false);
    predict('');
    setMode(target);
    const url = new URL(location.href);
    url.searchParams.set('mode', target);
    url.hash = '';
    history.replaceState(null, '', url);
  }
  function jump(target, n) {
    switchMode(target);
    seek(n, target);
    document.querySelector('#diagram').scrollIntoView({block:'start'});
  }
  function openDetail(name) { play(false); inspect(name); }
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setSteps(previous => ({...previous, [mode]: step + 1}));
      if (step + 1 === last) play(false);
    }, 2300);
    return () => clearTimeout(timer);
  },[playing,step,mode,last]);
  const stageText = {
    'Bit array': 'Each 1 means at least one stored key used this position. Select a square to see which keys set it at this step.',
    'Filter answer': done ? caption : 'A zero at any selected position proves absence. When every selected position is 1, the word might belong to the set.',
  };
  const showHash = detail === 'Hash' || detail === 'Key';
  const stageKey = f.phase === 'empty' ? first : f.key;
  const owners = typeof detail === 'number' ? keys.slice(0,f.count).filter(k => positions(k).includes(detail)) : [];
  return <>
    <header><h1 className="explainer-title">Bloom Filter <em>Explainer</em></h1>
      <p>Have we seen this word before? A Bloom filter keeps a compact pattern of bits. Use it to test whether a word belongs to a set.</p></header>
    <p className="insertion-list"><strong>Words to insert</strong> <code>{keys.join(' · ')}</code>{file && <small>Example from {file}</small>}</p>
    <section id="diagram" aria-label="Interactive Bloom filter">
      <div className="chapter">
        <SegmentedControl label="Bloom filter operation" size="sm" value={mode} onChange={switchMode}>
          <SegmentedControlItem label="Insert" value="insert" />
          <SegmentedControlItem label="Query" value="query" />
        </SegmentedControl>
        <span>Step {step+1} of {last+1}</span>
      </div>
      <div className="toolbar"><div className="buttons">
        <Button variant="primary" size="sm" label={playing ? 'Pause' : finished ? 'Replay' : 'Play'} onClick={() => {if (finished) seek(0); play(!playing);}}/>
        <Button size="sm" label="Back" isDisabled={!step} onClick={() => seek(step-1)}/>
        <Button size="sm" label="Next step" isDisabled={finished} onClick={() => seek(step+1)}/>
        <Button size="sm" variant="ghost" label="Reset" onClick={() => seek(0)}/>
      </div></div>
      <div className="flow-viewport" tabIndex={0} role="region" aria-label="Scrollable Bloom filter diagram"><BitFlow key={mode} querying={read} step={step} frame={f} stageKey={stageKey} action={action} detail={detail}
        evidence={done ? tested.map(i => 'bit ' + i + ' = ' + bitAt(f.bits, i)).join(' · ') : ''}
        openDetail={openDetail}/></div>
      <div className="lesson" aria-live="polite"><h2>{title}</h2><p>{caption}</p></div>
      {f.phase === 'probe' && <div className="predict"><span>Predict:</span>{['Definitely absent','Possibly present'].map((a,i) =>
        <Button size="sm" key={a} label={a} onClick={() => {play(false); if ((i === 0) === absent) seek(last);
          else predict(absent ? 'Check bit ' + zero + ' again. Could a stored key leave that bit at 0?' : 'Both positions are set. Can those bits tell you which keys set them?');}}/>)}<span role="status">{guess}</span></div>}
      {read && <div className="experiments"><strong>Try a lookup</strong><div className="buttons">{choices.map(key =>
        <Button key={key} size="sm" variant={query === key ? 'secondary' : 'ghost'} label={key} onClick={() => {choose(key); seek(1);}}/>)}</div>
        <small>Use the same finished filter each time.</small></div>}
    </section>
    <article className="walkthrough">
      <h2>How does a word become a bit position?</h2>
      <p>A hash function follows a fixed rule to turn an input into a number. This example mixes the letters of a word in order to produce one 32-bit number. A second rule uses parts of that number to select two positions between 0 and 15. Run the same word through both rules tomorrow and it will pick the same two positions.</p>
      <p>That repeatability lets Insert and Query find each other: Insert sets the two bits and Query reads them. Different words can still land on the same positions. This overlap is what makes a false positive possible.</p>
      <a href="#diagram" onClick={e => {e.preventDefault(); jump('insert', 1); openDetail('Hash');}}>Trace the hash of {first} ↑</a>
      <h2>How can 16 bits remember a set of words?</h2>
      <p>Start with an array of zeros. A hash calculation turns a word into repeatable positions in the array. Here, inserting <code>{first}</code> sets bits {firstPair} to 1. Other words can set those same bits. Inserting a word twice leaves the pattern unchanged.</p>
      <a href="#diagram" onClick={e => {e.preventDefault(); jump('insert', 1);}}>Watch the first insertion ↑</a>
      <h2>Why does one zero settle a query?</h2>
      <p>Query the word using the same hash calculation. If you find a zero at either position, the word is definitely absent. Every insertion would have set both positions, and every subsequent insertion preserves them. That gives an insert-only Bloom filter its guarantee: an inserted word will never be reported absent.</p>
      <p>Two ones leave a different possibility. The bits remember that <em>some</em> words set them, but a bit carries no record of which word did it. Try a query and compare the answer with the insertion list above.</p>
      <a href="#diagram" onClick={e => {e.preventDefault(); jump('query', 1);}}>Predict a membership answer ↑</a>
      <h2>How much space buys a useful answer?</h2>
      <p>A larger array gives the same keys more room to spread out. With a fixed array, each new distinct key can turn more zeros into ones. Once every bit is set, every query answers “possibly present.” Checking more positions can help distinguish words, but each insertion then sets more bits too. The array size, expected number of items, and number of positions per item are chosen together.</p>
      <p>In the usual model of uniformly distributed, independent hash positions, the false-positive probability for an absent item is approximately <code>(1 − exp(−kn/m))ᵏ</code>, with <em>m</em> bits, <em>n</em> distinct insertions and <em>k</em> positions per item. This small diagram computes each answer from the actual bits. <a href="https://www.eecs.harvard.edu/~michaelm/postscripts/esa2006a.pdf">Kirsch and Mitzenmacher’s analysis</a></p>
      <h2>Why keep all the ones?</h2>
      <p>Clearing a bit to remove one word could erase evidence for another word that shares it. Click a set bit after insertion to see its contributors. The lesson can show their names because it also keeps the example list. A basic Bloom filter stores only the bit array.</p>
      <h2>Where does “possibly present” help?</h2>
      <p>Burton Bloom’s 1970 paper proposed a hyphenation dictionary. Common words could follow simple rules, while exceptions needed a dictionary lookup. A definite negative let the program use its rules immediately. A false positive cost one extra lookup, which the dictionary could resolve. <a href="https://crystal.uta.edu/~mcguigan/cse6350/papers/Bloom.pdf">Read Bloom’s original paper</a>.</p>
      <p>Another application is a database checking whether a sorted file might contain a key. <a href={readLSM}>See Bloom filters in the LSM tree explainer →</a></p>
    </article>
    {detail !== null && <Dialog isOpen onOpenChange={() => inspect(null)} aria-label="Inspect the filter" padding={4} width={showHash ? "min(560px, 92vw)" : "min(420px, 92vw)"} maxHeight="88dvh">
      <DialogHeader title={typeof detail === 'number' ? 'Bit ' + detail : showHash ? 'Hashing “' + stageKey + '”' : detail} onOpenChange={() => inspect(null)}/>
      {showHash ? <KeyDetail text={stageKey} reading={read}/> : <p className="detail">{typeof detail === 'number' ? owners.length ? 'Set to 1 by: ' + owners.join(', ') + '. The filter itself stores only the bit.' :
        'Still 0. None of the keys added so far use this position.' : stageText[detail]}</p>}
    </Dialog>}
  </>;
}
createRoot(document.querySelector('#root')).render(<App/>);
