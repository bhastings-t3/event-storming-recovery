// Run `claude mcp add` on the user's behalf so the UI can wire this app into their Claude
// terminal with one click. The es-view server already runs as the user with their PATH, so this
// is exactly the command they'd type themselves — no new privilege.
//
// We build one command string and run it via `exec` (a shell, so a Windows `claude.cmd` shim
// resolves). We deliberately do NOT use execFile(args, { shell: true }) — Node 24 deprecates that
// (DEP0190) because array args aren't escaped. Here every part is controlled: fixed subcommands,
// the app's own localhost URL (quoted), and a whitelisted scope — nothing user-injectable.
import { exec } from 'node:child_process';

const SCOPES = new Set(['local', 'project', 'user']);

export function claudeMcpAdd({ name, url, scope }) {
  const scopeArg = SCOPES.has(scope) ? ` --scope ${scope}` : '';
  const command = `claude mcp add --transport http ${name} "${url}"${scopeArg}`;
  return new Promise((resolve) => {
    exec(command, { timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      const out = (stdout || '').toString();
      const errOut = (stderr || '').toString();
      const notFound = !!(err && (err.code === 'ENOENT' || /not recognized|not found|command not found/i.test(errOut)));
      resolve({ ok: !err, command, stdout: out, stderr: errOut, notFound });
    });
  });
}
