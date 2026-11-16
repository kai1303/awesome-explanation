export const stageNames = { request: 'Request', hash: 'Home slot', probe: 'Probe table', result: 'Insertion result' };
const article = { request: 'request-article', hash: 'hash-article', probe: 'probe-article', result: 'store-article' };

export function lesson(f) {
  const { key, index, home, slots, probes, resident, next } = f;
  const size = slots.length;
  if (f.phase === 'request') return {
    title: 'Where should 17 start?', text: 'The pink label tracks the incoming key. Use the remainder after dividing it by the table size to find the first address.',
    question: 'Which slot is home for 17?', answer: home, hint: 'Subtract four groups of four from 17.', anchor: article.request,
    log: 'Request to insert ' + key
  };
  if (f.phase === 'hash') return {
    title: 'The remainder chooses the first slot', text: key + ' mod ' + size + ' = ' + home + '. The hash gives us an address. We still have to read the key at that address.',
    question: 'Which slot do we inspect first?', answer: home, hint: 'Use the remainder shown at Home slot.', anchor: article.hash,
    log: 'Home slot = ' + key + ' mod ' + size + ' = ' + home
  };
  if (f.phase === 'result') return {
    title: '17 is stored in slot ' + index, text: 'Only slot ' + index + ' changed. Looking up ' + key + ' can now follow the same sequence of comparisons.',
    anchor: article.result, log: 'Write ' + key + ' to slot ' + index
  };
  if (resident === null) return {
    title: 'Probe ' + probes + ' finds an empty slot', text: 'Slot ' + index + ' has room for ' + key + '. Probing stops here. The next step writes the key into the table.',
    question: 'Which slot changes when we write?', answer: index, hint: 'Look for the empty cell beside the pink key.', anchor: article.result,
    log: 'Inspect slot ' + index + ' → empty'
  };
  return {
    title: 'Probe ' + probes + ' meets key ' + resident,
    text: 'Slot ' + index + ' contains ' + resident + '. It differs from ' + key + ', so leave it in place and advance the probe by one address.',
    question: 'Which slot should the probe check next?', answer: next,
    hint: index === size - 1 ? 'The addresses run from 0 to 3. After the last address, start at the beginning.' : 'Add one to the current slot address.',
    anchor: index === size - 1 ? 'wrap-article' : article.probe, log: 'Inspect slot ' + index + ' → ' + resident + ' differs from ' + key
  };
}

export function detail(stage, f, seen, selected) {
  const { key, home, slots, index, probes } = f;
  const title = stageNames[stage];
  const anchor = article[stage];
  if (stage === 'request') return { title, anchor, text: 'The request carries key ' + key + ' throughout the insertion. The table uses its numeric value to calculate the first address. Each occupied slot keeps its resident while the probe looks for room.', evidence: 'Incoming key ' + key + ' · capacity ' + slots.length };
  if (stage === 'hash') return { title, anchor, text: f.phase === 'request' ? 'Divide the incoming key by the number of slots. The remainder will be the starting address. The hash alone cannot tell whether that address is occupied.' : 'Four fits into 17 four times with one left over. The remainder picks the first address. After a collision the probe advances from the current address without hashing again.', evidence: f.phase === 'request' ? key + ' mod ' + slots.length + ' = ?' : key + ' = 4 × 4 + ' + home + ' → slot ' + home };
  if (stage === 'result') return { title, anchor, text: f.phase === 'result' ? 'The first empty cell received the incoming key. The other cells kept their residents. This receipt records the write in the probe table.' : 'The destination is decided by inspecting slots in order. Once the probe finds an empty cell, the table can write the key there and report the address.', evidence: f.phase === 'result' ? 'slot ' + index + ' ← ' + key + ' · ' + probes + ' probes · 1 write' : probes + ' probes so far · 0 writes' };
  const slot = selected ?? index ?? (f.phase === 'hash' ? home : null);
  const visit = seen.find(v => v.index === slot);
  if (slot === null) return { title, anchor, text: 'Each row is a slot. Its left number is the address and the middle value is the resident key. A probe compares that resident with the incoming key. A different resident sends the probe to the next address.', evidence: 'Incoming key ' + key + ' · no slots inspected' };
  const rowTitle = title + ' · slot ' + slot;
  if (!visit) return { title: rowTitle, anchor, text: 'This row shows the current contents of slot ' + slot + '. The probe has yet to inspect it. The table compares keys only when the probe reaches a slot.', evidence: 'Resident: ' + (slots[slot] ?? 'empty') + ' · incoming key ' + key };
  if (visit.resident === null) return { title: rowTitle, anchor: article.result, text: f.phase === 'result' ? 'The probe found this slot empty, then wrote ' + key + ' here. The insertion ends after this single write.' : 'The probe found no resident in slot ' + slot + '. There is room for ' + key + ' here, so the probe stops advancing. The write is the next step.', evidence: 'Probe ' + visit.probes + ' · ' + (f.phase === 'result' ? 'empty → ' + key : 'empty → ready to write') };
  return { title: rowTitle, anchor: visit.next === 0 ? 'wrap-article' : anchor,
    text: 'Probe ' + visit.probes + ' compared ' + key + ' with the resident ' + visit.resident + '. They differ, so ' + visit.resident + ' stays here. ' + (visit.next === 0 ? 'Adding one reaches the end of the array. Taking the remainder wraps the probe to slot 0.' : 'Linear probing adds one to the address and checks slot ' + visit.next + '.'),
    evidence: '(' + slot + ' + 1) mod ' + slots.length + ' = ' + visit.next };
}
