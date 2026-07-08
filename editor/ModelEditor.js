/*
mod-editor.js (replacement)
Lightweight, safe mod-editor facade to provide import/export helpers and avoid
the previous merge-conflict import markers. Exposes minimal API used by the app.
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { normalizeImport } from './import-normalize.js';

const gltfExporter = new GLTFExporter();
const objExporter = new OBJExporter();
const stlExporter = new STLExporter();

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
  }

  // Basic import for ArrayBuffer/File/url - uses GLTF loader when possible
  importGltfModel(source) {
    return new Promise((resolve, reject) => {
      try {
        if (source instanceof File) {
          const reader = new FileReader();            reader.onload = (e) => {
            const loader = new GLTFLoader();
            loader.parse(e.target.result, '', (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              const result = this._finalizeImported(root, source.name);
              resolve(result.wrapper);
            }, reject);
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(source);
          return;
        }

        if (typeof source === 'string') {
          const loader = new GLTFLoader();
          loader.load(source, (gltf) => {
            const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
            const result = this._finalizeImported(root, source.split('/').pop());
            resolve(result.wrapper);
          }, undefined, reject);
          return;
        }

        // support multi-file descriptor { url, files, name } with URLModifier
        if (source && typeof source === 'object' && source.url) {
          // If files map provided, use URLModifier to resolve external resources
          if (source.files && typeof source.files === 'object' && Object.keys(source.files).length >= 1) {
            // Isolated manager so URLModifier doesn't leak to DefaultLoadingManager
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
              const filename = url.split('/').pop().split('?')[0];
              if (source.files[filename]) return source.files[filename];
              if (url.startsWith('data:')) return url;
              const decoded = decodeURIComponent(filename);
              if (source.files[decoded]) return source.files[decoded];
              return url;
            });

            const loader = new GLTFLoader(manager);
            const draco = new DRACOLoader();
            draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(draco);

            const nameHint = source.name || source.url.split('/').pop() || 'Imported';
            const revokeAll = () => {
              Object.values(source.files).forEach(u => URL.revokeObjectURL(u));
            };

            loader.load(source.url, (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              const result = this._finalizeImported(root, nameHint);
              revokeAll();
              resolve(result.wrapper);
            }, undefined, (err) => {
              revokeAll();
              reject(err);
            });
          } else {
            // Single URL — use instance gltfLoader directly
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(source.url, (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              const result = this._finalizeImported(root, source.name || source.url.split('/').pop());
              resolve(result.wrapper);
            }, undefined, reject);
          }
          return;
        }

        reject(new Error('Unsupported GLTF source'));
      } catch (err) {
        reject(err);
      }
    });
  }

  // Small helper used by ImportExportManager fallback
  importModel(source) {
    const name = (source && source.name) || (typeof source === 'string' && source.split('/').pop()) || '';
    const ext = (name.split('.').pop() || '').toLowerCase();

    if (ext === 'gltf' || ext === 'glb' || typeof source === 'string' || (source && source.url)) {
      return this.importGltfModel(source);
    }
    // For OBJ/STL File, try to use GLTF loader fallback or fail gracefully
    return Promise.reject(new Error('No importer for this format in lightweight mod-editor'));
  }

  exportSelectedModel(format = 'glb') {
    return new Promise((resolve, reject) => {
      try {
        const obj = this._getSelectedOrScene();
        if (!obj) return reject(new Error('No object to export'));

        if (format === 'obj') {
          const data = objExporter.parse(obj);
          const blob = new Blob([data], { type: 'text/plain' });
          const name = 'export.obj';
          this._downloadBlob(blob, name);
          return resolve(name);
        }

        if (format === 'stl') {
          const data = stlExporter.parse(obj);
          const blob = new Blob([data], { type: 'application/sla' });
          const name = 'export.stl';
          this._downloadBlob(blob, name);
          return resolve(name);
        }

        // default to glb/gltf via GLTFExporter
        const binary = (format === 'glb');
        gltfExporter.parse(obj, (result) => {
          let blob;
          let name;
          if (binary) {
            blob = new Blob([result], { type: 'model/gltf-binary' });
            name = 'export.glb';
          } else {
            blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
            name = 'export.gltf';
          }
          this._downloadBlob(blob, name);
          resolve(name);
        }, { binary, onlyVisible: true });
      } catch (err) {
        reject(err);
      }
    });
  }

  exportSceneAsFormat(format = 'json') {
    return new Promise((resolve, reject) => {
      try {
        if (format === 'json') {
          const data = { objects: this.scene.children.map(c => ({ name: c.name })) };
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const name = 'scene.json';
          this._downloadBlob(blob, name);
          return resolve(name);
        }
        // fallback route to exportSelectedModel for other formats
        this.exportSelectedModel(format).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    });
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
          console.warn('Frame hook error:', hookErr);
        }
      }
    } catch (e) {
      console.warn('ModelEditor.update error:', e);
    }
  }

  // Helpers
  _finalizeImported(root, nameHint) {
    // Normalise scale + floor + XZ-centre via the shared import helper.
    // We skip face-camera here because ModelEditor does not own a camera;
    // callers (with access to the active camera) can re-call
    // normalizeImport(root, theirCamera) or use CameraManager.frameAtDistance.
    const norm = normalizeImport(root, null, {
      targetSize: 5,
      faceCamera: false,
    });
    const wrapper = norm.wrapper;
    wrapper.name = nameHint || root.name || 'Imported';
    wrapper.userData.isImported = true;
    if (norm.scaleFactor !== 1) wrapper.userData.importScaleFactor = norm.scaleFactor;

    this.scene.add(wrapper);
    this.objects.push(wrapper);
    // auto-select imported wrapper when possible
    try { if (typeof this.selectObject === 'function') this.selectObject(wrapper); } catch (e) {}
    return { wrapper, ...norm };
  }

  _getSelectedOrScene() {
    // Attempt to find a meaningful export target: selectedObject, else scene
    if (this.selectedObject) return this.selectedObject;
    return this.scene;
  }

  _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
      try { fn(data); } catch (e) { console.warn('Selection listener error:', e); }
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