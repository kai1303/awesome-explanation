import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { drawRibbon, reducedMotion, revealInspector } from '../chart-motion.js';

gsap.registerPlugin(MotionPathPlugin);
import { insertionTrace } from './model.js';
import { detail, lesson } from './explanation.js';

const $ = id => document.getElementById(id);
const stages = [...document.querySelectorAll('[data-stage]')];
const board = $('board');
const canvas = board.parentElement;
const panel = $('stage-detail');

let frames = insertionTrace();
let step = 0;
let timer;
let movement;
let inspector;
let inspectorMotion;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const rows = frames[0].slots.map((_, i) => {
  const row = element('button', 'slot', '');
  row.append(element('span','address',i), element('span','resident',''), element('span','status',''), element('span','cursor landing',''));
  $('rows').append(row);
  row.onclick = () => inspect('probe', row, i);
  return row;
});

for (const trigger of [...stages, ...rows]) {
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'stage-detail');
  trigger.setAttribute('aria-expanded', 'false');
}
for (const trigger of stages) trigger.onclick = () => inspect(trigger.dataset.stage, trigger);

function seen() { return frames.slice(0, step + 1).filter(f => f.phase === 'probe'); }

function dismiss(restore = false) {
  if (!inspector) return;
  const { trigger } = inspector;
  inspector = null;
  inspectorMotion?.revert();
  board.querySelector('.examined')?.classList.remove('examined');
  panel.hidePopover();
  trigger.setAttribute('aria-expanded','false');
  if (restore) trigger.focus({ preventScroll: true });
}

function inspect(stage, trigger, slot) {
  pause();
  const same = inspector?.trigger === trigger;
  dismiss();
  if (same) return;
  inspector = { trigger };
  const info = detail(stage, frames[step], seen(), slot);
  $('detail-title').textContent = info.title;
  $('detail-text').textContent = info.text;
  $('evidence').textContent = info.evidence;
  $('detail-link').href = '#' + info.anchor;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.closest('.column').classList.add('examined');
  panel.showPopover();
  inspectorMotion = revealInspector(panel);
  $('close').focus({ preventScroll: true });
}
$('close').onclick = () => dismiss(true);
$('detail-link').onclick = () => dismiss();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && inspector) { e.preventDefault(); dismiss(true); }
});
document.addEventListener('pointerdown', e => {
  if (inspector && !panel.contains(e.target) && !e.target.closest('[data-stage],.slot')) dismiss();
});

function geometry(moving = false, follow = false) {
  const f = frames[step];
  const rect = board.getBoundingClientRect();
  const box = node => {
    const b = node.getBoundingClientRect();
    return { left: b.left - rect.left, right: b.right - rect.left, x: b.left + b.width / 2 - rect.left, y: b.top + b.height / 2 - rect.top };
  };
  movement?.progress(1).kill();
  const wires = $('wires');
  wires.replaceChildren();
  function ribbon(d, color, width) {
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.style.stroke = color;
    path.style.strokeWidth = width;
    wires.append(path);
    return path;
  }
  function curve(a, b) {
    const mid = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
  }
  const request = box($('origin')), hash = box($('hash-target'));
  const cursor = i => box(rows[i].querySelector('.cursor'));
  let target = request;
  let transferPath = ribbon(curve(request, hash), '#ddb4ce', 7);
  if (f.phase !== 'request') {
    target = hash;
    const home = cursor(f.home);
    const firstPath = ribbon(curve(hash, home), '#a994c4', 7);
    ribbon(`M ${home.x} ${home.y} H ${box(rows[f.home]).left}`, '#a994c4', 7);
    if (f.probes > 0) {
      target = home;
      transferPath = firstPath;
    }
  }
  const visits = seen();
  visits.slice(1).forEach((visit, i) => {
    const from = cursor(visits[i].index), to = cursor(visit.index);
    const bend = from.x - (visit.index === 0 ? 68 : 32);
    const d = `M ${from.x} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${to.x} ${to.y}`;
    transferPath = ribbon(d, '#d6a67e', 4);
    ribbon(`M ${to.x} ${to.y} H ${box(rows[visit.index]).left}`, '#d6a67e', 4);
    target = to;
  });
  let receiptPath;
  if (f.phase === 'result') {
    target = box(rows[f.index].querySelector('.resident'));
    transferPath = ribbon(curve(cursor(f.index), target), '#a0cdb5', 4);
    const row = box(rows[f.index]), receipt = box($('receipt'));
    receiptPath = ribbon(curve({x:row.right,y:row.y}, {x:receipt.left,y:receipt.y}), '#a0cdb5', 8);
  }
  const chip = $('traveler');
  const playTransfer = moving && !reducedMotion.matches;
  const start = playTransfer ? transferPath.getPointAtLength(0) : target;
  gsap.set(chip, {x:start.x, y:start.y, xPercent:-50, yPercent:-50});
  if (playTransfer) {
    movement = gsap.timeline();
    const duration = f.phase === 'probe' && f.index === 0 ? .82 : .55;
    drawRibbon(movement, transferPath, 0, duration);
    movement.to(chip, {
      motionPath:transferPath.getAttribute('d'), duration, ease:'power2.inOut'
    }, 0);
    if (f.phase === 'probe') {
      movement.from(rows[f.index].querySelector('.status'),
        {opacity:0, duration:.23, clearProps:'opacity'}, duration - .06);
    }
    if (receiptPath) {
      const resident = rows[f.index].querySelector('.resident');
      movement.set(resident, {opacity:0}, 0)
        .set(resident, {clearProps:'opacity'}, duration);
      drawRibbon(movement, receiptPath, duration, .35);
      movement.from($('receipt'), {opacity:0, duration:.24, clearProps:'opacity'}, duration + .17);
    }
  }
  if (follow && canvas.clientWidth < board.clientWidth) {
    canvas.scrollTo({left:target.x - canvas.clientWidth / 2,behavior:reducedMotion.matches || !moving ? 'instant' : 'smooth'});
  }
}

