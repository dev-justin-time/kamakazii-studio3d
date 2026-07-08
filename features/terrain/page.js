/**
 * Terrain — Heightmap terrain editor — sculpt, paint, generate erosion, import heightmaps
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'terrain-size', type: 'number', label: 'Terrain Size', default: 64 },
    { key: 'terrain-res', type: 'select', label: 'Resolution', default: '', options: [{"value":"32","label":"32×32"},{"value":"64","label":"64×64"},{"value":"128","label":"128×128"},{"value":"256","label":"256×256"}] },
    { key: 'terrain-gen', type: 'select', label: 'Generation', default: '', options: [{"value":"flat","label":"Flat"},{"value":"hills","label":"Rolling Hills"},{"value":"mountains","label":"Mountains"},{"value":"canyon","label":"Canyon"},{"value":"island","label":"Island"}] },
    { key: 'terrain-seed', type: 'number', label: 'Seed', default: 0 },
    { key: 'terrain-elevation', type: 'slider', label: 'Max Elevation', min: 1, max: 20, step: 0.5, default: 5 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'gen-terrain', type: 'button', label: 'Generate Terrain', onClick: 'generateWireframeValley' },
    { key: 'export-heightmap', type: 'button', label: 'Export Heightmap', onClick: 'logExportHeightmap' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
