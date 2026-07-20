import React, { useState, useEffect } from 'react';
import { useExplorer } from '../store.jsx';
import { flowNodeIds, isDataNode } from '../model.js';
import { VERB_COLORS } from '../../lib/palette.mjs';
import Board from './Board.jsx';

const VERB_ORDER = ['writes', 'persists to', 'projects from', 'reads', 'connects via'];

// Flow actions (add to context bundle / copy grounded markdown / comment) live in the shared
// right-click menu, so this is just a ⋯ affordance that opens it anchored under the button —
// same menu you get right-clicking the flow in the sidebar. Keeps the header short so the
// board gets the height.
function FlowMenuButton({ flow }) {
  const { menu, openMenu, closeMenu, isInBundle } = useExplorer();
  const open = !!menu && menu.ref && menu.ref.type === 'flow' && menu.ref.id === flow.id;
  const toggle = (e) => {
    if (open) { closeMenu(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.right - 210, r.bottom + 6, { type: 'flow', id: flow.id, label: flow.name });
  };
  return (
    <button
      className={'flow-menu-btn' + (open ? ' open' : '') + (isInBundle('flow', flow.id) ? ' in-bundle' : '')}
      title="Flow actions — add to context, copy for Claude, comment"
      aria-haspopup="menu"
      aria-expanded={open}
      onPointerDown={(e) => e.stopPropagation()}  // else ContextMenu's window listener closes it mid-click
      onClick={toggle}
    >⋯</button>
  );
}

// The datastores/fields this flow touches (stripped from the board itself — see layout.js —
// so this is the only place they surface in the flow view). Grouped by the verb of the edge
// that reaches each node, mirroring Detail.jsx's StorageSection verb groups; a data node with
// no qualifying edge falls into an untagged "in this flow" group rather than being dropped.
function DataTouched({ flow, dataNodes, nodeById, PALETTE, openDetail, openMenu }) {
  const gmap = new Map();
  const placed = new Set();
  const seen = new Set();
  for (const e of (flow.edges || [])) {
    const t = nodeById.get(e.to);
    if (!t || !isDataNode(t)) continue;
    // a flow commonly reaches the same store over several edges (one per step); collapse those
    // so a node lists once per verb, matching the seen-key dedupe in selectors.mjs
    const key = e.to + '|' + e.verb;
    if (seen.has(key)) continue;
    seen.add(key);
    (gmap.get(e.verb) || gmap.set(e.verb, []).get(e.verb)).push(t);
    placed.add(t.id);
  }
  const untagged = dataNodes.filter((n) => !placed.has(n.id));
  if (untagged.length) gmap.set('in this flow', untagged);
  const idx = (v) => { const i = VERB_ORDER.indexOf(v); return i < 0 ? 99 : i; };
  const groups = [...gmap.keys()].sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b)).map((v) => ({ verb: v, nodes: gmap.get(v) }));

  return (
    <div id="datatouched">
      <h3>Data touched<span className="n">{dataNodes.length}</span></h3>
      {groups.map((g) => (
        <div key={g.verb} className="dm-verb-group">
          <h4><span className="vg-dot" style={{ background: VERB_COLORS[g.verb] || VERB_COLORS._default }} />{g.verb + ' (' + g.nodes.length + ')'}</h4>
          {g.nodes.map((n) => {
            const np = PALETTE[n.type] || PALETTE.invariant;
            return (
              <div key={n.id} className="relrow" title={np.name + ' — ' + n.label} onClick={() => openDetail(n.id)} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'node', id: n.id }); }}>
                <div className="rdot" style={{ background: np.fill, borderColor: np.edge }} />
                <div className="rlabel">{n.label}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// A findings panel that sits at the bottom of the flow view as a thin clickable bar, so the board
// keeps the rest of the height. Expands in place (its body scrolls) rather than pushing the board
// out of view; several can be open at once.
function Drawer({ name, title, count, note, open, onToggle, children }) {
  return (
    <div className={'fdrawer dw-' + name + (open ? ' open' : '')}>
      <button type="button" className="fdrawer-bar" aria-expanded={open} onClick={onToggle}>
        <span className="dw-chevron">▾</span>
        <span className="dw-title">{title}</span>
        <span className="dw-count">{count}</span>
        {note && <span className="dw-note">{note}</span>}
      </button>
      {open && <div className="fdrawer-body">{children}</div>}
    </div>
  );
}

export default function Main() {
  const { currentFlow, hotspotById, nodeById, PALETTE, openHotspot, openDetail, openMenu } = useExplorer();
  const f = currentFlow;

  const spots = f ? (f.hotspots || []).map((h) => hotspotById.get(h)).filter(Boolean) : [];
  const instances = f ? (f.instances || []) : [];
  const dataNodes = f ? [...flowNodeIds(f)].map((id) => nodeById.get(id)).filter(isDataNode) : [];
  const showDrawers = spots.length > 0 || dataNodes.length > 0 || instances.length > 0;

  // all closed by default so the board gets the full height; collapse again on a flow change
  const [open, setOpen] = useState({ hotspots: false, data: false, instances: false });
  const toggleDrawer = (k) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  useEffect(() => { setOpen({ hotspots: false, data: false, instances: false }); }, [currentFlow]);

  return (
    <div id="main">
      <div id="flowheader">
        {!f ? (
          <h2>Select a flow</h2>
        ) : (
          <>
            <h2>
              {f.name}
              {f.status && f.status !== 'live' && (
                <span className={'badge ' + f.status}>{f.status.toUpperCase() + (f.supersededBy ? ' → ' + f.supersededBy : '')}</span>
              )}
            </h2>
            <div className="summary">{f.summary || ''}</div>
            {f.trigger && <div className="trigger"><b>Trigger: </b>{f.trigger}</div>}
            <FlowMenuButton flow={f} />
          </>
        )}
      </div>

      <Board />

      {showDrawers && (
        <div id="drawers">
          {spots.length > 0 && (
            <Drawer name="hotspots" title="Hotspots" count={spots.length} note="questions a human should answer" open={open.hotspots} onToggle={() => toggleDrawer('hotspots')}>
              <div className="hs-cards">
                {spots.map((s) => (
                  <div key={s.id} className="hs-card" title={(s.description || '') + '  ·  right-click to add to context'} onClick={() => openHotspot(s.id)} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'hotspot', id: s.id }); }}>
                    <b>{s.label}</b>
                    <span>{s.description}</span>
                  </div>
                ))}
              </div>
            </Drawer>
          )}
          {dataNodes.length > 0 && (
            <Drawer name="data" title="Data touched" count={dataNodes.length} open={open.data} onToggle={() => toggleDrawer('data')}>
              <DataTouched flow={f} dataNodes={dataNodes} nodeById={nodeById} PALETTE={PALETTE} openDetail={openDetail} openMenu={openMenu} />
            </Drawer>
          )}
          {instances.length > 0 && (
            <Drawer name="instances" title="Instances of this pattern" count={instances.length} open={open.instances} onToggle={() => toggleDrawer('instances')}>
              {/* the #instances wrapper still carries this table's styling */}
              <div id="instances">
                <table>
                  <tbody>
                    {instances.map((i, idx) => (
                      <tr key={idx}>
                        <td className="i-label">{i.label || ''}</td>
                        <td className="i-route">{i.route || ''}</td>
                        <td className="i-file" title={i.file || ''}>{(i.file || '').split('/').pop()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Drawer>
          )}
        </div>
      )}
    </div>
  );
}
