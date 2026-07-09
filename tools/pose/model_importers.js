/**
 * model_importers.js
 * Title: Model Importers
 * Purpose: Small utilities to register additional importers or file-preprocessing hooks.
 */

// Use globalThis for universal compatibility (Browser, Node.js, Web Workers)
const _globalScope = typeof globalThis !== 'undefined' ? globalThis : {};

/**
 * Registers a custom model importer or file-preprocessing hook.
 * 
 * @param {string} name - The unique identifier for the importer (e.g., 'obj', 'stl').
 * @param {Function} handler - The function to handle the import logic.
 * @returns {boolean} True if registered successfully, false otherwise.
 */
export function registerImporter(name, handler) {
  if (typeof name !== 'string' || !name.trim()) {
    console.warn('[Model Importers] Invalid importer name provided.');
    return false;
  }
  
  if (typeof handler !== 'function') {
    console.warn(`[Model Importers] Handler for "${name}" must be a function.`);
    return false;
  }

  if (!_globalScope._customImporters) {
    _globalScope._customImporters = {};
  }
  
  // Normalize name to lowercase for case-insensitive matching
  _globalScope._customImporters[name.toLowerCase()] = handler;
  return true;
}

/**
 * Retrieves a list of all registered custom importer names.
 * 
 * @returns {string[]} An array of registered importer names.
 */
export function listImporters() {
  if (!_globalScope._customImporters) {
    return [];
  }
  return Object.keys(_globalScope._customImporters);
}

/**
 * Retrieves the handler function for a specific importer.
 * 
 * @param {string} name - The name of the importer to retrieve.
 * @returns {Function|undefined} The importer handler, or undefined if not found.
 */
export function getImporter(name) {
  if (!_globalScope._customImporters || typeof name !== 'string') {
    return undefined;
  }
  return _globalScope._customImporters[name.toLowerCase()];
}

/**
 * Removes a previously registered importer.
 * 
 * @param {string} name - The name of the importer to remove.
 * @returns {boolean} True if removed successfully, false if it didn't exist.
 */
export function unregisterImporter(name) {
  if (!_globalScope._customImporters || typeof name !== 'string') {
    return false;
  }
  const key = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(_globalScope._customImporters, key)) {
    delete _globalScope._customImporters[key];
    return true;
  }
  return false;
}