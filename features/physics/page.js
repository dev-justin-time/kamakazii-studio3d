/**
 * Physics — Rigid body, soft body, cloth simulation with constraints and collisions
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'phys-type', type: 'select', label: 'Body Type', default: '', options: [{"value":"rigid-static","label":"Rigid Body (Static)"},{"value":"rigid-dynamic","label":"Rigid Body (Dynamic)"},{"value":"soft","label":"Soft Body"},{"value":"cloth","label":"Cloth"}] },
    { key: 'phys-mass', type: 'slider', label: 'Mass', min: 0.1, max: 100, step: 0.1, default: 1 },
    { key: 'phys-friction', type: 'slider', label: 'Friction', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'phys-bounce', type: 'slider', label: 'Bounciness', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'phys-gravity', type: 'toggle', label: 'Use Gravity', default: true },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-phys', type: 'button', label: 'Apply to Selected', onClick: 'logPhysics' },
    { key: 'bake-phys', type: 'button', label: 'Bake Simulation', onClick: 'logBakePhysics' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "physics";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "physics");
  }
renderControls(container, meta.controls);
}
