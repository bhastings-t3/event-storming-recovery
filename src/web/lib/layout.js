// The Event-Storming board layout engine, ported verbatim (behavior-for-behavior) from
// generate-views.js. It builds a flow's sticky lane by direct DOM construction and live
// measurement (offsetWidth/Height drive card placement and SVG edge routing), so it lives
// outside React and renders into a container element. React mounts it via a ref.
//
// Globals the original relied on (nodeById, PALETTE, selectedId, openDetail) are passed in
// through `ctx = { nodeById, palette, selectedId, onOpenDetail }`.
import { el } from './dom.js';
import { DATA_TYPE_SET } from '../../lib/selectors.mjs';

const svgNS = 'http://www.w3.org/2000/svg';
const DUP_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#a78bfa', '#63d471', '#ff9f43', '#4d96ff', '#ff6ec7', '#c0eb75', '#f78fb3', '#5ed0e0', '#e0a458'];

// Edge-driven layered layout: a horizontal causal SPINE (actor -> command -> aggregate ->
// event -> policy -> ...), parallel branches stacked vertically, read models as dotted
// satellites ABOVE the spine, invariants BELOW their aggregate. Driven entirely by edges.
const CAUSAL_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'calls', 'raises', 'returns', 'updates']);
const READ_VERBS = new Set(['reads', 'read by']);

