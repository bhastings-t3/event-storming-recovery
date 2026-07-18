# actors-systems-config — glossary mining notes

Area: the SPECIFIC actor roles, external systems, and packaging/config vocabulary of THIS tool.
15 terms, all `status: resolved` (nothing needed flagging — every candidate pinned down cleanly
from the model descriptions + code). Method-owned generic concepts (Actor, External System as ES
stickies) were deliberately NOT redefined here; I define the concrete actors/systems/config of this
tool only.

## The three Claude entities (disambiguated on purpose)
The candidate list warned these get conflated. Each is its own term:
- **Connected Claude session** (`term-asc-connected-claude` -> `actor-claude`): the session AS AN
  ACTOR that issues MCP reads and does the refactor work in its own session.
- **Claude MCP client** (`term-asc-claude-mcp-client` -> `ext-claude-mcp-client`): the Claude
  PROCESS across the streamable-HTTP transport boundary that POSTs /mcp. Explicitly separated in the
  definition from the in-process @modelcontextprotocol/sdk LIBRARY (which is NOT an external system).
- **Claude Code CLI** (`term-asc-claude-cli` -> `ext-claude-cli`): the `claude` COMMAND shelled out
  to `claude mcp add` to register the server. A registration-time tool, not the read-time client.
Each definition cross-references the other two so a reader can't confuse them.

## relatedNodes decisions
- All `relatedNodes` resolve against `nodes[]` node ids only (per pilot tuning). Verified present:
  actor-operator, actor-viewer, actor-claude, ext-claude-cli, ext-claude-mcp-client, ext-source-fs,
  ext-browser, ext-editor, cmd-register-mcp.
- `VS Code deep link` (jargon) is linked to `ext-editor` (the editor system it hands off to) rather
  than minting a separate editor term — kept curated.
- `REPO_ROOT/repoRoot`, `scope`, and `sandbox/path-escape guard` are jargon that map onto a
  correspondence but not a single sticky; I linked the two data-relevant ones (repo-root, sandbox)
  to `ext-source-fs` (the filesystem they govern) and `scope` to `cmd-register-mcp` (the write it
  parameterizes), since those are clean node correspondences. plugin/marketplace/skill/npx-bin have
  NO node correspondence (pure packaging jargon) so `relatedNodes` is omitted, as instructed.

## Category calls (possible friction)
- **scope** categorized as `jargon`. The candidate list flagged it `[state/jargon]`. Its three
  values (local/project/user) form a closed enum like a state, but it is a config/registration
  concept, not a lifecycle status of any node, so `jargon` reads truer. Low-stakes; flag if the
  orchestrator prefers `state`.
- **VS Code deep link** categorized as `jargon` (a URL-scheme mechanism) rather than `system`; the
  SYSTEM it targets (`ext-editor`) is captured via `relatedNodes`. Candidate list allowed
  `[jargon/system]`.
- Roles (Operator/Viewer/Connected Claude) -> `role`; external tools/systems -> `system`; packaging
  and file-stance vocabulary -> `jargon`. No `acronym`/`metric`/`concept`/`state` terms in this area.

## Cross-area overlaps to de-dupe (orchestrator: keep the best single definition)
- **MCP / MCP server / MCP resource / tools (list_model, get_current_selection, selected-nodes)** —
  I reference these but do NOT define them; they belong to the MCP-bridge / method area. `scope`,
  `Claude MCP client`, and `Claude Code CLI` here touch MCP but define the ACTORS/SYSTEMS, not the
  protocol. Ensure the MCP-owning area defines "MCP" itself.
- **flows.json / the Model / trace / merge / generate / selection / context bundle** — owned by the
  pipeline/model areas. My `npx-bin` term names es-merge/es-generate as ENTRY POINTS but leaves the
  MergeTraces/GenerateViews command semantics to those areas.
- **REPO_ROOT/repoRoot** — could plausibly be claimed by a data-model or grounding area. I define it
  from the config/anchor-resolution stance (where it comes from, that it is the TARGET checkout not
  this repo). If another area also defines it, keep this one's "not the tool's own repo" caveat.
- Two sibling glossary files already exist in TRACES_DIR: `es-method.glossary.json` and
  `data-model.glossary.json`. I did not inspect their term ids; if any id or term string collides
  the merge will surface it — my ids are all prefixed `term-asc-` to avoid id collisions.

## Observations surfaced while mining (not terms)
- The plugin declares the MCP URL pinned to port **5178**, but es-view **falls forward** if 5178 is
  taken (`--port` default 5178, "falls forward if taken"). If the app lands on another port, the
  plugin-declared client would target the wrong URL. This is a real config tension but a hotspot/
  question, not a vocabulary term, so it is not in the glossary.
- `rm-mcp-connect-command` note in the model records a cosmetic drift: the `/api/mcp/info` command
  omits `--scope` and doesn't quote the URL, unlike the string the register write actually builds.

## Schema friction
None. The Term schema fit every entry cleanly; all terms are resolved with definitions + anchors,
all relatedNodes resolve, ids unique.
