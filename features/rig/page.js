/**
 * Rigging Tools — Add bones, skeletons, pose controls
 */
import { renderControls } from '../_shared/renderControls.js';
import * as THREE from 'three';

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
}
