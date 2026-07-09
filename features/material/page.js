/**
 * Material Editor — Real-time material property controls
 * Color, Metalness, Roughness, Emissive, Opacity, Wireframe toggle, Presets
 */
import { renderControls } from '../_shared/renderControls.js';
import { writeStatus } from '../../app/status-bar.js';

/**
 * Apply material properties to the selected object.
 * @param {object} props - {color?, metalness?, roughness?, emissive?, emissiveIntensity?, opacity?, wireframe?}
 */
function applyMaterialProps(props) {
  const app = window.ProModelerApp;
  const obj = app?.selectedObject;
  if (!obj || !obj.material) return false;
  const mat = obj.material;
  if (props.color && mat.color) mat.color.set(props.color);
  if (props.metalness !== undefined && mat.metalness !== undefined) mat.metalness = props.metalness;
  if (props.roughness !== undefined && mat.roughness !== undefined) mat.roughness = props.roughness;
  if (props.emissive !== undefined && mat.emissive) {
    mat.emissive.set(props.emissive);
    mat.emissiveIntensity = props.emissiveIntensity ?? mat.emissiveIntensity ?? 0;
  }
  if (props.opacity !== undefined) {
    mat.opacity = props.opacity;
    mat.transparent = props.opacity < 1;
  }
  if (props.wireframe !== undefined) mat.wireframe = props.wireframe;
  mat.needsUpdate = true;
  app.render();
  return true;
}

/**
 * Apply a named material preset to the selected object.
 */
function applyPreset(name) {
  const app = window.ProModelerApp;
  if (app?.applyMaterial) {
    app.applyMaterial(name);
    return;
  }
  // Fallback — manual presets
  const presets = {
    chrome:    { color: '#ffffff', metalness: 1.0, roughness: 0.1 },
    gold:      { color: '#ffd700', metalness: 1.0, roughness: 0.15 },
    copper:    { color: '#b87333', metalness: 0.9, roughness: 0.2 },
    silver:    { color: '#c0c0c0', metalness: 1.0, roughness: 0.08 },
    plastic:   { color: '#ff4444', metalness: 0.0, roughness: 0.5 },
    rubber:    { color: '#333333', metalness: 0.0, roughness: 0.9 },
    wood:      { color: '#8b4513', metalness: 0.0, roughness: 0.8 },
    glass:     { color: '#ffffff', metalness: 0.0, roughness: 0.0, transparent: true, opacity: 0.6 },
    matte:     { color: '#888888', metalness: 0.0, roughness: 1.0 },
    glossy:    { color: '#222222', metalness: 0.1, roughness: 0.05 },
    neonGreen: { color: '#39ff14', metalness: 0.3, roughness: 0.2, emissive: '#39ff14', emissiveIntensity: 0.5 },
    neonPink:  { color: '#ff1493', metalness: 0.3, roughness: 0.2, emissive: '#ff1493', emissiveIntensity: 0.5 },
    neonBlue:  { color: '#1493ff', metalness: 0.3, roughness: 0.2, emissive: '#1493ff', emissiveIntensity: 0.5 },
  };
  const p = presets[name];
  if (!p) return;
  applyMaterialProps(p);
  updateUIFromSelection();
}

/** Read material from selected object and update all UI controls */
function updateUIFromSelection() {
  const app = window.ProModelerApp;
  const obj = app?.selectedObject;
  if (!obj || !obj.material) {
    // Disable all controls
    document.querySelectorAll('#popupContent input, #popupContent select').forEach(el => {
      if (el.type !== 'button') el.disabled = true;
    });
    return;
  }
  const mat = obj.material;
  // Enable controls
  document.querySelectorAll('#popupContent input, #popupContent select').forEach(el => {
    el.disabled = false;
  });

  // Update controls to reflect current material
  setCtrlValue('mat-color', '#' + mat.color?.getHexString() || '#ffffff');
  setCtrlValue('mat-metalness', mat.metalness ?? 0);
  setCtrlValue('mat-roughness', mat.roughness ?? 0.5);
  if (mat.emissive) {
    setCtrlValue('mat-emissive', '#' + mat.emissive.getHexString() || '#000000');
    setCtrlValue('mat-emissive-int', mat.emissiveIntensity ?? 0);
  }
  setCtrlValue('mat-opacity', mat.opacity ?? 1);
  setCtrlValue('mat-wireframe', !!mat.wireframe);
}

function setCtrlValue(key, value) {
  const el = document.querySelector(`#popupContent [data-key="${key}"]`);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value;
  // Update display labels for ranges
  if (el.type === 'range') {
    const container = el.closest('[class*="ctrl-group"]') || el.parentElement;
    const valSpan = container?.querySelector('.val-display, [data-val]');
    if (valSpan) valSpan.textContent = typeof value === 'number' ? value.toFixed(2) : value;
  }
}

