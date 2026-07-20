import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { PALETTE } from './palette.js';
import { buildIndexes, galleryTypes } from './model.js';
import { pushSelection, getContext, addContext, removeContext, clearContext } from './api.js';

const sameRef = (a, type, id) => a.type === type && a.id === id;

const ExplorerContext = createContext(null);
export const useExplorer = () => useContext(ExplorerContext);

// Holds the model indexes (stable) plus all interactive state: which tab is open, which flow
// is on the board, what's selected, the sidebar/gallery/glossary filters, the curated context
// bundle, and the right-click menu. Selection + bundle are mirrored to the server so a connected
// Claude session sees them.
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
  const [bundleItems, setBundleItems] = useState([]); // [{ type, id }]
  const [bundleOpen, setBundleOpen] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, ref: { type, id, label } } | null

  // load the bundle once (the server holds it; survives a page reload within a run)
  useEffect(() => { getContext().then((r) => setBundleItems(r.items || [])).catch(() => {}); }, []);

  const selectFlow = useCallback((id) => {
    setMode('flows');
    setCurrentFlowId(id);
    setSelectedNodeId(null);
    setDetail(null);
  }, []);
  const openDetail = useCallback((id, opts) => {
    setSelectedNodeId(id);
    setDetail({ kind: 'node', id, focusVerb: opts && opts.focusVerb ? opts.focusVerb : null });
    pushSelection(id); // mirror to the server so MCP get_current_selection sees it
  }, []);
  const openHotspot = useCallback((id) => { setDetail({ kind: 'hotspot', id }); }, []);
  const closeDetail = useCallback(() => { setSelectedNodeId(null); setDetail(null); }, []);

  const addToContext = useCallback((type, id) => { addContext(type, id).then((r) => setBundleItems(r.items || [])).catch(() => {}); }, []);
  const removeFromContext = useCallback((type, id) => { removeContext(type, id).then((r) => setBundleItems(r.items || [])).catch(() => {}); }, []);
  const clearBundle = useCallback(() => { clearContext().then((r) => setBundleItems(r.items || [])).catch(() => {}); }, []);

  const openMenu = useCallback((x, y, ref) => setMenu({ x, y, ref }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

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
    bundleItems, addToContext, removeFromContext, clearBundle,
    isInBundle: (type, id) => bundleItems.some((it) => sameRef(it, type, id)),
    bundleOpen, setBundleOpen,
    menu, openMenu, closeMenu,
    selectFlow, openDetail, openHotspot, closeDetail,
  };
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}
