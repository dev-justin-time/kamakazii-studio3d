/**
 * Lighting — Add, remove, and adjust lights. Color picker, intensity, shadow toggle, helpers.
 *
 * The `state` parameter is the shared StudioState instance (see app/state.js).
 * We use it to:
 *   - Subscribe to the selected-light-index key so external code can change
 *     the active light (e.g. from a 3D viewport click) and this panel
 *     re-renders the controls.
 *   - Push light-count + active-index back into shared state so other features
 *     (e.g. inspector) can react to lighting changes.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    // ── Light Selector ──
    {
      key: 'light-select',
      label: 'Active Light',
      type: 'select',
      default: '0',
      options: [{ value: '0', label: 'Ambient [0]' }],
      onChange: (val) => {
        const idx = parseInt(val);
        window.__lightingSelectedIdx = idx;
        window.ProModelerApp?.state?.set?.('selectedLightIndex', idx);
      },
    },
    { key: 'sep-select', label: '──────────', type: 'label' },

    // ── Color Picker ──
    {
      key: 'light-color',
      label: 'Light Color',
      type: 'color',
      default: '#ffffff',
      description: 'Color of the selected light',
      onChange: (val) => {
        window.ProModelerApp?.setLightColor(window.__lightingSelectedIdx || 0, val);
      },
    },
    // ── Intensity ──
    {
      key: 'light-intensity',
      label: 'Intensity',
      type: 'slider',
      min: 0, max: 5, step: 0.05, default: 1,
      description: 'Brightness of the selected light',
      onChange: (val) => {
        window.ProModelerApp?.setLightIntensity(window.__lightingSelectedIdx || 0, val);
      },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Shadow Toggle ──
    {
      key: 'shadow-toggle',
      label: 'Toggle Shadows',
      type: 'button',
      onClick: () => {
        const idx = window.__lightingSelectedIdx || 0;
        window.ProModelerApp?.toggleLightShadow(idx);
        const app = window.ProModelerApp;
        const light = app?.lights?.[idx];
        const btn = document.querySelector('#popupContent [data-key="shadow-toggle"] .ctrl-button');
        if (btn && light) {
          btn.textContent = light.castShadow ? '✓ Shadows ON' : '✗ Shadows OFF';
        }
      },
    },
    // ── Remove Light ──
    {
      key: 'remove-light',
      label: 'Remove Light',
      type: 'button',
      onClick: () => {
        const idx = window.__lightingSelectedIdx || 0;
        window.ProModelerApp?.removeLight(idx);
        const sel = document.querySelector('#popupContent [data-key="light-select"] select');
        if (sel) {
          const app = window.ProModelerApp;
          if (app?.lights) {
            sel.innerHTML = app.lights.map((l, i) =>
              `<option value="${i}">${l.name || l.type || 'Light'} [${i}]</option>`
            ).join('');
            sel.value = '0';
            window.__lightingSelectedIdx = 0;
          }
        }
        const label = document.querySelector('#popupContent [data-key="light-count"] .ctrl-label');
        if (label) {
          label.textContent = `Scene lights: ${window.ProModelerApp?.lights?.length ?? 0}`;
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Add Lights ──
    { key: 'add-point',       label: '➕ Add Point Light',      type: 'button', onClick: () => {
      window.ProModelerApp?.addLight('point');
      _refreshLightUI();
    }},
    { key: 'add-directional', label: '➕ Add Directional Light', type: 'button', onClick: () => {
      window.ProModelerApp?.addLight('directional');
      _refreshLightUI();
    }},
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Ambient Intensity ──
    {
      key: 'ambient',
      label: 'Ambient Intensity',
      type: 'slider',
      min: 0, max: 2, step: 0.05, default: 0.4,
      description: 'Global ambient light level',
      onChange: (val) => {
        const app = window.ProModelerApp;
        const ambient = app?.lights?.find(l => l.isAmbientLight);
        if (ambient) {
          ambient.intensity = val;
          app.render();
        }
      },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Light Helpers Toggle ──
    {
      key: 'helpers-toggle',
      label: '🔦 Toggle Light Helpers',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        app?.toggleLightHelpersVisible();
        const btn = document.querySelector('#popupContent [data-key="helpers-toggle"] .ctrl-button');
        if (btn && app) {
          btn.textContent = app._showLightHelpers ? '🔦 Light Helpers ON' : '🔦 Light Helpers OFF';
        }
      },
    },
    { key: 'sep5', label: '──────────', type: 'label' },

    // ── Light Info ──
    {
      key: 'light-count',
      label: `Scene lights: ${(() => {
        const app = window.ProModelerApp;
        return app?.lights?.length ?? 0;
      })()}`,
      type: 'label',
    },
  ],
  onApply: () => {},
};

/**
 * Refresh the lighting UI: rebuild the light-select options, update the
 * light-count label, and reflect the active light index from shared state.
 * Exposed locally so the onClick handlers above can call it; not exported.
 */
function _refreshLightUI() {
  const app = window.ProModelerApp;
  const sel = document.querySelector('#popupContent [data-key="light-select"] select');
  if (sel) {
    if (!app?.lights || app.lights.length === 0) {
      sel.innerHTML = '<option value="0">No lights in scene</option>';
      sel.value = '0';
    } else {
      sel.innerHTML = app.lights.map((l, i) =>
        `<option value="${i}">${l.name || l.type || 'Light'} [${i}]</option>`
      ).join('');
      const idx = window.__lightingSelectedIdx || 0;
      const safeIdx = Math.max(0, Math.min(idx, app.lights.length - 1));
      sel.value = String(safeIdx);
    }
  }
  const label = document.querySelector('#popupContent [data-key="light-count"] .ctrl-label');
  if (label) {
    label.textContent = `Scene lights: ${app?.lights?.length ?? 0}`;
  }
}

export { meta };
export function render(container, state) {
  // Use shared state to: (1) tag the container with the active feature name
  // (so other systems can route events back to us); (2) keep window.__lightingSelectedIdx
  // in sync with the shared state value if a different feature set it.
  const featureName = state?.get?.('currentFeature') ?? 'lighting';
  container.dataset.feature = featureName;
  if (state && typeof state.get === 'function') {
    const sharedIdx = state.get('selectedLightIndex');
    if (typeof sharedIdx === 'number') window.__lightingSelectedIdx = sharedIdx;
  }
  renderControls(container, meta.controls);
  _refreshLightUI();
}
