import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Button } from '@astryxdesign/core/Button';
import { reducedMotion } from '../chart-motion.js';
import { slots } from './model.js';
import { bloomHash, hashMultiplier, hashPositions, hashSeed } from './filter.js';

const hex = value => '0x' + value.toString(16).toUpperCase().padStart(8, '0');

export function KeyDetail({text, reading}) {
  const {rounds, hash} = useMemo(() => {
    const rounds = [];
    const hash = bloomHash(text, (code, value) => rounds.push({code, value}));
    return {rounds, hash};
  }, [text]);
  const {first, stride, second} = hashPositions(hash);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef(null);
  const motion = useRef(null);
  const last = rounds.length + 2;
  const beat = 1.35;

  useLayoutEffect(() => {
    const root = player.current;
    const letters = root.querySelectorAll('.hash-letter');
    const bits = root.querySelectorAll('.hash-index');
    const register = root.querySelector('.hash-register');
    const timeline = gsap.timeline({paused:true, onComplete:() => setPlaying(false)});
    motion.current = timeline;
    setStep(0);
    for (let frame = 1; frame <= last; frame++) {
      const time = frame * beat;
      const target = frame <= rounds.length ? letters[frame - 1] : bits[frame === last ? second : first];
      timeline.call(() => setStep(frame), [], time);
      if (!reducedMotion.matches) {
        timeline.fromTo(target, {y:-4}, {y:0, duration:.35, ease:'power2.out', immediateRender:false}, time);
        if (frame <= rounds.length) timeline.fromTo(register, {opacity:.35}, {opacity:1, duration:.35, immediateRender:false}, time);
      }
    }
    setPlaying(!reducedMotion.matches);
    if (!reducedMotion.matches) timeline.play();
    return () => { timeline.revert(); motion.current = null; };
  }, [text, rounds, first, second, last]);

  function seek(frame) {
    motion.current.pause().seek(frame * beat, true);
    setStep(frame);
    setPlaying(false);
  }

  function toggle() {
    if (playing) { motion.current.pause(); setPlaying(false); return; }
    if (step === last) seek(0);
    motion.current.play();
    setPlaying(true);
  }

  const letterStep = step > 0 && step <= rounds.length;
  const value = step === 0 ? hashSeed : rounds[Math.min(step, rounds.length) - 1].value;
  const previous = step <= 1 ? hashSeed : rounds[Math.min(step - 2, rounds.length - 1)].value;
  let explanation = 'Start with the seed. Each letter updates the running hash.';
  if (letterStep) explanation = '(' + hex(previous) + ' XOR ' + rounds[step - 1].code + ') × ' + hashMultiplier + ', keeping the lowest 32 bits.';
  if (step === last - 1) explanation = 'Shift the final hash right by 16 bits. The lowest four bits select position ' + first + '.';
  if (step === last) explanation = 'The odd stride advances ' + (stride & 15) + ' positions: (' + first + ' + ' + (stride & 15) + ') mod 16 = ' + second + '.';

  return <div className="hash-detail">
    <section ref={player} className="hash-player" aria-label="Animated hash calculation">
      <div className="hash-letters" aria-label={'Input word: ' + text}>{rounds.map(({code},i) =>
        <span key={i} className="hash-letter" data-active={letterStep && step === i+1 || undefined}>{code >= 0xd800 && code <= 0xdfff ? 'U+' + code.toString(16) : text[i]}</span>
      )}</div>
      <div className="register-line"><span>{step === 0 ? 'Seed' : step > rounds.length ? 'Final hash' : 'After letter ' + step}</span>
        <strong className="hash-register">{hex(value)}</strong></div>
      <p className="round-description">{explanation}</p>
      <small>Selected bit positions</small>
      <div className="hash-indices">{slots.map(i => {
        const selected = (step >= last-1 && i === first) || (step === last && i === second);
        return <span key={i} className="hash-index" data-selected={selected || undefined} aria-label={'Position ' + i + (selected ? ', selected' : '')}>{i}</span>;
      })}</div>
      <div className="buttons">
        <Button size="sm" label={playing ? 'Pause hash' : step === last ? 'Replay hash' : 'Play hash'} onClick={toggle}/>
        <Button size="sm" label="Back" isDisabled={!step} onClick={() => seek(step - 1)}/>
        <Button size="sm" label="Next step" isDisabled={step === last} onClick={() => seek(step + 1)}/>
      </div>
    </section>
    <section>
      <h3>Turn the letters into one number</h3>
      <p>A hash function gives the same input the same number every time. Both Insert and Query start with the same seed and mix the letters in the same order.</p>
      <p>This example uses a 32-bit hash. Start at <code>{hex(hashSeed)}</code>. For each character, XOR its numeric code into the running hash, multiply by {hashMultiplier.toLocaleString('en-US')}, and keep the lowest 32 bits. XOR flips the bits marked by the character code.</p>
      <p className="hash-equation">First round for “{text[0]}” (code {rounds[0].code}):<br/>
        ({hex(hashSeed)} XOR {rounds[0].code}) × {hashMultiplier} → {hex(rounds[0].value)} after keeping 32 bits.</p>
      <details><summary>Follow the hash through “{text}”</summary>
        <table><thead><tr><th>Character</th><th>UTF-16 code</th><th>Hash after mixing</th></tr></thead>
          <tbody>{rounds.map(({code, value}, index) => <tr key={index}>
            <td>{code >= 0xd800 && code <= 0xdfff ? 'Code unit ' + (index + 1) : text[index]}</td><td>{code}</td><td>{hex(value)}</td>
          </tr>)}</tbody></table>
      </details>
      <p>Final hash <strong><code>{hex(hash)}</code></strong></p>
    </section>
    <section>
      <h3>Choose two positions out of 16</h3>
      <p>Each hexadecimal digit holds four bits, enough to select a position from 0 to 15.</p>
      <dl>
        <dt>First position</dt>
        <dd>Shift the hash right by 16 bits to get {hex(hash >>> 16)}. Its last digit is <code>{first.toString(16).toUpperCase()}</code>, which selects <strong>bit {first}</strong>.</dd>
        <dt>Second position</dt>
        <dd>Shift the original hash right by 8 bits to get {hex(hash >>> 8)}. Set its lowest bit to 1 to make the stride odd. The last digit becomes <code>{(stride & 15).toString(16).toUpperCase()}</code>, a stride of {stride & 15} on this 16-position array.</dd>
      </dl>
      <p className="hash-equation">({first} + {stride & 15}) mod 16 = <strong>{second}</strong></p>
      <p>{reading ? 'The lookup reads' : 'Adding this key sets'} <strong>bits {first} and {second}</strong>.</p>
    </section>
  </div>;
}
