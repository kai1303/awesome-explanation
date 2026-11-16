import { keyMask } from '../bloom-filter/filter.js';
export { bloomBits, keyMask } from '../bloom-filter/filter.js';

export function buildBloom(rows) {
  return rows.reduce((bits, record) => bits | keyMask(record.key), 0);
}

export function newLookup(key) {
  return {key, checked:new Set(), filters:new Map(), winner:null, complete:false};
}

export function trackProbe(trace, step) {
  if (step.bloom) trace.filters.set(step.source, step.bloom);
  if (step.source && step.bloom !== 'negative') trace.checked.add(step.source);
  if (step.candidate) trace.candidate = step.candidate;
  if (step.found) trace.winner = step.found;
  if (step.found || step.exhausted) trace.complete = true;
}
