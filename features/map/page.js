/* global _getApp */

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

// ── Helpers ────────────────────────────────────────────────────────────────

function _status(msg) {
  try { window.__popupStatus?.(msg); } catch { /* noop */ }
  dbg.log('[Map]', msg);
}

/**
 * Fetches the list of saved maps from storage.
 * Utilizes the imported `listMaps` function to satisfy ESLint and provide data.
 */
async function _getLocalLibrary() {
  try {
    return await listMaps();
  } catch (e) {
    dbg.warn('[Map] Failed to list maps:', e);
    return [];
  }
}

/**
 * Displays a modern, interactive popup to manage saved maps.
 */
function _showLibraryPopup(lib) {
  const overlay = document.createElement('div');
  overlay.id = 'map-lib-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  
  overlay.innerHTML = `
    <div style="background:#12141c;border:1px solid #242836;border-radius:8px;padding:20px;max-width:450px;width:90%;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #242836;padding-bottom:12px;">
        <h3 style="color:#e6e8ee;font-size:15px;margin:0;font-weight:600;">📂 Saved Maps (${lib.length})</h3>
        <button id="_lib-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1;">&times;</button>
      </div>
      <div id="_lib-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const closePopup = () => overlay.remove();
  overlay.querySelector('#_lib-close').onclick = closePopup;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

  const list = overlay.querySelector('#_lib-list');
  
  if (lib.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#565c6e;padding:20px;font-size:13px;">No saved maps found.</div>';
    return;
  }

  for (const entry of lib) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;background:#1a1d27;border:1px solid #242836;border-radius:6px;transition:background 0.2s;';
    row.onmouseenter = () => row.style.background = '#222633';
    row.onmouseleave = () => row.style.background = '#1a1d27';
    
    row.innerHTML = `
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:13px;color:#e6e8ee;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.name || 'Unnamed Map'}</div>
        <div style="font-size:11px;color:#565c6e;margin-top:2px;">${new Date(entry.timestamp).toLocaleString()}</div>
      </div>
      <button data-act="load" title="Load Map" style="background:#3b82f6;padding:6px 10px;font-size:11px;border:none;border-radius:4px;color:#fff;cursor:pointer;font-weight:600;">▶ Load</button>
      <button data-act="delete" title="Delete Map" style="background:#ef4444;padding:6px 10px;font-size:11px;border:none;border-radius:4px;color:#fff;cursor:pointer;font-weight:600;">✕</button>
    `;
    
    row.querySelector('[data-act="load"]').onclick = async () => {
      try {
        const full = await loadMap(entry.id);
        if (full) {
          const iframe = document.getElementById('map-maker-iframe');
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'load-terrain-data', mapData: full }, '*');
            _status('✅ Loaded: ' + entry.name);
          } else {
            _status('⚠️ Map Maker not loaded yet.');
          }
        }
      } catch (err) {
        dbg.error('[Map] Load failed:', err);
        _status('❌ Failed to load map.');
      }
      closePopup();
    };
    
    row.querySelector('[data-act="delete"]').onclick = async () => {
      if (confirm(`Delete "${entry.name}"? This cannot be undone.`)) {
        try {
          await deleteMap(entry.id);
          row.remove();
          _status('🗑️ Deleted: ' + entry.name);
          if (list.children.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#565c6e;padding:20px;font-size:13px;">No saved maps found.</div>';
          }
        } catch (err) {
          dbg.error('[Map] Delete failed:', err);
          _status('❌ Failed to delete map.');
        }
      }
    };
    
    list.appendChild(row);
  }
}

// ── Listen for terrain data responses from the iframe ──────────────────────
// Handles both Saving to Library and Exporting to JSON based on the payload flag.
window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  
  if (e.data.type === 'terrain-data-response' && e.data.mapData) {
    const mapData = e.data.mapData;
    try {
      if (e.data.exportRequested) {
        await exportMap(mapData); // Uses the imported exportMap function
        _status('✅ Exported: ' + (mapData.name || 'Map'));
      } else {
        await saveMap(mapData);
        _status('✅ Saved to Library: ' + (mapData.name || 'Map'));
      }
    } catch (err) {
      dbg.error('[Map] Storage operation failed:', err);
      _status('❌ Operation failed. Check console.');
    }
  }
});

// ── UI Builder ─────────────────────────────────────────────────────────────

/**
 * Builds the controls array dynamically based on the current application state.
 */
function buildControls(state = {}) {
  // Use state to display current map info if available
  const mapStatus = state.currentMapName ? `Current: ${state.currentMapName}` : 'No map loaded';

  return [
    { key: 'map-status', type: 'label', label: `🗺️ ${mapStatus}` },
    { key: 'sep0', type: 'label', label: '──────────' },

    // ── Embedded Map Maker ──
    { key: 'map-maker-frame', type: 'label', label: '🗺️ 3D Terrain Generator (embedded below)' },
    { key: 'sep-mm', label: '──────────', type: 'label' },

    // ── Save & Library ──
    { key: 'info-save', type: 'label', label: '💾 Save & Library' },
    { 
      key: 'save-current', 
      label: '💾 Save to Library', 
      type: 'button', 
      onClick: () => {
        const iframe = document.getElementById('map-maker-iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'request-terrain-data', exportRequested: false }, '*');
        } else {
          _status('⚠️ Map Maker not loaded yet.');
        }
      }
    },
    { 
      key: 'export-json', 
      label: '📄 Export as JSON', 
      type: 'button', 
      onClick: () => {
        const iframe = document.getElementById('map-maker-iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'request-terrain-data', exportRequested: true }, '*');
        } else {
          _status('⚠️ Map Maker not loaded yet.');
        }
      }
    },
    { 
      key: 'load-library', 
      label: '📂 Load from Library', 
      type: 'button', 
      onClick: async () => {
        const lib = await _getLocalLibrary();
        if (lib.length === 0) { _status('Library is empty'); return; }
        _showLibraryPopup(lib);
      }
    },
    { key: 'sep-save', label: '──────────', type: 'label' },

    // ── Valley Generator Parameters ──
    { key: 'info', type: 'label', label: 'Valley Generator Parameters:' },
    { key: 'valley-seed', label: 'Seed', type: 'slider', min: 0, max: 9999, step: 1, default: 0,
      onChange: (val) => _getApp()?.setValleyParam('seed', val) },
    { key: 'valley-amp', label: 'Amplitude', type: 'slider', min: 0.5, max: 5, step: 0.1, default: 2.5,
      onChange: (val) => _getApp()?.setValleyParam('amplitude', val) },
    { key: 'valley-ridges', label: 'Ridge Count', type: 'slider', min: 0, max: 8, step: 1, default: 3,
      onChange: (val) => _getApp()?.setValleyParam('ridgeCount', val) },
    { key: 'valley-seg', label: 'Segments', type: 'slider', min: 12, max: 128, step: 2, default: 48,
      onChange: (val) => _getApp()?.setValleyParam('segments', val) },
    { key: 'valley-noise', label: 'Noise Amount', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.15,
      onChange: (val) => _getApp()?.setValleyParam('noiseAmount', val) },
    { key: 'sep1', label: '──────────', type: 'label' },
    
    { 
      key: 'gen-valley', 
      label: '🏔 Generate Wireframe Valley', 
      type: 'button', 
      onClick: () => {
        const app = _getApp(); 
        if (!app) return;
        const seedWasZero = app._valleyParams?.seed === 0;
        if (seedWasZero && app._valleyParams) app._valleyParams.seed = Math.floor(Math.random() * 9999) + 1;
        app.generateWireframeValley?.();
        if (seedWasZero && app._valleyParams) app._valleyParams.seed = 0;
      }
    },
    { 
      key: 'rand-seed', 
      label: '🎲 Randomize Seed', 
      type: 'button', 
      onClick: () => {
        const app = _getApp(); 
        if (app?._valleyParams) {
          app._valleyParams.seed = Math.floor(Math.random() * 9999) + 1;
          _status('🎲 Seed randomized');
        }
      }
    },
    { key: 'sep1b', label: '──────────', type: 'label' },

    // ── City Scattering ──
    { 
      key: 'scatter-city', 
      label: '🌆 Scatter City on Valley', 
      type: 'button', 
      onClick: () => _getApp()?.scatterCity() 
    },
    { key: 'building-gap', label: 'Minimum Gap', type: 'slider', min: 0, max: 2, step: 0.05, default: 0,
      onChange: (val) => _getApp()?.setValleyParam('buildingGap', val) },
    { key: 'street-interval', label: 'Street Interval', type: 'slider', min: 0, max: 10, step: 1, default: 0,
      onChange: (val) => _getApp()?.setValleyParam('streetInterval', val) },
    { key: 'street-width', label: 'Street Width', type: 'slider', min: 1, max: 4, step: 1, default: 1,
      onChange: (val) => _getApp()?.setValleyParam('streetWidth', val) },
    { key: 'sep-street', label: '──────────', type: 'label' },

    // ── Utilities ──
    { key: 'select-buildings', label: '🏢 Select All Buildings', type: 'button', onClick: () => _getApp()?.selectAllBuildings() },
    { key: 'collision-grid', label: '🔲 Toggle Collision Grid', type: 'button', onClick: () => _getApp()?.toggleCollisionGrid() },
    { key: 'sep1ba', label: '──────────', type: 'label' },
    { key: 'frame-all', label: '🎯 Frame All', type: 'button', onClick: () => _getApp()?.frameAll() },
    { key: 'snap', label: '🧲 Snap Selected to Grid', type: 'button', onClick: () => _getApp()?.snapToGrid() },
    { key: 'sep1c', label: '──────────', type: 'label' },

    // ── Export 3D ──
    { key: 'export-valley-gltf', label: '📤 Export Valley as GLTF', type: 'button', onClick: () => _getApp()?.exportValleyAsGLTF() },
    { key: 'export-valley-glb',  label: '📤 Export Valley as GLB',  type: 'button', onClick: () => _getApp()?.exportValleyAsGLB() },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── External ──
    { 
      key: 'open-map-maker', 
      label: '🔗 Open Map Maker (new tab)', 
      type: 'button', 
      onClick: () => window.open('../tools/map-maker/index.html', '_blank') 
    },
  ];
}

// ── Exports ────────────────────────────────────────────────────────────────

const meta = {
  controls: buildControls(),
  onApply: () => {},
};

export { meta };

/**
 * Renders the Map Editor UI panel.
 * Uses the state parameter to display current map info and safely injects the iframe.
 */
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "map";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "map");
  }
// 1. Render controls using the dynamic builder
  const currentControls = buildControls(state);
  renderControls(container, currentControls);

  // 2. Inject the Map Maker iframe if it doesn't already exist
  const iframeId = 'map-maker-iframe';
  if (!document.getElementById(iframeId)) {
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'width:100%; height:400px; border:1px solid #242836; border-radius:6px; overflow:hidden; margin-top:12px; background:#000;';
    
    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.src = '../tools/map-maker/index.html';
    iframe.style.cssText = 'width:100%; height:100%; border:none;';
    iframe.title = '3D Terrain Generator';
    iframe.allow = 'cross-origin-isolated';
    
    iframeContainer.appendChild(iframe);
    
    // Insert after the controls
    const lastCtrl = container.querySelector('.ctrl-group:last-child') || container.lastChild;
    if (lastCtrl && lastCtrl.parentNode) {
      lastCtrl.parentNode.insertBefore(iframeContainer, lastCtrl.nextSibling);
    } else {
      container.appendChild(iframeContainer);
    }
  }
}