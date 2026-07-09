/**
 * ModelIO — Centralized model import/export hub for Kamakazii Studio 3D.
 *
 * Replaces scattered loader/exporter code across engine.js, studio.js,
 * ModelEditor.js, ImportExportManager.js, pose/main.js, and blender/script.js
 * with a single source of truth for all 3D format operations.
 *
 * Supported imports:  GLTF, GLB, OBJ, STL, PLY, FBX, Collada/DAE, 3DS, k3dasset
 * Supported exports:  GLB, GLTF, OBJ, STL, PLY
 *
 * Usage:
 *   const io = new ModelIO(ctx);
 *   const wrapper = await io.importFile(file);
 *   await io.exportAs('glb', object);
 */

import * as THREE from 'three';

// ── Loader classes (lazy-loaded to avoid importing all at startup) ──

let _GLTFLoader, _DRACOLoader, _OBJLoader, _STLLoader, _PLYLoader;
let _FBXLoader, _ColladaLoader, _ThreeGLTFExporter, _OBJExporter, _STLExporter, _PLYExporter;

const DRACO_PATH = 'https://www.gstatic.com/draco/v1/decoders/';

/** Lazy-load all loader/exporter classes on first use. Uses allSettled so one failing loader doesn't block others. */
async function _ensureLoaders() {
  if (_GLTFLoader) return; // already loaded
  const results = await Promise.allSettled([
    import('three/addons/loaders/GLTFLoader.js'),       // 0
    import('three/addons/loaders/DRACOLoader.js'),      // 1
    import('three/addons/loaders/OBJLoader.js'),        // 2
    import('three/addons/loaders/STLLoader.js'),        // 3
    import('three/addons/loaders/PLYLoader.js'),        // 4
    import('three/addons/loaders/FBXLoader.js'),        // 5
    import('three/addons/loaders/ColladaLoader.js'),    // 6
    import('three/addons/exporters/GLTFExporter.js'),   // 7
    import('three/addons/exporters/OBJExporter.js'),    // 8
    import('three/addons/exporters/STLExporter.js'),    // 9
    import('three/addons/exporters/PLYExporter.js'),    // 10
  ]);
  const get = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
  _GLTFLoader        = get(0)?.GLTFLoader      || null;
  _DRACOLoader       = get(1)?.DRACOLoader     || null;
  _OBJLoader         = get(2)?.OBJLoader       || null;
  _STLLoader         = get(3)?.STLLoader       || null;
  _PLYLoader         = get(4)?.PLYLoader       || null;
  _FBXLoader         = get(5)?.FBXLoader       || null;
  _ColladaLoader     = get(6)?.ColladaLoader   || null;
  _ThreeGLTFExporter = get(7)?.GLTFExporter    || null;
  _OBJExporter       = get(8)?.OBJExporter     || null;
  _STLExporter       = get(9)?.STLExporter     || null;
  _PLYExporter       = get(10)?.PLYExporter    || null;
  // Log any failures for debugging
  results.forEach((r, i) => {
    if (r.status === 'rejected') dbg.warn(`[ModelIO] Loader ${i} failed to load:`, r.reason);
  });
}

// ── Import normalization helper ──

import { normalizeImport, frameAtDistance } from './import-normalize.js';

// ── Format detection ──

const IMPORT_EXTENSIONS = new Set([
  'gltf', 'glb', 'obj', 'stl', 'ply', 'fbx', 'dae', '3ds', 'k3dasset',
]);

const EXPORT_FORMATS = new Map([
  ['glb',    { mime: 'model/gltf-binary',      ext: '.glb' }],
  ['gltf',   { mime: 'application/json',         ext: '.gltf' }],
  ['obj',    { mime: 'text/plain',               ext: '.obj' }],
  ['stl',    { mime: 'application/sla',           ext: '.stl' }],
  ['ply',    { mime: 'application/octet-stream',  ext: '.ply' }],
]);

