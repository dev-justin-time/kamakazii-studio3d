/**
 * Map Editor — Terrain generation with embedded Map Maker + save workflow
 *
 * Integrates the standalone 3D Terrain Generator (tools/map-maker) directly
 * into the studio via iframe, adding save-to-local and save-to-inventory.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    // ── Embedded Map Maker ──
    { key: 'map-maker-frame', type: 'label', label: '🗺️ 3D Terrain Generator (embedded below)' },
    { key: 'sep-mm', label: '──────────', type: 'label' },

    // ── Local Storage ──
    { key: 'info-save', type: 'label', label: 'Save & Inventory:' },
    { key: 'save-current', label: '💾 Save Current to Local Library', type: 'button', onClick: () => {
      const iframe = document.getElementById('map-maker-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'request-terrain-data' }, '*');
      } else {
        _status('Map Maker not loaded — open it first');
      }
    }},
    { key: 'load-library', label: '📂 Load from Local Library', type: 'button', onClick: () => {
      const lib = _getLocalLibrary();
      if (lib.length === 0) { _status('Local library is empty'); return; }
      // Show library list
      _showLibraryPopup(lib);
    }},
    { key: 'sep-save', label: '──────────', type: 'label' },

    // ── Quick Actions ──
    { key: 'info', type: 'label', label: 'Valley Generator Parameters:' },
    { key: 'sep0', label: '──────────', type: 'label' },
    { key: 'valley-seed', label: 'Seed', type: 'slider', min: 0, max: 9999, step: 1, default: 0,
      onChange: (val) => { _getApp()?.setValleyParam('seed', val); } },
    { key: 'valley-amp', label: 'Amplitude', type: 'slider', min: 0.5, max: 5, step: 0.1, default: 2.5,
      onChange: (val) => { _getApp()?.setValleyParam('amplitude', val); } },
    { key: 'valley-ridges', label: 'Ridge Count', type: 'slider', min: 0, max: 8, step: 1, default: 3,
      onChange: (val) => { _getApp()?.setValleyParam('ridgeCount', val); } },
    { key: 'valley-seg', label: 'Segments', type: 'slider', min: 12, max: 128, step: 2, default: 48,
      onChange: (val) => { _getApp()?.setValleyParam('segments', val); } },
    { key: 'valley-noise', label: 'Noise Amount', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.15,
      onChange: (val) => { _getApp()?.setValleyParam('noiseAmount', val); } },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'gen-valley', label: '🏔 Generate Wireframe Valley', type: 'button', onClick: () => {
      const app = _getApp(); if (!app) return;
      const seedWasZero = app._valleyParams.seed === 0;
      if (seedWasZero) app._valleyParams.seed = Math.floor(Math.random() * 9999) + 1;
      app.generateWireframeValley();
      if (seedWasZero) { app._valleyParams.seed = 0; }
    }},
    { key: 'rand-seed', label: '🎲 Randomize Seed', type: 'button', onClick: () => {
      const app = _getApp(); if (!app) return;
      app._valleyParams.seed = Math.floor(Math.random() * 9999) + 1;
    }},
    { key: 'sep1b', label: '──────────', type: 'label' },
    { key: 'scatter-city', label: '🌆 Scatter City on Valley', type: 'button', onClick: () => { _getApp()?.scatterCity(); } },
    { key: 'building-gap', label: 'Minimum Gap', type: 'slider', min: 0, max: 2, step: 0.05, default: 0,
      onChange: (val) => { _getApp()?.setValleyParam('buildingGap', val); } },
    { key: 'street-interval', label: 'Street Interval', type: 'slider', min: 0, max: 10, step: 1, default: 0,
      onChange: (val) => { _getApp()?.setValleyParam('streetInterval', val); } },
    { key: 'street-width', label: 'Street Width', type: 'slider', min: 1, max: 4, step: 1, default: 1,
      onChange: (val) => { _getApp()?.setValleyParam('streetWidth', val); } },
    { key: 'sep-street', label: '──────────', type: 'label' },
    { key: 'select-buildings', label: '🏢 Select All Buildings', type: 'button', onClick: () => { _getApp()?.selectAllBuildings(); } },
    { key: 'collision-grid', label: '🔲 Toggle Collision Grid', type: 'button', onClick: () => { _getApp()?.toggleCollisionGrid(); } },
    { key: 'sep1ba', label: '──────────', type: 'label' },
    { key: 'frame-all', label: 'Frame All', type: 'button', onClick: () => _getApp()?.frameAll() },
    { key: 'snap', label: 'Snap Selected to Grid', type: 'button', onClick: () => _getApp()?.snapToGrid() },
    { key: 'sep1c', label: '──────────', type: 'label' },
    { key: 'export-valley-gltf', label: '📤 Export Valley as GLTF', type: 'button', onClick: () => { _getApp()?.exportValleyAsGLTF(); }},
    { key: 'export-valley-glb',  label: '📤 Export Valley as GLB',  type: 'button', onClick: () => { _getApp()?.exportValleyAsGLB(); }},
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'open-map-maker', label: 'Open Map Maker (new tab)', type: 'button', onClick: () => {
      window.open('../tools/map-maker/index.html', '_blank');
    }},
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
