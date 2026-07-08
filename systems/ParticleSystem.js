/**
 * ParticleSystem.js — GPU-friendly particle emitter for Studio3D.
 *
 * Features:
 * - Billboarded point-sprite particles with per-particle velocity, life, size
 * - Preset configurations: fire, smoke, sparks, dust, magic, bubbles
 * - Configurable emit rate, lifetime, speed, gravity, spread
 * - Multiple concurrent emitters
 * - Efficient BufferGeometry updates (no object creation per frame)
 */

import * as THREE from 'three';

const PRESETS = {
  fire: {
    color: new THREE.Color(0xff6600),
    colorEnd: new THREE.Color(0xff0000),
    emissive: true,
    size: 0.3,
    sizeEnd: 0.05,
    speed: 3,
    lifetime: 1.5,
    gravity: new THREE.Vector3(0, 2, 0),
    spread: 0.5,
    emitRate: 60,
    maxParticles: 600,
    opacity: 0.9,
    opacityEnd: 0,
    blending: THREE.AdditiveBlending,
  },
  smoke: {
    color: new THREE.Color(0x888888),
    colorEnd: new THREE.Color(0x444444),
    emissive: false,
    size: 0.4,
    sizeEnd: 1.2,
    speed: 1.5,
    lifetime: 3,
    gravity: new THREE.Vector3(0, 1, 0),
    spread: 0.8,
    emitRate: 20,
    maxParticles: 300,
    opacity: 0.6,
    opacityEnd: 0,
    blending: THREE.NormalBlending,
  },
  sparks: {
    color: new THREE.Color(0xffdd44),
    colorEnd: new THREE.Color(0xff4400),
    emissive: true,
    size: 0.08,
    sizeEnd: 0.02,
    speed: 8,
    lifetime: 0.8,
    gravity: new THREE.Vector3(0, -15, 0),
    spread: 2,
    emitRate: 80,
    maxParticles: 400,
    opacity: 1,
    opacityEnd: 0,
    blending: THREE.AdditiveBlending,
  },
  dust: {
    color: new THREE.Color(0xccbb99),
    colorEnd: new THREE.Color(0x998877),
    emissive: false,
    size: 0.06,
    sizeEnd: 0.03,
    speed: 0.5,
    lifetime: 4,
    gravity: new THREE.Vector3(0, 0.2, 0),
    spread: 1.5,
    emitRate: 30,
    maxParticles: 500,
    opacity: 0.5,
    opacityEnd: 0,
    blending: THREE.NormalBlending,
  },
  magic: {
    color: new THREE.Color(0x8844ff),
    colorEnd: new THREE.Color(0x44aaff),
    emissive: true,
    size: 0.15,
    sizeEnd: 0.05,
    speed: 2,
    lifetime: 2,
    gravity: new THREE.Vector3(0, 0.5, 0),
    spread: 1.2,
    emitRate: 40,
    maxParticles: 400,
    opacity: 0.9,
    opacityEnd: 0,
    blending: THREE.AdditiveBlending,
  },
  bubbles: {
    color: new THREE.Color(0x88ccff),
    colorEnd: new THREE.Color(0xaaddff),
    emissive: false,
    size: 0.12,
    sizeEnd: 0.08,
    speed: 0.8,
    lifetime: 3,
    gravity: new THREE.Vector3(0, 1.5, 0),
    spread: 0.4,
    emitRate: 15,
    maxParticles: 200,
    opacity: 0.7,
    opacityEnd: 0.2,
    blending: THREE.NormalBlending,
  },
};

/**
 * A single particle emitter instance.
 */
