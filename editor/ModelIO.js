/**
 * ModelIO — Centralized model import/export hub for Kamakazii Studio 3D.
 *
 * This is the SINGLE source of truth for all 3D format operations.
 * Every other file (studio.js, engine.js, CloudSystem.js, pose/main.js)
 * must delegate imports through this module. No duplicate loader instances.
 *
 * Supported imports:  GLTF, GLB, OBJ, STL, PLY, FBX, Collada/DAE, k3dasset
 * Supported exports:  GLB, GLTF, OBJ, STL, PLY
 *
 * Usage:
 *   import { getModelIO } from '../editor/ModelIO.js';
 *   const io = await getModelIO(ctx);
 *   const wrapper = await io.importFile(file);
 *   await io.exportAs('glb', object);
 */

import * as THREE from 'three';
import { normalizeImport } from './import-normalize.js';
import { dbg } from '../app/dbg.js';

// ── Format tables ──────────────────────────────────────────────────────────

const IMPORT_EXTENSIONS = new Set([
  'gltf', 'glb', 'obj', 'stl', 'ply', 'fbx', 'dae', 'k3dasset',
]);

const EXPORT_FORMATS = new Map([
  ['glb',  { mime: 'model/gltf-binary',        ext: '.glb'  }],
  ['gltf', { mime: 'application/json',          ext: '.gltf' }],
  ['obj',  { mime: 'text/plain',                ext: '.obj'  }],
  ['stl',  { mime: 'application/sla',           ext: '.stl'  }],
  ['ply',  { mime: 'application/octet-stream',  ext: '.ply'  }],
]);

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/v1/decoders/';

// ── Helpers ────────────────────────────────────────────────────────────────

function _ext(name) {
  return (name || '').split('.').pop().toLowerCase().split('?')[0];
}

function _baseName(name) {
  return (name || 'model').replace(/\.[^/.]+$/, '');
}

function _isGltfLike(ext) {
  return ext === 'gltf' || ext === 'glb';
}

function _readAs(fn) {
  return {
    text(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => reject(new Error(`Failed to read ${file.name || 'file'} as text`));
        r.readAsText(file);
      });
    },
    arrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => reject(new Error(`Failed to read ${file.name || 'file'} as binary`));
        r.readAsArrayBuffer(file);
      });
    },
  };
}

// ── Lazy loader registry (singleton-style, loaded once) ────────────────────

let _loaders = null;
let _loadersPromise = null;

