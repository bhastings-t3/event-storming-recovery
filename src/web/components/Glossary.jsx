import React from 'react';
import { useExplorer } from '../store.jsx';
import { nodeFlows } from '../model.js';

const GL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const letterOf = (n) => { const c = (n.label || '').trim()[0]; return c && /[a-z]/i.test(c) ? c.toUpperCase() : '#'; };

// Glossary: the ubiquitous language as an alphabetical, readable dictionary. Ported from
// buildGlossary/renderGlossaryList in generate-views.js.
export default function Glossary() {
  const { model, PALETTE, types, glossary, setGlossary, selectFlow, openDetail, openMenu } = useExplorer();
  const { q, active, sharedOnly } = glossary;

  const toggleType = (t) => setGlossary((s) => {
    const next = new Set(s.active);
    if (next.has(t)) next.delete(t); else next.add(t);
    return { ...s, active: next };
  });
  const allOn = () => setGlossary((s) => ({ ...s, active: new Set(types) }));

  const ql = q.toLowerCase();
  let nodes = model.nodes
    .filter((n) => active.has(n.type))
    .filter((n) => !ql || (n.label + ' ' + (n.description || '')).toLowerCase().includes(ql));
  if (sharedOnly) nodes = nodes.filter((n) => nodeFlows(model, n.id).length > 1);
  nodes.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));

  const present = new Set(nodes.map(letterOf));
  const allActive = types.every((t) => active.has(t));

  // build the list with letter headers interleaved
  const rows = [];
  let curLetter = null;
  for (const n of nodes) {
    const L = letterOf(n);
    if (L !== curLetter) { curLetter = L; rows.push({ letter: L }); }
    rows.push({ node: n });
  }

  const jumpTo = (L) => { const t = document.getElementById('gl-L-' + L); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <section id="glossary" className="show">
      <div className="gl-head">
        <h2>Ubiquitous Language<span className="count">{nodes.length} of {model.nodes.length} terms</span></h2>
        <input
          className="gl-search"
          type="search"
          placeholder="Search terms and definitions..."
          value={q}
          onChange={(e) => setGlossary((s) => ({ ...s, q: e.target.value }))}
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
          <div className={'tchip tchip-all' + (sharedOnly ? ' on' : '')} title="Only terms that appear in more than one flow (the connective vocabulary)" onClick={() => setGlossary((s) => ({ ...s, sharedOnly: !s.sharedOnly }))}>
            Shared across flows
          </div>
        </div>
      </div>
      <div className="gl-body">
        <div className="gl-list">
          {nodes.length === 0 && <div className="gl-empty">No terms match the current filters.</div>}
          {rows.map((r, i) => {
            if (r.letter) return <div className="gl-letter" id={'gl-L-' + r.letter} key={'L' + r.letter}>{r.letter}</div>;
            const n = r.node;
            const p = PALETTE[n.type] || PALETTE.invariant;
            const flows = nodeFlows(model, n.id);
            return (
              <div className="gl-entry" key={n.id} onClick={() => openDetail(n.id)} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, n.id); }}>
                <div className="gl-term">
                  <span className="gl-badge" style={{ background: p.fill, color: p.text }}>{p.name}</span>
                  <span className="gl-name">{n.label}</span>
                  {flows.length > 0 && <span className="gl-flows">in {flows.length} flow{flows.length > 1 ? 's' : ''}</span>}
                </div>
                {n.description && <div className="gl-def">{n.description}</div>}
                {flows.length > 0 && (
                  <div className="gl-used">
                    {flows.map((f) => {
                      const dead = f.status && f.status !== 'live';
                      return (
                        <div key={f.id} className={'gl-fchip' + (dead ? ' dead' : '')} title={'Open "' + f.name + '" in the Flows board'} onClick={(e) => { e.stopPropagation(); selectFlow(f.id); }}>
                          {f.name}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="gl-rail">
          {GL_LETTERS.map((L) => (
            present.has(L)
              ? <span key={L} onClick={() => jumpTo(L)}>{L}</span>
              : <span key={L} style={{ opacity: 0.22, pointerEvents: 'none' }}>{L}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
