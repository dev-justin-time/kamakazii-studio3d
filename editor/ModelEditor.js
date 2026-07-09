/*
mod-editor.js (replacement)
Lightweight, safe mod-editor facade to provide import/export helpers and avoid
the previous merge-conflict import markers. Exposes minimal API used by the app.

Import/export is delegated to ModelIO for centralized format handling.
*/
import * as THREE from 'three';
import { normalizeImport } from './import-normalize.js';
import { ModelIO } from './ModelIO.js';

import { dbg } from '../app/dbg.js';

export class ModelEditor {
  constructor(scene, camera, renderer, controls, transformControls) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.transformControls = transformControls;
    this.objects = [];
    this.animations = [];
    this.mixer = null;

    // Multi-select support
    this.selectedObject = null;        // primary selection (backward compat)
    this.selectedObjects = new Set();  // all selected objects
    this._selectionListeners = [];     // callbacks for selection changes

    // Per-frame hook registry
    this._frameHooks = new Set();      // Set<fn(delta)>

    // Undo grouping
    this._undoGroupDepth = 0;
    this._undoGroupCommands = [];
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoSize = 50;

    // Centralized import/export via ModelIO
    this.modelIO = new ModelIO({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      objects: this.objects,
      pluginRegistry: null,
      ui: null,
      selectedObject: null,
      selectObject: (obj) => this.selectObject(obj),
      frameAtDistance: null,
      updateOutliner: null,
    });
    // Keep selectedObject reference live
    Object.defineProperty(this.modelIO.ctx, 'selectedObject', {
      get: () => this.selectedObject,
    });
  }

  // ── Import/Export delegated to ModelIO ──

  importGltfModel(source) {
    return this.modelIO.importFile(source, { normalize: true, frame: false });
  }

  importModel(source) {
    return this.modelIO.importFile(source, { normalize: true, frame: false });
  }

  async exportSelectedModel(format = 'glb') {
    const ext = format === 'glb' ? 'glb' : format;
    await this.modelIO.exportAs(format);
    return `export.${ext}`;
  }

  async exportSceneAsFormat(format = 'json') {
    if (format === 'json') {
      const data = { objects: this.scene.children.map(c => ({ name: c.name })) };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const name = 'scene.json';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      return name;
    }
    return this.exportSelectedModel(format);
  }

  // Minimal scene export used by UI save
  exportScene() {
    try {
      const data = {
        objects: this.scene.children.filter(c => c.userData && c.userData.isEditable).map(o => ({
          name: o.name || '',
          position: o.position ? o.position.toArray() : [0,0,0],
          scale: o.scale ? o.scale.toArray() : [1,1,1]
        }))
      };
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return '{}';
    }
  }

  // ── Per-frame editor hook system ──

  /**
   * Register a per-frame callback. Called every animation frame with (delta).
   * @param {function} fn - callback(delta: number)
   */
  registerFrameHook(fn) {
    if (typeof fn === 'function') this._frameHooks.add(fn);
  }

  /**
   * Unregister a previously registered per-frame callback.
   */
  unregisterFrameHook(fn) {
    this._frameHooks.delete(fn);
  }

  /**
   * Update method called every frame by the animation loop.
   * Advances the animation mixer and fires all registered frame hooks.
   */
  update(delta) {
    try {
      // Advance animation mixer
      if (this.mixer && typeof this.mixer.update === 'function') {
        this.mixer.update(delta);
      }

      // Fire all registered frame hooks (Set iteration is safe for concurrent delete)
      for (const hook of this._frameHooks) {
        try {
          hook(delta);
        } catch (hookErr) {
          dbg.warn('Frame hook error:', hookErr);
        }
      }
    } catch (e) {
      dbg.warn('ModelEditor.update error:', e);
    }
  }

  // Helpers kept for backward compat but no longer used by import/export
  _finalizeImported(root, nameHint) {
    const norm = normalizeImport(root, null, { targetSize: 5, faceCamera: false });
    const wrapper = norm.wrapper;
    wrapper.name = nameHint || root.name || 'Imported';
    wrapper.userData.isImported = true;
    this.scene.add(wrapper);
    this.objects.push(wrapper);
    try { if (typeof this.selectObject === 'function') this.selectObject(wrapper); } catch (e) {}
    return { wrapper, ...norm };
  }

  // ── Selection API ──

  /**
   * Select a single object (clears multi-select).
   * @param {THREE.Object3D|null} obj
   * @param {boolean} [addToGroup=false] - If true, add to multi-select set without clearing.
   */
  selectObject(obj, addToGroup = false) {
    if (!addToGroup) {
      // Clear previous multi-selection highlights
      for (const prev of this.selectedObjects) {
        this._removeSelectionHighlight(prev);
      }
      this.selectedObjects.clear();
    }

    this.selectedObject = obj;

    if (obj) {
      this.selectedObjects.add(obj);
      this._addSelectionHighlight(obj);
    }

    // Notify listeners
    this._fireSelectionChange();
  }

  /**
   * Toggle an object in/out of the multi-select group.
   */
  toggleSelectObject(obj) {
    if (!obj) return;
    if (this.selectedObjects.has(obj)) {
      this.selectedObjects.delete(obj);
      this._removeSelectionHighlight(obj);
      if (this.selectedObject === obj) {
        this.selectedObject = this.selectedObjects.values().next().value || null;
      }
    } else {
      this.selectedObjects.add(obj);
      this._addSelectionHighlight(obj);
      this.selectedObject = obj;
    }
    this._fireSelectionChange();
  }

  /**
   * Register a callback for selection changes.
   * @param {function} fn - callback({ selected, selectedObjects })
   */
  onSelectionChange(fn) {
    if (typeof fn === 'function') this._selectionListeners.push(fn);
  }

  _fireSelectionChange() {
    const data = {
      selected: this.selectedObject,
      selectedObjects: new Set(this.selectedObjects)
    };
    for (const fn of this._selectionListeners) {
      try { fn(data); } catch (e) { dbg.warn('Selection listener error:', e); }
    }
  }

  _addSelectionHighlight(obj) {
    if (!obj || obj.getObjectByName('__sel_highlight')) return;
    if (obj.isMesh && obj.geometry) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x4a9eff, side: THREE.BackSide, depthTest: false });
      const outline = new THREE.Mesh(obj.geometry, mat);
      outline.scale.copy(obj.scale).multiplyScalar(1.04);
      outline.name = '__sel_highlight';
      outline.renderOrder = 999;
      obj.add(outline);
    }
  }

  _removeSelectionHighlight(obj) {
    if (!obj) return;
    const highlight = obj.getObjectByName('__sel_highlight');
    if (highlight) {
      obj.remove(highlight);
      if (highlight.geometry) highlight.geometry.dispose();
      if (highlight.material) highlight.material.dispose();
    }
  }

  /**
   * Get all selected objects as an array.
   */
  getSelectedObjects() {
    return Array.from(this.selectedObjects);
  }

  /**
   * Get the center point of all selected objects (for multi-gizmo placement).
   */
  getSelectionCenter() {
    if (this.selectedObjects.size === 0) return new THREE.Vector3();
    const center = new THREE.Vector3();
    for (const obj of this.selectedObjects) {
      center.add(obj.position);
    }
    return center.divideScalar(this.selectedObjects.size);
  }

  // ── Undo Grouping (Batch Commands) ──

  /**
   * Begin an undo group. All pushUndo calls inside the group are batched
   * into a single undo/redo entry.
   */
  beginUndoGroup() {
    this._undoGroupDepth++;
  }

  /**
   * End an undo group. If depth returns to 0, the batch is committed.
   */
  endUndoGroup() {
    this._undoGroupDepth = Math.max(0, this._undoGroupDepth - 1);
    if (this._undoGroupDepth === 0 && this._undoGroupCommands.length > 0) {
      // Commit the batch as a single undo entry
      const batch = {
        type: 'batch',
        commands: [...this._undoGroupCommands],
        timestamp: Date.now()
      };
      this.undoStack.push(batch);
      if (this.undoStack.length > this.maxUndoSize) this.undoStack.shift();
      this.redoStack = [];
      this._undoGroupCommands = [];
    }
  }

  /**
   * Push an undo command. If inside an undo group, defers to the group.
   * @param {Object} command - { execute(), undo() } or any serializable state snapshot
   */
  pushUndo(command) {
    if (this._undoGroupDepth > 0) {
      this._undoGroupCommands.push(command);
      return;
    }
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxUndoSize) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const entry = this.undoStack.pop();
    this.redoStack.push(entry);
    if (entry.type === 'batch') {
      // Undo batch in reverse order
      for (let i = entry.commands.length - 1; i >= 0; i--) {
        if (entry.commands[i].undo) entry.commands[i].undo();
      }
    } else if (entry.undo) {
      entry.undo();
    }
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const entry = this.redoStack.pop();
    this.undoStack.push(entry);
    if (entry.type === 'batch') {
      for (const cmd of entry.commands) {
        if (cmd.execute) cmd.execute();
      }
    } else if (entry.execute) {
      entry.execute();
    }
  }

  // ── Delete / Duplicate (upgraded for multi-select) ──

  deleteSelectedObject() {
    const toDelete = this.selectedObjects.size > 0
      ? Array.from(this.selectedObjects)
      : (this.selectedObject ? [this.selectedObject] : []);

    if (toDelete.length === 0) return;

    this.beginUndoGroup();
    for (const obj of toDelete) {
      this.pushUndo({
        execute: () => { if (obj.parent) obj.parent.remove(obj); },
        undo: () => { this.scene.add(obj); }
      });
      if (obj.parent) obj.parent.remove(obj);
      this._removeSelectionHighlight(obj);
    }
    this.endUndoGroup();

    this.selectedObjects.clear();
    this.selectedObject = null;
    this._fireSelectionChange();
  }

  duplicateSelectedObject() {
    const toDuplicate = this.selectedObjects.size > 0
      ? Array.from(this.selectedObjects)
      : (this.selectedObject ? [this.selectedObject] : []);

    if (toDuplicate.length === 0) return null;

    const clones = [];
    this.beginUndoGroup();
    for (const obj of toDuplicate) {
      const c = obj.clone();
      c.position.x += 1;
      this.scene.add(c);
      this.objects.push(c);
      clones.push(c);
      this.pushUndo({
        execute: () => { this.scene.add(c); },
        undo: () => { this.scene.remove(c); }
      });
    }
    this.endUndoGroup();

    // Select the clones
    this.selectObject(clones[0]);
    for (let i = 1; i < clones.length; i++) {
      this.toggleSelectObject(clones[i]);
    }

    return clones.length === 1 ? clones[0] : clones;
  }
}