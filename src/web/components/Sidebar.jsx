import React, { useMemo, useState } from 'react';
import { useExplorer } from '../store.jsx';
import { sidebarGroups, flowSearchText, queryTokens, matchesQuery } from '../model.js';

const KIND_COLOR = { read: '#6FC993', policy: '#BF9BE0', write: '#6BA3E8' };

export default function Sidebar() {
  const { model, PALETTE, nodeById, groupMode, setGroupMode, filter, setFilter, currentFlow, selectFlow, openMenu } = useExplorer();
  const title = (model.meta && model.meta.title) || 'Event Storming Explorer';
  const tokens = useMemo(() => queryTokens(filter), [filter]);
  // built once per model (not per keystroke): flow id -> lowercased haystack
  const flowHaystacks = useMemo(() => {
    const m = new Map();
    for (const fl of model.flows) m.set(fl.id, flowSearchText(model, nodeById, fl));
    return m;
  }, [model, nodeById]);
  // collapsed group headings, keyed by `${groupMode}|${title}` since sidebarGroups has no stable id
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <aside id="sidebar">
      <header>
        <h1>{title}</h1>
        <div className="sub">strategic flows recovered from the tactical codebase</div>
      </header>
      <input id="search" type="search" placeholder="Filter flows..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div id="groupby">
        <span className="gb-cap">Group</span>
        {['tier', 'actor', 'aggregate'].map((m) => (
          <button key={m} className={'gb' + (groupMode === m ? ' active' : '')} onClick={() => setGroupMode(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <nav id="flowlist">
        {sidebarGroups(model, groupMode, nodeById).map((g, gi) => {
          const flows = model.flows.filter(g.pred).filter((fl) => !tokens.length || matchesQuery(flowHaystacks.get(fl.id), tokens));
          if (!flows.length) return null;
          const groupKey = groupMode + '|' + g.title;
          const listId = 'flow-group-' + gi;
          // a non-empty filter always wins so search hits are never hidden by a collapsed group
          const collapsed = !tokens.length && collapsedGroups.has(groupKey);
          return (
            <React.Fragment key={gi}>
              <button
                type="button"
                className="flow-group"
                aria-expanded={!collapsed}
                aria-controls={listId}
                onClick={() => toggleGroup(groupKey)}
              >
                <span className={'fg-chevron' + (collapsed ? ' collapsed' : '')}>▾</span>
                {g.color && <span className="fg-dot" style={{ background: g.color }} />}
                <span className="fg-title">{g.title}</span>
                <span className="fg-count">{flows.length}</span>
              </button>
              {!collapsed && <div id={listId} className="flow-group-items">{flows.map((fl) => {
                const dead = fl.status && fl.status !== 'live';
                const hs = (fl.hotspots || []).length;
                const active = currentFlow && currentFlow.id === fl.id;
                return (
                  <div
                    key={fl.id}
                    className={'flow-item' + (active ? ' active' : '') + (dead ? ' dim' : '')}
                    style={{ '--kind': KIND_COLOR[fl.kind] || KIND_COLOR.write }}
                    title={fl.name + (dead ? '  [' + fl.status + (fl.supersededBy ? ' → ' + fl.supersededBy : '') + ']' : '') + '  ·  ' + (fl.kind || 'write') + '  ·  right-click to add flow to context'}
                    onClick={() => selectFlow(fl.id)}
                    onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { type: 'flow', id: fl.id }); }}
                  >
                    <div className="nm">{fl.name}</div>
                    {(dead || hs > 0) && (
                      <div className="fi-tags">
                        {dead && <div className={'status-dot ' + fl.status} />}
                        {hs > 0 && <div className="hs-count">{hs}</div>}
                      </div>
                    )}
                  </div>
                );
              })}</div>}
            </React.Fragment>
          );
        })}
      </nav>
      <div id="legend">
        {Object.entries(PALETTE).map(([type, p]) => (
          <span key={type} className="lg" style={{ background: p.fill, color: p.text }}>{p.name}</span>
        ))}
      </div>
    </aside>
  );
}
