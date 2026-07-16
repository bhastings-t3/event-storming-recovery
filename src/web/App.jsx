import React, { useEffect, useState } from 'react';
import { fetchModel } from './api.js';
import { ExplorerProvider, useExplorer } from './store.jsx';
import Tabs from './components/Tabs.jsx';
import Sidebar from './components/Sidebar.jsx';
import Main from './components/Main.jsx';
import Gallery from './components/Gallery.jsx';
import Glossary from './components/Glossary.jsx';
import Overview from './components/Overview.jsx';
import Detail from './components/Detail.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import ContextBundle from './components/ContextBundle.jsx';

function Explorer() {
  const { mode } = useExplorer();
  return (
    <>
      <Tabs />
      <div id="shell">
        {/* Flows (sidebar + board) stays mounted so its pan/zoom survives tab switches;
            display:contents lets the two panes act as direct flex children of #shell. */}
        <div style={{ display: mode === 'flows' ? 'contents' : 'none' }}>
          <Sidebar />
          <Main />
        </div>
        {mode === 'gallery' && <Gallery />}
        {mode === 'glossary' && <Glossary />}
        {mode === 'overview' && <Overview />}
        <Detail />
      </div>
      <ContextMenu />
      <ContextBundle />
    </>
  );
}

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

  return (
    <ExplorerProvider model={state.model} meta={state.meta}>
      <Explorer />
    </ExplorerProvider>
  );
}
