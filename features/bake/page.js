/**
 * Bake — Bake textures — normal maps, ambient occlusion, curvature, lightmaps, displacement
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'bake-type', type: 'select', label: 'Bake Type', default: '', options: [{"value":"ao","label":"Ambient Occlusion"},{"value":"normal","label":"Normal Map"},{"value":"curvature","label":"Curvature"},{"value":"lightmap","label":"Lightmap"},{"value":"displacement","label":"Displacement"}] },
    { key: 'bake-res', type: 'select', label: 'Resolution', default: '', options: [{"value":"512","label":"512×512"},{"value":"1024","label":"1024×1024"},{"value":"2048","label":"2048×2048"},{"value":"4096","label":"4096×4096"}] },
    { key: 'bake-samples', type: 'number', label: 'Samples', default: 64 },
    { key: 'bake-margin', type: 'number', label: 'Margin (px)', default: 2 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'start-bake', type: 'button', label: 'Start Bake', onClick: 'logBake' },
    { key: 'preview-bake', type: 'button', label: 'Preview', onClick: 'logBakePreview' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "bake";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "bake");
  }
renderControls(container, meta.controls);
}
