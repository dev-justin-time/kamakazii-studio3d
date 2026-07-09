/**
 * Selection Tools — Transform modes, Snap, Frame
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    // ── Transform Mode ──
    {
      key: 'transform',
      label: 'Transform Mode',
      type: 'select',
      default: 'move',
      options: [
        { value: 'move',   label: 'Move (Translate)' },
        { value: 'rotate', label: 'Rotate' },
        { value: 'scale',  label: 'Scale' },
      ],
      onChange: (val) => window.ProModelerApp?.setTransformMode(val),
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Snap ──
    { key: 'snap', label: 'Snap Selected to Grid', type: 'button', onClick: () => window.ProModelerApp?.snapToGrid() },
    { key: 'sep3', label: '──────────', type: 'label' },
    // ── Frame ──
    { key: 'frame',     label: 'Frame Selected', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'frame-all', label: 'Frame All',      type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'sep4', label: '──────────', type: 'label' },
    // ── View Mode ──
    {
      key: 'viewmode',
      label: 'View Mode',
      type: 'select',
      default: 'solid',
      options: [
        { value: 'solid',     label: 'Solid' },
        { value: 'wireframe', label: 'Wireframe' },
      ],
      onChange: (val) => window.ProModelerApp?.setViewMode(val),
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "select";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "select");
  }
renderControls(container, meta.controls);
}
