/**
 * Snapshot — Screenshot, GIF capture, viewport recording, before/after comparison
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'snap-type', type: 'select', label: 'Capture Type', default: '', options: [{"value":"screenshot","label":"Screenshot (PNG)"},{"value":"viewport","label":"Viewport Capture"},{"value":"gif","label":"Animated GIF"},{"value":"turntable","label":"Turntable Render"}] },
    { key: 'snap-res', type: 'select', label: 'Resolution', default: '', options: [{"value":"viewport","label":"Viewport Size"},{"value":"1920","label":"1920×1080"},{"value":"3840","label":"3840×2160"}] },
    { key: 'snap-transparent', type: 'toggle', label: 'Transparent BG', default: false },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'capture', type: 'button', label: '📸 Capture', onClick: 'logSnapshot' },
    { key: 'capture-turntable', type: 'button', label: 'Render Turntable', onClick: 'logTurntable' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
