/* ═══════════════════════════════════════════════════════════════════════════
   LightmapBaker.js  –  Real-time lightmap baking for Studio 3D
   ═══════════════════════════════════════════════════════════════════════════
   Generates lightmap textures for meshes by rendering scene lighting into
   UV2-space textures using a custom shader material with additive accumulation.

   Technique (UV2-space rendering):
   1. Ensure each mesh has a UV2 attribute (planar projection fallback).
   2. Create a WebGLRenderTarget at configured resolution.
   3. Use a ShaderMaterial whose vertex shader maps UV2 → clip-space (-1..1)
      while passing worldPosition + worldNormal as varyings.
   4. Render the mesh once per light source (ambient, directional, point, etc.)
      with AdditiveBlending so each pass accumulates into the render target.
   5. After all passes, read back the pixels, divide by total passes (normalize
      the sum to an average), and copy the normalized data back.
   6. Apply the resulting texture as material.lightMap.

   Usage:
     const baker = new LightmapBaker(renderer);
     const results = await baker.bake(scene, targetObject, { resolution: 512 });
     results[0].lightMap // DataTexture applied to mesh material
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

// ─── Baker vertex shader — GLSL 300 es (WebGL2) ──────────────────────────
// Uses Three.js built-in uniforms: modelMatrix, modelViewMatrix, normalMatrix
// The mesh is rendered in UV2 space: UV2 → clip-space (-1..1).
// World position + normal are passed to the fragment shader for lighting.
const BAKER_VERTEX = `#version 300 es
  in vec3 position;
  in vec3 normal;
  in vec2 uv2;
  uniform float lightType;
  uniform vec3 lightDirection;
  uniform vec3 lightPosition;
  uniform vec3 lightColor;
  uniform float lightIntensity;

  out vec3 vWorldPos;
  out vec3 vWorldNormal;
  out vec3 vLightDir;
  out float vDistance;
  out vec3 vLightColor;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vLightColor = lightColor * lightIntensity;

    if (lightType == 1.0) {
      // Directional
      vLightDir = -normalize(lightDirection);
      vDistance = 1.0;
    } else if (lightType == 2.0) {
      // Point
      vec3 toLight = lightPosition - worldPos.xyz;
      vLightDir = normalize(toLight);
      vDistance = length(toLight);
    } else {
      // Ambient (type 0)
      vLightDir = vec3(0.0);
      vDistance = 1.0;
    }

    // Map UV2 to clip-space [-1, 1]
    gl_Position = vec4(uv2 * 2.0 - 1.0, 0.0, 1.0);
  }
`;

// ─── Baker fragment shader — evaluate diffuse + ambient ───────────────────
const BAKER_FRAGMENT = `#version 300 es
  precision highp float;

  in vec3 vWorldPos;
  in vec3 vWorldNormal;
  in vec3 vLightDir;
  in float vDistance;
  in vec3 vLightColor;

  uniform vec3 ambientColor;
  uniform float ambientIntensity;
  uniform float lightFalloffStart;
  uniform float lightFalloffEnd;

  out vec4 fragColor;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 lightAccum = ambientColor * ambientIntensity;

    float NdotL = max(dot(N, vLightDir), 0.0);
    if (NdotL > 0.0) {
      float attenuation = 1.0;
      if (vDistance > 1.0 && lightFalloffEnd > 0.0) {
        float d = clamp((vDistance - lightFalloffStart) /
                        (lightFalloffEnd - lightFalloffStart), 0.0, 1.0);
        attenuation = 1.0 - d * d;
      }
      lightAccum += vLightColor * NdotL * attenuation;
    }

    fragColor = vec4(clamp(lightAccum, 0.0, 1.0), 1.0);
  }
`;

// ─── Helper: planar-projection UV2 generation ─────────────────────────────
// For each vertex, picks the dominant axis (closest to bounding-box center)
// and projects onto the perpendicular two-axis plane, normalized to [0,1].
function _generatePlanarUV2(geometry) {
  if (geometry.attributes.uv2) return;
  const pos = geometry.attributes.position;
  const count = pos.count;

  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.max.clone().sub(box.min);
  const center = box.min.clone().add(size.clone().multiplyScalar(0.5));

  if (size.x < 0.001) size.x = 1;
  if (size.y < 0.001) size.y = 1;
  if (size.z < 0.001) size.z = 1;

  const uv2 = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const nx = (x - box.min.x) / size.x;
    const ny = (y - box.min.y) / size.y;
    const nz = (z - box.min.z) / size.z;

    const dx = Math.abs(x - center.x) / size.x;
    const dy = Math.abs(y - center.y) / size.y;
    const dz = Math.abs(z - center.z) / size.z;

    if (dz >= dx && dz >= dy) {
      uv2[i * 2] = nx;     // XY plane
      uv2[i * 2 + 1] = ny;
    } else if (dy >= dx) {
      uv2[i * 2] = nx;     // XZ plane
      uv2[i * 2 + 1] = nz;
    } else {
      uv2[i * 2] = ny;     // YZ plane
      uv2[i * 2 + 1] = nz;
    }
  }

  geometry.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));
  geometry.attributes.uv2.needsUpdate = true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LightmapBaker
   ═══════════════════════════════════════════════════════════════════════════ */
