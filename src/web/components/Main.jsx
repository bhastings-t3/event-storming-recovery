import React, { useState } from 'react';
import { useExplorer } from '../store.jsx';
import { getItem } from '../api.js';
import Board from './Board.jsx';

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

export default function Main() {
  const { currentFlow, hotspotById, openHotspot, openMenu } = useExplorer();
  const f = currentFlow;

  const spots = f ? (f.hotspots || []).map((h) => hotspotById.get(h)).filter(Boolean) : [];
  const instances = f ? (f.instances || []) : [];
  const showFindings = spots.length > 0 || instances.length > 0;

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

      <Board />

      {showFindings && (
        <div id="findings">
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
