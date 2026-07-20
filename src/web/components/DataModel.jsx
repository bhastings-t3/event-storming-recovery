import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useExplorer } from '../store.jsx';
import { setupPanZoom } from '../lib/layout.js';
import { renderDataModelInto, defaultCollapsed } from '../lib/datamodel-layout.js';

// The Data model tab: the recovered physical storage as a pannable GRAPH of nested clusters.
// Containers (server/database/directory) are titled group boxes near their parent; a database's
// tables are grid-packed ~square inside it (not one tall column); a container with many tables
// starts collapsed to a single node. Behavioral nodes that touch a store collapse into small
// type-colored "consumer circles" (one per type, count inside) above the store card.
// Imperative layout mounted via a ref, like the flow Board; re-runs + refits on collapse toggle.
export default function DataModel() {
  const { model, nodeById, PALETTE, openDetail } = useExplorer();
  const wrapRef = useRef(null);
  const laneRef = useRef(null);
  const dataCount = model.nodes.filter((n) => n.type === 'datastore' || n.type === 'field').length;
  const [collapsed, setCollapsed] = useState(() => defaultCollapsed(model, nodeById));
  const toggle = useCallback((id) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  useEffect(() => {
    if (!dataCount || !laneRef.current || !wrapRef.current) return;
    const ctx = { palette: PALETTE, onOpenDetail: openDetail, collapsed, onToggle: toggle };
    const dim = renderDataModelInto(model, nodeById, laneRef.current, ctx);
    const pz = setupPanZoom(wrapRef.current, laneRef.current, { zin: 'dm-zin', zout: 'dm-zout', zfit: 'dm-zfit' });
    const r = requestAnimationFrame(() => requestAnimationFrame(() => pz.fit(dim.w, dim.h)));
    return () => cancelAnimationFrame(r);
  }, [model, nodeById, PALETTE, openDetail, dataCount, collapsed, toggle]);

  return (
    <div id="datamodel">
      <div className="dm-head">
        <h2>Data model <span className="count">{dataCount}</span></h2>
        <div className="dm-sub">The storage the code actually touches, recovered from the code and its config — whatever kind it is: databases, files, queues, caches, in-memory state. Arrows are the containment hierarchy (server → database → table, filesystem → directory → file, …) — big containers start collapsed, click a header to expand. Each store's header badge counts the behavioral nodes that interact with it; the footer pills are the relationships by verb (writes / reads / persists to / projects from / connects via) — click a pill to list everything with that relationship in the sidebar. Demand-driven: only the fields a read model or aggregate references appear.</div>
      </div>
      {dataCount === 0 ? (
        <div className="dm-body">
          <div className="dm-empty">No data model recovered yet. Run the data-mapping phase (prompts/05-data-mapping.md) to populate data stores and field lineage.</div>
        </div>
      ) : (
        <div id="dm-wrap" ref={wrapRef}>
          <div id="dm-lane" ref={laneRef} />
          <div className="zoomctl">
            <button id="dm-zin" title="Zoom in">+</button>
            <button id="dm-zout" title="Zoom out">&minus;</button>
            <button id="dm-zfit" title="Fit to view">&#10530;</button>
          </div>
        </div>
      )}
    </div>
  );
}
