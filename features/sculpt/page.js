/**
 * Sculpt — Digital sculpting brushes — clay, smooth, inflate, pinch, crease, grab, mask
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'brush-mode', type: 'select', label: 'Brush Mode', default: 'clay', options: [{"value":"clay","label":"Clay"},{"value":"smooth","label":"Smooth"},{"value":"inflate","label":"Inflate"},{"value":"pinch","label":"Pinch"},{"value":"crease","label":"Crease"},{"value":"grab","label":"Grab"}] },
    { key: 'brush-radius', type: 'slider', label: 'Brush Radius', min: 0.05, max: 2, step: 0.05, default: 0.3 },
    { key: 'brush-strength', type: 'slider', label: 'Strength', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'symmetry', type: 'toggle', label: 'Symmetry', default: true },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'frame', type: 'button', label: 'Frame Selected', onClick: 'frameSelected' },
    { key: 'wireframe', type: 'button', label: 'Toggle Wireframe', onClick: 'toggleViewMode' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "sculpt";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "sculpt");
  }
renderControls(container, meta.controls);
}
