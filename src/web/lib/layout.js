// The SPA's view onto the shared flow-board geometry engine (src/web/lib/flow-geometry.js), which
// the live React explorer and the static generated explorer now BOTH import (issue #42 / ADR-0008).
// renderFlowInto is used as-is; setupPanZoom is wrapped to inject the SPA's extended pan-exclusion
// selectors (`.dm-node`, `.dm-badge-circle`, `.board-views`) — DOM the static explorer doesn't have —
// so Board/Overview/DataModel keep calling setupPanZoom(wrap, lane, ids) unchanged. Zero behaviour
// change: the SPA still excludes exactly what it did, the static side (which passes no override) keeps
// the behavioural base set. React mounts the engine via a ref; it renders by direct DOM construction.
import { renderFlowInto, setupPanZoom as setupPanZoomShared } from './flow-geometry.js';

export { renderFlowInto };

// SPA-only interactive surfaces a background pan must not start on, in addition to the behavioural
// base set the shared engine already excludes: the data-model board nodes/badges and the Flow/Data
// board toggle. The static explorer's DOM has none of these, which is why they live here, not shared.
const SPA_PAN_IGNORE = '.sticky, .inv, .dupdot, .zoomctl, .ctx-title, .dm-node, .dm-badge-circle, .board-views';

export function setupPanZoom(wrap, lane, ids) {
  return setupPanZoomShared(wrap, lane, ids, SPA_PAN_IGNORE);
}
