// Data-model GRAPH layout — a containment TREE of datastores.
//
// Datastores are nodes connected by parent→child HIERARCHY arrows (server→database→table,
// filesystem→directory→file, …) — the only arrows in the graph. Each container's direct children
// are laid out below it (grid-packed when numerous) and each gets its own visible arrow, so the
// containment hierarchy reads as a tree. A record-set lists its columns inside the card; a container
// with > 12 leaf descendants starts COLLAPSED to a single node (click its header to expand).
//
// The behavioral nodes that touch a store are shown two ways ON the card: a total-count badge in
// the header (distinct interacting nodes), and a footer of per-VERB pills (writes / reads / persists
// to / projects from / connects via) — clicking a pill opens the Detail sidebar focused on that verb.
//
// Imperative (DOM + measurement + SVG), mounted via a ref like the flow Board; reuses setupPanZoom.
// ctx = { palette, onOpenDetail, collapsed:Set<id>, onToggle:(id)=>void }.
import { el } from './dom.js';
import { isRecordSet, datastoreConsumers, dataModelTree } from '../../application/read-models/indexes';
import { VERB_COLORS } from '../../domain/model/palette';

const svgNS = 'http://www.w3.org/2000/svg';
const CARDW = 250;        // fixed card / header width
const GAP = 24;           // gap between grid cells
const CHILDGAP = 54;      // vertical gap between a parent card and its children row (room for arrows)
const ROOTGAP = 70;       // gap between top-level root subtrees
const MAXROW = 3200;      // wrap roots into a new row past this width
const START = 46;         // top/left margin
const MAXCOLS = 14;       // field rows shown before "+N more"
const COLLAPSE_OVER = 12; // default-collapse a container with more leaf descendants than this
const VERB_ORDER = ['writes', 'persists to', 'projects from', 'reads', 'connects via'];

// Containers with > COLLAPSE_OVER leaf (table/file) descendants start collapsed.
export function defaultCollapsed(model, nodeById) {
  const stores = model.nodes.filter((n) => n.type === 'datastore');
  const kidsOf = (id) => stores.filter((s) => s.parent === id);
  const countLeaves = (ds) => { const k = kidsOf(ds.id); return k.length ? k.reduce((a, c) => a + countLeaves(c), 0) : 1; };
  const set = new Set();
  for (const s of stores) if (kidsOf(s.id).length && countLeaves(s) > COLLAPSE_OVER) set.add(s.id);
  return set;
}

