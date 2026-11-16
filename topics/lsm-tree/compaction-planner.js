// Teaching budgets use UTF-8 key/value bytes, the same unit as the memtable.
export const sandboxLimits = {memtableBytes:32, files:4};
export const policies = {tiered:'Size-tiered', leveled:'Leveled'};
const utf8 = new TextEncoder();

export function payloadBytes(records) {
  let bytes = 0;
  for (const {key,value} of records) bytes += utf8.encode(key).length + utf8.encode(value ?? '').length;
  return bytes;
}

export function newestVersion(records) {
  return records.reduce((best, row) => row && (!best || row.seq > best.seq) ? row : best, null);
}

function tierLimit(bytes) {
  let limit = sandboxLimits.memtableBytes;
  while (bytes > limit) limit *= 2;
  return limit;
}

export function fileLabel(file, policy) {
  const layout = policy === 'leveled' ? 'L' + file.level : file.bytes + ' B';
  return file.name + ' · ' + layout + ' · ' + file.rows[0].key + '–' + file.rows.at(-1).key;
}

function overlaps(table, low, high) {
  return table.rows[0].key <= high && table.rows.at(-1).key >= low;
}

export function selectInputs(tables, policy, automatic) {
  if (policy === 'tiered') {
    const buckets = new Map();
    for (const table of tables) {
      const limit = tierLimit(table.bytes);
      if (!buckets.has(limit)) buckets.set(limit, []);
      buckets.get(limit).push(table);
    }
    for (const limit of [...buckets.keys()].sort((a,b) => a-b)) {
      const peers = buckets.get(limit);
      if (peers.length < (automatic ? sandboxLimits.files : 2)) continue;
      const inputs = peers.slice(-sandboxLimits.files);
      return {inputs, level:0, reason:`${inputs.length} files share the size tier up to ${limit} B.`};
    }
    return null;
  }

  if (policy === 'leveled') {
    const l0 = tables.filter(t => t.level === 0);
    let level = 0;
    let candidates = l0;
    let reason = `L0 contains ${l0.length} files.`;
    if (!l0.length || (automatic && l0.length < sandboxLimits.files)) {
      const levels = [...new Set(tables.map(t => t.level))].filter(n => n > 0).sort((a,b) => a-b);
      candidates = [];
      for (level of levels) {
        const files = tables.filter(t => t.level === level);
        const bytes = files.reduce((sum,t) => sum+t.bytes,0);
        const budget = sandboxLimits.memtableBytes * sandboxLimits.files ** level;
        if (bytes > budget) {
          candidates = files;
          reason = `L${level} holds ${bytes} B, above its ${budget} B budget.`;
          break;
        }
      }
    }
    if (!candidates.length) return null;
    const oldest = candidates.at(-1);
    const inputs = new Set([oldest]);
    let low = oldest.rows[0].key, high = oldest.rows.at(-1).key;
    // At L0 a newly included range can touch another L0 file.
    if (level === 0) {
      let previous;
      do {
        previous = inputs.size;
        for (const file of l0) {
          if (!overlaps(file,low,high)) continue;
          inputs.add(file);
          if (file.rows[0].key < low) low = file.rows[0].key;
          if (file.rows.at(-1).key > high) high = file.rows.at(-1).key;
        }
      } while (inputs.size !== previous);
    }
    for (const file of tables) {
      if (file.level === level+1 && overlaps(file,low,high)) inputs.add(file);
    }
    return {inputs:tables.filter(t => inputs.has(t)), level:level+1,
      reason:`${reason} Start at ${oldest.name} and carry ${low}–${high} into L${level+1}, including overlapping files there.`};
  }

  if (tables.length < (automatic ? sandboxLimits.files : 2)) return null;
  return {inputs:tables.slice(), level:0, reason:`${tables.length} installed SSTables.`};
}
