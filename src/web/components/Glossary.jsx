import React, { useMemo } from 'react';
import { useExplorer } from '../store.jsx';
import { nodeFlows, queryTokens, matchesQuery } from '../model.js';

const GL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const letterOf = (n) => { const c = (n.label || '').trim()[0]; return c && /[a-z]/i.test(c) ? c.toUpperCase() : '#'; };

// Glossary: the ubiquitous language as an alphabetical, readable dictionary. Ported from
// buildGlossary/renderGlossaryList in generate-views.js.
export default function Glossary() {
  // `types` here is the glossary-scoped set (domain verbiage: no datastore/field/invariant) — the
  // Gallery keeps the full palette, so the two intentionally differ. See issue #11.
  const { model, PALETTE, glossaryTypes: types, glossary, setGlossary, selectFlow, openDetail, openMenu } = useExplorer();
  const { q, active, sharedOnly } = glossary;

  const toggleType = (t) => setGlossary((s) => {
    const next = new Set(s.active);
    if (next.has(t)) next.delete(t); else next.add(t);
    return { ...s, active: next };
  });
  const allOn = () => setGlossary((s) => ({ ...s, active: new Set(types) }));

  const tokens = useMemo(() => queryTokens(q), [q]);
  // built once per model (not per keystroke): node id -> lowercased "label + description" haystack.
  // Kept to the term's own fields (no flow names) — glossary search is about the term, not usage.
  const nodeHaystacks = useMemo(() => {
    const m = new Map();
    for (const n of model.nodes) m.set(n.id, (n.label + ' ' + (n.description || '')).toLowerCase());
    return m;
  }, [model]);
  // Nodes eligible for the glossary at all (the scoped vocabulary types); the denominator counts
  // these, not every node in the model, since physical/rule nodes can never appear here.
  const inScope = model.nodes.filter((n) => types.includes(n.type));
  let nodes = inScope
    .filter((n) => active.has(n.type))
    .filter((n) => !tokens.length || matchesQuery(nodeHaystacks.get(n.id), tokens));
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
        <h2>Ubiquitous Language<span className="count">{nodes.length} of {inScope.length} terms</span></h2>
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
              <div className="gl-entry" key={n.id} onClick={() => openDetail(n.id)} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'node', id: n.id }); }}>
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
                        <div key={f.id} className={'gl-fchip' + (dead ? ' dead' : '')} title={'Open "' + f.name + '" · right-click to add the flow to context'} onClick={(e) => { e.stopPropagation(); selectFlow(f.id); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, { type: 'flow', id: f.id }); }}>
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
