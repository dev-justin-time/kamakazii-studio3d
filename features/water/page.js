/**
 * Water — Water plane, ocean simulation with waves, foam, reflections
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'water-type', type: 'select', label: 'Water Type', default: '', options: [{"value":"calm","label":"Calm Lake"},{"value":"ocean","label":"Ocean Waves"},{"value":"river","label":"River Flow"},{"value":"pool","label":"Reflection Pool"}] },
    { key: 'water-scale', type: 'slider', label: 'Scale', min: 1, max: 100, step: 1, default: 20 },
    { key: 'water-height', type: 'slider', label: 'Height', min: -5, max: 5, step: 0.1, default: 0 },
    { key: 'water-wave-height', type: 'slider', label: 'Wave Height', min: 0, max: 2, step: 0.01, default: 0.3 },
    { key: 'water-speed', type: 'slider', label: 'Wave Speed', min: 0, max: 3, step: 0.1, default: 1 },
    { key: 'water-animate', type: 'toggle', label: 'Animate Waves', default: true },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'add-water', type: 'button', label: 'Add Water Plane', onClick: 'logAddWater' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
