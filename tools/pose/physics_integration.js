/**
 * physics_integration.js — Physics Integration
 *
 * Bridge between the pose tool and the PhysicsSystem (cannon-es).
 * Provides convenient wrappers for adding physics bodies to posed models,
 * ragdoll simulation, and collision detection.
 */

import * as THREE from 'three';

/**
 * Get the active PhysicsSystem from the app.
 * @returns {Object|null}
 */
function _getPhysics() {
  return window.ProModelerApp?.physicsSystem || null;
}

/**
 * Enable physics simulation on the current scene.
 * @returns {boolean}
 */
export function enablePhysics() {
  const ps = _getPhysics();
  if (!ps) return false;
  ps.setEnabled(true);
  ps.syncScene();
  return true;
}

/**
 * Add a rigid body to a mesh.
 * @param {THREE.Mesh} mesh
 * @param {Object} opts — { mass, material, group, mask }
 * @returns {Object|null} — the cannon-es body or null
 */
export function addRigidBody(mesh, opts = {}) {
  const ps = _getPhysics();
  if (!ps) return null;
  return ps.addBody(mesh, opts.mass ?? 1, opts);
}

/**
 * Add a static trimesh collision shape from geometry.
 * @param {THREE.Mesh} mesh
 * @returns {Object|null}
 */
export function addStaticMesh(mesh) {
  const ps = _getPhysics();
  if (!ps) return null;
  return ps.addTrimesh(mesh, 0);
}

/**
 * Create a ragdoll from a humanoid model group.
 * Adds physics bodies to each named limb (Head, Torso, LeftArm, etc.)
 * and connects them with constraints.
 * @param {THREE.Group} humanoidGroup
 * @returns {Array} — array of { mesh, body } entries
 */
export function createRagdoll(humanoidGroup) {
  const ps = _getPhysics();
  if (!ps || !humanoidGroup) return [];

  const bodies = [];
  humanoidGroup.traverse(child => {
    if (child.isMesh && child.name) {
      const mass = child.name === 'Head' ? 5 : child.name === 'Torso' ? 10 : 2;
      const body = ps.addBody(child, mass);
      if (body) bodies.push({ mesh: child, body, name: child.name });
    }
  });

  // Connect adjacent body parts with spring constraints
  const connections = [
    ['Head', 'Torso'],
    ['Torso', 'Hips'],
    ['LeftArm', 'Torso'],
    ['RightArm', 'Torso'],
    ['LeftLeg', 'Hips'],
    ['RightLeg', 'Hips'],
    ['LeftFoot', 'LeftLeg'],
    ['RightFoot', 'RightLeg'],
  ];

  for (const [nameA, nameB] of connections) {
    const a = bodies.find(b => b.name === nameA);
    const b = bodies.find(b => b.name === nameB);
    if (a && b) {
      ps.createConstraint('spring', a.body, b.body, {
        restLength: 0.1,
        stiffness: 500,
        damping: 10,
      });
    }
  }

  return bodies;
}

/**
 * Drop a mesh with physics — adds a body and lets it fall.
 * @param {THREE.Mesh} mesh
 * @param {number} mass
 */
export function dropWithPhysics(mesh, mass = 1) {
  const body = addRigidBody(mesh, { mass });
  if (body) {
    // Apply a small random impulse for natural tumble
    body.applyImpulse?.({
      x: (Math.random() - 0.5) * 2,
      y: 0,
      z: (Math.random() - 0.5) * 2
    });
  }
  return body;
}

/**
 * Create a physics floor plane.
 * @returns {Object|null}
 */
export function addFloorPlane() {
  const ps = _getPhysics();
  if (!ps) return null;
  // The ground plane is auto-created in syncScene()
  return true;
}

export function physicsInfo() {
  return {
    title: 'Physics Integration',
    description: 'Bridge between pose tool and cannon-es physics engine.',
    version: '2.0.0',
    features: ['rigid bodies', 'ragdoll', 'constraints', 'trimesh collision', 'floor plane']
  };
}