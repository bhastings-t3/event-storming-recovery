# 2. es-view is loopback-only, with an explicit opt-in for remote binding

Date: 2026-08-04

## Status

Accepted

## Context

The `es-view` local server has no authentication: it runs as the user, for a
single local human, and its endpoints change host state (`claude mcp add`) and
read source. Any browser page on the machine, or a DNS-rebinding attack, could
drive those endpoints while es-view runs (issue #7).

## Decision

Treat es-view as a **loopback-only** tool. A single guard at the top of the HTTP
handler rejects (403) the state-changing routes and `GET /api/source` unless the
request has a loopback `Host` (the DNS-rebinding backstop) and, when present, a
loopback `Origin` (the cross-origin/CSRF backstop); a missing `Origin` is allowed
because some browsers omit it on same-origin requests. Reads the connect-flow
needs (`/api/health`, `/api/model`, `/api/item`, `/api/mcp/info`, the static SPA)
stay open, and `/api/source` is additionally scoped to the model's anchor paths
with a `realpathSync` check so only files the model actually references are
readable. A non-loopback `--host` is **refused** unless the operator passes the
explicit `--allow-remote` opt-in, which disables the loopback guard and prints a
visible stdout warning; the shell-out to `claude mcp add` uses `execFile` with an
argument array (never an interpolated shell string) so there is no injection
surface.

## Consequences

- The served SPA is same-origin loopback, so it always passes the guard; the guard
  is invisible to normal use and only blocks cross-origin/rebinding callers.
- `--allow-remote` is an all-or-nothing escape hatch: it turns the loopback guard
  off entirely rather than trying to define "same-origin" across arbitrary bind
  addresses. A token/auth scheme is deliberately out of scope until a real
  multi-user need appears.
- On Windows `claude` is a `.cmd` shim that `execFile` cannot launch directly, so
  there it is invoked through `cmd.exe /d /s /c` with the args still passed as an
  array; the residual cmd re-parsing is bounded because every argument is a
  constant or whitelisted value.
