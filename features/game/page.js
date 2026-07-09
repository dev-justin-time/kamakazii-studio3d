/* global _getApp, _refreshUI */

/**
 * Game Tools — Scene stats, LOD generation, collider helpers, optimization, export
 * 
 * Note: This module assumes `_getApp()` and `_refreshUI()` are available as global 
 * functions in your application scope.
 */
import { renderControls } from '../_shared/renderControls.js';

// Define export formats to avoid repetitive code
const EXPORT_FORMATS = [
  { format: 'glb',  label: 'Export Selected as GLB' },
  { format: 'gltf', label: 'Export Selected as GLTF' },
  { format: 'obj',  label: 'Export Selected as OBJ' },
  { format: 'stl',  label: 'Export Selected as STL' },
];

/**
 * Builds the controls array dynamically based on the current application state.
 * This allows UI elements (like labels and toggle buttons) to reflect real-time data.
 * 
 * @param {Object} state - The current state of the application.
 * @returns {Array} An array of control definitions for renderControls.
 */
function buildControls(state = {}) {
  const { selectedObject, collidersVisible = true } = state;

  // Dynamic labels based on state
  const statsLabel = selectedObject 
    ? `Selected: ${selectedObject.name || 'Object'}\nVertices: ${selectedObject.vertices || 0}\nFaces: ${selectedObject.faces || 0}`
    : 'Select an object to see stats';
  
  const colliderToggleLabel = collidersVisible ? '🟢 Colliders ON' : '🔴 Colliders OFF';

  return [
    // ── Scene Stats ──
    { key: 'info-stats', type: 'label', label: 'Scene Statistics:' },
    { key: 'scene-stats', type: 'label', label: statsLabel },
    {
      key: 'refresh-stats',
      label: '🔄 Refresh Stats',
      type: 'button',
      onClick: () => { _refreshUI(); },
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── LOD & Hierarchy ──
    { key: 'info-lod', type: 'label', label: 'LOD & Hierarchy:' },
    {
      key: 'gen-lod',
      label: '📉 Generate LOD (simplified)',
      type: 'button',
      onClick: () => { _getApp()?.generateLOD(); _refreshUI(); },
    },
    {
      key: 'group-objects',
      label: '🔗 Group Others Under Selected',
      type: 'button',
      onClick: () => { _getApp()?.groupSelected(); _refreshUI(); },
    },
    {
      key: 'ungroup-objects',
      label: '🔓 Ungroup Children to Scene',
      type: 'button',
      onClick: () => { _getApp()?.ungroupSelected(); _refreshUI(); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Collider Helpers ──
    { key: 'info-colliders', type: 'label', label: 'Collider Visualization:' },
    {
      key: 'collider-box',
      label: '📦 Add Box Collider',
      type: 'button',
      onClick: () => { _getApp()?.addColliderHelper('box'); _refreshUI(); },
    },
    {
      key: 'collider-sphere',
      label: '⚪ Add Sphere Collider',
      type: 'button',
      onClick: () => { _getApp()?.addColliderHelper('sphere'); _refreshUI(); },
    },
    {
      key: 'colliders-toggle',
      label: colliderToggleLabel,
      type: 'button',
      onClick: () => { _getApp()?.toggleColliderHelpers(); _refreshUI(); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Export ──
    { key: 'info-export', type: 'label', label: 'Export (selected or whole scene):' },
    ...EXPORT_FORMATS.map(({ format, label }) => ({
      key: `export-${format}`,
      label,
      type: 'button',
      onClick: () => _getApp()?.exportModel(format),
    })),
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Utilities ──
    { key: 'frame-all', label: 'Frame All Objects', type: 'button', onClick: () => _getApp()?.frameAll() },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info-tip1', type: 'label', label: '💡 Tips:' },
    { key: 'info-tip2', type: 'label', label: '  • LOD = Level of Detail. Creates a simplified copy with fewer polygons.' },
    { key: 'info-tip3', type: 'label', label: '  • Colliders show bounding volumes for physics/collision detection.' },
    { key: 'info-tip4', type: 'label', label: '  • Group/ungroup organizes objects in the scene hierarchy.' },
  ];
}

// Export meta for backward compatibility or external inspection
const meta = {
  controls: buildControls(), // Default state
  onApply: () => {},
};

/**
 * Renders the Game Tools UI panel.
 * 
 * @param {HTMLElement} container - The DOM element to render the controls into.
 * @param {Object} state - The current application state (used for dynamic UI updates).
 */
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "game";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "game");
  }
// Generate fresh controls based on the current state to ensure UI is up-to-date
  const currentControls = buildControls(state);
  renderControls(container, currentControls);
}

export { meta };