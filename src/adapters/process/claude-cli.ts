// Run `claude mcp add` on the user's behalf so the UI can wire this app into their Claude terminal
// with one click. The es-view server already runs as the user with their PATH, so this is exactly
// the command they'd type themselves — no new privilege.
//
// We pass arguments as an ARRAY via execFile, never as an interpolated shell string, so there is no
// shell metacharacter surface even if a value ever became user-controlled. Every part is controlled
// today (fixed subcommands, the app's own localhost URL, a whitelisted scope), so this is defence in
// depth. On Windows `claude` is a `.cmd` shim, which execFile cannot launch directly (and, since
// CVE-2024-27980, will not without a shell), so there we invoke it through `cmd.exe /d /s /c` with the
// args still passed as an array — not a hand-built string. We avoid execFile(..., { shell: true })
// because Node deprecates it (DEP0190): under a shell it would not escape the array args.
import { execFile } from 'node:child_process';
import type { ClaudeCliGateway, ClaudeCliResult } from '../../application/ports.js';

const SCOPES = new Set(['local', 'project', 'user']);

export function claudeMcpAdd({ name, url, scope }: { name: string; url: string; scope?: string }): Promise<ClaudeCliResult> {
  const args = ['mcp', 'add', '--transport', 'http', name, url];
  if (scope && SCOPES.has(scope)) args.push('--scope', scope);

  const isWindows = process.platform === 'win32';
  const file = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'claude';
  const execArgs = isWindows ? ['/d', '/s', '/c', 'claude', ...args] : args;
  // Human-readable record of what ran (for the UI / logs); not the executed string.
  const command = `claude ${args.join(' ')}`;

  return new Promise((resolve) => {
    execFile(file, execArgs, { timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      const out = (stdout || '').toString();
      const errOut = (stderr || '').toString();
      const notFound = !!(err && ((err as NodeJS.ErrnoException).code === 'ENOENT' || /not recognized|not found|command not found/i.test(errOut)));
      resolve({ ok: !err, command, stdout: out, stderr: errOut, notFound });
    });
  });
}

export const claudeCliGateway: ClaudeCliGateway = { add: claudeMcpAdd };
