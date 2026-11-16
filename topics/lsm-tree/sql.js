// The sandbox exposes one table and one primary-key lookup per statement.
export const sqlVerbs = {create:'INSERT', read:'SELECT', update:'UPDATE', delete:'DELETE', write:'INSERT'};
const quote = text => "'" + text.replaceAll("'", "''") + "'";
const unquote = text => text.slice(1,-1).replaceAll("''", "'");

export function exampleSQL(op, key, value) {
  const k = quote(key);
  if (op === 'read') return `SELECT * FROM records WHERE key = ${k};`;
  if (op === 'delete') return `DELETE FROM records WHERE key = ${k};`;
  if (op === 'update') return `UPDATE records SET value = ${quote(value)} WHERE key = ${k};`;
  const insert = `INSERT INTO records (key, value) VALUES (${k}, ${quote(value)})`;
  return insert + (op === 'write' ? ' ON CONFLICT (key) DO UPDATE SET value = excluded.value;' : ';');
}

const literal = /'(?:[^']|'')*'/.source;
function statement(pattern) {
  return new RegExp('^' + pattern.replaceAll('KEY_LITERAL', '(?<key>' + literal + ')')
    .replaceAll('VALUE_LITERAL', '(?<value>' + literal + ')') + '\\s*;?$', 'i');
}
const patterns = {
  read:statement(String.raw`SELECT\s+\*\s+FROM\s+records\s+WHERE\s+key\s*=\s*KEY_LITERAL`),
  create:statement(String.raw`INSERT\s+INTO\s+records\s*\(\s*key\s*,\s*value\s*\)\s*VALUES\s*\(\s*KEY_LITERAL\s*,\s*VALUE_LITERAL\s*\)(?<upsert>\s+ON\s+CONFLICT\s*\(\s*key\s*\)\s+DO\s+UPDATE\s+SET\s+value\s*=\s*excluded\.value)?`),
  update:statement(String.raw`UPDATE\s+records\s+SET\s+value\s*=\s*VALUE_LITERAL\s+WHERE\s+key\s*=\s*KEY_LITERAL`),
  delete:statement(String.raw`DELETE\s+FROM\s+records\s+WHERE\s+key\s*=\s*KEY_LITERAL`)
};

export function parseSQL(sql) {
  for (const [op,pattern] of Object.entries(patterns)) {
    const match = pattern.exec(sql.trim());
    if (!match) continue;
    const key = unquote(match.groups.key);
    const value = match.groups.value && unquote(match.groups.value);
    if (!key || key.length > 36) return {error:'Use a key between 1 and 36 characters.'};
    if (value !== undefined && (!value || value.length > 48)) return {error:'Use a value between 1 and 48 characters.'};
    return {op:match.groups.upsert ? 'write' : op, key, value};
  }
  return {error:'Choose an example and edit its quoted text. Run one statement for one key at a time.'};
}
