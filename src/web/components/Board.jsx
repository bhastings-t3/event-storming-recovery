import React, { useEffect, useRef, useState } from 'react';
import { useExplorer } from '../store.jsx';
import { renderFlowInto, setupPanZoom } from '../lib/layout.js';
import { renderDataFlowInto } from '../lib/dataflow-layout.js';
import { flowNodeIds, isDataNode } from '../model.js';

// The flow board: a stable #lane-wrap / #lane pair into which the imperative layout engine
// renders. Re-renders + refits when the flow or the selection changes (matching the original,
// which re-ran layoutFlow on openDetail to reflect the selected outline). A flow with data nodes
// also gets a Flow/Data toggle so the same lane can show the behavioral board or the data
// interaction graph (dataflow-layout.js) for it.
export default function Board() {
  const { currentFlow, selectedNodeId, nodeById, PALETTE, openDetail, openMenu } = useExplorer();
  const wrapRef = useRef(null);
  const laneRef = useRef(null);
  const [view, setView] = useState('flow');

  // switching flows should never strand you in an empty data view
  useEffect(() => { setView('flow'); }, [currentFlow]);

  const dataCount = currentFlow ? [...flowNodeIds(currentFlow)].filter((id) => isDataNode(nodeById.get(id))).length : 0;

  useEffect(() => {
    if (!currentFlow || !laneRef.current || !wrapRef.current) return;
    const ctx = {
      nodeById, palette: PALETTE, selectedId: selectedNodeId,
      onOpenDetail: openDetail,
      onContextMenu: (e, id) => openMenu(e.clientX, e.clientY, { type: 'node', id }),
    };
    const dim = view === 'data'
      ? renderDataFlowInto(currentFlow, laneRef.current, ctx)
      : renderFlowInto(currentFlow, laneRef.current, ctx);
    const pz = setupPanZoom(wrapRef.current, laneRef.current);
    // double rAF so the board's flex height has settled before we compute the fit scale
    const r = requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(dim.w, dim.h)));
    return () => cancelAnimationFrame(r);
  }, [currentFlow, selectedNodeId, nodeById, PALETTE, openDetail, openMenu, view]);

  return (
    <div id="lane-wrap" ref={wrapRef}>
      <div id="lane" ref={laneRef} />
      {dataCount > 0 && (
        <div className="board-views">
          <button className={'bv' + (view === 'flow' ? ' active' : '')} onClick={() => setView('flow')}>Flow</button>
          <button className={'bv' + (view === 'data' ? ' active' : '')} onClick={() => setView('data')}>Data</button>
        </div>
      )}
      <div id="zoomctl" className="zoomctl">
        <button id="zin" title="Zoom in">+</button>
        <button id="zout" title="Zoom out">&minus;</button>
        <button id="zfit" title="Fit to view">&#10530;</button>
      </div>
    </div>
  );
}
