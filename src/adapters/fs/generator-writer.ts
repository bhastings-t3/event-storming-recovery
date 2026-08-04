// Persist the generated views (flows.dot + explorer.html) to an output directory. The DOT/HTML are
// built by the pure GenerateViews command; this adapter just writes the strings.
import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedViews } from '../../application/commands/generate-views.js';

export function writeViews(outDir: string, views: GeneratedViews): void {
  // Ensure outDir exists before opening the files. recursive makes nested paths work and is
  // idempotent, so writing into an already-present dir is unchanged (issue #50).
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'flows.dot'), views.dot);
  fs.writeFileSync(path.join(outDir, 'explorer.html'), views.html);
}
