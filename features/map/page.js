/**
 * Map Editor — Terrain generation with embedded Map Maker + save workflow
 *
 * Integrates the standalone 3D Terrain Generator (tools/map-maker) directly
 * into the studio via iframe, adding save-to-local and save-to-inventory.
 *
 * Save targets:
 *   • localStorage  — always available, fast, offline
 *   • puter.kv      — cloud sync when Puter SDK is loaded (cross-device)
 *   • JSON export   — download as .kmap.json file
 */
import { dbg } from '../../app/dbg.js';
import { renderControls } from '../_shared/renderControls.js';
import { saveMap, loadMap, listMaps, deleteMap, exportMap } from '../../tools/map-maker/mapStorage.js';

function _status(msg) {
  try { window.__popupStatus?.(msg); } catch { /* noop */ }
  dbg.log('[Map]', msg);
}

function _showLibraryPopup(lib) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#12141c;border:1px solid #242836;border-radius:8px;padding:16px;max-width:420px;width:90%;max-height:70vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="color:#e6e8ee;font-size:14px;margin:0;">📂 Saved Maps (${lib.length})</h3>
        <button id="_lib-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">✕</button>
      </div>
      <div id="_lib-list"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_lib-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const list = overlay.querySelector('#_lib-list');
  for (const entry of lib) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #1e2030;';
    row.innerHTML = `
      <span style="flex:1;font-size:12px;color:#c0c5d2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${entry.name}</span>
      <span style="font-size:10px;color:#565c6e;">${new Date(entry.timestamp).toLocaleDateString()}</span>
      <button data-act="load" style="background:#3b82f6;padding:2px 8px;font-size:10px;border:none;border-radius:3px;color:#fff;cursor:pointer;">▶</button>
      <button data-act="delete" style="background:#ef4444;padding:2px 8px;font-size:10px;border:none;border-radius:3px;color:#fff;cursor:pointer;">✕</button>
    `;
    row.querySelector('[data-act="load"]').onclick = async () => {
      const full = await loadMap(entry.id);
      if (full) {
        const iframe = document.getElementById('map-maker-iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'load-terrain-data', mapData: full }, '*');
          _status('Loaded: ' + entry.name);
        } else {
          _status('Map Maker not loaded — open it first');
        }
      }
      overlay.remove();
    };
    row.querySelector('[data-act="delete"]').onclick = async () => {
      await deleteMap(entry.id);
      row.remove();
      _status('Deleted: ' + entry.name);
    };
    list.appendChild(row);
  }
}

// ── Listen for terrain data responses from the iframe ─────────────────
window.addEventListener('message', async (e) => {
  if (e.data && e.data.type === 'terrain-data-response' && e.data.mapData) {
    await saveMap(e.data.mapData);
    _status('✅ Saved: ' + e.data.mapData.name);
  }
});

// ── Controls ─────────────────────────────────────────────────────────
const meta = {
  controls: [
    // ── Embedded Map Maker ──
    { key: 'map-maker-frame', type: 'label', label: '🗺️ 3D Terrain Generator (embedded below)' },
    { key: 'sep-mm', label: '──────────', type: 'label' },

    // ── Save & Library ──
    { key: 'info-save', type: 'label', label: '💾 Save & Library (localStorage + cloud)' },
    { key: 'save-current', label: '💾 Save Current to Library', type: 'button', onClick: () => {
      const iframe = document.getElementById('map-maker-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'request-terrain-data' }, '*');
      } else {
        _status('Map Maker not loaded — open it first');
      }
    }},
    { key: 'load-library', label: '📂 Load from Library', type: 'button', onClick: () => {
      const lib = _getLocalLibrary();
      if (lib.length === 0) { _status('Library is empty'); return; }
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