// Render a single flow's board into the given lane element (sizing it), returning its {w,h}. No
// pan/zoom here, so the same engine drives both the single-flow board and each Overview box.
export function renderFlowInto(f, lane, ctx) {
  const { nodeById, palette: PALETTE } = ctx;
  lane.innerHTML = '';
  lane.style.position = 'relative';
  // Physical storage nodes (server/database/table/column) are a substrate, not steps in the
  // behavioral lane. Drop them and any edge touching them so the flow board stays behavioral;
  // the links survive in the model for the Data-model tab and the detail panel.
  const isData = (id) => { const n = nodeById.get(id); return n && DATA_TYPE_SET.has(n.type); };
  f = { ...f, steps: (f.steps || []).filter(id => !isData(id)), edges: (f.edges || []).filter(e => !isData(e.from) && !isData(e.to)) };
  const flowIds = new Set([...(f.steps || []), ...(f.edges || []).flatMap(e => [e.from, e.to])]);
  const stepIdx = {}; (f.steps || []).forEach((id, i) => (stepIdx[id] = i));
  const isRM = n => n && n.type === 'readModel';
  const isInv = n => n && n.type === 'invariant';
  const nodesArr = [...flowIds].map(id => nodeById.get(id)).filter(Boolean);
  // A node that is only ever READ in this flow (reads / read by) and never sits in the causal
  // chain is a read INPUT, not part of the spine (e.g. a command reading aggregate state). Render
  // it like a read model - above-left of its reader, dotted arrow into the left edge - instead of
  // stacking it in a column beside the reader.
  const edgesByNode = {};
  for (const e of (f.edges || [])) { (edgesByNode[e.from] ||= []).push(e); (edgesByNode[e.to] ||= []).push(e); }
  const readSatIds = new Set();
  for (const n of nodesArr) {
    if (isRM(n) || isInv(n)) continue;
    const es = edgesByNode[n.id] || [];
    if (es.some(e => READ_VERBS.has(e.verb)) && !es.some(e => CAUSAL_VERBS.has(e.verb))) readSatIds.add(n.id);
  }
  const isSat = n => n && (isRM(n) || readSatIds.has(n.id));
  const spine = nodesArr.filter(n => !isSat(n) && !isInv(n));
  const spineIds = new Set(spine.map(n => n.id));

  // --- rank the spine (cycle-broken longest path) ---
  const spineEdges = (f.edges || []).filter(e => spineIds.has(e.from) && spineIds.has(e.to) && CAUSAL_VERBS.has(e.verb));
  const adj = {}; spine.forEach(n => (adj[n.id] = []));
  for (const e of spineEdges) adj[e.from].push(e.to);
  const state = {}, back = new Set();
  const dfs = u => { state[u] = 1; for (const v of adj[u]) { if (state[v] === 1) back.add(u + '|' + v); else if (!state[v]) dfs(v); } state[u] = 2; };
  const indeg = {}; spine.forEach(n => (indeg[n.id] = 0));
  for (const e of spineEdges) indeg[e.to]++;
  spine.filter(n => indeg[n.id] === 0).forEach(n => { if (!state[n.id]) dfs(n.id); });
  spine.forEach(n => { if (!state[n.id]) dfs(n.id); });
  const dagEdges = spineEdges.filter(e => !back.has(e.from + '|' + e.to));
  const rank = {}; spine.forEach(n => (rank[n.id] = 0));
  for (let it = 0; it < spine.length + 2; it++) { let ch = false; for (const e of dagEdges) if (rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; ch = true; } if (!ch) break; }
  const dind = {}; spine.forEach(n => (dind[n.id] = 0)); for (const e of dagEdges) dind[e.to]++;
  for (const n of spine) {
    if (n.type === 'actor' || dind[n.id] > 0) continue;
    const nb = (f.edges || []).filter(e => e.from === n.id || e.to === n.id).map(e => (e.from === n.id ? e.to : e.from)).filter(x => spineIds.has(x) && x !== n.id).map(x => rank[x]);
    if (nb.length) rank[n.id] = Math.max(0, Math.min(...nb));
  }

  // --- build INSTANCES: nodes duplicate so the flow stays strictly left-to-right ---
  let uid = 0;
  const insts = [], primary = {}, instsOf = {}, instByIid = {};
  const mk = (node, r, kind, anchorIid) => { const o = { iid: ++uid, id: node.id, node, rank: r, kind: kind || 'spine', anchorIid }; insts.push(o); (instsOf[node.id] ||= []).push(o); instByIid[o.iid] = o; return o; };
  spine.forEach(n => { primary[n.id] = mk(n, rank[n.id], 'spine'); });
  const drawn = [];
  for (const e of (f.edges || [])) {
    const nf = nodeById.get(e.from), nt = nodeById.get(e.to); if (!nf || !nt) continue;
    if (isSat(nf) || isSat(nt)) {                            // read input (read model, or a node only READ here): one copy per reference, ABOVE-LEFT of its reader
      const satId = isSat(nf) ? e.from : e.to, rdrId = isSat(nf) ? e.to : e.from, anchor = primary[rdrId]; if (!anchor) continue;
      const satInst = mk(nodeById.get(satId), anchor.rank, 'rm', anchor.iid);
      drawn.push({ from: satInst.iid, to: anchor.iid, verb: e.verb, dashed: true, rm: true }); // arrow leaves the read input, enters the reader's left side
    } else if (isInv(nt)) {                                  // invariant below its aggregate
      const anchor = primary[e.from]; if (!anchor) continue;
      const invInst = mk(nodeById.get(e.to), anchor.rank, 'inv', anchor.iid);
      drawn.push({ from: anchor.iid, to: invInst.iid, verb: '', dashed: true });
    } else if (isInv(nf)) { continue; }
    else if (CAUSAL_VERBS.has(e.verb)) {                     // causal: forward, duplicating target if it would go backward
      const u = primary[e.from]; if (!u) continue;
      const v = rank[e.to] > rank[e.from] ? primary[e.to] : mk(nodeById.get(e.to), rank[e.from] + 1, 'spine');
      drawn.push({ from: u.iid, to: v.iid, verb: e.verb, dashed: false });
    } else {                                                 // spine-spine query (e.g. reads): dotted, no dup
      const u = primary[e.from], v = primary[e.to]; if (!u || !v) continue;
      drawn.push({ from: u.iid, to: v.iid, verb: e.verb, dashed: true });
    }
  }

  // --- spine positions: x by rank, y by predecessor barycenter ---
  const COLW = 300, ROWH = 152;
  const spineInsts = insts.filter(o => o.kind === 'spine');
  const byRank = {}; spineInsts.forEach(o => (byRank[o.rank] ||= []).push(o));
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const preds = {}; spineInsts.forEach(o => (preds[o.iid] = []));
  for (const d of drawn) { const to = instByIid[d.to], from = instByIid[d.from]; if (!d.dashed && to.kind === 'spine' && from.kind === 'spine') preds[to.iid].push(from.iid); }
  const yOf = {};
  for (const r of ranks) {
    const col = byRank[r];
    col.forEach(o => { const ps = preds[o.iid]; o._pref = ps.length ? ps.reduce((s, i) => s + (yOf[i] ?? 0), 0) / ps.length : (stepIdx[o.id] ?? o.iid) * 0.001; });
    col.sort((a, b) => a._pref - b._pref);
    col.forEach((o, i) => { yOf[o.iid] = (i - (col.length - 1) / 2) * ROWH; o.x = r * COLW; o.y = yOf[o.iid]; });
  }

  // duplicated nodes get a unifying corner-dot color
  let dupI = 0; const dupColor = {};
  for (const id in instsOf) if (instsOf[id].length > 1) dupColor[id] = DUP_COLORS[dupI++ % DUP_COLORS.length];

  // place spine cards, measure them
  const cardByIid = {}, box = {};
  const measure = o => { const e = cardByIid[o.iid], b = { x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }; b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; box[o.iid] = b; };
  for (const o of spineInsts) { cardByIid[o.iid] = placeCard(o, lane, o.x, o.y, dupColor[o.id], ctx); measure(o); }
  let spineTop = Infinity, spineBottom = -Infinity;
  spineInsts.forEach(o => { spineTop = Math.min(spineTop, box[o.iid].y); spineBottom = Math.max(spineBottom, box[o.iid].y + box[o.iid].h); });

  // satellites sit in bands strictly ABOVE (read models) / BELOW (invariants) the spine, packed by
  // x-interval so duplicates never overlap each other or a spine card. Dotted connectors reach them.
  const GAP = 26;
  const packBand = (list, above, xOf) => {
    if (!list.length) return;
    for (const o of list) { cardByIid[o.iid] = placeCard(o, lane, 0, 0, dupColor[o.id], ctx); measure(o); }
    list.sort((a, b) => box[a.anchorIid].cx - box[b.anchorIid].cx);
    const rows = [];
    for (const o of list) { const b = box[o.iid], x = xOf(box[o.anchorIid], b.w); let r = 0; while (rows[r] && rows[r].some(iv => x < iv[1] + 18 && x + b.w > iv[0] - 18)) r++; (rows[r] ||= []).push([x, x + b.w]); o._row = r; o._x = x; }
    const rowH = rows.map((_, r) => Math.max(...list.filter(o => o._row === r).map(o => box[o.iid].h)));
    const rowTop = [];
    for (let r = 0; r < rows.length; r++) rowTop[r] = above ? (r === 0 ? spineTop - GAP - rowH[0] : rowTop[r - 1] - GAP - rowH[r]) : (r === 0 ? spineBottom + GAP : rowTop[r - 1] + rowH[r - 1] + GAP);
    for (const o of list) { const e = cardByIid[o.iid], b = box[o.iid]; e.style.left = o._x + 'px'; e.style.top = rowTop[o._row] + 'px'; b.x = o._x; b.y = rowTop[o._row]; b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; }
  };
  // read models sit ABOVE and to the LEFT of their consumer (dotted arrow enters the consumer's left
  // side); invariants sit centered BELOW their aggregate.
  packBand(insts.filter(o => o.kind === 'rm'), true, (ab, w) => ab.x - w - 18);
  packBand(insts.filter(o => o.kind === 'inv'), false, (ab, w) => ab.cx - w / 2);

  // shift everything into positive space with padding; size the canvas
  const PAD = 40;
  let minL = Infinity, minT = Infinity;
  insts.forEach(o => { minL = Math.min(minL, box[o.iid].x); minT = Math.min(minT, box[o.iid].y); });
  const sx = PAD - minL, spineCenterY = PAD - minT;
  let maxR = 0, maxB = 0;
  for (const o of insts) { const e = cardByIid[o.iid], b = box[o.iid]; b.x += sx; b.y += spineCenterY; b.cx += sx; b.cy += spineCenterY; e.style.left = b.x + 'px'; e.style.top = b.y + 'px'; maxR = Math.max(maxR, b.x + b.w); maxB = Math.max(maxB, b.y + b.h); }
  lane.style.width = (maxR + PAD) + 'px'; lane.style.height = (maxB + PAD) + 'px';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'edges'); svg.setAttribute('width', maxR + PAD); svg.setAttribute('height', maxB + PAD);
  svg.innerHTML = '<defs>' +
    '<marker id="ah" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#b7b7c2"/></marker>' +
    '<marker id="ahd" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#7f7f8e"/></marker>' +
    '</defs>';
  lane.prepend(svg);

  // curved connectors (the flow is left-to-right thanks to duplication, so short forward hops)
  const edgeEls = [];
  for (const d of drawn) {
    const a = box[d.from], b = box[d.to]; if (!a || !b) continue;
    let p1, p2, dStr;
    if (d.rm) {                                   // read model -> enters the consumer's LEFT edge
      p1 = borderPoint(a, b.cx, b.cy);
      p2 = { x: b.x, y: Math.max(b.y + 12, Math.min(b.y + b.h - 12, a.cy)) };
      dStr = curveInto(p1, p2);
    } else {
      p1 = borderPoint(a, b.cx, b.cy); p2 = borderPoint(b, a.cx, a.cy);
      dStr = curveD(p1, p2);
    }
    const path = makePath(dStr, d.dashed); svg.append(path);
    let labelEl = null;
    if (d.verb && !d.dashed) { labelEl = el('div', { class: 'edge-verb', style: 'left:' + ((p1.x + p2.x) / 2) + 'px;top:' + ((p1.y + p2.y) / 2) + 'px' }, d.verb); lane.append(labelEl); }
    edgeEls.push({ path, labelEl, from: d.from, to: d.to });
  }

  // hover-focus. Light a set of instances + everything they connect to; dim the rest.
  // Hovering a STICKY focuses just that instance's neighborhood; hovering its corner DOT
  // focuses every duplicate of that node (and all their neighbors).
  const focusSet = S => {
    const keep = new Set(S), lit = new Set();
    edgeEls.forEach((ed, i) => { if (S.has(ed.from) || S.has(ed.to)) { lit.add(i); keep.add(ed.from); keep.add(ed.to); } });
    lane.classList.add('focusing');
    for (const o of insts) cardByIid[o.iid].classList.toggle('lo', !keep.has(o.iid));
    edgeEls.forEach((ed, i) => { const off = !lit.has(i); ed.path.classList.toggle('lo', off); if (ed.labelEl) ed.labelEl.classList.toggle('lo', off); });
  };
  const unfocus = () => { lane.classList.remove('focusing'); lane.querySelectorAll('.lo').forEach(e => e.classList.remove('lo')); };
  for (const o of insts) {
    const c = cardByIid[o.iid];
    c.addEventListener('mouseenter', () => focusSet(new Set([o.iid])));
    c.addEventListener('mouseleave', unfocus);
    const dot = c.querySelector('.dupdot');
    if (dot) {
      dot.addEventListener('mouseenter', () => focusSet(new Set(instsOf[o.id].map(x => x.iid))));
      dot.addEventListener('mouseleave', () => focusSet(new Set([o.iid])));  // back onto the sticky
    }
  }

  return { w: maxR + PAD, h: maxB + PAD };
}

