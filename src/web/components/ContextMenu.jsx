import React, { useEffect } from 'react';
import { useExplorer } from '../store.jsx';
import { getItem } from '../api.js';

const TYPE_WORD = { node: 'node', flow: 'flow', hotspot: 'hotspot' };

// Right-click menu for any addable item (board sticky = node, overview box / sidebar item /
// glossary chip = flow, hotspot card = hotspot): add/remove it from the context bundle, copy its
// grounded markdown, or add/show human comments (persisted next to the model).
export default function ContextMenu() {
  const { menu, closeMenu, nodeById, hotspotById, model, isInBundle, addToContext, removeFromContext, commentsFor, openCommentDialog } = useExplorer();

  useEffect(() => {
    if (!menu) return;
    const onDown = () => closeMenu();
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menu, closeMenu]);

  if (!menu) return null;
  const { x, y, ref } = menu;
  const { type, id } = ref;
  const label = ref.label
    || (type === 'flow' ? (model.flows.find((f) => f.id === id) || {}).name
      : type === 'hotspot' ? (hotspotById.get(id) || {}).label
        : (nodeById.get(id) || {}).label)
    || id;
  const inBundle = isInBundle(type, id);
  const word = TYPE_WORD[type] || 'item';
  const nComments = commentsFor(type, id).length;

  const copy = async () => {
    try { const r = await getItem(type, id); await navigator.clipboard.writeText(r.markdown || ''); } catch { /* clipboard blocked */ }
    closeMenu();
  };
  const openComments = () => { closeMenu(); openCommentDialog(x, y, ref); };

  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 150);

  return (
    <div className="ctxmenu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctxmenu-head">{label}</div>
      <button onClick={() => { inBundle ? removeFromContext(type, id) : addToContext(type, id); closeMenu(); }}>
        {inBundle ? `− Remove ${word} from context bundle` : `+ Add ${word} to context bundle`}
      </button>
      <button onClick={copy}>⧉ Copy this {word} for Claude</button>
      <button onClick={openComments}>💬 Add comment</button>
      {nComments > 0 && <button onClick={openComments}>Show comments ({nComments})</button>}
    </div>
  );
}
