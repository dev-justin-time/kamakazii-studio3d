/**
 * Batch — Batch operations — rename multiple objects, replace materials, merge operations
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'batch-op', type: 'select', label: 'Operation', default: '', options: [{"value":"rename","label":"Rename Objects"},{"value":"recolor","label":"Recolor Objects"},{"value":"rescale","label":"Rescale Objects"},{"value":"replace-mat","label":"Replace Material"},{"value":"merge-verts","label":"Merge by Distance"}] },
    { key: 'batch-prefix', type: 'text', label: 'Prefix', default: 'Obj_' },
    { key: 'batch-filter', type: 'text', label: 'Filter (name contains)', default: '' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'execute-batch', type: 'button', label: 'Execute Batch', onClick: 'logBatch' },
    { key: 'preview-batch', type: 'button', label: 'Preview Results', onClick: 'logBatchPreview' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
