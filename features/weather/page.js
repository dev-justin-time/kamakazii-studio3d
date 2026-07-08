/**
 * Weather — Weather FX — rain, snow, fog, volumetric clouds, wind
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'weather-type', type: 'select', label: 'Weather Effect', default: '', options: [{"value":"rain","label":"Rain"},{"value":"snow","label":"Snow"},{"value":"fog","label":"Fog"},{"value":"clouds","label":"Volumetric Clouds"},{"value":"sandstorm","label":"Sandstorm"}] },
    { key: 'weather-intensity', type: 'slider', label: 'Intensity', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'weather-wind', type: 'slider', label: 'Wind Speed', min: 0, max: 50, step: 0.5, default: 5 },
    { key: 'weather-fog-color', type: 'color', label: 'Fog Color', default: '#888888' },
    { key: 'weather-fog-density', type: 'slider', label: 'Fog Density', min: 0, max: 0.1, step: 0.001, default: 0.01 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-weather', type: 'button', label: 'Apply Weather', onClick: 'logWeather' },
    { key: 'clear-weather', type: 'button', label: 'Clear Weather', onClick: 'logClearWeather' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
