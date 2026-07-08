/**
 * Inventory — Detailed object info, material details, geometry stats, live refresh
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Select an object to view its properties:' },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Object Info Panel ──
    { key: 'obj-info', type: 'label', label: 'No object selected. Click an object in the viewport first.' },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Refresh ──
    {
      key: 'refresh',
      label: '🔄 Refresh Object Info',
      type: 'button',
      onClick: () => {
        _refreshUI();
        // Also update scene info
        const app = _getApp();
        const si = document.querySelector('#popupContent [data-key="scene-info"] .ctrl-label');
        if (si && app) {
          const meshes = app.objects.filter(o => o.isMesh).length;
          const groups = app.objects.filter(o => o.isGroup).length;
          const lights = app.lights?.length || 0;
          const kfs = Array.from(app.keyframes.values()).reduce((s, kfs) => s + kfs.length, 0);
          si.textContent = `Scene: ${app.objects.length} objects (${meshes} meshes, ${groups} groups, ${lights} lights) · ${kfs} keyframes`;
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Quick Actions ──
    {
      key: 'frame-selected',
      label: 'Frame Selected Object',
      type: 'button',
      onClick: () => { _getApp()?.frameSelected(); },
    },
    {
      key: 'rename',
      label: '✏️ Rename Selected',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app?.selectedObject) return;
        const newName = prompt('Enter new name:', app.selectedObject.name);
        if (newName && newName.trim()) {
          app.selectedObject.name = newName.trim();
          _refreshUI();
        }
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Asset Stats ──
    { key: 'info-assets', type: 'label', label: 'Scene Stats:' },
    { key: 'scene-info', type: 'label', label: 'Scene: loading... Click Refresh to update.' },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Material Presets (fast access) ──
    { key: 'info-mats', type: 'label', label: 'Quick Material Presets:' },
    { key: 'mat-chrome', label: 'Chrome',  type: 'button', onClick: () => { _getApp()?.applyMaterial('chrome'); _refreshUI(); }},
    { key: 'mat-gold',   label: 'Gold',    type: 'button', onClick: () => { _getApp()?.applyMaterial('gold'); _refreshUI(); }},
    { key: 'mat-glass',  label: 'Glass',   type: 'button', onClick: () => { _getApp()?.applyMaterial('glass'); _refreshUI(); }},
    { key: 'mat-wood',   label: 'Wood',    type: 'button', onClick: () => { _getApp()?.applyMaterial('wood'); _refreshUI(); }},
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
