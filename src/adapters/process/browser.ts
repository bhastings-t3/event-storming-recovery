// Open a URL in the user's default browser, cross-platform. Best-effort; never throws.
import { spawn } from 'node:child_process';
import type { BrowserGateway } from '../../application/ports.js';

export function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      // `start` is a cmd builtin; the empty "" is the (required) window title arg.
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    /* opening is a convenience; the URL is always printed too */
  }
}

export const browserGateway: BrowserGateway = { open: openBrowser };
