/*
  import-normalize.js
  Purpose: When a model (glTF, GLB, .k3dasset, etc.) lands in the scene it almost
  never has a sensible transform. This helper wraps the imported scene in a fresh
  THREE.Group and normalises it so that:

    [1] The model is scaled to a configurable target size (default 5 scene units
        on its longest bbox edge).
    [2] It sits on the floor (bbox.min.y = 0 + tiny offset to avoid z-fight).
    [3] It is upright — by NEVER touching gltf.scene's own rotation. The wrapper
        starts with identity rotation, so any Z-up -> Y-up conversion baked
        into the GLTF root by the exporter is preserved.
    [4] It is centred on the X/Z origin (view-centred).
    [5] It faces the camera (yaw rotation only, applied to the wrapper so the
        glTF root rotation stays untouched).

  This module also exports `frameAtDistance` for consistently framing the
  camera at a target scene-size distance and downward elevation.
*/

import * as THREE from 'three';

const DEFAULTS = {
  targetSize: 5,         // Longest bbox edge after scaling (world units).
  floorOffset: 0.005,    // Tiny lift to avoid z-fight with the ground plane.
  faceCamera: true,      // Yaw the wrapper so its +Z faces the camera's XZ.
  faceCameraMinRadius: 1e-3, // Skip if camera is too close to origin.
};

/**
 * Wrap `gltfScene` (THREE.Group | THREE.Scene) with a normalised outer Group.
 *
 * @param {THREE.Object3D} gltfScene
 * @param {THREE.Camera}   [camera]   Optional; used for `faceCamera` yaw.
 * @param {Object}         [opts]
 * @returns {{ wrapper: THREE.Group, scaleFactor: number, targetSize: number,
 *            bboxSize: THREE.Vector3, bboxCenter: THREE.Vector3 }}
 */
export function normalizeImport(gltfScene, camera = null, opts = {}) {
  if (!gltfScene) throw new Error('normalizeImport: gltfScene is required');

  const cfg = Object.assign({}, DEFAULTS, opts);

  // Wrap so we never mutate the GLTF root's own rotation/scale. The wrapper
  // starts at identity — any Z->Y-up correction baked into the GLB is kept.
  const wrapper = new THREE.Group();
  wrapper.name = gltfScene.name || 'Imported Model';
  wrapper.add(gltfScene);

  // 1) Scale ----------------------------------------------------------
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const sizeVec = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);

  let scaleFactor = 1;
  if (maxDim > 0 && Number.isFinite(maxDim)) {
    scaleFactor = cfg.targetSize / maxDim;
    wrapper.scale.setScalar(scaleFactor);
  }
  wrapper.updateMatrixWorld(true);

  // 2) Floor align + XZ centre ---------------------------------------
  box.setFromObject(wrapper);
  const center = box.getCenter(new THREE.Vector3());
  const minY = box.min.y;
  wrapper.position.set(
    -center.x,
    -minY + cfg.floorOffset,
    -center.z
  );
  wrapper.updateMatrixWorld(true);

  // 3) Face camera (yaw only) ----------------------------------------
  // glTF "forward" is -Z. We want the model's -Z in world space to point
  // toward the camera. With wrapper.rotation.y = theta:
  //   local -Z (0,0,-1) -> world (-sin(theta), 0, -cos(theta))
  // Solving for (-sin, -cos) = (dirX, dirZ):
  //   theta = atan2(-dirX, -dirZ)
  if (cfg.faceCamera && camera && camera.position) {
    const dir = new THREE.Vector3().subVectors(camera.position, wrapper.position);
    dir.y = 0;
    if (dir.lengthSq() > cfg.faceCameraMinRadius * cfg.faceCameraMinRadius) {
      dir.normalize();
      wrapper.rotation.y = Math.atan2(-dir.x, -dir.z);
    }
  }

  // Recompute final bbox for caller introspection
  wrapper.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(wrapper);
  return {
    wrapper,
    scaleFactor,
    targetSize: cfg.targetSize,
    bboxSize: finalBox.getSize(new THREE.Vector3()),
    bboxCenter: finalBox.getCenter(new THREE.Vector3()),
  };
}

/**
 * Place the camera at a fixed distance from `target`, with a downward
 * elevation angle. Reusable `Reset View` handler.
 *
 * @param {THREE.Camera}   camera
 * @param {Object}         orbitControls  // { target, object, update }
 * @param {THREE.Vector3}  [target]
 * @param {number}         [distance=10]
 * @param {number}         [elevationDeg=35]   // upward tilt from horizon
 * @param {number}         [azimuthDeg=25]     // off-axis to avoid pure front
 */
export function frameAtDistance(
  camera,
  orbitControls,
  target = null,
  distance = 10,
  elevationDeg = 35,
  azimuthDeg = 25
) {
  if (!camera) return;
  const phi = THREE.MathUtils.degToRad(elevationDeg);
  const azim = THREE.MathUtils.degToRad(azimuthDeg);
  const _t = target || new THREE.Vector3(0, 0, 0);
  const cosPhi = Math.cos(phi);
  const offset = new THREE.Vector3(
    Math.sin(azim) * distance * cosPhi,
    Math.sin(phi)   * distance,
    Math.cos(azim) * distance * cosPhi
  );
  // Sanity: distance should be exactly `distance`
  const len = offset.length();
  if (len > 0 && Math.abs(len - distance) > 1e-3) {
    offset.multiplyScalar(distance / len);
  }

  camera.position.copy(_t).add(offset);
  if (typeof camera.lookAt === 'function') camera.lookAt(_t);

  if (orbitControls) {
    if (orbitControls.target) orbitControls.target.copy(_t);
    if (orbitControls.object) orbitControls.object = camera;
    if (typeof orbitControls.update === 'function') orbitControls.update();
  }
  if (typeof camera.updateProjectionMatrix === 'function') {
    camera.updateProjectionMatrix();
  }
}

export const IMPORT_NORMALIZE_DEFAULTS = DEFAULTS;
