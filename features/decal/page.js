/**
 * Decal — Project decals, stickers, and decal textures onto surfaces
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'decal-import', type: 'button', label: 'Import Decal Image', onClick: 'logDecalImport' },
    { key: 'decal-size', type: 'slider', label: 'Decal Size', min: 0.1, max: 5, step: 0.1, default: 1 },
    { key: 'decal-opacity', type: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'decal-blend', type: 'select', label: 'Blend Mode', default: '', options: [{"value":"normal","label":"Normal"},{"value":"multiply","label":"Multiply"},{"value":"overlay","label":"Overlay"}] },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'place-decal', type: 'button', label: 'Place Decal on Selection', onClick: 'logPlaceDecal' },
    { key: 'clear-decals', type: 'button', label: 'Clear All Decals', onClick: 'logClearDecals' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "decal";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "decal");
  }
renderControls(container, meta.controls);
}
