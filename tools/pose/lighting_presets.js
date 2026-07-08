/**
 * lighting_presets.js — Lighting Presets
 *
 * Reusable lighting setups for different moods and environments.
 * Each preset returns the lights it created so they can be removed later.
 */

import * as THREE from 'three';

/**
 * Remove all lights created by a previous preset.
 * @param {THREE.Scene} scene
 * @param {Object} lights — { key, fill, rim, ambient, ... }
 */
export function removeLights(scene, lights) {
  if (!lights) return;
  for (const light of Object.values(lights)) {
    if (light && light.isLight) {
      scene.remove(light);
      if (light.shadow?.map) light.shadow.map.dispose();
      light.dispose?.();
    }
  }
}

/**
 * Studio lighting — clean, even illumination for product/model preview.
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyStudioLighting(scene) {
  const key = new THREE.DirectionalLight(0xfff5ee, 1.2);
  key.position.set(5, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const fill = new THREE.HemisphereLight(0x8899bb, 0x443322, 0.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.3);
  rim.position.set(-3, 5, -5);
  scene.add(rim);

  return { key, fill, rim };
}

/**
 * Dramatic lighting — strong contrast, deep shadows, cinematic feel.
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyDramaticLighting(scene) {
  const key = new THREE.DirectionalLight(0xffeedd, 2.0);
  key.position.set(8, 12, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.001;
  scene.add(key);

  const fill = new THREE.HemisphereLight(0x1a1a3a, 0x0a0a0a, 0.15);
  scene.add(fill);

  const rim = new THREE.SpotLight(0x4488ff, 1.5, 50, Math.PI / 6);
  rim.position.set(-5, 8, -6);
  rim.castShadow = true;
  scene.add(rim);

  return { key, fill, rim };
}

/**
 * Outdoor lighting — bright, warm sun with blue sky fill.
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyOutdoorLighting(scene) {
  const sun = new THREE.DirectionalLight(0xfff8e7, 1.8);
  sun.position.set(10, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const sky = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.6);
  scene.add(sky);

  return { key: sun, fill: sky };
}

/**
 * Night lighting — moonlight with subtle ambient.
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyNightLighting(scene) {
  const moon = new THREE.DirectionalLight(0x8899cc, 0.6);
  moon.position.set(5, 15, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);

  const ambient = new THREE.AmbientLight(0x111122, 0.3);
  scene.add(ambient);

  const rim = new THREE.PointLight(0xffaa44, 0.5, 20);
  rim.position.set(-3, 2, 4);
  scene.add(rim);

  return { key: moon, ambient, rim };
}

/**
 * Neon lighting — colorful, cyberpunk aesthetic.
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyNeonLighting(scene) {
  const ambient = new THREE.AmbientLight(0x111111, 0.2);
  scene.add(ambient);

  const cyan = new THREE.PointLight(0x00ffff, 2, 30);
  cyan.position.set(5, 3, 3);
  scene.add(cyan);

  const magenta = new THREE.PointLight(0xff00ff, 1.5, 25);
  magenta.position.set(-5, 2, -3);
  scene.add(magenta);

  const key = new THREE.DirectionalLight(0xffffff, 0.3);
  key.position.set(0, 10, 5);
  scene.add(key);

  return { ambient, key, fill: cyan, rim: magenta };
}

/**
 * Apply a preset by name.
 * @param {string} name — 'studio', 'dramatic', 'outdoor', 'night', 'neon'
 * @param {THREE.Scene} scene
 * @returns {Object} light references
 */
export function applyPreset(name, scene) {
  switch (name) {
    case 'dramatic': return applyDramaticLighting(scene);
    case 'outdoor':  return applyOutdoorLighting(scene);
    case 'night':    return applyNightLighting(scene);
    case 'neon':     return applyNeonLighting(scene);
    case 'studio':
    default:         return applyStudioLighting(scene);
  }
}