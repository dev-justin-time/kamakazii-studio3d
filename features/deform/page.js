/**
 * Deform — Lattice, bend, twist, taper, stretch, shear deform modifiers
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'deform-type', type: 'select', label: 'Deform Type', default: '', options: [{"value":"bend","label":"Bend"},{"value":"twist","label":"Twist"},{"value":"taper","label":"Taper"},{"value":"stretch","label":"Stretch"},{"value":"shear","label":"Shear"}] },
    { key: 'deform-axis', type: 'select', label: 'Axis', default: '', options: [{"value":"x","label":"X"},{"value":"y","label":"Y"},{"value":"z","label":"Z"}] },
    { key: 'deform-amount', type: 'slider', label: 'Amount', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'deform-limits', type: 'toggle', label: 'Limit to Selection', default: true },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-deform', type: 'button', label: 'Apply Deform', onClick: 'logDeform' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
