/**
 * VolumetricFog.js — True volumetric fog via depth-buffer raymarching.
 *
 * Renders the scene to an intermediate render target, then composites a
 * full-screen quad whose fragment shader raymarches through the fog volume,
 * accumulating in-scattering and extinction per-pixel.
 *
 * Features:
 *  - Height-based density falloff (fog lifts with altitude)
 *  - 3D noise texture for organic, non-uniform density
 *  - Configurable density, colour, height falloff, noise scale, step count
 *  - Standalone — no EffectComposer dependency; works with any render loop
 *
 * Usage:
 *   const fog = new VolumetricFog(renderer, { ... opts ... });
 *   // Each frame:
 *   fog.render(scene, camera);   // renders directly to the canvas
 *   // or:
 *   const result = fog.render(scene, camera, optionalTarget); // to a target
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

  // ── Linearize device depth to view-space Z ──────────────────
  float linearizeDepth(float d) {
    float zNdc = d * 2.0 - 1.0;                     // [0,1] → [-1,1]
    return (2.0 * cameraNear * cameraFar) /
           (cameraFar + cameraNear - zNdc * (cameraFar - cameraNear));
  }

  void main() {
    // Sample scene colour and depth
    vec4 sceneColor = texture2D(tDiffuse, vUv);
    float rawDepth   = texture2D(tDepth, vUv).r;

    // Skip sky / far-clip pixels (depth ≈ 1 → nothing to fog)
    if (rawDepth >= 1.0 - 1e-6) {
      gl_FragColor = sceneColor;
      return;
    }

    // Reconstruct world-space position from depth
    float linDepth = linearizeDepth(rawDepth);
    vec4 clipPos = vec4(vUv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
    vec4 viewPos = projectionMatrixInverse * clipPos;
    viewPos /= viewPos.w;
    vec4 worldPos4 = cameraMatrixWorld * viewPos;
    vec3 worldPos = worldPos4.xyz;

    // Ray direction & length
    vec3 rayDir = normalize(worldPos - cameraPos);
    float rayLength = length(worldPos - cameraPos);

    // March through the volume
    int stepCount = 64;
    float stepSize = rayLength / float(stepCount);
    vec3 marchPos = cameraPos;

    float accumDensity = 0.0;

    for (int i = 0; i < 64; i++) {
      if (i >= stepCount) break;
      marchPos += rayDir * stepSize;

      // Height-based falloff — fog thins out above a reference plane
      float height = marchPos.y;
      float density = fogDensity * exp(-max(height, 0.0) * heightFalloff);

      // 3D noise for organic variation
      float n = noise3D(marchPos * noiseScale);
      density *= (1.0 + (n - 0.5) * noiseStrength * 2.0);

      accumDensity += max(density * stepSize, 0.0);
    }

    // Beer's law: transmittance = exp(-accumulated density)
    float transmittance = exp(-accumDensity);

    // In-scattering from ambient light
    vec3 scatteredLight = fogColor * (1.0 - transmittance);

    // Composite: scene colour attenuated by transmittance + inscatter
    vec3 finalColor = sceneColor.rgb * transmittance + scatteredLight;

    gl_FragColor = vec4(finalColor, sceneColor.a);
  }
`;

const DEFAULTS = {
  density: 0.08,
  color: 0x888899,
  heightFalloff: 0.15,
  noiseScale: 0.4,
  noiseStrength: 0.25,
};

/**
 * VolumetricFog — Raymarched volumetric fog post-process.
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
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = false;

    // Parameters
    this.density        = opts.density        ?? DEFAULTS.density;
    this.color          = new THREE.Color(opts.color ?? DEFAULTS.color);
    this.heightFalloff  = opts.heightFalloff  ?? DEFAULTS.heightFalloff;
    this.noiseScale     = opts.noiseScale     ?? DEFAULTS.noiseScale;
    this.noiseStrength  = opts.noiseStrength  ?? DEFAULTS.noiseStrength;

    // Step quality — fewer steps = faster but more aliased
    this.quality = 64; // steps per ray

    // ── Intermediate render target (scene colour + depth) ──
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
      // Passthrough: render directly
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

    // 2. Render scene to intermediate target (captures depth)
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
