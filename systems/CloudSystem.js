import * as THREE from 'three';
import { kv, fs, isPuterAvailable } from '../app/puter-client.js';

// Lazy-loaded format loaders — only resolved when needed
let _gltfLoader = null;
let _objLoader = null;
let _stlLoader = null;
let _plyLoader = null;
let _fbxLoader = null;

async function _getLoader(format) {
  switch (format) {
    case 'gltf':
    case 'glb': {
      if (!_gltfLoader) {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
        _gltfLoader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath(DRACO_DECODER_URL);
        _gltfLoader.setDRACOLoader(draco);
      }
      return _gltfLoader;
    }
    case 'obj': {
      if (!_objLoader) {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
        _objLoader = new OBJLoader();
      }
      return _objLoader;
    }
    case 'stl': {
      if (!_stlLoader) {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        _stlLoader = new STLLoader();
      }
      return _stlLoader;
    }
    case 'ply': {
      if (!_plyLoader) {
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
        _plyLoader = new PLYLoader();
      }
      return _plyLoader;
    }
    case 'fbx': {
      if (!_fbxLoader) {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        _fbxLoader = new FBXLoader();
      }
      return _fbxLoader;
    }
    default:
      return null;
  }
}

/**
 * Supported 3D file formats for Puter FS import.
 * Order matters: checked first = preferred.
 */
const SUPPORTED_FORMATS = [
  { ext: 'glb',  type: 'gltf' },
  { ext: 'gltf', type: 'gltf' },
  { ext: 'obj',  type: 'obj'  },
  { ext: 'stl',  type: 'stl'  },
  { ext: 'ply',  type: 'ply'  },
  { ext: 'fbx',  type: 'fbx'  },
];

/** DRACO decoder version for compressed glTF — bump when Three.js bundle updates */
const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

// ── KV key for asset catalog ──
const KV_CATALOG_KEY = 'cloud_asset_catalog';
const KV_SEEDED_KEY = 'cloud_asset_seeded';

/**
 * Default demo assets shown on first load (before any remote data).
 * These match what the old mock returned so existing UIManager code
 * (which calls this.studio.handleMenuAction(asset.generator) for models)
 * continues to work unchanged.
 */
const DEMO_ASSETS = [
  { id: 'c_bldg_01',  name: 'Cyberpunk Tower', type: 'model',  icon: 'fa-building',           generator: 'gen-building',   cost: 'Free' },
  { id: 'c_tree_01',  name: 'Elder Oak',        type: 'model',  icon: 'fa-tree',              generator: 'gen-tree',       cost: 'Free' },
  { id: 'c_rock_01',  name: 'Moon Rock',        type: 'model',  icon: 'fa-cube',              generator: 'gen-rock',       cost: 'Free' },
  { id: 'c_terrain_01', name: 'Alpine Terrain', type: 'model',  icon: 'fa-mountain',           generator: 'gen-terrain',    cost: 'Free' },
  { id: 'c_cloth_01', name: 'Silk Curtain',     type: 'physics',icon: 'fa-layer-group',        generator: 'add-cloth',      cost: 'Premium' },
  // Premium Voxel Assets
  { id: 'v_hero_01',  name: 'Voxel Hero',       type: 'voxel',  icon: 'fa-user-astronaut',     generator: 'gen-voxel-hero',  cost: 'Premium' },
  { id: 'v_castle_01',name: 'Voxel Keep',        type: 'voxel',  icon: 'fa-chess-rook',         generator: 'gen-voxel-castle',cost: 'Premium' },
  { id: 'v_mech_01',  name: 'Voxel Mech',       type: 'voxel',  icon: 'fa-robot',              generator: 'gen-voxel-mech',  cost: 'Premium' },
  { id: 'v_ship_01',  name: 'Space Cruiser',    type: 'voxel',  icon: 'fa-space-shuttle',      generator: 'gen-voxel-ship',  cost: 'Premium' },
  { id: 'v_tree_01',  name: 'Voxel Pine',       type: 'voxel',  icon: 'fa-tree',               generator: 'gen-voxel-tree',  cost: 'Premium' },
];

