/**
 * VolumetricFog.js — True volumetric fog via depth-buffer raymarching
 *                     with Henyey-Greenstein light-shaft (god-ray) scattering.
 *
 * Renders the scene to an intermediate render target, then composites a
 * full-screen quad whose fragment shader raymarches through the fog volume,
 * accumulating density (Beer's law extinction) and in-scattering from both
 * ambient fog colour and a directional light source (god rays).
 *
 * Features:
 *  - Height-based density falloff (fog lifts with altitude)
 *  - 3D noise texture for organic density variation
 *  - Henyey-Greenstein phase-function god-ray scattering
 *  - Configurable sun direction, colour, and shaft strength
 *  - Standalone — no EffectComposer dependency
 *
 * Usage:
 *   const fog = new VolumetricFog(renderer, { ... });
 *   fog.setSunPosition(new THREE.Vector3(50, 80, 30)); // world-space sun pos
 *   fog.lightShaftStrength = 0.6;
 *   // Each frame:
 *   fog.render(scene, camera);
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec3  fogColor;
  uniform float fogDensity;
  uniform float heightFalloff;
  uniform float noiseScale;
  uniform float noiseStrength;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec3  cameraPos;
  uniform mat4  projectionMatrixInverse;
  uniform mat4  cameraMatrixWorld;

  // ── God-ray (light shaft) uniforms ───────────────────────────
  uniform vec3  sunDirection;             // normalised world-space direction toward sun
  uniform vec3  sunColor;                 // colour / intensity of the sun light
  uniform float lightShaftStrength;        // 0 = off, 1 = full, >1 = boosted

  varying vec2 vUv;

  // ── Simple 3D value noise ────────────────────────────────────
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  // ── Henyey-Greenstein phase function ─────────────────────────
  // g > 0   → forward scattering (sun glow around light direction)
  // g = 0   → isotropic
  // g < 0   → backward scattering
  float henyeyGreenstein(float cosTheta, float g) {
    float gg = g * g;
    return (1.0 - gg) / (4.0 * 3.14159265 * pow(1.0 + gg - 2.0 * g * cosTheta, 1.5));
  }

  // ── Linearize device depth to view-space Z ──────────────────
  float linearizeDepth(float d) {
    float zNdc = d * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) /
           (cameraFar + cameraNear - zNdc * (cameraFar - cameraNear));
  }

  // ── Approximate transmittance from a world-space point toward
  //     the sun using a height-falloff model (no extra marching).
  //     Returns a value in [0, 1] where 1 = fully visible sun.
  float sunVisibilityAt(vec3 pos) {
    // The sun is far away, so we approximate the optical depth
    // between `pos` and the edge of the atmosphere as proportional
    // to the local density scaled by the secant of the sun's zenith angle.
    float height = max(pos.y, 0.0);
    float localDensity = exp(-height * heightFalloff);

    // Secant of the angle between sun direction and up vector.
    // When the sun is overhead (cos = 1) the path through fog is
    // minimal; when near the horizon (cos -> 0) the path is long.
    float sunCosZenith = max(dot(sunDirection, vec3(0.0, 1.0, 0.0)), 1e-6);

    // Approximate optical depth: density falls off exponentially
    // with altitude, so the column density from height h to infinity
    // is density(h) / heightFalloff (integral of exp(-h * falloff) dh).
    float opticalDepth = localDensity / max(heightFalloff, 1e-6);

    // Scale by the slant path (longer when sun is low)
    opticalDepth *= 1.0 / sunCosZenith;

    return exp(-opticalDepth * fogDensity * 0.15);
  }

  void main() {
    // ── Sample scene colour and depth ─────────────────────────
    vec4 sceneColor = texture2D(tDiffuse, vUv);
    float rawDepth   = texture2D(tDepth, vUv).r;

    // Skip sky / far-clip pixels
    if (rawDepth >= 1.0 - 1e-6) {
      gl_FragColor = sceneColor;
      return;
    }

    // ── Reconstruct world-space position from depth ────────────
    float linDepth = linearizeDepth(rawDepth);
    vec4 clipPos = vec4(vUv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
    vec4 viewPos = projectionMatrixInverse * clipPos;
    viewPos /= viewPos.w;
    vec4 worldPos4 = cameraMatrixWorld * viewPos;
    vec3 worldPos = worldPos4.xyz;

    // ── Ray direction and length ──────────────────────────────
    vec3 rayDir = normalize(worldPos - cameraPos);
    float rayLength = length(worldPos - cameraPos);

    // ── March through the volume ───────────────────────────────
    int stepCount = 64;
    float stepSize = rayLength / float(stepCount);
    vec3 marchPos = cameraPos;

    float accumDensity = 0.0;
    float transmittance = 1.0;            // running transmittance from camera → current point
    vec3 scatteredLight = vec3(0.0);

    // Pre-compute phase function for this view ray
    float sunCosTheta = dot(rayDir, sunDirection);
    float hgPhase = henyeyGreenstein(sunCosTheta, 0.6);

    for (int i = 0; i < 64; i++) {
      if (i >= stepCount) break;
      marchPos += rayDir * stepSize;

      // ── Sample density at this point ─────────────────────────
      float height = marchPos.y;
      float density = fogDensity * exp(-max(height, 0.0) * heightFalloff);

      // 3D noise for organic variation
      float n = noise3D(marchPos * noiseScale);
      density *= (1.0 + (n - 0.5) * noiseStrength * 2.0);
      density = max(density, 0.0);

      // ── Per-step attenuation ─────────────────────────────────
      float stepTransmittance = exp(-density * stepSize);

      // ── God-ray inscatter (Henyey-Greenstein) ────────────────
      // Light from the sun scatters toward the camera at this
      // sample point. The scattered contribution is attenuated by
      // all the fog between this point and the camera.
      float vis = sunVisibilityAt(marchPos);
      vec3 sunScatter = sunColor * lightShaftStrength * hgPhase * vis * density * stepSize * transmittance;
      scatteredLight += sunScatter;

      // ── Accumulate extinction ────────────────────────────────
      transmittance *= stepTransmittance;
      accumDensity += density * stepSize;
    }

    // ── Ambient fog in-scatter ─────────────────────────────────
    // Standard ambient inscatter from the fog colour.
    // Uses the same running transmittance computed in the loop.
    vec3 ambientScatter = fogColor * (1.0 - transmittance);

    // ── Composite ──────────────────────────────────────────────
    vec3 finalColor = sceneColor.rgb * transmittance + ambientScatter + scatteredLight;

    gl_FragColor = vec4(finalColor, sceneColor.a);
  }
`;

const DEFAULTS = {
  density: 0.08,
  color: 0x888899,
  heightFalloff: 0.15,
  noiseScale: 0.4,
  noiseStrength: 0.25,
  lightShaftStrength: 0.5,
  sunColor: 0xffeedd,
};

/**
 * VolumetricFog — Raymarched volumetric fog with god-ray scattering.
 */