// One pan/zoom controller for a board: wheel zooms toward the cursor, left-drag on the
// background pans, buttons zoom/fit. Attached to a persistent wrap once; later renders just
// swap in the new lane and re-fit.
export function setupPanZoom(wrap, lane, ids) {
  if (wrap.__pz) { wrap.__pz.lane = lane; return wrap.__pz; }
  ids = ids || { zin: 'zin', zout: 'zout', zfit: 'zfit' };
  const st = { wrap, lane, scale: 1, tx: 0, ty: 0, cw: 0, ch: 0 };
  const MIN = 0.12, MAX = 2.6;
  const apply = () => { st.lane.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')'; };
  st.fit = (cw, ch) => {
    st.cw = cw; st.ch = ch;
    const vw = wrap.clientWidth, vh = wrap.clientHeight, m = 48;
    st.scale = Math.max(MIN, Math.min(1, (vw - m) / cw, (vh - m) / ch));
    st.tx = (vw - cw * st.scale) / 2;
    st.ty = (vh - ch * st.scale) / 2;
    apply();
  };
  st.zoomAt = (factor, px, py) => {
    const ns = Math.min(MAX, Math.max(MIN, st.scale * factor)), k = ns / st.scale;
    st.tx = px - (px - st.tx) * k; st.ty = py - (py - st.ty) * k; st.scale = ns; apply();
  };
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const r = wrap.getBoundingClientRect();
    st.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.sticky, .inv, .dupdot, .zoomctl, .ctx-title')) return;
    panning = true; sx = e.clientX; sy = e.clientY; ox = st.tx; oy = st.ty;
    wrap.classList.add('grabbing'); wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', e => { if (panning) { st.tx = ox + (e.clientX - sx); st.ty = oy + (e.clientY - sy); apply(); } });
  const endPan = e => { if (panning) { panning = false; wrap.classList.remove('grabbing'); try { wrap.releasePointerCapture(e.pointerId); } catch (_) { } } };
  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);
  const btn = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
  btn(ids.zin, () => st.zoomAt(1.25, wrap.clientWidth / 2, wrap.clientHeight / 2));
  btn(ids.zout, () => st.zoomAt(1 / 1.25, wrap.clientWidth / 2, wrap.clientHeight / 2));
  btn(ids.zfit, () => st.fit(st.cw, st.ch));
  wrap.__pz = st; return st;
}

