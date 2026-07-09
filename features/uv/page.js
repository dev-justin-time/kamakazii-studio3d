/**
 * UV Tools — UV unwrapping, seam marking, island packing, texel density
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'uv-method', type: 'select', label: 'Unwrap Method', default: '', options: [{"value":"smart","label":"Smart UV Project"},{"value":"seam","label":"Seam-Based"},{"value":"cube","label":"Cube Projection"},{"value":"sphere","label":"Sphere Projection"},{"value":"cylinder","label":"Cylinder Projection"}] },
    { key: 'uv-island-margin', type: 'slider', label: 'Island Margin', min: 0, max: 0.1, step: 0.001, default: 0.01 },
    { key: 'uv-pack', type: 'button', label: 'Pack Islands', onClick: 'logUVPack' },
    { key: 'uv-relax', type: 'button', label: 'Relax Islands', onClick: 'logUVRelax' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'uv-checker', type: 'button', label: 'Apply Checker Map', onClick: 'logChecker' },
    { key: 'uv-export', type: 'button', label: 'Export UV Layout', onClick: 'logUVExport' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "uv";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "uv");
  }
renderControls(container, meta.controls);
}
