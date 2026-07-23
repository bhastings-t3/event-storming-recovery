import React, { useMemo } from 'react';
import { useExplorer } from '../store.jsx';
import { nodeFlows, nodeSearchText, queryTokens, matchesQuery } from '../model.js';

// Gallery: every sticky in the model, filtered by type chips + text search. Ported from
// buildGallery/renderGrid in generate-views.js.
export default function Gallery() {
  const { model, PALETTE, types, gallery, setGallery, selectedNodeId, openDetail, openMenu } = useExplorer();
  const { q, active } = gallery;

  const toggleType = (t) => setGallery((s) => {
    const next = new Set(s.active);
    if (next.has(t)) next.delete(t); else next.add(t);
    return { ...s, active: next };
  });
  const allOn = () => setGallery((s) => ({ ...s, active: new Set(types) }));

  const tokens = useMemo(() => queryTokens(q), [q]);
  // built once per model (not per keystroke): node id -> lowercased haystack, including the
  // names of every flow the node appears in so e.g. a flow title's word finds its stickies
  const nodeHaystacks = useMemo(() => {
    const m = new Map();
    for (const n of model.nodes) m.set(n.id, nodeSearchText(model, n, PALETTE[n.type] ? PALETTE[n.type].name : ''));
    return m;
  }, [model, PALETTE]);
  const nodes = model.nodes
    .filter((n) => active.has(n.type))
    .filter((n) => !tokens.length || matchesQuery(nodeHaystacks.get(n.id), tokens))
    .sort((a, b) => (types.indexOf(a.type) - types.indexOf(b.type)) || String(a.label).localeCompare(String(b.label)));

  const allActive = types.every((t) => active.has(t));

  return (
    <section id="gallery" className="show">
      <div className="gallery-head">
        <h2>All stickies<span className="count">{nodes.length} of {model.nodes.length}</span></h2>
        <input
          className="gallery-search"
          type="search"
          placeholder="Search stickies by name or description..."
          value={q}
          onChange={(e) => setGallery((s) => ({ ...s, q: e.target.value }))}
        />
        <div className="type-chips">
          <div className={'tchip tchip-all' + (allActive ? ' on' : '')} onClick={allOn}>All</div>
          {types.map((t) => {
            const p = PALETTE[t];
            return (
              <div key={t} className={'tchip' + (active.has(t) ? ' on' : '')} style={{ background: p.fill, color: p.text }} onClick={() => toggleType(t)}>
                {p.name}
              </div>
            );
          })}
        </div>
      </div>
      <div className="gallery-grid">
        {nodes.length === 0 && <div className="gempty">No stickies match the current filters.</div>}
        {nodes.map((n) => {
          const p = PALETTE[n.type] || PALETTE.invariant;
          const flows = nodeFlows(model, n.id);
          const allDead = flows.length > 0 && flows.every((f) => f.status && f.status !== 'live');
          return (
            <div
              key={n.id}
              className={'gcard' + (selectedNodeId === n.id ? ' selected' : '')}
              style={{ background: p.fill, borderColor: p.edge, color: p.text }}
              onClick={() => openDetail(n.id)}
              onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'node', id: n.id }); }}
            >
              <div className="gtype">{p.name}</div>
              <div className="glabel">{n.label}</div>
              {n.description && <div className="gdesc">{n.description}</div>}
              <div className="gmeta">
                <span>{flows.length ? ('in ' + flows.length + ' flow' + (flows.length > 1 ? 's' : '')) : 'not in any flow'}</span>
                {allDead && <span className="gdead">retired</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
