/**
 * Rigging Tools — Add bones, skeletons, pose controls,
 *                REMAP & EDIT (BoneRemapper-backed).
 */
import { renderControls } from '../_shared/renderControls.js';
import * as THREE from 'three';
import {
  isBoneLike, listBones, findBoneRoot, boneDepth,
  addBone as remapAddBone, deleteBone, renameBone, setBoneLength,
  findAndReplace, applyMapping, exportMapping,
  summarize,
} from '../../editor/BoneRemapper.js';

// Page-scoped studio accessor — the existing onClick handlers below
// reference `_getApp()` via closure; defining it here makes the lookup
// work regardless of how actionMap resolves string-coerced arrow keys.
// (Other feature pages each declare their own — this file is the same.)
function _getApp() {
  if (typeof window !== 'undefined') return window.ProModelerApp || null;
  return null;
}

const meta = {
  controls: [
    // ── Bones ──
    { key: 'info-bones', type: 'label', label: 'Add bones to the selected object:' },
    {
      key: 'add-bone',
      label: '🦴 Add Bone to Selected',
      type: 'button',
      onClick: () => { _getApp()?.addBone(); },
    },
    {
      key: 'add-skeleton',
      label: '🦴 Generate 3-Bone Chain',
      type: 'button',
      onClick: () => { _getApp()?.addSkeleton(); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ─── Pose Controls ──
    { key: 'info-pose', type: 'label', label: 'Pose & Transform Controls:' },
    {
      key: 'pose-move',
      label: '↕ Move Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('move'); },
    },
    {
      key: 'pose-rotate',
      label: '🔄 Rotate Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('rotate'); },
    },
    {
      key: 'pose-scale',
      label: '↔ Scale Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('scale'); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Mirror Pose ──
    {
      key: 'mirror-pose-x',
      label: 'Mirror Bone X',
      type: 'button',
      onClick: () => { _getApp()?.mirror('x'); },
    },
    {
      key: 'frame-bone',
      label: 'Frame Selected (Bone/Object)',
      type: 'button',
      onClick: () => { _getApp()?.frameSelected(); },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Visual Helpers ──
    { key: 'info-helpers', type: 'label', label: 'Helpers & Visibility:' },
    {
      key: 'toggle-wireframe',
      label: 'Toggle Wireframe View',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app) {
          app.setViewMode(app.viewMode === 'solid' ? 'wireframe' : 'solid');
          const btn = document.querySelector('#popupContent [data-key="toggle-wireframe"] .ctrl-button');
          if (btn) btn.textContent = app.viewMode === 'wireframe' ? '🔲 Solid View' : '🔲 Toggle Wireframe View';
        }
      },
    },
    {
      key: 'frame-all-rig',
      label: 'Frame All Objects',
      type: 'button',
      onClick: () => { _getApp()?.frameAll(); },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ─── Bone Transform Controls ──
    { key: 'info-bone-xform', type: 'label', label: '── Bone Transform (Position) ──' },
    {
      key: 'bone-pos-x', label: 'Bone X', type: 'number', default: 0, step: 0.1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.position.x = parseFloat(val); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-pos-y', label: 'Bone Y', type: 'number', default: 0, step: 0.1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.position.y = parseFloat(val); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-pos-z', label: 'Bone Z', type: 'number', default: 0, step: 0.1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.position.z = parseFloat(val); _getApp()?.render(); }
      },
    },

    { key: 'sep-bone-rot', type: 'label', label: '── Bone Rotation (degrees) ──' },
    {
      key: 'bone-rot-x', label: 'Rot X°', type: 'number', default: 0, step: 1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.rotation.x = THREE.MathUtils.degToRad(parseFloat(val)); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-rot-y', label: 'Rot Y°', type: 'number', default: 0, step: 1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.rotation.y = THREE.MathUtils.degToRad(parseFloat(val)); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-rot-z', label: 'Rot Z°', type: 'number', default: 0, step: 1,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.rotation.z = THREE.MathUtils.degToRad(parseFloat(val)); _getApp()?.render(); }
      },
    },

    { key: 'sep-bone-scale', type: 'label', label: '── Bone Scale ──' },
    {
      key: 'bone-scl-x', label: 'Scale X', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.scale.x = Math.max(0.01, parseFloat(val)); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-scl-y', label: 'Scale Y', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.scale.y = Math.max(0.01, parseFloat(val)); _getApp()?.render(); }
      },
    },
    {
      key: 'bone-scl-z', label: 'Scale Z', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => {
        const obj = _getApp()?.selectedObject;
        if (obj) { obj.scale.z = Math.max(0.01, parseFloat(val)); _getApp()?.render(); }
      },
    },

    { key: 'sep-bone-refresh', type: 'label', label: '──────' },
    {
      key: 'bone-refresh-ui',
      label: '🔄 Refresh Bone Values',
      type: 'button',
      onClick: () => {
        const obj = _getApp()?.selectedObject;
        if (!obj) return;
        ['pos-x','pos-y','pos-z'].forEach((k, i) => {
          const el = document.querySelector(`#popupContent [data-key="bone-${k}"]`);
          if (el) el.value = obj.position.toArray()[i].toFixed(3);
        });
        ['rot-x','rot-y','rot-z'].forEach((k, i) => {
          const el = document.querySelector(`#popupContent [data-key="bone-${k}"]`);
          if (el) el.value = THREE.MathUtils.radToDeg(obj.rotation.toArray()[i]).toFixed(1);
        });
        ['scl-x','scl-y','scl-z'].forEach((k, i) => {
          const el = document.querySelector(`#popupContent [data-key="bone-${k}"]`);
          if (el) el.value = obj.scale.toArray()[i].toFixed(3);
        });
      },
    },

    { key: 'sep5', type: 'label', label: '──────────' },

    // ── Tips ──
    { key: 'info-tip1', type: 'label', label: '💡 How to rig:' },
    { key: 'info-tip2', type: 'label', label: '1. Select an object (or create a new one)' },
    { key: 'info-tip3', type: 'label', label: '2. Click "Add Bone to Selected"' },
    { key: 'info-tip4', type: 'label', label: '3. Use Move/Rotate tools or bone sliders to pose' },
    { key: 'info-tip5', type: 'label', label: '4. Repeat to build a hierarchy' },
    { key: 'info-tip6', type: 'label', label: '5. Or use "Generate 3-Bone Chain" for a quick skeleton' },
  ],
  onApply: () => {},
};

