// The static explorer's client, as real type-checked source (issue #41). Formerly a ~1,100-line
// untyped template STRING in generate-views/client-script.ts; now a browser .ts module built to a
// self-contained IIFE (dist/client/explorer-client.js) by scripts/build-client.mjs and inlined into
// explorer.html by the generator (generate-views/html.ts). This is the build-and-inline delivery
// pattern of ADR-0007; issue #42 (de-dup with src/web) builds on it.
//
// The per-model values MODEL, REPO_ROOT_DEFAULT and PALETTE are NOT interpolated here: the generator
// emits a tiny preamble that sets `window.__ES__ = { MODEL, REPO_ROOT_DEFAULT, PALETTE }` ahead of
// this bundle, and the client reads them from there. Behaviour is byte-for-byte the pre-refactor
// client (proven by the static-explorer E2E); the golden fixture was re-baselined because the emitted
// bytes are now a built bundle + preamble rather than the hand-inlined string.
//
// Typed against the real model shape: MODEL is the domain `Model` (imported type-only, erased at
// build), so model-root access is checked. Deeper dynamic traversal stays loose exactly as the
// sibling render code (generate-views/dot.ts) does — this is a mechanical string -> typed-asset move,
// not a rewrite of the explorer.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Model } from '../../domain/model/types.js';
import type { PaletteEntry } from '../../domain/model/palette.js';
// The flow-board geometry engine, shared with the live SPA (issue #42 / ADR-0008). Formerly this
// file carried its own byte-identical / drifted copies of these; now both explorers import the one
// engine. This client passes a ctx that reproduces its CURRENT behaviour: its own nodeById/PALETTE/
// selectedId/openDetail, and NO onContextMenu (the static explorer stays menu-less), plus no
// pan-exclusion override (so it keeps the behavioural base set the SPA extends). See flowCtx below.
import { renderFlowInto, setupPanZoom } from '../lib/flow-geometry.js';
// The pure datastore-containment tree builder, shared with the live SPA and the MCP/markdown
// renderer (issue #64 / ADR-0008 consequences). This client formerly carried a byte-identical copy;
// now all three surfaces consume the one builder in src/application/read-models/indexes. It has no
// runtime deps (its only import is type-only), so esbuild tree-shakes it into the offline bundle
// exactly as the shared flow-geometry module already pulls DATA_TYPE_SET from there (#42).
import { dataModelTree } from '../../application/read-models/indexes.js';

declare global {
  interface Window {
    __ES__: {
      MODEL: Model;
      REPO_ROOT_DEFAULT: string;
      PALETTE: Record<string, PaletteEntry>;
    };
  }
}

const { MODEL, REPO_ROOT_DEFAULT, PALETTE } = window.__ES__;
// Source links open in the reader's editor via vscode://file/<root>/<path>. The board bakes the
// generating machine's absolute root as a DEFAULT; each reader may override it with their own local
// checkout path (persisted to localStorage), so one committed board works for everyone. See
// docs/architecture/decisions/0006-reader-overridable-source-root.md.
const normRoot = r => String(r == null ? '' : r).replace(/\\/g, '/').replace(/\/+$/, '');
let repoRootOverride = (() => { try { return localStorage.getItem('esRepoRoot') || null; } catch (e) { return null; } })();
function currentRepoRoot() { return repoRootOverride ? normRoot(repoRootOverride) : REPO_ROOT_DEFAULT; }
function relAnchor(a) { return a.path + (a.line ? ':' + a.line : ''); }
function buildAnchorUrl(rel) { return 'vscode://file/' + currentRepoRoot() + '/' + rel; }
// Re-derive every already-rendered source link when the reader changes their local root.
function refreshAnchors() { document.querySelectorAll<HTMLAnchorElement>('a[data-anchor]').forEach(a => { a.href = buildAnchorUrl(a.getAttribute('data-anchor')); }); }
function promptRepoRoot() {
  const cur = repoRootOverride || REPO_ROOT_DEFAULT;
  // REPO_ROOT_DEFAULT is empty when the board was generated as a shareable artifact (issue #74): the
  // baked root is a neutral "generated elsewhere" sentinel, so there is no board default to reset to.
  const defaultLine = REPO_ROOT_DEFAULT
    ? 'Leave blank to reset to the board default:\n' + REPO_ROOT_DEFAULT
    : 'This board was generated elsewhere, so it has no source root baked in — leave blank to keep the links unset.';
  const next = prompt('Local path to your checkout of this repository, used for the source links.\n\n' + defaultLine, cur);
  if (next === null) return;
  try {
    if (next.trim() === '') { localStorage.removeItem('esRepoRoot'); repoRootOverride = null; }
    else { repoRootOverride = next.trim(); localStorage.setItem('esRepoRoot', repoRootOverride); }
  } catch (e) { repoRootOverride = next.trim() || null; }
  refreshAnchors();
  updateRepoRootBtn();
  // The reader has now engaged the control, so the first-open self-heal banner has served its purpose.
  dismissRepoRootBanner();
}
function updateRepoRootBtn() {
  const b = document.getElementById('reporoot-btn'); if (!b) return;
  b.textContent = repoRootOverride ? 'Source root ●' : 'Source root';
  const root = currentRepoRoot();
  b.title = repoRootOverride
    ? 'Source links open at: ' + root + '  (your local override — click to change or clear)'
    : (root
        ? 'Source links open at: ' + root + '  (board default — click to set your local checkout path)'
        : 'No local checkout path set — click to point the source links at your copy of this repo');
}