import { dbg } from '../app/dbg.js';

export class CloudSystem {
    constructor(studio) {
        this.studio = studio;
        this._seeded = false;
        /** Whether Puter SDK is available and was reachable on the last fetchAssets() call. */
        this._connected = false;
    }

    /**
     * Returns true if Puter was reachable during the last fetchAssets() call.
     * Does not perform a live check — use fetchAssets() to re-evaluate.
     */
    isConnected() { return this._connected; }

    /**
     * Manually set the connection state (used by UI to sync indicator after init).
     */
    _setConnected(val) { this._connected = val; }

    /* ── Public API ────────────────────────────────────────────────────── */

    /**
     * Fetch the asset catalog, with an optional category filter.
     * Returns a shallow copy of the catalog (or filtered subset) so callers
     * cannot accidentally mutate the backing store.
     *
     * When a `category` is provided, only assets whose `type` field matches
     * the given string are returned. This lets callers reduce data transfer
     * when only a specific asset type is needed (e.g. 'model', 'voxel', 'physics').
     *
     * Order of operations:
     *   1. Try Puter KV (cloud authoritative store)
     *   2. Fall back to localStorage
     *   3. Fall back to DEMO_ASSETS (baked-in defaults)
     *
     * @param {string} [category] - Optional asset type to filter by (e.g. 'model', 'voxel', 'physics').
     * @returns {Promise<Array>} Filtered copy of the catalog.
     */
    async fetchAssets(category) {
        // Idempotent guard — prevents concurrent requests from the same caller.
        // When a category is requested we still cache the full fetch, then apply
        // the filter to the resolved result so callers always get the subset.
        if (!this._fetching) {
            this._fetching = this._fetchAssetsImpl().finally(() => { this._fetching = null; });
        }
        const catalog = await this._fetching;

        if (category) {
            const filtered = catalog.filter(a => a.type === category);
            dbg.log(`[CloudSystem] Filtered catalog by type="${category}": ${filtered.length}/${catalog.length} assets`);
            return filtered;
        }

        return catalog;
    }

    async _fetchAssetsImpl() {
        dbg.log('[CloudSystem] Fetching asset catalog...');

        // 1. Try Puter KV
        if (isPuterAvailable()) {
            try {
                const raw = await kv.get(KV_CATALOG_KEY);
                if (raw && Array.isArray(raw) && raw.length > 0) {
                    dbg.log('[CloudSystem] Loaded catalog from Puter KV');
                    this._connected = true;
                    return raw.slice();
                }
                // KV responded but returned empty — still counts as connected
                this._connected = true;
            } catch (e) {
                dbg.warn('[CloudSystem] Puter KV read failed, falling back:', e);
                this._connected = false;
            }
        } else {
            this._connected = false;
        }

        // 2. Try localStorage (offline / Puter-unavailable fallback)
        try {
            const localRaw = localStorage.getItem(KV_CATALOG_KEY);
            if (localRaw) {
                const parsed = JSON.parse(localRaw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    dbg.log('[CloudSystem] Loaded catalog from localStorage');
                    return parsed;
                }
            }
        } catch (_) { /* localStorage unavailable or corrupt */ }

        // 3. Seed demo assets on first run so the UI is never empty
        dbg.log('[CloudSystem] No catalog found — using built-in demos');
        await this.seedDemoAssets();
        return DEMO_ASSETS.slice();
    }

