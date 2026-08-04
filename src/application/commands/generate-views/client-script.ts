// renderClientScript: the ~1,100-line vanilla-JS client embedded in explorer.html, returned as a
// string. It stays an inlined string in the emitted HTML (the build pipeline is unchanged; making
// it a separately type-checked asset is a deliberate follow-up). Extracted verbatim from
// generate-views.ts (issue #21, Target 2 / slice 21-C2) with byte-identical output. The only
// interpolations are MODEL (modelJson), REPO_ROOT_DEFAULT (repoRoot) and PALETTE.
import { PALETTE } from '../../../domain/model/palette.js';
import type { Model } from '../../../domain/model/types.js';

export function renderClientScript(model: Model, repoRoot: string): string {
  const modelJson = JSON.stringify(model).replace(/</g, '\\u003c');
  return `const MODEL = ${modelJson};
// Source links open in the reader's editor via vscode://file/<root>/<path>. The board bakes the
// generating machine's absolute root as a DEFAULT; each reader may override it with their own local
// checkout path (persisted to localStorage), so one committed board works for everyone. See
// docs/architecture/decisions/0006-reader-overridable-source-root.md.
const REPO_ROOT_DEFAULT = ${JSON.stringify(repoRoot)};
const normRoot = r => String(r == null ? '' : r).replace(/\\\\/g, '/').replace(/\\/+$/, '');
let repoRootOverride = (() => { try { return localStorage.getItem('esRepoRoot') || null; } catch (e) { return null; } })();
function currentRepoRoot() { return repoRootOverride ? normRoot(repoRootOverride) : REPO_ROOT_DEFAULT; }
function relAnchor(a) { return a.path + (a.line ? ':' + a.line : ''); }
function buildAnchorUrl(rel) { return 'vscode://file/' + currentRepoRoot() + '/' + rel; }
// Re-derive every already-rendered source link when the reader changes their local root.
function refreshAnchors() { document.querySelectorAll('a[data-anchor]').forEach(a => { a.href = buildAnchorUrl(a.getAttribute('data-anchor')); }); }
function promptRepoRoot() {
  const cur = repoRootOverride || REPO_ROOT_DEFAULT;
  const next = prompt('Local path to your checkout of this repository, used for the source links.\\n\\nLeave blank to reset to the board default:\\n' + REPO_ROOT_DEFAULT, cur);
  if (next === null) return;
  try {
    if (next.trim() === '') { localStorage.removeItem('esRepoRoot'); repoRootOverride = null; }
    else { repoRootOverride = next.trim(); localStorage.setItem('esRepoRoot', repoRootOverride); }
  } catch (e) { repoRootOverride = next.trim() || null; }
  refreshAnchors();
  updateRepoRootBtn();
}
function updateRepoRootBtn() {
  const b = document.getElementById('reporoot-btn'); if (!b) return;
  b.textContent = repoRootOverride ? 'Source root ●' : 'Source root';
  b.title = 'Source links open at: ' + currentRepoRoot() + (repoRootOverride ? '  (your local override — click to change or clear)' : '  (board default — click to set your local checkout path)');
}
const PALETTE = ${JSON.stringify(PALETTE)};
const nodeById = new Map(MODEL.nodes.map(n => [n.id, n]));
const hotspotById = new Map(MODEL.hotspots.map(h => [h.id, h]));
let currentFlow = null, selectedId = null, currentMode = 'flows', groupMode = 'tier';

// Technology-neutral storage node types (datastore, field) — a substrate the behavioral model
// anchors into. Kept out of the flow board; surfaced in the Data model tab + detail panel.
const DATA_TYPE_SET = new Set(['datastore', 'field']);
const isDataNode = n => n && DATA_TYPE_SET.has(n.type);
const CONF_COLOR = { high: '#6FC993', medium: '#E9A23B', low: '#E5645E' };

// types present in the model, in palette order (drives the gallery filter chips + sort)
const galleryTypes = Object.keys(PALETTE).filter(t => t !== 'hotspot' && MODEL.nodes.some(n => n.type === t));
const galleryState = { q: '', active: new Set(galleryTypes) };
let galleryBuilt = false;
// The Glossary tab renders the curated ubiquitous language (MODEL.terms), authored by the
// glossary-mining phase - NOT the raw stickies (those live in the Gallery). Terms carry a
// category and, when the mining couldn't fully pin one down, a hotspot-style flag + openQuestion.
const GL_CAT_ORDER = ['concept', 'jargon', 'acronym', 'role', 'system', 'state', 'metric', '(uncategorized)'];
const GL_CAT_STYLE = {
  concept: { fill: '#33415e', text: '#cfe0ff' }, jargon: { fill: '#41335e', text: '#e6d5ff' },
  acronym: { fill: '#1d4750', text: '#bff0f7' }, role: { fill: '#54461c', text: '#f2e0a8' },
  system: { fill: '#542a3d', text: '#f7c9dd' }, state: { fill: '#22462b', text: '#bff0c9' },
  metric: { fill: '#543619', text: '#f7d9b0' }, '(uncategorized)': { fill: '#2a2a33', text: '#c9c9d4' },
};
const catOf = t => t.category || '(uncategorized)';
const glossaryCats = () => { const p = new Set((MODEL.terms || []).map(catOf)); return GL_CAT_ORDER.filter(c => p.has(c)); };
const glossaryState = { q: '', cats: new Set(glossaryCats()), flaggedOnly: false };
let glossaryBuilt = false;

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
function anchorUrl(a) { return buildAnchorUrl(relAnchor(a)); }

// the set of node ids a flow touches (steps + both ends of every edge)
function flowNodeIds(f) { return new Set([...(f.steps || []), ...(f.edges || []).flatMap(e => [e.from, e.to])]); }

// sidebar grouping. 'tier' keeps the original two buckets; 'actor'/'aggregate' pivot the list so
// each node of that type heads a group listing every flow it appears in (a flow with two actors
// shows under both). Returns [{ title, pred, color }].
function sidebarGroups() {
  if (groupMode === 'tier') {
    return [
      { title: 'Tier 1 — domain flows', pred: f => f.tier !== 2 },
      { title: 'Tier 2 — patterns', pred: f => f.tier === 2 },
    ];
  }
  const p = PALETTE[groupMode] || PALETTE.invariant;
  const flowsByNode = new Map();                       // nodeId -> Set(flowId)
  for (const f of MODEL.flows) for (const nid of flowNodeIds(f)) {
    const nn = nodeById.get(nid);
    if (!nn || nn.type !== groupMode) continue;
    (flowsByNode.get(nid) || flowsByNode.set(nid, new Set()).get(nid)).add(f.id);
  }
  const groups = [...flowsByNode.entries()]
    .map(([nid, fset]) => ({ node: nodeById.get(nid), fset }))
    .sort((a, b) => String(a.node.label).localeCompare(String(b.node.label)))
    .map(({ node, fset }) => ({ title: node.label, pred: f => fset.has(f.id), color: p.fill }));
  const covered = new Set();
  for (const fset of flowsByNode.values()) for (const fid of fset) covered.add(fid);
  if (MODEL.flows.some(f => !covered.has(f.id))) groups.push({ title: 'No ' + p.name.toLowerCase(), pred: f => !covered.has(f.id) });
  return groups;
}

function renderSidebar(filter) {
  const list = document.getElementById('flowlist');
  list.innerHTML = '';
  for (const g of sidebarGroups()) {
    const flows = MODEL.flows.filter(g.pred).filter(f => !filter || (f.name + f.id).toLowerCase().includes(filter));
    if (!flows.length) continue;
    const heading = el('div', { class: 'flow-group' });
    if (g.color) heading.append(el('span', { class: 'fg-dot', style: 'background:' + g.color }));
    heading.append(g.title);
    list.append(heading);
    const kindColor = { read: '#6FC993', policy: '#BF9BE0', write: '#6BA3E8' };
    for (const f of flows) {
      const dead = f.status && f.status !== 'live';
      const hs = (f.hotspots || []).length;
      const item = el('div', {
        class: 'flow-item' + (currentFlow && currentFlow.id === f.id ? ' active' : '') + (dead ? ' dim' : ''),
        style: '--kind:' + (kindColor[f.kind] || kindColor.write),
        title: f.name + (dead ? '  [' + f.status + (f.supersededBy ? ' → ' + f.supersededBy : '') + ']' : '') + '  ·  ' + (f.kind || 'write'),
        onclick: () => selectFlow(f.id)
      }, el('div', { class: 'nm' }, f.name));
      const tags = el('div', { class: 'fi-tags' });
      if (dead) tags.append(el('div', { class: 'status-dot ' + f.status }));
      if (hs) tags.append(el('div', { class: 'hs-count' }, String(hs)));
      if (dead || hs) item.append(tags);
      list.append(item);
    }
  }
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  for (const [type, p] of Object.entries(PALETTE)) {
    legend.append(el('span', { class: 'lg', style: 'background:' + p.fill + ';color:' + p.text }, p.name));
  }
}

// Edge-driven layered layout: a horizontal causal SPINE (actor -> command -> aggregate ->
// event -> policy -> ...), parallel branches stacked vertically, read models as dotted
// satellites ABOVE the spine, invariants BELOW their aggregate. Driven entirely by edges.
const CAUSAL_VERBS = new Set(['issues', 'handled by', 'emits', 'triggers', 'calls', 'raises', 'returns', 'updates']);
const READ_VERBS = new Set(['reads', 'read by']);
const svgNS = 'http://www.w3.org/2000/svg';

const DUP_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#a78bfa', '#63d471', '#ff9f43', '#4d96ff', '#ff6ec7', '#c0eb75', '#f78fb3', '#5ed0e0', '#e0a458'];

// Render a single flow's board into the given lane element (sizing it), returning its {w,h}. No
// pan/zoom here, so the same engine drives both the single-flow board and each Overview box.
function renderFlowInto(f, lane) {
  lane.innerHTML = '';
  lane.style.position = 'relative';
  // Physical storage nodes (server/database/table/column) are a substrate, not steps in the
  // behavioral lane. Drop them and any edge touching them so the flow board stays behavioral;
  // the links survive in the model for the Data-model tab and the detail panel.
  const isData = id => { const n = nodeById.get(id); return n && DATA_TYPE_SET.has(n.type); };
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
  for (const o of spineInsts) { cardByIid[o.iid] = placeCard(o, lane, o.x, o.y, dupColor[o.id]); measure(o); }
  let spineTop = Infinity, spineBottom = -Infinity;
  spineInsts.forEach(o => { spineTop = Math.min(spineTop, box[o.iid].y); spineBottom = Math.max(spineBottom, box[o.iid].y + box[o.iid].h); });

  // satellites sit in bands strictly ABOVE (read models) / BELOW (invariants) the spine, packed by
  // x-interval so duplicates never overlap each other or a spine card. Dotted connectors reach them.
  const GAP = 26;
  const packBand = (list, above, xOf) => {
    if (!list.length) return;
    for (const o of list) { cardByIid[o.iid] = placeCard(o, lane, 0, 0, dupColor[o.id]); measure(o); }
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

// Single-flow board: render into #lane, then attach pan/zoom and fit to view.
function layoutFlow(f, lane) {
  const dim = renderFlowInto(f, lane);
  const wrap = document.getElementById('lane-wrap');
  const pz = setupPanZoom(wrap, lane);
  // double rAF so the board's flex height has settled before we compute the fit scale
  requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(dim.w, dim.h)));
}

// Overview: render EVERY flow into its own bounded-context box and shelf-pack the boxes onto one
// pannable/zoomable canvas. Duplicates across flows are expected — each box is self-contained.
let overviewBuilt = false;
function renderOverview() {
  if (overviewBuilt) return;
  const canvas = document.getElementById('ov-canvas');
  canvas.innerHTML = '';
  const boxes = [];
  for (const f of MODEL.flows) {
    const dead = f.status && f.status !== 'live';
    const boxEl = el('div', { class: 'context-box' + (dead ? ' dead' : '') });
    const title = el('div', { class: 'ctx-title', title: 'Open "' + f.name + '" in the Flows board', onclick: () => selectFlow(f.id) }, f.name);
    if (dead) title.append(el('span', { class: 'badge ' + f.status }, f.status.toUpperCase() + (f.supersededBy ? ' → ' + f.supersededBy : '')));
    else if (f.kind) title.append(el('span', { class: 'ctx-kind' }, f.kind));
    const laneEl = el('div', { class: 'ctx-lane' });
    boxEl.append(title, laneEl);
    canvas.append(boxEl);
    renderFlowInto(f, laneEl);          // sizes laneEl; box grows to fit
    boxes.push({ boxEl });
  }
  // shelf-pack: place boxes left-to-right, wrapping to a new row past the target width
  const GAPX = 64, GAPY = 60, PAD = 48;
  const dims = boxes.map(b => ({ boxEl: b.boxEl, w: b.boxEl.offsetWidth, h: b.boxEl.offsetHeight }));
  const widest = Math.max(0, ...dims.map(d => d.w));
  const rowLimit = Math.max(1700, widest);
  let x = PAD, y = PAD, rowH = 0, canvasW = PAD;
  for (const d of dims) {
    if (x > PAD && x + d.w > rowLimit) { x = PAD; y += rowH + GAPY; rowH = 0; }
    d.boxEl.style.left = x + 'px'; d.boxEl.style.top = y + 'px';
    x += d.w + GAPX; rowH = Math.max(rowH, d.h); canvasW = Math.max(canvasW, x);
  }
  const W = canvasW - GAPX + PAD, H = y + rowH + PAD;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  overviewBuilt = true;
  const wrap = document.getElementById('ov-wrap');
  const pz = setupPanZoom(wrap, canvas, { zin: 'ov-zin', zout: 'ov-zout', zfit: 'ov-zfit' });
  requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(W, H)));
}

// One pan/zoom controller for the board: wheel zooms toward the cursor, left-drag on the
// background pans, buttons zoom/fit. Attached to the persistent #lane-wrap once; later renders
// just swap in the new #lane and re-fit.
function setupPanZoom(wrap, lane, ids) {
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

function placeCard(o, lane, x, y, dupColor) {
  const n = o.node, p = PALETTE[n.type] || PALETTE.invariant;
  let c;
  if (n.type === 'invariant') {
    c = el('div', { class: 'inv', style: 'left:' + x + 'px;top:' + y + 'px;background:' + p.fill + ';border:1px dashed ' + p.edge + ';color:' + p.text, onclick: () => openDetail(n.id) }, '⚖ ' + n.label);
  } else {
    c = el('div', { class: 'sticky' + (selectedId === n.id ? ' selected' : ''), style: 'left:' + x + 'px;top:' + y + 'px;background:' + p.fill + ';border-color:' + p.edge + ';color:' + p.text, onclick: () => openDetail(n.id) },
      el('div', { class: 'ntype' }, p.name), el('div', { class: 'nlabel' }, n.label));
    const flags = [];
    if (n.ownedBy) flags.push('⛓ ' + n.ownedBy.replace(/^ext-/, ''));
    if (n.synchronous) flags.push('inline');
    if (flags.length) c.append(el('div', { class: 'flags' }, flags.join(' · ')));
  }
  if (dupColor) c.append(el('div', { class: 'dupdot', style: 'background:' + dupColor, title: 'this node appears more than once in the flow (same dot color = same node)' }));
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

function selectFlow(id) {
  setMode('flows');                       // jumping to a flow (e.g. from a gallery card) shows the board
  currentFlow = MODEL.flows.find(f => f.id === id);
  selectedId = null;
  renderSidebar((document.getElementById('search').value || '').toLowerCase());
  renderFlow();
  closeDetail();
}

// ---- Gallery: every sticky in the model, filtered by type chips + text search ----
function nodeFlows(id) {
  return MODEL.flows.filter(f => (f.steps || []).includes(id) || (f.edges || []).some(e => e.from === id || e.to === id));
}
function syncChips() {
  galleryTypes.forEach(t => { const c = document.querySelector('.tchip[data-type="' + t + '"]'); if (c) c.classList.toggle('on', galleryState.active.has(t)); });
  const all = document.getElementById('chip-all');
  if (all) all.classList.toggle('on', galleryTypes.every(t => galleryState.active.has(t)));
}
function buildGallery() {
  const g = document.getElementById('gallery');
  g.innerHTML = '';
  const head = el('div', { class: 'gallery-head' });
  head.append(el('h2', {}, 'All stickies', el('span', { class: 'count', id: 'gcount' }, '')));
  const search = el('input', { class: 'gallery-search', id: 'gsearch', type: 'search', placeholder: 'Search stickies by name or description...' });
  search.addEventListener('input', e => { galleryState.q = e.target.value.toLowerCase(); renderGrid(); });
  head.append(search);
  const chips = el('div', { class: 'type-chips' });
  const allChip = el('div', { class: 'tchip tchip-all on', id: 'chip-all' }, 'All');
  allChip.addEventListener('click', () => { galleryTypes.forEach(t => galleryState.active.add(t)); syncChips(); renderGrid(); });
  chips.append(allChip);
  for (const t of galleryTypes) {
    const p = PALETTE[t];
    const c = el('div', { class: 'tchip on', 'data-type': t, style: 'background:' + p.fill + ';color:' + p.text }, p.name);
    c.addEventListener('click', () => {
      if (galleryState.active.has(t)) galleryState.active.delete(t); else galleryState.active.add(t);
      syncChips(); renderGrid();
    });
    chips.append(c);
  }
  head.append(chips);
  g.append(head);
  g.append(el('div', { class: 'gallery-grid', id: 'ggrid' }));
  galleryBuilt = true;
}
function renderGrid() {
  const grid = document.getElementById('ggrid'); if (!grid) return;
  grid.innerHTML = '';
  const q = galleryState.q;
  const nodes = MODEL.nodes
    .filter(n => galleryState.active.has(n.type))
    .filter(n => !q || (n.label + ' ' + (n.description || '') + ' ' + (PALETTE[n.type] ? PALETTE[n.type].name : '')).toLowerCase().includes(q))
    .sort((a, b) => (galleryTypes.indexOf(a.type) - galleryTypes.indexOf(b.type)) || String(a.label).localeCompare(String(b.label)));
  document.getElementById('gcount').textContent = nodes.length + ' of ' + MODEL.nodes.length;
  if (!nodes.length) { grid.append(el('div', { class: 'gempty' }, 'No stickies match the current filters.')); return; }
  for (const n of nodes) {
    const p = PALETTE[n.type] || PALETTE.invariant;
    const flows = nodeFlows(n.id);
    const allDead = flows.length > 0 && flows.every(f => f.status && f.status !== 'live');
    const card = el('div', {
      class: 'gcard' + (selectedId === n.id ? ' selected' : ''),
      style: 'background:' + p.fill + ';border-color:' + p.edge + ';color:' + p.text,
      onclick: () => openDetail(n.id)
    }, el('div', { class: 'gtype' }, p.name), el('div', { class: 'glabel' }, n.label));
    if (n.description) card.append(el('div', { class: 'gdesc' }, n.description));
    const meta = el('div', { class: 'gmeta' });
    meta.append(el('span', {}, flows.length ? ('in ' + flows.length + ' flow' + (flows.length > 1 ? 's' : '')) : 'not in any flow'));
    if (allDead) meta.append(el('span', { class: 'gdead' }, 'retired'));
    card.append(meta);
    grid.append(card);
  }
}
function renderGallery() {
  if (!galleryBuilt) buildGallery();
  syncChips();
  renderGrid();
}

// ---- Glossary: the ubiquitous language as an alphabetical, readable dictionary of curated terms ----
function glSyncChips() {
  glossaryCats().forEach(c => { const el2 = document.querySelector('.tchip[data-gl-cat="' + c + '"]'); if (el2) el2.classList.toggle('on', glossaryState.cats.has(c)); });
  const all = document.getElementById('gl-chip-all'); if (all) all.classList.toggle('on', glossaryCats().every(c => glossaryState.cats.has(c)));
  const flag = document.getElementById('gl-chip-flagged'); if (flag) flag.classList.toggle('on', glossaryState.flaggedOnly);
}
function buildGlossary() {
  const g = document.getElementById('glossary'); g.innerHTML = '';
  const head = el('div', { class: 'gl-head' });
  head.append(el('h2', {}, 'Ubiquitous Language', el('span', { class: 'count', id: 'glcount' }, '')));
  const search = el('input', { class: 'gl-search', id: 'glsearch', type: 'search', placeholder: 'Search terms and definitions...' });
  search.addEventListener('input', e => { glossaryState.q = e.target.value.toLowerCase(); renderGlossaryList(); });
  head.append(search);
  const cats = glossaryCats();
  if (cats.length) {
    const chips = el('div', { class: 'type-chips' });
    const allChip = el('div', { class: 'tchip tchip-all on', id: 'gl-chip-all' }, 'All');
    allChip.addEventListener('click', () => { cats.forEach(c => glossaryState.cats.add(c)); glSyncChips(); renderGlossaryList(); });
    chips.append(allChip);
    for (const c of cats) {
      const s = GL_CAT_STYLE[c] || GL_CAT_STYLE['(uncategorized)'];
      const chip = el('div', { class: 'tchip on', 'data-gl-cat': c, style: 'background:' + s.fill + ';color:' + s.text }, c);
      chip.addEventListener('click', () => { if (glossaryState.cats.has(c)) glossaryState.cats.delete(c); else glossaryState.cats.add(c); glSyncChips(); renderGlossaryList(); });
      chips.append(chip);
    }
    const unresolved = (MODEL.meta && MODEL.meta.counts && MODEL.meta.counts.unresolvedTerms) || 0;
    if (unresolved) {
      const flag = el('div', { class: 'tchip gl-chip-flag', id: 'gl-chip-flagged', title: 'Terms the mining could not fully resolve - each states what a human should answer' }, 'Needs input (' + unresolved + ')');
      flag.addEventListener('click', () => { glossaryState.flaggedOnly = !glossaryState.flaggedOnly; glSyncChips(); renderGlossaryList(); });
      chips.append(flag);
    }
    head.append(chips);
  }
  g.append(head);
  const body = el('div', { class: 'gl-body' });
  body.append(el('div', { class: 'gl-list', id: 'gllist' }));
  body.append(el('div', { class: 'gl-rail', id: 'glrail' }));
  g.append(body);
  glossaryBuilt = true;
}
const GL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
function termFlows(t) {
  const seen = new Set(), out = [];
  for (const nid of t.relatedNodes || []) for (const f of nodeFlows(nid)) if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
  return out;
}
function anchorLink(a) {
  const rel = relAnchor(a);
  return el('a', { class: 'gl-src', href: buildAnchorUrl(rel), 'data-anchor': rel, title: a.symbol || a.path, onclick: e => e.stopPropagation() }, (a.symbol || a.path.split('/').pop()) + (a.line ? ':' + a.line : ''));
}
function renderGlossaryList() {
  const list = document.getElementById('gllist'); if (!list) return;
  list.innerHTML = '';
  const rail = document.getElementById('glrail'); if (rail) rail.innerHTML = '';
  const all = MODEL.terms || [];
  document.getElementById('glcount').textContent = all.length ? (all.length + ' terms') : 'not mined yet';
  if (!all.length) {
    list.append(el('div', { class: 'gl-empty' },
      el('div', { style: 'font-weight:650;color:var(--fg);margin-bottom:6px' }, 'The ubiquitous language has not been mined yet.'),
      el('div', {}, 'Run the glossary-mining phase to populate this tab with the domain vocabulary and jargon.')));
    return;
  }
  const q = glossaryState.q;
  const terms = all
    .filter(t => glossaryState.cats.has(catOf(t)))
    .filter(t => !glossaryState.flaggedOnly || (t.status || 'resolved') !== 'resolved')
    .filter(t => !q || ((t.term || '') + ' ' + (t.aka || []).join(' ') + ' ' + (t.definition || '') + ' ' + (t.openQuestion || '')).toLowerCase().includes(q));
  terms.sort((a, b) => String(a.term).localeCompare(String(b.term), undefined, { sensitivity: 'base' }));
  if (!terms.length) { list.append(el('div', { class: 'gl-empty' }, 'No terms match the current filters.')); return; }
  const letterOf = t => { const c = (t.term || '').trim()[0]; return c && /[a-z]/i.test(c) ? c.toUpperCase() : '#'; };
  const present = new Set();
  let curLetter = null;
  for (const t of terms) {
    const L = letterOf(t);
    if (L !== curLetter) { curLetter = L; present.add(L); list.append(el('div', { class: 'gl-letter', id: 'gl-L-' + L }, L)); }
    const status = t.status || 'resolved', flagged = status !== 'resolved';
    const cat = catOf(t), cs = GL_CAT_STYLE[cat] || GL_CAT_STYLE['(uncategorized)'];
    const entry = el('div', { class: 'gl-entry' + (flagged ? ' flagged' : '') });
    const head = el('div', { class: 'gl-term' },
      el('span', { class: 'gl-badge', style: 'background:' + cs.fill + ';color:' + cs.text }, cat),
      el('span', { class: 'gl-name' }, t.term));
    if (flagged) head.append(el('span', { class: 'gl-flag' }, status === 'unresolved' ? 'needs input' : 'partial'));
    if ((t.aka || []).length) head.append(el('span', { class: 'gl-aka' }, 'aka ' + t.aka.join(' · ')));
    entry.append(head);
    if (t.definition) entry.append(el('div', { class: 'gl-def' }, t.definition));
    if (flagged && t.openQuestion) entry.append(el('div', { class: 'gl-oq' }, el('b', {}, 'Open question: '), t.openQuestion));
    const rel = (t.relatedNodes || []).map(id => nodeById.get(id)).filter(Boolean);
    if (rel.length || (t.anchors || []).length || termFlows(t).length) {
      const used = el('div', { class: 'gl-used' });
      for (const n of rel) { const p = PALETTE[n.type] || PALETTE.invariant; used.append(el('div', { class: 'gl-nchip', style: 'border-color:' + p.edge, title: 'Open ' + p.name + ' "' + n.label + '"', onclick: () => openDetail(n.id) }, n.label)); }
      for (const f of termFlows(t)) { const dead = f.status && f.status !== 'live'; used.append(el('div', { class: 'gl-fchip' + (dead ? ' dead' : ''), title: 'Open "' + f.name + '" in the Flows board', onclick: () => selectFlow(f.id) }, f.name)); }
      for (const a of t.anchors || []) used.append(anchorLink(a));
      entry.append(used);
    }
    list.append(entry);
  }
  if (rail) for (const L of GL_LETTERS) {
    const has = present.has(L);
    const s = el('span', has ? {} : { style: 'opacity:.22;pointer-events:none' }, L);
    if (has) s.addEventListener('click', () => { const el2 = document.getElementById('gl-L-' + L); if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    rail.append(s);
  }
}
function renderGlossary() {
  if (!glossaryBuilt) buildGlossary();
  glSyncChips();
  renderGlossaryList();
}
// ---- Data model layer: pure selectors (mirrors src/lib/selectors.mjs) ----
// Walk a node's parent chain to the root, returning [root, ..., node] (containment breadcrumb).
function parentChain(node) {
  const chain = [], seen = new Set(); let cur = node;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent ? nodeById.get(cur.parent) : null; }
  return chain;
}
// Behavioral nodes that touch a given datastore, via flow edges. Returns [{ node, verb }] deduped.
function datastoreConsumers(storeId) {
  const seen = new Set(), out = [];
  for (const f of MODEL.flows) for (const e of (f.edges || [])) {
    if (e.to !== storeId) continue;
    const from = nodeById.get(e.from);
    if (!from || isDataNode(from)) continue;
    const key = e.from + '|' + e.verb; if (seen.has(key)) continue; seen.add(key);
    out.push({ node: from, verb: e.verb });
  }
  return out;
}
// Read-model/aggregate fields that draw from a given stored field. Returns [{ node, field }].
function fieldConsumers(fieldId) {
  const out = [];
  for (const n of MODEL.nodes) for (const fld of (n.fields || [])) {
    if ((fld.sources || []).some(s => s.ref === fieldId)) out.push({ node: n, field: fld });
  }
  return out;
}
// Datastores a behavioral node writes/reads/projects, via its flow edges. Returns [{ node, verb }].
function nodeStorageLinks(nodeId) {
  const seen = new Set(), out = [];
  for (const f of MODEL.flows) for (const e of (f.edges || [])) {
    if (e.from !== nodeId) continue;
    const to = nodeById.get(e.to);
    if (!to || !isDataNode(to)) continue;
    const key = e.to + '|' + e.verb; if (seen.has(key)) continue; seen.add(key);
    out.push({ node: to, verb: e.verb });
  }
  return out;
}
// Build the datastore containment forest from the flat node list. Each datastore subtree carries its
// child datastores (recursively) and the fields parented directly to it. Arbitrary depth: the same
// shape holds server▸database▸table▸column, filesystem▸directory▸file▸key, broker▸queue▸field, etc.
// Returns { roots, looseFields } (fields orphaned from any datastore).
function dataModelTree() {
  const stores = MODEL.nodes.filter(n => n.type === 'datastore');
  const fields = MODEL.nodes.filter(n => n.type === 'field');
  const childStores = id => stores.filter(n => n.parent === id);
  const childFields = id => fields.filter(n => n.parent === id);
  const seen = new Set();
  const build = ds => {
    if (seen.has(ds.id)) return { node: ds, stores: [], fields: [] }; // cycle guard
    seen.add(ds.id);
    return { node: ds, stores: childStores(ds.id).map(build), fields: childFields(ds.id) };
  };
  const isRoot = n => !n.parent || !nodeById.has(n.parent) || (nodeById.get(n.parent) || {}).type !== 'datastore';
  const roots = stores.filter(isRoot).map(build);
  const placed = new Set();
  const walk = t => { t.fields.forEach(f => placed.add(f.id)); t.stores.forEach(walk); };
  roots.forEach(walk);
  const looseFields = fields.filter(f => !placed.has(f.id) && (!f.parent || (nodeById.get(f.parent) || {}).type !== 'field'));
  return { roots, looseFields };
}
// Is this datastore a "record set" (fields hang off / behavior targets / a leaf), vs a pure container?
function isRecordSet(ds) {
  if (!ds || ds.type !== 'datastore') return false;
  const hasFields = MODEL.nodes.some(n => n.type === 'field' && n.parent === ds.id);
  const hasStoreChildren = MODEL.nodes.some(n => n.type === 'datastore' && n.parent === ds.id);
  const isTarget = MODEL.flows.some(f => (f.edges || []).some(e => e.to === ds.id));
  return hasFields || isTarget || !hasStoreChildren;
}

// ---- Data model tab: recursive datastore forest, cross-linked to behavioral nodes ----
// A datastore that behavior touches (or that fields hang off) renders as a CARD; a pure container
// renders as a HEADER wrapping its children. Depth is whatever the codebase actually has. Mirrors
// src/web/components/DataModel.jsx.
let dataModelBuilt = false;
// The behavioral nodes that write / read / project a record-set datastore (click-through to sticky).
function dmConsumerChips(ds) {
  const consumers = datastoreConsumers(ds.id);
  if (!consumers.length) return null;
  const cons = el('div', { class: 'dm-consumers' });
  for (const c of consumers) {
    const cp = PALETTE[c.node.type] || PALETTE.invariant;
    cons.append(el('span', { class: 'dm-consumer', style: 'border-color:' + cp.edge, title: cp.name + ' — ' + c.verb, onclick: () => openDetail(c.node.id) },
      el('span', { class: 'dm-cdot', style: 'background:' + cp.fill }),
      el('span', { class: 'dm-cverb' }, c.verb),
      c.node.label));
  }
  return cons;
}
// A record-set datastore -> a CARD: storeKind badge + field rows + consumer chips + nested stores.
function dmStoreCard(tree) {
  const { node: ds, fields, stores } = tree;
  const p = PALETTE.datastore;
  const kind = (ds.storeKind || 'store').toUpperCase();
  const card = el('div', { class: 'dm-table', style: 'border-color:' + p.edge });
  card.append(el('div', { class: 'dm-table-head', style: 'background:' + p.fill + ';color:' + p.text, onclick: () => openDetail(ds.id) },
    el('span', { class: 'dm-tt' }, kind),
    el('span', { class: 'dm-tn' }, ds.label)));
  if (fields.length) {
    const cols = el('div', { class: 'dm-cols' });
    for (const c of fields) {
      const col = el('div', { class: 'dm-col', title: c.description || '', onclick: () => openDetail(c.id) }, el('span', { class: 'dm-cn' }, c.label));
      if (c.dataType) col.append(el('span', { class: 'dm-ct' }, c.dataType));
      if (c.nullable === false) col.append(el('span', { class: 'dm-nn' }, 'NN'));
      cols.append(col);
    }
    card.append(cols);
  }
  const chips = dmConsumerChips(ds);
  if (chips) card.append(chips);
  if (stores.length) {
    const nested = el('div', { class: 'dm-tables' });
    for (const s of stores) nested.append(dmStoreNode(s, 99));
    card.append(nested);
  }
  return card;
}
// A datastore subtree: a card if a record set, else a container header grouping its record-set
// children into a card grid and nesting its container children.
function dmStoreNode(tree, depth) {
  const { node: ds, stores } = tree;
  if (isRecordSet(ds)) return dmStoreCard(tree);
  const p = PALETTE.datastore;
  const kind = (ds.storeKind || 'store').toUpperCase();
  const cardKids = stores.filter(s => isRecordSet(s.node));
  const headerKids = stores.filter(s => !isRecordSet(s.node));
  const top = depth === 0;
  const block = el('div', { class: top ? 'dm-server' : 'dm-db' });
  const head = el('div', { class: top ? 'dm-server-head' : 'dm-db-head', onclick: () => openDetail(ds.id) },
    el('span', { class: 'dm-badge', style: 'background:' + p.fill + ';color:' + p.text }, kind),
    el('span', { class: top ? 'dm-sname' : 'dm-dname' }, ds.label));
  if (ds.host) head.append(el('span', { class: 'dm-host' }, ds.host));
  if (ds.ownedBy) head.append(el('span', { class: 'dm-owned' }, 'owned by ' + ds.ownedBy));
  block.append(head);
  for (const s of headerKids) block.append(dmStoreNode(s, depth + 1));
  if (cardKids.length) {
    const tablesEl = el('div', { class: 'dm-tables' });
    for (const s of cardKids) tablesEl.append(dmStoreNode(s, depth + 1));
    block.append(tablesEl);
  }
  return block;
}
function buildDataModel() {
  const g = document.getElementById('datamodel'); g.innerHTML = '';
  const { roots, looseFields } = dataModelTree();
  const dataCount = MODEL.nodes.filter(n => DATA_TYPE_SET.has(n.type)).length;
  const head = el('div', { class: 'dm-head' });
  head.append(el('h2', {}, 'Data model ', el('span', { class: 'count' }, String(dataCount))));
  head.append(el('div', { class: 'dm-sub' }, 'The storage the code actually touches, recovered from the code and its config — whatever kind it is: databases, files, queues, caches, in-memory state. Data stores nest to whatever depth exists (server ▸ database ▸ table, or filesystem ▸ directory ▸ file, …) and are cross-linked to the read models and aggregates that read and write them. Demand-driven: only the fields a read model or aggregate references appear.'));
  g.append(head);
  const body = el('div', { class: 'dm-body' });
  if (dataCount === 0) body.append(el('div', { class: 'dm-empty' }, 'No data model recovered yet. Run the data-mapping phase (prompts/05-data-mapping.md) to populate data stores and field lineage.'));
  const topContainers = roots.filter(r => !isRecordSet(r.node));
  const topCards = roots.filter(r => isRecordSet(r.node));
  for (const r of topContainers) body.append(dmStoreNode(r, 0));
  if (topCards.length) {
    const tablesEl = el('div', { class: 'dm-tables' });
    for (const r of topCards) tablesEl.append(dmStoreNode(r, 0));
    body.append(tablesEl);
  }
  if (looseFields.length) {
    const block = el('div', { class: 'dm-server' });
    block.append(el('div', { class: 'dm-server-head' },
      el('span', { class: 'dm-badge dm-unattached' }, 'UNATTACHED FIELDS'),
      el('span', { class: 'dm-sname' }, 'not tied to a data store')));
    body.append(block);
  }
  g.append(body);
  dataModelBuilt = true;
}
function renderDataModel() { if (!dataModelBuilt) buildDataModel(); }

function setMode(m) {
  currentMode = m;
  document.getElementById('tab-flows').classList.toggle('active', m === 'flows');
  document.getElementById('tab-gallery').classList.toggle('active', m === 'gallery');
  document.getElementById('tab-datamodel').classList.toggle('active', m === 'datamodel');
  document.getElementById('tab-glossary').classList.toggle('active', m === 'glossary');
  document.getElementById('tab-overview').classList.toggle('active', m === 'overview');
  document.getElementById('sidebar').style.display = m === 'flows' ? '' : 'none';
  document.getElementById('main').style.display = m === 'flows' ? '' : 'none';
  document.getElementById('gallery').classList.toggle('show', m === 'gallery');
  document.getElementById('datamodel').classList.toggle('show', m === 'datamodel');
  document.getElementById('glossary').classList.toggle('show', m === 'glossary');
  document.getElementById('overview').classList.toggle('show', m === 'overview');
  if (m === 'gallery') renderGallery();
  else if (m === 'datamodel') renderDataModel();
  else if (m === 'glossary') renderGlossary();
  else if (m === 'overview') renderOverview();
}

function renderFlow() {
  const f = currentFlow;
  const hdr = document.getElementById('flowheader');
  hdr.innerHTML = '';
  if (!f) { hdr.append(el('h2', {}, 'Select a flow')); return; }
  const h2 = el('h2', {}, f.name);
  if (f.status && f.status !== 'live') h2.append(el('span', { class: 'badge ' + f.status }, f.status.toUpperCase() + (f.supersededBy ? ' → ' + f.supersededBy : '')));
  hdr.append(h2);
  hdr.append(el('div', { class: 'summary' }, f.summary || ''));
  if (f.trigger) hdr.append(el('div', { class: 'trigger' }, el('b', {}, 'Trigger: '), f.trigger));

  layoutFlow(f, document.getElementById('lane'));

  const hs = document.getElementById('hotspots');
  hs.innerHTML = '';
  const spots = (f.hotspots || []).map(h => hotspotById.get(h)).filter(Boolean);
  if (spots.length) {
    hs.append(el('h3', {}, 'Hotspots', el('span', { class: 'n' }, String(spots.length)), el('span', { style: 'color:var(--muted);font-weight:600' }, 'questions a human should answer')));
    const cards = el('div', { class: 'hs-cards' });
    for (const s of spots) cards.append(el('div', { class: 'hs-card', title: s.description || '', onclick: () => openHotspot(s.id) }, el('b', {}, s.label), el('span', {}, s.description)));
    hs.append(cards);
  }

  const inst = document.getElementById('instances');
  inst.innerHTML = '';
  if ((f.instances || []).length) {
    inst.append(el('h3', {}, 'Instances of this pattern', el('span', { class: 'n' }, String(f.instances.length))));
    const t = el('table', {});
    for (const i of f.instances) {
      const base = (i.file || '').split('/').pop();
      t.append(el('tr', {},
        el('td', { class: 'i-label' }, i.label || ''),
        el('td', { class: 'i-route' }, i.route || ''),
        el('td', { class: 'i-file', title: i.file || '' }, base)));
    }
    inst.append(t);
  }

  document.getElementById('findings').style.display = (spots.length || (f.instances || []).length) ? '' : 'none';
}


function openDetail(id) {
  selectedId = id;
  if (currentMode === 'gallery') renderGrid();
  else if (currentMode === 'flows') renderFlow();
  const n = nodeById.get(id); if (!n) return;
  const p = PALETTE[n.type] || PALETTE.invariant;
  const d = document.getElementById('detail'); d.classList.add('open');
  const inner = document.getElementById('detail-inner');
  inner.innerHTML = '';
  inner.append(el('button', { id: 'closedetail', onclick: closeDetail }, '✕'));
  inner.append(el('span', { class: 'dtype', style: 'background:' + p.fill + ';color:' + p.text }, p.name));
  inner.append(el('h3', {}, n.label));
  const chips = el('div', { class: 'chips' });
  if (n.inferred) chips.append(el('span', { class: 'chip' }, 'inferred from code'));
  if (isDataNode(n) && n.inferred === false) chips.append(el('span', { class: 'chip' }, 'named in code'));
  if (n.storeKind) chips.append(el('span', { class: 'chip' }, n.storeKind));
  if (n.fieldKind) chips.append(el('span', { class: 'chip' }, n.fieldKind));
  if (n.engine) chips.append(el('span', { class: 'chip' }, n.engine));
  if (n.ownedBy) chips.append(el('span', { class: 'chip' }, 'state owned by ' + n.ownedBy));
  if (n.synchronous) chips.append(el('span', { class: 'chip' }, 'synchronous inline reaction'));
  for (const pv of (n.provenance || [])) chips.append(el('span', { class: 'chip' }, pv));
  inner.append(chips);
  inner.append(el('div', { class: 'desc' }, n.description || ''));

  // Physical node (datastore/field): containment breadcrumb + child stores + child fields + "Used by"
  // back-references. Mirrors StorageSection in src/web/components/Detail.jsx.
  if (isDataNode(n)) {
    const chain = parentChain(n);
    if (chain.length > 1) {
      const bc = el('div', { class: 'breadcrumb' });
      chain.forEach((c, i) => {
        if (i > 0) bc.append(el('span', { class: 'bc-sep' }, '▸'));
        if (c.id === n.id) bc.append(el('span', { class: 'bc-here' }, c.label));
        else bc.append(el('span', { class: 'bc-link', onclick: () => openDetail(c.id) }, c.label));
      });
      inner.append(bc);
    }
    const subStores = n.type === 'datastore' ? MODEL.nodes.filter(x => x.type === 'datastore' && x.parent === n.id) : [];
    if (subStores.length) {
      inner.append(el('h4', {}, subStores.length + ' data store' + (subStores.length > 1 ? 's' : '')));
      for (const c of subStores) {
        const lbl = el('div', { class: 'rlabel' }, c.label);
        const rel = c.storeKind || c.fieldKind;
        if (rel) lbl.append(el('span', { class: 'fr-role' }, rel));
        inner.append(el('div', { class: 'relrow', onclick: () => openDetail(c.id) }, lbl));
      }
    }
    const fields = n.type === 'datastore' ? MODEL.nodes.filter(x => x.type === 'field' && x.parent === n.id) : [];
    if (fields.length) {
      inner.append(el('h4', {}, fields.length + ' field' + (fields.length > 1 ? 's' : '')));
      for (const c of fields) {
        const lbl = el('div', { class: 'rlabel' }, c.label);
        if (c.dataType) lbl.append(el('span', { class: 'fr-dtype' }, c.dataType));
        if (c.fieldKind) lbl.append(el('span', { class: 'fr-role' }, c.fieldKind));
        inner.append(el('div', { class: 'relrow', onclick: () => openDetail(c.id) }, lbl));
      }
    }
    const consumers = n.type === 'datastore' ? datastoreConsumers(n.id)
      : n.type === 'field' ? fieldConsumers(n.id).map(c => ({ node: c.node, verb: 'field ' + c.field.name }))
      : [];
    if (consumers.length) {
      inner.append(el('h4', {}, 'Used by ' + consumers.length));
      for (const c of consumers) {
        const lbl = el('div', { class: 'rlabel' }, c.node.label);
        lbl.append(el('span', { class: 'fr-role' }, c.verb));
        inner.append(el('div', { class: 'relrow', onclick: () => openDetail(c.node.id) }, lbl));
      }
    }
  }

  // Conceptual fields: read model "Data returned" / aggregate "State & fields", each with its
  // derivation prose, confidence dot, tags, and 0..N storage sources. Mirrors FieldsSection.
  if (n.fields && n.fields.length) {
    const heading = n.type === 'readModel' ? 'Data returned' : n.type === 'aggregate' ? 'State & fields' : 'Fields';
    inner.append(el('h4', {}, heading));
    for (const field of n.fields) {
      const fr = el('div', { class: 'fieldrow' });
      const fhead = el('div', { class: 'fr-head' }, el('span', { class: 'fr-name' }, field.name));
      if (field.dataType) fhead.append(el('span', { class: 'fr-dtype' }, field.dataType));
      const conf = field.confidence && CONF_COLOR[field.confidence];
      if (conf) fhead.append(el('span', { class: 'fr-conf', style: 'background:' + conf, title: 'derivation confidence: ' + field.confidence }));
      if (field.conceptual) fhead.append(el('span', { class: 'fr-tag' }, 'conceptual'));
      if (field.sensitive) fhead.append(el('span', { class: 'fr-tag sensitive' }, 'sensitive'));
      fr.append(fhead);
      if (field.derivation) fr.append(el('div', { class: 'fr-deriv' }, field.derivation));
      const sources = field.sources || [];
      if (sources.length) {
        for (const s of sources) {
          const col = /^(ds|fld)-/.test(s.ref || '') ? nodeById.get(s.ref) : null;
          const src = el('div', { class: 'fr-src' }, el('span', { class: 'fr-role' }, s.role || 'from'));
          if (col) src.append(el('span', { class: 'fr-col link', onclick: () => openDetail(col.id) }, col.label));
          else src.append(el('span', { class: 'fr-col addr' }, s.ref || '(unresolved)'));
          if (s.transform) src.append(el('span', { class: 'fr-xform' }, s.transform));
          if (s.note) src.append(el('span', { class: 'fr-note' }, '— ' + s.note));
          fr.append(src);
        }
      } else {
        fr.append(el('div', { class: 'fr-src none' }, 'computed / no direct source'));
      }
      inner.append(fr);
    }
  }

  // Behavioral node -> the storage tables it writes/reads/projects. Mirrors the "Storage" block.
  if (!isDataNode(n)) {
    const storageLinks = nodeStorageLinks(n.id);
    if (storageLinks.length) {
      inner.append(el('h4', {}, 'Storage'));
      for (const s of storageLinks) {
        const lbl = el('div', { class: 'rlabel' }, s.node.label);
        lbl.append(el('span', { class: 'fr-role' }, s.verb));
        inner.append(el('div', { class: 'relrow', onclick: () => openDetail(s.node.id) }, lbl));
      }
    }
  }

  // aggregate <-> invariant cross-reference. The "enforces" relationship lives on flow edges
  // (aggregate --enforces--> invariant); surface the full set here regardless of the flow you
  // came in from, so an aggregate lists every invariant it guards and an invariant lists every
  // aggregate it guards. Each entry navigates to that node's detail.
  const relatedEnforces = (fromType, toType) => {
    const ids = new Set();
    for (const f of MODEL.flows) for (const e of (f.edges || [])) {
      const s = nodeById.get(e.from), t = nodeById.get(e.to);
      if (!s || !t) continue;
      if (n.type === 'aggregate' && e.from === id && t.type === toType) ids.add(t.id);
      if (n.type === 'invariant' && e.to === id && s.type === fromType) ids.add(s.id);
    }
    return [...ids].map(i => nodeById.get(i)).filter(Boolean);
  };
  let related = [], relHeading = '';
  if (n.type === 'aggregate') { related = relatedEnforces('aggregate', 'invariant'); relHeading = 'Enforces ' + related.length + ' invariant' + (related.length > 1 ? 's' : ''); }
  else if (n.type === 'invariant') { related = relatedEnforces('aggregate', 'invariant'); relHeading = 'Enforced by ' + related.length + ' aggregate' + (related.length > 1 ? 's' : ''); }
  if (related.length) {
    inner.append(el('h4', {}, relHeading));
    for (const r of related) {
      const rp = PALETTE[r.type] || PALETTE.invariant;
      inner.append(el('div', { class: 'relrow', title: (PALETTE[r.type] || {}).name + ' — ' + r.label, onclick: () => openDetail(r.id) },
        el('div', { class: 'rdot', style: 'background:' + rp.fill + ';border-color:' + rp.edge }),
        el('div', { class: 'rlabel' }, r.label)));
    }
  }

  const usages = (n.usages && n.usages.length) ? n.usages : (n.tactical ? [{ flow: '', explanation: n.tactical.explanation, anchors: n.tactical.anchors }] : []);
  if (usages.length) {
    inner.append(el('h4', {}, 'Tactical implementation'));
    for (const u of usages) {
      const box = el('div', { class: 'usage' });
      if (u.flow) box.append(el('div', { class: 'uflow' }, 'in flow: ' + u.flow));
      if (u.explanation) box.append(el('div', { class: 'uexp' }, u.explanation));
      for (const a of u.anchors || []) {
        box.append(el('a', { class: 'anchor', href: anchorUrl(a), 'data-anchor': relAnchor(a) },
          a.path + (a.line ? ':' + a.line : '') + (a.symbol ? '  (' + a.symbol + ')' : ''),
          a.note ? el('span', { class: 'note' }, '  — ' + a.note) : null));
      }
      inner.append(box);
    }
  }
  // flows this node appears in — each rendered as a row whose colored count-dots preview the
  // flow's makeup (one dot per sticky type present, the number = how many of that type), so you
  // can eyeball a flow's size and shape before jumping in.
  const inFlows = MODEL.flows.filter(f => (f.steps || []).includes(id) || (f.edges || []).some(e => e.from === id || e.to === id));
  if (inFlows.length) {
    inner.append(el('h4', {}, 'Appears in ' + inFlows.length + ' flow' + (inFlows.length > 1 ? 's' : '')));
    for (const f of inFlows) {
      const fIds = new Set([...(f.steps || []), ...(f.edges || []).flatMap(e => [e.from, e.to])]);
      const counts = {};
      for (const fid of fIds) { const fn = nodeById.get(fid); if (fn) counts[fn.type] = (counts[fn.type] || 0) + 1; }
      const total = Object.values(counts).reduce((s, c) => s + c, 0);
      const dead = f.status && f.status !== 'live';
      const row = el('div', { class: 'flowrow', title: f.name + ' — ' + total + ' stickies', onclick: () => selectFlow(f.id) });
      const name = el('div', { class: 'fr-name' }, f.name);
      if (dead) name.append(el('span', { class: 'badge ' + f.status }, f.status.toUpperCase()));
      row.append(name);
      const dots = el('div', { class: 'fr-dots' });
      for (const t of Object.keys(PALETTE)) {
        if (t === 'hotspot' || !counts[t]) continue;
        const p = PALETTE[t];
        dots.append(el('div', { class: 'cdot', style: 'background:' + p.fill + ';color:' + p.text, title: counts[t] + ' × ' + p.name }, String(counts[t])));
      }
      row.append(dots);
      inner.append(row);
    }
  }
}

function openHotspot(id) {
  const h = hotspotById.get(id); if (!h) return;
  const d = document.getElementById('detail'); d.classList.add('open');
  const inner = document.getElementById('detail-inner');
  inner.innerHTML = '';
  inner.append(el('button', { id: 'closedetail', onclick: closeDetail }, '✕'));
  inner.append(el('span', { class: 'dtype', style: 'background:#FF6B6B;color:#fff' }, 'Hotspot'));
  inner.append(el('h3', {}, h.label));
  inner.append(el('div', { class: 'desc' }, h.description || ''));
  if (h.tactical) {
    inner.append(el('h4', {}, 'Evidence'));
    const box = el('div', { class: 'usage' });
    if (h.tactical.explanation) box.append(el('div', { class: 'uexp' }, h.tactical.explanation));
    for (const a of h.tactical.anchors || []) {
      box.append(el('a', { class: 'anchor', href: anchorUrl(a) },
        a.path + (a.line ? ':' + a.line : '') + (a.symbol ? '  (' + a.symbol + ')' : ''),
        a.note ? el('span', { class: 'note' }, '  — ' + a.note) : null));
    }
    inner.append(box);
  }
}

function closeDetail() { document.getElementById('detail').classList.remove('open'); selectedId = null; if (currentMode === 'gallery') renderGrid(); }
document.getElementById('search').addEventListener('input', e => renderSidebar(e.target.value.toLowerCase()));
document.querySelectorAll('#groupby .gb').forEach(b => b.addEventListener('click', () => {
  groupMode = b.dataset.mode;
  document.querySelectorAll('#groupby .gb').forEach(x => x.classList.toggle('active', x === b));
  renderSidebar((document.getElementById('search').value || '').toLowerCase());
}));
document.getElementById('tab-flows').addEventListener('click', () => setMode('flows'));
document.getElementById('tab-gallery').addEventListener('click', () => setMode('gallery'));
document.getElementById('tab-datamodel').addEventListener('click', () => setMode('datamodel'));
document.getElementById('tab-glossary').addEventListener('click', () => setMode('glossary'));
document.getElementById('tab-overview').addEventListener('click', () => setMode('overview'));
document.getElementById('reporoot-btn').addEventListener('click', promptRepoRoot);
updateRepoRootBtn();

renderSidebar('');
if (MODEL.flows.length) selectFlow(MODEL.flows[0].id);
else setMode('flows');`;
}