export class VolumetricFog {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object}              [opts]
   * @param {number}              [opts.density=0.08]
   * @param {number|string}       [opts.color=0x888899]
   * @param {number}              [opts.heightFalloff=0.15]
   * @param {number}              [opts.noiseScale=0.4]
   * @param {number}              [opts.noiseStrength=0.25]
   * @param {number}              [opts.lightShaftStrength=0.5]
   * @param {number|string}       [opts.sunColor=0xffeedd]
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = false;

    // Parameters
    this.density             = opts.density             ?? DEFAULTS.density;
    this.color               = new THREE.Color(opts.color               ?? DEFAULTS.color);
    this.heightFalloff       = opts.heightFalloff       ?? DEFAULTS.heightFalloff;
    this.noiseScale          = opts.noiseScale          ?? DEFAULTS.noiseScale;
    this.noiseStrength       = opts.noiseStrength       ?? DEFAULTS.noiseStrength;

    // God-ray parameters
    this._sunDirection       = new THREE.Vector3(0.5, 0.8, 0.5).normalize();
    this._sunColor           = new THREE.Color(opts.sunColor ?? DEFAULTS.sunColor);
    this.lightShaftStrength  = opts.lightShaftStrength  ?? DEFAULTS.lightShaftStrength;

    // Step quality
    this.quality = 64; // steps per ray

    // ── Intermediate render target ──
    const size = renderer.getSize(new THREE.Vector2());
    this._target = new THREE.WebGLRenderTarget(
      Math.floor(size.x),
      Math.floor(size.y),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthTexture: new THREE.DepthTexture(
          Math.floor(size.x),
          Math.floor(size.y),
          THREE.UnsignedIntType,
        ),
      },
    );

    // ── Shader material ──
    this._material = this._createMaterial();

    // ── Full-screen quad ──
    this._quad = new FullScreenQuad(this._material);

    // Bind resize
    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  // ── Public API ──────────────────────────────────────────────

  /** Reset fog state (equivalent to disabling) */
  remove() {
    this.enabled = false;
  }

  /** Enable fog with current parameters */
  enable() {
    this.enabled = true;
  }

  /** Toggle on/off */
  toggle() {
    this.enabled = !this.enabled;
  }

  // ── Sun / God-Ray Controls ─────────────────────────────────

  /**
   * Set the sun direction from a world-space position.
   * The direction is computed as `normalize(position)` — the sun
   * is assumed to be infinitely far away.
   *
   * @param {THREE.Vector3} position — World-space position of the sun.
   */
  setSunPosition(position) {
    this._sunDirection.copy(position).normalize();
  }

  /**
   * Set the sun direction directly as a normalised vector.
   *
   * @param {THREE.Vector3} direction — Normalised direction toward the sun.
   */
  setSunDirection(direction) {
    this._sunDirection.copy(direction).normalize();
  }

  /**
   * Convenience: derive sun direction from a Three.js DirectionalLight.
   * The light position is used as the direction (since DirectionalLight
   * has no actual position in world space for lighting).
   *
   * @param {THREE.DirectionalLight} light
   */
  setSunFromLight(light) {
    this._sunDirection.copy(light.position).normalize();
    // Derive a warm sun tint from the light colour
    this._sunColor.copy(light.color);
  }

  /**
   * Set the sun colour for god-ray scattering.
   * @param {number|string|THREE.Color} color
   */
  setSunColor(color) {
    this._sunColor.set(color);
  }

  /**
   * Copy all settings from another VolumetricFog instance or a
   * plain parameters object. Useful for snapshot/restore workflows.
   *
   * @param {object} src — { density, color, heightFalloff, noiseScale,
   *                        noiseStrength, lightShaftStrength, sunDirection,
   *                        sunColor }
   */
  copyFrom(src) {
    if (src.density !== undefined)            this.density = src.density;
    if (src.color !== undefined)              this.color.set(src.color);
    if (src.heightFalloff !== undefined)      this.heightFalloff = src.heightFalloff;
    if (src.noiseScale !== undefined)          this.noiseScale = src.noiseScale;
    if (src.noiseStrength !== undefined)       this.noiseStrength = src.noiseStrength;
    if (src.lightShaftStrength !== undefined)  this.lightShaftStrength = src.lightShaftStrength;
    if (src.sunDirection !== undefined)        this._sunDirection.copy(src.sunDirection);
    if (src.sunColor !== undefined)            this._sunColor.set(src.sunColor);
    if (src.quality !== undefined)             this.quality = src.quality;
  }

  /**
   * Render the scene with volumetric fog composited.
   *
   * @param  {THREE.Scene}       scene
   * @param  {THREE.Camera}      camera
   * @param  {THREE.WebGLRenderTarget} [outputTarget] — if omitted, renders to the canvas.
   * @return {THREE.WebGLRenderTarget|null}           The output target, or null if canvas.
   */
  render(scene, camera, outputTarget = null) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return null;
    }

    const target = this._target;

    // 1. Ensure target matches viewport
    const size = this.renderer.getSize(new THREE.Vector2());
    if (target.width !== Math.floor(size.x) || target.height !== Math.floor(size.y)) {
      target.setSize(Math.floor(size.x), Math.floor(size.y));
      target.depthTexture?.setSize(Math.floor(size.x), Math.floor(size.y));
    }

    // 2. Render scene to intermediate target (captures colour + depth)
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);

    // 3. Update shader uniforms
    const m = this._material;
    m.uniforms.tDiffuse.value               = target.texture;
    m.uniforms.tDepth.value                 = target.depthTexture;
    m.uniforms.fogColor.value               = this.color;
    m.uniforms.fogDensity.value             = this.density;
    m.uniforms.heightFalloff.value          = this.heightFalloff;
    m.uniforms.noiseScale.value             = this.noiseScale;
    m.uniforms.noiseStrength.value          = this.noiseStrength;
    m.uniforms.cameraNear.value             = camera.near;
    m.uniforms.cameraFar.value              = camera.far;
    m.uniforms.cameraPos.value.copy(camera.position);
    m.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    m.uniforms.cameraMatrixWorld.value.copy(camera.matrixWorld);

    // God-ray uniforms
    m.uniforms.sunDirection.value.copy(this._sunDirection);
    m.uniforms.sunColor.value.copy(this._sunColor);
    m.uniforms.lightShaftStrength.value     = this.lightShaftStrength;

    // 4. Render full-screen quad to output
    if (outputTarget) {
      this.renderer.setRenderTarget(outputTarget);
    } else {
      this.renderer.setRenderTarget(null);
    }
    this._quad.render(this.renderer);

    return outputTarget || null;
  }

  /**
   * Clean up GPU resources.
   */
  dispose() {
    this._quad.dispose();
    this._material.dispose();
    this._target.dispose();
    window.removeEventListener('resize', this._onResize);
  }

  // ── Internal ───────────────────────────────────────────────

  _createMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        tDiffuse:                  { value: null },
        tDepth:                    { value: null },
        fogColor:                  { value: this.color },
        fogDensity:                { value: this.density },
        heightFalloff:             { value: this.heightFalloff },
        noiseScale:                { value: this.noiseScale },
        noiseStrength:             { value: this.noiseStrength },
        cameraNear:                { value: 0.1 },
        cameraFar:                 { value: 100 },
        cameraPos:                 { value: new THREE.Vector3() },
        projectionMatrixInverse:   { value: new THREE.Matrix4() },
        cameraMatrixWorld:         { value: new THREE.Matrix4() },
        // God-ray uniforms
        sunDirection:              { value: this._sunDirection },
        sunColor:                  { value: this._sunColor },
        lightShaftStrength:        { value: this.lightShaftStrength },
      },
      depthWrite: false,
      depthTest: false,
    });
  }

  _handleResize() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const w = Math.floor(size.x);
    const h = Math.floor(size.y);
    this._target.setSize(w, h);
    if (this._target.depthTexture) {
      this._target.depthTexture.setSize(w, h);
    }
  }
}
