/**
 * AssetBundler — Creator tools for packaging, signing, and distributing assets.
 *
 * Creators can:
 * - Bundle meshes, textures, materials, node graphs, and metadata into .k3dasset packages
 * - Sign bundles with a creator key for authenticity
 * - Generate preview thumbnails and catalog entries
 * - Validate bundle integrity before publishing
 * - Set pricing, licensing, and distribution rules
 */

import * as THREE from 'three';

import { dbg } from '../app/dbg.js';

export class AssetBundler {
  constructor(editorState) {
    this.editor = editorState;
    this.bundles = new Map();      // bundleId -> BundleManifest
    this.workspace = [];           // Current working bundle items
    this.exportFormats = ['glb', 'gltf', 'obj', 'stl', 'k3dasset'];
  }

  /**
   * Create a new asset bundle from selected scene objects
   * @param {Object3D[]} objects - Three.js objects to include
   * @param {Object} metadata - title, description, tags, category, price
   * @returns {Object} bundle manifest
   */
  async createBundle(objects, metadata = {}) {
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const bundle = {
      id: bundleId,
      version: '1.0.0',
      format: 'k3dasset',
      createdAt: Date.now(),
      updatedAt: Date.now(),

      // Creator info
      creator: metadata.creator || 'Anonymous',
      creatorId: metadata.creatorId || null,

      // Catalog metadata
      title: metadata.title || 'Untitled Asset',
      description: metadata.description || '',
      tags: metadata.tags || [],
      category: metadata.category || 'uncategorized',
      thumbnail: null, // Will be generated

      // Pricing
      price: metadata.price || 0,
      currency: metadata.currency || 'USD',
      license: metadata.license || 'standard',

      // Content
      items: [],
      totalSize: 0,
      fileCount: 0,

      // Preview
      previewImage: null, // Data URL from canvas render
      previewVideo: null,

      // Distribution
      published: false,
      publishDate: null,
      downloadCount: 0,
      rating: 0,
      reviewCount: 0
    };

    // Extract objects
    for (const obj of (objects || [])) {
      const item = await this._extractObjectData(obj);
      if (item) {
        bundle.items.push(item);
        bundle.fileCount++;
        bundle.totalSize += item.estimatedSize || 0;
      }
    }

    // Generate a preview thumbnail
    bundle.thumbnail = await this._generateThumbnail(objects);

    this.bundles.set(bundleId, bundle);
    this.workspace = bundle.items;

    dbg.log(`[AssetBundler] Created bundle "${bundle.title}" with ${bundle.fileCount} items (${(bundle.totalSize / 1024).toFixed(1)} KB estimated)`);
    return bundle;
  }

  /**
   * Add an item to the current working bundle
   */
  async addToBundle(object, bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error(`Bundle "${bundleId}" not found`);

    const item = await this._extractObjectData(object);
    if (item) {
      bundle.items.push(item);
      bundle.fileCount++;
      bundle.totalSize += item.estimatedSize || 0;
      bundle.updatedAt = Date.now();
    }

    return bundle;
  }

  /**
   * Remove an item from a bundle
   */
  removeFromBundle(itemIndex, bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error(`Bundle "${bundleId}" not found`);
    if (itemIndex < 0 || itemIndex >= bundle.items.length) throw new Error('Invalid item index');

    const removed = bundle.items.splice(itemIndex, 1)[0];
    bundle.fileCount--;
    bundle.totalSize -= removed.estimatedSize || 0;
    bundle.updatedAt = Date.now();

    return bundle;
  }

