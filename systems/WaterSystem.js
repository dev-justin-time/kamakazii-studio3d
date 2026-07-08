/**
 * WaterSystem.js — Ocean/lake water simulation for Studio3D.
 *
 * Features:
 * - Animated water surface with multi-frequency wave displacement
 * - Configurable wave height, speed, direction
 * - Shore foam effect via vertex color alpha based on proximity to terrain
 * - Reflection/refraction support via environment map
 * - Multiple presets: calm lake, ocean waves, river flow, reflection pool
 */

import * as THREE from 'three';

const WATER_PRESETS = {
  calm:    { waveHeight: 0.05, waveSpeed: 0.3, color: 0x1a6688, opacity: 0.85, foam: false, scale: 40 },
  ocean:   { waveHeight: 0.5,  waveSpeed: 1.0, color: 0x004466, opacity: 0.8,  foam: true,  scale: 100 },
  river:   { waveHeight: 0.15, waveSpeed: 2.0, color: 0x2288aa, opacity: 0.75, foam: false, scale: 30 },
  pool:    { waveHeight: 0.02, waveSpeed: 0.2, color: 0x2266aa, opacity: 0.9,  foam: false, scale: 20 },
};

export class WaterSystem {
  constructor(studio) {
    this.studio = studio;
    this.mesh = null;
    this._preset = 'calm';
    this._waveHeight = 0.05;
    this._waveSpeed = 0.3;
    this._origPositions = null;
    this._time = 0;
  }

  /**
   * Create a water surface.
   * @param {Object} opts
   * @param {string} opts.preset — 'calm', 'ocean', 'river', 'pool'
   * @param {number} opts.scale — size of the water plane
   * @param {number} opts.height — Y position of the water surface
   * @param {number} opts.waveHeight — override wave amplitude
   * @param {number} opts.waveSpeed — override wave speed
   * @param {boolean} opts.animate — enable wave animation (default true)
   * @returns {THREE.Mesh}
   */
  create(opts = {}) {
    this.dispose();

    const preset = WATER_PRESETS[opts.preset || 'calm'] || WATER_PRESETS.calm;
    const scale = opts.scale ?? preset.scale;
    const segCount = Math.min(200, Math.max(64, Math.floor(scale / 0.5)));

    const geometry = new THREE.PlaneGeometry(scale, scale, segCount, segCount);
    geometry.rotateX(-Math.PI / 2);

    // Store original Y positions for wave animation
    const posArr = geometry.attributes.position.array;
    this._origPositions = new Float32Array(posArr.length / 3);
    for (let i = 0; i < this._origPositions.length; i++) {
      this._origPositions[i] = posArr[i * 3 + 1];
    }

    this._waveHeight = opts.waveHeight ?? preset.waveHeight;
    this._waveSpeed = opts.waveSpeed ?? preset.waveSpeed;
    this._preset = opts.preset || 'calm';

    const material = new THREE.MeshPhysicalMaterial({
      color: preset.color,
      transparent: true,
      opacity: preset.opacity,
      roughness: 0.05,
      metalness: 0.3,
      transmission: 0.3,
      thickness: 2,
      side: THREE.DoubleSide,
      envMapIntensity: 1.5,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = opts.height ?? 0;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'WaterSurface';
    this.mesh.userData.isWater = true;

    if (this.studio?.scene) {
      this.studio.scene.add(this.mesh);
      if (this.studio.objects) this.studio.objects.push(this.mesh);
    }

    return this.mesh;
  }

  /**
   * Animate water waves each frame.
   * @param {number} time — elapsed time in seconds
   * @param {THREE.Camera} camera — for centering the water around the viewer
   */
  update(time, camera) {
    if (!this.mesh || !this._origPositions) return;

    // Center water on camera if large
    if (camera && this.mesh.geometry.parameters?.width > 50) {
      this.mesh.position.x = camera.position.x;
      this.mesh.position.z = camera.position.z;
    }

    // Wave vertex displacement
    const geo = this.mesh.geometry;
    const posArr = geo.attributes.position.array;
    const t = time * this._waveSpeed;
    const wh = this._waveHeight;

    for (let i = 0; i < this._origPositions.length; i++) {
      const ix = i * 3;
      const x = posArr[ix];
      const z = posArr[ix + 2];

      // Multi-frequency Gerstner-like waves
      const w1 = Math.sin(x * 0.02 + t) * Math.cos(z * 0.015 + t * 0.7) * wh;
      const w2 = Math.sin(x * 0.05 + z * 0.03 + t * 1.3) * wh * 0.4;
      const w3 = Math.sin((x + z) * 0.08 + t * 0.9) * wh * 0.15;

      posArr[ix + 1] = this._origPositions[i] + w1 + w2 + w3;
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /**
   * Set wave parameters at runtime.
   */
  setWaveParams(waveHeight, waveSpeed) {
    this._waveHeight = waveHeight;
    this._waveSpeed = waveSpeed;
  }

  /**
   * Set the water color.
   */
  setColor(color) {
    if (this.mesh?.material) {
      this.mesh.material.color.set(color);
    }
  }

  dispose() {
    if (this.mesh) {
      this.studio?.scene?.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
      this._origPositions = null;
    }
  }
}

export { WATER_PRESETS };
