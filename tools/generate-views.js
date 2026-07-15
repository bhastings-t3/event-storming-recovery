#!/usr/bin/env node
/**
 * Generate views from the canonical flows.json:
 *   1. flows.dot      - Graphviz digraph, one cluster per flow, event-storming colors
 *   2. explorer.html  - self-contained interactive explorer (no external deps)
 *
 * Usage: node generate-views.js <flows.json> <outDir> [--repo-root <path>] [--title <text>]
 *
 *   --repo-root  absolute path to the analyzed checkout, so the explorer's
 *                vscode:// deep links open the right local files. Defaults to the
 *                model's meta.repoRoot if present, else "." (links resolve relative
 *                to wherever the viewer opens them).
 *   --title      heading shown in the explorer + <title>. Defaults to the model's
 *                meta.title if present, else "Event Storming Explorer".
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flowsFile = args[0];
const outDir = args[1];
if (!flowsFile || !outDir) { console.error('usage: node generate-views.js <flows.json> <outDir> [--repo-root <path>] [--title <text>]'); process.exit(2); }

const model = JSON.parse(fs.readFileSync(flowsFile, 'utf8'));

function argVal(flag, fallback) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; }
const repoRoot = argVal('--repo-root', (model.meta && model.meta.repoRoot) || '.');
const title = argVal('--title', (model.meta && model.meta.title) || 'Event Storming Explorer');

const nodeById = new Map(model.nodes.map(n => [n.id, n]));
const hotspotById = new Map(model.hotspots.map(h => [h.id, h]));

// Event-storming palette, tuned to read as vivid sticky notes on a dark board.
// Fills stay on-hue with the canonical sticky colors; text is dark for contrast on the fill
// (except hotspot/invariant). Actor vs aggregate keep distinct yellow shades per skill guidance.
const PALETTE = {
  event:          { fill: '#F5A524', edge: '#7a5205', text: '#2b1a00', name: 'Domain Event' },
  command:        { fill: '#5B9DF0', edge: '#1e4e8a', text: '#08182f', name: 'Command' },
  actor:          { fill: '#D4A017', edge: '#6e5300', text: '#241a00', name: 'Actor' },
  aggregate:      { fill: '#F3E27E', edge: '#8a7a1f', text: '#2a2600', name: 'Aggregate' },
  policy:         { fill: '#BB8FEA', edge: '#603a99', text: '#22103a', name: 'Policy' },
  readModel:      { fill: '#5FD08A', edge: '#237a47', text: '#062a17', name: 'Read Model' },
  externalSystem: { fill: '#F080AE', edge: '#9c355f', text: '#360a20', name: 'External System' },
  invariant:      { fill: '#2c2c34', edge: '#4a4a56', text: '#c9c9d4', name: 'Invariant' },
  hotspot:        { fill: '#EF4E4E', edge: '#8f1d1d', text: '#ffffff', name: 'Hotspot' },
};

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dotEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function anchorUrl(a) { return `vscode://file/${repoRoot}/${a.path}${a.line ? ':' + a.line : ''}`; }

/* ---------------- DOT ---------------- */
let dot = [];
dot.push('digraph event_storming {');
dot.push('  bgcolor="#0a0a0d"; rankdir=LR; fontname="Segoe UI"; compound=true;');
dot.push('  node [shape=box, style="filled,rounded", fontname="Segoe UI", fontsize=10, margin="0.15,0.08"];');
dot.push('  edge [fontname="Segoe UI", fontsize=8, color="#8a8a94", fontcolor="#a1a1aa"];');
for (const f of model.flows) {
  const dead = f.status && f.status !== 'live';
  dot.push(`  subgraph "cluster_${f.id}" {`);
  dot.push(`    label="${dotEsc(f.name)}${dead ? '  [' + f.status.toUpperCase() + ']' : ''}"; fontsize=13; color="${dead ? '#3a3a44' : '#4a4a56'}"; style="rounded"; fontcolor="${dead ? '#71717a' : '#e4e4e7'}";`);
  const used = new Set();
  (f.steps || []).forEach(s => used.add(s));
  (f.edges || []).forEach(e => { used.add(e.from); used.add(e.to); });
  for (const id of used) {
    const n = nodeById.get(id); if (!n) continue;
    const p = PALETTE[n.type] || PALETTE.invariant;
    const firstAnchor = n.tactical && n.tactical.anchors && n.tactical.anchors[0];
    const url = firstAnchor ? `, URL="${anchorUrl(firstAnchor)}"` : '';
    const tip = dotEsc((n.description || '').slice(0, 300));
    const deadStyle = dead ? ',dashed' : '';
    dot.push(`    "${f.id}__${id}" [label="${dotEsc(n.label)}", fillcolor="${p.fill}", color="${p.edge}", fontcolor="${p.text}", style="filled,rounded${deadStyle}", tooltip="${tip}"${url}];`);
  }
  for (const e of f.edges || []) {
    if (!used.has(e.from) || !used.has(e.to)) continue;
    dot.push(`    "${f.id}__${e.from}" -> "${f.id}__${e.to}" [label="${dotEsc(e.verb)}"];`);
  }
  dot.push('  }');
}
dot.push('}');
fs.writeFileSync(path.join(outDir, 'flows.dot'), dot.join('\n'));

