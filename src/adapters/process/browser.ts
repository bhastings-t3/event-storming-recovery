// Open a URL in the user's default browser, cross-platform. Best-effort; never throws, never crashes.
import { spawn } from 'node:child_process';
import type { BrowserGateway } from '../../application/ports.js';

export function openBrowser(url: string): void {
  // Guidance printed when the opener is missing: the server keeps serving, so tell the reader how to
  // reach it by hand. The URL is already in the banner; this line names the failure explicitly.
  const fallback = () => console.error(`  Couldn't open a browser automatically — open ${url}`);
  try {
    const platform = process.platform;
    let child;
    if (platform === 'win32') {
      // `start` is a cmd builtin; the empty "" is the (required) window title arg.
      child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    } else if (platform === 'darwin') {
      child = spawn('open', [url], { stdio: 'ignore', detached: true });
    } else {
      child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    }
    // A missing opener (no xdg-open/open/start — containers, WSL, remote/SSH, CI) surfaces as an async
    // 'error' event, NOT a synchronous throw. Left unhandled it propagates as an uncaught error and
    // kills the whole `view` process, taking the SPA + API + MCP server down with it (issue #71). Opening
    // a browser is a convenience; catching it here keeps the server up when there is nothing to open.
    child.once('error', fallback);
    child.unref();
  } catch {
    // Some platforms can also throw synchronously (e.g. an invalid argv); same best-effort degrade.
    fallback();
  }
}

export const browserGateway: BrowserGateway = { open: openBrowser };