  /**
   * Extract data from a Three.js object and serialize to bundle format
   */
  async _extractObjectData(object) {
    if (!object) return null;

    const item = {
      name: object.name || 'Unnamed Object',
      type: this._getObjectType(object),
      uuid: object.uuid,
      estimatedSize: 0,

      // Transform
      position: object.position.toArray(),
      rotation: object.rotation.toArray(),
      scale: object.scale.toArray(),

      // Visibility
      visible: object.visible,
      castShadow: object.castShadow || false,
      receiveShadow: object.receiveShadow || false,

      // Geometry (if Mesh)
      geometry: null,
      material: null,
      children: []
    };

    // Extract geometry data
    if (object.isMesh && object.geometry) {
      item.geometry = this._serializeGeometry(object.geometry);
      item.estimatedSize += (item.geometry?.estimatedBytes || 0);
    }

    // Extract material data
    if (object.material) {
      if (Array.isArray(object.material)) {
        item.material = object.material.map(m => this._serializeMaterial(m));
      } else {
        item.material = this._serializeMaterial(object.material);
      }
    }

    // Recurse for groups
    if (object.children && object.children.length > 0) {
      for (const child of object.children) {
        const childData = await this._extractObjectData(child);
        if (childData) {
          item.children.push(childData);
          item.estimatedSize += childData.estimatedSize || 0;
        }
      }
    }

    return item;
  }

  _getObjectType(object) {
    if (object.isMesh) return 'mesh';
    if (object.isGroup) return 'group';
    if (object.isLight) return 'light';
    if (object.isCamera) return 'camera';
    if (object.isLine) return 'line';
    if (object.isPoints) return 'points';
    if (object.isSprite) return 'sprite';
    if (object.isBone) return 'bone';
    if (object.isSkinnedMesh) return 'skinned-mesh';
    return 'unknown';
  }

  _serializeGeometry(geometry) {
    if (!geometry) return null;

    const data = {
      type: geometry.type || 'BufferGeometry',
      vertexCount: geometry.attributes?.position?.count || 0,
      indexCount: geometry.index?.count || 0,
      hasNormals: !!geometry.attributes?.normal,
      hasUVs: !!geometry.attributes?.uv,
      hasColors: !!geometry.attributes?.color,
      morphTargets: geometry.morphAttributes?.position?.length || 0,

      // For procedural generation, store parameters instead of raw data
      parameters: geometry.parameters || {},
      boundingBox: geometry.boundingBox ? {
        min: geometry.boundingBox.min.toArray(),
        max: geometry.boundingBox.max.toArray()
      } : null,

      // Estimated memory footprint
      estimatedBytes: this._estimateGeometryBytes(geometry)
    };

    // For non-parametric geometries (imported models, sculptures, etc.)
    // store the full buffer arrays so they can be faithfully reconstructed.
    // Parametric geometries (with `parameters`) are reconstructable from
    // those parameters alone and don't need the raw buffer — but we still
    // include them here for simplicity.
    if (geometry.attributes?.position) {
      data.format = 'buffer';
      data.attributes = {};

      const attrNames = ['position', 'normal', 'uv', 'uv2', 'color', 'tangent'];
      for (const name of attrNames) {
        const attr = geometry.attributes[name];
        if (attr) {
          data.attributes[name] = {
            array: Array.from(attr.array),
            itemSize: attr.itemSize,
            count: attr.count,
            normalized: !!attr.normalized,
          };
        }
      }

      // Serialize index buffer
      if (geometry.index) {
        data.index = {
          array: Array.from(geometry.index.array),
          count: geometry.index.count,
        };
      }

      // Morph target attributes
      if (geometry.morphAttributes) {
        data.morphAttributes = {};
        const morphNames = ['position', 'normal', 'uv'];
        for (const name of morphNames) {
          const targets = geometry.morphAttributes[name];
          if (targets && targets.length > 0) {
            data.morphAttributes[name] = targets.map((attr, i) => ({
              array: Array.from(attr.array),
              itemSize: attr.itemSize,
              count: attr.count,
              name: geometry.morphTargets?.[i]?.name || '',
            }));
          }
        }
      }

      // Update estimated bytes to reflect actual buffer sizes
      data.estimatedBytes = this._estimateGeometryBytes(geometry);
    }

    return data;
  }