    /**
     * Populate the cloud catalog with demo assets and attempt to sync to
     * remote KV. Safe to call multiple times — only seeds once per session.
     */
    async seedDemoAssets() {
        if (this._seeded) return;
        this._seeded = true;

        dbg.log('[CloudSystem] Seeding demo asset catalog...');

        // Write to localStorage unconditionally (fast, always works)
        try {
            localStorage.setItem(KV_CATALOG_KEY, JSON.stringify(DEMO_ASSETS));
            localStorage.setItem(KV_SEEDED_KEY, 'true');
        } catch (_) { /* quota exceeded etc. */ }

        // Attempt Puter KV write (fire-and-forget; don't block on remote)
        if (isPuterAvailable()) {
            try {
                await kv.set(KV_CATALOG_KEY, DEMO_ASSETS);
                await kv.set(KV_SEEDED_KEY, true);
                dbg.log('[CloudSystem] Demo catalog synced to Puter KV');
            } catch (e) {
                dbg.warn('[CloudSystem] Puter KV seed write failed:', e);
            }
        }
    }

    /**
     * Download (or generate) an asset by ID and import it into the scene.
     *
     * For **model** assets: delegates to this.studio.handleMenuAction() so the
     * editor's existing procedural generators (tree, rock, building, cloth, etc.)
     * create the geometry — exactly as the old mock did.
     *
     * For **voxel** assets: generates a Three.js group locally via the existing
     * procedural engine. In a later phase this could download actual asset data.
     */
    async downloadAndImport(assetId) {
        const catalog = await this.fetchAssets();
        const asset = catalog.find(a => a.id === assetId);
        if (!asset) throw new Error(`Asset "${assetId}" not found`);

        dbg.log(`[CloudSystem] Importing ${asset.name} (${asset.type})...`);

        // 1. Try to load from Puter FS: prefer native 3D file formats (glTF, OBJ, STL, PLY, FBX)
        //    over JSON parametric data. This is the "real 3D asset" pipeline.
        if (isPuterAvailable()) {
            // 1a. Try native 3D model formats first (glTF/GLB/OBJ/STL/PLY/FBX)
            //     Reads each file once — if it succeeds, the blob is passed directly
            //     to the import function to avoid double-downloading large models.
            for (const fmt of SUPPORTED_FORMATS) {
                const fsPath = `CloudAssets/${asset.id}.${fmt.ext}`;
                try {
                    const blob = await fs.read(fsPath); // throws if file doesn't exist
                    dbg.log(`[CloudSystem] Found ${fmt.ext} asset (${(blob.size / 1024).toFixed(1)} KB) at ${fsPath}`);
                    const imported = await this._importModelAsset(asset, fsPath, fmt.type, blob);
                    if (imported) return asset;
                } catch (_) {
                    // File doesn't exist or can't be read in this format — try next
                }
            }

            // 1b. Fall back to JSON bundle data (parametric geometry)
            const fsPath = `CloudAssets/${asset.id}.json`;
            try {
                const raw = await fs.readText(fsPath);
                if (raw) {
                    const assetData = JSON.parse(raw);
                    await this._importPuterAsset(asset, assetData);
                    return asset;
                }
            } catch (_) {
                // No FS data — fall through to generator
            }
        }

        // 2. Fall back to local procedural generation (original mock behaviour)
        if (asset.type === 'voxel') {
            this.generateVoxelAsset(asset.generator);
        } else {
            this.studio.handleMenuAction(asset.generator);
        }

        return asset;
    }

    /**
     * Re-upload the current demo catalog to Puter KV (overwrites any remote
     * data). Useful admin utility exposed so the user can force a sync.
     */
    async syncCatalogToCloud() {
        if (!isPuterAvailable()) {
            dbg.warn('[CloudSystem] Cannot sync: Puter unavailable');
            return false;
        }
        try {
            await kv.set(KV_CATALOG_KEY, DEMO_ASSETS);
            dbg.log('[CloudSystem] Catalog synced to Puter KV');
            return true;
        } catch (e) {
            dbg.warn('[CloudSystem] Catalog sync failed:', e);
            return false;
        }
    }

    /* ── Internal helpers ───────────────────────────────────────────────── */

