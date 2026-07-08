/**
 * Map Editor — Terrain generation with embedded Map Maker + save workflow
 *
 * Integrates the standalone 3D Terrain Generator (tools/map-maker) directly
 * into the studio via iframe, adding save-to-local and save-to-inventory.
 */
function _getApp() { return window.ProModelerApp; }

// ── Save / Inventory helpers ──

function _saveToLocal(terrainData) {
  try {
    const existing = JSON.parse(localStorage.getItem('kamakazii_map_library') || '[]');
    existing.push(terrainData);
    localStorage.setItem('kamakazii_map_library', JSON.stringify(existing));
    _status(`Saved "${terrainData.name}" to local library (${existing.length} maps)`);
  } catch (e) {
    _status('Save failed: ' + e.message);
  }
}

function _saveToInventory(terrainData) {
  const app = _getApp();
  if (!app) { _status('Studio not ready'); return; }

  // Create a terrain mesh from the heightmap data and add it to the scene
  const size = terrainData.size || 256;
  const heightData = terrainData.heightData;
  if (!heightData || heightData.length === 0) {
    _status('No heightmap data to save to inventory');
    return;
  }

  const geo = new THREE.PlaneGeometry(
    terrainData.worldSize || 20,
    terrainData.worldSize || 20,
    size - 1,
    size - 1
  );
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  const vertex = new THREE.Vector3();
  const heightScale = terrainData.height || 25;

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    const gx = Math.floor(((vertex.x / (terrainData.worldSize || 20)) + 0.5) * (size - 1));
    const gz = Math.floor(((vertex.z / (terrainData.worldSize || 20)) + 0.5) * (size - 1));
    const idx = gz * size + gx;
    if (idx >= 0 && idx < heightData.length) {
      posAttr.setY(i, heightData[idx] * heightScale);
    }
  }

  geo.computeVertexNormals();

  // Apply biome coloring if available
  const colors = new Float32Array(posAttr.count * 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute('color', colorAttr);

  const biomeColors = terrainData.biomeColors || [];
  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    const gx = Math.floor(((vertex.x / (terrainData.worldSize || 20)) + 0.5) * (size - 1));
    const gz = Math.floor(((vertex.z / (terrainData.worldSize || 20)) + 0.5) * (size - 1));
    const idx = gz * size + gx;
    const biomeIdx = idx * 3;
    if (biomeIdx >= 0 && biomeIdx + 2 < biomeColors.length) {
      colors[i * 3] = biomeColors[biomeIdx];
      colors[i * 3 + 1] = biomeColors[biomeIdx + 1];
      colors[i * 3 + 2] = biomeColors[biomeIdx + 2];
    } else {
      colors[i * 3] = 0.4;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 0.3;
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = terrainData.name || 'Imported Terrain';
  mesh.userData.mapMakerData = terrainData; // Store source data for re-editing

  app.scene.add(mesh);
  app.objects.push(mesh);
  app.selectObject(mesh);
  app.pushUndo();
  app.frameSelected?.();
  _status(`Added "${mesh.name}" to scene inventory`);
}

function _getLocalLibrary() {
  try {
    return JSON.parse(localStorage.getItem('kamakazii_map_library') || '[]');
  } catch { return []; }
}

function _deleteFromLocal(index) {
  try {
    const existing = _getLocalLibrary();
    existing.splice(index, 1);
    localStorage.setItem('kamakazii_map_library', JSON.stringify(existing));
    _status('Deleted from local library');
  } catch (e) {
    _status('Delete failed: ' + e.message);
  }
}

function _status(msg) {
  const el = document.getElementById('status-left');
  if (el) el.textContent = msg;
  console.log('[Map]', msg);
}

// ── UI Controls Meta ──

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

// ── Library popup ──

function _showLibraryPopup(lib) {
  const app = _getApp();
  if (!app) return;

  // Reuse the shell popup system if available
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1e1e2e;border-radius:8px;border:1px solid #444;min-width:360px;max-width:520px;max-height:70vh;overflow-y:auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:16px;font-weight:600;color:#eee;margin-bottom:16px;';
  header.textContent = `Local Map Library (${lib.length} maps)`;
  panel.appendChild(header);

  lib.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid #333;border-radius:6px;margin-bottom:8px;background:#16162a;';

    const info = document.createElement('div');
    info.innerHTML = `<div style="color:#eee;font-size:13px;font-weight:500">${entry.name || 'Unnamed'}</div>
      <div style="color:#888;font-size:11px">${entry.preset || 'default'} · ${entry.size || 256}×${entry.size || 256} · ${new Date(entry.savedAt).toLocaleDateString()}</div>`;
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;';

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load to Scene';
    loadBtn.style.cssText = 'padding:5px 12px;border:none;border-radius:4px;background:#4a9eff;color:#fff;font-size:11px;cursor:pointer;';
    loadBtn.addEventListener('click', () => {
      _saveToInventory(entry);
      overlay.remove();
    });
    btns.appendChild(loadBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'padding:5px 8px;border:none;border-radius:4px;background:#e74c3c;color:#fff;font-size:11px;cursor:pointer;';
    delBtn.addEventListener('click', () => {
      _deleteFromLocal(idx);
      row.remove();
    });
    btns.appendChild(delBtn);

    row.appendChild(btns);
    panel.appendChild(row);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'margin-top:12px;width:100%;padding:10px;border:none;border-radius:6px;background:#333;color:#ccc;font-size:13px;cursor:pointer;';
  closeBtn.addEventListener('click', () => overlay.remove());
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Listen for terrain data from the iframe ──
window.addEventListener('message', (e) => {
  if (e.data?.type === 'terrain-data-response') {
    const td = e.data.terrain;
    td.savedAt = Date.now();
    td.name = td.name || `Map ${new Date().toLocaleTimeString()}`;
    _saveToLocal(td);
    _saveToInventory(td);
  }
});

export { meta };
export function render(container, state) {
  container.innerHTML = '';

  // ── Embedded Map Maker iframe ──
  const frameWrap = document.createElement('div');
  frameWrap.style.cssText = 'width:100%;height:420px;border-radius:6px;overflow:hidden;border:1px solid #333;margin-bottom:16px;position:relative;';

  const iframe = document.createElement('iframe');
  iframe.id = 'map-maker-iframe';
  iframe.src = '../tools/map-maker/index.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'fullscreen';
  frameWrap.appendChild(iframe);

  // Overlay label
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.6);color:#4a9eff;font-size:10px;padding:3px 8px;border-radius:4px;pointer-events:none;font-family:monospace;';
  label.textContent = '🗺️ LIVE MAP MAKER';
  frameWrap.appendChild(label);

  // Save button overlay
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 Save to Library + Scene';
  saveBtn.style.cssText = 'position:absolute;top:8px;right:8px;background:#4a9eff;color:#fff;border:none;padding:6px 14px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s;';
  saveBtn.addEventListener('mouseenter', () => saveBtn.style.background = '#3a8eef');
  saveBtn.addEventListener('mouseleave', () => saveBtn.style.background = '#4a9eff');
  saveBtn.addEventListener('click', () => {
    iframe.contentWindow.postMessage({ type: 'request-terrain-data' }, '*');
  });
  frameWrap.appendChild(saveBtn);

  container.appendChild(frameWrap);

  // ── Render the controls from meta ──
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  meta.controls.forEach(ctrl => {
    if (ctrl.type === 'label') {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:12px;color:' + (ctrl.label.startsWith('  •') || ctrl.label.startsWith('─') ? '#555' : '#aaa');
      el.textContent = ctrl.label;
      form.appendChild(el);
      return;
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    if (ctrl.type === 'button') {
      const btn = document.createElement('button');
      btn.textContent = ctrl.label;
      btn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;';
      btn.addEventListener('mouseenter', () => btn.style.background = '#3a8eef');
      btn.addEventListener('mouseleave', () => btn.style.background = '#4a9eff');
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (ctrl.onClick) ctrl.onClick(); });
      row.appendChild(btn);
    } else if (ctrl.type === 'slider') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = ctrl.min ?? 0;
      inp.max = ctrl.max ?? 1;
      inp.step = ctrl.step ?? 0.01;
      inp.value = ctrl.default ?? 0.5;
      inp.style.cssText = 'width:100%;accent-color:#4a9eff;';
      const val = document.createElement('span');
      val.textContent = inp.value;
      val.style.cssText = 'font-size:11px;color:#888;text-align:right;';
      inp.addEventListener('input', () => { val.textContent = inp.value; if (ctrl.onChange) ctrl.onChange(parseFloat(inp.value)); });
      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(val);
    }

    form.appendChild(row);
  });

  container.appendChild(form);
}
