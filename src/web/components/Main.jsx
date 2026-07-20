import React, { useState } from 'react';
import { useExplorer } from '../store.jsx';
import { getItem } from '../api.js';
import { flowNodeIds, isDataNode } from '../model.js';
import { VERB_COLORS } from '../../lib/palette.mjs';
import Board from './Board.jsx';

const VERB_ORDER = ['writes', 'persists to', 'projects from', 'reads', 'connects via'];

// Grab the whole flow you're viewing (all nodes + edges + a Mermaid graph) into context.
function FlowActions({ flow }) {
  const { isInBundle, addToContext, removeFromContext } = useExplorer();
  const [copied, setCopied] = useState(false);
  const inBundle = isInBundle('flow', flow.id);
  const copy = async () => {
    try { const r = await getItem('flow', flow.id); await navigator.clipboard.writeText(r.markdown || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  return (
    <div className="detail-actions" style={{ marginTop: 12, marginBottom: 0 }}>
      <button className={inBundle ? 'da-in' : ''} onClick={() => (inBundle ? removeFromContext('flow', flow.id) : addToContext('flow', flow.id))}>
        {inBundle ? 'Flow in bundle ✓' : '+ Add flow to context'}
      </button>
      <button onClick={copy}>{copied ? 'Copied ✓' : '⧉ Copy flow for Claude'}</button>
    </div>
  );
}

// The datastores/fields this flow touches (stripped from the board itself — see layout.js —
// so this is the only place they surface in the flow view). Grouped by the verb of the edge
// that reaches each node, mirroring Detail.jsx's StorageSection verb groups; a data node with
// no qualifying edge falls into an untagged "in this flow" group rather than being dropped.
function DataTouched({ flow, dataNodes, nodeById, PALETTE, openDetail, openMenu }) {
  const gmap = new Map();
  const placed = new Set();
  for (const e of (flow.edges || [])) {
    const t = nodeById.get(e.to);
    if (!t || !isDataNode(t)) continue;
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

export default function Main() {
  const { currentFlow, hotspotById, nodeById, PALETTE, openHotspot, openDetail, openMenu } = useExplorer();
  const f = currentFlow;

  const spots = f ? (f.hotspots || []).map((h) => hotspotById.get(h)).filter(Boolean) : [];
  const instances = f ? (f.instances || []) : [];
  const dataNodes = f ? [...flowNodeIds(f)].map((id) => nodeById.get(id)).filter(isDataNode) : [];
  const showBottom = dataNodes.length > 0 || instances.length > 0;

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
            <FlowActions flow={f} />
          </>
        )}
      </div>

      {spots.length > 0 && (
        <div id="hotspots">
          <h3>
            Hotspots<span className="n">{spots.length}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>questions a human should answer</span>
          </h3>
          <div className="hs-cards">
            {spots.map((s) => (
              <div key={s.id} className="hs-card" title={(s.description || '') + '  ·  right-click to add to context'} onClick={() => openHotspot(s.id)} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'hotspot', id: s.id }); }}>
                <b>{s.label}</b>
                <span>{s.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Board />

      {showBottom && (
        <div id="findings">
          {dataNodes.length > 0 && (
            <DataTouched flow={f} dataNodes={dataNodes} nodeById={nodeById} PALETTE={PALETTE} openDetail={openDetail} openMenu={openMenu} />
          )}
          {instances.length > 0 && (
            <div id="instances">
              <h3>Instances of this pattern<span className="n">{instances.length}</span></h3>
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
          )}
        </div>
      )}
    </div>
  );
}
