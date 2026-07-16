import React, { useEffect, useState } from 'react';
import { getMcpInfo, registerMcp } from '../api.js';

const SCOPES = [
  ['local', 'this project'],
  ['project', 'shared (.mcp.json)'],
  ['user', 'all my projects'],
];

// One-click "add this app as an MCP server to my Claude terminal". Runs `claude mcp add` on the
// server (which is running as the user) and reports the result. Shows the equivalent command too.
export default function ConnectClaude() {
  const [info, setInfo] = useState(null);
  const [scope, setScope] = useState('local');
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [msg, setMsg] = useState('');

  useEffect(() => { getMcpInfo().then(setInfo).catch(() => {}); }, []);

  const add = async () => {
    setStatus('running'); setMsg('');
    try {
      const r = await registerMcp(scope);
      if (r.ok) {
        setStatus('done');
        setMsg(`Added as “${(info && info.name) || 'event-storming'}”. In Claude, run /mcp (restart it if it was already open), then click a node and ask “explain the selected node”.`);
      } else if (r.notFound) {
        setStatus('error');
        setMsg('The `claude` CLI wasn’t found on PATH. Install Claude Code, or copy the command below and run it yourself.');
      } else {
        setStatus('error');
        setMsg((r.stderr || r.stdout || 'Command failed.').trim().slice(0, 400));
      }
    } catch {
      setStatus('error');
      setMsg('Request failed — is the app still running?');
    }
  };

  return (
    <div className="connect">
      <div className="connect-title">Connect your Claude terminal</div>
      <div className="connect-desc">Register this app as an MCP server so a Claude session can read your selection and bundle.</div>
      <div className="connect-row">
        <select className="connect-scope" value={scope} onChange={(e) => setScope(e.target.value)} title="Where to register the MCP server">
          {SCOPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button className="btn-primary" disabled={status === 'running'} onClick={add}>
          {status === 'running' ? 'Adding…' : status === 'done' ? 'Added ✓' : 'Add to Claude'}
        </button>
      </div>
      {msg && <div className={'connect-result ' + (status === 'error' ? 'err' : 'ok')}>{msg}</div>}
      {info && info.command && <div className="connect-cmd" title="the equivalent CLI command">{info.command}</div>}
    </div>
  );
}