export class LightmapBaker {
  constructor(renderer) {
    if (!renderer) throw new Error('LightmapBaker requires a WebGLRenderer');
    this.renderer = renderer;

    /** Lightmap texture resolution (pixels per side). Default 512. */
    this.bakeResolution = 512;

    /** Samples per light for soft shadows via jitter. Default 4. */
    this.samplesPerLight = 4;

    /** Jitter spread in world units. */
    this.jitterSpread = 1.5;

    // ── Baker internals ──
    this._bakerMaterial = null;
    this._tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /* ── Public API ───────────────────────────────────────────────────── */

  /**
   * Bake lightmaps for all meshes in `target`.
   *
   * @param {THREE.Scene} scene        – Active scene (provides lights).
   * @param {THREE.Object3D} target    – Object to bake (traverses children).
   * @param {object} [options]
   * @param {number}  [options.resolution]       – Lightmap texture size.
   * @param {number}  [options.samplesPerLight]   – Multi-sample count.
   * @param {boolean} [options.bakeAmbient]       – Whether to bake ambient.
   * @param {function}[options.onProgress]        – Progress cb (0..1).
   * @returns {Promise<Array<{mesh: THREE.Mesh, lightMap: THREE.DataTexture}>>}
   */
  async bake(scene, target, options = {}) {
    const resolution = options.resolution ?? this.bakeResolution;
    const samples = options.samplesPerLight ?? this.samplesPerLight;
    const onProgress = options.onProgress || (() => {});

    // Collect light-receiving meshes
    const meshes = [];
    target.traverse((child) => {
      if (!child.isMesh || !child.geometry || !child.material) return;
      const mat = child.material;
      const mats = Array.isArray(mat) ? mat : [mat];
      // Skip transparent/glass-like materials
      if (mats.some((m) => m.transparent && m.opacity < 0.95)) return;
      meshes.push(child);
    });

    if (meshes.length === 0) {
      console.warn('[LightmapBaker] No bakeable meshes found');
      return [];
    }

    const lights = this._extractLights(scene);
    if (!this._bakerMaterial) {
      this._bakerMaterial = this._createBakerMaterial();
    }

    const results = [];
    const totalWork = meshes.length * Math.max(lights.length, 1);
    let completed = 0;

    for (const mesh of meshes) {
      // 1. Ensure UV2
      if (!mesh.geometry.attributes.uv2) {
        _generatePlanarUV2(mesh.geometry);
      }

      // 2. Per-mesh render target
      const rt = new THREE.WebGLRenderTarget(resolution, resolution, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });

      // 3. Accumulate each light's contribution (with jittered samples)
      this._clearRenderTarget(rt);

      if (lights.length > 0) {
        for (const light of lights) {
          for (let s = 0; s < samples; s++) {
            const jitter = this._computeJitter(s, samples);
            this._renderPass(mesh, light, rt, jitter);
            completed++;
            onProgress(completed / totalWork);
          }
        }
      }

      // 4. Normalize the accumulated sum → average and get pixels in one call
      const pixels = this._finalizeAndRead(rt, Math.max(lights.length * samples, 1));

      // 5. Create DataTexture from normalized pixels
      const lightMap = new THREE.DataTexture(pixels, resolution, resolution,
        THREE.RGBAFormat, THREE.FloatType);
      lightMap.needsUpdate = true;
      lightMap.anisotropy = 4;
      lightMap.wrapS = THREE.ClampToEdgeWrapping;
      lightMap.wrapT = THREE.ClampToEdgeWrapping;

      // 6. Apply to mesh
      this._applyLightMap(mesh, lightMap);
      results.push({ mesh, lightMap });

      rt.dispose();
    }

    console.log(`[LightmapBaker] Baked ${results.length} mesh${results.length === 1 ? '' : 'es'}`);
    return results;
  }

