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
  renderControls(container, meta.controls);
}
