/**
 * Fire FX — Fire and smoke simulation — procedural flame, smoke plume, embers
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'fire-type', type: 'select', label: 'Effect', default: '', options: [{"value":"campfire","label":"Campfire"},{"value":"explosion","label":"Explosion"},{"value":"smoke-plume","label":"Smoke Plume"},{"value":"embers","label":"Embers Only"},{"value":"jet-flame","label":"Jet Flame"}] },
    { key: 'fire-intensity', type: 'slider', label: 'Intensity', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'fire-height', type: 'slider', label: 'Height', min: 0.1, max: 10, step: 0.1, default: 2 },
    { key: 'fire-color1', type: 'color', label: 'Inner Color', default: '#ffaa00' },
    { key: 'fire-color2', type: 'color', label: 'Outer Color', default: '#ff4400' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'ignite', type: 'button', label: 'Ignite', onClick: 'logIgnite' },
    { key: 'extinguish', type: 'button', label: 'Extinguish', onClick: 'logExtinguish' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "fire";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "fire");
  }
renderControls(container, meta.controls);
}
