/**
 * Boolean — CSG boolean operations — union, subtract, intersect between objects
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'bool-op', type: 'select', label: 'Operation', default: 'union', options: [{"value":"union","label":"Union (A+B)"},{"value":"subtract","label":"Subtract (A-B)"},{"value":"intersect","label":"Intersect (A∩B)"}] },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'info', type: 'label', label: 'Select two overlapping objects. The active object is A, the other is B.' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'apply-bool', type: 'button', label: 'Execute Boolean', onClick: 'logBoolean' },
    { key: 'delete-orig', type: 'toggle', label: 'Keep Originals', default: false }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "boolean";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "boolean");
  }
renderControls(container, meta.controls);
}
