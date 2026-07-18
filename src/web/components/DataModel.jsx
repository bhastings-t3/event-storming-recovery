import React from 'react';
import { useExplorer } from '../store.jsx';
import { dataModelTree, isRecordSet, datastoreConsumers } from '../model.js';

// The datastore tree is technology-neutral: a datastore may be a server, a database, a filesystem,
// a directory, a file, a broker, a queue, a cache, an in-memory map... The `storeKind` label carries
// the flavor. A datastore that behavior touches (or that fields hang off) renders as a CARD; a pure
// container renders as a HEADER wrapping its children. Depth is whatever the codebase actually has.

function ConsumerChips({ ds }) {
  const { model, nodeById, PALETTE, openDetail } = useExplorer();
  const consumers = datastoreConsumers(model, nodeById, ds.id);
  if (!consumers.length) return null;
  return (
    <div className="dm-consumers">
      {consumers.map((c, i) => {
        const cp = PALETTE[c.node.type] || PALETTE.invariant;
        return (
          <span key={i} className="dm-consumer" style={{ borderColor: cp.edge }} onClick={() => openDetail(c.node.id)} title={cp.name + ' — ' + c.verb}>
            <span className="dm-cdot" style={{ background: cp.fill }} />
            <span className="dm-cverb">{c.verb}</span>
            {c.node.label}
          </span>
        );
      })}
    </div>
  );
}

// A record-set datastore (a table / file / queue / collection): its fields + who reads/writes it.
function StoreCard({ tree }) {
  const { PALETTE, openDetail } = useExplorer();
  const { node: ds, fields, stores } = tree;
  const p = PALETTE.datastore;
  const kind = (ds.storeKind || 'store').toUpperCase();
  return (
    <div className="dm-table" style={{ borderColor: p.edge }}>
      <div className="dm-table-head" style={{ background: p.fill, color: p.text }} onClick={() => openDetail(ds.id)}>
        <span className="dm-tt">{kind}</span>
        <span className="dm-tn">{ds.label}</span>
      </div>
      {fields.length > 0 && (
        <div className="dm-cols">
          {fields.map((c) => (
            <div key={c.id} className="dm-col" onClick={() => openDetail(c.id)} title={c.description || ''}>
              <span className="dm-cn">{c.label}</span>
              {c.dataType && <span className="dm-ct">{c.dataType}</span>}
              {c.nullable === false && <span className="dm-nn">NN</span>}
            </div>
          ))}
        </div>
      )}
      <ConsumerChips ds={ds} />
      {stores.length > 0 && <div className="dm-tables">{stores.map((s) => <StoreNode key={s.node.id} tree={s} depth={99} />)}</div>}
    </div>
  );
}

// A datastore subtree: a card if it's a record set, else a container header that groups its record-set
// children into a card grid and nests its container children.
function StoreNode({ tree, depth }) {
  const { model, nodeById, PALETTE, openDetail } = useExplorer();
  const { node: ds, stores } = tree;
  if (isRecordSet(model, nodeById, ds)) return <StoreCard tree={tree} />;

  const p = PALETTE.datastore;
  const kind = (ds.storeKind || 'store').toUpperCase();
  const cardKids = stores.filter((s) => isRecordSet(model, nodeById, s.node));
  const headerKids = stores.filter((s) => !isRecordSet(model, nodeById, s.node));
  const top = depth === 0;
  return (
    <div className={top ? 'dm-server' : 'dm-db'}>
      <div className={top ? 'dm-server-head' : 'dm-db-head'} onClick={() => openDetail(ds.id)}>
        <span className="dm-badge" style={{ background: p.fill, color: p.text }}>{kind}</span>
        <span className={top ? 'dm-sname' : 'dm-dname'}>{ds.label}</span>
        {ds.host && <span className="dm-host">{ds.host}</span>}
        {ds.ownedBy && <span className="dm-owned">{'owned by ' + ds.ownedBy}</span>}
      </div>
      {headerKids.map((s) => <StoreNode key={s.node.id} tree={s} depth={depth + 1} />)}
      {cardKids.length > 0 && <div className="dm-tables">{cardKids.map((s) => <StoreNode key={s.node.id} tree={s} depth={depth + 1} />)}</div>}
    </div>
  );
}

export default function DataModel() {
  const { model, nodeById } = useExplorer();
  const { roots, looseFields } = dataModelTree(model, nodeById);
  const dataCount = model.nodes.filter((n) => n.type === 'datastore' || n.type === 'field').length;
  const topCards = roots.filter((r) => isRecordSet(model, nodeById, r.node));
  const topContainers = roots.filter((r) => !isRecordSet(model, nodeById, r.node));

  return (
    <div id="datamodel">
      <div className="dm-head">
        <h2>Data model <span className="count">{dataCount}</span></h2>
        <div className="dm-sub">The storage the code actually touches, recovered from the code and its config — whatever kind it is: databases, files, queues, caches, in-memory state. Data stores nest to whatever depth exists (server ▸ database ▸ table, or filesystem ▸ directory ▸ file, …) and are cross-linked to the read models and aggregates that read and write them. Demand-driven: only the fields a read model or aggregate references appear.</div>
      </div>
      <div className="dm-body">
        {dataCount === 0 && (
          <div className="dm-empty">No data model recovered yet. Run the data-mapping phase (prompts/05-data-mapping.md) to populate data stores and field lineage.</div>
        )}
        {topContainers.map((r) => <StoreNode key={r.node.id} tree={r} depth={0} />)}
        {topCards.length > 0 && <div className="dm-tables">{topCards.map((r) => <StoreNode key={r.node.id} tree={r} depth={0} />)}</div>}
        {looseFields.length > 0 && (
          <div className="dm-server">
            <div className="dm-server-head"><span className="dm-badge dm-unattached">UNATTACHED FIELDS</span><span className="dm-sname">not tied to a data store</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