export { meta };

export function render(container, state) {
  renderControls(container, meta.controls);
  _renderRemapPanel(container);
}

// ─────────────────────────────────────────────────────────────────
// Remap & Edit Bones panel — backed by ../../editor/BoneRemapper.js
// Every mutation calls studio.pushUndo / selectObject / render
// automatically; this UI just dispatches the right command.
// ─────────────────────────────────────────────────────────────────
function _renderRemapPanel(container) {
  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:10px;border-top:1px solid #444;padding:12px;display:flex;flex-direction:column;gap:8px;background:#181825;border-radius:6px;';

  panel.appendChild(_mkLabel('🦴 Remap & Edit Bones'));

  const status = document.createElement('div');
  status.style.cssText = 'font-size:11px;background:#222;padding:6px 10px;border-radius:4px;color:#888;border:1px solid #333;';
  status.textContent = 'Select a bone to begin.';
  panel.appendChild(status);
  const setStatus = (msg) => {
    status.textContent = msg;
    status.style.color = msg.startsWith('✓') ? '#7ee07e' : (msg.startsWith('✗') ? '#ff9090' : '#888');
  };

  // ── Hierarchy outliner ──
  panel.appendChild(_mkSubLabel('Bone Hierarchy'));
  const outlinerList = document.createElement('div');
  outlinerList.style.cssText = 'max-height:160px;overflow-y:auto;border:1px solid #333;border-radius:4px;background:#111;padding:2px;';
  panel.appendChild(outlinerList);
  panel.appendChild(_mkBtn('🔄 Refresh Hierarchy', () => { refreshOutliner(); refreshInfo(); }));

  // ── Selected bone info + name/length inputs ──
  panel.appendChild(_mkSubLabel('Selected Bone'));
  const infoRow = document.createElement('div');
  infoRow.style.cssText = 'font-size:11px;color:#ccc;background:#222;padding:6px 10px;border-radius:4px;font-family:monospace;';
  panel.appendChild(infoRow);
  const nameInput = _mkInput('New name (✏️ Rename)');
  panel.appendChild(nameInput);
  const lengthInput = _mkInput('Bone length (↕ Resize)', 'number');
  lengthInput.step = '0.1'; lengthInput.min = '0.05'; lengthInput.max = '50';
  panel.appendChild(lengthInput);

  // Action row created empty; buttons wire into nameInput/lengthInput by closure below.
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  // ── Bulk Find / Replace ──
  panel.appendChild(_mkSubLabel('Bulk Find ↔ Replace'));
  const findInput = _mkInput('Find (literal or regex)');
  const replaceInput = _mkInput('Replace');
  const regexRow = _mkCheckboxRow('Treat Find as regex');
  panel.appendChild(findInput);
  panel.appendChild(replaceInput);
  panel.appendChild(regexRow.wrap);
  panel.appendChild(_mkBtn('🔁 Apply Find/Replace', () => {
    const app = _getApp();
    const root = app?.scene;
    const find = findInput.value;
    if (!find) return setStatus('Type something to find.');
    const r = findAndReplace(app, root, find, replaceInput.value, { regex: regexRow.cb.checked });
    if (r.error) return setStatus('✗ Invalid regex pattern.');
    if (!r.renamed) return setStatus('No matching bone names.');
    setStatus(`✓ ${r.renamed} bone${r.renamed===1?'':'s'} renamed${r.skipped ? ` (${r.skipped} skipped)` : ''}.`);
    refreshOutliner(); refreshInfo();
  }, '#ffaa44'));

  // ── Mapping table ──
  panel.appendChild(_mkSubLabel('Mapping Table (oldName → newName)'));
  const mapRowsHost = document.createElement('div');
  mapRowsHost.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  panel.appendChild(mapRowsHost);
  const addMapRow = (oldVal = '', newVal = '') => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center;';
    const a = _mkInput('old bone name'); a.value = oldVal;
    const b = _mkInput('new bone name'); b.value = newVal;
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.style.cssText = 'color:#aaa;font-size:13px;flex-shrink:0;';
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Remove row';
    x.style.cssText = 'padding:6px 10px;border:none;border-radius:4px;background:#ff6b6b;color:#fff;cursor:pointer;font-size:13px;flex-shrink:0;';
    x.addEventListener('click', () => row.remove());
    row.appendChild(a); row.appendChild(arrow); row.appendChild(b); row.appendChild(x);
    mapRowsHost.appendChild(row);
  };
  addMapRow();
  const mapActions = document.createElement('div');
  mapActions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;';
  mapActions.appendChild(_mkBtn('➕ Add Row', () => addMapRow(), '#888'));
  mapActions.appendChild(_mkBtn('📑 Load From Bones', () => {
    mapRowsHost.innerHTML = '';
    const app = _getApp();
    const map = exportMapping(app?.scene);
    const names = Object.keys(map);
    for (const n of names) addMapRow(n, n);
    setStatus(`Loaded ${names.length} bone name${names.length===1?'':'s'} — edit right column then ✓ Apply All.`);
  }, '#888'));
  mapActions.appendChild(_mkBtn('✓ Apply All', () => {
    const app = _getApp();
    const mapping = {};
    for (const row of mapRowsHost.children) {
      const inputs = row.querySelectorAll('input[type="text"]');
      if (inputs?.length === 2 && inputs[0].value) {
        mapping[inputs[0].value] = inputs[1].value || inputs[0].value;
      }
    }
    if (!Object.keys(mapping).length) return setStatus('Mapping table is empty — add a row or use 📑 Load From Bones.');
    const r = applyMapping(app, app?.scene, mapping);
    if (r.applied) {
      setStatus(`✓ ${r.applied} applied${r.skipped ? `, ${r.skipped} skipped` : ''}.`);
    } else if (r.skipped) {
      setStatus(`✗ Nothing applied — ${r.skipped} conflicts (likely duplicate names).`);
    } else {
      setStatus('✗ No matching bone names in scene.');
    }
    refreshOutliner(); refreshInfo();
  }, '#b58cff'));
  panel.appendChild(mapActions);

  // ── Preset save / import ──
  panel.appendChild(_mkSubLabel('Mapping Preset'));
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'application/json,.json';
  fileInput.style.cssText = 'display:none;';
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      const mapping = data?.mapping && typeof data.mapping === 'object' ? data.mapping : {};
      if (!Object.keys(mapping).length) {
        setStatus('✗ No mapping object in JSON.');
      } else {
        const app = _getApp();
        const r = applyMapping(app, app?.scene, mapping);
        if (r.applied) {
          setStatus(`✓ Imported ${r.applied} rename${r.applied===1?'':'s'}${r.skipped ? ` (${r.skipped} skipped)` : ''}.`);
        } else if (r.skipped) {
          setStatus(`✗ Imported but ${r.skipped} skipped — likely duplicate names.`);
        } else {
          setStatus('No matching bone names in scene for this preset.');
        }
        refreshOutliner(); refreshInfo();
      }
    } catch (err) {
      setStatus(`✗ Import failed: ${err.message || String(err)}`);
    }
    fileInput.value = '';
  });
  presetRow.appendChild(_mkBtn('💾 Save (.json)', () => {
    const app = _getApp();
    const mapping = exportMapping(app?.scene);
    const payload = { mapping, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `bone-mapping_${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`✓ Downloaded ${Object.keys(mapping).length} bone name${Object.keys(mapping).length===1?'':'s'}.`);
  }, '#888'));
  presetRow.appendChild(_mkBtn('📥 Import (.json)', () => fileInput.click(), '#888'));
  panel.appendChild(presetRow);
  panel.appendChild(fileInput);

  // ── Action buttons (Add Child / Rename / Resize / Delete) ──
  actionRow.appendChild(_mkBtn('➕ Add Child', () => {
    const app = _getApp(); if (!app) return setStatus('Studio not ready.');
    const sel = app.selectedObject; if (!sel) return setStatus('Select a bone in the hierarchy (or a Group/Object in scene).');
    const r = remapAddBone(app, sel);
    setStatus(r ? `✓ Added ${r.name || 'bone'} under ${sel.name || '(unnamed)'}.` : '✗ Add failed.');
    if (r) { refreshOutliner(); refreshInfo(); }
  }, '#4a9eff'));
  actionRow.appendChild(_mkBtn('✏️ Rename', () => {
    const app = _getApp(); if (!app) return setStatus('Studio not ready.');
    const sel = app.selectedObject; if (!sel) return setStatus('Select a bone first.');
    const nameStr = (nameInput.value || '').trim();
    if (!nameStr) return setStatus('Type a new name above.');
    const r = renameBone(app, sel, nameStr);
    if (r.ok) {
      // Three.js AnimationMixer binds tracks on action.play() — a rename made
      // while an action is actively playing won't visually take effect until
      // the action is stopped and replayed. Hint at this so the user doesn't
      // think the rename silently failed.
      const props = r.propagations || 0;
      const clipHint = props > 0 ? ` (${props} clip track${props === 1 ? '' : 's'} updated — stop & replay animation to see effect)` : '';
      setStatus(`✓ Renamed${clipHint}.`);
      nameInput.value = '';
      refreshOutliner(); refreshInfo();
    } else {
      setStatus(`✗ ${r.reason || 'rename failed'}.`);
    }
  }, '#b58cff'));
  actionRow.appendChild(_mkBtn('↕ Resize', () => {
    const app = _getApp(); if (!app) return setStatus('Studio not ready.');
    const sel = app.selectedObject; if (!sel) return setStatus('Select a bone first.');
    const v = parseFloat(lengthInput.value);
    if (!isFinite(v) || v <= 0) return setStatus('Type a positive length above.');
    const ok = setBoneLength(app, sel, v);
    setStatus(ok ? `✓ Bone resized to length ${v.toFixed(2)}.` : '✗ Resize failed.');
    if (ok) refreshOutliner();
  }, '#ffaa44'));
  actionRow.appendChild(_mkBtn('🗑 Delete', () => {
    const app = _getApp(); if (!app) return setStatus('Studio not ready.');
    const sel = app.selectedObject; if (!sel) return setStatus('Select a bone first.');
    if (!window.confirm(`Delete bone "${sel.name || '(unnamed)'}"? Children will be re-parented to its parent.`)) return;
    const ok = deleteBone(app, sel);
    setStatus(ok ? '✓ Bone deleted (children re-parented).' : '✗ Delete failed.');
    if (ok) { refreshOutliner(); refreshInfo(); }
  }, '#ff6b6b'));
  panel.appendChild(actionRow);

  container.appendChild(panel);
  refreshOutliner();
  refreshInfo();

  // ── Internal helpers (close over panel, status, inputs) ──
  function refreshOutliner() {
    const app = _getApp();
    const sel = app?.selectedObject;
    const root = sel || app?.scene;
    outlinerList.innerHTML = '';
    if (!root) {
      const e = document.createElement('div');
      e.textContent = '(no studio)';
      e.style.cssText = 'color:#666;font-size:11px;padding:6px;';
      outlinerList.appendChild(e);
      return;
    }
    const bones = listBones(root);
    const rootBone = findBoneRoot(root) || root;
    if (!bones.length) {
      const e = document.createElement('div');
      e.textContent = '(no bones — click ➕ Add Child to create one)';
      e.style.cssText = 'color:#666;font-size:11px;padding:6px;';
      outlinerList.appendChild(e);
      return;
    }
    for (const b of bones) {
      const row = document.createElement('div');
      const d = boneDepth(b, rootBone);
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:3px;font-size:11px;font-family:monospace;cursor:pointer;';
      row.style.paddingLeft = `${6 + d * 14}px`;
      const isSelected = sel && b === sel;
      if (isSelected) {
        row.style.background = '#2a2a4e';
        row.style.color = '#9ec6ff';
      } else {
        row.addEventListener('mouseenter', () => { row.style.background = '#1a1a2e'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
        row.addEventListener('click', () => {
          try { app?.selectObject?.(b); } catch (_) { /* studio may not have selectObject */ }
          refreshOutliner(); refreshInfo();
        });
      }
      const tag = document.createElement('span');
      tag.textContent = b.isBone ? 'B' : 'G';
      tag.title = b.isBone ? 'THREE.Bone (from GLB)' : 'Group (studio bone)';
      tag.style.cssText = 'display:inline-block;width:18px;text-align:center;background:#333;color:#aaa;border-radius:2px;font-size:10px;flex-shrink:0;';
      const name = document.createElement('span');
      name.textContent = b.name || '(unnamed)';
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
      row.appendChild(tag); row.appendChild(name);
      outlinerList.appendChild(row);
    }
  }

  function refreshInfo() {
    const app = _getApp();
    const sel = app?.selectedObject;
    if (!sel) {
      infoRow.textContent = '(nothing selected)';
      nameInput.value = '';
      lengthInput.value = '1';
      return;
    }
    const tag = isBoneLike(sel) ? 'Bone' : 'Object';
    const kids = sel.children?.length || 0;
    const pos = sel.position;
    // Derive current tipY so the user sees the existing length and can
    // type the new one (instead of having the input reset to '1' on change).
    let tipY = 0;
    for (const c of sel.children || []) if (c.position.y > tipY) tipY = c.position.y;
    const currentLen = tipY > 0 ? tipY : 1;
    infoRow.textContent = `${sel.name || '(unnamed)'}  [${tag}]  children: ${kids}  len: ${currentLen.toFixed(2)}  pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
    nameInput.value = sel.name || '';
    lengthInput.value = currentLen.toFixed(2);
  }
}

// ─── DOM builders (module-scope, hoisted before _renderRemapPanel) ──
function _mkLabel(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:12px;color:#aaa;font-weight:600;';
  return el;
}
function _mkSubLabel(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:11px;color:#aaa;margin-top:6px;';
  return el;
}
function _mkInput(placeholder, type = 'text') {
  const el = document.createElement('input');
  el.type = type; el.placeholder = placeholder;
  el.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;font-size:12px;';
  return el;
}
function _mkBtn(label, onClick, bg = '#4a9eff') {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = `padding:8px 10px;border:none;border-radius:4px;background:${bg};color:#fff;cursor:pointer;font-size:12px;flex:1;min-width:80px;transition:filter .15s;`;
  b.addEventListener('mouseenter', () => { b.style.filter = 'brightness(1.15)'; });
  b.addEventListener('mouseleave', () => { b.style.filter = ''; });
  b.addEventListener('click', onClick);
  return b;
}
function _mkCheckboxRow(text) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#aaa;cursor:pointer;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.style.cssText = 'margin:0;accent-color:#4a9eff;';
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(text));
  return { wrap, cb };
}