function render(moving = false, follow = true) {
  const f = frames[step], guide = lesson(f), visits = seen();
  const done = f.phase === 'result';
  $('progress').textContent = 'Step ' + (step + 1) + ' of ' + frames.length;
  $('origin').textContent = f.phase === 'request' ? '' : f.key;
  $('remainder').textContent = f.phase === 'request' ? 'Home slot ?' : '→ slot ' + f.home;
  $('destination').textContent = done ? 'Slot ' + f.index : 'Pending';
  $('receipt').classList.toggle('done', done);
  $('count').textContent = done ? f.probes + ' probes · 1 write' : '0 writes';
  rows.forEach((row,i) => {
    const visit = visits.find(v => v.index === i);
    const stored = done && i === f.index;
    const state = stored ? 'stored' : !visit ? '' : visit.resident === null ? 'available' : 'collision';
    const status = {stored:'Stored',collision:'Collision',available:'Empty found','':'Unchecked'}[state];
    row.className = ['slot',state,f.index === i ? 'current' : ''].join(' ');
    row.querySelector('.resident').textContent = f.slots[i] ?? '—';
    row.querySelector('.status').textContent = status;
    row.setAttribute('aria-label', 'Explain slot ' + i + ', ' + (f.slots[i] ?? 'empty') + ', ' + status);
  });
  $('path').textContent = 'Probe path   ' + (visits.map(v=>v.index).join(' → ') || '—');
  $('lesson-step').textContent = done ? 'Insertion complete' : 'Follow key 17';
  $('lesson-title').textContent = guide.title;
  $('caption').textContent = guide.text;
  $('question').textContent = guide.question ?? '';
  $('prediction').hidden = done;
  $('feedback').textContent = '';
  $('read').href = '#' + guide.anchor;
  $('trace').replaceChildren(...frames.slice(0,step+1).map(frame => element('li','',lesson(frame).log)));
  $('next').disabled = done;
  $('next').textContent = step ? 'Next step' : 'Step through';
  $('back').disabled = !step;
  geometry(moving, follow);
}
for (let i=0;i<rows.length;i++) {
  const choice = element('button','','Slot ' + i);
  choice.onclick = () => {
    pause();
    const guide = lesson(frames[step]);
    if (i === guide.answer) advance();
    else $('feedback').textContent = guide.hint + ' Try again.';
  };
  $('choices').append(choice);
}

function pause() {
  clearInterval(timer);
  timer = undefined;
  $('run').textContent = 'Run';
}
function go(index, moving = false) {
  dismiss();
  step = index;
  render(moving);
}
function advance() {
  if (step < frames.length-1) go(step+1, true);
  if (step === frames.length-1) pause();
}
$('run').onclick = () => {
  if (timer) return pause();
  if (step === frames.length-1) go(0);
  dismiss();
  $('run').textContent = 'Pause';
  timer = setInterval(advance, 1650);
};
$('next').onclick = () => { pause(); advance(); };
$('back').onclick = () => { pause(); go(Math.max(0,step-1)); };
function restart() {
  pause();
  frames = insertionTrace($('scenario').value === 'wrap');
  go(0);
}
$('scenario').onchange = restart;
$('reset').onclick = restart;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
for (const link of document.querySelectorAll('[data-jump]')) {
  link.onclick = () => {
    const jump = link.dataset.jump;
    $('scenario').value = jump === 'wrap' ? 'wrap' : 'standard';
    restart();
    const index = {request:0, hash:0, probe:2, store:frames.length-2, wrap:frames.findIndex(f=>f.phase==='probe' && f.index===3)}[jump];
    go(index);
    $('diagram').focus({preventScroll:true});
  };
}
new ResizeObserver(() => geometry()).observe(board);
render(false, false);
