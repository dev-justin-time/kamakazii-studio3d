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
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "deform";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "deform");
  }
renderControls(container, meta.controls);
}
