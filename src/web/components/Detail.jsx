import React, { useState } from 'react';
import { useExplorer } from '../store.jsx';
import { enforcesRelation, nodeUsages, anchorUrl, flowNodeIds } from '../model.js';
import { getNode, fetchSource } from '../api.js';

// An anchor link with a lazy "view source" expander that pulls the real code from the server.
function Anchor({ repoRoot, a }) {
  const [src, setSrc] = useState(null); // null=closed, {}=loading, result
  const toggle = async () => {
    if (src) { setSrc(null); return; }
    setSrc({ loading: true });
    try { setSrc(await fetchSource(a.path, a.line)); } catch { setSrc({ exists: false, error: 'failed' }); }
  };
  return (
    <div className="anchor-block">
      <a className="anchor" href={anchorUrl(repoRoot, a)}>
        {a.path + (a.line ? ':' + a.line : '') + (a.symbol ? '  (' + a.symbol + ')' : '')}
        {a.note && <span className="note">{'  — ' + a.note}</span>}
      </a>
      {a.path && <button className="src-toggle" onClick={toggle}>{src ? 'hide source' : 'view source'}</button>}
      {src && src.loading && <div className="src-note">loading…</div>}
      {src && !src.loading && (src.exists
        ? <pre className="src-code"><code>{src.code}</code></pre>
        : <div className="src-note">source not found at repo root ({src.error || 'missing'})</div>)}
    </div>
  );
}

function DetailActions({ node }) {
  const { isInBundle, addToContext, removeFromContext } = useExplorer();
  const [copied, setCopied] = useState(false);
  const inBundle = isInBundle(node.id);
  const copy = async () => {
    try { const r = await getNode(node.id); await navigator.clipboard.writeText(r.markdown || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  return (
    <div className="detail-actions">
      <button className={inBundle ? 'da-in' : ''} onClick={() => (inBundle ? removeFromContext(node.id) : addToContext(node.id))}>
        {inBundle ? 'In bundle ✓' : '+ Add to context'}
      </button>
      <button onClick={copy}>{copied ? 'Copied ✓' : '⧉ Copy for Claude'}</button>
    </div>
  );
}

function NodeDetail({ node }) {
  const { model, PALETTE, nodeById, repoRoot, selectFlow, openDetail } = useExplorer();
  const p = PALETTE[node.type] || PALETTE.invariant;
  const rel = enforcesRelation(model, nodeById, node);
  const usages = nodeUsages(node);
  const inFlows = model.flows.filter((f) => (f.steps || []).includes(node.id) || (f.edges || []).some((e) => e.from === node.id || e.to === node.id));

  return (
    <>
      <span className="dtype" style={{ background: p.fill, color: p.text }}>{p.name}</span>
      <h3>{node.label}</h3>
      <div className="chips">
        {node.inferred && <span className="chip">inferred from code</span>}
        {node.ownedBy && <span className="chip">{'state owned by ' + node.ownedBy}</span>}
        {node.synchronous && <span className="chip">synchronous inline reaction</span>}
      </div>
      <DetailActions node={node} />
      <div className="desc">{node.description || ''}</div>

      {rel && rel.related.length > 0 && (
        <>
          <h4>{rel.heading}</h4>
          {rel.related.map((r) => {
            const rp = PALETTE[r.type] || PALETTE.invariant;
            return (
              <div key={r.id} className="relrow" title={(PALETTE[r.type] || {}).name + ' — ' + r.label} onClick={() => openDetail(r.id)}>
                <div className="rdot" style={{ background: rp.fill, borderColor: rp.edge }} />
                <div className="rlabel">{r.label}</div>
              </div>
            );
          })}
        </>
      )}

      {usages.length > 0 && (
        <>
          <h4>Tactical implementation</h4>
          {usages.map((u, i) => (
            <div className="usage" key={i}>
              {u.flow && <div className="uflow">{'in flow: ' + u.flow}</div>}
              {u.explanation && <div className="uexp">{u.explanation}</div>}
              {(u.anchors || []).map((a, j) => <Anchor key={j} repoRoot={repoRoot} a={a} />)}
            </div>
          ))}
        </>
      )}

      {inFlows.length > 0 && (
        <>
          <h4>{'Appears in ' + inFlows.length + ' flow' + (inFlows.length > 1 ? 's' : '')}</h4>
          {inFlows.map((f) => {
            const fIds = flowNodeIds(f);
            const counts = {};
            for (const fid of fIds) { const fn = nodeById.get(fid); if (fn) counts[fn.type] = (counts[fn.type] || 0) + 1; }
            const total = Object.values(counts).reduce((s, c) => s + c, 0);
            const dead = f.status && f.status !== 'live';
            return (
              <div key={f.id} className="flowrow" title={f.name + ' — ' + total + ' stickies'} onClick={() => selectFlow(f.id)}>
                <div className="fr-name">
                  {f.name}
                  {dead && <span className={'badge ' + f.status}>{f.status.toUpperCase()}</span>}
                </div>
                <div className="fr-dots">
                  {Object.keys(PALETTE).map((t) => {
                    if (t === 'hotspot' || !counts[t]) return null;
                    const pp = PALETTE[t];
                    return <div key={t} className="cdot" style={{ background: pp.fill, color: pp.text }} title={counts[t] + ' × ' + pp.name}>{counts[t]}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

function HotspotDetail({ hotspot }) {
  const { repoRoot } = useExplorer();
  const h = hotspot;
  return (
    <>
      <span className="dtype" style={{ background: '#FF6B6B', color: '#fff' }}>Hotspot</span>
      <h3>{h.label}</h3>
      <div className="desc">{h.description || ''}</div>
      {h.tactical && (
        <>
          <h4>Evidence</h4>
          <div className="usage">
            {h.tactical.explanation && <div className="uexp">{h.tactical.explanation}</div>}
            {(h.tactical.anchors || []).map((a, j) => <Anchor key={j} repoRoot={repoRoot} a={a} />)}
          </div>
        </>
      )}
    </>
  );
}

export default function Detail() {
  const { detail, nodeById, hotspotById, closeDetail } = useExplorer();
  const open = detail != null;
  let body = null;
  if (detail && detail.kind === 'node') { const n = nodeById.get(detail.id); if (n) body = <NodeDetail node={n} />; }
  else if (detail && detail.kind === 'hotspot') { const h = hotspotById.get(detail.id); if (h) body = <HotspotDetail hotspot={h} />; }

  return (
    <aside id="detail" className={open ? 'open' : ''}>
      <div className="inner" id="detail-inner">
        {open && (
          <>
            <button id="closedetail" onClick={closeDetail}>✕</button>
            {body}
          </>
        )}
      </div>
    </aside>
  );
}
