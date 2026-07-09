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
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "batch";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "batch");
  }
renderControls(container, meta.controls);
}
