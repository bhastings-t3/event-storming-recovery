import React, { useState } from 'react';
import { useExplorer } from '../store.jsx';
import { getContext } from '../api.js';

// Slide-over drawer for the curated context bundle: the nodes the human has gathered (via
// right-click "add to context"). Copy the whole set as grounded markdown for Claude, or hand it
// to a connected Claude session as the `event-storming://selected-nodes` MCP resource.
export default function ContextBundle() {
  const { bundleOpen, setBundleOpen, bundleIds, nodeById, PALETTE, openDetail, removeFromContext, clearBundle } = useExplorer();
  const [copied, setCopied] = useState(false);
  if (!bundleOpen) return null;

  const copyAll = async () => {
    try { const r = await getContext(); await navigator.clipboard.writeText(r.markdown || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };

  return (
    <>
      <div className="drawer-scrim" onClick={() => setBundleOpen(false)} />
      <aside className="drawer">
        <div className="drawer-head">
          <h3>Context bundle <span className="count">{bundleIds.length}</span></h3>
          <button className="drawer-x" onClick={() => setBundleOpen(false)}>✕</button>
        </div>
        <div className="drawer-sub">Nodes you've gathered for Claude. Copy them, or reference the <code>event-storming://selected-nodes</code> MCP resource from your Claude session.</div>

        {bundleIds.length === 0 ? (
          <div className="drawer-empty">Right-click any node → <b>Add to context bundle</b> to gather it here.</div>
        ) : (
          <div className="drawer-list">
            {bundleIds.map((id) => {
              const n = nodeById.get(id);
              if (!n) return null;
              const p = PALETTE[n.type] || PALETTE.invariant;
              return (
                <div key={id} className="bundle-row">
                  <span className="bundle-dot" style={{ background: p.fill, borderColor: p.edge }} />
                  <span className="bundle-label" onClick={() => openDetail(id)}>{n.label}</span>
                  <span className="bundle-type">{p.name}</span>
                  <button className="bundle-rm" title="Remove" onClick={() => removeFromContext(id)}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div className="drawer-actions">
          <button className="btn-primary" disabled={!bundleIds.length} onClick={copyAll}>{copied ? 'Copied ✓' : 'Copy all for Claude'}</button>
          <button className="btn-ghost" disabled={!bundleIds.length} onClick={clearBundle}>Clear</button>
        </div>
      </aside>
    </>
  );
}
