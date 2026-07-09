/**
 * Script — JavaScript scripting console — automate tasks, run snippets, access API
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'script-info', type: 'label', label: 'Run JavaScript against the 3D scene. Access via window.ProModelerApp.' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'run-script', type: 'button', label: '▶ Run Script', onClick: 'logRunScript' },
    { key: 'clear-script', type: 'button', label: '🗑 Clear Output', onClick: 'logClearScript' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'script-templates', type: 'select', label: 'Quick Templates', default: '', options: [{"value":"","label":"Select a template..."},{"value":"count","label":"Count all objects"},{"value":"names","label":"List all object names"},{"value":"random-colors","label":"Randomize colors"}] }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "script";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "script");
  }
renderControls(container, meta.controls);
}
