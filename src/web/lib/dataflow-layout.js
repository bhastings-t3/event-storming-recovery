// The Data view for a flow: an INTERACTION graph, not a containment tree (see
// datamodel-layout.js for that) and not the flow diagram with data nodes woven back in (see
// layout.js, which strips them). Shows only this flow's behavioral nodes that touch a data
// store/field, connected to those stores/fields, with the storage verb labelling each arrow.
//
// Reuses the flow board's visual language (COLW/ROWH, sticky cards, curved SVG arrows with the
// same markers) so the toggle feels like flipping a view, not landing on a different tool. Much
// smaller graph than the flow board, so no node duplication / read-model satellites / invariant
// handling here — just rank, place, measure, route.
import { el } from './dom.js';
import { flowNodeIds, isDataNode } from '../../lib/selectors.mjs';

const svgNS = 'http://www.w3.org/2000/svg';
const COLW = 300, ROWH = 152, PAD = 40;

// Render this flow's data-interaction graph into `lane` (sizing it), returning its {w,h}. Same
// contract as renderFlowInto: clear the lane, build DOM absolutely-positioned, measure, size.
export function renderDataFlowInto(flow, lane, ctx) {
  const { nodeById, palette: PALETTE } = ctx;
  lane.innerHTML = '';
  lane.style.position = 'relative';

  const dataIds = new Set([...flowNodeIds(flow)].filter((id) => isDataNode(nodeById.get(id))));
  if (!dataIds.size) { lane.style.width = '10px'; lane.style.height = '10px'; return { w: 10, h: 10 }; }

  // keep every edge touching a data node; its endpoints (data + the behavioral nodes touching
  // them) are the whole node set. Nothing else makes it in.
  const edges = (flow.edges || []).filter((e) => dataIds.has(e.from) || dataIds.has(e.to));
  const nodeIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  // a data node reachable by no edge still belongs here as an isolated card, so this graph never
  // shows less than the "Data touched" list below it (which has the same fallback)
  for (const id of dataIds) nodeIds.add(id);
  const nodes = [...nodeIds].map((id) => nodeById.get(id)).filter(Boolean);

  // --- rank left-to-right by longest path over the kept edges (cycle-safe bounded relaxation,
  // same idiom as layout.js:62-64, so a cyclic data model can't hang) ---
  const rank = {}; nodes.forEach((n) => (rank[n.id] = 0));
  for (let it = 0; it < nodes.length + 2; it++) {
    let ch = false;
    for (const e of edges) { if (rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; ch = true; } }
    if (!ch) break;
  }

  // --- position: x by rank, y by predecessor barycenter within the rank ---
  // Ordering a column by insertion tangles arrows as soon as several nodes converge on one store;
  // sorting by the mean y of already-placed predecessors is the same crossing-reduction pass the
  // flow board does (layout.js:104-111). Ranks are walked left to right so predecessors are placed first.
  const byRank = {};
  nodes.forEach((n) => (byRank[rank[n.id]] ||= []).push(n));
  const preds = {};
  nodes.forEach((n) => (preds[n.id] = []));
  for (const e of edges) if (preds[e.to]) preds[e.to].push(e.from);
  const pos = {}, yOf = new Map(), bary = new Map();
  for (const r of Object.keys(byRank).map(Number).sort((a, b) => a - b)) {
    const col = byRank[r];
    col.forEach((n, i) => {
      const ps = preds[n.id].filter((p) => yOf.has(p));
      bary.set(n.id, ps.length ? ps.reduce((s, p) => s + yOf.get(p), 0) / ps.length : i * 0.001);
    });
    col.sort((a, b) => bary.get(a.id) - bary.get(b.id));
    col.forEach((n, i) => {
      const y = (i - (col.length - 1) / 2) * ROWH;
      yOf.set(n.id, y); pos[n.id] = { x: r * COLW, y };
    });
  }

  // place cards, then measure (offsetWidth/Height only exist post-append, same as the flow engine)
  const cardById = {}, box = {};
  for (const n of nodes) cardById[n.id] = placeCard(n, lane, pos[n.id].x, pos[n.id].y, ctx);
  for (const n of nodes) {
    const e = cardById[n.id], b = { x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight };
    b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; box[n.id] = b;
  }

  // shift into positive space with a margin; size the lane to fit (mirrors layout.js's maxR/maxB + PAD)
  let minL = Infinity, minT = Infinity;
  nodes.forEach((n) => { minL = Math.min(minL, box[n.id].x); minT = Math.min(minT, box[n.id].y); });
  const sx = PAD - minL, sy = PAD - minT;
  let maxR = 0, maxB = 0;
  for (const n of nodes) {
    const e = cardById[n.id], b = box[n.id];
    b.x += sx; b.y += sy; b.cx += sx; b.cy += sy;
    e.style.left = b.x + 'px'; e.style.top = b.y + 'px';
    maxR = Math.max(maxR, b.x + b.w); maxB = Math.max(maxB, b.y + b.h);
  }
  lane.style.width = (maxR + PAD) + 'px'; lane.style.height = (maxB + PAD) + 'px';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'edges'); svg.setAttribute('width', maxR + PAD); svg.setAttribute('height', maxB + PAD);
  svg.innerHTML = '<defs>' +
    '<marker id="ah" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#b7b7c2"/></marker>' +
    '<marker id="ahd" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#7f7f8e"/></marker>' +
    '</defs>';
  lane.prepend(svg);

  // storage edges are solid (not dashed, unlike the flow board's query/read-model connectors) and
  // every one is labelled with its verb at the arrow midpoint.
  for (const d of edges) {
    const a = box[d.from], b = box[d.to]; if (!a || !b) continue;
    const p1 = borderPoint(a, b.cx, b.cy), p2 = borderPoint(b, a.cx, a.cy);
    svg.append(makePath(curveD(p1, p2)));
    if (d.verb) lane.append(el('div', { class: 'edge-verb', style: 'left:' + ((p1.x + p2.x) / 2) + 'px;top:' + ((p1.y + p2.y) / 2) + 'px' }, d.verb));
  }

  return { w: maxR + PAD, h: maxB + PAD };
}

