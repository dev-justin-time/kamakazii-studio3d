/**
 * Report — Scene diagnostics — object count, geometry stats, material usage, warnings
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'report-scope', type: 'select', label: 'Scope', default: '', options: [{"value":"full","label":"Full Scene Report"},{"value":"selection","label":"Selected Object"},{"value":"materials","label":"Material Audit"},{"value":"performance","label":"Performance Warnings"}] },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'gen-report', type: 'button', label: 'Generate Report', onClick: 'logReport' },
    { key: 'copy-report', type: 'button', label: 'Copy to Clipboard', onClick: 'logCopyReport' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "report";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "report");
  }
renderControls(container, meta.controls);
}
