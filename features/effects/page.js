/**
 * Effects Panel — Attach visual effects to selected objects
 * Supports: Glow (emissive), Pulsing (scale oscillation), Bobbing (vertical oscillation),
 *           Auto-rotation, Color Cycle (shifts color over time), Shake
 */
import { renderControls } from '../_shared/renderControls.js';
import * as THREE from 'three';

const app = () => window.ProModelerApp;

// Store active effects per object UUID
const activeEffects = new Map();

function getOrCreateAnimData(obj) {
  if (!obj.userData.effects) {
    obj.userData.effects = {
      glow: null,
      pulsing: null,
      bobbing: null,
      rotation: null,
      colorCycle: null,
      shake: null,
    };
  }
  return obj.userData.effects;
}

function removeEffect(type) {
  const obj = app()?.selectedObject;
  if (!obj) return;
  const data = getOrCreateAnimData(obj);
  data[type] = null;
  // Reset any visual changes
  if (type === 'glow' && obj.material) {
    obj.material.emissive.setHex(0x000000);
    obj.material.emissiveIntensity = 0;
    obj.material.needsUpdate = true;
  }
  if (type === 'pulsing') obj.scale.set(1, 1, 1);
  if (type === 'bobbing') obj.position.y = obj.userData._origY ?? obj.position.y;
  if (type === 'colorCycle') {
    if (obj.material && obj.userData._origColor) {
      obj.material.color.setHex(obj.userData._origColor);
    }
  }
}

function startEffect(type, params = {}) {
  const obj = app()?.selectedObject;
  if (!obj || !obj.material) return;

  const data = getOrCreateAnimData(obj);

  // Store original values for reset
  if (!obj.userData._origY) obj.userData._origY = obj.position.y;
  if (!obj.userData._origColor && obj.material.color) obj.userData._origColor = obj.material.color.getHex();
  if (!obj.userData._origScale) obj.userData._origScale = obj.scale.clone().toArray();

  switch (type) {
    case 'glow': {
      const color = params.color || '#4a9eff';
      const intensity = params.intensity || 0.5;
      obj.material.emissive.set(color);
      obj.material.emissiveIntensity = intensity;
      obj.material.needsUpdate = true;
      data.glow = { color, intensity };
      break;
    }
    case 'pulsing':
      data.pulsing = {
        speed: params.speed || 2,
        minScale: params.minScale || 0.8,
        maxScale: params.maxScale || 1.2,
        phase: 0,
      };
      break;
    case 'bobbing':
      data.bobbing = {
        speed: params.speed || 1.5,
        height: params.height || 0.3,
        phase: 0,
      };
      break;
    case 'rotation':
      data.rotation = {
        speed: params.speed || 1,
        axis: params.axis || 'y',
      };
      break;
    case 'colorCycle':
      data.colorCycle = {
        speed: params.speed || 0.5,
        saturation: params.saturation || 0.8,
        lightness: params.lightness || 0.5,
        phase: 0,
      };
      break;
    case 'shake':
      data.shake = {
        intensity: params.intensity || 0.05,
        speed: params.speed || 8,
        phase: 0,
      };
      break;
  }
}

// Global animation loop for effects — runs every frame from the animate() call
const effectsUpdateFunctions = [];

export function registerEffectsUpdate(fn) {
  effectsUpdateFunctions.push(fn);
}