function _ext(name) {
  return (name || '').split('.').pop().toLowerCase().split('?')[0];
}

function _baseName(name) {
  return (name || 'model').replace(/\.[^/.]+$/, '');
}

function _isGltfLike(ext) {
  return ext === 'gltf' || ext === 'glb';
}

// ── ModelIO class ──

import { dbg } from '../app/dbg.js';

export class ModelIO {
  /**
   * @param {Object} ctx — Application context.
   * @param {THREE.Scene}            ctx.scene
   * @param {THREE.PerspectiveCamera} ctx.camera
   * @param {THREE.WebGLRenderer}    ctx.renderer
   * @param {Array}                  ctx.objects         — scene object registry
   * @param {Object|null}            ctx.pluginRegistry  — PluginRegistry (optional)
   * @param {Object|null}            ctx.ui              — UIManager with .log() (optional)
   * @param {function}               ctx.selectObject    — (obj) => void
   * @param {function}               ctx.frameAtDistance  — (target, dist, elev, az) => void
   * @param {function}               ctx.updateOutliner  — () => void
   * @param {GLTFLoader}             [ctx.gltfLoader]    — optional pre-created loader
   */
  constructor(ctx) {
    if (!ctx || !ctx.scene) throw new Error('ModelIO requires ctx with a valid scene');
    this.ctx = ctx;

    // Reuse a pre-created GLTFLoader (with Draco) if the engine already has one.
    this._gltfLoader = ctx.gltfLoader || null;
    this._loadersReady = false;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  IMPORT — single entry point for all sources
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Import a model from any supported source.
   *
   * @param {File|string|{url:string, files?:Object, name?:string}} source
   * @param {Object} [opts]
   * @param {function} [opts.onProgress] — (loaded, total) => void
   * @param {boolean}  [opts.normalize=true] — run normalizeImport
   * @param {boolean}  [opts.frame=true]     — frame camera after import
   * @returns {Promise<THREE.Object3D>} — the imported wrapper/group
   */
  async importFile(source, opts = {}) {
    await _ensureLoaders();
    if (!this._gltfLoader) this._initGltfLoader();

    const { normalize = true, frame = true, onProgress } = opts;

    // ── Detect format ──
    const name = this._resolveName(source);
    const ext = _ext(name);

    // ── Route to format-specific importer ──
    let root;
    try {
      if (_isGltfLike(ext)) {
        root = await this._importGLTF(source, name, onProgress);
      } else if (ext === 'obj') {
        root = await this._importOBJ(source, name, onProgress);
      } else if (ext === 'stl') {
        root = await this._importSTL(source, name, onProgress);
      } else if (ext === 'ply') {
        root = await this._importPLY(source, name, onProgress);
      } else if (ext === 'fbx') {
        root = await this._importFBX(source, name, onProgress);
      } else if (ext === 'dae') {
        root = await this._importCollada(source, name, onProgress);
      } else if (ext === 'k3dasset') {
        return await this._importK3dAsset(source, opts);
      } else if (source && typeof source === 'object' && source.url && source.files) {
        // Multi-file glTF package (no extension, but has files map)
        root = await this._importGLTFMulti(source, onProgress);
      } else {
        // Last-resort: try glTF parser (e.g. ArrayBuffer without name)
        root = await this._tryParseGltf(source, name, onProgress);
      }
    } catch (err) {
      const msg = `Import failed (${name}): ${err.message || err}`;
      this._log(msg, 'error');
      throw new Error(msg);
    }

    // ── Ensure shadows on all meshes ──
    root.traverse(c => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });

    // ── Normalize, add to scene, frame ──
    return this._finalizeImport(root, _baseName(name), { normalize, frame });
  }

