// Mechanical ports-and-adapters boundary check (issue #21, refactor Target 1).
//
// The dependency rule (AGENTS.md "Architecture: ports and adapters",
// docs/refactor/refactor-targets.md Target 1): `src/domain` and `src/application`
// must NEVER import from `src/adapters` or `src/web`. It was convention-only —
// a review responsibility (review.md Lens 3) with nothing to enforce it. This
// test locks the property in so a single accidental inward import can't rot the
// layering silently in a future PR.
//
// It statically scans the .ts source (not the build): for every `import`/`export
// ... from '<spec>'`, side-effect `import '<spec>'`, and inline `import('<spec>')`
// type import under the two guarded roots, it resolves relative specifiers against
// the importing file's directory and fails if the target lands inside
// src/adapters/ or src/web/. `node:*` builtins and bare package specifiers are
// pure/allowed and ignored (only relative specifiers can cross the seam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testsDir, '..', 'src');

// Only these two layers are guarded. adapters/ and web/ are ALLOWED to import
// inward, so they are never scanned as sources — only as forbidden targets.
const GUARDED_ROOTS = ['domain', 'application'].map((d) => path.join(srcDir, d));
const FORBIDDEN_ROOTS = ['adapters', 'web'].map((d) => path.join(srcDir, d));

/** Recursively collect every TypeScript source file under `root`. */
function collectTsFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|mts|cts)$/.test(e.name))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

// Module-specifier forms. Each captures the specifier string in group 1. The
// `(?<![.\w])` lookbehind keeps property accesses like `edge.from '...'` from
// masquerading as a re-export, and matching `from` globally (not just on lines
// starting with import/export) is what handles multi-line imports, whose
// `} from './x.js'` tail sits on its own line.
const SPECIFIER_PATTERNS = [
  /(?<![.\w])from\s*['"]([^'"]+)['"]/g, //          import/export ... from 'spec'
  /(?<![.\w])import\s*['"]([^'"]+)['"]/g, //        side-effect  import 'spec'
  /(?<![.\w])import\s*\(\s*['"]([^'"]+)['"]/g, //   dynamic/type import('spec')
];

/** Extract every module specifier referenced by a source file's text. */
function extractSpecifiers(text) {
  const specs = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const m of text.matchAll(pattern)) specs.push(m[1]);
  }
  return specs;
}

/** True if `resolvedAbs` lives inside `root` (a directory). */
function isInside(root, resolvedAbs) {
  const rel = path.relative(root, resolvedAbs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

test('domain and application never import from adapters or web (ports-and-adapters boundary)', () => {
  const files = GUARDED_ROOTS.flatMap(collectTsFiles);

  // Guard the guard: if the scan finds nothing to scan, it would pass vacuously.
  assert.ok(files.length > 0, `no .ts sources found under ${GUARDED_ROOTS.join(', ')} — scan is broken`);

  const violations = [];
  let relativeSpecifiersSeen = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const spec of extractSpecifiers(text)) {
      if (!spec.startsWith('.')) continue; // node:* builtins and bare packages can't cross the seam
      relativeSpecifiersSeen += 1;
      const resolved = path.resolve(path.dirname(file), spec);
      for (const forbidden of FORBIDDEN_ROOTS) {
        if (isInside(forbidden, resolved)) {
          const layer = path.basename(forbidden);
          violations.push(
            `${path.relative(srcDir, file)} imports '${spec}' -> crosses into src/${layer}/ ` +
              `(domain/application must not depend on ${layer})`,
          );
        }
      }
    }
  }

  // Guard the guard: the parser must actually be resolving relative imports.
  // These layers have many; zero would mean the specifier regexes silently broke.
  assert.ok(
    relativeSpecifiersSeen > 10,
    `only ${relativeSpecifiersSeen} relative specifiers parsed across ${files.length} files — the import scan is likely broken`,
  );

  assert.equal(
    violations.length,
    0,
    `ports-and-adapters boundary violated (${violations.length}):\n  ${violations.join('\n  ')}`,
  );
});
