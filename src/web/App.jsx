import React, { useEffect, useState } from 'react';
import { fetchModel } from './api.js';

const SOURCE_LABEL = {
  model: 'explicit --model',
  traces: 'merged from --traces',
  discovered: 'auto-discovered in this directory',
  example: 'bundled toy-shop example',
};
const KIND_COLOR = { read: '#6FC993', policy: '#BF9BE0', write: '#6BA3E8' };

// Phase 1 vertical slice: prove npx -> server -> /api/model -> SPA end to end.
// The full explorer (board, gallery, glossary, overview, detail panel) replaces
// this boot screen in the next task; the data contract it reads is already here.
export default function App() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    fetchModel()
      .then((data) => { if (alive) setState({ status: 'ready', ...data }); })
      .catch((err) => { if (alive) setState({ status: 'error', error: err.message }); });
    return () => { alive = false; };
  }, []);

  if (state.status === 'loading') {
    return <div className="boot"><div className="boot-card"><h1>Loading model…</h1><div className="sub">Fetching /api/model</div></div></div>;
  }
  if (state.status === 'error') {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>Couldn't load the model</h1>
          <div className="sub">The es-view server didn't return a model.</div>
          <div className="boot-err">{state.error}</div>
        </div>
      </div>
    );
  }

  const { model, meta } = state;
  const counts = (model.meta && model.meta.counts) || {};

  return (
    <div className="boot">
      <div className="boot-card">
        <h1>{(model.meta && model.meta.title) || 'Event Storming Explorer'}</h1>
        <div className="sub">Strategic flows recovered from the tactical codebase.</div>

        <dl className="kv">
          <dt>model</dt><dd>{SOURCE_LABEL[meta.source] || meta.source}</dd>
          <dt>from</dt><dd>{meta.sourcePath}</dd>
          <dt>repo-root</dt><dd>{meta.repoRoot}</dd>
        </dl>

        <div className="counts">
          <span className="count-pill"><b>{counts.flows ?? model.flows.length}</b> flows</span>
          <span className="count-pill"><b>{counts.nodes ?? model.nodes.length}</b> nodes</span>
          <span className="count-pill"><b>{counts.hotspots ?? model.hotspots.length}</b> hotspots</span>
        </div>

        {(meta.warnings || []).map((w, i) => <div className="warn" key={i}>{w}</div>)}

        <div className="flow-list">
          <h2>Flows</h2>
          <ul>
            {model.flows.map((f) => {
              const dead = f.status && f.status !== 'live';
              return (
                <li key={f.id}>
                  <span className="dot" style={{ background: KIND_COLOR[f.kind] || KIND_COLOR.write }} />
                  <span>{f.name}</span>
                  {dead && <span className={`st ${f.status}`}>{f.status}</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="boot-note">
          Vertical slice running. Next: the full board, gallery, glossary, overview, and the
          source-linked detail panel port in over this screen.
        </div>
      </div>
    </div>
  );
}
