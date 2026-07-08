/**
 * maim.js — Model Assembly & Import Manager (MAIM)
 *
 * Central hub for importing 3D models, validating geometry integrity,
 * assembling multi-part models into the scene, and managing import history.
 * Supports GLTF/GLB, OBJ, STL, PLY, FBX via the shared ModelIO pipeline.
 */

import * as THREE from 'three';

/** History of imported models for undo/re-import */
const _importHistory = [];

/**
 * Import a model file and add it to the scene.
 * @param {File|Blob|string} source — File object or URL
 * @param {Object} opts
 * @param {THREE.Scene} opts.scene
 * @param {boolean} opts.center — center the model at origin (default true)
 * @param {boolean} opts.normalize — scale to unit bounding box (default true)
 * @returns {Promise<THREE.Group>} — the imported model group
 */
export async function importModel(source, opts = {}) {
  const { scene, center = true, normalize = true } = opts;

  // Use ModelIO if available
  const modelIO = window.ProModelerApp?.modelIO;
  if (modelIO) {
    const result = await modelIO.importFile(source, { frame: true, addToScene: true });
    _importHistory.push({ source, timestamp: Date.now(), name: result?.name || 'import' });
    return result;
  }

  // Fallback: direct Three.js loader
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    const onLoad = (gltf) => {
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) return reject(new Error('Empty glTF: no scenes found'));

      if (normalize) normalizeToUnitBox(root);
      if (center) centerAtOrigin(root);

      if (scene) scene.add(root);
      _importHistory.push({ source, timestamp: Date.now(), name: root.name || 'import' });
      resolve(root);
    };

    if (source instanceof File || source instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => loader.parse(reader.result, '', onLoad, reject);
      reader.readAsArrayBuffer(source);
    } else if (typeof source === 'string') {
      loader.load(source, onLoad, undefined, reject);
    } else {
      reject(new Error('Unsupported source type'));
    }
  });
}

/**
 * Validate a model's geometry for common issues.
 * @param {THREE.Object3D} root
 * @returns {{ valid: boolean, issues: string[], stats: Object }}
 */
export function validateModel(root) {
  const issues = [];
  let meshCount = 0;
  let totalVerts = 0;
  let hasMaterials = false;

  root.traverse(child => {
    if (child.isMesh) {
      meshCount++;
      const geo = child.geometry;
      if (geo.attributes.position) totalVerts += geo.attributes.position.count;
      if (child.material) hasMaterials = true;

      // Check for degenerate faces
      if (geo.index) {
        const idx = geo.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          if (idx[i] === idx[i+1] || idx[i+1] === idx[i+2] || idx[i] === idx[i+2]) {
            issues.push('Degenerate triangle at index ' + i + ' in mesh "' + child.name + '"');
            break;
          }
        }
      }

      // Check for NaN/Infinity in positions
      if (geo.attributes.position) {
        const pos = geo.attributes.position.array;
        for (let i = 0; i < pos.length; i++) {
          if (!isFinite(pos[i])) {
            issues.push('Non-finite vertex position in mesh "' + child.name + '"');
            break;
          }
        }
      }

      // Check bounding box validity
      geo.computeBoundingBox();
      if (geo.boundingBox) {
        const s = geo.boundingBox.getSize(new THREE.Vector3());
        if (s.length() < 0.0001) {
          issues.push('Zero-size bounding box in mesh "' + child.name + '"');
        }
      }
    }
  });

  if (meshCount === 0) issues.push('No meshes found in model');
  if (!hasMaterials) issues.push('No materials assigned');

  return { valid: issues.length === 0, issues, stats: { meshCount, totalVerts } };
}

/**
 * Assemble multiple imported models into a unified group.
 * @param {THREE.Object3D[]} parts
 * @param {Object} opts
 * @returns {THREE.Group}
 */
export function assembleModel(parts, opts = {}) {
  const group = new THREE.Group();
  group.name = opts.name || 'Assembled Model';
  for (const part of parts) group.add(part);
  if (opts.center !== false) centerAtOrigin(group);
  return group;
}

// ── Shared geometry helpers ──
function normalizeToUnitBox(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) obj.scale.setScalar(2 / maxDim);
}

function centerAtOrigin(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
}

export function getImportHistory() { return [..._importHistory]; }
export function clearImportHistory() { _importHistory.length = 0; }

export function maimInfo() {
  return {
    title: 'Model Assembly & Import Manager',
    description: 'Central hub for importing, validating, and assembling 3D models.',
    version: '2.0.0',
    supportedFormats: ['glTF', 'GLB', 'OBJ', 'STL', 'PLY', 'FBX'],
    features: ['import', 'validate', 'assemble', 'normalize', 'history']
  };
}