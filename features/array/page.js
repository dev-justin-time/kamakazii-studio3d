/**
 * Array — Linear, radial, and wave array modifiers with offset/animation
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'array-type', type: 'select', label: 'Array Type', default: '', options: [{"value":"linear","label":"Linear"},{"value":"radial","label":"Radial"},{"value":"grid","label":"2D Grid"},{"value":"wave","label":"Wave"}] },
    { key: 'array-count', type: 'number', label: 'Count', default: 5 },
    { key: 'array-offset', type: 'slider', label: 'Offset', min: 0.1, max: 5, step: 0.1, default: 1.5 },
    { key: 'array-animate', type: 'toggle', label: 'Animate Array', default: false },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-array', type: 'button', label: 'Add Instance', onClick: 'addPrimitive_cube' },
    { key: 'clear-array', type: 'button', label: 'Clear', onClick: 'deleteSelected' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
