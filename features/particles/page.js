/**
 * Particles — Particle emitter system — fire, smoke, sparks, dust, magic, bubbles
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'particle-type', type: 'select', label: 'Preset', default: '', options: [{"value":"fire","label":"Fire"},{"value":"smoke","label":"Smoke"},{"value":"sparks","label":"Sparks"},{"value":"dust","label":"Dust"},{"value":"magic","label":"Magic"},{"value":"bubbles","label":"Bubbles"}] },
    { key: 'particle-count', type: 'number', label: 'Max Particles', default: 500 },
    { key: 'particle-rate', type: 'slider', label: 'Emit Rate', min: 0, max: 100, step: 1, default: 20 },
    { key: 'particle-life', type: 'slider', label: 'Lifetime', min: 0.1, max: 10, step: 0.1, default: 2 },
    { key: 'particle-speed', type: 'slider', label: 'Speed', min: 0, max: 20, step: 0.1, default: 3 },
    { key: 'particle-size', type: 'slider', label: 'Size', min: 0.01, max: 2, step: 0.01, default: 0.1 },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'emit', type: 'button', label: 'Start Emitting', onClick: 'logParticleEmit' },
    { key: 'stop', type: 'button', label: 'Stop', onClick: 'logParticleStop' },
    { key: 'clear', type: 'button', label: 'Clear All', onClick: 'logParticleClear' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
