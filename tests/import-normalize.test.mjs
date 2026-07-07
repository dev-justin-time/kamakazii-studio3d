/**
 * Contract test for `editor/import-normalize.js`.
 *
 * For every import path the model is asserted to:
 *
 *   (1) sit on the floor              bbox.min.y     ≈ 0
 *   (2) be X-centred                  bbox.center.x  ≈ 0
 *   (3) be Z-centred                  bbox.center.z  ≈ 0
 *   (4) be scaled to its canonical    bbox.max_dim   ≈ 5
 *   (5) frame the camera at 10 units  |cam − target| ≈ 10
 *
 * The four import paths covered (mirroring the real call sites):
 *
 *   - app/engine.js               (main editor, line 464 + 530)
 *   - tools/pose/main.js          (pose tool,    line 678 + 683)
 *   - tools/blender/script.js     (Blender tool, line 318)
 *   - editor/ModelEditor.js       (marketplace,  line 220 — no frameAtDistance)
 *
 * Three reference GLBs are synthesised in-memory — no on-disk fixtures:
 *
 *   - "star-sparrow-1e-10"   — root scale (1e-10, 1e-10, 1e-10)
 *   - "blender-zup-90deg"    — root rotated 90° around X (Z-up convention)
 *   - "upside-down-180deg"   — root rotated 180° around X
 *
 * Each GLB holds an 8-vertex "rocket" cuboid (0.5×0.5×2, long along Z);
 * the node matrix carries the test characteristic. The aspect ratio is
 * deliberate: a unit cube's bbox is rotation-invariant, which would make
 * the 90°/180° cases tautological. A long cuboid has different bbox
 * extents under each rotation, so the three reference GLBs actually
 * exercise different scale-to-5 paths.
 *
 * Run:  node --test tests/import-normalize.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeImport, frameAtDistance } from '../editor/import-normalize.js';

// ─────────────────────────── GLB builder ───────────────────────────
const identity4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scaleMatrix = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const rotateX = (theta) => {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};

// 8-vertex, 12-triangle "rocket" cuboid — 0.5×0.5×2 (long along Z).
// The aspect ratio is deliberate: a unit cube's bbox is rotation-
// invariant, which would make the 90° and 180° test cases tautological.
// A long cuboid has different bbox extents under rotation, so the three
// reference GLBs actually exercise different code paths.
const ROCKET_POSITIONS = new Float32Array([
  -0.25, -0.25, -1,   // 0
   0.25, -0.25, -1,   // 1
   0.25,  0.25, -1,   // 2
  -0.25,  0.25, -1,   // 3
  -0.25, -0.25,  1,   // 4
   0.25, -0.25,  1,   // 5
   0.25,  0.25,  1,   // 6
  -0.25,  0.25,  1,   // 7
]);
const CUBE_INDICES = new Uint16Array([
  0, 1, 2,  0, 2, 3,  // back  (-Z)
  4, 6, 5,  4, 7, 6,  // front (+Z)
  0, 4, 5,  0, 5, 1,  // bottom (-Y)
  2, 6, 7,  2, 7, 3,  // top    (+Y)
  0, 3, 7,  0, 7, 4,  // left   (-X)
  1, 5, 6,  1, 6, 2,  // right  (+X)
]);

/** Build a minimal glTF 2.0 binary (GLB) buffer. */
function buildGLB({ positions, indices, nodeMatrix = identity4() }) {
  const posMin = [Infinity, Infinity, Infinity];
  const posMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const v = positions[i + j];
      if (v < posMin[j]) posMin[j] = v;
      if (v > posMax[j]) posMax[j] = v;
    }
  }

  const posBytes = positions.byteLength;
  const idxBytes = indices.byteLength;

  const gltf = {
    asset:   { version: '2.0', generator: 'kamikazzi-test-fixture' },
    scene:   0,
    scenes:  [{ nodes: [0] }],
    nodes:   [{ mesh: 0, matrix: Array.from(nodeMatrix) }],
    meshes:  [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: posMin, max: posMax },
      { bufferView: 1, componentType: 5123, count: indices.length,      type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0,        byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 },
    ],
    buffers: [{ byteLength: posBytes + idxBytes }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]); // space-pad

  let binBuf = Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer,   indices.byteOffset,   indices.byteLength),
  ]);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad > 0) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(totalLength);
  let o = 0;
  out.writeUInt32LE(0x46546C67, o); o += 4;  // 'glTF' magic
  out.writeUInt32LE(2,           o); o += 4;  // version
  out.writeUInt32LE(totalLength, o); o += 4;  // total file size
  out.writeUInt32LE(jsonBuf.length, o); o += 4;
  out.writeUInt32LE(0x4E4F534A,     o); o += 4;  // 'JSON'
  jsonBuf.copy(out, o); o += jsonBuf.length;
  out.writeUInt32LE(binBuf.length, o); o += 4;
  out.writeUInt32LE(0x004E4942,    o); o += 4;  // 'BIN\0'
  binBuf.copy(out, o);

  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const rocketGLB = (nodeMatrix) =>
  buildGLB({ positions: ROCKET_POSITIONS, indices: CUBE_INDICES, nodeMatrix });