// This is called every frame by the Studio or externally
export function updateEffects(time) {
  const objects = app()?.objects || [];
  objects.forEach(obj => {
    const data = obj.userData?.effects;
    if (!data) return;
    const t = time || performance.now() / 1000;

    // Pulsing
    if (data.pulsing) {
      data.pulsing.phase += 0.05 * data.pulsing.speed;
      const s = data.pulsing.minScale + (data.pulsing.maxScale - data.pulsing.minScale) * (0.5 + 0.5 * Math.sin(data.pulsing.phase));
      obj.scale.set(s, s, s);
    }

    // Bobbing
    if (data.bobbing) {
      data.bobbing.phase += 0.03 * data.bobbing.speed;
      const baseY = obj.userData._origY ?? 0;
      obj.position.y = baseY + data.bobbing.height * Math.sin(data.bobbing.phase);
    }

    // Auto-rotation
    if (data.rotation) {
      const speed = 0.02 * data.rotation.speed;
      const axis = data.rotation.axis;
      obj.rotation[axis] += speed;
    }

    // Color Cycle
    if (data.colorCycle && obj.material) {
      data.colorCycle.phase += 0.01 * data.colorCycle.speed;
      const hue = (data.colorCycle.phase % (Math.PI * 2)) / (Math.PI * 2);
      const color = new THREE.Color().setHSL(hue, data.colorCycle.saturation, data.colorCycle.lightness);
      obj.material.color.copy(color);
      obj.material.needsUpdate = true;
    }

    // Shake
    if (data.shake) {
      data.shake.phase += 0.05 * data.shake.speed;
      const intensity = data.shake.intensity;
      const basePos = obj.userData._origPos ? new THREE.Vector3().fromArray(obj.userData._origPos) : obj.position.clone();
      if (!obj.userData._origPos) obj.userData._origPos = obj.position.toArray();
      obj.position.x = basePos.x + (Math.random() - 0.5) * 2 * intensity;
      obj.position.y = basePos.y + (Math.random() - 0.5) * 2 * intensity;
      obj.position.z = basePos.z + (Math.random() - 0.5) * 2 * intensity;
    }
  });
}

