import { revealInspector } from '../chart-motion.js';
import { lessonAt } from './lessons.js';
import { stageDetails } from './details.js';
import { createFlow } from './flow.js';
import { traceInsert } from './tree.js';

const byId = id => document.getElementById(id);
let frames = traceInsert(35);
let index = frames.length - 1;
let overview = true;
const drawFlow = createFlow(byId('tree'));
let inspected = null;
let lesson = null;

const popover = byId('stage-detail');
let detail = null;
let inspectorMotion;

function detailTrigger() {
  return byId('tree').querySelector(`[data-detail="${detail.stage}"]`);
}

function refreshDetail() {
  if (!detail) return;
  const trigger = detailTrigger();
  const data = stageDetails(detail.stage, frames, index, detail.selected);
  byId('detail-title').textContent = trigger.firstChild.textContent;
  byId('detail-text').textContent = data.text;
  byId('detail-values').replaceChildren(...data.lines.map(line => {
    const item = document.createElement('li');
    item.textContent = line;
    return item;
  }));
  byId('detail-article').href = '#' + data.article;
  trigger.setAttribute('aria-expanded','true');
  byId('tree').dataset.inspect = detail.stage;
  for (const stage of byId('tree').querySelectorAll('[data-stage]')) stage.classList.toggle('examined', stage.dataset.stage === detail.stage);
}

function closeDetail(restoreFocus = false) {
  if (!detail) return;
  const trigger = detailTrigger();
  detail = null;
  inspectorMotion?.revert();
  popover.hidePopover();
  delete byId('tree').dataset.inspect;
  byId('tree').querySelector('.examined')?.classList.remove('examined');
  trigger.setAttribute('aria-expanded','false');
  if (restoreFocus) trigger.focus({preventScroll:true});
}

function openDetail(stage, selected = null) {
  pause();
  if (detail) {
    const same = detail.stage === stage && detail.selected === selected;
    closeDetail();
    if (same) return;
  }
  detail = {stage, selected};
  popover.showPopover();
  refreshDetail();
  inspectorMotion = revealInspector(popover);
  byId('detail-close').focus({preventScroll:true});
}

byId('detail-close').onclick = () => closeDetail(true);
byId('detail-article').onclick = () => closeDetail();
document.addEventListener('keydown', e => {
  if (detail && e.key === 'Escape') { e.preventDefault(); closeDetail(true); }
});
document.addEventListener('pointerdown', e => {
  if (detail && !e.target.closest('#stage-detail, #tree button, #next, #back')) closeDetail();
});


function articleSection(phase) {
  if (phase === 'fit') return 'experiment-question';
  if (phase === 'split' || phase === 'insert') return 'split';
  if (phase === 'parent') return 'separator';
  if (['start', 'route', 'existing'].includes(phase)) return 'route';
  return 'scan';
}

function inspect(id) {
  inspected = id;
  const frame = frames[index];
  const page = frame.leaves.find(leaf => leaf.id === id);
  let message = 'Select a page to inspect its keys.';
  if (id === 'root') {
    message = 'Below ' + frame.separators[0] + ' → ' + frame.children[0];
    frame.separators.forEach((key, i) => {
      const upper = frame.separators[i + 1];
      message += ' · ' + key + (upper === undefined ? ' and above' : ' to below ' + upper) + ' → ' + frame.children[i + 1];
    });
  } else if (page) {
    const sibling = frame.leaves[frame.leaves.indexOf(page) + 1];
    message = 'Leaf ' + id + ' holds ' + page.keys.length + ' of 4 entries' + (page.keys.length > 4 ? ' (overflow)' : '') + '. ' + (sibling ? 'Next leaf: ' + sibling.id : 'End of the leaf chain') + '.';
  }
  byId('inspection').textContent = message;
  for (const button of byId('tree').querySelectorAll('[data-page]')) button.setAttribute('aria-pressed', String(button.dataset.page === id));
}

