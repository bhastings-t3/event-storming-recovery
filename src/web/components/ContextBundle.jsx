import React, { useState } from 'react';
import { useExplorer } from '../store.jsx';
import { getContext } from '../api.js';
import ConnectClaude from './ConnectClaude.jsx';

// Slide-over drawer for the curated context bundle: nodes, whole flows (with a Mermaid graph),
// and hotspots the human has gathered. Copy the whole set as grounded markdown for Claude, or
// hand it to a connected Claude session as the `event-storming://selected-nodes` MCP resource.
export default function ContextBundle() {
  const {
    bundleOpen, setBundleOpen, bundleItems, nodeById, hotspotById, model, PALETTE,
    openDetail, openHotspot, selectFlow, removeFromContext, clearBundle,
  } = useExplorer();
  const [copied, setCopied] = useState(false);
  if (!bundleOpen) return null;

  const meta = (item) => {
    if (item.type === 'flow') { const f = model.flows.find((x) => x.id === item.id); return { label: (f && f.name) || item.id, typeName: 'Flow', color: '#7EB6FF', open: () => selectFlow(item.id) }; }
    if (item.type === 'hotspot') { const h = hotspotById.get(item.id); return { label: (h && h.label) || item.id, typeName: 'Hotspot', color: PALETTE.hotspot.fill, open: () => openHotspot(item.id) }; }
    const n = nodeById.get(item.id); const p = PALETTE[(n && n.type)] || PALETTE.invariant; return { label: (n && n.label) || item.id, typeName: p.name, color: p.fill, open: () => openDetail(item.id) };
  };

  const copyAll = async () => {
    try { const r = await getContext(); await navigator.clipboard.writeText(r.markdown || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };

  return (
    <>
      <div className="drawer-scrim" onClick={() => setBundleOpen(false)} />
      <aside className="drawer">
        <div className="drawer-head">
          <h3>Context bundle <span className="count">{bundleItems.length}</span></h3>
          <button className="drawer-x" onClick={() => setBundleOpen(false)}>✕</button>
        </div>
        <div className="drawer-sub">Nodes, flows, and hotspots you've gathered for Claude. Copy them, or reference the <code>event-storming://selected-nodes</code> MCP resource from your Claude session. Flows include a Mermaid graph.</div>

        <ConnectClaude />

        {bundleItems.length === 0 ? (
          <div className="drawer-empty">Right-click any node, flow (Overview box or sidebar item), or hotspot → <b>Add to context bundle</b>.</div>
        ) : (
          <div className="drawer-list">
            {bundleItems.map((item) => {
              const m = meta(item);
              return (
                <div key={item.type + ':' + item.id} className="bundle-row">
                  <span className="bundle-dot" style={{ background: m.color, borderColor: 'rgba(0,0,0,.35)' }} />
                  <span className="bundle-label" onClick={m.open}>{m.label}</span>
                  <span className="bundle-type">{m.typeName}</span>
                  <button className="bundle-rm" title="Remove" onClick={() => removeFromContext(item.type, item.id)}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div className="drawer-actions">
          <button className="btn-primary" disabled={!bundleItems.length} onClick={copyAll}>{copied ? 'Copied ✓' : 'Copy all for Claude'}</button>
          <button className="btn-ghost" disabled={!bundleItems.length} onClick={clearBundle}>Clear</button>
        </div>
      </aside>
    </>
  );
}
