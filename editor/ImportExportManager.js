/*
ImportExportManager - facade that delegates all import/export to ModelIO.

This file no longer contains format-specific loader logic. All operations
are routed through the centralized ModelIO class in editor/ModelIO.js.
*/
import * as THREE from 'three';
import { ModelIO } from './ModelIO.js';

export class ImportExportManager {
  /**
   * @param {Object} editor — context with scene, camera, objects, etc.
   */
  constructor(editor) {
    this.editor = editor;

    // Create ModelIO with the editor as context
    this.modelIO = new ModelIO({
      scene: editor.scene,
      camera: editor.camera || null,
      renderer: editor.renderer || null,
      objects: editor.objects || [],
      pluginRegistry: editor.pluginRegistry || null,
      ui: editor.ui || null,
      selectedObject: null,
      selectObject: (obj) => {
        if (typeof editor.selectObject === 'function') editor.selectObject(obj);
      },
      frameAtDistance: (target, dist, elev, az) => {
        if (typeof editor.frameAtDistance === 'function') editor.frameAtDistance(target, dist, elev, az);
        else if (typeof editor.frameSelected === 'function') editor.frameSelected();
      },
      updateOutliner: () => {
        if (editor.ui && typeof editor.ui.updateOutliner === 'function') editor.ui.updateOutliner();
      },
    });

    // Keep selectedObject reference live
    Object.defineProperty(this.modelIO.ctx, 'selectedObject', {
      get: () => editor.selectedObject || null,
    });
  }

  /**
   * Import a model from any supported source.
   * Accepts File, URL string, {url, files, name} multi-file, or .k3dasset.
   * @param {File|string|Object} source
   * @param {Object} [opts] — {normalize, frame, onProgress}
   * @returns {Promise<THREE.Object3D>}
   */
  async importModel(source, opts = {}) {
    if (!this.modelIO) throw new Error('ModelIO not initialized');
    return this.modelIO.importFile(source, opts);
  }

  /**
   * Import multiple files at once.
   * @param {FileList|File[]} files
   * @param {Object} [opts]
   * @returns {Promise<THREE.Object3D[]>}
   */
  async importBatch(files, opts = {}) {
    if (!this.modelIO) throw new Error('ModelIO not initialized');
    return this.modelIO.importBatch(files, opts);
  }

  /**
   * Export selected object in requested format.
   * @param {'glb'|'gltf'|'obj'|'stl'|'ply'} format
   * @returns {Promise<Blob>}
   */
  async exportSelectedModel(format = 'glb') {
    if (!this.modelIO) throw new Error('ModelIO not initialized');
    return this.modelIO.exportAs(format);
  }

  /**
   * Export whole scene in requested format.
   * @param {'glb'|'gltf'|'obj'|'stl'|'ply'} format
   * @returns {Promise<Blob>}
   */
  async exportSceneAsFormat(format = 'glb') {
    if (!this.modelIO) throw new Error('ModelIO not initialized');
    return this.modelIO.exportAs(format, this.editor.scene);
  }

  /**
   * Get list of supported export formats.
   * @returns {string[]}
   */
  getSupportedExportFormats() {
    return this.modelIO ? this.modelIO.getSupportedExportFormats() : [];
  }

  /**
   * Get list of supported import extensions.
   * @returns {string[]}
   */
  getSupportedImportExtensions() {
    return this.modelIO ? this.modelIO.getSupportedImportExtensions() : [];
  }
}