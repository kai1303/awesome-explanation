import { StorageEngine } from './engine.js';

const batches = [
  [['birch','gold'], ['cedar','sage'], ['elm','red']],
  [['cedar','jade'], ['fir','silver green']],
  [['oak','deep brown'], ['pine','needles']],
  [['spruce','green'], ['yew','dark green']],
];

// Freeze the four flushes immediately before the automatic planner runs.
export function fourFileExample(policy) {
  const engine = new StorageEngine(policy);
  for (const batch of batches) {
    for (const [key,value] of batch) Array.from(engine.write(key,value));
    Array.from(engine.flush());
  }
  const files = [...engine.tables].reverse();
  return {engine, files, plan:engine.planCompaction(true)};
}