/**
 * Parse a GLB ArrayBuffer into a Three.js root Object3D.
 * GLTFLoader.parse defers its callback via microtask, so we wrap it in
 * a Promise to await it cleanly.
 */
function parseGLB(arrayBuffer) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      arrayBuffer,
      '',
      (gltf) => resolve(gltf.scene),
      (e)     => reject(e)
    );
  });
}

// ─────────────────────── reference models ─────────────────────────
const MODELS = {
  'star-sparrow-1e-10': () => rocketGLB(scaleMatrix(1e-10)),
  'blender-zup-90deg':  () => rocketGLB(rotateX(Math.PI / 2)),
  'upside-down-180deg': () => rocketGLB(rotateX(Math.PI)),
};

// ──────────────────────── import paths ────────────────────────────
function stubControls() {
  return { target: new THREE.Vector3(), object: null, update() {} };
}
function makeCamera() {
  const c = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  // (0, 5, -10) yields faceCamera yaw = atan2(0, 1) = 0, so the wrapper
  // has identity rotation and bbox.max_dim lands at exactly 5 (within
  // float drift). A camera off-axis (e.g. (2, 3, 4)) would tilt the
  // long axis slightly into the world X direction, expanding the world
  // bbox by up to ~0.15 — still within an `≈ 5` contract, but a fixed
  // camera keeps the test deterministic.
  c.position.set(0, 5, -10);
  return c;
}

/**
 * Each path mirrors the exact call-site pattern in the real source file.
 * The shared sequence is `normalizeImport → frameAtDistance(10, 35, 25)`;
 * paths differ only in identifier names and one opts flag.
 *
 * The 3 framing paths use the production default of `faceCamera: true`
 * (no opts passed). The synthetic rocket has a dominant Z axis (5
 * after normalize) and symmetric X/Z (1.25 each), so the faceCamera
 * yaw preserves the bbox's max dimension at 5 — the long axis doesn't
 * rotate into the other dimensions. This lets the test exercise the
 * real call-site behaviour (including the yaw) without loosening the
 * bbox tolerance. ModelEditor keeps its real `faceCamera: false` since
 * the marketplace preview handles its own orientation.
 */
