// Run `claude mcp add` on the user's behalf so the UI can wire this app into their Claude
// terminal with one click. The es-view server already runs as the user with their PATH, so this
// is exactly the command they'd type themselves — no new privilege. Args are fixed except the
// app's own localhost URL and a whitelisted scope, so there's nothing user-injectable here.
import { execFile } from 'node:child_process';

export function claudeMcpAdd({ name, url, scope }) {
  const args = ['mcp', 'add', '--transport', 'http', name, url];
  if (scope) args.push('--scope', scope);
  const command = 'claude ' + args.join(' ');
  const opts = { timeout: 20000, windowsHide: true };
  // On Windows the `claude` binary is usually a .cmd shim; a shell lets PATHEXT resolve it.
  if (process.platform === 'win32') opts.shell = true;
  return new Promise((resolve) => {
    execFile('claude', args, opts, (err, stdout, stderr) => {
      const out = (stdout || '').toString();
      const errOut = (stderr || '').toString();
      const notFound = !!(err && (err.code === 'ENOENT' || /not recognized|not found|command not found/i.test(errOut)));
      resolve({ ok: !err, command, stdout: out, stderr: errOut, notFound });
    });
  });
}
