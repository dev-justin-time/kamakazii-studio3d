/**
 * Object Inspector — Real-time transform sliders, geometry stats, material info, hierarchy
 * Mirrors the reference implementation's mesh transform and object info panels
 */
import { renderControls } from '../_shared/renderControls.js';
import * as THREE from 'three';

const app = () => window.ProModelerApp;

function updateTransform(prop, axis, value) {
  const obj = app()?.selectedObject;
  if (!obj) return;
  const numVal = parseFloat(value);
  if (prop === 'position') obj.position[axis] = numVal;
  else if (prop === 'rotation') obj.rotation[axis] = THREE.MathUtils.degToRad(numVal);
  else if (prop === 'scale') obj.scale[axis] = Math.max(0.01, numVal);
  app().render();
}

function readTransform() {
  const obj = app()?.selectedObject;
  if (!obj) return null;
  return {
    name: obj.name || 'unnamed',
    type: obj.type,
    position: obj.position.toArray().map(v => +(v).toFixed(3)),
    rotation: obj.rotation.toArray().map(v => +(THREE.MathUtils.radToDeg(v)).toFixed(1)),
    scale: obj.scale.toArray().map(v => +(v).toFixed(3)),
    visible: obj.visible,
  };
}

function readObjectInfo() {
  const obj = app()?.selectedObject;
  if (!obj) return { message: 'No object selected' };
  const info = { name: obj.name, type: obj.type };
  if (obj.isMesh && obj.geometry) {
    const geo = obj.geometry;
    info.geometry = geo.type;
    info.vertices = geo.attributes.position?.count || 0;
    info.faces = geo.index ? Math.round(geo.index.count / 3) : Math.round((geo.attributes.position?.count || 0) / 3);
    info.uvs = !!geo.attributes.uv;
    info.vertexColors = !!geo.attributes.color;
  }
  if (obj.material) {
    const mat = obj.material;
    info.material = {
      type: mat.type,
      color: '#' + (mat.color?.getHexString() || 'ffffff'),
      metalness: mat.metalness ?? 0,
      roughness: mat.roughness ?? 0.5,
      transparent: !!mat.transparent,
      wireframe: !!mat.wireframe,
    };
  }
  info.children = obj.children.filter(c => !c.name.startsWith('__')).length;
  info.uuid = obj.uuid;
  return info;
}

