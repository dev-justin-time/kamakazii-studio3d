/**
 * material-helpers.js — Centralized defensive helpers for material property access.
 *
 * Imported by studio.js and engine.js to replace scattered optional-chaining
 * patterns (material.color?.getHex?.() ?? 0xcccccc) with a single, tested call.
 *
 * Handles materials where .color may be:
 *   - undefined (ShaderMaterial, RawShaderMaterial)
 *   - null
 *   - a raw number / string / plain object (not a THREE.Color)
 *   - a proper THREE.Color instance
 */

/**
 * Safely extract a color as a hex integer (e.g. 0xff0000).
 *
 * @param {object} color - The material.color value (may be undefined/null/non-Color).
 * @param {number} [fallback=0xcccccc] - Default returned when extraction fails.
 * @returns {number}
 */
export function safeGetColor(color, fallback = 0xcccccc) {
  if (color && typeof color.getHex === 'function') return color.getHex();
  return fallback;
}

/**
 * Safely extract a color as a hex string WITHOUT the '#' prefix (e.g. "ff0000").
 *
 * @param {object} color - The material.color value.
 * @param {string} [fallback='cccccc'] - Default returned when extraction fails.
 * @returns {string}
 */
export function safeGetColorHexStr(color, fallback = 'cccccc') {
  if (color && typeof color.getHexString === 'function') return color.getHexString();
  return fallback;
}

/**
 * Safely copy a color from one material to a THREE.Color instance.
 * No-op when source has no .copy method.
 *
 * @param {object} sourceColor - The color to copy FROM (may be anything).
 * @param {object} targetColor - The THREE.Color to copy INTO.
 */
export function safeCopyColor(sourceColor, targetColor) {
  if (sourceColor && typeof sourceColor.copy === 'function' && targetColor) {
    targetColor.copy(sourceColor);
  }
}

/**
 * Safely set a color via hex integer on a THREE.Color instance.
 * No-op when the target has no .setHex method.
 *
 * @param {object} color - The THREE.Color (or compatible) to modify.
 * @param {number} hex - The hex color value (e.g. 0xff0000).
 */
export function safeSetHex(color, hex) {
  if (color && typeof color.setHex === 'function') color.setHex(hex);
}

/**
 * Safely set emissive color on a material.
 * Many material types (MeshBasicMaterial, ShaderMaterial, etc.) lack .emissive.
 *
 * @param {object} material - The THREE.Material instance.
 * @param {number} hex - The hex color for emissive.
 * @param {number} [intensity] - Optional emissiveIntensity to set.
 */
export function safeSetEmissive(material, hex, intensity) {
  if (material && material.emissive && typeof material.emissive.setHex === 'function') {
    material.emissive.setHex(hex);
    if (intensity !== undefined) material.emissiveIntensity = intensity;
  }
}
