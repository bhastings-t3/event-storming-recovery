import React, { useEffect } from 'react';
import { useExplorer } from '../store.jsx';
import { getNode } from '../api.js';

// Right-click menu for a node (board sticky, gallery card, glossary entry): add/remove it from
// the curated context bundle, or copy its grounded markdown for pasting into Claude.
export default function ContextMenu() {
  const { menu, closeMenu, nodeById, isInBundle, addToContext, removeFromContext } = useExplorer();

  useEffect(() => {
    if (!menu) return;
    const onDown = () => closeMenu();
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menu, closeMenu]);

  if (!menu) return null;
  const n = nodeById.get(menu.nodeId);
  const inBundle = isInBundle(menu.nodeId);

  const copyNode = async () => {
    try { const r = await getNode(menu.nodeId); await navigator.clipboard.writeText(r.markdown || ''); } catch { /* clipboard blocked */ }
    closeMenu();
  };

  // clamp to viewport so a right-edge click doesn't overflow
  const left = Math.min(menu.x, window.innerWidth - 230);
  const top = Math.min(menu.y, window.innerHeight - 110);

  return (
    <div className="ctxmenu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ctxmenu-head">{n ? n.label : menu.nodeId}</div>
      <button onClick={() => { inBundle ? removeFromContext(menu.nodeId) : addToContext(menu.nodeId); closeMenu(); }}>
        {inBundle ? '− Remove from context bundle' : '+ Add to context bundle'}
      </button>
      <button onClick={copyNode}>⧉ Copy this node for Claude</button>
    </div>
  );
}
