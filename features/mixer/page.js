/**
 * Mixer — Animation mixer — blend multiple clips, cross-fade, layer blending
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'mixer-clip1', type: 'select', label: 'Clip A', default: '', options: [{"value":"idle","label":"Idle"},{"value":"walk","label":"Walk"},{"value":"run","label":"Run"}] },
    { key: 'mixer-clip2', type: 'select', label: 'Clip B', default: '', options: [{"value":"none","label":"None"},{"value":"idle","label":"Idle"},{"value":"walk","label":"Walk"},{"value":"run","label":"Run"}] },
    { key: 'mixer-blend', type: 'slider', label: 'Blend Weight', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'mixer-crossfade', type: 'number', label: 'Crossfade (s)', default: 0.3 },
    { key: 'mixer-speed', type: 'slider', label: 'Speed', min: 0.1, max: 3, step: 0.1, default: 1 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'mixer-play', type: 'button', label: '▶ Play Blend', onClick: 'playAnimation' },
    { key: 'mixer-stop', type: 'button', label: '■ Stop', onClick: 'pauseAnimation' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
