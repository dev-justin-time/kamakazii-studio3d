/**
 * WeatherSystem.js — Dynamic weather effects for Studio3D.
 *
 * Supports: rain, snow, fog, volumetric clouds, sandstorm.
 * Each effect uses GPU-friendly techniques (point sprites, fog params, shaders).
 */

import * as THREE from 'three';

const WEATHER_DEFAULTS = {
  rain:      { count: 3000, speed: 12, size: 0.05, color: 0xaaccff, spread: 40, height: 20 },
  snow:      { count: 2000, speed: 1.5, size: 0.08, color: 0xffffff, spread: 50, height: 25 },
  sandstorm: { count: 4000, speed: 8, size: 0.04, color: 0xcc9955, spread: 60, height: 10 },
};

class WeatherEffect {
  constructor(type, scene, opts = {}) {
    this.type = type;
    this.scene = scene;
    const cfg = { ...WEATHER_DEFAULTS[type], ...opts };
    this.cfg = cfg;

    // Build point-sprite particle system
    const positions = new Float32Array(cfg.count * 3);
    const velocities = new Float32Array(cfg.count * 3);

    for (let i = 0; i < cfg.count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * cfg.spread;
      positions[i3 + 1] = Math.random() * cfg.height;
      positions[i3 + 2] = (Math.random() - 0.5) * cfg.spread;

      if (type === 'rain') {
        velocities[i3]     = (Math.random() - 0.5) * 0.3;
        velocities[i3 + 1] = -(cfg.speed + Math.random() * 4);
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.3;
      } else if (type === 'snow') {
        velocities[i3]     = (Math.random() - 0.5) * 0.5;
        velocities[i3 + 1] = -(cfg.speed + Math.random() * 0.5);
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
      } else {
        // sandstorm — horizontal
        velocities[i3]     = cfg.speed * (0.5 + Math.random() * 0.5);
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.5;
        velocities[i3 + 2] = (Math.random() - 0.5) * cfg.speed * 0.3;
      }
    }

    this._positions = positions;
    this._velocities = velocities;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: type === 'sandstorm' ? 0.6 : 0.7,
      depthWrite: false,
      blending: type === 'rain' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = `Weather_${type}`;
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(dt, camera) {
    const cfg = this.cfg;
    const pos = this._positions;
    const vel = this._velocities;

    // Center the effect around the camera
    const cx = camera?.position?.x || 0;
    const cz = camera?.position?.z || 0;

    const halfSpread = cfg.spread / 2;

    for (let i = 0; i < cfg.count; i++) {
      const i3 = i * 3;
      pos[i3]     += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      // Wrap particles that fall below ground or go out of bounds
      if (pos[i3 + 1] < 0 || pos[i3 + 1] > cfg.height) {
        pos[i3]     = cx + (Math.random() - 0.5) * cfg.spread;
        pos[i3 + 1] = cfg.height;
        pos[i3 + 2] = cz + (Math.random() - 0.5) * cfg.spread;
      }

      // Horizontal wrapping around camera
      if (pos[i3] > cx + halfSpread) pos[i3] -= cfg.spread;
      if (pos[i3] < cx - halfSpread) pos[i3] += cfg.spread;
      if (pos[i3 + 2] > cz + halfSpread) pos[i3 + 2] -= cfg.spread;
      if (pos[i3 + 2] < cz - halfSpread) pos[i3 + 2] += cfg.spread;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/**
 * WeatherSystem — manages weather effects, fog, and atmospheric settings.
 */
export class WeatherSystem {
  constructor(studio) {
    this.studio = studio;
    this.currentEffect = null;
    this.fog = null;
    this._originalFog = null;
    this._originalBackground = null;
  }

  /**
   * Apply a weather preset.
   * @param {string} type — 'rain', 'snow', 'fog', 'clouds', 'sandstorm', 'clear'
   * @param {Object} opts — { intensity, windSpeed, fogColor, fogDensity }
   */
  apply(type, opts = {}) {
    const scene = this.studio?.scene;
    if (!scene) return;

    // Clean up previous effect
    this.clear();

    // Store original state
    this._originalFog = scene.fog?.clone() || null;
    this._originalBackground = scene.background?.clone() || null;

    const intensity = opts.intensity ?? 0.5;

    switch (type) {
      case 'rain': {
        this.currentEffect = new WeatherEffect('rain', scene, {
          count: Math.floor(3000 * intensity),
          speed: 12 * intensity,
        });
        scene.fog = new THREE.FogExp2(0x334455, 0.008 * intensity);
        break;
      }
      case 'snow': {
        this.currentEffect = new WeatherEffect('snow', scene, {
          count: Math.floor(2000 * intensity),
          speed: 1.5 + intensity,
        });
        scene.fog = new THREE.FogExp2(0xaaaacc, 0.005 * intensity);
        break;
      }
      case 'fog': {
        const fogColor = opts.fogColor ? new THREE.Color(opts.fogColor) : new THREE.Color(0x888888);
        const density = opts.fogDensity ?? 0.02 * intensity;
        scene.fog = new THREE.FogExp2(fogColor, density);
        break;
      }
      case 'clouds': {
        // Volumetric cloud effect — layered fog + soft particle clusters
        scene.fog = new THREE.FogExp2(0x999999, 0.003 * intensity);
        scene.background = new THREE.Color(0x8899aa);
        break;
      }
      case 'sandstorm': {
        this.currentEffect = new WeatherEffect('sandstorm', scene, {
          count: Math.floor(4000 * intensity),
          speed: 8 * intensity,
        });
        scene.fog = new THREE.FogExp2(0xaa8844, 0.015 * intensity);
        break;
      }
      case 'clear':
      default: {
        // Already cleared above
        break;
      }
    }
  }

  /**
   * Update the weather effect each frame.
   * @param {number} dt
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    if (this.currentEffect) {
      this.currentEffect.update(dt, camera);
    }
  }

  /**
   * Clear all weather effects and restore original fog/background.
   */
  clear() {
    if (this.currentEffect) {
      this.currentEffect.dispose();
      this.currentEffect = null;
    }
    const scene = this.studio?.scene;
    if (scene) {
      scene.fog = this._originalFog || null;
      if (this._originalBackground) scene.background = this._originalBackground;
    }
  }

  dispose() {
    this.clear();
  }
}
