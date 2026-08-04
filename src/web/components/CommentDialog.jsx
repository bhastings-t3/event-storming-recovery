import React, { useEffect, useState } from 'react';
import { useExplorer } from '../store.jsx';

// A small floating dialog anchored at the cursor (clamped on-screen). Lists an item's existing
// comments and takes a new one — Enter submits, Shift+Enter for a newline. Comments persist
// server-side (next to the model) and ride into context when the item is bundled/selected.
export default function CommentDialog() {
  const { commentDialog, closeCommentDialog, nodeById, hotspotById, model, commentsFor, addCommentTo, removeCommentFrom, commentDurability } = useExplorer();
  const [text, setText] = useState('');

  useEffect(() => {
    if (!commentDialog) return;
    setText('');
    const onKey = (e) => { if (e.key === 'Escape') closeCommentDialog(); };
    const onDown = () => closeCommentDialog();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [commentDialog, closeCommentDialog]);

  if (!commentDialog) return null;
  const { x, y, ref } = commentDialog;
  const { type, id } = ref;
  const label = (type === 'flow' ? (model.flows.find((f) => f.id === id) || {}).name
    : type === 'hotspot' ? (hotspotById.get(id) || {}).label
      : (nodeById.get(id) || {}).label) || id;
  const list = commentsFor(type, id);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    addCommentTo(type, id, t);
    setText('');
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const left = Math.max(8, Math.min(x, window.innerWidth - 336));
  const top = Math.max(8, Math.min(y, window.innerHeight - 300));

  return (
    <div className="cmt-dialog" data-testid="comment-dialog" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cmt-head">
        <span className="cmt-title">Comments · <b>{label}</b></span>
        <button className="cmt-x" onClick={closeCommentDialog}>✕</button>
      </div>

      <div className="cmt-list">
        {list.length === 0
          ? <div className="cmt-empty">No comments yet.</div>
          : list.map((c) => (
            <div key={c.id} className="cmt-item">
              <div className="cmt-text">{c.text}</div>
              <div className="cmt-meta">
                <span>{String(c.at).slice(0, 10)}</span>
                <button className="cmt-del" title="Delete" onClick={() => removeCommentFrom(type, id, c.id)}>✕</button>
              </div>
            </div>
          ))}
      </div>

      <textarea
        className="cmt-input"
        autoFocus
        placeholder="Add a comment…  (Enter to save, Shift+Enter for a new line)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {commentDurability && (
        <div className="cmt-warn" title={commentDurability.reason}>
          ⚠ Not saved to disk — kept for this session only.
        </div>
      )}
      <div className="cmt-actions">
        <button className="btn-primary" disabled={!text.trim()} onClick={submit}>Add comment</button>
      </div>
    </div>
  );
}
