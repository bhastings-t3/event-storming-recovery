// Issue #76: with --allow-remote bound to a wildcard address (0.0.0.0/::), the printed connect
// command must not hand the reader an undialable http://0.0.0.0:PORT/mcp. These test the helpers
// es-view uses to substitute a reachable host. Run: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWildcardBindHost, firstLanIPv4 } from '../dist/node/adapters/cli/es-view.js';

test('isWildcardBindHost: only all-interfaces bind addresses are wildcards', () => {
  assert.equal(isWildcardBindHost('0.0.0.0'), true, '0.0.0.0 is a wildcard');
  assert.equal(isWildcardBindHost('::'), true, ':: is a wildcard');
  assert.equal(isWildcardBindHost('0.0.0.0 '), true, 'surrounding whitespace is tolerated');
  // Reachable/loopback addresses are NOT wildcards: an explicit --host is already dialable.
  assert.equal(isWildcardBindHost('127.0.0.1'), false, 'loopback is not a wildcard');
  assert.equal(isWildcardBindHost('192.168.1.5'), false, 'a concrete LAN address is not a wildcard');
  assert.equal(isWildcardBindHost('localhost'), false, 'localhost is not a wildcard');
});

test('firstLanIPv4: returns a dialable non-internal IPv4, or null', () => {
  const lan = firstLanIPv4();
  if (lan === null) return; // offline / no external interface is a valid outcome
  assert.match(lan, /^\d{1,3}(\.\d{1,3}){3}$/, 'looks like an IPv4 address');
  assert.notEqual(lan, '0.0.0.0', 'never returns the wildcard');
  assert.ok(!lan.startsWith('127.'), 'never returns a loopback address');
});

test('the connect-URL substitution turns a wildcard bind into a dialable URL', () => {
  // Mirrors es-view runView: replace the wildcard host in the bound URL with a detected LAN address.
  const host = '0.0.0.0';
  const url = `http://${host}:5178`;
  const lan = '192.168.1.42';
  const connectUrl = url.replace(`//${host}:`, `//${lan}:`);
  assert.equal(connectUrl, 'http://192.168.1.42:5178', 'the wildcard host is replaced, port preserved');
  assert.ok(!connectUrl.includes('0.0.0.0'), 'the undialable bind address is gone from the connect URL');
});
