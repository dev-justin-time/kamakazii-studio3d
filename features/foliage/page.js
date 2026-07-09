/**
 * Foliage — Procedural vegetation — trees, grass, bushes, flowers, scatter system
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'foliage-type', type: 'select', label: 'Type', default: '', options: [{"value":"grass","label":"Grass Patch"},{"value":"bush","label":"Bush"},{"value":"tree-conifer","label":"Conifer Tree"},{"value":"tree-deciduous","label":"Deciduous Tree"},{"value":"flowers","label":"Flower Patch"}] },
    { key: 'foliage-count', type: 'number', label: 'Scatter Count', default: 50 },
    { key: 'foliage-radius', type: 'slider', label: 'Scatter Radius', min: 1, max: 20, step: 0.5, default: 5 },
    { key: 'foliage-scale', type: 'slider', label: 'Scale', min: 0.1, max: 3, step: 0.1, default: 1 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'scatter-foliage', type: 'button', label: 'Scatter on Selection', onClick: 'logFoliage' },
    { key: 'clear-foliage', type: 'button', label: 'Clear', onClick: 'logClearFoliage' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "foliage";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "foliage");
  }
renderControls(container, meta.controls);
}