function placeCard(o, lane, x, y, dupColor, ctx) {
  const { palette: PALETTE, selectedId, onOpenDetail } = ctx;
  const n = o.node, p = PALETTE[n.type] || PALETTE.invariant;
  let c;
  if (n.type === 'invariant') {
    c = el('div', { class: 'inv', style: 'left:' + x + 'px;top:' + y + 'px;background:' + p.fill + ';border:1px dashed ' + p.edge + ';color:' + p.text, onclick: () => onOpenDetail(n.id) }, '⚖ ' + n.label);
  } else {
    c = el('div', { class: 'sticky' + (selectedId === n.id ? ' selected' : ''), style: 'left:' + x + 'px;top:' + y + 'px;background:' + p.fill + ';border-color:' + p.edge + ';color:' + p.text, onclick: () => onOpenDetail(n.id) },
      el('div', { class: 'ntype' }, p.name), el('div', { class: 'nlabel' }, n.label));
    const flags = [];
    if (n.ownedBy) flags.push('⛓ ' + n.ownedBy.replace(/^ext-/, ''));
    if (n.synchronous) flags.push('inline');
    if (flags.length) c.append(el('div', { class: 'flags' }, flags.join(' · ')));
  }
  if (dupColor) c.append(el('div', { class: 'dupdot', style: 'background:' + dupColor, title: 'this node appears more than once in the flow (same dot color = same node)' }));
  if (ctx.onContextMenu) c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ctx.onContextMenu(e, n.id); });
  lane.append(c); return c;
}

