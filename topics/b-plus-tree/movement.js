import { gsap } from 'gsap';
import { drawRibbon, reducedMotion } from '../chart-motion.js';

const groups = {
  input: '.request-key .key', root: '.separators .key', leaf: '.record .key',
  scan: '.scan-row .key', out: '.out-row .key'
};

// The chart rebuilds its rows for each snapshot. Match the rendered keys across
// those snapshots, then move the destination row from its previous screen position.
export function chartMovement(board, wire) {
  let timeline;
  function positions() {
    const origin = board.getBoundingClientRect();
    const result = new Map();
    for (const [group, selector] of Object.entries(groups)) {
      for (const key of board.querySelectorAll(selector)) {
        const rect = key.getBoundingClientRect();
        result.set(group + ':' + key.dataset.value, {group, key, x:rect.left-origin.left, y:rect.top-origin.top});
      }
    }
    return result;
  }
  return {
    before() {
      timeline?.progress(1).kill();
      return positions();
    },
    after(old, frame, advance) {
      if (!advance || reducedMotion.matches) return;
      timeline = gsap.timeline({onUpdate:wire, onComplete:wire});
      // The highlighted edge describes this step, including steps with no record move.
      let pathSelector = 'path.selected';
      if (['collect','skip','stop'].includes(frame.phase)) pathSelector = 'path[data-value="' + frame.focus + '"]';
      for (const path of board.querySelectorAll(pathSelector)) drawRibbon(timeline, path);

      let transferred = 0;
      for (const [id, dest] of positions()) {
        const {group, key} = dest;
        if (!['leaf','root','out'].includes(group)) continue;
        const sourceGroup = {leaf:'input', root:'leaf', out:'scan'}[group];
        const source = old.get(id) ?? old.get(sourceGroup + ':' + key.dataset.value);
        if (!source) continue;
        const dx = source.x-dest.x, dy = source.y-dest.y;
        if (Math.hypot(dx,dy) < 3) continue;
        const isSplit = frame.phase === 'split' && group === 'leaf';
        const target = isSplit ? key.closest('.record') : key;
        const start = isSplit ? transferred++ * .12 : group === 'out' ? .16 : 0;
        key.classList.add('moving-key');
        timeline.fromTo(target, {x:dx, y:dy, zIndex:2}, {
          x:0, y:0, duration:.56, ease:'power2.inOut', clearProps:'transform,zIndex',
          onComplete:() => key.classList.remove('moving-key')
        }, start);
      }
      if (frame.phase === 'follow') {
        const link = board.querySelector('.sibling.following');
        if (link) timeline.from(link, {opacity:.25, y:-6, duration:.44, clearProps:'transform,opacity'}, 0);
      }
    }
  };
}