async function _ensureLoaders() {
  if (_loaders) return _loaders;
  if (_loadersPromise) return _loadersPromise;

  _loadersPromise = (async () => {
    const results = {};
    const errors = [];

    // Each loader is tried individually so one failure doesn't block others.
    // We still track failures so we can report which formats are unavailable.

    // GLTFLoader (required — most common format)
    try {
      const m = await import('three/addons/loaders/GLTFLoader.js');
      results.GLTFLoader = m.GLTFLoader;
    } catch (e) {
      errors.push('GLTFLoader: ' + (e.message || e));
    }

    // DRACOLoader (required for Draco-compressed GLTF)
    try {
      const m = await import('three/addons/loaders/DRACOLoader.js');
      results.DRACOLoader = m.DRACOLoader;
    } catch (e) {
      errors.push('DRACOLoader: ' + (e.message || e));
    }

    // OBJLoader
    try {
      const m = await import('three/addons/loaders/OBJLoader.js');
      results.OBJLoader = m.OBJLoader;
    } catch (e) {
      errors.push('OBJLoader: ' + (e.message || e));
    }

    // STLLoader
    try {
      const m = await import('three/addons/loaders/STLLoader.js');
      results.STLLoader = m.STLLoader;
    } catch (e) {
      errors.push('STLLoader: ' + (e.message || e));
    }

    // PLYLoader
    try {
      const m = await import('three/addons/loaders/PLYLoader.js');
      results.PLYLoader = m.PLYLoader;
    } catch (e) {
      errors.push('PLYLoader: ' + (e.message || e));
    }

    // FBXLoader
    try {
      const m = await import('three/addons/loaders/FBXLoader.js');
      results.FBXLoader = m.FBXLoader;
    } catch (e) {
      errors.push('FBXLoader: ' + (e.message || e));
    }

    // ColladaLoader
    try {
      const m = await import('three/addons/loaders/ColladaLoader.js');
      results.ColladaLoader = m.ColladaLoader;
    } catch (e) {
      errors.push('ColladaLoader: ' + (e.message || e));
    }

    // Exporters
    try {
      const m = await import('three/addons/exporters/GLTFExporter.js');
      results.GLTFExporter = m.GLTFExporter;
    } catch (e) {
      errors.push('GLTFExporter: ' + (e.message || e));
    }
    try {
      const m = await import('three/addons/exporters/OBJExporter.js');
      results.OBJExporter = m.OBJExporter;
    } catch (e) {
      errors.push('OBJExporter: ' + (e.message || e));
    }
    try {
      const m = await import('three/addons/exporters/STLExporter.js');
      results.STLExporter = m.STLExporter;
    } catch (e) {
      errors.push('STLExporter: ' + (e.message || e));
    }
    try {
      const m = await import('three/addons/exporters/PLYExporter.js');
      results.PLYExporter = m.PLYExporter;
    } catch (e) {
      errors.push('PLYExporter: ' + (e.message || e));
    }


    // Create the shared GLTFLoader instance (one per module lifetime).
    // Individual methods that need a custom LoadingManager (e.g. multi-file
    // glTF packages) still create their own via new L.GLTFLoader(manager).
    results._sharedGltfLoader = new results.GLTFLoader();
    if (results.DRACOLoader) {
      const draco = new results.DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      results._sharedGltfLoader.setDRACOLoader(draco);
    }

    // GLTF/GLB is the most important format — fail hard if unavailable.
    if (!results.GLTFLoader) {
      throw new Error(
        'GLTFLoader failed to load. Import/export requires GLTF support.\n' +
        'Errors: ' + errors.join('; ')
      );
    }

    if (!results.DRACOLoader) {
      dbg.warn('[ModelIO] DRACOLoader unavailable — Draco-compressed models will not load');
    }

    if (errors.length) {
      dbg.warn('[ModelIO] Some loaders unavailable: ' + errors.join('; '));
    }

    _loaders = results;
    return results;
  })();

  return _loadersPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ModelIO class
// ═══════════════════════════════════════════════════════════════════════════

const URL_FETCH_TIMEOUT_MS = 30000;

export class ModelIO {
  /**
   * @param {Object} ctx
   * @param {THREE.Scene}            ctx.scene
   * @param {THREE.Camera}           ctx.camera
   * @param {THREE.WebGLRenderer}    ctx.renderer
   * @param {Array}                  ctx.objects
   * @param {Object|null}            ctx.pluginRegistry
   * @param {Object|null}            ctx.ui           — UIManager with .log()
   * @param {function}               ctx.selectObject
   * @param {function}               ctx.frameAtDistance
   * @param {function}               ctx.updateOutliner
   */
  constructor(ctx) {
    if (!ctx || !ctx.scene) {
      throw new Error('ModelIO requires ctx with a valid THREE.Scene');
    }
    this.ctx = ctx;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  IMPORT
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Import a model from File, URL string, or multi-file package.
   *
   * @param {File|string|{url:string, files?:Object, name?:string}} source
   * @param {Object} [opts]
   * @param {function} [opts.onProgress]  — (loaded, total) => void
   * @param {boolean}  [opts.normalize=true]
   * @param {boolean}  [opts.frame=true]
   * @returns {Promise<THREE.Object3D>}
   */
  async importFile(source, opts = {}) {
    const L = await _ensureLoaders();

    const { normalize = true, frame = true, onProgress } = opts;
    const name = this._resolveName(source);
    const ext = _ext(name);

    let root;

    // ── Route to format-specific importer ──
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
        // Last-resort: try parsing as glTF ArrayBuffer
        root = await this._tryParseGltf(source, name);
      }
    } catch (err) {
      const msg = `Import failed for "${name}": ${err.message || err}`;
      this._log(msg, 'error');
      throw new Error(msg);
    }

    if (!root) {
      throw new Error(`Import returned empty result for "${name}"`);
    }

    // Ensure shadows on all meshes
    root.traverse(c => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });

    return this._finalizeImport(root, _baseName(name), { normalize, frame });
  }

  /**
   * Import multiple files at once.
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
          frame: i === list.length - 1,
        });
        results.push(wrapper);
      } catch (err) {
        dbg.warn(`[ModelIO] Batch skipped "${list[i].name}": ${err.message}`);
      }
    }
    if (results.length > 0) {
      this._log(`Batch imported ${results.length}/${list.length} files`, 'success');
    }
    return results;
  }

  /**
   * Import from URL string.
   * @param {string} url
   * @param {Object} [opts]
   * @returns {Promise<THREE.Object3D>}
   */
  async importURL(url, opts = {}) {
    return this.importFile(url, opts);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EXPORT
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Export an object (or scene) in the given format.
   * @param {'glb'|'gltf'|'obj'|'stl'|'ply'} format
   * @param {THREE.Object3D} [object] — defaults to selected or scene
   * @param {Object} [opts]
   * @param {string}  [opts.filename]
   * @param {boolean} [opts.download=true]
   * @returns {Promise<Blob>}
   */
  async exportAs(format, object, opts = {}) {
    const L = await _ensureLoaders();
    const { filename, download = true } = opts;

    const obj = object || this._getSelectedOrScene();
    if (!obj) throw new Error('No object to export');

    const fmt = EXPORT_FORMATS.get(format);
    if (!fmt) throw new Error(`Unsupported export format: ${format}`);

    let blob;
    switch (format) {
      case 'glb':
      case 'gltf': {
        if (!L.GLTFExporter) throw new Error('GLTFExporter not available');
        blob = await this._exportGLTF(obj, format === 'glb');
        break;
      }
      case 'obj': {
        if (!L.OBJExporter) throw new Error('OBJExporter not available');
        blob = this._exportOBJ(obj);
        break;
      }
      case 'stl': {
        if (!L.STLExporter) throw new Error('STLExporter not available');
        blob = this._exportSTL(obj);
        break;
      }
      case 'ply': {
        if (!L.PLYExporter) throw new Error('PLYExporter not available');
        blob = this._exportPLY(obj);
        break;
      }
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

  getSupportedExportFormats() {
    return Array.from(EXPORT_FORMATS.keys());
  }

  getSupportedImportExtensions() {
    return Array.from(IMPORT_EXTENSIONS);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FORMAT-SPECIFIC IMPORTERS
  // ════════════════════════════════════════════════════════════════════════

  /** Import GLTF/GLB from File or URL. */
  async _importGLTF(source, name, onProgress) {

    // File or Blob → read as ArrayBuffer → parse
    if (source instanceof File || source instanceof Blob) {
      const buf = await _readAs().arrayBuffer(source);
      return new Promise((resolve, reject) => {
        _loaders._sharedGltfLoader.parse(
          buf, '',
          (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
          reject,
        );
      });
    }

    // URL string → fetch → parse
    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Import timed out after ${URL_FETCH_TIMEOUT_MS / 1000}s: ${source}`));
        }, URL_FETCH_TIMEOUT_MS);

        _loaders._sharedGltfLoader.load(
          source,
          (gltf) => {
            clearTimeout(timeout);
            resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group());
          },
          onProgress ? (e) => onProgress(e.loaded, e.total) : undefined,
          (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        );
      });
    }

    // Multi-file package
    if (source && source.url) {
      return this._importGLTFMulti(source, onProgress);
    }

    throw new Error(`Invalid GLTF source: ${typeof source}`);
  }

  /** Import a multi-file glTF package (.gltf + .bin + textures). */
  async _importGLTFMulti(pkg, onProgress) {
    const L = await _ensureLoaders();

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

      const loader = new L.GLTFLoader(manager);
      if (L.DRACOLoader) {
        const draco = new L.DRACOLoader();
        draco.setDecoderPath(DRACO_DECODER_PATH);
        loader.setDRACOLoader(draco);
      }

      const revokeAll = () => {
        if (pkg.files) {
          Object.values(pkg.files).forEach(u => {
            try { URL.revokeObjectURL(u); } catch (_) {}
          });
        }
      };

      loader.load(
        pkg.url,
        (gltf) => {
          revokeAll();
          resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group());
        },
        onProgress ? (e) => onProgress(e.loaded, e.total) : undefined,
        (err) => {
          revokeAll();
          reject(err);
        },
      );
    });
  }

  /** Import OBJ from File or URL. */
  async _importOBJ(source, name, _onProgress) {
    const L = await _ensureLoaders();
    if (!L.OBJLoader) throw new Error('OBJLoader not available');

    if (source instanceof File || source instanceof Blob) {
      const text = await _readAs().text(source);
      const loader = new L.OBJLoader();
      return loader.parse(text);
    }

    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const loader = new L.OBJLoader();
        loader.load(source, resolve, undefined, reject);
      });
    }

    throw new Error('Invalid OBJ source');
  }

  /** Import STL from File or URL. Returns a Mesh wrapped in a Group. */
  async _importSTL(source, name, _onProgress) {
    const L = await _ensureLoaders();
    if (!L.STLLoader) throw new Error('STLLoader not available');

    const finish = (geom) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = _baseName(name);
      const group = new THREE.Group();
      group.add(mesh);
      group.name = mesh.name;
      return group;
    };

    if (source instanceof File || source instanceof Blob) {
      const buf = await _readAs().arrayBuffer(source);
      const loader = new L.STLLoader();
      return finish(loader.parse(buf));
    }

    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const loader = new L.STLLoader();
        loader.load(source, (geom) => resolve(finish(geom)), undefined, reject);
      });
    }

    throw new Error('Invalid STL source');
  }

  /** Import PLY from File or URL. */
  async _importPLY(source, name, _onProgress) {
    const L = await _ensureLoaders();
    if (!L.PLYLoader) throw new Error('PLYLoader not available');

    const finish = (geom) => {
      geom.computeVertexNormals();
      const hasColor = geom.hasAttribute('color');
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: hasColor,
        roughness: 0.5,
      });
      if (!hasColor) mat.color.set(0xaaaaaa);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = _baseName(name);
      const group = new THREE.Group();
      group.add(mesh);
      group.name = mesh.name;
      return group;
    };

    if (source instanceof File || source instanceof Blob) {
      const buf = await _readAs().arrayBuffer(source);
      const loader = new L.PLYLoader();
      return finish(loader.parse(buf));
    }

    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const loader = new L.PLYLoader();
        loader.load(source, (geom) => resolve(finish(geom)), undefined, reject);
      });
    }

    throw new Error('Invalid PLY source');
  }

  /** Import FBX from File or URL. */
  async _importFBX(source, name, _onProgress) {
    const L = await _ensureLoaders();
    if (!L.FBXLoader) throw new Error('FBXLoader not available');

    const finish = (fbxResult) => {
      const group = new THREE.Group();
      group.name = _baseName(name);

      if (!fbxResult) return group;

      // Transfer scene-level transforms
      if (fbxResult.position) group.position.copy(fbxResult.position);
      if (fbxResult.rotation) group.rotation.copy(fbxResult.rotation);
      if (fbxResult.scale) group.scale.copy(fbxResult.scale);

      // Move children from the FBX result into our wrapper group
      const children = [...(fbxResult.children || [])];
      for (const child of children) {
        group.add(child);
      }

      return group;
    };

    if (source instanceof File || source instanceof Blob) {
      const buf = await _readAs().arrayBuffer(source);
      const loader = new L.FBXLoader();
      return finish(loader.parse(buf, ''));
    }

    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const loader = new L.FBXLoader();
        loader.load(source, (result) => resolve(finish(result)), undefined, reject);
      });
    }

    throw new Error('Invalid FBX source');
  }

  /** Import Collada/DAE from File or URL. */
  async _importCollada(source, name, _onProgress) {
    const L = await _ensureLoaders();
    if (!L.ColladaLoader) throw new Error('ColladaLoader not available');

    const finish = (collada) => {
      const group = new THREE.Group();
      group.name = _baseName(name);

      if (!collada || !collada.scene) return group;

      // Transfer children
      const children = [...(collada.scene.children || [])];
      for (const child of children) {
        group.add(child);
      }

      // Transfer scene properties
      if (collada.scene.position) group.position.copy(collada.scene.position);
      if (collada.scene.rotation) group.rotation.copy(collada.scene.rotation);
      if (collada.scene.scale) group.scale.copy(collada.scene.scale);

      return group;
    };

    if (source instanceof File || source instanceof Blob) {
      const text = await _readAs().text(source);
      const loader = new L.ColladaLoader();
      return finish(loader.parse(text));
    }

    if (typeof source === 'string') {
      return new Promise((resolve, reject) => {
        const loader = new L.ColladaLoader();
        loader.load(source, (result) => resolve(finish(result)), undefined, reject);
      });
    }

    throw new Error('Invalid Collada source');
  }

  /** Try to parse unknown source as glTF (last-resort for ArrayBuffers). */
  async _tryParseGltf(source, name) {

    if (source instanceof ArrayBuffer || source instanceof Blob) {
      const buf = source instanceof Blob
        ? await _readAs().arrayBuffer(source)
        : source;

      return new Promise((resolve, reject) => {
        _loaders._sharedGltfLoader.parse(
          buf, '',
          (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
          () => reject(new Error(`Cannot parse "${name}" — unsupported format`)),
        );
      });
    }

    throw new Error(`Cannot determine format for: ${name}`);
  }

  /** Import .k3dasset bundle. */
  async _importK3dAsset(source, opts = {}) {
    let bundle;

    if (source instanceof File || source instanceof Blob) {
      const text = await _readAs().text(source);
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
  //  FORMAT-SPECIFIC EXPORTERS
  // ════════════════════════════════════════════════════════════════════════

  _exportGLTF(object, binary) {
    const L = _loaders;
    if (!L || !L.GLTFExporter) throw new Error('GLTFExporter not available');

    return new Promise((resolve, reject) => {
      const exporter = new L.GLTFExporter();
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
    const L = _loaders;
    if (!L || !L.OBJExporter) throw new Error('OBJExporter not available');
    const exporter = new L.OBJExporter();
    const data = exporter.parse(object);
    return new Blob([data], { type: 'text/plain' });
  }

  _exportSTL(object) {
    const L = _loaders;
    if (!L || !L.STLExporter) throw new Error('STLExporter not available');
    const exporter = new L.STLExporter();
    const data = exporter.parse(object, { binary: true });
    return new Blob([data], { type: 'application/sla' });
  }

  _exportPLY(object) {
    const L = _loaders;
    if (!L || !L.PLYExporter) throw new Error('PLYExporter not available');
    const exporter = new L.PLYExporter();
    const data = exporter.parse(object, { binary: true });
    return new Blob([data], { type: 'application/octet-stream' });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SCENE INTEGRATION
  // ════════════════════════════════════════════════════════════════════════

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

    // Frame camera
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

  _resolveName(source) {
    if (source instanceof File) return source.name;
    if (typeof source === 'string') return source.split('/').pop().split('?')[0];
    if (source && source.name) return source.name;
    if (source && source.url) return source.url.split('/').pop().split('?')[0];
    return 'model';
  }

  _getSelectedOrScene() {
    const ctx = this.ctx;
    if (ctx.selectedObject) return ctx.selectedObject;
    return ctx.scene;
  }

  // ── k3dasset helpers ──

  _itemToMesh(item) {
    if (!item || item.type !== 'mesh') return null;

    let geometry = null;
    if (item.geometry && item.geometry.parameters) {
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
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: 0x60a5fa, roughness: 0.3, metalness: 0.1,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.name || 'Asset Part';

    // Support both transform.position (k3dasset schema) and legacy position
    if (item.transform && item.transform.position) {
      mesh.position.fromArray(item.transform.position);
    } else if (item.position) {
      mesh.position.fromArray(item.position);
    }
    if (item.transform && item.transform.rotation) {
      mesh.rotation.fromArray(item.transform.rotation);
    } else if (item.rotation) {
      mesh.rotation.fromArray(item.rotation);
    }
    if (item.transform && item.transform.scale) {
      mesh.scale.fromArray(item.transform.scale);
    } else if (item.scale) {
      mesh.scale.fromArray(item.scale);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _parametricGeometry(p) {
    if (!p) return null;
    try {
      if (p.radiusTop !== undefined) {
        return new THREE.CylinderGeometry(
          p.radiusTop, p.radiusBottom ?? p.radiusTop,
          p.height ?? 1, p.radialSegments ?? 16,
        );
      }
      if (p.radius !== undefined) {
        return new THREE.SphereGeometry(p.radius, p.widthSegments ?? 24, p.heightSegments ?? 18);
      }
      if (p.width !== undefined && p.height !== undefined && p.depth !== undefined) {
        return new THREE.BoxGeometry(p.width, p.height, p.depth);
      }
      if (p.width !== undefined && p.height !== undefined) {
        return new THREE.PlaneGeometry(p.width, p.height);
      }
    } catch (_) {}
    return null;
  }

  // ── Utility ──

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

// ── Singleton ──────────────────────────────────────────────────────────────

let _singleton = null;

/**
 * Get or create the singleton ModelIO instance.
 * @param {Object} ctx — same as constructor
 * @returns {Promise<ModelIO>}
 */
export async function getModelIO(ctx) {
  if (_singleton) return _singleton;
  await _ensureLoaders();
  _singleton = new ModelIO(ctx);
  return _singleton;
}