// point on a box's border in the direction of (tx,ty)
function borderPoint(b, tx, ty) {
  const dx = tx - b.cx, dy = ty - b.cy;
  if (!dx && !dy) return { x: b.cx, y: b.cy };
  const s = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
  return { x: b.cx + dx * s, y: b.cy + dy * s };
}
function makePath(d, dashed) {
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', dashed ? '#7f7f8e' : '#b7b7c2'); path.setAttribute('stroke-width', dashed ? '1.5' : '2');
  path.setAttribute('stroke-linejoin', 'miter'); path.setAttribute('stroke-linecap', 'butt');
  if (dashed) path.setAttribute('stroke-dasharray', '4 4');
  path.setAttribute('marker-end', dashed ? 'url(#ahd)' : 'url(#ah)');
  return path;
}
// curved connector between two border points (used for read-model "spaghetti")
function curveD(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) >= Math.abs(dy)) { const k = Math.max(22, Math.abs(dx) * 0.4), s = Math.sign(dx) || 1; return 'M' + p1.x + ',' + p1.y + ' C' + (p1.x + s * k) + ',' + p1.y + ' ' + (p2.x - s * k) + ',' + p2.y + ' ' + p2.x + ',' + p2.y; }
  const k = Math.max(18, Math.abs(dy) * 0.4), s = Math.sign(dy) || 1; return 'M' + p1.x + ',' + p1.y + ' C' + p1.x + ',' + (p1.y + s * k) + ' ' + p2.x + ',' + (p2.y - s * k) + ' ' + p2.x + ',' + p2.y;
}
// p2 sits on a card's LEFT edge; leave p1 going down, then arrive horizontally into p2 from the left.
function curveInto(p1, p2) {
  const k = Math.max(28, Math.abs(p2.x - p1.x) * 0.45);
  const c1y = p1.y + (p2.y >= p1.y ? 1 : -1) * Math.max(14, Math.min(40, Math.abs(p2.y - p1.y) * 0.5));
  return 'M' + p1.x + ',' + p1.y + ' C' + p1.x + ',' + c1y + ' ' + (p2.x - k) + ',' + p2.y + ' ' + p2.x + ',' + p2.y;
}
