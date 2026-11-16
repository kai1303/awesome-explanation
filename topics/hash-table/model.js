// This lesson inserts a fresh key into a fixed table with at least one empty slot.
export function insertionTrace(wrap = false) {
  const key = 17;
  const slots = [null, 5, 6, wrap ? 7 : null];
  const home = key % slots.length;
  const start = { key, slots, home, index: null, resident: null, probes: 0 };
  const frames = [{ ...start, phase: 'request' }, { ...start, phase: 'hash' }];
  let index = home;
  for (let probes = 1; probes <= slots.length; probes++) {
    const resident = slots[index];
    const probe = { ...start, phase: 'probe', index, resident, probes, next: (index + 1) % slots.length };
    frames.push(probe);
    if (resident === null) {
      const after = slots.slice();
      after[index] = key;
      frames.push({ ...probe, phase: 'result', slots: after });
      break;
    }
    index = probe.next;
  }
  return frames;
}
