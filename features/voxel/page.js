/**
 * Voxel Editor — Sparse octree voxel engine (future).
 *
 * Stub page for the planned octree-based voxel system.
 * See FUTURE.md §2 for the full spec.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Sparse octree voxel engine (planned).' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'frame', label: 'Frame Selected', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'frame-all', label: 'Frame All', type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-octree', type: 'label', label: '  • Sparse octree data structure' },
    { key: 'info-greedy', type: 'label', label: '  • Greedy meshing for reduced face count' },
    { key: 'info-lod',    type: 'label', label: '  • Level-of-detail traversal' },
    { key: 'info-csg',    type: 'label', label: '  • CSG boolean operations (add/subtract)' },
    { key: 'info-voxbake',type: 'label', label: '  • Voxel baking from sculpts' },
    { key: 'info-export', type: 'label', label: '  • Export to GLB' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "voxel";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "voxel");
  }
renderControls(container, meta.controls);
}
