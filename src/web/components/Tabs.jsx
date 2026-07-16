import React from 'react';
import { useExplorer } from '../store.jsx';

const TABS = [
  ['flows', 'Flows'],
  ['gallery', 'Gallery'],
  ['glossary', 'Glossary'],
  ['overview', 'Overview'],
];

export default function Tabs() {
  const { mode, setMode } = useExplorer();
  return (
    <div id="tabbar">
      {TABS.map(([m, label]) => (
        <button key={m} className={'tab' + (mode === m ? ' active' : '')} onClick={() => setMode(m)}>{label}</button>
      ))}
    </div>
  );
}
