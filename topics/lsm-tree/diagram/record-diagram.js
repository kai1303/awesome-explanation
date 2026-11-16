export const seq = n => '#' + String(n).padStart(2, '0');
export const stepY = 34;
export const rowH = 24;
export const left = 8, middle = 273, right = 533;
export const rowWidth = 172;
export const svgWidth = right + rowWidth + 8;

export function recordDiagram(svg, emphasize) {
  let pinned = null;
  const paths = svg.append('g').attr('aria-hidden','true');
  const content = svg.append('g');
  function label(x, y, text, cls) {
    return content.append('text').attr('x',x).attr('y',y).attr('class',cls).text(text);
  }
  function record(x, y, record, cls, text, description) {
    const group = content.append('g').attr('class','merge-row '+cls)
      .attr('transform',`translate(${x} ${y})`).attr('data-key',record.key)
      .attr('tabindex',0).attr('role','button').attr('aria-label',description);
    group.append('title').text(description);
    group.append('rect').attr('width',rowWidth).attr('height',rowH).attr('rx',3);
    const display = text.length > 23 ? text.slice(0,22)+'…' : text;
    group.append('text').attr('x',6).attr('y',16).text(display);
    const pin = () => { pinned = pinned === record.key ? null : record.key; emphasize(pinned); };
    group.on('pointerenter focus',()=>emphasize(record.key)).on('pointerleave blur',()=>emphasize(pinned))
      .on('click',pin).on('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();pin();}
      });
  }
  function connect(x,y,X,Y,key,cls) {
    const bend=(X-x)*.57;
    paths.append('path').attr('data-key',key).attr('class',cls)
      .attr('d',`M${x},${y} C${x+bend},${y} ${X-bend},${Y} ${X},${Y}`);
  }
  return { label, record, connect };
}
