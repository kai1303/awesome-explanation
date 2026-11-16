import { bloomBits, filterFor, keyMask, mayContain } from './filter.js';

export const slots = Array.from({length: bloomBits}, (_, i) => i);
export const bitAt = (bits, i) => (bits >>> i) & 1;
export const positions = key => slots.filter(i => bitAt(keyMask(key), i));
const defaultKeys = ['birch', 'elm', 'juniper'];

export function lessonHref(file, keys, query, mode = 'query') {
  const params = new URLSearchParams({file, query, mode});
  keys.forEach(key => params.append('key', key));
  return '../bloom-filter/?' + params;
}

export function readExample(search) {
  const params = new URLSearchParams(search);
  const keys = [...new Set(params.getAll('key').filter(Boolean))];
  return {keys: keys.length ? keys : defaultKeys,
    file: keys.length ? params.get('file') : null, query: params.get('query') || 'juniper'};
}

export function outcome(keys, query) {
  const filter = filterFor(keys);
  if (!mayContain(filter, query)) return 'absent';
  return keys.includes(query) ? 'found' : 'false positive';
}

export function casesFor(keys, query) {
  const cases = new Map([[outcome(keys,query),query]]);
  if (!cases.has('found')) cases.set('found', keys[0]);
  const bits = filterFor(keys);
  const stored = new Set(keys);
  const tryKey = key => {
    if (stored.has(key)) return;
    const kind = mayContain(bits, key) ? 'false positive' : 'absent';
    if (!cases.has(kind)) cases.set(kind,key);
  };
  for (const key of ['cedar','teak','ash','rowan','elm','juniper','birch','maple','yew','oak','pine']) tryKey(key);
  for (let i = 1; i <= 4096 && (!cases.has('false positive') || (bits !== 65535 && !cases.has('absent'))); i++) tryKey('leaf-' + i);
  return [...cases.values()];
}

export function frameFor(keys, query, mode, step) {
  const inserting = mode === 'insert';
  const count = inserting ? step : keys.length;
  const bits = filterFor(keys.slice(0, count));
  const phase = inserting ? (step === 0 ? 'empty' : 'build') : ['ready', 'probe', 'result'][step];
  const key = inserting ? keys[Math.max(0, step - 1)] : query;
  return {phase, key, bits, count, active: step === 0 ? [] : positions(key)};
}