    /**
     * Import a native 3D model file (glTF/GLB/OBJ/STL/PLY/FBX) from Puter FS.
     * Downloads the file content, parses it with the appropriate Three.js loader,
     * and adds the resulting object(s) to the scene.
     *
     * Generation stats are stored on the group's userData for the marketplace
     * preview system to reference (bundleData / poly count).
     */
    async _importModelAsset(asset, fsPath, format, blob) {
        if (!this.studio || !this.studio.scene) return false;

        dbg.log(`[CloudSystem] Loading ${format} asset from ${fsPath}...`);

        // Show loading state
        if (this.studio.ui?.log) {
            this.studio.ui.log(`Loading ${asset.name} (${(blob.size / 1024).toFixed(0)} KB ${format})...`, 'info');
        }

        try {
            if (!blob || blob.size === 0) {
                dbg.warn('[CloudSystem] Empty file:', fsPath);
                return false;
            }

            // ── Resolve the appropriate loader ──
            const loader = await _getLoader(format);
            if (!loader) {
                dbg.warn('[CloudSystem] No loader for format:', format);
                return false;
            }

            // ── Parse: create an object URL and load it ──
            const url = URL.createObjectURL(blob);
            let object;

            try {
                if (format === 'gltf' || format === 'glb') {
                    const gltfResult = await new Promise((resolve, reject) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                    object = gltfResult.scene || gltfResult;
                } else if (format === 'obj') {
                    object = await new Promise((resolve, reject) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                } else if (format === 'stl') {
                    // STLLoader returns a BufferGeometry
                    const geometry = await new Promise((resolve, reject) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0xaaaaaa,
                        roughness: 0.5,
                        metalness: 0.3,
                    });
                    object = new THREE.Mesh(geometry, mat);
                    object.castShadow = true;
                    object.receiveShadow = true;
                } else if (format === 'ply') {
                    const geometry = await new Promise((resolve, reject) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0xcccccc,
                        roughness: 0.4,
                        metalness: 0.2,
                    });
                    object = new THREE.Mesh(geometry, mat);
                    object.castShadow = true;
                    object.receiveShadow = true;
                } else if (format === 'fbx') {
                    object = await new Promise((resolve, reject) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                } else {
                    URL.revokeObjectURL(url);
                    return false;
                }
            } finally {
                URL.revokeObjectURL(url);
            }

            if (!object) {
                dbg.warn('[CloudSystem] Loader returned no object for', fsPath);
                return false;
            }

            // ── Prepare the imported object ──
            object.name = asset.name || format.toUpperCase() + ' Asset';
            object.userData = {
                ...object.userData,
                importedFrom: fsPath,
                importedFormat: format,
                importedAssetId: asset.id,
                importedAt: Date.now(),
            };

            // Compute total triangle count for status
            let triCount = 0;
            object.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const pos = child.geometry.attributes.position;
                    if (pos) {
                        triCount += pos.count / 3;
                    }
                }
            });

            // Auto-fit oversized models
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const diag = size.length();
            if (diag > 20) {
                const scale = 10 / diag;
                object.scale.setScalar(scale);
                dbg.log(`[CloudSystem] Scaled imported asset by ${scale.toFixed(3)} (was ${diag.toFixed(1)} units)`);
            } else if (diag < 0.1) {
                const scale = 2 / diag;
                object.scale.setScalar(scale);
            }

            // ── Add to scene ──
            this.studio.scene.add(object);
            this.studio.objects.push(object);
            this.studio.selectObject(object);
            this.studio.frameSelected();
            this.studio.ui.updateOutliner();

