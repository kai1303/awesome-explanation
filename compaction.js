import { select } from 'd3-selection';
import { gsap } from 'gsap';

import { recordDiagram, seq, stepY, rowH, left, middle, right, rowWidth, svgWidth } from './record-diagram.js';

export function compactionView(panel) {
  panel.innerHTML = `
    <div class="merge-tools"><select aria-label="Compaction to inspect"></select><button type="button">↻ Replay</button></div>
    <div class="merge-scroll"><svg class="merge-svg" aria-label="Record paths through compaction"></svg></div>
    <p class="merge-explain" aria-live="polite"></p>`;
  const picker = panel.querySelector('select');
  const replay = panel.querySelector('button');
  const caption = panel.querySelector('p');
  const svg = select(panel.querySelector('svg'));
  let nextPlan, lastMerge, current, timeline;
  let summary = '';

  function emphasize(key) {
    svg.selectAll('[data-key]').classed('unrelated', function() {
      return key != null && this.dataset.key !== key;
    });
    const group = current?.groups.find(g => g.key === key);
    if (!group) { caption.textContent = summary; return; }
    const [keep, ...others] = group.versions;
    const kept = `Keep ${seq(keep.seq)} “${keep.value}” for ${key}.`;
    caption.textContent = others.length
      ? kept + ' Older versions dropped: ' + others.map(r => seq(r.seq)+' “'+r.value+'”').join(', ') + '.'
      : kept + ' This is the only disk version.';
  }

  function animate() {
    timeline?.progress(1).kill();
    if (!current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = selector => svg.selectAll(selector).nodes();
    timeline = gsap.timeline();
    for (const [paths, stage] of [['.merge-in', '.comparison'], ['.merge-out', '.installed']]) {
      const lines = nodes(paths);
      for (const line of lines) line.style.setProperty('--length', line.getTotalLength());
      timeline.fromTo(lines, {strokeDasharray:'var(--length)',strokeDashoffset:i=>lines[i].getTotalLength()},
        {strokeDashoffset:0, duration:.75, stagger:{amount:.3}, ease:'power2.out', clearProps:'strokeDasharray,strokeDashoffset'});
      timeline.fromTo(nodes(stage), {opacity:0}, {opacity:1, duration:.32, stagger:{amount:.28}}, '-=.24');
    }
  }

  function render(play) {
    timeline?.progress(1).kill();
    current = picker.value === 'last' ? lastMerge : nextPlan;
    svg.selectAll('*').remove();
    replay.disabled = !current;
    panel.querySelector('.merge-scroll').hidden = !current;
    if (!current) {
      caption.textContent = 'Write and flush until there are two SSTables to merge.';
      return;
    }
    const positions = new Map();
    const { label, record, connect } = recordDiagram(svg, emphasize);
    label(left,16,'Old SSTables','merge-heading');
    label(middle,16,'Compare versions','merge-heading');
    label(right,16,'Merged SSTable','merge-heading');
    label(right,39,current.output?.name ?? 'Planned output','merge-filename');
    let inputY=31;
    for (const table of current.inputs) {
      label(left,inputY+10,table.name,'merge-filename');
      inputY+=20;
      for (const r of table.rows) {
        record(left,inputY,r,'input-record',r.key+' · '+r.value+' '+seq(r.seq),table.name+' · '+r.key+' = '+r.value+' '+seq(r.seq));
        positions.set(r.seq,inputY+rowH/2);inputY+=stepY;
      }
      inputY+=8;
    }
    let compareY=48, dropCount=0;
    for (const {key,versions} of current.groups) {
      const [winner]=versions;
      const outputY=compareY;
      label(middle,compareY-5,key,'merge-key-label');
      for (const r of versions) {
        const keep=r===winner;
        const action=keep?'Keep':'Drop';
        record(middle,compareY,r,'comparison '+(keep?'keep':'drop'),action+' '+seq(r.seq)+' · '+r.value,action+' '+key+' = '+r.value+' '+seq(r.seq));
        connect(left+rowWidth,positions.get(r.seq),middle,compareY+rowH/2,key,'merge-in '+(keep?'kept-path':'dropped-path'));
        if (!keep) dropCount++;
        compareY+=stepY;
      }
      record(right,outputY,winner,'installed',key+' · '+winner.value+' '+seq(winner.seq),key+' = '+winner.value+' '+seq(winner.seq)+' in merged SSTable');
      connect(middle+rowWidth,outputY+rowH/2,right,outputY+rowH/2,key,'merge-out');
      compareY+=14;
    }
    const height=Math.max(inputY,compareY);
    svg.attr('viewBox',`0 0 ${svgWidth} ${height}`).attr('width',svgWidth).attr('height',height);
    summary=`${current.groups.length} keys kept · ${dropCount} older version${dropCount===1?'':'s'} dropped. Select a record to trace its key.`;
    emphasize(null);
    if(play) animate();
  }

  picker.onchange=()=>render(true);
  replay.onclick=animate;
  return {
    show(plan, last, mode, play=true) {
      nextPlan=plan;lastMerge=last;
      picker.replaceChildren();
      if (plan) picker.add(new Option('Next compaction','next'));
      if (last) picker.add(new Option('Last compaction','last'));
      picker.hidden=picker.options.length<2;
      picker.value=mode==='last' && last?'last':plan?'next':'last';
      render(play);
    },
    close(){timeline?.progress(1).kill();}
  };
}
