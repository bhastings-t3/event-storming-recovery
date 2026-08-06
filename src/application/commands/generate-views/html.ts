// renderHtml: the self-contained explorer.html — the HTML shell + <style> CSS, with the client JS
// inlined from the BUILT client bundle (issue #41 / ADR-0007). The client is now real type-checked
// source (src/web/static-explorer/explorer-client.ts) built to dist/client/explorer-client.js by
// scripts/build-client.mjs; here we read that bundle from dist and inline it behind a tiny
// window.__ES__ preamble carrying the per-model MODEL / REPO_ROOT_DEFAULT / PALETTE. The bundle is a
// self-contained IIFE, so explorer.html stays a single offline file (no external <script>/CDN).
//
// Deterministic (same model -> same bytes): the only I/O is reading the immutable built bundle. That
// fs read is a runtime read of a dist artifact, NOT an import into src/web — the ports-and-adapters
// boundary (application must not import adapters/web) is intact (tests/architecture-boundary.test.mjs
// scans import specifiers, not fs reads).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE } from '../../../domain/model/palette.js';
import type { Model } from '../../../domain/model/types.js';

// Resolve the built client bundle relative to THIS module so `generate` works from a published
// install exactly as the bin does: html.js sits at dist/node/application/commands/generate-views/,
// the bundle at dist/client/explorer-client.js (four dirs up, then client/). package.json `files`
// ships all of dist, so the same relative layout holds in an installed package.
const CLIENT_BUNDLE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../client/explorer-client.js',
);
let clientBundle: string | null = null;
function readClientBundle(): string {
  if (clientBundle === null) clientBundle = readFileSync(CLIENT_BUNDLE_PATH, 'utf8');
  return clientBundle;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Serialize a value for safe embedding inside a <script> element: JSON, with `<` escaped so a value
// containing `</script>` (a node description, say) cannot break out of the tag. Mirrors the pre-#41
// modelJson guard, now applied to all three injected globals.
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// The preamble the client (explorer-client.ts) reads: it sets the per-model globals BEFORE the bundle
// IIFE runs, so the client source carries no interpolation. Preserves REPO_ROOT_DEFAULT as the reader-
// overridable board default (localStorage esRepoRoot, ADR-0006) — the client's own logic, unchanged.
function renderClientPreamble(model: Model, repoRoot: string): string {
  return `window.__ES__ = { MODEL: ${scriptJson(model)}, REPO_ROOT_DEFAULT: ${scriptJson(repoRoot)}, PALETTE: ${scriptJson(PALETTE)} };`;
}

export function renderHtml(model: Model, repoRoot: string, title: string): string {
  const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; overflow: hidden;
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
  /* group-by switch: pivot the flow list by tier / actor / aggregate */
  #groupby { display: flex; align-items: center; gap: 5px; margin: 0 12px 6px; flex-wrap: wrap; }
  #groupby .gb-cap { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; margin-right: 1px; }
  .gb { font: inherit; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--line); background: var(--input); color: var(--muted); cursor: pointer; transition: background .1s, color .1s, border-color .1s; }
  .gb:hover { color: var(--dim); background: var(--accent); }
  .gb.active { background: var(--accent-2); color: #fff; border-color: var(--ring); }
  #flowlist { overflow-y: auto; flex: 1; padding: 4px 8px 16px; }
  .flow-group { font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 15px 8px 6px; font-weight: 600; display: flex; align-items: center; }
  .flow-group .fg-dot { width: 8px; height: 8px; border-radius: 2px; margin-right: 7px; flex-shrink: 0; }
  .flow-item { position: relative; padding: 9px 10px 9px 17px; border-radius: var(--radius); cursor: pointer; display: flex; gap: 8px; align-items: center; transition: background .1s; }
  .flow-item::before { content: ''; position: absolute; left: 7px; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: var(--kind, #3f3f46); }
  .flow-item:hover { background: var(--accent); }
  .flow-item.active { background: var(--accent-2); }
  .flow-item.dim { opacity: .5; }
  .flow-item.dim:hover { opacity: .75; }
  .flow-item .nm { flex: 1; min-width: 0; font-size: 12.5px; color: var(--dim); line-height: 1.32; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .flow-item.active .nm { color: #fff; font-weight: 600; }
  .fi-tags { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .status-dot { width: 7px; height: 7px; border-radius: 99px; }
  .status-dot.dead { background: #e5645e; }
  .status-dot.superseded { background: #d2a63a; }
  .hs-count { font-size: 10px; font-weight: 700; color: #e18d88; background: rgba(229,100,94,.14); border-radius: 99px; padding: 1px 6px; min-width: 17px; text-align: center; }
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
  #flowheader .summary { color: var(--muted); font-size: 12.5px; max-width: 900px; line-height: 1.55; }
  #flowheader .trigger { font-size: 12px; margin-top: 9px; color: var(--dim); }
  #flowheader .trigger b { color: var(--muted); font-weight: 600; }
  /* the board: a subtle dot-grid backdrop for the sticky lane */
  #lane-wrap {
    flex: 1; min-height: 250px; overflow: hidden; padding: 0; position: relative; cursor: grab;
    background-image: radial-gradient(circle, #1b1b22 1px, transparent 1.4px);
    background-size: 22px 22px; background-position: -1px -1px;
  }
  #lane-wrap.grabbing { cursor: grabbing; }
  #lane { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
  .zoomctl { position: absolute; right: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; z-index: 20; }
  .zoomctl button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); font-size: 16px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow); user-select: none; }
  .zoomctl button:hover { background: var(--line); }
  svg.edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
  .sticky {
    position: absolute; width: 176px; min-height: 92px; border-radius: var(--radius); padding: 11px 13px; cursor: pointer;
    border: 1px solid rgba(0,0,0,.28); box-shadow: var(--shadow); transition: transform .1s, box-shadow .1s; z-index: 1;
  }
  .sticky:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.55); z-index: 3; }
  .sticky.selected { outline: 2px solid var(--fg); outline-offset: 2px; z-index: 3; }
  .sticky .ntype { font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .7; margin-bottom: 5px; overflow-wrap: anywhere; }
  .sticky .nlabel { font-size: 12.5px; font-weight: 650; line-height: 1.32; overflow-wrap: anywhere; }
  .sticky .flags { position: absolute; bottom: 7px; right: 10px; font-size: 9px; opacity: .72; font-weight: 600; }
  /* corner dot marking a node that appears more than once (same color = same node) */
  .dupdot { position: absolute; top: 7px; right: 8px; width: 11px; height: 11px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.5); cursor: pointer; transition: transform .1s; z-index: 4; }
  .dupdot:hover { transform: scale(1.4); }
  .inv .dupdot { top: 5px; right: 6px; width: 8px; height: 8px; }
  /* hover-focus: dim everything except the hovered node's neighborhood + its duplicates */
  .sticky, .inv, .edge-verb { transition: opacity .13s; }
  svg.edges path { transition: opacity .13s; }
  .focusing .sticky.lo, .focusing .inv.lo { opacity: .12; }
  .focusing .edge-verb.lo { opacity: .06; }
  .focusing svg.edges path.lo { opacity: .08; }
  .inv { position: absolute; width: 150px; border-radius: 7px; padding: 7px 10px; font-size: 10.5px; cursor: pointer; line-height: 1.35; transition: transform .1s; overflow-wrap: anywhere; z-index: 1; }
  .inv:hover { transform: translateY(-2px); z-index: 3; }
  .edge-verb { position: absolute; font-size: 9px; color: var(--muted); background: var(--bg); padding: 0 4px; border-radius: 3px; pointer-events: none; letter-spacing: .02em; white-space: nowrap; z-index: 2; transform: translate(-50%, -50%); }
  /* findings band: distinct panel surface below the dark board, scrolls if tall */
  #findings { background: var(--panel); border-top: 1px solid var(--line); flex-shrink: 0; max-height: 30vh; overflow-y: auto; }
  #hotspots { padding: 14px 24px 18px; }
  #hotspots h3, #instances h3 { font-size: 10px; letter-spacing: .09em; text-transform: uppercase; margin: 0 0 11px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  #hotspots h3 { color: #e5645e; }
  #hotspots h3 .n, #instances h3 .n { font-size: 10px; background: var(--accent-2); color: var(--dim); border-radius: 99px; padding: 1px 7px; font-weight: 700; letter-spacing: 0; }
  .hs-cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .hs-card {
    background: rgba(229,100,94,.07); border: 1px solid rgba(229,100,94,.28); border-radius: var(--radius);
    padding: 11px 14px; width: 320px; cursor: pointer; transition: background .12s, border-color .12s, transform .1s;
  }
  .hs-card:hover { background: rgba(229,100,94,.13); border-color: rgba(229,100,94,.5); transform: translateY(-2px); }
  .hs-card b { display: block; font-size: 12px; margin-bottom: 4px; color: #eda3a0; line-height: 1.35; overflow-wrap: anywhere; }
  .hs-card span { font-size: 11px; color: #b98e8c; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; overflow-wrap: anywhere; }
  #instances { padding: 4px 24px 22px; font-size: 12px; }
  #instances h3 { color: var(--muted); }
  #instances table { border-collapse: collapse; width: 100%; }
  #instances tr { border-bottom: 1px solid rgba(255,255,255,.04); }
  #instances td { padding: 5px 16px 5px 0; vertical-align: top; }
  #instances .i-label { color: var(--dim); font-weight: 500; }
  #instances .i-route { color: var(--muted); font: 11px/1.5 ui-monospace, Consolas, monospace; }
  #instances .i-file { color: #7d7d88; font: 11px/1.5 ui-monospace, Consolas, monospace; }
  /* detail panel */
  #detail { width: 0; min-width: 0; background: var(--panel); border-left: 1px solid var(--line); overflow-y: auto; transition: width .16s, min-width .16s; }
  #detail.open { width: 440px; min-width: 440px; }
  #detail .inner { padding: 20px 22px 32px; }
  #detail h3 { margin: 4px 0 3px; font-size: 16px; font-weight: 650; letter-spacing: -.01em; overflow-wrap: anywhere; }
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
  /* "appears in" flow rows: each flow is a card whose colored count-dots preview its composition */
  .flowrow { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 8px; background: var(--card); cursor: pointer; transition: background .12s, border-color .12s; }
  .flowrow:hover { background: var(--accent); border-color: var(--ring); }
  .flowrow .fr-name { font-size: 12.5px; font-weight: 600; color: var(--dim); line-height: 1.3; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .flowrow:hover .fr-name { color: #fff; }
  .flowrow .fr-dots { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .cdot { display: inline-flex; align-items: center; justify-content: center; min-width: 21px; height: 21px; padding: 0 6px; border-radius: 99px; font-size: 10.5px; font-weight: 800; border: 1px solid rgba(255,255,255,.14); }
  /* aggregate <-> invariant cross-reference rows: a small colored sticky-chip + label, navigates on click */
  .relrow { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 11px; margin-bottom: 7px; background: var(--card); cursor: pointer; transition: background .12s, border-color .12s; }
  .relrow:hover { background: var(--accent); border-color: var(--ring); }
  .relrow .rdot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; border: 1px solid rgba(0,0,0,.35); }
  .relrow .rlabel { font-size: 12.5px; color: var(--dim); line-height: 1.35; overflow-wrap: anywhere; }
  .relrow:hover .rlabel { color: #fff; }
  #closedetail { float: right; border: 0; background: none; font-size: 15px; cursor: pointer; color: var(--muted); padding: 3px 6px; border-radius: 6px; line-height: 1; }
  #closedetail:hover { background: var(--accent); color: var(--fg); }
  #legend { padding: 12px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; }
  #legend .lg { font-size: 9px; padding: 3px 8px; border-radius: 6px; font-weight: 700; letter-spacing: .02em; }
  /* scrollbars */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2c2c34; border-radius: 6px; border: 2px solid var(--panel); }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a45; }
  /* top tab bar: Flows board vs. Gallery of every sticky */
  #tabbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--panel); border-bottom: 1px solid var(--line); flex-shrink: 0; }
  .tab { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 15px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; transition: background .1s, color .1s; }
  .tab:hover { background: var(--accent); color: var(--dim); }
  .tab.active { background: var(--accent-2); color: #fff; border-color: var(--line); }
  /* first-open self-heal banner (issue #74): a slim, non-modal bar between the tab bar and the shell
     that tells a reader the source links need their local checkout path. A flex row in the column
     body, so it pushes the shell down rather than overlaying (never intercepts board/tab clicks). */
  #reporoot-banner { display: flex; align-items: center; gap: 12px; padding: 9px 16px; background: #1c1a12; border-bottom: 1px solid #3a3320; color: #e7d9a8; font-size: 12.5px; flex-shrink: 0; }
  #reporoot-banner .rb-msg { flex: 1; line-height: 1.4; min-width: 0; }
  #reporoot-banner .rb-set { font: inherit; font-size: 11.5px; font-weight: 650; padding: 5px 12px; border-radius: 7px; border: 1px solid #6b5d2e; background: #2c2713; color: #f2e3ab; cursor: pointer; white-space: nowrap; }
  #reporoot-banner .rb-set:hover { background: #3a3319; border-color: #8a7838; }
  #reporoot-banner .rb-x { font: inherit; font-size: 14px; line-height: 1; padding: 4px 7px; border-radius: 6px; border: 0; background: none; color: #b8a86a; cursor: pointer; }
  #reporoot-banner .rb-x:hover { background: rgba(255,255,255,.06); color: #f2e3ab; }
  #shell { flex: 1; min-height: 0; display: flex; }
  /* gallery: a wall of every sticky in the model, filtered by type chips + search */
  #gallery { flex: 1; min-width: 0; display: none; flex-direction: column; }
  #gallery.show { display: flex; }
  .gallery-head { padding: 16px 24px 13px; border-bottom: 1px solid var(--line); background: var(--panel); flex-shrink: 0; }
  .gallery-head h2 { margin: 0 0 11px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
  .gallery-head h2 .count { font-size: 11px; font-weight: 700; background: var(--accent-2); color: var(--dim); border-radius: 99px; padding: 2px 9px; letter-spacing: 0; }
  .gallery-search { padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); font: inherit; font-size: 13px; width: 100%; max-width: 420px; background: var(--input); color: var(--fg); outline: none; transition: border-color .12s, box-shadow .12s; }
  .gallery-search::placeholder { color: var(--muted); }
  .gallery-search:focus { border-color: var(--ring); box-shadow: 0 0 0 3px rgba(120,120,140,.16); }
  .type-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .tchip { font-size: 10px; font-weight: 700; letter-spacing: .03em; padding: 4px 11px; border-radius: 99px; cursor: pointer; border: 1px solid transparent; user-select: none; text-transform: uppercase; opacity: .38; transition: opacity .1s, box-shadow .1s; }
  .tchip:hover { opacity: .75; }
  .tchip.on { opacity: 1; }
  .tchip-all { background: var(--accent-2); color: var(--dim); border-color: var(--line); }
  .gallery-grid { flex: 1; overflow-y: auto; padding: 18px 24px 28px; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; align-content: start; }
  .gcard { border-radius: var(--radius); padding: 12px 14px; cursor: pointer; border: 1px solid rgba(0,0,0,.28); box-shadow: var(--shadow); position: relative; min-height: 104px; display: flex; flex-direction: column; transition: transform .1s, box-shadow .1s; }
  .gcard:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.55); }
  .gcard.selected { outline: 2px solid var(--fg); outline-offset: 2px; }
  .gcard .gtype { font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .7; margin-bottom: 5px; }
  .gcard .glabel { font-size: 13px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
  .gcard .gdesc { font-size: 11px; line-height: 1.45; margin-top: 6px; opacity: .82; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .gcard .gmeta { margin-top: auto; padding-top: 9px; font-size: 10px; font-weight: 600; opacity: .72; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .gcard .gdead { background: rgba(0,0,0,.2); border-radius: 99px; padding: 1px 8px; text-transform: uppercase; letter-spacing: .04em; }
  .gempty { grid-column: 1 / -1; color: var(--muted); font-size: 13px; padding: 22px 2px; }
  /* overview: the whole model at once — every flow rendered inside its own bounded-context box */
  #overview { flex: 1; min-width: 0; display: none; flex-direction: column; }
  #overview.show { display: flex; }
  /* Glossary: the ubiquitous language as a readable, alphabetical dictionary */
  #glossary { flex: 1; min-width: 0; display: none; flex-direction: column; }
  #glossary.show { display: flex; }
  .gl-head { padding: 16px 24px 13px; border-bottom: 1px solid var(--line); background: var(--panel); flex-shrink: 0; }
  .gl-head h2 { margin: 0 0 11px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
  .gl-head h2 .count { font-size: 11px; font-weight: 700; background: var(--accent-2); color: var(--dim); border-radius: 99px; padding: 2px 9px; letter-spacing: 0; }
  .gl-search { width: 100%; max-width: 520px; padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--radius); font: inherit; font-size: 13px; background: var(--input); color: var(--fg); outline: none; margin-bottom: 11px; }
  .gl-search::placeholder { color: var(--muted); }
  .gl-search:focus { border-color: var(--ring); box-shadow: 0 0 0 3px rgba(120,120,140,.16); }
  .gl-body { flex: 1; display: flex; min-height: 0; }
  .gl-list { flex: 1; overflow-y: auto; padding: 4px 20px 44px 24px; }
  .gl-rail { flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 8px 9px; border-left: 1px solid var(--line); background: var(--panel); }
  .gl-rail span { font-size: 10px; font-weight: 700; color: var(--muted); cursor: pointer; padding: 1px 5px; border-radius: 4px; text-align: center; }
  .gl-rail span:hover { background: var(--accent-2); color: #fff; }
  .gl-letter { font-size: 20px; font-weight: 750; color: var(--fg); padding: 20px 0 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; letter-spacing: -.02em; position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .gl-entry { padding: 12px 8px 14px 12px; border-bottom: 1px solid var(--accent); border-left: 2px solid transparent; transition: background .08s; }
  .gl-entry:hover { background: var(--accent); }
  .gl-entry.flagged { border-left-color: rgba(229,100,94,.55); background: rgba(229,100,94,.04); }
  .gl-entry.flagged:hover { background: rgba(229,100,94,.09); }
  .gl-term { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .gl-badge { font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 2px 8px; border-radius: 99px; flex-shrink: 0; }
  .gl-name { font-size: 15px; font-weight: 650; color: var(--fg); overflow-wrap: anywhere; }
  .gl-flag { font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-radius: 99px; background: rgba(229,100,94,.16); color: #eda3a0; border: 1px solid rgba(229,100,94,.4); }
  .gl-aka { font-size: 11px; font-style: italic; color: var(--muted); }
  .gl-flows { font-size: 10.5px; font-weight: 600; color: var(--muted); }
  .gl-def { font-size: 12.5px; line-height: 1.5; color: var(--dim); margin-top: 6px; overflow-wrap: anywhere; }
  .gl-oq { font-size: 12px; line-height: 1.5; color: #b98e8c; margin-top: 7px; padding: 7px 11px; background: rgba(229,100,94,.07); border: 1px solid rgba(229,100,94,.25); border-radius: var(--radius); overflow-wrap: anywhere; }
  .gl-oq b { color: #eda3a0; }
  .gl-used { margin-top: 9px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .gl-nchip { font-size: 10px; font-weight: 600; color: var(--dim); background: var(--accent-2); border: 1px solid var(--line); border-radius: 99px; padding: 2px 9px; cursor: pointer; }
  .gl-nchip:hover { color: #fff; }
  .gl-fchip { font-size: 10px; font-weight: 600; color: var(--muted); background: var(--accent-2); border: 1px solid var(--line); border-radius: 99px; padding: 2px 9px; cursor: pointer; }
  .gl-fchip:hover { color: #fff; border-color: var(--ring); }
  .gl-fchip.dead { opacity: .55; text-decoration: line-through; }
  .gl-src { font-size: 10px; font-weight: 600; color: var(--muted); font-family: ui-monospace, monospace; text-decoration: none; padding: 2px 7px; border-radius: 99px; border: 1px dashed var(--line); }
  .gl-src:hover { color: var(--dim); border-color: var(--ring); }
  .gl-chip-flag { background: rgba(229,100,94,.12); color: #eda3a0; border-color: rgba(229,100,94,.4) !important; }
  .gl-empty { padding: 40px 24px; color: var(--muted); }
  #ov-wrap { flex: 1; overflow: hidden; position: relative; cursor: grab; background-image: radial-gradient(circle, #1b1b22 1px, transparent 1.4px); background-size: 22px 22px; background-position: -1px -1px; }
  #ov-wrap.grabbing { cursor: grabbing; }
  #ov-canvas { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
  .context-box { position: absolute; border: 1.5px dashed #40404d; border-radius: 16px; padding: 15px 18px 18px; background: rgba(255,255,255,.016); }
  .context-box.dead { border-color: #33333d; opacity: .62; }
  .ctx-title { font-size: 13px; font-weight: 650; color: var(--dim); margin-bottom: 12px; display: flex; align-items: center; gap: 9px; letter-spacing: -.01em; cursor: pointer; width: max-content; max-width: 100%; }
  .ctx-title:hover { color: #fff; text-decoration: underline; }
  .ctx-kind { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: var(--accent-2); border-radius: 99px; padding: 2px 8px; text-decoration: none; }
  .ctx-lane { position: relative; }
  /* detail panel: conceptual field rows (read-model "Data returned" / aggregate "State & fields") */
  .fieldrow { border: 1px solid var(--line); border-radius: var(--radius); padding: 9px 11px; margin-bottom: 8px; background: var(--card); }
  .fr-head { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .fr-head .fr-name { font-size: 12.5px; font-weight: 650; color: var(--fg); overflow-wrap: anywhere; }
  .fr-dtype { font: 10px/1.4 ui-monospace, Consolas, monospace; color: #9fbef0; background: var(--accent); border-radius: 4px; padding: 1px 6px; margin-left: 6px; }
  .fr-conf { width: 9px; height: 9px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 2px rgba(0,0,0,.35); }
  .fr-tag { font-size: 8.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 1px 7px; }
  .fr-tag.sensitive { color: #eda3a0; border-color: rgba(229,100,94,.4); }
  .fr-deriv { font-size: 12px; color: var(--dim); line-height: 1.5; margin: 6px 0 4px; overflow-wrap: anywhere; }
  .fr-src { font-size: 11px; color: var(--muted); display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; padding: 2px 0; }
  .fr-src.none { color: #6b6b78; font-style: italic; }
  .fr-role { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: var(--accent-2); border-radius: 99px; padding: 1px 7px; }
  .fr-col { font: 11px/1.5 ui-monospace, Consolas, monospace; color: var(--dim); }
  .fr-col.link { color: #7db2f5; cursor: pointer; }
  .fr-col.link:hover { text-decoration: underline; }
  .fr-col.addr { color: #8a8a96; word-break: break-all; }
  .fr-xform { font-size: 9.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 0 6px; }
  .fr-note { font-size: 10.5px; color: var(--muted); font-style: italic; }
  /* physical-node containment breadcrumb (server ▸ database ▸ table ▸ column) */
  .breadcrumb { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; margin-bottom: 12px; }
  .breadcrumb .bc-sep { color: #55555f; }
  .breadcrumb .bc-link { color: #7db2f5; cursor: pointer; }
  .breadcrumb .bc-link:hover { text-decoration: underline; }
  .breadcrumb .bc-here { color: var(--dim); font-weight: 650; }
  /* Data model tab: server ▸ database ▸ table cards, cross-linked to behavioral nodes */
  #datamodel { flex: 1; min-width: 0; display: none; flex-direction: column; }
  #datamodel.show { display: flex; }
  .dm-head { padding: 16px 24px 15px; border-bottom: 1px solid var(--line); background: var(--panel); flex-shrink: 0; }
  .dm-head h2 { margin: 0 0 8px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
  .dm-head h2 .count { font-size: 11px; font-weight: 700; background: var(--accent-2); color: var(--dim); border-radius: 99px; padding: 2px 9px; letter-spacing: 0; }
  .dm-sub { font-size: 12px; color: var(--muted); line-height: 1.55; max-width: 900px; }
  .dm-body { flex: 1; overflow-y: auto; padding: 20px 24px 40px; }
  .dm-empty { color: var(--muted); font-size: 13px; padding: 30px 2px; line-height: 1.6; }
  .dm-empty-sm { color: #6b6b78; font-size: 11.5px; font-style: italic; padding: 4px 2px; }
  .dm-server { margin-bottom: 26px; }
  .dm-server-head { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 4px 2px; flex-wrap: wrap; }
  .dm-server-head:hover .dm-sname { text-decoration: underline; }
  .dm-badge { font-size: 9px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; padding: 3px 9px; border-radius: 6px; }
  .dm-badge.dm-unattached { background: var(--accent-2); color: var(--muted); }
  .dm-sname { font-size: 15px; font-weight: 650; color: var(--fg); }
  .dm-host { font: 11px/1.5 ui-monospace, Consolas, monospace; color: #8a8a96; }
  .dm-engine { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted); background: var(--accent); border-radius: 99px; padding: 1px 8px; }
  .dm-db { margin: 10px 0 4px 14px; padding-left: 16px; border-left: 1px solid var(--line); }
  .dm-db-head { display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 8px 2px 10px; flex-wrap: wrap; }
  .dm-db-head:hover .dm-dname { text-decoration: underline; }
  .dm-dname { font-size: 13.5px; font-weight: 650; color: var(--dim); }
  .dm-owned { font-size: 10.5px; color: var(--muted); font-style: italic; }
  .dm-tables { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
  .dm-table { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); overflow: hidden; box-shadow: var(--shadow); }
  .dm-table-head { display: flex; align-items: baseline; gap: 8px; padding: 9px 12px; cursor: pointer; }
  .dm-table-head:hover { filter: brightness(1.06); }
  .dm-tt { font-size: 8.5px; font-weight: 800; letter-spacing: .08em; opacity: .7; }
  .dm-tn { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
  .dm-cols { padding: 6px 4px; }
  .dm-col { display: flex; align-items: baseline; gap: 8px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background .1s; }
  .dm-col:hover { background: var(--accent); }
  .dm-cn { font: 12px/1.5 ui-monospace, Consolas, monospace; color: var(--dim); overflow-wrap: anywhere; }
  .dm-ct { font: 10px/1.4 ui-monospace, Consolas, monospace; color: #7db2f5; margin-left: auto; }
  .dm-nn { font-size: 8px; font-weight: 800; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 3px; }
  .dm-consumers { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px 12px; border-top: 1px solid var(--line); }
  .dm-consumer { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--dim); background: var(--input); border: 1px solid var(--line); border-radius: 99px; padding: 3px 9px; cursor: pointer; transition: background .1s, color .1s; }
  .dm-consumer:hover { background: var(--accent-2); color: #fff; }
  .dm-cdot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
  .dm-cverb { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .dm-consumer:hover .dm-cverb { color: #cfcfe0; }
</style>
</head>
<body>
<div id="tabbar">
  <button id="tab-flows" class="tab active">Flows</button>
  <button id="tab-gallery" class="tab">Gallery</button>
  <button id="tab-datamodel" class="tab">Data model</button>
  <button id="tab-glossary" class="tab">Glossary</button>
  <button id="tab-overview" class="tab">Overview</button>
  <button id="reporoot-btn" class="tab" style="margin-left:auto" title="Set the local repository root for source links">Source root</button>
</div>
<div id="shell">
<aside id="sidebar">
  <header><h1>${esc(title)}</h1><div class="sub">strategic flows recovered from the tactical codebase</div></header>
  <input id="search" placeholder="Filter flows..." type="search">
  <div id="groupby"><span class="gb-cap">Group</span><button class="gb active" data-mode="tier">Tier</button><button class="gb" data-mode="actor">Actor</button><button class="gb" data-mode="aggregate">Aggregate</button></div>
  <nav id="flowlist"></nav>
  <div id="legend"></div>
</aside>
<div id="main">
  <div id="flowheader"></div>
  <div id="lane-wrap"><div id="lane"></div><div id="zoomctl" class="zoomctl"><button id="zin" title="Zoom in">+</button><button id="zout" title="Zoom out">&minus;</button><button id="zfit" title="Fit to view">&#10530;</button></div></div>
  <div id="findings" style="display:none">
    <div id="hotspots"></div>
    <div id="instances"></div>
  </div>
</div>
<section id="gallery"></section>
<section id="datamodel"></section>
<section id="glossary"></section>
<section id="overview"><div id="ov-wrap"><div id="ov-canvas"></div><div id="ov-zoomctl" class="zoomctl"><button id="ov-zin" title="Zoom in">+</button><button id="ov-zout" title="Zoom out">&minus;</button><button id="ov-zfit" title="Fit to view">&#10530;</button></div></div></section>
<aside id="detail"><div class="inner" id="detail-inner"></div></aside>
</div>
<script>
${renderClientPreamble(model, repoRoot)}
${readClientBundle()}</script>
</body>
</html>
`;
  return html;
}
