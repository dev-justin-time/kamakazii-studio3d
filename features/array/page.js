/* global _getApp, _refreshUI */

/**
 * Array — Linear, radial, and wave array modifiers with offset/animation
 */
import { renderControls } from '../_shared/renderControls.js';

// ── State ──────────────────────────────────────────────────────────────────
// Tracks user settings and references to generated clones for safe cleanup
const arrayState = {
  type: 'linear',
  count: 5,
  offset: 1.5,
  animate: false,
  generatedInstances: [] 
};

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Generates an array of cloned objects based on the current arrayState.
 */
function generateArray() {
  const app = _getApp();
  if (!app) return;

  const selected = app.selectedObject;
  if (!selected) {
    console.warn('[Array] No object selected.');
    return;
  }

  // Clear previous array instances before generating new ones
  clearArrayInstances();

  const { type, count, offset, animate } = arrayState;
  const instances = [];

  for (let i = 0; i < count; i++) {
    const clone = selected.clone();
    
    // Clone material so changes to instances don't affect the original
    if (clone.material) {
      clone.material = selected.material.clone();
    }

    clone.userData = { 
      ...selected.userData, 
      isArrayInstance: true, 
      arrayIndex: i,
      arrayAnimate: animate 
    };
    
    // Apply transformations based on array type
    switch (type) {
      case 'linear':
        clone.position.x = selected.position.x + (i + 1) * offset;
        break;
        
      case 'radial': {
        const angle = (i / count) * Math.PI * 2;
        clone.position.x = selected.position.x + Math.cos(angle) * offset;
        clone.position.z = selected.position.z + Math.sin(angle) * offset;
        clone.rotation.y = selected.rotation.y + angle;
        break;
      }
      
      case 'grid': {
        const cols = Math.ceil(Math.sqrt(count));
        const row = Math.floor(i / cols);
        const col = i % cols;
        clone.position.x = selected.position.x + col * offset;
        clone.position.z = selected.position.z + row * offset;
        break;
      }
      
      case 'wave': {
        clone.position.x = selected.position.x + (i + 1) * offset;
        // Sine wave on Y axis
        clone.position.y = selected.position.y + Math.sin((i + 1) * 0.8) * (offset * 0.5);
        break;
      }
    }

    app.scene.add(clone);
    instances.push(clone);
  }

  arrayState.generatedInstances = instances;
  _refreshUI();
}

/**
 * Removes only the generated array instances from the scene.
 */
function clearArrayInstances() {
  const app = _getApp();
  if (!app) return;

  arrayState.generatedInstances.forEach(inst => {
    if (inst.parent) inst.parent.remove(inst);
    // Free GPU memory
    if (inst.geometry) inst.geometry.dispose?.();
    if (inst.material) inst.material.dispose?.();
  });
  
  arrayState.generatedInstances = [];
  _refreshUI();
}

/**
 * Deletes the currently selected source object from the scene.
 */
function deleteSelected() {
  const app = _getApp();
  if (!app || !app.selectedObject) return;

  app.scene.remove(app.selectedObject);
  if (app.selectedObject.geometry) app.selectedObject.geometry.dispose?.();
  if (app.selectedObject.material) app.selectedObject.material.dispose?.();
  
  app.selectedObject = null;
  _refreshUI();
}

// ── UI Builder ─────────────────────────────────────────────────────────────

/**
 * Builds the controls array dynamically based on the current application state.
 */
function buildControls(state = {}) {
  const app = _getApp();
  const selected = state.selectedObject || app?.selectedObject;
  const instanceCount = arrayState.generatedInstances.length;

  return [
    { 
      key: 'array-info', 
      type: 'label', 
      label: selected ? `Target: ${selected.name || 'Object'}` : '⚠️ Select an object first' 
    },
    { key: 'sep0', type: 'label', label: '──────────' },
    
    { 
      key: 'array-type', 
      type: 'select', 
      label: 'Array Type', 
      default: arrayState.type, 
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'radial', label: 'Radial' },
        { value: 'grid', label: '2D Grid' },
        { value: 'wave', label: 'Wave' }
      ],
      onChange: (val) => { arrayState.type = val; }
    },
    { 
      key: 'array-count', 
      type: 'number', 
      label: 'Count', 
      default: arrayState.count,
      min: 1,
      max: 100,
      onChange: (val) => { arrayState.count = parseInt(val) || 1; }
    },
    { 
      key: 'array-offset', 
      type: 'slider', 
      label: 'Offset / Radius', 
      min: 0.1, 
      max: 10, 
      step: 0.1, 
      default: arrayState.offset,
      onChange: (val) => { arrayState.offset = parseFloat(val) || 1.5; }
    },
    { 
      key: 'array-animate', 
      type: 'toggle', 
      label: 'Animate Array (Phase Offset)', 
      default: arrayState.animate,
      onChange: (val) => { arrayState.animate = !!val; }
    },
    
    { key: 'sep1', type: 'label', label: '──────────' },
    
    { 
      key: 'apply-array', 
      type: 'button', 
      label: '✨ Generate Array', 
      disabled: !selected,
      onClick: () => { generateArray(); } 
    },
    { 
      key: 'clear-array', 
      type: 'button', 
      label: `🗑 Clear Instances (${instanceCount})`, 
      disabled: instanceCount === 0,
      onClick: () => { clearArrayInstances(); } 
    },
    
    { key: 'sep2', type: 'label', label: '──────────' },
    
    { 
      key: 'delete-selected', 
      type: 'button', 
      label: '❌ Delete Selected Object', 
      disabled: !selected,
      onClick: () => { deleteSelected(); }
    }
  ];
}

// ── Exports ────────────────────────────────────────────────────────────────

const meta = {
  controls: buildControls(),
  onApply: () => {},
};

export { meta };

export function render(container, state) {
  const currentControls = buildControls(state);
  renderControls(container, currentControls);
}