function render() {
  const frame = frames[index];
  lesson = overview ? null : lessonAt(frames, index);
  drawFlow(frames, index, frames[0].focus, lesson, overview);
  byId('result').textContent = frame.result.length ? frame.result.join(' · ') : '—';
  byId('progress').textContent = overview ? 'Overview' : `Step ${index + 1} of ${frames.length}`;
  byId('run-status').textContent = `Insert ${frames[0].focus} · Scan 30–42`;
  byId('op-trace').replaceChildren(...(overview ? frames.filter(f => ['route','split','fit','existing','stop'].includes(f.phase)) : frames.slice(0,index+1)).slice(-4).map(f => {
    const item = document.createElement('li');
    item.textContent = f.caption;
    return item;
  }));
  byId('title').textContent = overview ? 'Follow key ' + frames[0].focus : frame.title;
  byId('caption').textContent = overview
    ? 'The diagram shows the completed insertion and range scan. Step through to see how the index reached this state.'
    : frame.caption;
  byId('back').disabled = index === 0 || overview;
  byId('next').disabled = !overview && index === frames.length - 1;
  byId('read').href = '#' + (overview ? 'question' : lesson?.section ?? articleSection(frame.phase));
  byId('lesson-prompt').hidden = !lesson;
  byId('lesson-question').textContent = lesson?.question ?? '';
  byId('feedback').textContent = '';
  const choices = byId('choices');
  choices.replaceChildren();
  for (const text of lesson?.choices ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.onclick = () => predict(text);
    choices.append(button);
  }
  byId('next').textContent = overview ? 'Step through' : lesson ? 'Show answer' : 'Next step';
  inspect(overview ? null : lesson?.page ?? frame.active);
  byId('return-overview').hidden = overview;
  if (!overview) {
    const canvas = byId('tree').parentElement;
    if (canvas.scrollWidth > canvas.clientWidth) {
      const target = lesson?.page === 'root' ? '.routing' : lesson?.page ? '.pages' :
        ['seek','collect','skip','follow','stop'].includes(frame.phase) ? '.scan' : '.pages';
      const anchor = byId('tree').querySelector(target);
      canvas.scrollLeft += anchor.getBoundingClientRect().left - canvas.getBoundingClientRect().left - canvas.clientWidth / 3;
    }
  } else byId('tree').parentElement.scrollLeft = 0;
  refreshDetail();
}

function predict(choice) {
  pause();
  if (choice !== lesson.answer) {
    byId('feedback').textContent = choice + ' — try again. ' + lesson.hint;
    return;
  }
  index++;
  render();
  // The answer buttons are rebuilt for the next decision. Keep keyboard focus in the player.
  const focusTarget = byId('next').disabled ? byId('back') : byId('next');
  focusTarget.focus({preventScroll:true});
}

let timer = null;
function pause() {
  clearTimeout(timer);
  timer = null;
  byId('run').textContent = 'Run';
}
function play() {
  if (timer !== null) { pause(); return; }
  if (!byId('experiment').reportValidity()) return;
  const key = byId('key').valueAsNumber;
  if (overview || index === frames.length - 1 || key !== frames[0].focus) start(key);
  byId('run').textContent = 'Pause';
  function advance() {
    index++;
    render();
    if (index === frames.length - 1) pause();
    else timer = setTimeout(advance, 1100);
  }
  timer = setTimeout(advance, 850);
}
byId('run').onclick = play;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function start(key, phase = 'start') {
  pause();
  closeDetail();
  overview = phase === 'overview';
  byId('key').value = key;
  frames = traceInsert(key);
  index = overview ? frames.length - 1 : frames.findIndex(frame => frame.phase === phase);
  inspected = null;
  render();
}

byId('tree').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) { closeDetail(); return; }
  const stage = button.closest('[data-stage]').dataset.stage;
  const id = button.dataset.page;
  if (id) {
    const choice = id === 'root' ? 'Root' : 'Leaf ' + id;
    if (lesson?.pickPage && lesson.choices.includes(choice)) {
      closeDetail();
      predict(choice);
      return;
    }
    inspect(id);
  }
  const selected = stage === 'pages' ? id : button.dataset.value != null ? Number(button.dataset.value) : null;
  openDetail(stage, selected);
});
byId('experiment').addEventListener('submit', event => {
  event.preventDefault();
  start(byId('key').valueAsNumber);
});
byId('back').onclick = () => { pause(); index--; render(); };
byId('next').onclick = () => {
  pause();
  if (!byId('experiment').reportValidity()) return;
  if (overview || frames[0].focus !== byId('key').valueAsNumber) start(byId('key').valueAsNumber);
  else { index++; render(); }
};
byId('return-overview').onclick = () => start(frames[0].focus,'overview');
byId('reset').onclick = () => start(35,'overview');
for (const link of document.querySelectorAll('[data-frame]')) {
  link.onclick = () => { start(Number(link.dataset.key ?? 35), link.dataset.frame); byId('diagram').focus(); };
}
render();
