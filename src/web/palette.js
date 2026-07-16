// Re-export the shared palette (single source of truth in src/lib/palette.mjs), so the SPA and
// the server render identical colors.
export { PALETTE } from '../lib/palette.mjs';
