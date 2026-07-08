/**
 * physics_bridge.js — Physics Bridge
 *
 * Lightweight bridge between the pose tool and the physics engine.
 * Provides a safe hook that can be overridden at runtime with a real
 * physics implementation. Falls back gracefully when no engine is available.
 */

import * as THREE from 'three';

const _state = {
  enabled: false,
  timeStep: 1 / 60,
  onBeforeStep: null,
  onAfterStep: null,
};

/**
 * Initialize the physics bridge.
 * @param {Object} opts
 * @param {number} opts.timeStep — physics step interval (default 1/60)
 * @param {Function} opts.onBeforeStep — callback before each step
 * @param {Function} opts.onAfterStep — callback after each step
 * @returns {boolean}
 */
export function initPhysicsBridge(opts = {}) {
  _state.timeStep = opts.timeStep ?? 1 / 60;
  _state.onBeforeStep = opts.onBeforeStep ?? null;
  _state.onAfterStep = opts.onAfterStep ?? null;
  _state.enabled = true;

  // Wire into window for runtime override by real physics implementations
  if (!window.applyPhysics) {
    window.applyPhysics = (dt) => stepPhysics(dt);
  }
  return true;
}

/**
 * Step the physics simulation forward.
 * If a real physics system (PhysicsSystem/cannon-es) is active, delegates to it.
 * Otherwise runs a simple gravity + floor collision fallback.
 * @param {number} deltaTime
 */
export function stepPhysics(deltaTime) {
  if (!_state.enabled) return;

  const dt = deltaTime ?? _state.timeStep;
  _state.onBeforeStep?.(dt);

  // Delegate to real PhysicsSystem if available
  const ps = window.ProModelerApp?.physicsSystem;
  if (ps?.enabled && ps?.world) {
    ps.update(dt);
    _state.onAfterStep?.(dt);
    return;
  }

  // Simple fallback: apply gravity to objects with userData.velocity
  const scene = window.ProModelerApp?.scene;
  if (scene) {
    scene.traverse(obj => {
      if (obj.userData?.velocity) {
        const v = obj.userData.velocity;
        v.y = (v.y || 0) - 9.82 * dt;
        obj.position.x += v.x * dt;
        obj.position.y += v.y * dt;
        obj.position.z += v.z * dt;

        // Floor collision
        if (obj.position.y < 0) {
          obj.position.y = 0;
          v.y = Math.abs(v.y) * 0.3; // bounce with damping
          if (Math.abs(v.y) < 0.1) v.y = 0;
        }
      }
    });
  }

  _state.onAfterStep?.(dt);
}

/**
 * Enable/disable the bridge.
 */
export function setPhysicsEnabled(enabled) {
  _state.enabled = enabled;
}

/**
 * Apply real physics to a scene.
 *
 * Scans the scene tree for meshes and adds rigid bodies via the active
 * PhysicsSystem (cannon-es) when available, or sets up a gravity + floor
 * collision fallback on userData.velocity.  Returns a control handle.
 *
 * @param {THREE.Scene|THREE.Object3D} scene — root to scan for meshes
 * @param {number} [timeStep=1/60] — fixed physics step interval
 * @param {Object} [opts]
 * @param {number} [opts.mass=1] — default mass for dynamic meshes
 * @param {RegExp|Function} [opts.ignore] — pattern or predicate to skip meshes
 * @param {boolean} [opts.addGround=true] — add a static ground plane body
 * @returns {{ destroy: Function, pause: Function, resume: Function,
 *            bodies: Array, enabled: boolean }}
 */
export function stubApplyPhysics(scene, timeStep = 1/60, opts = {}) {
  const mass = opts.mass ?? 1;
  const ignore = opts.ignore ?? (() => false);
  const addGround = opts.addGround !== false;

  // 1. Init the bridge
  initPhysicsBridge({ timeStep });

  // 2. Try the real PhysicsSystem
  const ps = window.ProModelerApp?.physicsSystem;
  let bodies = [];

  if (ps && !ps.CANNON._isShim && ps.world) {
    // ── cannon-es path ──
    const meshes = [];
    scene.traverse(child => {
      if (child.isMesh && !_shouldSkip(child, ignore)) {
        meshes.push(child);
      }
    });

    // Add ground plane if nothing in the scene acts as one.
    // Detects meshes named Plane/Ground, flagged as isGround, or PlaneGeometry near y=0.
    if (addGround && !meshes.some(m => _isGroundMesh(m))) {
      const groundGeo = new THREE.PlaneGeometry(200, 200);
      const groundMat = new THREE.MeshStandardMaterial({ visible: false });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = -0.01;
      groundMesh.name = '__physicsGround';
      groundMesh.userData.isGround = true;
      scene.add(groundMesh);
      meshes.push(groundMesh);
    }

    // Assign mass: named collision shapes & the ground get mass 0 (static)
    for (const mesh of meshes) {
      const m = (mesh.userData.isGround || mesh.name === '__physicsGround')
        ? 0
        : mass;
      const body = ps.addBody(mesh, m);
      if (body) bodies.push({ mesh, body });
    }

    if (!ps.enabled) ps.setEnabled(true);
    // Note: intentionally skip ps.syncScene() — it clears all manually added bodies
    // and re-adds from this.studio.objects, which would undo our manual addBody() work.

  } else {
    // ── Fallback: gravity via userData.velocity ──
    scene.traverse(child => {
      if (child.isMesh && !_shouldSkip(child, ignore)) {
        if (!child.userData.velocity) {
          child.userData.velocity = { x: 0, y: -0.5, z: 0 };
        }
        bodies.push({ mesh: child, body: null });
      }
    });
  }

  // 3. Return a lifecycle handle
  const handle = {
    bodies,
    get enabled() { return _state.enabled; },
    pause() {
      _state.enabled = false;
      if (ps) ps.setEnabled(false);
    },
    resume() {
      _state.enabled = true;
      if (ps) ps.setEnabled(true);
    },
    destroy() {
      _state.enabled = false;
      if (ps) {
        for (const { mesh } of bodies) {
          ps.removeBody(mesh);
        }
      } else {
        scene.traverse(child => {
          if (child.isMesh && child.userData?.velocity) {
            delete child.userData.velocity;
          }
        });
      }
      bodies = [];
      if (window.applyPhysics === stepPhysics) {
        delete window.applyPhysics;
      }
    },
  };

  return handle;
}

/** @private */
function _shouldSkip(object, ignore) {
  if (typeof ignore === 'function') return ignore(object);
  if (ignore instanceof RegExp) return ignore.test(object.name || '');
  return false;
}

/** @private true if the mesh looks like a ground plane */
function _isGroundMesh(mesh) {
  if (mesh.name === 'Plane' || mesh.name === 'Ground' || mesh.userData.isGround) return true;
  const g = mesh.geometry;
  if (g && g.type === 'PlaneGeometry' && Math.abs(mesh.position.y) < 0.1) return true;
  return false;
}

export function physicsBridgeInfo() {
  return {
    title: 'Physics Bridge',
    version: '2.0.0',
    enabled: _state.enabled,
    features: ['gravity fallback', 'floor collision', 'PhysicsSystem delegation']
  };
}