  /**
   * Import multiple files at once (batch).
   * @param {FileList|File[]} files
   * @param {Object} [opts]
   * @returns {Promise<THREE.Object3D[]>}
   */
  async importBatch(files, opts = {}) {
    const results = [];
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      try {
        const wrapper = await this.importFile(list[i], {
          ...opts,
          frame: i === list.length - 1, // only frame on last file
        });
        results.push(wrapper);
      } catch (err) {
        dbg.warn(`[ModelIO] Batch import skipped ${list[i].name}: ${err.message}`);
      }
    }
    if (results.length > 0) {
      this._log(`Batch imported ${results.length}/${list.length} files`, 'success');
    }
    return results;
  }

  /**
   * Import from a URL string.
   * @param {string} url
   * @param {Object} [opts]
   * @returns {Promise<THREE.Object3D>}
   */
  async importURL(url, opts = {}) {
    const name = url.split('/').pop().split('?')[0];
    return this.importFile(url, { ...opts, });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EXPORT — single entry point for all formats
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Export an object (or whole scene) in the given format.
   *
   * @param {'glb'|'gltf'|'obj'|'stl'|'ply'} format
   * @param {THREE.Object3D} [object] — defaults to selected or scene
   * @param {Object} [opts]
   * @param {string}  [opts.filename] — custom download filename
   * @param {boolean} [opts.download=true] — trigger download, or return blob
   * @returns {Promise<Blob>} the exported blob
   */
  async exportAs(format, object, opts = {}) {
    await _ensureLoaders();
    const { filename, download = true } = opts;

    const obj = object || this._getSelectedOrScene();
    if (!obj) throw new Error('No object to export');

    const fmt = EXPORT_FORMATS.get(format);
    if (!fmt) throw new Error(`Unsupported export format: ${format}`);

    let blob;
    switch (format) {
      case 'glb':
        blob = await this._exportGLTF(obj, true);
        break;
      case 'gltf':
        blob = await this._exportGLTF(obj, false);
        break;
      case 'obj':
        blob = this._exportOBJ(obj);
        break;
      case 'stl':
        blob = this._exportSTL(obj);
        break;
      case 'ply':
        blob = this._exportPLY(obj);
        break;
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    if (download) {
      const name = filename || `export${fmt.ext}`;
      this._downloadBlob(blob, name);
    }

    this._log(`Exported ${format.toUpperCase()}`, 'success');
    this._emit('onExport', { format, object: obj });
    return blob;
  }

  /**
   * Get list of supported export format keys.
   * @returns {string[]}
   */
  getSupportedExportFormats() {
    return Array.from(EXPORT_FORMATS.keys());
  }

  /**
   * Get list of supported import extensions.
   * @returns {string[]}
   */
  getSupportedImportExtensions() {
    return Array.from(IMPORT_EXTENSIONS);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FORMAT-SPECIFIC IMPORTERS (private)
  // ════════════════════════════════════════════════════════════════════════

  /** Initialize the shared GLTFLoader with Draco support. */
  _initGltfLoader() {
    this._gltfLoader = new _GLTFLoader();
    const draco = new _DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    this._gltfLoader.setDRACOLoader(draco);
  }

  /** Import GLTF/GLB from File or URL. */
  _importGLTF(source, name, onProgress) {
    if (!this._gltfLoader) throw new Error('GLTFLoader not available — initialization may have failed');
    return new Promise((resolve, reject) => {
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this._gltfLoader.parse(
            e.target.result, '',
            (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
            reject,
          );
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(source);
      } else if (typeof source === 'string') {
        this._gltfLoader.load(
          source,
          (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
          onProgress ? (e) => onProgress(e.loaded, e.total) : undefined,
          reject,
        );
      } else if (source && source.url) {
        // Multi-file package
        return this._importGLTFMulti(source, onProgress).then(resolve, reject);
      } else {
        reject(new Error('Invalid GLTF source'));
      }
    });
  }

  /** Import multi-file glTF package with URLModifier. */
  _importGLTFMulti(pkg, onProgress) {
    return new Promise((resolve, reject) => {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const filename = url.split('/').pop().split('?')[0];
        if (pkg.files[filename]) return pkg.files[filename];
        if (url.startsWith('data:')) return url;
        const decoded = decodeURIComponent(filename);
        if (pkg.files[decoded]) return pkg.files[decoded];
        return url;
      });

      const loader = new _GLTFLoader(manager);
      // Reuse Draco config from the shared loader if available, else create new
      if (this._gltfLoader && this._gltfLoader.dracoLoader) {
        loader.setDRACOLoader(this._gltfLoader.dracoLoader);
      } else if (_DRACOLoader) {
        const draco = new _DRACOLoader();
        draco.setDecoderPath(DRACO_PATH);
        loader.setDRACOLoader(draco);
      }

      const revokeAll = () => {
        if (pkg.files) Object.values(pkg.files).forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
      };

      loader.load(
        pkg.url,
        (gltf) => {
          const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
          revokeAll();
          resolve(root);
        },
        onProgress ? (e) => onProgress(e.loaded, e.total) : undefined,
        (err) => { revokeAll(); reject(err); },
      );
    });
  }

  /** Import OBJ from File or URL. */
  _importOBJ(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new _OBJLoader();
      const finish = (text) => {
        try {
          const group = loader.parse(text);
          resolve(group);
        } catch (err) { reject(err); }
      };
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => finish(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read OBJ file'));
        reader.readAsText(source);
      } else if (typeof source === 'string') {
        loader.load(source, resolve, onProgress ? (e) => onProgress(e.loaded, e.total) : undefined, reject);
      } else {
        reject(new Error('Invalid OBJ source'));
      }
    });
  }

  /** Import STL from File or URL. Returns a Mesh (not a Group). */
  _importSTL(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new _STLLoader();
      const finish = (geom) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = _baseName(name);
        const group = new THREE.Group();
        group.add(mesh);
        group.name = mesh.name;
        resolve(group);
      };
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try { finish(loader.parse(e.target.result)); }
          catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Failed to read STL file'));
        reader.readAsArrayBuffer(source);
      } else if (typeof source === 'string') {
        loader.load(source, finish, onProgress ? (e) => onProgress(e.loaded, e.total) : undefined, reject);
      } else {
        reject(new Error('Invalid STL source'));
      }
    });
  }

  /** Import PLY from File or URL. Returns a Mesh wrapped in a Group. */
  _importPLY(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new _PLYLoader();
      const finish = (geom) => {
        geom.computeVertexNormals();
        const hasColor = geom.hasAttribute('color');
        const mat = new THREE.MeshStandardMaterial({
          color: hasColor ? 0xffffff : 0xaaaaaa,
          vertexColors: hasColor,
          roughness: 0.5,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = _baseName(name);
        const group = new THREE.Group();
        group.add(mesh);
        group.name = mesh.name;
        resolve(group);
      };
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try { finish(loader.parse(e.target.result)); }
          catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Failed to read PLY file'));
        reader.readAsArrayBuffer(source);
      } else if (typeof source === 'string') {
        loader.load(source, finish, onProgress ? (e) => onProgress(e.loaded, e.total) : undefined, reject);
      } else {
        reject(new Error('Invalid PLY source'));
      }
    });
  }

  /** Import FBX from File or URL. */
  _importFBX(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new _FBXLoader();
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try { resolve(loader.parse(e.target.result, '')); }
          catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Failed to read FBX file'));
        reader.readAsArrayBuffer(source);
      } else if (typeof source === 'string') {
        loader.load(source, resolve, onProgress ? (e) => onProgress(e.loaded, e.total) : undefined, reject);
      } else {
        reject(new Error('Invalid FBX source'));
      }
    });
  }

  /** Import Collada/DAE from File or URL. */
  _importCollada(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new _ColladaLoader();
      const finish = (collada) => resolve(collada.scene);
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try { finish(loader.parse(e.target.result)); }
          catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Failed to read DAE file'));
        reader.readAsText(source);
      } else if (typeof source === 'string') {
        loader.load(source, finish, onProgress ? (e) => onProgress(e.loaded, e.total) : undefined, reject);
      } else {
        reject(new Error('Invalid Collada source'));
      }
    });
  }

  /** Try to parse unknown source as glTF (last-resort for ArrayBuffers/Blobs). */
  _tryParseGltf(source, name, onProgress) {
    return new Promise((resolve, reject) => {
      if (source instanceof ArrayBuffer) {
        // Already ArrayBuffer — parse directly
        this._gltfLoader.parse(
          source, '',
          (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
          () => reject(new Error(`Unsupported format: ${name}`)),
        );
      } else if (source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this._gltfLoader.parse(
            e.target.result, '',
            (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
            () => reject(new Error(`Unsupported format: ${name}`)),
          );
        };
        reader.onerror = () => reject(new Error(`Failed to read blob for: ${name}`));
        reader.readAsArrayBuffer(source);
      } else {
        reject(new Error(`Cannot determine format for: ${name}`));
      }
    });
  }

  /** Import .k3dasset bundle. */
  async _importK3dAsset(source, opts = {}) {
    let bundle;

    if (source instanceof File || source instanceof Blob) {
      const text = await this._readFileAsText(source);
      bundle = JSON.parse(text);
    } else if (typeof source === 'string') {
      const resp = await fetch(source);
      bundle = await resp.json();
    } else if (source && source.url) {
      const resp = await fetch(source.url);
      bundle = await resp.json();
    } else if (source && source.items) {
      bundle = source;
    } else {
      throw new Error('Unsupported .k3dasset source');
    }

    if (bundle.format !== 'k3dasset') {
      throw new Error('Invalid .k3dasset format');
    }

    const group = new THREE.Group();
    group.name = bundle.title || 'Imported Asset';

    for (const item of (bundle.items || [])) {
      const mesh = this._itemToMesh(item);
      if (mesh) group.add(mesh);
    }

    if (group.children.length === 0) {
      this._log('Bundle contained no reconstructable geometry', 'warning');
    }

    return this._finalizeImport(group, group.name, opts);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FORMAT-SPECIFIC EXPORTERS (private)
  // ════════════════════════════════════════════════════════════════════════

  _exportGLTF(object, binary) {
    return new Promise((resolve, reject) => {
      const exporter = new _ThreeGLTFExporter();
      exporter.parse(
        object,
        (result) => {
          const blob = new Blob(
            [binary ? result : JSON.stringify(result)],
            { type: binary ? 'model/gltf-binary' : 'application/json' },
          );
          resolve(blob);
        },
        (err) => reject(err),
        { binary, onlyVisible: true },
      );
    });
  }

  _exportOBJ(object) {
    const exporter = new _OBJExporter();
    const data = exporter.parse(object);
    return new Blob([data], { type: 'text/plain' });
  }

  _exportSTL(object) {
    const exporter = new _STLExporter();
    const data = exporter.parse(object, { binary: true });
    return new Blob([data], { type: 'application/sla' });
  }

  _exportPLY(object) {
    const exporter = new _PLYExporter();
    const data = exporter.parse(object, { binary: true });
    return new Blob([data], { type: 'application/octet-stream' });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SCENE INTEGRATION HELPERS (private)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Normalize, add to scene, select, frame, log, emit.
   * @param {THREE.Object3D} root
   * @param {string} name
   * @param {Object} opts
   * @returns {THREE.Object3D} wrapper
   */
  _finalizeImport(root, name, opts = {}) {
    const { normalize = true, frame = true } = opts;
    const ctx = this.ctx;

    root.name = name;

    let wrapper = root;
    let normResult = null;

    if (normalize) {
      normResult = normalizeImport(root, ctx.camera, {
        targetSize: 5,
        faceCamera: true,
      });
      wrapper = normResult.wrapper;
      wrapper.name = name;
    }

    // Ensure shadows
    wrapper.traverse(c => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });

    // Add to scene
    ctx.scene.add(wrapper);
    if (Array.isArray(ctx.objects)) {
      ctx.objects.push(wrapper);
    }

    // Select
    if (typeof ctx.selectObject === 'function') {
      ctx.selectObject(wrapper);
    }

    // Frame
    if (frame && typeof ctx.frameAtDistance === 'function') {
      const target = normResult
        ? new THREE.Vector3(0, normResult.bboxCenter.y, 0)
        : new THREE.Vector3(0, 0, 0);
      ctx.frameAtDistance(target, 10, 35, 25);
    }

    // Update outliner
    if (typeof ctx.updateOutliner === 'function') {
      ctx.updateOutliner();
    }

    // Log
    const sizeStr = normResult
      ? ` at ${normResult.bboxSize.x.toFixed(2)}×${normResult.bboxSize.y.toFixed(2)}×${normResult.bboxSize.z.toFixed(2)}`
      : '';
    this._log(`Imported ${name}${sizeStr}`, 'success');

    // Plugin hook
    this._emit('onImport', { source: name, object: wrapper });

    return wrapper;
  }

  /** Resolve name hint from various source types. */
  _resolveName(source) {
    if (source instanceof File) return source.name;
    if (typeof source === 'string') return source.split('/').pop().split('?')[0];
    if (source && source.name) return source.name;
    if (source && source.url) return source.url.split('/').pop().split('?')[0];
    return 'model';
  }

  /** Get the selected object or the whole scene for export. */
  _getSelectedOrScene() {
    const ctx = this.ctx;
    if (ctx.selectedObject) return ctx.selectedObject;
    return ctx.scene;
  }

  // ── k3dasset helpers (shared) ──

  _itemToMesh(item) {
    if (!item || item.type !== 'mesh') return null;

    let geometry = null;
    if (item.geometry?.parameters) {
      geometry = this._parametricGeometry(item.geometry.parameters);
    }
    if (!geometry) geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);

    let material = null;
    if (item.material) {
      const m = Array.isArray(item.material) ? item.material[0] : item.material;
      if (m) {
        material = new THREE.MeshStandardMaterial({
          color: m.color ?? 0x60a5fa,
          roughness: m.roughness ?? 0.3,
          metalness: m.metalness ?? 0.1,
        });
      }
    }
    if (!material) material = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3, metalness: 0.1 });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.name || 'Asset Part';
    if (item.position) mesh.position.fromArray(item.position);
    if (item.rotation) mesh.rotation.fromArray(item.rotation);
    if (item.scale) mesh.scale.fromArray(item.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _parametricGeometry(p) {
    if (!p) return null;
    try {
      if (p.radiusTop !== undefined) return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom ?? p.radiusTop, p.height ?? 1, p.radialSegments ?? 16);
      if (p.radius !== undefined) return new THREE.SphereGeometry(p.radius, p.widthSegments ?? 24, p.heightSegments ?? 18);
      if (p.width !== undefined && p.height !== undefined && p.depth !== undefined) return new THREE.BoxGeometry(p.width, p.height, p.depth);
      if (p.width !== undefined && p.height !== undefined) return new THREE.PlaneGeometry(p.width, p.height);
    } catch {}
    return null;
  }

  // ── Utility ──

  _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  _log(msg, type = 'info') {
    const ctx = this.ctx;
    if (ctx.ui && typeof ctx.ui.log === 'function') {
      ctx.ui.log(msg, type);
    } else {
      dbg.log(`[ModelIO] ${msg}`);
    }
  }

  _emit(hook, data) {
    const ctx = this.ctx;
    if (ctx.pluginRegistry && typeof ctx.pluginRegistry.emit === 'function') {
      ctx.pluginRegistry.emit(hook, data);
    }
  }
}
