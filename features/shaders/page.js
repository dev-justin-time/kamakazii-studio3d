/**
 * Shaders — Shader graph editor — build custom materials with nodes
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'mat-type', type: 'select', label: 'Material Type', default: '', options: [{"value":"pbr","label":"PBR Standard"},{"value":"emissive","label":"Emissive/Unlit"},{"value":"glass","label":"Glass/Transparent"},{"value":"custom","label":"Custom Shader"}] },
    { key: 'mat-color', type: 'color', label: 'Color', default: '#888888' },
    { key: 'mat-metalness', type: 'slider', label: 'Metalness', min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: 'mat-roughness', type: 'slider', label: 'Roughness', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'normal-strength', type: 'slider', label: 'Normal Strength', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-mat', type: 'button', label: 'Apply to Selected', onClick: 'logMaterial' },
    { key: 'import-shader', type: 'button', label: 'Import GLSL File', onClick: 'logShaderImport' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "shaders";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "shaders");
  }
renderControls(container, meta.controls);
}
