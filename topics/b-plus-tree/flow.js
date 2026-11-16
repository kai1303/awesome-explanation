import { chartMovement } from './movement.js';

// The chart measures its HTML rows after layout so ribbons stay attached on resize.
export function createFlow(board) {
  let links = [];
  const movement = chartMovement(board, wire);
  let previousTrace, previousIndex;
  const ns = 'http://www.w3.org/2000/svg';
  const wires = document.createElementNS(ns, 'svg');
  wires.setAttribute('aria-hidden', 'true');
  function wire() {
    if (!wires.isConnected) return;
    const origin = board.getBoundingClientRect();
    for (const {from, to, path} of links) {
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const x = a.right - origin.left, y = a.top + a.height / 2 - origin.top;
      const end = b.left - origin.left, bottom = b.top + b.height / 2 - origin.top;
      const mid = (x + end) / 2;
      path.setAttribute('d', `M${x},${y} C${mid},${y} ${mid},${bottom} ${end},${bottom}`);
    }
  }
  new ResizeObserver(wire).observe(board);
  function highlight(target) {
    const value = target?.closest?.('[data-value]')?.dataset.value;
    board.classList.toggle('tracing', value !== undefined);
    for (const node of board.querySelectorAll('[data-value]')) node.classList.toggle('lit', value !== undefined && node.dataset.value === value);
  }
  board.addEventListener('pointerover', event => highlight(event.target));
  board.addEventListener('pointerleave', () => highlight(document.activeElement));
  board.addEventListener('focusin', event => highlight(event.target));
  board.addEventListener('focusout', event => highlight(event.relatedTarget));
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  return function draw(frames, index, key, lesson, overview) {
    const frame = frames[index];
    const old = movement.before();
    board.classList.remove('tracing');
    board.replaceChildren(wires);
    links = [];
    wires.replaceChildren();
    function connect(from, to, kind, value) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('class', kind);
      if (value !== undefined) path.dataset.value = value;
      wires.append(path);
      links.push({from,to,path});
    }
    function column(title, subtitle, cls) {
      const stage = el('section', 'stage ' + cls);
      const body = el('div', 'stage-body');
      stage.dataset.stage = cls;
      const heading = el('h2','');
      const trigger = el('button','detail-trigger',title);
      trigger.type = 'button';
      trigger.dataset.detail = cls;
      trigger.setAttribute('aria-label', 'Explain ' + title);
      trigger.setAttribute('aria-haspopup','dialog');
      trigger.setAttribute('aria-controls','stage-detail');
      trigger.setAttribute('aria-expanded','false');
      const symbol = el('span','detail-icon','+');
      symbol.setAttribute('aria-hidden','true');
      trigger.append(symbol);
      heading.append(trigger);
      stage.append(heading, el('p','stage-sub',subtitle), body);
      board.append(stage);
      return body;
    }
    function mark(value, separatorCopy = false) {
      const node = el('span','key' + (value === key ? ' tracked' : ''),value);
      node.dataset.value = value;
      if (separatorCopy && value === frame.focus && frame.phase === 'parent') node.classList.add('focus-key');
      return node;
    }
    function page(id, keys) {
      const node = el('button', 'page ' + (id === 'root' ? 'root' : 'leaf leaf-' + id));
      node.type = 'button';
      node.dataset.page = id;
      const name = id === 'root' ? 'Root' : 'Leaf ' + id;
      const action = lesson?.pickPage && lesson.choices.includes(name) ? 'Choose ' : 'Inspect ';
      node.setAttribute('aria-label', action + name + ', keys ' + keys.join(', '));
      if (!overview && id === frame.active) node.classList.add('active');
      return node;
    }
    const input = column('Request', 'Index key', 'request');
    const root = column('Root index', 'Separator keys', 'routing');
    const leaves = column('Leaf pages', 'Sorted records', 'pages');
    const scan = column('Range scan', '30 ≤ key ≤ 42', 'scan');
    const output = column('Returned keys', 'In scan order', 'output');

    const request = el('button','request-key');
    request.append(el('small','',overview ? 'Indexed key' : 'Insert key'), mark(key));
    request.type = 'button';
    request.setAttribute('aria-label','Explain request for key ' + key);
    request.dataset.value = key;
    input.append(request);
    const rootPage = page('root',frame.separators);
    const separators = el('span','separators');
    frame.separators.forEach(k => separators.append(mark(k, true)));
    rootPage.append(el('strong','page-label','Root'), separators);
    const ports = frame.children.map((id,i) => {
      const lo = frame.separators[i-1], hi = frame.separators[i];
      const range = lo === undefined ? '< ' + hi : hi === undefined ? '≥ ' + lo : lo + ' – ' + (hi-1);
      const port = el('span','port leaf-' + id);
      port.append(el('span','',range),el('b','',id));
      rootPage.append(port);
      return port;
    });
    root.append(rootPage);
    const routeKnown = frame.phase !== 'start';
    const owner = frame.leaves.find(leaf => leaf.keys.includes(key));
    const targetPort = owner ? ports[frame.children.indexOf(owner.id)] : null;
    const boundary = [...separators.children].find(tile => Number(tile.textContent) === key);
    connect(request, boundary ?? targetPort ?? rootPage,'request-wire', key);

    const rows = new Map();
    frame.leaves.forEach((leaf,i) => {
      if (i) {
        const previous = frame.leaves[i-1].id;
        const active = frame.edge?.[0] === previous && frame.edge[1] === leaf.id;
        leaves.append(el('span','sibling' + (active ? ' following' : ''),'↓ next leaf'));
      }
      const node = page(leaf.id,leaf.keys);
      const label = el('span','page-label');
      label.append(el('strong','','Leaf ' + leaf.id),el('small','',leaf.keys.length + ' / 4'));
      node.append(label);
      leaf.keys.forEach(k => {
        const row = el('span','record');
        row.dataset.value = k;
        row.append(mark(k, true), el('span','record-label','record'));
        node.append(row);
        rows.set(k,{row, leaf:leaf.id});
      });
      leaves.append(node);
      const child = frame.children.indexOf(leaf.id);
      if (routeKnown && child >= 0 && owner?.id === leaf.id) connect(ports[child],rows.get(key).row,'key-wire guide-wire',key);
      if (child >= 0) connect(ports[child],label,'branch wire-' + leaf.id + (frame.edge?.[0] === 'root' && frame.edge[1] === leaf.id ? ' selected' : ''));
    });
    const seen = new Map();
    for (const step of frames.slice(0,index+1)) {
      if (['skip','collect','stop'].includes(step.phase)) seen.set(step.focus,step.phase);
    }
    const collected = new Map();
    for (const [value, {row,leaf}] of rows) {
      const decision = seen.get(value);
      const scanRow = el('button','scan-row' + (decision ? ' ' + decision : ' unread'));
      const status = {collect:'Keep',skip:'Skip',stop:'Stop'};
      scanRow.type = 'button';
      scanRow.setAttribute('aria-label','Explain scan decision for ' + value);
      scanRow.dataset.value = value;
      scanRow.append(mark(value),el('span','decision',status[decision] ?? 'Unread'));
      scan.append(scanRow);
      connect(row, scanRow, value === key ? 'key-wire' : 'wire-' + leaf,value);
      if (decision === 'collect') collected.set(value,scanRow);
    }
    for (const value of frame.result) {
      const row = el('button','out-row');
      row.type = 'button';
      row.setAttribute('aria-label','Explain returned key ' + value);
      row.dataset.value = value;
      row.append(mark(value),el('span','','returned'));
      output.append(row);
      connect(collected.get(value),row,value === key ? 'key-wire' : 'result-wire',value);
    }
    if (!frame.result.length) output.append(el('p','empty-output','Waiting for scan'));
    wire();
    movement.after(old, frame, previousTrace === frames && index === previousIndex + 1);
    previousTrace = frames;
    previousIndex = index;
  };
}