const PATHS = {
  // app/engine.js   (lines 464 + 482, 530 + 543, 1290):
  //   const norm = normalizeImport(root, this.camera, {...});
  //   const frameTarget = norm.bboxCenter;
  //   this.frameAtDistance(frameTarget, 10, 35, 25);
  engine(glb) {
    const camera = makeCamera();
    const norm = normalizeImport(glb, camera);
    const controls = stubControls();
    frameAtDistance(camera, controls, norm.bboxCenter, 10, 35, 25);
    return { wrapper: norm.wrapper, target: norm.bboxCenter, camera };
  },

  // tools/pose/main.js   (lines 678 + 683):
  //   const norm = normalizeImport(model, camera, {...});
  //   frameAtDistance(camera, controls, norm.bboxCenter, 10, 35, 25);
  pose(glb) {
    const camera = makeCamera();
    const norm = normalizeImport(glb, camera);
    const controls = stubControls();
    frameAtDistance(camera, controls, norm.bboxCenter, 10, 35, 25);
    return { wrapper: norm.wrapper, target: norm.bboxCenter, camera };
  },

  // tools/blender/script.js   (line 318, followed by frameAtDistance):
  //   const norm = normalizeImport(modelGroup, context.camera, {...});
  //   frameAtDistance(camera, controls, target, 10, 35, 25);
  blender(glb) {
    const camera = makeCamera();
    const norm = normalizeImport(glb, camera);
    const controls = stubControls();
    frameAtDistance(camera, controls, norm.bboxCenter, 10, 35, 25);
    return { wrapper: norm.wrapper, target: norm.bboxCenter, camera };
  },

  // editor/ModelEditor.js   (line 220):
  //   const norm = normalizeImport(root, null, { faceCamera: false, ... });
  //   (no frameAtDistance — caller decides framing)
  modelEditor(glb) {
    const norm = normalizeImport(glb, null, { faceCamera: false });
    return { wrapper: norm.wrapper, target: norm.bboxCenter, camera: null };
  },
};

// ──────────────────── contract tolerances ─────────────────────────
const Y_EPS      = 0.01;   // floor align (allow up to 1 cm)
const CENTER_EPS = 0.01;   // XZ centre
const SIZE_EPS   = 0.01;   // exact for unit-cube-derived models
const DIST_EPS   = 1e-3;   // matches frameAtDistance's own tolerance

function bboxOf(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return {
    min:    box.min,
    max:    box.max,
    center: box.getCenter(new THREE.Vector3()),
  };
}
const maxDimOf = (b) => {
  const d = b.max.clone().sub(b.min);
  return Math.max(d.x, d.y, d.z);
};

const hasFraming = (pathName) => pathName !== 'modelEditor';

/** Per-test helper: build a fresh model + run the path + return the result. */
async function runOnce(runPath, buildModel) {
  const root = await parseGLB(buildModel());
  return runPath(root);
}

// ─────────────────────── the test matrix ──────────────────────────
for (const [pathName, runPath] of Object.entries(PATHS)) {
  for (const [modelName, buildModel] of Object.entries(MODELS)) {
    describe(`${pathName} ← ${modelName}`, () => {
      test('bbox.min.y ≈ 0  (sits on the floor)', async () => {
        const { wrapper } = await runOnce(runPath, buildModel);
        const b = bboxOf(wrapper);
        assert.ok(
          Math.abs(b.min.y) < Y_EPS,
          `expected bbox.min.y ≈ 0, got ${b.min.y}`
        );
      });

      test('bbox.center.x ≈ 0  (X-centred)', async () => {
        const { wrapper } = await runOnce(runPath, buildModel);
        const b = bboxOf(wrapper);
        assert.ok(
          Math.abs(b.center.x) < CENTER_EPS,
          `expected bbox.center.x ≈ 0, got ${b.center.x}`
        );
      });

      test('bbox.center.z ≈ 0  (Z-centred)', async () => {
        const { wrapper } = await runOnce(runPath, buildModel);
        const b = bboxOf(wrapper);
        assert.ok(
          Math.abs(b.center.z) < CENTER_EPS,
          `expected bbox.center.z ≈ 0, got ${b.center.z}`
        );
      });

      test('bbox.max_dim ≈ 5  (scaled to canonical size)', async () => {
        const { wrapper } = await runOnce(runPath, buildModel);
        const b = bboxOf(wrapper);
        const m = maxDimOf(b);
        assert.ok(
          Math.abs(m - 5) < SIZE_EPS,
          `expected bbox.max_dim ≈ 5, got ${m}`
        );
      });

      if (hasFraming(pathName)) {
        test('|camera.position − target| ≈ 10  (frameAtDistance contract)', async () => {
          const { camera, target } = await runOnce(runPath, buildModel);
          const d = camera.position.distanceTo(target);
          assert.ok(
            Math.abs(d - 10) < DIST_EPS,
            `expected camera distance ≈ 10 from model centre, got ${d}`
          );
        });
      }
    });
  }
}
