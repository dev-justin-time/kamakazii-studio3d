/**
 * Curve — Bezier/NURBS curves, path extrusion, profile sweeping
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'curve-type', type: 'select', label: 'Curve Type', default: '', options: [{"value":"bezier","label":"Bezier"},{"value":"nurbs","label":"NURBS"},{"value":"poly","label":"Polyline"}] },
    { key: 'extrude-depth', type: 'slider', label: 'Extrude Depth', min: 0, max: 10, step: 0.1, default: 1 },
    { key: 'extrude-bevel', type: 'slider', label: 'Bevel Radius', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'extrude-segments', type: 'number', label: 'Segments', default: 16 },
    { key: 'closed', type: 'toggle', label: 'Closed Loop', default: false },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'add-curve', type: 'button', label: 'Add Curve', onClick: 'addPrimitive_torus' },
    { key: 'extrude', type: 'button', label: 'Extrude from Curve', onClick: 'logExtrude' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "curve";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "curve");
  }
renderControls(container, meta.controls);
}