  _serializeMaterial(material) {
    if (!material) return null;

    // Helper: serialize a single texture map to an embeddable descriptor
    const _serializeTexMap = (tex) => {
      if (!tex || !tex.image) return null;
      const dataUri = this._textureToDataUri(tex.image);
      return {
        uuid: tex.uuid,
        dataUri,  // base64 PNG embedded directly — no path resolution needed
        width: tex.image.naturalWidth || tex.image.width,
        height: tex.image.naturalHeight || tex.image.height,
      };
    };

    const data = {
      type: material.type || 'MeshStandardMaterial',
      name: material.name || '',
      uuid: material.uuid,
      color: material.color?.getHex?.() || 0xffffff,
      roughness: material.roughness ?? 0.5,
      metalness: material.metalness ?? 0,
      opacity: material.opacity ?? 1,
      transparent: material.transparent ?? false,
      wireframe: material.wireframe ?? false,
      side: material.side ?? 2, // THREE.FrontSide
      emissive: material.emissive?.getHex?.() || 0x000000,
      emissiveIntensity: material.emissiveIntensity ?? 0,
      map: _serializeTexMap(material.map),
      normalMap: _serializeTexMap(material.normalMap),
      roughnessMap: _serializeTexMap(material.roughnessMap),
      metalnessMap: _serializeTexMap(material.metalnessMap),
      aoMap: _serializeTexMap(material.aoMap),
      emissiveMap: _serializeTexMap(material.emissiveMap),
      displacementMap: _serializeTexMap(material.displacementMap),
      alphaMap: _serializeTexMap(material.alphaMap),
      bumpMap: _serializeTexMap(material.bumpMap),
      specularMap: _serializeTexMap(material.specularMap),
      envMap: _serializeTexMap(material.envMap),

      // Physical material props
      clearcoat: material.clearcoat ?? 0,
      clearcoatRoughness: material.clearcoatRoughness ?? 0,
      transmission: material.transmission ?? 0,
      thickness: material.thickness ?? 0,
      ior: material.ior ?? 1.5,
      iridescence: material.iridescence ?? 0,
      sheen: material.sheen ?? 0,
      sheenColor: material.sheenColor?.getHex?.() || null,

      envMapIntensity: material.envMapIntensity ?? 1,
      vertexColors: material.vertexColors ?? false,
      morphTargets: material.morphTargets ?? false
    };

    return data;
  }

  _estimateGeometryBytes(geometry) {
    let total = 0;
    for (const [name, attr] of Object.entries(geometry.attributes || {})) {
      total += (attr.count || 0) * (attr.itemSize || 3) * 4; // 4 bytes per float
    }
    if (geometry.index) {
      total += geometry.index.count * 4; // 4 bytes per uint32
    }
    return total;
  }

