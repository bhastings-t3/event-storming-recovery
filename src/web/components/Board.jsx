import React, { useEffect, useRef } from 'react';
import { useExplorer } from '../store.jsx';
import { renderFlowInto, setupPanZoom } from '../lib/layout.js';

// The flow board: a stable #lane-wrap / #lane pair into which the imperative layout engine
// renders. Re-renders + refits when the flow or the selection changes (matching the original,
// which re-ran layoutFlow on openDetail to reflect the selected outline).
export default function Board() {
  const { currentFlow, selectedNodeId, nodeById, PALETTE, openDetail } = useExplorer();
  const wrapRef = useRef(null);
  const laneRef = useRef(null);

  useEffect(() => {
    if (!currentFlow || !laneRef.current || !wrapRef.current) return;
    const ctx = { nodeById, palette: PALETTE, selectedId: selectedNodeId, onOpenDetail: openDetail };
    const dim = renderFlowInto(currentFlow, laneRef.current, ctx);
    const pz = setupPanZoom(wrapRef.current, laneRef.current);
    // double rAF so the board's flex height has settled before we compute the fit scale
    const r = requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(dim.w, dim.h)));
    return () => cancelAnimationFrame(r);
  }, [currentFlow, selectedNodeId, nodeById, PALETTE, openDetail]);

  return (
    <div id="lane-wrap" ref={wrapRef}>
      <div id="lane" ref={laneRef} />
      <div id="zoomctl" className="zoomctl">
        <button id="zin" title="Zoom in">+</button>
        <button id="zout" title="Zoom out">&minus;</button>
        <button id="zfit" title="Fit to view">&#10530;</button>
      </div>
    </div>
  );
}