const meta = {
  controls: [
    // ── Selection Info ──
    { key: 'insp-name', type: 'label', label: 'Name: —' },
    { key: 'insp-type', type: 'label', label: 'Type: —' },

    { key: 'sep1', type: 'label', label: '── Position ──' },
    {
      key: 'pos-x', label: 'X', type: 'number', default: 0, step: 0.1,
      onChange: (val) => updateTransform('position', 'x', val),
    },
    {
      key: 'pos-y', label: 'Y', type: 'number', default: 0, step: 0.1,
      onChange: (val) => updateTransform('position', 'y', val),
    },
    {
      key: 'pos-z', label: 'Z', type: 'number', default: 0, step: 0.1,
      onChange: (val) => updateTransform('position', 'z', val),
    },

    { key: 'sep2', type: 'label', label: '── Rotation (degrees) ──' },
    {
      key: 'rot-x', label: 'X°', type: 'number', default: 0, step: 1,
      onChange: (val) => updateTransform('rotation', 'x', val),
    },
    {
      key: 'rot-y', label: 'Y°', type: 'number', default: 0, step: 1,
      onChange: (val) => updateTransform('rotation', 'y', val),
    },
    {
      key: 'rot-z', label: 'Z°', type: 'number', default: 0, step: 1,
      onChange: (val) => updateTransform('rotation', 'z', val),
    },

    { key: 'sep3', type: 'label', label: '── Scale ──' },
    {
      key: 'scl-x', label: 'X', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => updateTransform('scale', 'x', val),
    },
    {
      key: 'scl-y', label: 'Y', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => updateTransform('scale', 'y', val),
    },
    {
      key: 'scl-z', label: 'Z', type: 'number', default: 1, step: 0.05, min: 0.01,
      onChange: (val) => updateTransform('scale', 'z', val),
    },

    { key: 'sep4', type: 'label', label: '──────' },
    {
      key: 'insp-reset-pos',
      label: '↺ Reset Position to Origin',
      type: 'button',
      onClick: () => {
        const obj = app()?.selectedObject;
        if (obj) { obj.position.set(0, 0, 0); app().render(); }
      },
    },
    {
      key: 'insp-reset-rot',
      label: '↺ Reset Rotation',
      type: 'button',
      onClick: () => {
        const obj = app()?.selectedObject;
        if (obj) { obj.rotation.set(0, 0, 0); app().render(); }
      },
    },
    {
      key: 'insp-reset-scale',
      label: '↺ Reset Scale to 1',
      type: 'button',
      onClick: () => {
        const obj = app()?.selectedObject;
        if (obj) { obj.scale.set(1, 1, 1); app().render(); }
      },
    },

    { key: 'sep5', type: 'label', label: '── Geometry Stats ──' },
    { key: 'insp-geo', type: 'label', label: 'Geometry: —' },
    { key: 'insp-verts', type: 'label', label: 'Vertices: —' },
    { key: 'insp-faces', type: 'label', label: 'Faces: —' },
    { key: 'insp-uvs', type: 'label', label: 'UVs: —' },
    { key: 'insp-vcol', type: 'label', label: 'Vertex Colors: —' },

    { key: 'sep6', type: 'label', label: '── Material ──' },
    { key: 'insp-mat-type', type: 'label', label: 'Type: —' },
    { key: 'insp-mat-color', type: 'label', label: 'Color: —' },
    { key: 'insp-mat-meta', type: 'label', label: 'Metalness: —' },
    { key: 'insp-mat-rough', type: 'label', label: 'Roughness: —' },

    { key: 'sep7', type: 'label', label: '──────' },
    { key: 'insp-children', type: 'label', label: 'Children: 0' },
    {
      key: 'insp-refresh',
      label: '🔄 Refresh Inspector',
      type: 'button',
      onClick: () => {
        const info = readObjectInfo();
        const transform = readTransform();
        if (info.message) {
          setLabel('insp-name', 'No object selected');
          return;
        }
        setLabel('insp-name', `Name: ${info.name}`);
        setLabel('insp-type', `Type: ${info.type}`);
        setLabel('insp-geo', `Geometry: ${info.geometry || '—'}`);
        setLabel('insp-verts', `Vertices: ${info.vertices ?? '—'}`);
        setLabel('insp-faces', `Faces: ${info.faces ?? '—'}`);
        setLabel('insp-uvs', `UVs: ${info.uvs ? '✅' : '❌'}`);
        setLabel('insp-vcol', `Vertex Colors: ${info.vertexColors ? '✅' : '❌'}`);
        setLabel('insp-children', `Children: ${info.children}`);
        if (info.material) {
          setLabel('insp-mat-type', `Type: ${info.material.type}`);
          setLabel('insp-mat-color', `Color: ${info.material.color}`);
          setLabel('insp-mat-meta', `Metalness: ${info.material.metalness.toFixed(2)}`);
          setLabel('insp-mat-rough', `Roughness: ${info.material.roughness.toFixed(2)}`);
        }
        if (transform) {
          setVal('pos-x', transform.position[0]);
          setVal('pos-y', transform.position[1]);
          setVal('pos-z', transform.position[2]);
          setVal('rot-x', transform.rotation[0]);
          setVal('rot-y', transform.rotation[1]);
          setVal('rot-z', transform.rotation[2]);
          setVal('scl-x', transform.scale[0]);
          setVal('scl-y', transform.scale[1]);
          setVal('scl-z', transform.scale[2]);
        }
      },
    },
  ],
  onApply: () => {},
};

function setLabel(key, text) {
  const el = document.querySelector(`#popupContent [data-key="${key}"]`);
  if (el) el.textContent = text;
}

function setVal(key, val) {
  const el = document.querySelector(`#popupContent [data-key="${key}"]`);
  if (el && el.type === 'number') el.value = typeof val === 'number' ? val.toFixed(3) : val;
}

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "inspector";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "inspector");
  }
renderControls(container, meta.controls);
  // Auto-refresh on next tick
  setTimeout(() => {
    const btn = document.querySelector('#popupContent [data-key="insp-refresh"]');
    if (btn) btn.click();
  }, 100);
  // Listen for selection changes
  const viewport = document.getElementById('viewport');
  if (viewport) {
    viewport.addEventListener('click', () => {
      const btn = document.querySelector('#popupContent [data-key="insp-refresh"]');
      if (btn) btn.click();
    });
  }
}