const meta = {
  controls: [
    // ── Selection Status ──
    { key: 'mat-status', type: 'label', label: 'Select a mesh to edit its material' },

    // ── Color ──
    {
      key: 'mat-color',
      label: 'Color',
      type: 'color',
      default: '#ffffff',
      description: 'Base diffuse/albedo color',
      onChange: (val) => applyMaterialProps({ color: val }),
    },

    // ── Metalness ──
    {
      key: 'mat-metalness',
      label: 'Metalness',
      type: 'slider',
      min: 0, max: 1, step: 0.01, default: 0,
      description: 'How metallic the surface appears (0 = dielectric, 1 = metal)',
      onChange: (val) => applyMaterialProps({ metalness: val }),
    },

    // ── Roughness ──
    {
      key: 'mat-roughness',
      label: 'Roughness',
      type: 'slider',
      min: 0, max: 1, step: 0.01, default: 0.5,
      description: 'Surface micro-detail roughness (0 = mirror, 1 = diffuse)',
      onChange: (val) => applyMaterialProps({ roughness: val }),
    },

    { key: 'mat-sep1', type: 'label', label: '──────────' },

    // ── Emissive ──
    {
      key: 'mat-emissive',
      label: 'Emissive Color',
      type: 'color',
      default: '#000000',
      description: 'Self-illumination color (black = off)',
      onChange: (val) => {
        const intensity = parseFloat(document.querySelector('#popupContent [data-key="mat-emissive-int"]')?.value || '0');
        applyMaterialProps({ emissive: val, emissiveIntensity: intensity });
      },
    },
    {
      key: 'mat-emissive-int',
      label: 'Emissive Intensity',
      type: 'slider',
      min: 0, max: 5, step: 0.05, default: 0,
      description: 'Brightness multiplier for emissive glow',
      onChange: (val) => {
        const color = document.querySelector('#popupContent [data-key="mat-emissive"]')?.value || '#000000';
        applyMaterialProps({ emissive: color, emissiveIntensity: val });
      },
    },

    { key: 'mat-sep2', type: 'label', label: '──────────' },

    // ── Opacity ──
    {
      key: 'mat-opacity',
      label: 'Opacity',
      type: 'slider',
      min: 0, max: 1, step: 0.01, default: 1,
      description: 'Object transparency (1 = opaque, 0 = fully transparent)',
      onChange: (val) => applyMaterialProps({ opacity: val }),
    },
    {
      key: 'mat-wireframe',
      label: '🔲 Wireframe Overlay',
      type: 'toggle',
      default: false,
      description: 'Toggle wireframe rendering on this material',
      onChange: (val) => applyMaterialProps({ wireframe: val }),
    },

    { key: 'mat-sep3', type: 'label', label: '══════════' },

    // ── Material Presets ──
    { key: 'mat-presets-label', type: 'label', label: 'Material Presets — click to apply:' },
    {
      key: 'preset-chrome',
      label: '✨ Chrome',
      type: 'button',
      onClick: () => applyPreset('chrome'),
    },
    {
      key: 'preset-gold',
      label: '👑 Gold',
      type: 'button',
      onClick: () => applyPreset('gold'),
    },
    {
      key: 'preset-copper',
      label: '🪙 Copper',
      type: 'button',
      onClick: () => applyPreset('copper'),
    },
    {
      key: 'preset-silver',
      label: '🥈 Silver',
      type: 'button',
      onClick: () => applyPreset('silver'),
    },
    {
      key: 'preset-plastic',
      label: '🧩 Plastic (Red)',
      type: 'button',
      onClick: () => applyPreset('plastic'),
    },
    {
      key: 'preset-rubber',
      label: '⚫ Rubber',
      type: 'button',
      onClick: () => applyPreset('rubber'),
    },
    {
      key: 'preset-wood',
      label: '🪵 Wood',
      type: 'button',
      onClick: () => applyPreset('wood'),
    },
    {
      key: 'preset-glass',
      label: '🔮 Glass',
      type: 'button',
      onClick: () => applyPreset('glass'),
    },
    {
      key: 'preset-matte',
      label: '🏛️ Matte',
      type: 'button',
      onClick: () => applyPreset('matte'),
    },
    {
      key: 'preset-glossy',
      label: '💎 Glossy Black',
      type: 'button',
      onClick: () => applyPreset('glossy'),
    },
    {
      key: 'preset-neon-green',
      label: '💚 Neon Green (Emissive)',
      type: 'button',
      onClick: () => applyPreset('neonGreen'),
    },
    {
      key: 'preset-neon-pink',
      label: '💖 Neon Pink (Emissive)',
      type: 'button',
      onClick: () => applyPreset('neonPink'),
    },
    {
      key: 'preset-neon-blue',
      label: '💙 Neon Blue (Emissive)',
      type: 'button',
      onClick: () => applyPreset('neonBlue'),
    },

    { key: 'mat-sep4', type: 'label', label: '──────────' },

    // ── Action: Extract / Copy Material ──
    {
      key: 'mat-copy',
      label: '📋 Copy Material to Clipboard',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        const obj = app?.selectedObject;
        if (!obj?.material) return;
        const mat = obj.material;
        const data = JSON.stringify({
          color: mat.color?.getHexString() || 'ffffff',
          metalness: mat.metalness ?? 0,
          roughness: mat.roughness ?? 0.5,
          emissive: mat.emissive?.getHexString() || '000000',
          emissiveIntensity: mat.emissiveIntensity ?? 0,
          opacity: mat.opacity ?? 1,
          wireframe: !!mat.wireframe,
        }, null, 2);
        navigator.clipboard?.writeText(data);
        writeStatus('Material copied to clipboard');
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
  // Listen for selection changes to update the UI
  const app = window.ProModelerApp;
  if (app) {
    // Initial update
    setTimeout(updateUIFromSelection, 100);
    // Listen for clicks on the viewport (selection changes)
    const viewport = document.getElementById('viewport');
    if (viewport) {
      viewport.addEventListener('click', updateUIFromSelection);
    }
  }
}