function placeCard(n, lane, x, y, ctx) {
  const { palette: PALETTE, selectedId, onOpenDetail } = ctx;
  const p = PALETTE[n.type] || PALETTE.invariant;
  const c = el('div', { class: 'sticky' + (selectedId === n.id ? ' selected' : ''), style: 'left:' + x + 'px;top:' + y + 'px;background:' + p.fill + ';border-color:' + p.edge + ';color:' + p.text, onclick: () => onOpenDetail(n.id) },
    el('div', { class: 'ntype' }, p.name), el('div', { class: 'nlabel' }, n.label));
  if (ctx.onContextMenu) c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ctx.onContextMenu(e, n.id); });
  lane.append(c); return c;
}

// point on a box's border in the direction of (tx,ty) — same as layout.js's borderPoint
function borderPoint(b, tx, ty) {
  const dx = tx - b.cx, dy = ty - b.cy;
  if (!dx && !dy) return { x: b.cx, y: b.cy };
  const s = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
  return { x: b.cx + dx * s, y: b.cy + dy * s };
}
function makePath(d) {
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#b7b7c2'); path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'miter'); path.setAttribute('stroke-linecap', 'butt');
  path.setAttribute('marker-end', 'url(#ah)');
  return path;
}
// curved connector between two border points — same as layout.js's curveD
function curveD(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) >= Math.abs(dy)) { const k = Math.max(22, Math.abs(dx) * 0.4), s = Math.sign(dx) || 1; return 'M' + p1.x + ',' + p1.y + ' C' + (p1.x + s * k) + ',' + p1.y + ' ' + (p2.x - s * k) + ',' + p2.y + ' ' + p2.x + ',' + p2.y; }
  const k = Math.max(18, Math.abs(dy) * 0.4), s = Math.sign(dy) || 1; return 'M' + p1.x + ',' + p1.y + ' C' + p1.x + ',' + (p1.y + s * k) + ' ' + p2.x + ',' + (p2.y - s * k) + ' ' + p2.x + ',' + p2.y;
}
