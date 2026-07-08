/**
 * Remesh — Vertex Clustering geometry decimation for Three.js BufferGeometry.
 *
 * Algorithm: Vertex Clustering
 *   1. Partitions vertex space into a uniform 3D grid
 *   2. Merges all vertices in each grid cell to their centroid
 *   3. Rebuilds triangles from merged vertex indices
 *   4. Removes degenerate triangles (cells with < 3 distinct clusters)
 *
 * Supports: position, normal, UV, vertex color attributes.
 * Optionally preserves boundary edges by giving boundary vertices unique cells.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'target', type: 'number', label: 'Target Vertices', default: 1000, min: 3, max: 1000000 },
    { key: 'preserve', type: 'toggle', label: 'Preserve Edges', default: true },
    { key: 'method', type: 'select', label: 'Method', default: 'uniform', options: [
      { value: 'uniform', label: 'Uniform Grid' },
      { value: 'adaptive', label: 'Adaptive Grid' },
    ]},
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-remesh', type: 'button', label: 'Apply Remesh', onClick: 'applyRemesh' },
    { key: 'apply-decimate', type: 'button', label: 'Decimate 50%', onClick: 'applyDecimate' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'replace-orig', type: 'button', label: 'Replace Original', onClick: 'replaceOriginal' },
    { key: 'delete-remesh', type: 'button', label: 'Delete Copy', onClick: 'deleteRemeshed' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
