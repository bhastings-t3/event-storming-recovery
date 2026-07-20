import React, { useState, useEffect, useRef } from 'react';
import { useExplorer } from '../store.jsx';
import {
  enforcesRelation, nodeUsages, anchorUrl, flowNodeIds,
  isDataNode, parentChain, datastoreConsumers, fieldConsumers, nodeStorageLinks,
} from '../model.js';
import { VERB_COLORS } from '../../lib/palette.mjs';
import { getItem, fetchSource } from '../api.js';

const VERB_ORDER = ['writes', 'persists to', 'projects from', 'reads', 'connects via'];

const CONF_COLOR = { high: '#6FC993', medium: '#E9A23B', low: '#E5645E' };

// One conceptual field of a read model / aggregate: its derivation prose and 0..N storage sources.
function FieldRow({ field, nodeById, openDetail }) {
  const conf = field.confidence && CONF_COLOR[field.confidence];
  return (
    <div className="fieldrow">
      <div className="fr-head">
        <span className="fr-name">{field.name}</span>
        {field.dataType && <span className="fr-dtype">{field.dataType}</span>}
        {conf && <span className="fr-conf" style={{ background: conf }} title={'derivation confidence: ' + field.confidence} />}
        {field.conceptual && <span className="fr-tag">conceptual</span>}
        {field.sensitive && <span className="fr-tag sensitive">sensitive</span>}
      </div>
      {field.derivation && <div className="fr-deriv">{field.derivation}</div>}
      {(field.sources || []).map((s, i) => {
        const col = /^(ds|fld)-/.test(s.ref || '') ? nodeById.get(s.ref) : null;
        return (
          <div className="fr-src" key={i}>
            <span className="fr-role">{s.role || 'from'}</span>
            {col
              ? <span className="fr-col link" onClick={() => openDetail(col.id)}>{col.label}</span>
              : <span className="fr-col addr">{s.ref || '(unresolved)'}</span>}
            {s.transform && <span className="fr-xform">{s.transform}</span>}
            {s.note && <span className="fr-note">{'— ' + s.note}</span>}
          </div>
        );
      })}
      {(!field.sources || field.sources.length === 0) && <div className="fr-src none">computed / no direct source</div>}
    </div>
  );
}

function FieldsSection({ node, nodeById, openDetail }) {
  if (!node.fields || !node.fields.length) return null;
  const heading = node.type === 'readModel' ? 'Data returned' : node.type === 'aggregate' ? 'State & fields' : 'Fields';
  return (
    <>
      <h4>{heading}</h4>
      {node.fields.map((f, i) => <FieldRow key={i} field={f} nodeById={nodeById} openDetail={openDetail} />)}
    </>
  );
}

