// Explain the displayed snapshot. Read scan decisions only through the current step.
export function stageDetails(stage, frames, index, selected) {
  const frame = frames[index];
  const key = frames[0].focus;
  const owner = frame.leaves.find(page => page.keys.includes(key));
  switch (stage) {
    case 'request':
      return {
        article:'question',
        text:`The request inserts key ${key} into an index of distinct integers. Pink marks this key wherever it appears. A second operation reads all indexed keys from 30 through 42, including both endpoints.`,
        lines:[owner ? `Key ${key} currently has a record in leaf ${owner.id}.` : `Key ${key} has not yet entered a leaf.`]
      };
    case 'routing':
      return {
        article:'separator',
        text:'A separator gives the lowest search key routed to the child on its right. Equality follows that pointer. The record itself lives in a leaf.',
        lines:frame.children.map((id,i) => {
          const lo = frame.separators[i-1], hi = frame.separators[i];
          const bounds = lo === undefined ? 'key < ' + hi : hi === undefined ? 'key ≥ ' + lo : lo + ' ≤ key < ' + hi;
          return bounds + ' → leaf ' + id;
        })
      };
    case 'pages': {
      const leaf = frame.leaves.find(page => page.id === selected);
      const pages = leaf ? [leaf] : frame.leaves;
      return {
        article:'split',
        text:'A leaf holds up to four sorted records in this example. A fifth entry triggers a split. The leaves stay linked in key order so a scan can continue into the next page.',
        lines:pages.map(page => {
          const sibling = frame.leaves[frame.leaves.indexOf(page)+1];
          const state = page.keys.length > 4 ? ' · overflow' : '';
          return `Leaf ${page.id} [${page.keys.join(', ')}] · ${page.keys.length}/4${state} · ${sibling ? 'next leaf ' + sibling.id : 'end of chain'}`;
        })
      };
    }
    case 'scan': {
      const visits = frames.slice(0,index+1).filter(step => ['collect','skip','stop'].includes(step.phase));
      const describe = step => {
        if (step.phase === 'skip') return `${step.focus} is below 30. Skip it.`;
        if (step.phase === 'stop') return `${step.focus} exceeds 42. Sorted order lets the scan stop here.`;
        return `${step.focus} is within 30–42. Keep it.`;
      };
      const entries = selected == null ? visits : visits.filter(step => step.focus === selected);
      return {
        article:'scan',
        text:'The root routes the lower bound, 30, to a starting leaf. The scan then follows leaf links, checks keys in order, and stops at the first key above 42.',
        lines:entries.length ? entries.map(describe) : [selected != null ? `The scan has not inspected ${selected} at this step.` : 'The scan has not inspected a key yet.']
      };
    }
    case 'output': {
      const keys = frame.result.includes(selected) ? [selected] : frame.result;
      return {
        article:'scan',
        text:'Each returned key comes from a leaf entry that the scan visited inside the requested range. The index already stores keys in this order.',
        lines:keys.length ? keys.map(k => `${k} ← leaf ${frame.leaves.find(page => page.keys.includes(k)).id}`) : ['No matching key has been collected yet.']
      };
    }
  }
}