            const fmtLabel = format.toUpperCase();
            this.studio.ui.log(`Imported "${object.name}" (${fmtLabel}, ${triCount.toLocaleString()} tris)`, 'success');
            dbg.log(`[CloudSystem] Imported ${format} asset: ${object.name} (${triCount} tris)`);
            return true;

        } catch (e) {
            dbg.warn(`[CloudSystem] Failed to import ${format} asset ${fsPath}:`, e);
            if (this.studio.ui?.log) {
                this.studio.ui.log(`Failed to load ${asset.name}: ${e.message}`, 'error');
            }
            return false;
        }
    }

    /**
     * Import an asset that was downloaded from Puter FS (or other remote).
     * Reconstructs THREE geometry from the downloaded assetData and adds
     * it to the scene. Supports:
     *
     * - **Bundle format** — `assetData.items[]` with k3dasset-style items
     *   (geometry.parameters, material, position/rotation/scale)
     * - **Voxel format** — `assetData.voxels[]` with { x, y, z, color }
     * - **Single-item format** — a single item object with the same fields
     *   as a bundle item, stored directly (not wrapped in `items: [...]`)
     *
     * Falls through to procedural generation if assetData is malformed,
     * empty, or has no reconstructable geometry.
     */
    async _importPuterAsset(asset, assetData) {
        if (!assetData) {
            dbg.warn('[CloudSystem] No asset data for', asset.name, '— falling back to procedural generation');
            this._fallbackProcedural(asset);
            return;
        }

        dbg.log('[CloudSystem] Importing Puter FS asset:', asset.name);

        // ── Determine the format and collect items ──
        const items = [];

        if (Array.isArray(assetData.items) && assetData.items.length > 0) {
            // Bundle/k3dasset format
            items.push(...assetData.items);
        } else if (Array.isArray(assetData.voxels) && assetData.voxels.length > 0) {
            // Voxel data format — reconstruct from voxel definitions
            this._reconstructVoxels(asset, assetData.voxels);
            return;
        } else if (assetData.type === 'mesh' || assetData.geometry) {
            // Single-item format
            items.push(assetData);
        }

        // ── Reconstruct mesh items (textures are embedded in material data URIs) ──
        if (items.length > 0) {
            const meshes = [];
            for (const item of items) {
                const mesh = this._reconstructMesh(item);
                if (mesh) meshes.push(mesh);
            }

            if (meshes.length > 0) {
                const group = new THREE.Group();
                group.name = asset.name || 'Imported Asset';
                meshes.forEach(m => group.add(m));

                this.studio.scene.add(group);
                this.studio.objects.push(group);
                this.studio.selectObject(group);
                this.studio.frameSelected();
                this.studio.ui.updateOutliner();
                this.studio.ui.log(`Imported "${group.name}" (${meshes.length} mesh${meshes.length !== 1 ? 'es' : ''})`, 'success');
                return;
            }
        }

        // ── Fallback: procedural generation ──
        dbg.warn('[CloudSystem] No reconstructable geometry in asset data for', asset.name, '— using procedural fallback');
        this._fallbackProcedural(asset);
    }

    /**
     * Fall back to procedural generation for an asset.
     */
    _fallbackProcedural(asset) {
        if (asset.type === 'voxel') {
            this.generateVoxelAsset(asset.generator);
        } else {
            this.studio.handleMenuAction(asset.generator);
        }
    }

    /**
     * Reconstruct a single THREE.Mesh from a bundle item's serialized data.
     * Supports:
     *   - Full buffer geometry (format: 'buffer' with attributes.position.array, etc.)
     *   - Parametric geometries (Box, Sphere, Cylinder, Plane, Cone, Torus)
     *   - Falls back to a small placeholder box
     *
     * Also loads embedded textures from the assetData.textures map.
     */
    _reconstructMesh(item, textures) {
        if (!item || item.type === 'group') return null;

        // ── Geometry ──
        let geometry = null;
        if (item.geometry) {
            // 1a. Try full buffer reconstruction first (format === 'buffer')
            geometry = this._bufferGeometry(item.geometry);
            // 1b. Fall back to parametric reconstruction
            if (!geometry) {
                geometry = this._parametricGeometry(item.geometry.parameters || item.geometry);
            }
        }
        if (!geometry) {
            geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }

        // ── Material ──
        const matData = Array.isArray(item.material) ? item.material[0] : item.material;
        let material;
        if (matData) {
            const matOptions = {
                color: matData.color !== undefined ? matData.color : 0x60a5fa,
                roughness: matData.roughness ?? 0.3,
                metalness: matData.metalness ?? 0.1,
                transparent: !!matData.transparent,
                opacity: matData.opacity ?? 1,
                wireframe: !!matData.wireframe,
                emissive: matData.emissive ?? 0x000000,
                emissiveIntensity: matData.emissiveIntensity ?? 0,
            };

            // Load texture maps from embedded data URIs (serialized inline by AssetBundler)
            const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                                  'aoMap', 'emissiveMap', 'displacementMap', 'alphaMap',
                                  'bumpMap', 'specularMap', 'envMap'];
            for (const slot of textureSlots) {
                const texData = matData[slot];
                // texData is now an inline descriptor with { dataUri, uuid, width, height }
                if (texData && texData.dataUri) {
                    const tex = this._loadTextureFromDataUri(texData.dataUri);
                    if (tex) {
                        matOptions[slot] = tex;
                    }
                }
            }

            material = new THREE.MeshStandardMaterial(matOptions);
        } else {
            material = new THREE.MeshStandardMaterial({
                color: 0x60a5fa,
                roughness: 0.3,
                metalness: 0.1,
            });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = item.name || 'Asset Part';
        mesh.castShadow = item.castShadow !== false;
        mesh.receiveShadow = item.receiveShadow !== false;

        if (item.position) mesh.position.fromArray(Array.isArray(item.position) ? item.position : [0, 0, 0]);
        if (item.rotation) mesh.rotation.fromArray(Array.isArray(item.rotation) ? item.rotation : [0, 0, 0]);
        if (item.scale) mesh.scale.fromArray(Array.isArray(item.scale) ? item.scale : [1, 1, 1]);

        return mesh;
    }

    /**
     * Reconstruct a BufferGeometry from serialized buffer arrays.
     * Reads the `format: 'buffer'` geometry data and creates
     * BufferAttribute objects from the flat arrays.
     *
     * Expected format:
     *   {
     *     format: 'buffer',
     *     attributes: {
     *       position: { array: number[], itemSize: 3, count: N },
     *       normal:   { array: number[], itemSize: 3, count: N },
     *       uv:       { array: number[], itemSize: 2, count: N }
     *     },
     *     index: { array: number[], count: N }
     *   }
     */
    _bufferGeometry(geoData) {
        if (!geoData || geoData.format !== 'buffer') return null;
        if (!geoData.attributes?.position?.array) return null;

        try {
            const geometry = new THREE.BufferGeometry();

            // Restore each attribute from its flat array
            const attrNames = ['position', 'normal', 'uv', 'uv2', 'color', 'tangent'];
            for (const name of attrNames) {
                const attrData = geoData.attributes[name];
                if (attrData && attrData.array && attrData.array.length > 0) {
                    const typedArray = new Float32Array(attrData.array);
                    const attr = new THREE.BufferAttribute(
                        typedArray,
                        attrData.itemSize || 3,
                        !!attrData.normalized
                    );
                    geometry.setAttribute(name, attr);
                }
            }

            // Restore index buffer
            if (geoData.index && geoData.index.array && geoData.index.array.length > 0) {
                // Use Uint32Array for indices (handles > 65535 vertices)
                const idxArray = new Uint32Array(geoData.index.array);
                geometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
            }

            // Restore morph targets
            if (geoData.morphAttributes) {
                const morphNames = ['position', 'normal', 'uv'];
                for (const name of morphNames) {
                    const targets = geoData.morphAttributes[name];
                    if (targets && targets.length > 0) {
                        const morphAttrs = targets.map(t => {
                            const typedArray = new Float32Array(t.array);
                            return new THREE.BufferAttribute(typedArray, t.itemSize || 3);
                        });
                        geometry.morphAttributes[name] = morphAttrs;
                    }
                }
            }

            // Only compute normals if they weren't in the serialized data
            // to avoid overwriting carefully authored hard-edge normals
            if (!geoData.attributes?.normal) {
                geometry.computeVertexNormals();
            }
            return geometry;
        } catch (e) {
            dbg.warn('[CloudSystem] _bufferGeometry failed:', e.message);
            return null;
        }
    }

    /**
     * Load a THREE.Texture from a data URI (base64).
     * Used to reconstruct textures embedded in the asset bundle's `textures` map.
     */
    /**
     * Load a THREE.Texture from a data URI (base64).
     * Uses THREE.TextureLoader which handles async image decode correctly
     * and sets needsUpdate after the image loads.
     */
    _loadTextureFromDataUri(dataUri) {
        if (!dataUri || typeof dataUri !== 'string') return null;
        try {
            const loader = new THREE.TextureLoader();
            const texture = loader.load(dataUri);
            return texture;
        } catch (e) {
            dbg.warn('[CloudSystem] Texture load failed:', e.message);
            return null;
        }
    }

    /**
     * Try to recreate a Three.js geometry from serialized parameters.
     * Handles the standard parametric types exported by AssetBundler.
     */
    _parametricGeometry(params) {
        if (!params || typeof params !== 'object') return null;
        try {
            // CylinderGeometry (radiusTop, radiusBottom, height, radialSegments)
            if (params.radiusTop !== undefined) {
                return new THREE.CylinderGeometry(
                    params.radiusTop,
                    params.radiusBottom ?? params.radiusTop,
                    params.height ?? 1,
                    params.radialSegments ?? 16,
                    params.heightSegments ?? 1,
                    !!params.openEnded
                );
            }
            // SphereGeometry (radius, widthSegments, heightSegments)
            if (params.radius !== undefined) {
                return new THREE.SphereGeometry(
                    params.radius,
                    params.widthSegments ?? params.segments ?? 24,
                    params.heightSegments ?? 18
                );
            }
            // BoxGeometry (width, height, depth)
            if (params.width !== undefined && params.height !== undefined && params.depth !== undefined) {
                return new THREE.BoxGeometry(params.width, params.height, params.depth);
            }
            // PlaneGeometry (width, height)
            if (params.width !== undefined && params.height !== undefined) {
                return new THREE.PlaneGeometry(params.width, params.height);
            }
            // ConeGeometry (radius, height, radialSegments) — radiusTop is 0
            if (params.radius !== undefined && params.height !== undefined && params.radiusTop === undefined) {
                return new THREE.ConeGeometry(
                    params.radius,
                    params.height,
                    params.radialSegments ?? 16
                );
            }
            // TorusGeometry (radius, tube, radialSegments, tubularSegments)
            if (params.radius !== undefined && params.tube !== undefined) {
                return new THREE.TorusGeometry(
                    params.radius,
                    params.tube,
                    params.radialSegments ?? 16,
                    params.tubularSegments ?? 32
                );
            }
        } catch (e) {
            dbg.warn('[CloudSystem] _parametricGeometry failed:', e);
        }
        return null;
    }

    /**
     * Reconstruct voxel geometry from an array of voxel definitions.
     * Each voxel: { x, y, z, color } — creates a colored cube at that position.
     */
    _reconstructVoxels(asset, voxels) {
        const group = new THREE.Group();
        group.name = asset.name || 'Voxel Asset';

        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const materials = new Map();
        const getMat = (color) => {
            if (!materials.has(color)) {
                materials.set(color, new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.5,
                    metalness: 0.1,
                }));
            }
            return materials.get(color);
        };

        for (const v of voxels) {
            if (v.x === undefined || v.y === undefined || v.z === undefined) continue;
            const mesh = new THREE.Mesh(geometry, getMat(v.color ?? 0xcccccc));
            mesh.position.set(v.x * voxelSize, v.y * voxelSize, v.z * voxelSize);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        }

        if (group.children.length === 0) {
            dbg.warn('[CloudSystem] No valid voxels in asset data for', asset.name);
            this._fallbackProcedural(asset);
            return;
        }

        this.studio.scene.add(group);
        this.studio.objects.push(group);
        this.studio.selectObject(group);
        this.studio.ui.updateOutliner();
        this.studio.ui.log(`Imported "${group.name}" (${group.children.length} voxels)`, 'success');
    }

    generateVoxelAsset(type) {
        const group = new THREE.Group();
        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        
        // Optimize by reusing materials
        const materials = new Map();
        const getMat = (color) => {
            if (!materials.has(color)) {
                materials.set(color, new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 }));
            }
            return materials.get(color);
        };

        const addVoxel = (x, y, z, color) => {
            const mesh = new THREE.Mesh(geometry, getMat(color));
            mesh.position.set(x * voxelSize, y * voxelSize, z * voxelSize);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        };

        if (type === 'gen-voxel-hero') {
            group.name = 'Voxel Hero';
            // Legs
            for(let y=0; y<4; y++) { addVoxel(-1, y, 0, 0x3333cc); addVoxel(1, y, 0, 0x3333cc); }
            // Torso
            for(let x=-1; x<=1; x++) for(let y=4; y<7; y++) addVoxel(x, y, 0, 0xcc3333);
            // Head
            for(let x=-1; x<=1; x++) for(let y=7; y<9; y++) for(let z=-1; z<=0; z++) addVoxel(x, y, z, 0xffccaa);
        } else if (type === 'gen-voxel-castle') {
            group.name = 'Voxel Keep';
            // Base
            for(let x=-4; x<=4; x++) for(let z=-4; z<=4; z++) addVoxel(x, 0, z, 0x888888);
            // Walls
            for(let x=-4; x<=4; x++) for(let y=1; y<4; y++) {
                addVoxel(x, y, -4, 0x999999); addVoxel(x, y, 4, 0x999999);
                addVoxel(-4, y, x, 0x999999); addVoxel(4, y, x, 0x999999);
            }
            // Towers
            [[-4,-4], [-4,4], [4,-4], [4,4]].forEach(c => {
                for(let y=0; y<7; y++) {
                    addVoxel(c[0], y, c[1], 0x666666);
                    addVoxel(c[0]+(c[0]>0?-1:1), y, c[1], 0x666666);
                    addVoxel(c[0], y, c[1]+(c[1]>0?-1:1), 0x666666);
                }
            });
        } else if (type === 'gen-voxel-mech') {
            group.name = 'Voxel Mech';
            for(let i=0; i<60; i++) {
                const x = Math.round((Math.random()-0.5)*6);
                const y = Math.round(Math.random()*10);
                const z = Math.round((Math.random()-0.5)*6);
                // Mirror x
                addVoxel(x, y, z, 0x444444);
                addVoxel(-x, y, z, 0x444444);
            }
        } else if (type === 'gen-voxel-ship') {
            group.name = 'Space Cruiser';
            for(let z=-10; z<=10; z++) {
                const w = Math.max(1, 4 - Math.abs(z*0.3));
                for(let x=-w; x<=w; x++) {
                    addVoxel(x, 0, z, 0xeeeeee);
                    if (Math.abs(x)===Math.floor(w)) addVoxel(x, 1, z, 0x33aaff); // engines
                }
            }
        } else if (type === 'gen-voxel-tree') {
             group.name = 'Voxel Pine';
             for(let y=0; y<5; y++) addVoxel(0,y,0, 0x8b4513);
             for(let y=3; y<12; y++) {
                 const r = Math.max(1, (12-y)*0.5);
                 for(let x=-r; x<=r; x++) for(let z=-r; z<=r; z++) {
                     if(Math.random()>0.3) addVoxel(x,y,z, 0x228b22);
                 }
             }
        }

        this.studio.scene.add(group);
        this.studio.objects.push(group);
        this.studio.selectObject(group);
        this.studio.ui.updateOutliner();
    }
}