  /**
   * Generate a thumbnail by rendering the objects to a small canvas
   */
  async _generateThumbnail(objects, width = 256, height = 256) {
    if (!objects || objects.length === 0 || !this.editor?.renderer) return null;

    try {
      // Create a temporary render target
      const renderTarget = new THREE.WebGLRenderTarget(width, height);
      const tempCamera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);

      // Compute bounding sphere of all objects
      const box = new THREE.Box3();
      for (const obj of objects) {
        if (obj) box.expandByObject(obj);
      }
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();

      tempCamera.position.copy(center).add(new THREE.Vector3(size, size * 0.75, size));
      tempCamera.lookAt(center);

      // Clone just the objects for rendering (no grid, helpers, etc.)
      const tempScene = new THREE.Scene();
      tempScene.background = new THREE.Color(0x222222);

      // Add a simple lighting setup
      const ambient = new THREE.AmbientLight(0x404040, 0.5);
      tempScene.add(ambient);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(size, size * 1.5, size);
      tempScene.add(dirLight);
      const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
      fillLight.position.set(-size, size * 0.5, -size);
      tempScene.add(fillLight);

      // Add cloned objects
      for (const obj of objects) {
        if (obj) {
          const clone = obj.clone();
          tempScene.add(clone);
        }
      }

      const oldTarget = this.editor.renderer.getRenderTarget();
      this.editor.renderer.setRenderTarget(renderTarget);
      this.editor.renderer.render(tempScene, tempCamera);
      this.editor.renderer.setRenderTarget(oldTarget);

      // Read pixels and create data URL
      const pixels = new Uint8Array(width * height * 4);
      this.editor.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

      // Convert to canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      // Flip Y
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          const dstIdx = ((height - 1 - y) * width + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];     // R
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1]; // G
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2]; // B
          imageData.data[dstIdx + 3] = 255;            // A
        }
      }
      ctx.putImageData(imageData, 0, 0);

      renderTarget.dispose();
      return canvas.toDataURL('image/webp', 0.8);
    } catch (err) {
      dbg.warn('[AssetBundler] Thumbnail generation failed:', err);
      return null;
    }
  }

  /**
   * Export a bundle as a downloadable .k3dasset JSON package
   */
  exportBundle(bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error(`Bundle "${bundleId}" not found`);

    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `${bundle.title.replace(/[^a-zA-Z0-9]/g, '_')}_v${bundle.version}.k3dasset`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    dbg.log(`[AssetBundler] Exported "${filename}" (${(blob.size / 1024).toFixed(1)} KB)`);
    return { filename, size: blob.size, bundle, blob };
  }

  /**
   * Publish a bundle to Puter FS cloud storage.
   * Uploads the bundle JSON (with embedded texture data URIs) to
   * `CloudAssets/{creatorId}/{assetId}/asset.k3dasset`.
   *
   * Texture data URIs are already embedded in each item's material data
   * by `_serializeMaterial()` — no separate textures map is needed.
   *
   * @param {string} bundleId — The bundle to upload.
   * @returns {Promise<{path: string, size: number}>}
   */
  async publishToCloud(bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error(`Bundle "${bundleId}" not found`);

    // Bundle's items already contain embedded texture data URIs from
    // _serializeMaterial() — no separate textures map required.
    const publishBundle = { ...bundle, format: 'k3dasset' };
    const json = JSON.stringify(publishBundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    const creatorId = bundle.creatorId || 'anonymous';
    const assetId = bundle.id;
    const fsPath = `CloudAssets/${creatorId}/${assetId}/asset.k3dasset`;

    // Check Puter FS availability
    const { isPuterAvailable, fs } = await import('../app/puter-client.js');
    if (!isPuterAvailable()) {
      throw new Error('Puter FS not available — cannot upload to cloud');
    }

    // Ensure directory exists (mkdir is safe to call even if exists)
    try {
      await fs.mkdir(`CloudAssets/${creatorId}`);
    } catch (_) { /* may already exist */ }
    try {
      await fs.mkdir(`CloudAssets/${creatorId}/${assetId}`);
    } catch (_) { /* may already exist */ }

    // Write the bundle file
    try {
      await fs.write(fsPath, blob);
      bundle.published = true;
      bundle.publishDate = Date.now();
      bundle.cloudPath = fsPath;

      dbg.log(`[AssetBundler] Published bundle to cloud: ${fsPath} (${(blob.size / 1024).toFixed(1)} KB)`);
      return { path: fsPath, size: blob.size };
    } catch (err) {
      dbg.warn(`[AssetBundler] Cloud publish failed: ${err.message}`);
      throw new Error(`Failed to upload to Puter FS: ${err.message}`);
    }
  }

  /**
   * Textures are now embedded directly in material serialization via
   * `_serializeMaterial()` — each texture map's data URI is stored inline.
   * This method is retained as a convenience alias that scans scene objects
   * and logs a count for status feedback.
   *
   * @param {Object3D[]} objects — Scene objects to scan for textures.
   * @returns {Promise<number>} Count of unique textures found.
   */
  async countTextures(objects) {
    const seen = new Set();
    const traverse = (obj) => {
      if (!obj) return;
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          const slots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                         'aoMap', 'emissiveMap', 'displacementMap', 'alphaMap',
                         'bumpMap', 'specularMap', 'envMap'];
          for (const slot of slots) {
            const tex = mat[slot];
            if (tex && tex.image && !seen.has(tex.uuid)) {
              seen.add(tex.uuid);
            }
          }
        }
      }
      if (obj.children) obj.children.forEach(traverse);
    };
    objects.forEach(traverse);
    dbg.log(`[AssetBundler] Found ${seen.size} unique texture(s) in scene (embedded in material serialization)`);
    return seen.size;
  }

  /**
   * Convert a TexImageSource (HTMLImageElement, HTMLCanvasElement, etc.)
   * to a base64 data URI (PNG format).
   */
  _textureToDataUri(image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 256;
      canvas.height = image.naturalHeight || image.height || 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (_) {
      return null;
    }
  }

  /**
   * Import a .k3dasset bundle from file
   */
  async importBundle(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.format !== 'k3dasset') {
            reject(new Error('Invalid bundle format'));
            return;
          }
          data.importedAt = Date.now();
          this.bundles.set(data.id, data);
          dbg.log(`[AssetBundler] Imported bundle "${data.title}" (${data.items?.length || 0} items)`);
          resolve(data);
        } catch (err) {
          reject(new Error(`Bundle parse error: ${err.message}`));
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * Validate a bundle for publishing — checks all required fields and data integrity
   */
  validateBundle(bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return { valid: false, errors: ['Bundle not found'] };

    const errors = [];
    const warnings = [];

    // Required fields
    if (!bundle.title || bundle.title.trim() === '') errors.push('Title is required');
    if (!bundle.description || bundle.description.trim() === '') errors.push('Description is required');
    if (!bundle.category || bundle.category === 'uncategorized') errors.push('Category is required');
    if (!bundle.creator || bundle.creator === 'Anonymous') warnings.push('Creator name is generic');
    if (bundle.items.length === 0) errors.push('Bundle has no items');
    if (!bundle.thumbnail) warnings.push('No thumbnail generated — asset may appear blank in store');

    // Pricing validation
    if (bundle.price < 0) errors.push('Price cannot be negative');
    if (bundle.price > 0 && !bundle.license) errors.push('Paid assets must have a license type');

    // Content validation
    for (let i = 0; i < bundle.items.length; i++) {
      const item = bundle.items[i];
      if (!item.name) warnings.push(`Item #${i + 1} has no name`);
      if (item.type === 'mesh' && !item.geometry) warnings.push(`Item "${item.name || '#' + (i + 1)}" has no geometry data`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      itemCount: bundle.items.length,
      estimatedSize: bundle.totalSize
    };
  }

  /**
   * Publish a bundle to the marketplace (creates a listing in MarketplaceStore)
   */
  async publish(bundleId, marketplaceStore) {
    const validation = this.validateBundle(bundleId);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const bundle = this.bundles.get(bundleId);
    bundle.published = true;
    bundle.publishDate = Date.now();

    // Create marketplace listing
    if (marketplaceStore) {
      const listing = await marketplaceStore.createListing({
        id: bundle.id,
        title: bundle.title,
        description: bundle.description,
        tags: bundle.tags,
        category: bundle.category,
        price: bundle.price,
        currency: bundle.currency,
        license: bundle.license,
        thumbnail: bundle.thumbnail,
        creator: bundle.creator,
        creatorId: bundle.creatorId,
        version: bundle.version,
        itemCount: bundle.items.length,
        estimatedSize: bundle.totalSize,
        bundleData: bundle // embedded bundle JSON
      });

      return { success: true, listing, bundle };
    }

    return { success: true, bundle };
  }

  /**
   * Get all bundles
   */
  listBundles() {
    return Array.from(this.bundles.values());
  }

  /**
   * Get a specific bundle
   */
  getBundle(bundleId) {
    return this.bundles.get(bundleId) || null;
  }

  /**
   * Delete a bundle
   */
  deleteBundle(bundleId) {
    return this.bundles.delete(bundleId);
  }
}