export function renderDataModelInto(model, nodeById, lane, ctx) {
  const { palette: PALETTE, onOpenDetail, collapsed = new Set(), onToggle = () => {} } = ctx;
  lane.innerHTML = '';
  lane.style.position = 'relative';

  const stores = model.nodes.filter((n) => n.type === 'datastore');
  const { looseFields } = dataModelTree(model, nodeById);
  if (!stores.length && !looseFields.length) { lane.style.width = '10px'; lane.style.height = '10px'; return { w: 10, h: 10 }; }

  const childStores = (id) => stores.filter((s) => s.parent === id);
  const hasStoreChildren = (ds) => stores.some((s) => s.parent === ds.id);
  const fieldsOf = (id) => model.nodes.filter((n) => n.type === 'field' && n.parent === id);
  const isRoot = (ds) => { const p = ds.parent ? nodeById.get(ds.parent) : null; return !p || p.type !== 'datastore'; };
  const countLeaves = (ds) => { const k = childStores(ds.id); return k.length ? k.reduce((a, c) => a + countLeaves(c), 0) : 1; };

  // A field can itself parent sub-fields (a nested record / JSON sub-document). Those are in the header
  // total but are not a datastore's direct child, so recurse and indent them — nothing counted-but-hidden.
  const appendFieldRows = (wrap, fields, depth) => {
    for (const c of fields) {
      const attrs = { class: 'dm-node-col', onclick: (e) => { e.stopPropagation(); onOpenDetail(c.id); }, title: c.description || '' };
      if (depth) attrs.style = `padding-left:${12 + depth * 14}px`;
      const row = el('div', attrs, el('span', { class: 'dm-cn' }, c.label));
      if (c.dataType) row.append(el('span', { class: 'dm-ct' }, c.dataType));
      if (c.nullable === false) row.append(el('span', { class: 'dm-nn' }, 'NN'));
      wrap.append(row);
      const kids = fieldsOf(c.id);
      if (kids.length) appendFieldRows(wrap, kids, depth + 1);
    }
  };

  // distinct interacting nodes (total, for the header badge) + ordered distinct verbs (for pills)
  const behavioral = (ds) => {
    const cons = datastoreConsumers(model, nodeById, ds.id);
    const nodeIds = new Set(), verbSet = new Set();
    for (const c of cons) { nodeIds.add(c.node.id); verbSet.add(c.verb); }
    const verbs = [...verbSet].sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b));
    return { total: nodeIds.size, verbs };
  };
  const idx = (v) => { const i = VERB_ORDER.indexOf(v); return i < 0 ? 99 : i; };

  // append the total-count badge to the header row now; RETURN the footer pills (or null) so the
  // caller can append it as the card's LAST child (below the column list).
  const behavioralFooter = (headRow, ds) => {
    const b = behavioral(ds);
    if (b.total) headRow.append(el('span', { class: 'dm-total', title: b.total + ' behavioral node' + (b.total > 1 ? 's' : '') + ' interact with this store' }, String(b.total)));
    if (!b.verbs.length) return null;
    const foot = el('div', { class: 'dm-node-footer' });
    for (const v of b.verbs) {
      const pill = el('span', { class: 'dm-verb-pill', style: `background:${VERB_COLORS[v] || VERB_COLORS._default}`, title: v + ' — click to list them in the sidebar' }, v);
      pill.addEventListener('click', (e) => { e.stopPropagation(); onOpenDetail(ds.id, { focusVerb: v }); });
      foot.append(pill);
    }
    return foot;
  };

  const buildCard = (ds) => {
    const p = PALETTE.datastore;
    const card = el('div', { class: 'dm-node' });
    const head = el('div', { class: 'dm-node-head', onclick: () => onOpenDetail(ds.id) },
      el('span', { class: 'dm-badge', style: `background:${p.fill};color:${p.text}` }, (ds.storeKind || 'store').toUpperCase()),
      el('span', { class: 'dm-node-name' }, ds.label));
    card.append(head);
    const foot = behavioralFooter(head, ds);
    const meta = [];
    if (ds.host) meta.push(ds.host);
    if (ds.ownedBy) meta.push('owned by ' + ds.ownedBy);
    if (meta.length) card.append(el('div', { class: 'dm-node-meta' }, meta.join(' · ')));
    const fields = fieldsOf(ds.id);
    if (isRecordSet(model, nodeById, ds) && fields.length) {
      const wrap = el('div', { class: 'dm-node-cols' });
      appendFieldRows(wrap, fields.slice(0, MAXCOLS), 0);
      if (fields.length > MAXCOLS) wrap.append(el('div', { class: 'dm-node-more' }, '+' + (fields.length - MAXCOLS) + ' more fields'));
      card.append(wrap);
    }
    if (foot) card.append(foot);   // footer pills are the LAST child, below the columns
    return card;
  };

  // Fields orphaned from any datastore are still in the header total; a plain card lists them so the
  // count and the render agree instead of the tab claiming fields it never draws.
  const buildLooseCard = (fields) => {
    const card = el('div', { class: 'dm-node dm-loose' });
    card.append(el('div', { class: 'dm-node-head' },
      el('span', { class: 'dm-badge', style: 'background:#c3d3e2;color:#2c3e50' }, 'UNATTACHED'),
      el('span', { class: 'dm-node-name' }, 'Fields not tied to a store')));
    const wrap = el('div', { class: 'dm-node-cols' });
    appendFieldRows(wrap, fields, 0);
    card.append(wrap);
    return card;
  };

  const buildHead = (ds, isCollapsed) => {
    const p = PALETTE.datastore;
    const head = el('div', { class: 'dm-node dm-group-head' + (isCollapsed ? ' dm-collapsed' : ''), onclick: () => onToggle(ds.id) });
    const row = el('div', { class: 'dm-node-head' },
      el('span', { class: 'dm-arrow' }, isCollapsed ? '▸' : '▾'),
      el('span', { class: 'dm-badge', style: `background:${p.fill};color:${p.text}` }, (ds.storeKind || 'store').toUpperCase()),
      el('span', { class: 'dm-node-name' }, ds.label));
    head.append(row);
    const n = countLeaves(ds);
    const bits = [n + (n === 1 ? ' table' : ' tables')];
    if (isCollapsed) bits.push('click to expand');
    head.append(el('div', { class: 'dm-group-sub' }, bits.join(' · ')));
    if (ds.ownedBy) head.append(el('div', { class: 'dm-node-meta' }, 'owned by ' + ds.ownedBy));
    const foot = behavioralFooter(row, ds);
    if (foot) head.append(foot);   // footer pills last, below the "N tables" sub-line
    return head;
  };

  const arrows = [];  // {from:{x,y}, to:{x,y}} parent card bottom -> child card top

  function build(ds) {
    if (!hasStoreChildren(ds)) {
      const cardEl = buildCard(ds);
      lane.append(cardEl);
      return { ds, kind: 'leaf', el: cardEl, w: CARDW, h: cardEl.offsetHeight };
    }
    const isCollapsed = collapsed.has(ds.id);
    const header = buildHead(ds, isCollapsed);
    lane.append(header);
    const node = { ds, kind: 'container', collapsed: isCollapsed, el: header };
    if (isCollapsed) { node.w = CARDW; node.h = header.offsetHeight; return node; }
    node.children = childStores(ds.id).map(build);
    node.grid = packGrid(node.children);
    node.w = Math.max(CARDW, node.grid.w);
    node.h = header.offsetHeight + CHILDGAP + node.grid.h;
    return node;
  }

  function packGrid(nodes) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const cellW = Math.max(...nodes.map((n) => n.w));
    const colBottom = new Array(cols).fill(0);
    const cells = [];
    for (const n of nodes) {
      let c = 0; for (let i = 1; i < cols; i++) if (colBottom[i] < colBottom[c]) c = i;
      cells.push({ node: n, x: c * (cellW + GAP), y: colBottom[c] });
      colBottom[c] += n.h + GAP;
    }
    return { cells, w: cols * (cellW + GAP) - GAP, h: Math.max(...colBottom) - GAP };
  }

  function place(node, x, y) {
    const cardX = x + (node.w - CARDW) / 2;         // center the card over its children block
    node.el.style.left = cardX + 'px'; node.el.style.top = y + 'px';
    const ch = node.el.offsetHeight;
    node.cardCx = cardX + CARDW / 2; node.cardTop = y; node.cardBot = y + ch;
    if (node.kind === 'container' && !node.collapsed) {
      const gx = x + (node.w - node.grid.w) / 2, gy = y + ch + CHILDGAP;
      for (const cell of node.grid.cells) place(cell.node, gx + cell.x, gy + cell.y);
      for (const cell of node.grid.cells) arrows.push({ from: { x: node.cardCx, y: node.cardBot }, to: { x: cell.node.cardCx, y: cell.node.cardTop } });
    }
  }

  const roots = stores.filter(isRoot).map(build);
  if (looseFields.length) {
    const cardEl = buildLooseCard(looseFields);
    lane.append(cardEl);
    roots.push({ kind: 'leaf', el: cardEl, w: CARDW, h: cardEl.offsetHeight });
  }
  let cx = START, cy = START, rowH = 0;
  for (const rn of roots) {
    if (cx > START && cx + rn.w > MAXROW) { cx = START; cy += rowH + ROOTGAP; rowH = 0; }
    place(rn, cx, cy);
    cx += rn.w + ROOTGAP; rowH = Math.max(rowH, rn.h);
  }

  const M = 46;
  let maxR = 0, maxB = 0;
  lane.querySelectorAll('.dm-node').forEach((e) => { maxR = Math.max(maxR, e.offsetLeft + e.offsetWidth); maxB = Math.max(maxB, e.offsetTop + e.offsetHeight); });
  const W = maxR + M, H = maxB + M;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'edges'); svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.innerHTML = '<defs><marker id="dm-ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#aebfd0"/></marker></defs>';
  lane.prepend(svg);
  for (const e of arrows) svg.append(makePath(curveDown(e.from, e.to)));

  lane.style.width = W + 'px'; lane.style.height = H + 'px';
  return { w: W, h: H };
}

function curveDown(p1, p2) {
  const dy = Math.max(18, (p2.y - p1.y) * 0.5);
  return 'M' + p1.x + ',' + p1.y + ' C' + p1.x + ',' + (p1.y + dy) + ' ' + p2.x + ',' + (p2.y - dy) + ' ' + p2.x + ',' + p2.y;
}
function makePath(d) {
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#aebfd0'); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('marker-end', 'url(#dm-ah)');
  return path;
}
