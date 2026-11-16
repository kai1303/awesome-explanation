// A small filter makes every bit visible in the diagram. Two positions per key.
export const bloomBits = 16;

export const hashSeed = 2166136261;
export const hashMultiplier = 16777619;

export function bloomHash(key, onCharacter) {
  let hash = hashSeed;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    hash = Math.imul(hash ^ code, hashMultiplier) >>> 0;
    onCharacter?.(code, hash);
  }
  return hash;
}

export function hashPositions(hash) {
  const first = (hash >>> 16) & 15;
  const stride = (hash >>> 8) | 1;
  const second = (first + stride) & 15;
  return {first, stride, second};
}

export function keyMask(key) {
  const {first, second} = hashPositions(bloomHash(key));
  return (1 << first) | (1 << second);
}

export function filterFor(keys) {
  return keys.reduce((bits, key) => bits | keyMask(key), 0);
}

export function mayContain(bits, key) {
  const mask = keyMask(key);
  return (bits & mask) === mask;
}