class ParticleEmitter {
  constructor(preset, position, opts = {}) {
    const cfg = { ...PRESETS[preset] || PRESETS.fire, ...opts };

    this.maxParticles = cfg.maxParticles;
    this.emitRate = cfg.emitRate;
    this.preset = preset;
    this.active = true;
    this._emitAccumulator = 0;

    // Per-particle state arrays
    this._positions = new Float32Array(cfg.maxParticles * 3);
    this._velocities = new Float32Array(cfg.maxParticles * 3);
    this._sizes = new Float32Array(cfg.maxParticles);
    this._lifetimes = new Float32Array(cfg.maxParticles);
    this._maxLifetimes = new Float32Array(cfg.maxParticles);
    this._colors = new Float32Array(cfg.maxParticles * 3);
    this._opacities = new Float32Array(cfg.maxParticles);

    this._cfg = cfg;
    this._alive = 0;
    this._spawnPos = position ? position.clone() : new THREE.Vector3();

    // Three.js rendering
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this._positions, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(this._sizes, 1));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this._colors, 3));

    const material = new THREE.PointsMaterial({
      size: cfg.size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: cfg.opacity,
      blending: cfg.blending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.name = `Particles_${preset}`;
  }

  _spawnParticle() {
    const cfg = this._cfg;
    const i = this._alive;
    if (i >= this.maxParticles) return;

    const i3 = i * 3;
    const spread = cfg.spread;

    this._positions[i3]     = this._spawnPos.x + (Math.random() - 0.5) * spread * 0.3;
    this._positions[i3 + 1] = this._spawnPos.y + (Math.random() - 0.5) * spread * 0.3;
    this._positions[i3 + 2] = this._spawnPos.z + (Math.random() - 0.5) * spread * 0.3;

    this._velocities[i3]     = (Math.random() - 0.5) * spread;
    this._velocities[i3 + 1] = cfg.speed * (0.5 + Math.random() * 0.5);
    this._velocities[i3 + 2] = (Math.random() - 0.5) * spread;

    this._sizes[i] = cfg.size;
    this._lifetimes[i] = 0;
    this._maxLifetimes[i] = cfg.lifetime * (0.7 + Math.random() * 0.6);
    this._opacities[i] = cfg.opacity;

    this._colors[i3]     = cfg.color.r;
    this._colors[i3 + 1] = cfg.color.g;
    this._colors[i3 + 2] = cfg.color.b;

    this._alive++;
  }

  update(dt) {
    if (!this.active) return;

    const cfg = this._cfg;
    const gravity = cfg.gravity;

    // Emit new particles
    this._emitAccumulator += dt * this.emitRate;
    while (this._emitAccumulator >= 1 && this._alive < this.maxParticles) {
      this._spawnParticle();
      this._emitAccumulator -= 1;
    }

    // Update existing particles
    let writeIdx = 0;
    for (let i = 0; i < this._alive; i++) {
      this._lifetimes[i] += dt;
      const t = this._lifetimes[i] / this._maxLifetimes[i]; // 0..1

      if (t >= 1) continue; // dead particle — skip

      // Copy to compact position (removes dead particles)
      if (writeIdx !== i) {
        const wi3 = writeIdx * 3;
        const ii3 = i * 3;
        this._positions[wi3]     = this._positions[ii3];
        this._positions[wi3 + 1] = this._positions[ii3 + 1];
        this._positions[wi3 + 2] = this._positions[ii3 + 2];
        this._velocities[wi3]     = this._velocities[ii3];
        this._velocities[wi3 + 1] = this._velocities[ii3 + 1];
        this._velocities[wi3 + 2] = this._velocities[ii3 + 2];
        this._sizes[writeIdx] = this._sizes[i];
        this._lifetimes[writeIdx] = this._lifetimes[i];
        this._maxLifetimes[writeIdx] = this._maxLifetimes[i];
        this._opacities[writeIdx] = this._opacities[i];
        this._colors[wi3]     = this._colors[ii3];
        this._colors[wi3 + 1] = this._colors[ii3 + 1];
        this._colors[wi3 + 2] = this._colors[ii3 + 2];
      }

      const wi3 = writeIdx * 3;

      // Integrate velocity + gravity
      this._velocities[wi3]     += gravity.x * dt;
      this._velocities[wi3 + 1] += gravity.y * dt;
      this._velocities[wi3 + 2] += gravity.z * dt;

      this._positions[wi3]     += this._velocities[wi3] * dt;
      this._positions[wi3 + 1] += this._velocities[wi3 + 1] * dt;
      this._positions[wi3 + 2] += this._velocities[wi3 + 2] * dt;

      // Lerp size
      this._sizes[writeIdx] = THREE.MathUtils.lerp(cfg.size, cfg.sizeEnd, t);

      // Lerp color
      const r = THREE.MathUtils.lerp(cfg.color.r, cfg.colorEnd.r, t);
      const g = THREE.MathUtils.lerp(cfg.color.g, cfg.colorEnd.g, t);
      const b = THREE.MathUtils.lerp(cfg.color.b, cfg.colorEnd.b, t);
      this._colors[wi3] = r;
      this._colors[wi3 + 1] = g;
      this._colors[wi3 + 2] = b;

      // Fade opacity
      this._opacities[writeIdx] = THREE.MathUtils.lerp(cfg.opacity, cfg.opacityEnd, t);

      writeIdx++;
    }

    this._alive = writeIdx;

    // Update GPU buffers
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, this._alive);

    // Update material opacity based on average
    this.points.material.opacity = this._alive > 0 ? this._opacities[0] : cfg.opacity;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/**
 * ParticleSystem — manages all particle emitters in the scene.
 */
export class ParticleSystem {
  constructor(studio) {
    this.studio = studio;
    this.emitters = [];
    this.enabled = true;
  }

  /**
   * Create a new particle emitter.
   * @param {string} preset — 'fire', 'smoke', 'sparks', 'dust', 'magic', 'bubbles'
   * @param {THREE.Vector3} position
   * @param {Object} opts — override preset defaults
   * @returns {ParticleEmitter}
   */
  emit(preset = 'fire', position, opts = {}) {
    const emitter = new ParticleEmitter(preset, position, opts);
    this.emitters.push(emitter);
    if (this.studio?.scene) {
      this.studio.scene.add(emitter.points);
    }
    return emitter;
  }

  /**
   * Remove an emitter.
   * @param {ParticleEmitter} emitter
   */
  remove(emitter) {
    const idx = this.emitters.indexOf(emitter);
    if (idx >= 0) {
      this.studio?.scene?.remove(emitter.points);
      emitter.dispose();
      this.emitters.splice(idx, 1);
    }
  }

  /** Stop all emitters. */
  stop() {
    for (const e of this.emitters) e.active = false;
  }

  /** Clear all emitters. */
  clear() {
    for (const e of this.emitters) {
      this.studio?.scene?.remove(e.points);
      e.dispose();
    }
    this.emitters.length = 0;
  }

  /** Main update loop — called each frame. */
  update(dt) {
    if (!this.enabled) return;
    for (const emitter of this.emitters) {
      emitter.update(dt);
    }
  }

  dispose() {
    this.clear();
  }
}

export { PRESETS };