const meta = {
  controls: [
    { key: 'eff-status', type: 'label', label: 'Select a mesh to attach effects' },

    { key: 'sep-glow', type: 'label', label: '── Glow (Emissive) ──' },
    {
      key: 'eff-glow-color',
      label: 'Glow Color',
      type: 'color',
      default: '#4a9eff',
    },
    {
      key: 'eff-glow-int',
      label: 'Glow Intensity',
      type: 'slider',
      min: 0, max: 3, step: 0.05, default: 0.5,
    },
    {
      key: 'eff-glow-apply',
      label: '✨ Apply Glow',
      type: 'button',
      onClick: () => {
        const color = document.querySelector('#popupContent [data-key="eff-glow-color"]')?.value || '#4a9eff';
        const int = parseFloat(document.querySelector('#popupContent [data-key="eff-glow-int"]')?.value || '0.5');
        startEffect('glow', { color, intensity: int });
      },
    },
    {
      key: 'eff-glow-remove',
      label: '☁ Remove Glow',
      type: 'button',
      onClick: () => removeEffect('glow'),
    },

    { key: 'sep-pulse', type: 'label', label: '── Pulsing (Scale) ──' },
    {
      key: 'eff-pulse-speed',
      label: 'Speed',
      type: 'slider', min: 0.1, max: 5, step: 0.1, default: 2,
    },
    {
      key: 'eff-pulse-min',
      label: 'Min Scale',
      type: 'slider', min: 0.1, max: 2, step: 0.05, default: 0.8,
    },
    {
      key: 'eff-pulse-max',
      label: 'Max Scale',
      type: 'slider', min: 0.1, max: 3, step: 0.05, default: 1.2,
    },
    {
      key: 'eff-pulse-apply',
      label: '💫 Apply Pulsing',
      type: 'button',
      onClick: () => {
        const speed = parseFloat(document.querySelector('#popupContent [data-key="eff-pulse-speed"]')?.value || '2');
        const min = parseFloat(document.querySelector('#popupContent [data-key="eff-pulse-min"]')?.value || '0.8');
        const max = parseFloat(document.querySelector('#popupContent [data-key="eff-pulse-max"]')?.value || '1.2');
        startEffect('pulsing', { speed, minScale: min, maxScale: max });
      },
    },
    {
      key: 'eff-pulse-remove',
      label: '☁ Remove Pulsing',
      type: 'button',
      onClick: () => removeEffect('pulsing'),
    },

    { key: 'sep-bob', type: 'label', label: '── Bobbing (Vertical) ──' },
    {
      key: 'eff-bob-speed',
      label: 'Speed',
      type: 'slider', min: 0.1, max: 5, step: 0.1, default: 1.5,
    },
    {
      key: 'eff-bob-height',
      label: 'Height',
      type: 'slider', min: 0.05, max: 2, step: 0.05, default: 0.3,
    },
    {
      key: 'eff-bob-apply',
      label: '🔄 Apply Bobbing',
      type: 'button',
      onClick: () => {
        const speed = parseFloat(document.querySelector('#popupContent [data-key="eff-bob-speed"]')?.value || '1.5');
        const height = parseFloat(document.querySelector('#popupContent [data-key="eff-bob-height"]')?.value || '0.3');
        startEffect('bobbing', { speed, height });
      },
    },
    {
      key: 'eff-bob-remove',
      label: '☁ Remove Bobbing',
      type: 'button',
      onClick: () => removeEffect('bobbing'),
    },

    { key: 'sep-rot', type: 'label', label: '── Auto-Rotation ──' },
    {
      key: 'eff-rot-speed',
      label: 'Speed',
      type: 'slider', min: 0.1, max: 10, step: 0.1, default: 1,
    },
    {
      key: 'eff-rot-axis',
      label: 'Axis',
      type: 'select',
      default: 'y',
      options: [
        { value: 'x', label: 'X Axis' },
        { value: 'y', label: 'Y Axis' },
        { value: 'z', label: 'Z Axis' },
      ],
    },
    {
      key: 'eff-rot-apply',
      label: '🔄 Apply Auto-Rotate',
      type: 'button',
      onClick: () => {
        const speed = parseFloat(document.querySelector('#popupContent [data-key="eff-rot-speed"]')?.value || '1');
        const axis = document.querySelector('#popupContent [data-key="eff-rot-axis"]')?.value || 'y';
        startEffect('rotation', { speed, axis });
      },
    },
    {
      key: 'eff-rot-remove',
      label: '☁ Remove Rotation',
      type: 'button',
      onClick: () => removeEffect('rotation'),
    },

    { key: 'sep-color', type: 'label', label: '── Color Cycle ──' },
    {
      key: 'eff-cc-speed',
      label: 'Speed',
      type: 'slider', min: 0.1, max: 5, step: 0.1, default: 0.5,
    },
    {
      key: 'eff-cc-sat',
      label: 'Saturation',
      type: 'slider', min: 0, max: 1, step: 0.05, default: 0.8,
    },
    {
      key: 'eff-cc-light',
      label: 'Lightness',
      type: 'slider', min: 0, max: 1, step: 0.05, default: 0.5,
    },
    {
      key: 'eff-cc-apply',
      label: '🌈 Apply Color Cycle',
      type: 'button',
      onClick: () => {
        const speed = parseFloat(document.querySelector('#popupContent [data-key="eff-cc-speed"]')?.value || '0.5');
        const sat = parseFloat(document.querySelector('#popupContent [data-key="eff-cc-sat"]')?.value || '0.8');
        const light = parseFloat(document.querySelector('#popupContent [data-key="eff-cc-light"]')?.value || '0.5');
        startEffect('colorCycle', { speed, saturation: sat, lightness: light });
      },
    },
    {
      key: 'eff-cc-remove',
      label: '☁ Remove Color Cycle',
      type: 'button',
      onClick: () => removeEffect('colorCycle'),
    },

    { key: 'sep-shake', type: 'label', label: '── Shake ──' },
    {
      key: 'eff-shake-int',
      label: 'Intensity',
      type: 'slider', min: 0.01, max: 0.5, step: 0.01, default: 0.05,
    },
    {
      key: 'eff-shake-speed',
      label: 'Speed',
      type: 'slider', min: 1, max: 20, step: 1, default: 8,
    },
    {
      key: 'eff-shake-apply',
      label: '🌊 Apply Shake',
      type: 'button',
      onClick: () => {
        const int = parseFloat(document.querySelector('#popupContent [data-key="eff-shake-int"]')?.value || '0.05');
        const speed = parseFloat(document.querySelector('#popupContent [data-key="eff-shake-speed"]')?.value || '8');
        startEffect('shake', { intensity: int, speed });
      },
    },
    {
      key: 'eff-shake-remove',
      label: '☁ Remove Shake',
      type: 'button',
      onClick: () => removeEffect('shake'),
    },

    { key: 'sep-clear', type: 'label', label: '══════════' },
    {
      key: 'eff-clear-all',
      label: '🗑 Clear ALL Effects on Selected',
      type: 'button',
      onClick: () => {
        ['glow', 'pulsing', 'bobbing', 'rotation', 'colorCycle', 'shake'].forEach(removeEffect);
      },
    },
  ],
  onApply: () => {},
};

export { meta, startEffect, removeEffect, updateEffects as update };

export function render(container, state) {
  renderControls(container, meta.controls);
}
