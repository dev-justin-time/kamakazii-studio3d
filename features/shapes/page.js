/**
 * Shape Keys — Blend shapes / morph targets — create shape keys, edit, animate
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'add-sk', type: 'button', label: 'Add Shape Key', onClick: 'logAddShapeKey' },
    { key: 'sk-value', type: 'slider', label: 'Shape Key Value', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'sk-name', type: 'select', label: 'Shape Key Name', default: '', options: [{"value":"basis","label":"Basis"},{"value":"smile","label":"Smile"},{"value":"blink","label":"Blink"}] },
    { key: 'sk-animate', type: 'toggle', label: 'Animate Blendshapes', default: false },
    { key: 'sk-speed', type: 'slider', label: 'Animation Speed', min: 0.1, max: 5, step: 0.1, default: 1 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-sk', type: 'button', label: 'Apply Current Frame', onClick: 'addKeyframe' },
    { key: 'export-sk', type: 'button', label: 'Export As JSON', onClick: 'logExportSK' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "shapes";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "shapes");
  }
renderControls(container, meta.controls);
}
