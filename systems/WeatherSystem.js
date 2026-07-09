/**
 * WeatherSystem.js — Dynamic weather effects for Studio3D.
 *
 * Supports: rain, snow, fog, volumetric clouds, sandstorm.
 * Each effect uses GPU-friendly techniques (point sprites, fog params, shaders).
 */

import * as THREE from 'three';
import { dbg } from '../app/dbg.js';

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
 * Default volumetric fog mappings for each weather preset.
 * These map weather types to raymarched volumetric fog parameters.
 * Densities here are tuned for the depth-aware raymarch shader
 * (different scale from THREE.FogExp2).
 */
const VOLUMETRIC_FOG_PRESETS = {
  fog:       { density: 0.04,  color: 0x888888, heightFalloff: 0.12, lightShaftStrength: 0.3 },
  clouds:    { density: 0.015, color: 0xaaaaaa, heightFalloff: 0.08, lightShaftStrength: 0.6 },
  rain:      { density: 0.03,  color: 0x445566, heightFalloff: 0.15, lightShaftStrength: 0.2 },
  snow:      { density: 0.02,  color: 0xccccdd, heightFalloff: 0.10, lightShaftStrength: 0.4 },
  sandstorm: { density: 0.06,  color: 0xcc8844, heightFalloff: 0.20, lightShaftStrength: 0.1 },
};

/**
 * WeatherSystem — manages weather effects, fog, and atmospheric settings.
 *
 * When the volumetric fog system is available (via this.studio.volumetricFog),
 * the 'fog' and 'clouds' presets (and the fog components of rain/snow/sandstorm)
 * use the raymarched depth-aware shader instead of basic THREE.FogExp2.
 */
export class WeatherSystem {
  constructor(studio) {
    this.studio = studio;
    this.currentEffect = null;
    this.fog = null;
    this._originalFog = null;
    this._originalBackground = null;
    /** Tracks whether volumetric fog was activated by the weather system */
    this._volumetricEnabled = false;
  }

  /**
   * Apply a weather preset.
   * @param {string} type — 'rain', 'snow', 'fog', 'clouds', 'sandstorm', 'clear'
   * @param {Object} opts — { intensity, windSpeed, fogColor, fogDensity }
   */
  apply(type, opts = {}) {
    const scene = this.studio?.scene;
    if (!scene) return;

    // Clean up previous effect (including volumetric fog)
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
        this._enableVolumetricFog('rain', intensity, opts);
        break;
      }
      case 'snow': {
        this.currentEffect = new WeatherEffect('snow', scene, {
          count: Math.floor(2000 * intensity),
          speed: 1.5 + intensity,
        });
        this._enableVolumetricFog('snow', intensity, opts);
        break;
      }
      case 'fog': {
        // Use raymarched volumetric fog instead of basic FogExp2
        const fogColor = opts.fogColor ? new THREE.Color(opts.fogColor) : new THREE.Color(0x888888);
        const density = opts.fogDensity ?? 0.04 * intensity;
        this._enableVolumetricFog('fog', intensity, {
          ...opts,
          fogColor: fogColor.getHex(),
          overrideDensity: density,
        });
        // Clear any basic fog that the THREE.Fog API object might have set
        scene.fog = null;
        break;
      }
      case 'clouds': {
        // Volumetric cloud effect uses layered volumetric fog + sky backdrop
        this._enableVolumetricFog('clouds', intensity, opts);
        scene.fog = null;
        scene.background = new THREE.Color(0x8899aa);
        break;
      }
      case 'sandstorm': {
        this.currentEffect = new WeatherEffect('sandstorm', scene, {
          count: Math.floor(4000 * intensity),
          speed: 8 * intensity,
        });
        this._enableVolumetricFog('sandstorm', intensity, opts);
        break;
      }
      case 'clear':
      default: {
        // Already cleared above (including volumetric fog)
        break;
      }
    }
  }

  /**
   * Activate raymarched volumetric fog for the given weather preset.
   * Falls back silently to the old FogExp2 approach if the engine hasn't
   * loaded the VolumetricFog module yet (this is safe for early frames).
   */
  _enableVolumetricFog(preset, intensity, opts) {
    const vf = this.studio?.volumetricFog;
    if (!vf) {
      // VolumetricFog not yet loaded — fall back to basic FogExp2
      dbg.warn('[WeatherSystem] VolumetricFog not available, using basic FogExp2');
      const fallback = this._getFogExp2Fallback(preset, intensity, opts);
      if (fallback && this.studio?.scene) {
        this.studio.scene.fog = fallback;
      }
      return;
    }

    const p = VOLUMETRIC_FOG_PRESETS[preset];
    if (!p) return;

    // Apply preset defaults scaled by intensity
    const density   = opts.overrideDensity ?? (p.density * intensity);
    const fogColor  = opts.fogColor ?? p.color;
    const heightFO  = opts.heightFalloff ?? p.heightFalloff;
    const shaftStr  = opts.lightShaftStrength ?? p.lightShaftStrength;

    // Pass all params via the setParam API
    vf.setParam('density', density);
    vf.setParam('color', fogColor);
    vf.setParam('heightFalloff', heightFO);
    vf.setParam('lightShaftStrength', shaftStr);

    // Activate (calls enable() on the underlying VolumetricFog instance)
    vf.create();
    this._volumetricEnabled = true;
  }

  /**
   * Build a basic THREE.FogExp2 as a fallback when volumetric fog is unavailable.
   * Returns null for presets that have no fog component.
   */
  _getFogExp2Fallback(preset, intensity, opts) {
    const map = {
      fog:       { c: 0x888888, d: 0.02 },
      clouds:    { c: 0x999999, d: 0.003 },
      rain:      { c: 0x334455, d: 0.008 },
      snow:      { c: 0xaaaacc, d: 0.005 },
      sandstorm: { c: 0xaa8844, d: 0.015 },
    };
    const fb = map[preset];
    if (!fb) return null;
    const color = opts.fogColor ?? fb.c;
    const density = opts.fogDensity ?? (fb.d * intensity);
    return new THREE.FogExp2(color, density);
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
   * Also disables volumetric fog if it was activated by the weather system.
   */
  clear() {
    // Dispose particle effect
    if (this.currentEffect) {
      this.currentEffect.dispose();
      this.currentEffect = null;
    }

    // Disable volumetric fog if we enabled it
    if (this._volumetricEnabled) {
      this._volumetricEnabled = false;
      const vf = this.studio?.volumetricFog;
      if (vf && typeof vf.remove === 'function') {
        vf.remove();
      }
    }

    // Restore original scene fog/background
    const scene = this.studio?.scene;
    if (scene) {
      scene.fog = this._originalFog || null;
      if (this._originalBackground) {
        scene.background = this._originalBackground;
      }
    }
  }

  dispose() {
    this.clear();
  }
}
