import test from 'node:test';
import assert from 'node:assert/strict';
import { casesFor, frameFor, lessonHref, outcome, readExample } from './model.js';
test('the three Juniper demo branches use the stored bits, including a real collision', () => {
  const {keys,query} = readExample('');
  assert.deepEqual(casesFor(keys,query).map(key => outcome(keys,key)), ['found','absent','false positive']);
  assert.equal(outcome(keys,'teak'),'false positive');
  assert.deepEqual(frameFor(keys,'teak','query',1).active,[6,13]);
  assert.equal(frameFor(keys,query,'insert',0).bits,0);
  assert.equal(frameFor(keys,query,'insert',3).bits,frameFor(keys,'teak','query',0).bits);
  assert.ok(keys.every(key => outcome(keys,key) === 'found'));
});
test('a link carries the actual file keys and lookup, including reserved characters', () => {
  const keys=['birch','ash & oak'];
  const url = new URL(lessonHref('run-004.sst',keys,'ash & oak'),'http://localhost/topics/lsm-tree/');
  assert.deepEqual(readExample(url.search),{keys,query:'ash & oak',file:'run-004.sst'});
});
