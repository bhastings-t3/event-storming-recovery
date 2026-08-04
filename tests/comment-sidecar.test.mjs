// Tests for the fs comment-repository adapter (issue #9): the write is atomic, its durability is
// observable, and a corrupt sidecar on load is surfaced rather than silently discarded. These drive
// the real adapter against real temp directories; only os.tmpdir() scratch here is a test artifact —
// the adapter's own atomic temp always lives beside the target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createCommentStore } from '../dist/node/adapters/fs/comment-repository.js';

function scratchDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'es-comments-'));
}

test('persist: a writable location writes valid JSON beside the model, reports persisted, leaves no temp', () => {
  const dir = scratchDir();
  const file = path.join(dir, 'comments.json');
  const { store, persistence } = createCommentStore(file);

  store.add('node', 'agg-Order', 'looks right');

  assert.equal(persistence.status().persisted, true);
  assert.ok(fs.existsSync(file), 'comments.json exists beside the model');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')); // must be valid JSON, not truncated
  assert.deepEqual(doc.comments['node:agg-Order'].map((c) => c.text), ['looks right']);
  // the atomic temp sibling must have been renamed away, not left behind
  const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.tmp-'));
  assert.deepEqual(leftovers, [], 'no leftover temp file');
});

test('persist: a subsequent write atomically replaces the prior file with complete content', () => {
  const dir = scratchDir();
  const file = path.join(dir, 'comments.json');
  const first = createCommentStore(file);
  first.store.add('flow', 'flow-checkout', 'first');

  // A fresh store loads the prior file, then appends and rewrites.
  const second = createCommentStore(file);
  assert.deepEqual(second.store.get('flow', 'flow-checkout').map((c) => c.text), ['first']);
  second.store.add('flow', 'flow-checkout', 'second');

  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(doc.comments['flow:flow-checkout'].map((c) => c.text), ['first', 'second']);
});

test('persist: an unwritable location keeps comments in memory and reports persisted:false with a reason', () => {
  const dir = scratchDir();
  // Parent directory does not exist, so the write (of the temp sibling) fails — stands in for a
  // read-only install/example dir. No file must be created at the target.
  const file = path.join(dir, 'missing-subdir', 'comments.json');
  const { store, persistence } = createCommentStore(file);

  store.add('node', 'agg-Order', 'memory only');

  const status = persistence.status();
  assert.equal(status.persisted, false);
  assert.equal(typeof status.reason, 'string');
  assert.ok(status.reason.length > 0);
  // the comment still lives in memory for the session
  assert.deepEqual(store.get('node', 'agg-Order').map((c) => c.text), ['memory only']);
  assert.equal(fs.existsSync(file), false, 'no partial file written at the target');
});

test('load: a corrupt sidecar does not crash, starts empty, and leaves the bad file untouched', () => {
  const dir = scratchDir();
  const file = path.join(dir, 'comments.json');
  fs.writeFileSync(file, '{'); // corrupt JSON

  const { store } = createCommentStore(file); // must not throw
  assert.deepEqual(store.all(), {}, 'starts empty rather than silently guessing');
  assert.equal(fs.readFileSync(file, 'utf8'), '{', 'the corrupt file is left on disk for recovery');
});

test('persist with no path configured reports memory-only', () => {
  const { store, persistence } = createCommentStore(undefined);
  store.add('node', 'agg-Order', 'ephemeral');
  assert.equal(persistence.status().persisted, false);
});
