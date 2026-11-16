import { recordValue } from '../engine.js';
import { fileLabel } from '../compaction-planner.js';
import { mountControl, ReplayControls } from '../controls.jsx';
import { CompactionPolicy } from './compaction-policy.jsx';
import { select } from 'd3-selection';
import { gsap } from 'gsap';

import { recordDiagram, seq, stepY, rowH, left, middle, right, rowWidth, svgWidth } from './record-diagram.js';

export function compactionView(panel) {
  panel.innerHTML = `
    <div class="replay-controls"></div>
    <p class="compaction-status" role="status"></p>
    <div class="policy-example"></div>
    <div class="merge-scroll"><svg class="merge-svg" aria-label="Record paths through compaction"></svg></div>
    <p class="merge-explain" aria-live="polite"></p>`;
  const renderControls = mountControl(panel.querySelector('.replay-controls'), ReplayControls);
  const renderPolicy = mountControl(panel.querySelector('.policy-example'), CompactionPolicy);
  const caption = panel.querySelector('.merge-explain');
  const status = panel.querySelector('.compaction-status');
  const svg = select(panel.querySelector('svg'));
  let nextPlan, lastMerge, current, timeline, selection;
  let summary = '', activePolicy;

  function emphasize(key) {
    svg.selectAll('[data-key]').classed('unrelated', function() {
      return key != null && this.dataset.key !== key;
    });
    const group = current?.groups.find(g => g.key === key);
    if (!group) { caption.textContent = summary; return; }
    const [keep, ...others] = group.versions;
    const kept = `Keep ${seq(keep.seq)} “${recordValue(keep)}” for ${key}.`;
    caption.textContent = others.length
      ? kept + ' Older versions dropped: ' + others.map(r => seq(r.seq)+' “'+recordValue(r)+'”').join(', ') + '.'
      : kept + ' This is the only version in the selected files.';
  }

  function animate(phases = [['.merge-in', '.comparison'], ['.merge-out', '.installed']]) {
    timeline?.progress(1).kill();
    if (!current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = selector => svg.selectAll(selector).nodes();
    timeline = gsap.timeline();
    for (const [paths, stage] of phases) {
      const lines = nodes(paths);
      for (const line of lines) line.style.setProperty('--length', line.getTotalLength());
      timeline.fromTo(lines, {strokeDasharray:'var(--length)',strokeDashoffset:i=>lines[i].getTotalLength()},
        {strokeDashoffset:0, duration:.75, stagger:{amount:.3}, ease:'power2.out', clearProps:'strokeDasharray,strokeDashoffset'});
      timeline.fromTo(nodes(stage), {opacity:0}, {opacity:1, duration:.32, stagger:{amount:.28}}, '-=.24');
    }
  }

  function controls() {
    renderPolicy({plan:current, activePolicy});
    const options = [];
    if(nextPlan) options.push({value:'next',label:'Next compaction'});
    if(lastMerge) options.push({value:'last',label:'Last compaction'});
    renderControls({label:'Compaction to inspect', options:options.length>1?options:[], value:selection,
      empty:!current, live:selection==='live', onChange:value=>{selection=value;render(true);}, onReplay:()=>animate()});
  }

  function render(play) {
    timeline?.progress(1).kill();
    svg.selectAll('*').remove();
    current = selection === 'last' ? lastMerge : nextPlan;
    controls();
    status.textContent = current ? selection === 'last' ? 'Last completed compaction' :
      selection === 'live' ? 'Comparing disk versions. The input files are still installed.' : 'Preview of the next compaction' : '';
    panel.querySelector('.merge-scroll').hidden = !current;
    if (!current) {
      caption.textContent = 'No files are eligible for this merge. Write and flush to create another SSTable.';
      return;
    }
    const positions = new Map();
    const { label, record, connect } = recordDiagram(svg, emphasize);
    label(left,16,'Old SSTables','merge-heading');
    label(middle,16,'Compare versions','merge-heading');
    label(right,16,'Merged SSTable','merge-heading');
    label(right,39,current.output?.name ?? 'Planned output','merge-filename output-name');
    let inputY=31;
    for (const table of current.inputs) {
      label(left,inputY+10,current.policy === 'all' ? table.name : fileLabel(table,current.policy),'merge-filename');
      inputY+=20;
      for (const r of table.rows) {
        record(left,inputY,r,'input-record',r.key+' · '+recordValue(r)+' '+seq(r.seq),table.name+' · '+r.key+' = '+recordValue(r)+' '+seq(r.seq));
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
        record(middle,compareY,r,'comparison '+(keep?'keep':'drop'),action+' '+seq(r.seq)+' · '+recordValue(r),action+' '+key+' = '+recordValue(r)+' '+seq(r.seq));
        connect(left+rowWidth,positions.get(r.seq),middle,compareY+rowH/2,key,'merge-in '+(keep?'kept-path':'dropped-path'));
        if (!keep) dropCount++;
        compareY+=stepY;
      }
      record(right,outputY,winner,'installed',key+' · '+recordValue(winner)+' '+seq(winner.seq),key+' = '+recordValue(winner)+' '+seq(winner.seq)+' in merged SSTable');
      connect(middle+rowWidth,outputY+rowH/2,right,outputY+rowH/2,key,'merge-out');
      compareY+=14;
    }
    const height=Math.max(inputY,compareY);
    svg.attr('viewBox',`0 0 ${svgWidth} ${height}`).attr('width',svgWidth).attr('height',height);
    summary=`${current.groups.length} keys kept · ${dropCount} older version${dropCount===1?'':'s'} dropped. Select a record to trace its key.`;
    emphasize(null);
    if(play) animate();
  }

  return {
    show(plan, last, mode, policy) {
      activePolicy=policy;
      nextPlan=plan;lastMerge=last;
      selection=mode==='last' && last?'last':plan?'next':'last';
      render(true);
    },
    live({phase, plan}) {
      activePolicy=plan.policy;
      if (phase === 'compare') {
        nextPlan=plan; lastMerge=null; selection='live';
        render(false);
        svg.selectAll('.merge-out,.installed').attr('visibility','hidden');
        svg.selectAll('.installed').attr('tabindex',-1);
        animate([['.merge-in','.comparison']]);
      } else {
        // Keep a pinned record and keyboard focus through installation.
        if (current?.groups !== plan.groups) {
          lastMerge=plan; selection='last'; render(false);
        }
        current=plan; lastMerge=plan; nextPlan=null; selection='last';
        controls();
        svg.select('.output-name').text(plan.output.name);
        svg.selectAll('.merge-out,.installed').attr('visibility','visible');
        svg.selectAll('.installed').attr('tabindex',0);
        status.textContent = 'Installed ' + plan.output.name + ' and retired the input files.';
        animate([['.merge-out','.installed']]);
      }
    },
    close(){timeline?.progress(1).kill();}
  };
}
