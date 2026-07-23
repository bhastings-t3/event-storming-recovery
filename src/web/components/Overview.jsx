import React, { useEffect, useRef } from 'react';
import { useExplorer } from '../store.jsx';
import { el } from '../lib/dom.js';
import { renderFlowInto, setupPanZoom } from '../lib/layout.js';

// Overview: EVERY flow rendered into its own bounded-context box, shelf-packed onto one
// pannable/zoomable canvas. Ported from renderOverview in generate-views.js; built imperatively
// because the layout engine measures the DOM to size each box.
export default function Overview() {
  const { model, nodeById, PALETTE, selectedNodeId, openDetail, selectFlow, openMenu } = useExplorer();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    canvas.innerHTML = '';
    const ctx = {
      nodeById, palette: PALETTE, selectedId: selectedNodeId, onOpenDetail: openDetail,
      onContextMenu: (e, id) => openMenu(e.clientX, e.clientY, { type: 'node', id }), // a sticky adds the node; the box (below) adds the flow
    };
    const boxes = [];
    for (const f of model.flows) {
      const dead = f.status && f.status !== 'live';
      const boxEl = el('div', { class: 'context-box' + (dead ? ' dead' : '') });
      const title = el('div', { class: 'ctx-title', title: 'Open "' + f.name + '" · right-click the box to add the whole flow to context', onclick: () => selectFlow(f.id) }, f.name);
      boxEl.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'flow', id: f.id }); });
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
    const dims = boxes.map((b) => ({ boxEl: b.boxEl, w: b.boxEl.offsetWidth, h: b.boxEl.offsetHeight }));
    const widest = Math.max(0, ...dims.map((d) => d.w));
    const rowLimit = Math.max(1700, widest);
    let x = PAD, y = PAD, rowH = 0, canvasW = PAD;
    for (const d of dims) {
      if (x > PAD && x + d.w > rowLimit) { x = PAD; y += rowH + GAPY; rowH = 0; }
      d.boxEl.style.left = x + 'px'; d.boxEl.style.top = y + 'px';
      x += d.w + GAPX; rowH = Math.max(rowH, d.h); canvasW = Math.max(canvasW, x);
    }
    const W = canvasW - GAPX + PAD, H = y + rowH + PAD;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const pz = setupPanZoom(wrap, canvas, { zin: 'ov-zin', zout: 'ov-zout', zfit: 'ov-zfit' });
    const r = requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(W, H)));
    return () => cancelAnimationFrame(r);
  }, [model, nodeById, PALETTE, selectedNodeId, openDetail, selectFlow, openMenu]);

  return (
    <section id="overview" className="show">
      <div id="ov-wrap" ref={wrapRef}>
        <div id="ov-canvas" ref={canvasRef} />
        <div id="ov-zoomctl" className="zoomctl">
          <button id="ov-zin" title="Zoom in">+</button>
          <button id="ov-zout" title="Zoom out">&minus;</button>
          <button id="ov-zfit" title="Fit to view">&#10530;</button>
        </div>
      </div>
    </section>
  );
}
