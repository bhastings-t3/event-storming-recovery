import React from 'react';
import { useExplorer } from '../store.jsx';
import Board from './Board.jsx';

export default function Main() {
  const { currentFlow, hotspotById, openHotspot } = useExplorer();
  const f = currentFlow;

  const spots = f ? (f.hotspots || []).map((h) => hotspotById.get(h)).filter(Boolean) : [];
  const instances = f ? (f.instances || []) : [];
  const showFindings = spots.length > 0 || instances.length > 0;

  return (
    <div id="main">
      <div id="flowheader">
        {!f ? (
          <h2>Select a flow</h2>
        ) : (
          <>
            <h2>
              {f.name}
              {f.status && f.status !== 'live' && (
                <span className={'badge ' + f.status}>{f.status.toUpperCase() + (f.supersededBy ? ' → ' + f.supersededBy : '')}</span>
              )}
            </h2>
            <div className="summary">{f.summary || ''}</div>
            {f.trigger && <div className="trigger"><b>Trigger: </b>{f.trigger}</div>}
          </>
        )}
      </div>

      <Board />

      {showFindings && (
        <div id="findings">
          {spots.length > 0 && (
            <div id="hotspots">
              <h3>
                Hotspots<span className="n">{spots.length}</span>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>questions a human should answer</span>
              </h3>
              <div className="hs-cards">
                {spots.map((s) => (
                  <div key={s.id} className="hs-card" title={s.description || ''} onClick={() => openHotspot(s.id)}>
                    <b>{s.label}</b>
                    <span>{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {instances.length > 0 && (
            <div id="instances">
              <h3>Instances of this pattern<span className="n">{instances.length}</span></h3>
              <table>
                <tbody>
                  {instances.map((i, idx) => (
                    <tr key={idx}>
                      <td className="i-label">{i.label || ''}</td>
                      <td className="i-route">{i.route || ''}</td>
                      <td className="i-file" title={i.file || ''}>{(i.file || '').split('/').pop()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
