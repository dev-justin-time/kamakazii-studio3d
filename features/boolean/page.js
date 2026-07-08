/**
 * Boolean — CSG boolean operations — union, subtract, intersect between objects
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'bool-op', type: 'select', label: 'Operation', default: 'union', options: [{"value":"union","label":"Union (A+B)"},{"value":"subtract","label":"Subtract (A-B)"},{"value":"intersect","label":"Intersect (A∩B)"}] },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'info', type: 'label', label: 'Select two overlapping objects. The active object is A, the other is B.' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'apply-bool', type: 'button', label: 'Execute Boolean', onClick: 'logBoolean' },
    { key: 'delete-orig', type: 'toggle', label: 'Keep Originals', default: false }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
