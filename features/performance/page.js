/**
 * Performance Monitor — live draw calls, frame time, memory via renderer.info
 * Updates every 500ms with a running performance snapshot.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Live performance metrics (updates every 500ms).' },
    { key: 'sep0', label: '──────────', type: 'label' },
    { key: 'fps', label: 'FPS', type: 'label', description: 'Frames per second (30-frame rolling average)' },
    { key: 'frametime', label: 'Frame Time', type: 'label', description: 'Milliseconds per frame' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'drawcalls', label: 'Draw Calls', type: 'label', description: 'WebGL draw calls per frame' },
    { key: 'triangles', label: 'Triangles', type: 'label', description: 'Triangles rendered per frame' },
    { key: 'points', label: 'Points', type: 'label', description: 'Points rendered per frame' },
    { key: 'lines', label: 'Lines', type: 'label', description: 'Line segments rendered per frame' },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'geometries', label: 'Geometries', type: 'label', description: 'GPU geometry buffers' },
    { key: 'textures', label: 'Textures', type: 'label', description: 'GPU textures' },
    { key: 'programs', label: 'GPU Programs', type: 'label', description: 'Shader program count' },
    { key: 'objects', label: 'Scene Objects', type: 'label', description: 'User objects in scene' },
    { key: 'lights', label: 'Lights', type: 'label', description: 'Active lights' },
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'js-heap', label: 'JS Heap', type: 'label', description: 'JavaScript heap usage (Chrome only)' },
    { key: 'pixel-ratio', label: 'Pixel Ratio', type: 'label', description: 'Device pixel ratio' },
    { key: 'sep4', label: '──────────', type: 'label' },
    {
      key: 'reset-stats',
      label: 'Reset Renderer Stats',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        if (app?.renderer?.info?.reset) app.renderer.info.reset();
      },
    },
    {
      key: 'save-snapshot',
      label: '💾 Save Snapshot',
      type: 'button',
      onClick: () => {
        window.ProModelerApp?.savePerformanceSnapshot();
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
