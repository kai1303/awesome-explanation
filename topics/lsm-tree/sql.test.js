import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleSQL, parseSQL} from './sql.js';

test('SQL literals round-trip and preserve case, apostrophes and semicolons', () => {
  const key = "O'Brien; tree";
  for (const op of ['read','create','update','delete','write']) {
    const value = ['create','update','write'].includes(op) ? "It's Moss" : undefined;
    assert.deepEqual(parseSQL(exampleSQL(op,key,value)), {op,key,value});
  }
  assert.deepEqual(parseSQL("select *\nFROM records where KEY='Juniper'"),{op:'read',key:'Juniper',value:undefined});
});

test('out-of-scope SQL and stacked statements cannot execute a partial command', () => {
  for (const sql of ["DELETE FROM records;", "DELETE FROM records WHERE key='a'; SELECT * FROM records;",
    "UPDATE records SET value='moss' WHERE key='a' OR key='b'", "SELECT * FROM other WHERE key='a'",
    "INSERT INTO records (key,value) VALUES ('a','unterminated)"]) assert.ok(parseSQL(sql).error);
});
