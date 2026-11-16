import { gsap } from 'gsap';

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function drawRibbon(timeline, path, at = 0, duration = .48) {
  if (!path) return;
  const length = path.getTotalLength();
  timeline.fromTo(path, {strokeDasharray:length, strokeDashoffset:length},
    {strokeDashoffset:0, duration, ease:'power2.inOut', clearProps:'strokeDasharray,strokeDashoffset'}, at);
}

// Each inspector owns its reveal so closing or switching stages restores inline styles.
export function revealInspector(panel) {
  if (reducedMotion.matches) return;
  return gsap.context(() => {
    const timeline = gsap.timeline();
    timeline.from(panel, {y:8, opacity:0, duration:.22, ease:'power2.out', clearProps:'transform,opacity'})
      .from([...panel.children].slice(1), {opacity:0, duration:.22, stagger:.06, clearProps:'opacity'}, .1);
  });
}
