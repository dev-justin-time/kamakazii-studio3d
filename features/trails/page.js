/**
 * Trails — Motion trails, ghost frames, motion blur, velocity visualization
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'trail-type', type: 'select', label: 'Trail Type', default: '', options: [{"value":"motion","label":"Motion Trail"},{"value":"ghost","label":"Ghost Frames"},{"value":"velocity","label":"Velocity Vectors"},{"value":"smear","label":"Motion Smear"}] },
    { key: 'trail-length', type: 'number', label: 'Trail Length', default: 10 },
    { key: 'trail-fade', type: 'slider', label: 'Fade Speed', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'trail-color', type: 'color', label: 'Trail Color', default: '#4a9eff' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'toggle-trail', type: 'button', label: 'Toggle Trails', onClick: 'logTrailToggle' },
    { key: 'clear-trails', type: 'button', label: 'Clear Trails', onClick: 'logClearTrails' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "trails";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "trails");
  }
renderControls(container, meta.controls);
}