/* ---------------- Explorer HTML ---------------- */
const modelJson = JSON.stringify(model).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  /* shadcn-style neutral-dark token system (vanilla CSS, no framework) */
  :root {
    --bg: #0a0a0d; --panel: #131317; --card: #17171c; --input: #1a1a21;
    --fg: #f4f4f5; --muted: #9a9aa6; --dim: #d1d1d8;
    --line: #26262d; --accent: #1e1e26; --accent-2: #26262f; --ring: #6b6b7a;
    --radius: 8px;
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 10px 28px rgba(0,0,0,.4);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg); color: var(--fg); height: 100vh; display: flex; overflow: hidden;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  /* sidebar */
  #sidebar { width: 300px; min-width: 300px; background: var(--panel); border-right: 1px solid var(--line); display: flex; flex-direction: column; }
  #sidebar header { padding: 16px 18px 13px; border-bottom: 1px solid var(--line); }
  #sidebar h1 { font-size: 14px; font-weight: 650; margin: 0 0 3px; letter-spacing: -.01em; }
  #sidebar .sub { font-size: 11px; color: var(--muted); line-height: 1.4; }
  #search {
    margin: 12px; padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--radius);
    font: inherit; font-size: 13px; width: calc(100% - 24px); background: var(--input); color: var(--fg); outline: none;
    transition: border-color .12s, box-shadow .12s;
  }
  #search::placeholder { color: var(--muted); }
  #search:focus { border-color: var(--ring); box-shadow: 0 0 0 3px rgba(120,120,140,.16); }
  #flowlist { overflow-y: auto; flex: 1; padding: 4px 8px 16px; }
  .flow-group { font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 15px 8px 6px; font-weight: 600; }
  .flow-item { padding: 8px 10px; border-radius: var(--radius); cursor: pointer; display: flex; gap: 8px; align-items: baseline; transition: background .1s; }
  .flow-item:hover { background: var(--accent); }
  .flow-item.active { background: var(--accent-2); }
  .flow-item.active .nm { color: #fff; font-weight: 600; }
  .flow-item .nm { flex: 1; font-size: 13px; color: var(--dim); line-height: 1.35; }
  .badge { font-size: 9px; padding: 2px 7px; border-radius: 99px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; text-transform: uppercase; }
  .badge.dead { background: #3a1414; color: #fca5a5; }
  .badge.superseded { background: #382b10; color: #fcd34d; }
  .badge.read { background: rgba(95,208,138,.15); color: #74dc9b; }
  .badge.write { background: rgba(91,157,240,.15); color: #93c5fd; }
  .badge.policy { background: rgba(187,143,234,.16); color: #d0aef5; }
  .badge.hs { background: rgba(239,78,78,.18); color: #fca5a5; }
  /* main */
  #main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #flowheader { padding: 18px 24px 15px; border-bottom: 1px solid var(--line); background: var(--panel); }
  #flowheader h2 { margin: 0 0 6px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
  #flowheader .summary { color: var(--muted); font-size: 13px; max-width: 940px; line-height: 1.6; }
  #flowheader .trigger { font-size: 12px; margin-top: 9px; color: var(--dim); }
  #flowheader .trigger b { color: var(--muted); font-weight: 600; }
  /* the board: a subtle dot-grid backdrop for the sticky lane */
  #lane-wrap {
    flex: 1; min-height: 250px; overflow: auto; padding: 30px 24px;
    background-image: radial-gradient(circle, #1b1b22 1px, transparent 1.4px);
    background-size: 22px 22px; background-position: -1px -1px;
  }
  #lane { display: flex; align-items: flex-start; gap: 0; min-width: max-content; }
  .step-col { display: flex; flex-direction: column; align-items: center; gap: 9px; }
  .sticky {
    width: 162px; min-height: 98px; border-radius: var(--radius); padding: 11px 13px; cursor: pointer;
    border: 1px solid rgba(0,0,0,.28); box-shadow: var(--shadow); position: relative; transition: transform .1s, box-shadow .1s;
  }
  .sticky:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.55); }
  .sticky.selected { outline: 2px solid var(--fg); outline-offset: 2px; }
  .sticky .ntype { font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .7; margin-bottom: 5px; }
  .sticky .nlabel { font-size: 12.5px; font-weight: 650; line-height: 1.32; }
  .sticky .flags { position: absolute; top: 7px; right: 9px; font-size: 9px; opacity: .72; font-weight: 600; }
  .inv { width: 152px; border-radius: 7px; padding: 7px 10px; font-size: 10.5px; cursor: pointer; line-height: 1.35; transition: transform .1s; }
  .inv:hover { transform: translateY(-2px); }
  .arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 56px; padding-top: 40px; }
  .arrow .verb { font-size: 9px; color: var(--muted); margin-bottom: 3px; white-space: nowrap; letter-spacing: .02em; }
  .arrow svg { display: block; }
  #hotspots { padding: 6px 24px 22px; max-height: 320px; overflow-y: auto; flex-shrink: 0; border-top: 1px solid var(--line); }
  #hotspots h3 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #f87171; margin: 14px 0 10px; font-weight: 700; }
  .hs-cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .hs-card {
    background: rgba(239,78,78,.08); border: 1px solid rgba(239,78,78,.32); border-radius: var(--radius);
    padding: 11px 14px; width: 322px; cursor: pointer; transition: background .12s, border-color .12s, transform .1s;
  }
  .hs-card:hover { background: rgba(239,78,78,.14); border-color: rgba(239,78,78,.55); transform: translateY(-2px); }
  .hs-card b { display: block; font-size: 12.5px; margin-bottom: 4px; color: #fca5a5; line-height: 1.35; }
  .hs-card span { font-size: 11px; color: #cf9d9d; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }
  #instances { padding: 2px 24px 24px; font-size: 12px; }
  #instances h3 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 14px 0 8px; font-weight: 700; }
  #instances table { border-collapse: collapse; }
  #instances td { padding: 4px 16px 4px 0; color: var(--muted); }
  /* detail panel */
  #detail { width: 0; min-width: 0; background: var(--panel); border-left: 1px solid var(--line); overflow-y: auto; transition: width .16s, min-width .16s; }
  #detail.open { width: 440px; min-width: 440px; }
  #detail .inner { padding: 20px 22px 32px; }
  #detail h3 { margin: 4px 0 3px; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
  #detail .dtype { font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 6px; display: inline-block; margin-bottom: 10px; }
  #detail .desc { font-size: 13px; margin-bottom: 14px; color: var(--dim); line-height: 1.6; }
  #detail .chips { margin-bottom: 14px; display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { font-size: 10px; background: var(--accent); border: 1px solid var(--line); border-radius: 99px; padding: 3px 10px; color: var(--muted); font-weight: 600; }
  #detail h4 { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 18px 0 8px; font-weight: 700; }
  .usage { border: 1px solid var(--line); border-radius: var(--radius); padding: 11px 13px; margin-bottom: 10px; background: var(--card); }
  .usage .uflow { font-size: 10px; font-weight: 700; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em; }
  .usage .uexp { font-size: 12px; margin-bottom: 9px; white-space: pre-wrap; color: var(--dim); line-height: 1.55; }
  .anchor { display: block; font: 11px/1.65 ui-monospace, "Cascadia Code", Consolas, monospace; color: #7db2f5; text-decoration: none; word-break: break-all; margin-bottom: 2px; }
  .anchor:hover { text-decoration: underline; color: #a5cbf9; }
  .anchor .note { color: var(--muted); font-family: ui-sans-serif, system-ui, sans-serif; }
  #closedetail { float: right; border: 0; background: none; font-size: 15px; cursor: pointer; color: var(--muted); padding: 3px 6px; border-radius: 6px; line-height: 1; }
  #closedetail:hover { background: var(--accent); color: var(--fg); }
  #legend { padding: 12px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; }
  #legend .lg { font-size: 9px; padding: 3px 8px; border-radius: 6px; font-weight: 700; letter-spacing: .02em; }
  /* scrollbars */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2c2c34; border-radius: 6px; border: 2px solid var(--panel); }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a45; }
</style>
</head>
<body>
<aside id="sidebar">
  <header><h1>${esc(title)}</h1><div class="sub">strategic flows recovered from the tactical codebase</div></header>
  <input id="search" placeholder="Filter flows..." type="search">
  <nav id="flowlist"></nav>
  <div id="legend"></div>
</aside>
<div id="main">
  <div id="flowheader"></div>
  <div id="lane-wrap"><div id="lane"></div></div>
  <div id="hotspots"></div>
  <div id="instances"></div>
</div>
<aside id="detail"><div class="inner" id="detail-inner"></div></aside>
<script>
const MODEL = ${modelJson};
const REPO_ROOT = ${JSON.stringify(repoRoot)};
const PALETTE = ${JSON.stringify(PALETTE)};
const nodeById = new Map(MODEL.nodes.map(n => [n.id, n]));
const hotspotById = new Map(MODEL.hotspots.map(h => [h.id, h]));
let currentFlow = null, selectedId = null;

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
function anchorUrl(a) { return 'vscode://file/' + REPO_ROOT + '/' + a.path + (a.line ? ':' + a.line : ''); }

function renderSidebar(filter) {
  const list = document.getElementById('flowlist');
  list.innerHTML = '';
  const groups = [['Tier 1 — domain flows', f => f.tier !== 2], ['Tier 2 — patterns', f => f.tier === 2]];
  for (const [title, pred] of groups) {
    const flows = MODEL.flows.filter(pred).filter(f => !filter || (f.name + f.id).toLowerCase().includes(filter));
    if (!flows.length) continue;
    list.append(el('div', { class: 'flow-group' }, title));
    for (const f of flows) {
      const item = el('div', { class: 'flow-item' + (currentFlow && currentFlow.id === f.id ? ' active' : ''), onclick: () => selectFlow(f.id) },
        el('span', { class: 'nm' }, f.name));
      item.append(el('span', { class: 'badge ' + (f.kind === 'read' ? 'read' : f.kind === 'policy' ? 'policy' : 'write') }, f.kind || 'write'));
      if (f.status && f.status !== 'live') item.append(el('span', { class: 'badge ' + f.status }, f.status));
      if ((f.hotspots || []).length) item.append(el('span', { class: 'badge hs' }, String(f.hotspots.length)));
      list.append(item);
    }
  }
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  for (const [type, p] of Object.entries(PALETTE)) {
    legend.append(el('span', { class: 'lg', style: 'background:' + p.fill + ';color:' + p.text }, p.name));
  }
}

function invariantsFor(flow, aggId) {
  return (flow.edges || []).filter(e => e.from === aggId && e.verb === 'enforces').map(e => nodeById.get(e.to)).filter(Boolean);
}
function verbBetween(flow, a, b) {
  const e = (flow.edges || []).find(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  if (!e) return { verb: '', rev: false };
  return { verb: e.verb, rev: e.from === b };
}

function selectFlow(id) {
  currentFlow = MODEL.flows.find(f => f.id === id);
  selectedId = null;
  renderSidebar((document.getElementById('search').value || '').toLowerCase());
  renderFlow();
  closeDetail();
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

  const lane = document.getElementById('lane');
  lane.innerHTML = '';
  const steps = (f.steps || []).filter(s => nodeById.has(s));
  steps.forEach((sid, i) => {
    if (i > 0) {
      const { verb, rev } = verbBetween(f, steps[i - 1], sid);
      const arrow = el('div', { class: 'arrow' },
        el('span', { class: 'verb' }, verb),
        svgArrow(rev));
      lane.append(arrow);
    }
    const n = nodeById.get(sid);
    const p = PALETTE[n.type] || PALETTE.invariant;
    const col = el('div', { class: 'step-col' });
    const sticky = el('div', {
      class: 'sticky' + (selectedId === sid ? ' selected' : ''),
      style: 'background:' + p.fill + ';border-color:' + p.edge + ';color:' + p.text,
      onclick: () => openDetail(sid)
    },
      el('div', { class: 'ntype' }, p.name),
      el('div', { class: 'nlabel' }, n.label));
    const flags = [];
    if (n.ownedBy) flags.push('⛓ ' + n.ownedBy.replace(/^ext-/, ''));
    if (n.synchronous) flags.push('inline');
    if (flags.length) sticky.append(el('div', { class: 'flags' }, flags.join(' · ')));
    col.append(sticky);
    if (n.type === 'aggregate') {
      for (const inv of invariantsFor(f, sid)) {
        col.append(el('div', {
          class: 'inv',
          style: 'background:' + PALETTE.invariant.fill + ';border:1px dashed ' + PALETTE.invariant.edge + ';color:' + PALETTE.invariant.text,
          onclick: () => openDetail(inv.id)
        }, '⚖ ' + inv.label));
      }
    }
    lane.append(col);
  });

  const hs = document.getElementById('hotspots');
  hs.innerHTML = '';
  const spots = (f.hotspots || []).map(h => hotspotById.get(h)).filter(Boolean);
  if (spots.length) {
    hs.append(el('h3', {}, 'Hotspots — questions a human should answer'));
    const cards = el('div', { class: 'hs-cards' });
    for (const s of spots) cards.append(el('div', { class: 'hs-card', onclick: () => openHotspot(s.id) }, el('b', {}, s.label), el('span', {}, s.description)));
    hs.append(cards);
  }

  const inst = document.getElementById('instances');
  inst.innerHTML = '';
  if ((f.instances || []).length) {
    inst.append(el('h3', {}, 'Instances of this pattern (' + f.instances.length + ')'));
    const t = el('table', {});
    for (const i of f.instances) t.append(el('tr', {}, el('td', {}, i.label || ''), el('td', {}, i.route || ''), el('td', {}, i.file || '')));
    inst.append(t);
  }
}

function svgArrow(rev) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '46'); svg.setAttribute('height', '12');
  svg.innerHTML = rev
    ? '<path d="M46 6 H4 M10 1 L3 6 L10 11" stroke="#71717a" stroke-width="1.5" fill="none"/>'
    : '<path d="M0 6 H42 M36 1 L43 6 L36 11" stroke="#71717a" stroke-width="1.5" fill="none"/>';
  return svg;
}

function openDetail(id) {
  selectedId = id;
  renderFlow();
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
  if (n.ownedBy) chips.append(el('span', { class: 'chip' }, 'state owned by ' + n.ownedBy));
  if (n.synchronous) chips.append(el('span', { class: 'chip' }, 'synchronous inline reaction'));
  inner.append(chips);
  inner.append(el('div', { class: 'desc' }, n.description || ''));

  const usages = (n.usages && n.usages.length) ? n.usages : (n.tactical ? [{ flow: '', explanation: n.tactical.explanation, anchors: n.tactical.anchors }] : []);
  if (usages.length) {
    inner.append(el('h4', {}, 'Tactical implementation'));
    for (const u of usages) {
      const box = el('div', { class: 'usage' });
      if (u.flow) box.append(el('div', { class: 'uflow' }, 'in flow: ' + u.flow));
      if (u.explanation) box.append(el('div', { class: 'uexp' }, u.explanation));
      for (const a of u.anchors || []) {
        box.append(el('a', { class: 'anchor', href: anchorUrl(a) },
          a.path + (a.line ? ':' + a.line : '') + (a.symbol ? '  (' + a.symbol + ')' : ''),
          a.note ? el('span', { class: 'note' }, '  — ' + a.note) : null));
      }
      inner.append(box);
    }
  }
  // flows this node appears in
  const inFlows = MODEL.flows.filter(f => (f.steps || []).includes(id) || (f.edges || []).some(e => e.from === id || e.to === id));
  if (inFlows.length > 1) {
    inner.append(el('h4', {}, 'Appears in ' + inFlows.length + ' flows'));
    for (const f of inFlows) inner.append(el('a', { class: 'anchor', href: '#', onclick: (ev) => { ev.preventDefault(); selectFlow(f.id); } }, f.name));
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

function closeDetail() { document.getElementById('detail').classList.remove('open'); selectedId = null; }
document.getElementById('search').addEventListener('input', e => renderSidebar(e.target.value.toLowerCase()));

renderSidebar('');
if (MODEL.flows.length) selectFlow(MODEL.flows[0].id);
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(outDir, 'explorer.html'), html);

console.log(`wrote ${path.join(outDir, 'flows.dot')} and ${path.join(outDir, 'explorer.html')}`);
console.log(`flows: ${model.flows.length}, nodes: ${model.nodes.length}, hotspots: ${model.hotspots.length}`);