// Physical storage node (datastore or field): containment breadcrumb, what it contains, and what
// depends on it. Technology-neutral — a datastore may be a server, a file, a queue, a cache, ...
function StorageSection({ node, model, nodeById, openDetail }) {
  const { PALETTE, detail } = useExplorer();
  const focusVerb = detail && detail.id === node.id ? detail.focusVerb : null;
  const groupRefs = useRef({});
  const chain = parentChain(nodeById, node);
  const subStores = node.type === 'datastore' ? model.nodes.filter((n) => n.type === 'datastore' && n.parent === node.id) : [];
  const fields = node.type === 'datastore' ? model.nodes.filter((n) => n.type === 'field' && n.parent === node.id) : [];
  const consumers = node.type === 'datastore' ? datastoreConsumers(model, nodeById, node.id)
    : node.type === 'field' ? fieldConsumers(model, node.id).map((c) => ({ node: c.node, verb: 'field ' + c.field.name }))
    : [];
  const relLabel = (n) => n.storeKind || n.fieldKind;

  // group consumers by relationship verb, in canonical order
  const gmap = new Map();
  for (const c of consumers) { if (!gmap.has(c.verb)) gmap.set(c.verb, []); gmap.get(c.verb).push(c.node); }
  const idx = (v) => { const i = VERB_ORDER.indexOf(v); return i < 0 ? 99 : i; };
  const groups = [...gmap.keys()].sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b)).map((v) => ({ verb: v, nodes: gmap.get(v) }));

  // when a pill was clicked (focusVerb set), scroll that verb group into view and flash it.
  // deps on `detail` so re-clicking the same verb re-triggers (each openDetail is a new object).
  useEffect(() => {
    if (!focusVerb) return;
    const g = groupRefs.current[focusVerb];
    if (!g) return;
    g.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash');
    const t = setTimeout(() => g.classList.remove('flash'), 1500);
    return () => clearTimeout(t);
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {chain.length > 1 && (
        <div className="breadcrumb">
          {chain.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="bc-sep">▸</span>}
              {c.id === node.id ? <span className="bc-here">{c.label}</span>
                : <span className="bc-link" onClick={() => openDetail(c.id)}>{c.label}</span>}
            </span>
          ))}
        </div>
      )}
      {subStores.length > 0 && (
        <>
          <h4>{subStores.length + ' data store' + (subStores.length > 1 ? 's' : '')}</h4>
          {subStores.map((c) => (
            <div key={c.id} className="relrow" onClick={() => openDetail(c.id)}>
              <div className="rlabel">{c.label}{relLabel(c) && <span className="fr-role">{relLabel(c)}</span>}</div>
            </div>
          ))}
        </>
      )}
      {fields.length > 0 && (
        <>
          <h4>{fields.length + ' field' + (fields.length > 1 ? 's' : '')}</h4>
          {fields.map((c) => (
            <div key={c.id} className="relrow" onClick={() => openDetail(c.id)}>
              <div className="rlabel">{c.label}{c.dataType && <span className="fr-dtype">{c.dataType}</span>}{c.fieldKind && <span className="fr-role">{c.fieldKind}</span>}</div>
            </div>
          ))}
        </>
      )}
      {groups.map((g) => (
        <div key={g.verb} className="dm-verb-group" ref={(elm) => { if (elm) groupRefs.current[g.verb] = elm; }}>
          <h4><span className="vg-dot" style={{ background: VERB_COLORS[g.verb] || VERB_COLORS._default }} />{g.verb + ' (' + g.nodes.length + ')'}</h4>
          {g.nodes.map((n, i) => {
            const np = PALETTE[n.type] || PALETTE.invariant;
            return (
              <div key={i} className="relrow" onClick={() => openDetail(n.id)} title={np.name + ' — ' + n.label}>
                <div className="rdot" style={{ background: np.fill, borderColor: np.edge }} />
                <div className="rlabel">{n.label}</div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

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
  const inBundle = isInBundle('node', node.id);
  const copy = async () => {
    try { const r = await getItem('node', node.id); await navigator.clipboard.writeText(r.markdown || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  return (
    <div className="detail-actions">
      <button className={inBundle ? 'da-in' : ''} onClick={() => (inBundle ? removeFromContext('node', node.id) : addToContext('node', node.id))}>
        {inBundle ? 'In bundle ✓' : '+ Add to context'}
      </button>
      <button onClick={copy}>{copied ? 'Copied ✓' : '⧉ Copy for Claude'}</button>
    </div>
  );
}

function NodeDetail({ node }) {
  const { model, PALETTE, nodeById, repoRoot, selectFlow, openDetail } = useExplorer();
  const p = PALETTE[node.type] || PALETTE.invariant;
  const dataNode = isDataNode(node);
  const rel = enforcesRelation(model, nodeById, node);
  const usages = nodeUsages(node);
  const storageLinks = dataNode ? [] : nodeStorageLinks(model, nodeById, node.id);
  const inFlows = model.flows.filter((f) => (f.steps || []).includes(node.id) || (f.edges || []).some((e) => e.from === node.id || e.to === node.id));

  return (
    <>
      <span className="dtype" style={{ background: p.fill, color: p.text }}>{p.name}</span>
      <h3>{node.label}</h3>
      <div className="chips">
        {node.inferred && <span className="chip">inferred from code</span>}
        {dataNode && node.inferred === false && <span className="chip">named in code</span>}
        {node.storeKind && <span className="chip">{node.storeKind}</span>}
        {node.fieldKind && <span className="chip">{node.fieldKind}</span>}
        {node.engine && <span className="chip">{node.engine}</span>}
        {node.ownedBy && <span className="chip">{'state owned by ' + node.ownedBy}</span>}
        {node.synchronous && <span className="chip">synchronous inline reaction</span>}
        {(node.provenance || []).map((pv) => <span key={pv} className="chip">{pv}</span>)}
      </div>
      <DetailActions node={node} />
      <div className="desc">{node.description || ''}</div>

      {dataNode && <StorageSection node={node} model={model} nodeById={nodeById} openDetail={openDetail} />}
      <FieldsSection node={node} nodeById={nodeById} openDetail={openDetail} />

      {storageLinks.length > 0 && (
        <>
          <h4>Storage</h4>
          {storageLinks.map((s, i) => (
            <div key={i} className="relrow" onClick={() => openDetail(s.node.id)}>
              <div className="rlabel">{s.node.label}<span className="fr-role">{s.verb}</span></div>
            </div>
          ))}
        </>
      )}

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
