/**
 * vr_interactions.js — WebXR VR Interaction Helpers
 *
 * Provides controller input handling, teleportation locomotion,
 * grab/move interactions, and ray-based selection for WebXR sessions.
 */

import * as THREE from 'three';

/**
 * Check if WebXR is available in this browser.
 * @returns {boolean}
 */
export function isVRAvailable() {
  return !!navigator.xr;
}

/**
 * Request a VR session on the given renderer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {Object} opts — { optionalFeatures: ['hand-tracking', 'local-floor'] }
 * @returns {Promise<XRSession|null>}
 */
export async function enterVR(renderer, opts = {}) {
  if (!navigator.xr) {
    console.warn('[VR] WebXR not supported');
    return null;
  }
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: opts.optionalFeatures || ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    renderer.xr.enabled = true;
    renderer.xr.setSession(session);
    return session;
  } catch (e) {
    console.warn('[VR] Failed to start session:', e);
    return null;
  }
}

/**
 * Exit the current VR session.
 * @param {THREE.WebGLRenderer} renderer
 */
export async function exitVR(renderer) {
  const session = renderer.xr.getSession();
  if (session) {
    await session.end();
    renderer.xr.enabled = false;
  }
}

/**
 * Create a teleportation ray for VR controller.
 * @param {THREE.Scene} scene
 * @param {THREE.Color} color
 * @returns {{ line: THREE.Line, mesh: THREE.Mesh }}
 */
export function createTeleportRay(scene, color = 0x4a9eff) {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
  const line = new THREE.Line(geo, mat);
  line.name = 'TeleportRay';

  // Landing indicator ring
  const ringGeo = new THREE.RingGeometry(0.3, 0.35, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.name = 'TeleportTarget';
  ring.visible = false;
  scene.add(ring);

  return { line, mesh: ring };
}

/**
 * Create a laser pointer ray for VR selection.
 * @param {THREE.Color} color
 * @returns {THREE.Line}
 */
export function createLaserPointer(color = 0xff4444) {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const line = new THREE.Line(geo, mat);
  line.name = 'LaserPointer';
  return line;
}

/**
 * Perform a raycast from a controller for object selection.
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Object3D} controller — the XR controller group
 * @param {THREE.Object3D[]} targets — objects to test against
 * @returns {THREE.Intersection|null}
 */
export function raycastSelect(raycaster, controller, targets) {
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(targets, true);
  return hits.length > 0 ? hits[0] : null;
}

/**
 * Set up a standard VR controller pair with grab + teleport capabilities.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @returns {{ controller1, controller2, grabber, teleporter }}
 */
export function setupVRControllers(renderer, scene) {
  const controller1 = renderer.xr.getController(0);
  const controller2 = renderer.xr.getController(1);
  scene.add(controller1);
  scene.add(controller2);

  // Visual representation — small sphere at grip
  const gripGeo = new THREE.SphereGeometry(0.02, 8, 8);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8 });
  const grip1 = new THREE.Mesh(gripGeo, gripMat);
  const grip2 = new THREE.Mesh(gripGeo, gripMat);
  controller1.add(grip1);
  controller2.add(grip2);

  // Add laser pointers
  const laser1 = createLaserPointer(0x4a9eff);
  const laser2 = createLaserPointer(0xff6644);
  controller1.add(laser1);
  controller2.add(laser2);

  const raycaster = new THREE.Raycaster();

  return {
    controller1,
    controller2,
    raycaster,
    /** Grab the intersected object */
    grab(hit) {
      if (hit?.object) {
        controller1.attach(hit.object);
        return hit.object;
      }
      return null;
    },
    /** Release grabbed object back to scene */
    release(obj, scene) {
      if (obj) scene.attach(obj);
    }
  };
}

export function vrInfo() {
  return {
    title: 'VR Interaction Helpers',
    description: 'WebXR controller input, teleportation, and interaction utilities.',
    version: '2.0.0',
    features: ['enter/exit VR', 'teleportation', 'laser pointer', 'grab/release', 'controller setup']
  };
}