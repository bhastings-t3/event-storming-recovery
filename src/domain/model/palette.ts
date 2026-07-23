// Event-storming palette (single source of truth). Each sticky's TEXT is a darker tone of its OWN
// fill hue so the label reads as part of the card. Ported from generate-views.js. Imported by both
// the Node server and the Vite SPA (src/web/palette.js mirrors these values for the built explorer).
export interface PaletteEntry {
  fill: string;
  edge: string;
  text: string;
  name: string;
}

export const PALETTE: Record<string, PaletteEntry> = {
  event:          { fill: '#E9A23B', edge: '#a56a14', text: '#4a2c02', name: 'Domain Event' },
  command:        { fill: '#6BA3E8', edge: '#2f68b0', text: '#123252', name: 'Command' },
  actor:          { fill: '#D2A63A', edge: '#98741a', text: '#432f03', name: 'Actor' },
  aggregate:      { fill: '#E3D68A', edge: '#a89a4a', text: '#4c4212', name: 'Aggregate' },
  policy:         { fill: '#BF9BE0', edge: '#8058b0', text: '#3a2160', name: 'Policy' },
  readModel:      { fill: '#6FC993', edge: '#358a5a', text: '#124a2c', name: 'Read Model' },
  externalSystem: { fill: '#E68DAF', edge: '#b05378', text: '#59213b', name: 'External System' },
  invariant:      { fill: '#26262e', edge: '#42424e', text: '#b7b7c2', name: 'Invariant' },
  datastore:      { fill: '#6f92b3', edge: '#3f5a76', text: '#16293c', name: 'Data store' },
  field:          { fill: '#c3d3e2', edge: '#7f96ab', text: '#2c3e50', name: 'Field' },
  hotspot:        { fill: '#E5645E', edge: '#a83530', text: '#4c110e', name: 'Hotspot' },
};

// Colors for the behavioral -> storage RELATIONSHIP verbs (data-model footer pills + Detail groups).
// One consistent color per verb so the same relationship reads the same everywhere.
export const VERB_COLORS: Record<string, string> = {
  'writes':        '#E5645E',
  'persists to':   '#6FC993',
  'projects from': '#6BA3E8',
  'reads':         '#BF9BE0',
  'connects via':  '#8a8a96',
  _default:        '#8a8a96',
};
