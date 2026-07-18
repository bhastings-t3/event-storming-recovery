// Event-storming palette (single source of truth). ESM so both the Node server and the Vite
// SPA can import it. Each sticky's TEXT is a darker tone of its OWN fill hue so the label reads
// as part of the card. Ported from generate-views.js.
export const PALETTE = {
  event:          { fill: '#E9A23B', edge: '#a56a14', text: '#4a2c02', name: 'Domain Event' },
  command:        { fill: '#6BA3E8', edge: '#2f68b0', text: '#123252', name: 'Command' },
  actor:          { fill: '#D2A63A', edge: '#98741a', text: '#432f03', name: 'Actor' },
  aggregate:      { fill: '#E3D68A', edge: '#a89a4a', text: '#4c4212', name: 'Aggregate' },
  policy:         { fill: '#BF9BE0', edge: '#8058b0', text: '#3a2160', name: 'Policy' },
  readModel:      { fill: '#6FC993', edge: '#358a5a', text: '#124a2c', name: 'Read Model' },
  externalSystem: { fill: '#E68DAF', edge: '#b05378', text: '#59213b', name: 'External System' },
  invariant:      { fill: '#26262e', edge: '#42424e', text: '#b7b7c2', name: 'Invariant' },
  server:         { fill: '#2b323c', edge: '#464f5d', text: '#a5b2c4', name: 'Server' },
  database:       { fill: '#3c4a5a', edge: '#5a6d84', text: '#b6c4d6', name: 'Database' },
  table:          { fill: '#6f92b3', edge: '#3f5a76', text: '#16293c', name: 'Table' },
  column:         { fill: '#c3d3e2', edge: '#7f96ab', text: '#2c3e50', name: 'Column' },
  hotspot:        { fill: '#E5645E', edge: '#a83530', text: '#4c110e', name: 'Hotspot' },
};
