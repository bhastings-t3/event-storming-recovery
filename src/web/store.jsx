import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { PALETTE } from './palette.js';
import { buildIndexes, galleryTypes } from './model.js';

const ExplorerContext = createContext(null);
export const useExplorer = () => useContext(ExplorerContext);

// Holds the model indexes (stable) plus all interactive state: which tab is open, which flow
// is on the board, what's selected in the detail panel, and the sidebar/gallery/glossary
// filters. Mirrors the module-level state the original single-file explorer kept in globals.
export function ExplorerProvider({ model, meta, children }) {
  const { nodeById, hotspotById } = useMemo(() => buildIndexes(model), [model]);
  const types = useMemo(() => galleryTypes(model), [model]);

  const [mode, setMode] = useState('flows');
  const [currentFlowId, setCurrentFlowId] = useState(model.flows.length ? model.flows[0].id : null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [detail, setDetail] = useState(null); // { kind: 'node' | 'hotspot', id } | null
  const [groupMode, setGroupMode] = useState('tier');
  const [filter, setFilter] = useState('');
  const [gallery, setGallery] = useState({ q: '', active: new Set(types) });
  const [glossary, setGlossary] = useState({ q: '', active: new Set(types), sharedOnly: false });

  const selectFlow = useCallback((id) => {
    setMode('flows');
    setCurrentFlowId(id);
    setSelectedNodeId(null);
    setDetail(null);
  }, []);
  const openDetail = useCallback((id) => { setSelectedNodeId(id); setDetail({ kind: 'node', id }); }, []);
  const openHotspot = useCallback((id) => { setDetail({ kind: 'hotspot', id }); }, []);
  const closeDetail = useCallback(() => { setSelectedNodeId(null); setDetail(null); }, []);

  const value = {
    model, meta, PALETTE, nodeById, hotspotById, types,
    repoRoot: meta.repoRoot,
    mode, setMode,
    currentFlowId,
    currentFlow: model.flows.find((f) => f.id === currentFlowId) || null,
    selectedNodeId, detail,
    groupMode, setGroupMode,
    filter, setFilter,
    gallery, setGallery,
    glossary, setGlossary,
    selectFlow, openDetail, openHotspot, closeDetail,
  };
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}
