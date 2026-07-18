import React from 'react';
import { useExplorer } from '../store.jsx';
import { dataModelTree, tableConsumers } from '../model.js';

// A table card: its columns (click-through to the column node) and the behavioral nodes that
// write / read / project it (click-through to the sticky). Storage rendered as a substrate the
// behavioral model anchors into, not a parallel ERD.
function TableCard({ table, columns }) {
  const { model, nodeById, PALETTE, openDetail } = useExplorer();
  const p = PALETTE.table || PALETTE.invariant;
  const consumers = tableConsumers(model, nodeById, table.id);
  return (
    <div className="dm-table" style={{ borderColor: p.edge }}>
      <div className="dm-table-head" style={{ background: p.fill, color: p.text }} onClick={() => openDetail(table.id)}>
        <span className="dm-tt">{table.kind === 'view' ? 'VIEW' : 'TABLE'}</span>
        <span className="dm-tn">{table.schema ? table.schema + '.' + table.label : table.label}</span>
      </div>
      {columns.length > 0 && (
        <div className="dm-cols">
          {columns.map((c) => (
            <div key={c.id} className="dm-col" onClick={() => openDetail(c.id)} title={c.description || ''}>
              <span className="dm-cn">{c.label}</span>
              {c.dataType && <span className="dm-ct">{c.dataType}</span>}
              {c.nullable === false && <span className="dm-nn">NN</span>}
            </div>
          ))}
        </div>
      )}
      {consumers.length > 0 && (
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
      )}
    </div>
  );
}

function ServerBlock({ server, databases }) {
  const { PALETTE, openDetail } = useExplorer();
  const sp = PALETTE.server || PALETTE.invariant;
  const dp = PALETTE.database || PALETTE.invariant;
  return (
    <div className="dm-server">
      <div className="dm-server-head" onClick={() => openDetail(server.id)}>
        <span className="dm-badge" style={{ background: sp.fill, color: sp.text }}>SERVER</span>
        <span className="dm-sname">{server.label}</span>
        {server.host && <span className="dm-host">{server.host}</span>}
        {server.engine && <span className="dm-engine">{server.engine}</span>}
      </div>
      {databases.map(({ node: db, tables }) => (
        <div key={db.id} className="dm-db">
          <div className="dm-db-head" onClick={() => openDetail(db.id)}>
            <span className="dm-badge" style={{ background: dp.fill, color: dp.text }}>DATABASE</span>
            <span className="dm-dname">{db.label}</span>
            {db.ownedBy && <span className="dm-owned">{'owned by ' + db.ownedBy}</span>}
          </div>
          <div className="dm-tables">
            {tables.length === 0 && <div className="dm-empty-sm">no tables recovered for this database yet</div>}
            {tables.map(({ node: t, columns }) => <TableCard key={t.id} table={t} columns={columns} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DataModel() {
  const { model, nodeById, openDetail } = useExplorer();
  const { servers, unattached } = dataModelTree(model, nodeById);
  const dataCount = model.nodes.filter((n) => ['server', 'database', 'table', 'column'].includes(n.type)).length;

  return (
    <div id="datamodel" className="show">
      <div className="dm-head">
        <h2>Data model <span className="count">{dataCount}</span></h2>
        <div className="dm-sub">The storage the code actually touches, recovered from SQL and connection strings. Servers ▸ databases ▸ tables ▸ columns, cross-linked to the behavioral nodes that write and read them. Demand-driven: only the columns a read model or aggregate references appear.</div>
      </div>
      <div className="dm-body">
        {dataCount === 0 && (
          <div className="dm-empty">No data model recovered yet. Run the data-mapping phase (prompts/05-data-mapping.md) to populate servers, tables, columns, and field lineage.</div>
        )}
        {servers.map(({ node: s, databases }) => <ServerBlock key={s.id} server={s} databases={databases} />)}
        {unattached && (unattached.databases.length > 0 || unattached.tables.length > 0) && (
          <div className="dm-server">
            <div className="dm-server-head"><span className="dm-badge dm-unattached">UNATTACHED</span><span className="dm-sname">no server/connection recovered</span></div>
            {unattached.databases.map(({ node: db, tables }) => (
              <div key={db.id} className="dm-db">
                <div className="dm-db-head" onClick={() => openDetail(db.id)}>
                  <span className="dm-badge dm-unattached">DATABASE</span>
                  <span className="dm-dname">{db.label}</span>
                </div>
                <div className="dm-tables">
                  {tables.map(({ node: t, columns }) => <TableCard key={t.id} table={t} columns={columns} />)}
                </div>
              </div>
            ))}
            {unattached.tables.length > 0 && (
              <div className="dm-db">
                <div className="dm-tables">
                  {unattached.tables.map(({ node: t, columns }) => <TableCard key={t.id} table={t} columns={columns} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
