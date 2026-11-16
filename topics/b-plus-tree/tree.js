// One insertion into the article's seed, followed by an inclusive range scan.
export function traceInsert(key) {
  if (!Number.isInteger(key) || key < 0 || key > 99) throw new RangeError('Use an integer from 0 to 99.');
  const leaves = [{ id: 'A', keys: [5, 10] }, { id: 'B', keys: [20, 30, 40, 50] }];
  const separators = [20];
  const children = ['A', 'B'];
  const result = [];
  const frames = [];
  const pageFor = target => {
    const above = separators.findIndex(boundary => target < boundary);
    return leaves[above < 0 ? children.length - 1 : above];
  };
  function record(phase, title, caption, active, focus = key, edge = null) {
    frames.push(structuredClone({ phase, title, caption, active, focus, edge, leaves, separators, children, result }));
  }

  record('start', 'Choose a leaf', `Where would you insert ${key}? Compare it with the separator 20 at the root.`, 'root');
  const leaf = pageFor(key);
  record('route', 'Follow the child pointer', `${key} is ${key < 20 ? 'below' : 'at least'} 20. Follow the pointer to leaf ${leaf.id}, which already holds ${leaf.keys.join(', ')}.`, leaf.id, key, ['root', leaf.id]);
  if (leaf.keys.includes(key)) {
    record('existing', 'Find the existing entry', `Leaf ${leaf.id} already holds ${key}. This example indexes distinct keys, so its entries stay the same.`, leaf.id);
  } else {
    leaf.keys.push(key);
    leaf.keys.sort((a, b) => a - b);
    const overflow = leaf.keys.length > 4;
    record(overflow ? 'insert' : 'fit', overflow ? 'Find the overflow' : 'Insert in sorted order', `Place ${key} in leaf ${leaf.id}. It now holds ${leaf.keys.length} entries for four slots. ${overflow ? 'A split will make room.' : 'The new entry fits.'}`, leaf.id);
    if (overflow) {
      const right = { id: 'C', keys: leaf.keys.splice(2) };
      leaves.splice(leaves.indexOf(leaf) + 1, 0, right);
      const boundary = right.keys[0];
      record('split', 'Split the leaf', `Keep ${leaf.keys.join(', ')} in ${leaf.id}. Move ${right.keys.join(', ')} to ${right.id} and link the leaves. The parent still needs a pointer to ${right.id}.`, right.id, boundary, [leaf.id, right.id]);
      children.splice(children.indexOf(leaf.id) + 1, 0, right.id);
      separators.splice(children.indexOf(right.id) - 1, 0, boundary);
      record('parent', 'Copy the separator up', `Copy ${boundary} into the root to mark the lower bound of leaf ${right.id}. Its record stays in that leaf.`, 'root', boundary, ['root', right.id]);
    }
  }

  const low = 30, high = 42;
  const first = pageFor(low);
  record('seek', 'Descend to the start of the range', `Find the first possible match for ${low}–${high}. The root directs ${low} to leaf ${first.id}.`, first.id, low, ['root', first.id]);
  for (let i = leaves.indexOf(first); i < leaves.length; i++) {
    const page = leaves[i];
    if (page !== first) record('follow', 'Follow the leaf link', `Continue from leaf ${leaves[i-1].id} to its next leaf, ${page.id}. The scan can continue without visiting the root again.`, page.id, null, [leaves[i-1].id, page.id]);
    for (const value of page.keys) {
      if (value > high) {
        record('stop', 'Stop at the upper bound', `${value} exceeds ${high}. All later keys are larger, so the complete result is ${result.join(', ')}.`, page.id, value);
        return frames;
      }
      if (value < low) {
        record('skip', 'Skip the smaller key', `${value} is below the lower bound of ${low}. Continue within leaf ${page.id}.`, page.id, value);
      } else {
        result.push(value);
        record('collect', 'Collect a matching key', `${value} falls within ${low}–${high}. Add it to the result.`, page.id, value);
      }
    }
  }
  return frames;
}