// ---- First-open self-heal (issue #74) ----------------------------------------------------------
// A committed explorer.html is shared: the reader is almost never on the machine it was generated on,
// so its baked vscode:// source links are dead on arrival for them. The #88 reader-override fixes this
// but is undiscoverable. So on first open — before the reader has set their own root — surface a
// dismissible banner, and intercept the first click on any source link to open the Source-root prompt
// instead of firing a dead deep link. Both reuse the existing promptRepoRoot / esRepoRoot machinery;
// once the reader sets (or dismisses) a root, the dismissal persists and the banner stays gone.
const BANNER_DISMISS_KEY = 'esRepoRootBannerDismissed';
function bannerDismissed(): boolean { try { return localStorage.getItem(BANNER_DISMISS_KEY) === '1'; } catch (e) { return false; } }
function dismissRepoRootBanner() {
  try { localStorage.setItem(BANNER_DISMISS_KEY, '1'); } catch (e) { /* private mode: banner just won't persist */ }
  const b = document.getElementById('reporoot-banner'); if (b) b.remove();
}
function showRepoRootBanner() {
  if (document.getElementById('reporoot-banner')) return;
  const banner = el('div', { id: 'reporoot-banner' },
    el('span', { class: 'rb-msg' }, 'Source links point to the checkout this board was generated on. Set your local repository path so they open your files.'),
    el('button', { class: 'rb-set', onclick: promptRepoRoot }, 'Set source root'),
    el('button', { class: 'rb-x', title: 'Dismiss', onclick: dismissRepoRootBanner }, '✕'));
  const shell = document.getElementById('shell');
  if (shell && shell.parentNode) shell.parentNode.insertBefore(banner, shell);
}
// Show the banner only when the reader has neither set a root nor dismissed the banner before.
function maybeShowRepoRootBanner() { if (!repoRootOverride && !bannerDismissed()) showRepoRootBanner(); }
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

