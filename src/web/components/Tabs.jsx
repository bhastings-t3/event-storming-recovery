import React from 'react';
import { useExplorer } from '../store.jsx';

const TABS = [
  ['flows', 'Flows'],
  ['gallery', 'Gallery'],
  ['glossary', 'Glossary'],
  ['overview', 'Overview'],
];

export default function Tabs() {
  const { mode, setMode, bundleItems, bundleOpen, setBundleOpen } = useExplorer();
  return (
    <div id="tabbar">
      {TABS.map(([m, label]) => (
        <button key={m} className={'tab' + (mode === m ? ' active' : '')} onClick={() => setMode(m)}>{label}</button>
      ))}
      <button
        className={'ctx-pill' + (bundleOpen ? ' active' : '')}
        title="Curated context bundle for Claude"
        onClick={() => setBundleOpen((v) => !v)}
      >
        Context<span className="ctx-pill-n">{bundleItems.length}</span>
      </button>
    </div>
  );
}
