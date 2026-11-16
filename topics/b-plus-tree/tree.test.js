import test from 'node:test';
import assert from 'node:assert/strict';
import { traceInsert } from './tree.js';

test('the article shows an overflow, links the new leaf, then copies its boundary', () => {
  const frames = traceInsert(35);
  const at = phase => frames.find(frame => frame.phase === phase);
  assert.deepEqual(at('insert').leaves[1].keys, [20,30,35,40,50]);
  assert.deepEqual(at('split').separators, [20]);
  assert.deepEqual(at('split').children, ['A','B']);
  assert.deepEqual(at('split').leaves[1].keys, [20,30]);
  assert.deepEqual(at('parent').separators, [20,35]);
  assert.deepEqual(at('parent').leaves[2].keys, [35,40,50]);
  assert.equal(at('follow').active, 'C');
  assert.deepEqual(frames.at(-1).result, [30,35,40]);
});

test('all supported inputs route equality right and preserve sorted leaf and scan contents', () => {
  const seed = [5,10,20,30,40,50];
  for (let key = 0; key <= 99; key++) {
    const frames = traceInsert(key);
    assert.equal(frames.find(f => f.phase === 'route').active, key < 20 ? 'A' : 'B');
    const last = frames.at(-1);
    const keys = [...new Set([...seed,key])].sort((a,b) => a-b);
    assert.deepEqual(last.leaves.flatMap(l => l.keys), keys);
    assert.deepEqual(last.separators, last.leaves.slice(1).map(l => l.keys[0]));
    assert.deepEqual(last.result, keys.filter(k => k >= 30 && k <= 42));
  }
});

test('the separator lesson starts before the copy and adapts to the inserted key', async () => {
  const { lessonAt } = await import('./lessons.js');
  for (const [key, expected] of [[35, '35'], [25, '30'], [90, '40']]) {
    const frames = traceInsert(key);
    const index = frames.findIndex(f => f.phase === 'split');
    const lesson = lessonAt(frames, index);
    assert.equal(lesson.answer, expected);
    assert.ok(lesson.choices.includes(expected));
    assert.ok(!frames[index].separators.includes(Number(expected)));
    assert.ok(frames[index+1].separators.includes(Number(expected)));
    assert.equal(frames[index+1].leaves.at(-1).keys[0], Number(expected));
  }
});