function el(tag: string, attrs?: any, ...children: any[]): any {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {}) as [string, any][]) {
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
function sidebarGroups(): any[] {
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
  const groups: any[] = [...flowsByNode.entries()]
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

// The layout engine (renderFlowInto + its constants svgNS/DUP_COLORS/CAUSAL_VERBS/READ_VERBS and its
// helpers placeCard/borderPoint/makePath/curveD/curveInto) now lives in the shared flow-geometry
// module imported at the top of this file. This client drives it through flowCtx() (below).

// The ctx the shared flow-geometry engine reads. It reproduces this static explorer's CURRENT
// behaviour exactly: its own nodeById/PALETTE, the live selection, openDetail for card clicks, and
// onContextMenu OMITTED — so the static board stays menu-less (the SPA injects a real one). Rebuilt
// per render so selectedId is current, matching how the SPA rebuilds its ctx each React render.
function flowCtx(): any {
  return { nodeById, palette: PALETTE, selectedId, onOpenDetail: openDetail };
}

// Single-flow board: render into #lane, then attach pan/zoom and fit to view.
function layoutFlow(f, lane) {
  const dim = renderFlowInto(f, lane, flowCtx());
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
  const ctx = flowCtx();
  for (const f of MODEL.flows) {
    const dead = f.status && f.status !== 'live';
    const boxEl = el('div', { class: 'context-box' + (dead ? ' dead' : '') });
    const title = el('div', { class: 'ctx-title', title: 'Open "' + f.name + '" in the Flows board', onclick: () => selectFlow(f.id) }, f.name);
    if (dead) title.append(el('span', { class: 'badge ' + f.status }, f.status.toUpperCase() + (f.supersededBy ? ' → ' + f.supersededBy : '')));
    else if (f.kind) title.append(el('span', { class: 'ctx-kind' }, f.kind));
    const laneEl = el('div', { class: 'ctx-lane' });
    boxEl.append(title, laneEl);
    canvas.append(boxEl);
    renderFlowInto(f, laneEl, ctx);          // sizes laneEl; box grows to fit
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

function selectFlow(id) {
  setMode('flows');                       // jumping to a flow (e.g. from a gallery card) shows the board
  currentFlow = MODEL.flows.find(f => f.id === id);
  selectedId = null;
  renderSidebar(((document.getElementById('search') as HTMLInputElement).value || '').toLowerCase());
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
    if (rel.length || ((t as any).anchors || []).length || termFlows(t).length) {
      const used = el('div', { class: 'gl-used' });
      for (const n of rel) { const p = PALETTE[n.type] || PALETTE.invariant; used.append(el('div', { class: 'gl-nchip', style: 'border-color:' + p.edge, title: 'Open ' + p.name + ' "' + n.label + '"', onclick: () => openDetail(n.id) }, n.label)); }
      for (const f of termFlows(t)) { const dead = f.status && f.status !== 'live'; used.append(el('div', { class: 'gl-fchip' + (dead ? ' dead' : ''), title: 'Open "' + f.name + '" in the Flows board', onclick: () => selectFlow(f.id) }, f.name)); }
      for (const a of (t as any).anchors || []) used.append(anchorLink(a));
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
// The datastore containment forest (dataModelTree) is now the shared pure builder imported at the
// top of this file; buildDataModel() below calls it with MODEL/nodeById.
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
// Field rows for a store/loose-field list. A field can itself parent sub-fields (a JSON sub-document,
// a nested record); those are counted in dataCount but are not the store's DIRECT children, so recurse
// and indent them — otherwise the count claims fields that never render.
function dmFieldCols(fields, cols, depth) {
  for (const c of fields) {
    const attrs: any = { class: 'dm-col', title: c.description || '', onclick: () => openDetail(c.id) };
    if (depth) attrs.style = 'padding-left:' + (12 + depth * 14) + 'px';
    const col = el('div', attrs, el('span', { class: 'dm-cn' }, c.label));
    if (c.dataType) col.append(el('span', { class: 'dm-ct' }, c.dataType));
    if (c.nullable === false) col.append(el('span', { class: 'dm-nn' }, 'NN'));
    cols.append(col);
    const kids = MODEL.nodes.filter(n => n.type === 'field' && n.parent === c.id);
    if (kids.length) dmFieldCols(kids, cols, depth + 1);
  }
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
    dmFieldCols(fields, cols, 0);
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
  const { roots, looseFields } = dataModelTree(MODEL, nodeById);
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
    const cols = el('div', { class: 'dm-cols' });
    dmFieldCols(looseFields, cols, 0);
    block.append(cols);
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
    const ids = new Set<string>();
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
      const counts: any = {};
      for (const fid of fIds) { const fn = nodeById.get(fid); if (fn) counts[fn.type] = (counts[fn.type] || 0) + 1; }
      const total = Object.values(counts).reduce((s: any, c: any) => s + c, 0);
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
      box.append(el('a', { class: 'anchor', href: anchorUrl(a), 'data-anchor': relAnchor(a) },
        a.path + (a.line ? ':' + a.line : '') + (a.symbol ? '  (' + a.symbol + ')' : ''),
        a.note ? el('span', { class: 'note' }, '  — ' + a.note) : null));
    }
    inner.append(box);
  }
}

function closeDetail() { document.getElementById('detail').classList.remove('open'); selectedId = null; if (currentMode === 'gallery') renderGrid(); }
document.getElementById('search').addEventListener('input', e => renderSidebar((e.target as HTMLInputElement).value.toLowerCase()));
document.querySelectorAll<HTMLElement>('#groupby .gb').forEach(b => b.addEventListener('click', () => {
  groupMode = b.dataset.mode;
  document.querySelectorAll('#groupby .gb').forEach(x => x.classList.toggle('active', x === b));
  renderSidebar(((document.getElementById('search') as HTMLInputElement).value || '').toLowerCase());
}));
document.getElementById('tab-flows').addEventListener('click', () => setMode('flows'));
document.getElementById('tab-gallery').addEventListener('click', () => setMode('gallery'));
document.getElementById('tab-datamodel').addEventListener('click', () => setMode('datamodel'));
document.getElementById('tab-glossary').addEventListener('click', () => setMode('glossary'));
document.getElementById('tab-overview').addEventListener('click', () => setMode('overview'));
document.getElementById('reporoot-btn').addEventListener('click', promptRepoRoot);
updateRepoRootBtn();

// First-open self-heal (issue #74): before the reader has set a root, the first click on ANY source
// link (they all render as vscode://file/ deep links) opens the Source-root prompt instead of firing
// a link that is dead on the reader's machine. Capture phase so it runs before each anchor's own
// handler (e.g. the glossary anchor's stopPropagation) and before navigation.
document.addEventListener('click', (e) => {
  if (repoRootOverride) return;                       // reader already resolved their local root
  const t = e.target as Element | null;
  const a = t && t.closest ? t.closest('a[href^="vscode:"]') : null;
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  promptRepoRoot();
}, true);
maybeShowRepoRootBanner();

renderSidebar('');
if (MODEL.flows.length) selectFlow(MODEL.flows[0].id);
else setMode('flows');
