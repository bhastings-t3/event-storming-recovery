// Golden-output guard for the generate-views split (issue #21, Target 2 / slice 21-C).
//
// generate-views.ts renders two deterministic views from a canonical model — flows.dot and the
// self-contained explorer.html (which embeds ~1,100 lines of client JS as a template string). 21-C
// mechanically splits that god module and MUST NOT change a byte of output. This test pins the
// current output against committed golden fixtures so the split is provably behaviour-preserving:
// regenerate over a small, fixed fixture model and compare byte-for-byte.
//
// Determinism: renderDot/renderHtml are pure string builders (the module header promises "no fs, no
// timestamps/random") — no Date, no Math.random, and every iteration order is fixed by the model's
// array order. The ONE machine-dependent value is repoRoot: generateViews() runs it through
// path.resolve(), which prepends the current DRIVE on Windows (C:/x) but not on POSIX (/x), so its
// full output is NOT byte-stable across OS. We therefore pin the pure builders with a fixed,
// already-absolute POSIX root (path.resolve is bypassed, so the bytes are identical on Windows and
// Linux), and separately assert generateViews() is a faithful composition of them (below). See the
// PR body for the full rationale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateViews,
  renderDot,
  renderHtml,
} from '../dist/node/application/commands/generate-views.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures', 'generate-views-golden');

// Fixed inputs. The golden files were generated from these exact values on `main`.
const GOLDEN_REPO_ROOT = '/golden/repo-root';
const GOLDEN_TITLE = 'Golden Fixture Explorer';

const model = JSON.parse(readFileSync(path.join(fixtureDir, 'model.json'), 'utf8'));
const goldenDot = readFileSync(path.join(fixtureDir, 'flows.dot'), 'utf8');
const goldenHtml = readFileSync(path.join(fixtureDir, 'explorer.html'), 'utf8');

// toUriRoot as generateViews applies it: normalize separators, trim trailing slashes.
const toUriRoot = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');

// Point at the first byte that differs, with a little context, so a future accidental diff is
// debuggable from the CI log alone instead of eyeballing a 100 KB blob.
function assertByteIdentical(actual, expected, which) {
  if (actual === expected) return;
  const min = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < min && actual[i] === expected[i]) i++;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  assert.fail(
    `${which} is NOT byte-identical to its golden fixture.\n` +
      `  lengths: actual=${actual.length} golden=${expected.length}\n` +
      `  first difference at offset ${i}\n` +
      `  actual near offset: ${ctx(actual)}\n` +
      `  golden near offset: ${ctx(expected)}\n` +
      `If this change to generate-views output is intentional, regenerate the goldens; ` +
      `if it is the 21-C split, it must NOT change output — this is the guard catching a regression.`
  );
}

test('generate-views golden: flows.dot is byte-identical to the committed fixture', () => {
  const dot = renderDot(model, GOLDEN_REPO_ROOT);
  assertByteIdentical(dot, goldenDot, 'flows.dot');
});

test('generate-views golden: explorer.html is byte-identical to the committed fixture', () => {
  const html = renderHtml(model, GOLDEN_REPO_ROOT, GOLDEN_TITLE);
  assertByteIdentical(html, goldenHtml, 'explorer.html');
});

// generateViews() is the public composition point 21-C keeps. Prove it is exactly renderDot +
// renderHtml wired with the resolved root and the given title, so the golden guard (over the pure
// builders) transitively covers the public entry too. This assertion is OS-independent: both sides
// resolve the same root. On POSIX, path.resolve leaves the leading-slash root untouched, so
// generateViews output is *also* byte-identical to the committed goldens (asserted below); on
// Windows path.resolve prepends the drive, which is exactly why the goldens pin the pure builders.
test('generate-views golden: generateViews() faithfully composes the pinned builders', () => {
  const resolvedRoot = toUriRoot(path.resolve(GOLDEN_REPO_ROOT));
  const { dot, html } = generateViews(model, { repoRoot: GOLDEN_REPO_ROOT, title: GOLDEN_TITLE });

  assert.equal(dot, renderDot(model, resolvedRoot), 'generateViews.dot must equal renderDot(model, resolvedRoot)');
  assert.equal(
    html,
    renderHtml(model, resolvedRoot, GOLDEN_TITLE),
    'generateViews.html must equal renderHtml(model, resolvedRoot, title)'
  );

  // Where path.resolve is a no-op (POSIX / Linux CI), generateViews output is the committed golden,
  // byte-for-byte — the literal public-surface guard for the split.
  if (resolvedRoot === GOLDEN_REPO_ROOT) {
    assertByteIdentical(dot, goldenDot, 'generateViews().dot');
    assertByteIdentical(html, goldenHtml, 'generateViews().html');
  }
});
