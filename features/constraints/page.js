/**
 * Constraints — IK/FK, parent, look-at, path-follow, floor, limit constraints
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'constraint-type', type: 'select', label: 'Constraint Type', default: '', options: [{"value":"parent","label":"Parent"},{"value":"look-at","label":"Look At"},{"value":"path-follow","label":"Path Follow"},{"value":"limit-pos","label":"Limit Position"},{"value":"limit-rot","label":"Limit Rotation"},{"value":"floor","label":"Floor"}] },
    { key: 'constraint-influence', type: 'slider', label: 'Influence', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'constraint-target', type: 'toggle', label: 'Use Selected as Target', default: true },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-constraint', type: 'button', label: 'Add Constraint', onClick: 'logConstraint' },
    { key: 'remove-constraints', type: 'button', label: 'Remove All', onClick: 'logRemoveConstraints' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "constraints";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "constraints");
  }
renderControls(container, meta.controls);
}
