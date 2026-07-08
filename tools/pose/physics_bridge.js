/**
 * physics_bridge.js — Physics Bridge
 *
 * Lightweight bridge between the pose tool and the physics engine.
 * Provides a safe hook that can be overridden at runtime with a real
 * physics implementation. Falls back gracefully when no engine is available.
 */

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
 * Backward-compatible alias.
 */
export function stubApplyPhysics(scene, timeStep = 1/60) {
  return initPhysicsBridge({ timeStep });
}

export function physicsBridgeInfo() {
  return {
    title: 'Physics Bridge',
    version: '2.0.0',
    enabled: _state.enabled,
    features: ['gravity fallback', 'floor collision', 'PhysicsSystem delegation']
  };
}