  /**
   * Remove lightmaps from an object's meshes.
   * @param {THREE.Object3D} target
   */
  clear(target) {
    target.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m.lightMap) {
          m.lightMap.dispose();
          m.lightMap = null;
          m.lightMapIntensity = 0;
          m.needsUpdate = true;
        }
      }
    });
  }

  /* ── Internal ──────────────────────────────────────────────────────── */

  /** Walk the scene and extract all light sources. */
  _extractLights(scene) {
    const lights = [];
    scene.traverse((child) => {
      if (child.isAmbientLight) {
        lights.push({ type: 'ambient', color: child.color, intensity: child.intensity, object: child });
      } else if (child.isDirectionalLight) {
        lights.push({
          type: 'directional', color: child.color, intensity: child.intensity,
          position: child.position.clone(),
          target: child.target ? child.target.position.clone() : new THREE.Vector3(0, 0, -1),
          object: child,
        });
      } else if (child.isPointLight) {
        lights.push({
          type: 'point', color: child.color, intensity: child.intensity,
          position: child.position.clone(), distance: child.distance || 100,
          object: child,
        });
      } else if (child.isHemisphereLight) {
        lights.push({
          type: 'hemisphere', color: child.color, groundColor: child.groundColor,
          intensity: child.intensity, object: child,
        });
      } else if (child.isSpotLight) {
        lights.push({
          type: 'spot', color: child.color, intensity: child.intensity,
          position: child.position.clone(),
          target: child.target ? child.target.position.clone() : new THREE.Vector3(0, 0, -1),
          distance: child.distance || 100, object: child,
        });
      }
    });
    return lights;
  }

  /** Create the reusable baker ShaderMaterial with AdditiveBlending. */
  _createBakerMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: BAKER_VERTEX,
      fragmentShader: BAKER_FRAGMENT,
      uniforms: {
        ambientColor: { value: new THREE.Color(0x000000) },
        ambientIntensity: { value: 0 },
        lightColor: { value: new THREE.Color(1, 1, 1) },
        lightIntensity: { value: 1.0 },
        lightType: { value: 1.0 },
        lightDirection: { value: new THREE.Vector3(0, -1, 0) },
        lightPosition: { value: new THREE.Vector3(0, 10, 0) },
        lightFalloffStart: { value: 0.0 },
        lightFalloffEnd: { value: 100.0 },
      },
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
  }

  /** Clear a render target to black (zero light). */
  _clearRenderTarget(rt) {
    const r = this.renderer;
    r.setRenderTarget(rt);
    r.clear(0, 0, 0, 1);
    r.setRenderTarget(null);
  }

  /**
   * Normalize an accumulated FloatType render target by dividing
   * each pixel by totalPasses, then write back via a full-screen quad.
   * Returns the normalized Float32Array pixels (avoids a second readback).
   * @returns {Float32Array} Normalized pixel data.
   */
  _finalizeAndRead(rt, totalPasses) {
    const r = this.renderer;
    const { width, height } = rt;

    const pixels = new Float32Array(width * height * 4);
    r.setRenderTarget(rt);
    r.readPixels(0, 0, width, height, pixels);
    r.setRenderTarget(null);

    if (totalPasses > 1) {
      const inv = 1 / totalPasses;
      for (let i = 0; i < pixels.length; i++) pixels[i] *= inv;

      // Write normalized data back via full-screen quad
      const tex = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false });
      const quad = new THREE.Mesh(geo, mat);
      quad.frustumCulled = false;

      r.setRenderTarget(rt);
      r.clear(0, 0, 0, 1);
      r.render(quad, this._tempCamera);
      r.setRenderTarget(null);

      geo.dispose();
      mat.dispose();
      tex.dispose();
    }

    return pixels;
  }

  /**
   * Render one light contribution into the accumulation render target.
   * Uses AdditiveBlending on the baker material so this adds to the
   * existing accumulated values in the render target.
   */
  _renderPass(mesh, light, rt, jitter) {
    const material = this._bakerMaterial;
    const u = material.uniforms;

    // Resolve light parameters
    let lightType = 1;
    let lightDir = new THREE.Vector3(0, -1, 0);
    let lightPos = new THREE.Vector3(0, 10, 0);
    let lightCol = light.color.clone();
    let lightInt = light.intensity;
    let falloffEnd = 100;

    switch (light.type) {
      case 'ambient':
        lightType = 0;
        lightCol.copy(light.color);
        lightInt = light.intensity;
        break;

      case 'directional': {
        lightType = 1;
        lightDir.copy(light.position).sub(light.target).normalize();
        lightCol.copy(light.color);
        lightInt = light.intensity;
        if (jitter.x !== 0 || jitter.y !== 0 || jitter.z !== 0) {
          lightDir.x += jitter.x * 0.05;
          lightDir.y += jitter.y * 0.05;
          lightDir.z += jitter.z * 0.05;
          lightDir.normalize();
        }
        break;
      }

      case 'point':
        lightType = 2;
        lightPos.copy(light.position);
        lightCol.copy(light.color);
        lightInt = light.intensity;
        falloffEnd = light.distance || 100;
        if (jitter.x !== 0 || jitter.y !== 0 || jitter.z !== 0) {
          lightPos.x += jitter.x * this.jitterSpread;
          lightPos.y += jitter.y * this.jitterSpread;
          lightPos.z += jitter.z * this.jitterSpread;
        }
        break;

      case 'hemisphere':
        lightType = 1;
        lightDir.set(0, 1, 0);
        lightCol.copy(light.color).lerp(light.groundColor, 0.3);
        lightInt = light.intensity * 0.4;
        break;

      case 'spot':
        lightType = 2;
        lightPos.copy(light.position);
        lightDir.copy(light.target).sub(light.position).normalize();
        lightCol.copy(light.color);
        lightInt = light.intensity;
        falloffEnd = light.distance || 100;
        break;

      default:
        lightType = 1;
        lightInt = 0;
    }

    // Set uniforms
    u.lightType.value = lightType;
    u.lightColor.value.copy(lightCol);
    u.lightIntensity.value = lightInt;
    u.ambientColor.value.setHex(0x000000);
    u.ambientIntensity.value = 0;
    if (lightType === 1 || lightType === 2) u.lightDirection.value.copy(lightDir);
    if (lightType === 2) {
      u.lightPosition.value.copy(lightPos);
      u.lightFalloffStart.value = 0;
      u.lightFalloffEnd.value = falloffEnd;
    }

    // Swap material and render additive
    const origMat = mesh.material;
    const origOrder = mesh.renderOrder;
    mesh.material = material;
    mesh.renderOrder = -1000;

    this.renderer.setRenderTarget(rt);
    this.renderer.autoClear = false;
    this.renderer.render(mesh, this._tempCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = true;

    mesh.material = origMat;
    mesh.renderOrder = origOrder;
  }

  /** Golden-angle jitter for sample coverage. */
  _computeJitter(idx, total) {
    if (total <= 1) return { x: 0, y: 0, z: 0 };
    const angle = idx * 2.399963;
    const r = Math.sqrt((idx + 0.5) / total);
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: Math.cos(angle + 1) * r * 0.5 };
  }

  /** Apply a DataTexture as lightMap on the mesh's material(s). */
  _applyLightMap(mesh, lightMap) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m.lightMap) m.lightMap.dispose();
      m.lightMap = lightMap;
      m.lightMapIntensity = 1.0;
      m.needsUpdate = true;
    }
  }
}
