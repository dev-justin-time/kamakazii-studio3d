import * as THREE from 'three';
import { kv, fs, isPuterAvailable } from '../app/puter-client.js';

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
            console.log(`[CloudSystem] Filtered catalog by type="${category}": ${filtered.length}/${catalog.length} assets`);
            return filtered;
        }

        return catalog;
    }

    async _fetchAssetsImpl() {
        console.log('[CloudSystem] Fetching asset catalog...');

        // 1. Try Puter KV
        if (isPuterAvailable()) {
            try {
                const raw = await kv.get(KV_CATALOG_KEY);
                if (raw && Array.isArray(raw) && raw.length > 0) {
                    console.log('[CloudSystem] Loaded catalog from Puter KV');
                    this._connected = true;
                    return raw.slice();
                }
                // KV responded but returned empty — still counts as connected
                this._connected = true;
            } catch (e) {
                console.warn('[CloudSystem] Puter KV read failed, falling back:', e);
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
                    console.log('[CloudSystem] Loaded catalog from localStorage');
                    return parsed;
                }
            }
        } catch (_) { /* localStorage unavailable or corrupt */ }

        // 3. Seed demo assets on first run so the UI is never empty
        console.log('[CloudSystem] No catalog found — using built-in demos');
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

        console.log('[CloudSystem] Seeding demo asset catalog...');

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
                console.log('[CloudSystem] Demo catalog synced to Puter KV');
            } catch (e) {
                console.warn('[CloudSystem] Puter KV seed write failed:', e);
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

        console.log(`[CloudSystem] Importing ${asset.name} (${asset.type})...`);

        // 1. Try to load from Puter FS (actual downloaded asset data)
        if (isPuterAvailable()) {
            const fsPath = `CloudAssets/${asset.id}.json`;
            try {
                const raw = await fs.readText(fsPath);
                if (raw) {
                    const assetData = JSON.parse(raw);
                    await this._importPuterAsset(asset, assetData);
                    return asset;
                }
            } catch (_) {
                // No FS data yet — fall through to generator
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
            console.warn('[CloudSystem] Cannot sync: Puter unavailable');
            return false;
        }
        try {
            await kv.set(KV_CATALOG_KEY, DEMO_ASSETS);
            console.log('[CloudSystem] Catalog synced to Puter KV');
            return true;
        } catch (e) {
            console.warn('[CloudSystem] Catalog sync failed:', e);
            return false;
        }
    }

    /* ── Internal helpers ───────────────────────────────────────────────── */

    /**
     * Import an asset that was downloaded from Puter FS (or other remote).
     * This is a stub that can be expanded when the marketplace / asset
     * storage pipeline is fully implemented.
     */
    async _importPuterAsset(asset, assetData) {
        console.log('[CloudSystem] Importing Puter FS asset:', asset.name, assetData);
        // Future: reconstruct THREE geometry from assetData
        // For now fall through to procedural generation
        if (asset.type === 'voxel') {
            this.generateVoxelAsset(asset.generator);
        } else {
            this.studio.handleMenuAction(asset.generator);
        }
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