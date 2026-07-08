/**
 * Sky — Skybox, procedural atmosphere, HDRI environment maps, sun position
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'sky-type', type: 'select', label: 'Sky Type', default: '', options: [{"value":"procedural","label":"Procedural Atmosphere"},{"value":"hdri","label":"HDRI Environment"},{"value":"solid","label":"Solid Color"},{"value":"gradient","label":"Gradient"}] },
    { key: 'sky-color', type: 'color', label: 'Sky Color', default: '#1a1a2e' },
    { key: 'sky-turbidity', type: 'slider', label: 'Turbidity', min: 0, max: 10, step: 0.1, default: 2 },
    { key: 'sky-sun', type: 'slider', label: 'Sun Intensity', min: 0, max: 5, step: 0.1, default: 1 },
    { key: 'sky-elevation', type: 'slider', label: 'Sun Elevation (°)', min: 0, max: 90, step: 1, default: 45 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-sky', type: 'button', label: 'Apply Sky', onClick: 'logSky' },
    { key: 'import-hdri', type: 'button', label: 'Import HDRI', onClick: 'logHDRI' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
