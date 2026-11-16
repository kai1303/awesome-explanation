// Each prompt reads the current page and the outcome already computed by the trace.
// Article links enter before the decision so a learner can still make a prediction.
export function lessonAt(frames, index) {
  const frame = frames[index];
  const next = frames[index + 1];
  const leaf = frame.leaves.find(page => page.id === frame.active);
  const leaves = frame.leaves.map(page => page.id);
  const pageChoices = leaves.map(id => 'Leaf ' + id);

  switch (frame.phase) {
    case 'start':
      return {
        section:'route', page:'root', question:`Which leaf should receive ${frame.focus}?`,
        hint:`Compare ${frame.focus} with the root’s separator ${frame.separators[0]}. Equality takes the right pointer.`,
        choices:pageChoices, answer:'Leaf ' + next.active, pickPage:true
      };
    case 'route': {
      const answer = {insert:'Split the leaf', fit:'Keep the leaf', existing:'Keep the existing entry'}[next.phase];
      return {
        section:next.phase === 'insert' ? 'split' : 'experiment-question', page:leaf.id,
        question:`What will inserting ${frame.focus} do to leaf ${leaf.id}?`,
        hint:`Count its ${leaf.keys.length} entries, check whether ${frame.focus} already appears, and compare with the four-slot limit.`,
        choices:['Keep the leaf', 'Split the leaf', 'Keep the existing entry'], answer
      };
    }
    case 'split':
      return {
        section:'separator', page:leaf.id,
        question:`Which key should the root copy from leaf ${leaf.id}?`,
        hint:`The new pointer must cover every key in ${leaf.id}, including its smallest key.`,
        choices:leaf.keys.map(String), answer:String(next.focus)
      };
    case 'parent':
    case 'fit':
    case 'existing':
      return {
        section:'scan', page:'root', question:`Which leaf should the range scan visit first for ${next.focus}?`,
        hint:`Use the root’s boundaries to find the page containing the lower bound, ${next.focus}.`,
        choices:pageChoices, answer:'Leaf ' + next.active, pickPage:true
      };
    case 'collect':
      if (next?.phase === 'follow') return {
        section:'scan', page:leaf.id, question:`You have reached the end of leaf ${leaf.id}. Where can the scan continue?`,
        hint:'Look for the dashed next-leaf arrow. It preserves key order across pages.',
        choices:['Root', ...pageChoices.filter(name => name !== 'Leaf ' + leaf.id)],
        answer:'Leaf ' + next.active, pickPage:true
      };
      if (next?.phase === 'stop') return {
        section:'scan', page:leaf.id, question:`The next key is ${next.focus}. What should the scan do?`,
        hint:'The requested range ends at 42, inclusive. Later entries can only be larger.',
        choices:['Collect this key', 'Stop scanning'], answer:'Stop scanning'
      };
  }
  return null;
}
