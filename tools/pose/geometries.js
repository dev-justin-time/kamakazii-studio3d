/**
 * geometries.js — Geometry Hub
 *
 * Centralizes model import, validation, assembly, and procedural geometry
 * generation for the pose tool. Provides helpers for building humanoid rigs,
 * basic shapes, and importing external models.
 */

import * as THREE from 'three';

/**
 * Create a simple humanoid rig (capsule body + sphere head + cylinder limbs).
 * @param {Object} opts
 * @param {number} opts.height — total height (default 1.8)
 * @param {number} opts.segments — radial segments for smoothness (default 16)
 * @returns {THREE.Group}
 */
export function createHumanoid(opts = {}) {
  const { height = 1.8, segments = 16 } = opts;
  const group = new THREE.Group();
  group.name = 'Humanoid';

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xddbb99, roughness: 0.7 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x4466aa, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });

  const s = height / 1.8; // scale factor

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, segments, segments), skinMat);
  head.position.y = 1.6 * s;
  head.name = 'Head';
  group.add(head);

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.13 * s, 0.55 * s, segments), clothMat);
  torso.position.y = 1.15 * s;
  torso.name = 'Torso';
  group.add(torso);

  // Hips
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.15 * s, 0.15 * s, segments), clothMat);
  hips.position.y = 0.82 * s;
  hips.name = 'Hips';
  group.add(hips);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.035 * s, 0.03 * s, 0.55 * s, 8);
  const lArm = new THREE.Mesh(armGeo, skinMat);
  lArm.position.set(-0.22 * s, 1.15 * s, 0);
  lArm.rotation.z = 0.15;
  lArm.name = 'LeftArm';
  group.add(lArm);

  const rArm = new THREE.Mesh(armGeo, skinMat);
  rArm.position.set(0.22 * s, 1.15 * s, 0);
  rArm.rotation.z = -0.15;
  rArm.name = 'RightArm';
  group.add(rArm);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05 * s, 0.04 * s, 0.7 * s, 8);
  const lLeg = new THREE.Mesh(legGeo, clothMat);
  lLeg.position.set(-0.08 * s, 0.42 * s, 0);
  lLeg.name = 'LeftLeg';
  group.add(lLeg);

  const rLeg = new THREE.Mesh(legGeo, clothMat);
  rLeg.position.set(0.08 * s, 0.42 * s, 0);
  rLeg.name = 'RightLeg';
  group.add(rLeg);

  // Feet
  const footGeo = new THREE.BoxGeometry(0.06 * s, 0.04 * s, 0.12 * s);
  const lFoot = new THREE.Mesh(footGeo, shoeMat);
  lFoot.position.set(-0.08 * s, 0.04 * s, 0.02 * s);
  lFoot.name = 'LeftFoot';
  group.add(lFoot);

  const rFoot = new THREE.Mesh(footGeo, shoeMat);
  rFoot.position.set(0.08 * s, 0.04 * s, 0.02 * s);
  rFoot.name = 'RightFoot';
  group.add(rFoot);

  return group;
}

/**
 * Create a basic procedural shape by type name.
 * @param {string} type — 'cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'icosahedron'
 * @param {Object} opts
 * @returns {THREE.Mesh}
 */
export function createPrimitive(type = 'cube', opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0x4a9eff,
    roughness: opts.roughness ?? 0.4,
    metalness: opts.metalness ?? 0.1,
  });

  let geo;
  switch (type) {
    case 'sphere':       geo = new THREE.SphereGeometry(0.5, 32, 24); break;
    case 'cylinder':     geo = new THREE.CylinderGeometry(0.3, 0.3, 1, 24); break;
    case 'cone':         geo = new THREE.ConeGeometry(0.4, 0.8, 24); break;
    case 'torus':        geo = new THREE.TorusGeometry(0.4, 0.15, 16, 32); break;
    case 'plane':        geo = new THREE.PlaneGeometry(1, 1, 4, 4); break;
    case 'icosahedron':  geo = new THREE.IcosahedronGeometry(0.5, 0); break;
    case 'cube':
    default:             geo = new THREE.BoxGeometry(1, 1, 1); break;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = type.charAt(0).toUpperCase() + type.slice(1);
  return mesh;
}

/**
 * Validate imported geometry and ensure it has proper attributes.
 * @param {THREE.BufferGeometry} geo
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateGeometry(geo) {
  const issues = [];
  if (!geo.attributes.position) issues.push('Missing position attribute');
  let computedNormals = false;
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
    computedNormals = true;
  }
  if (geo.attributes.position) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (bb) {
      const size = bb.getSize(new THREE.Vector3());
      if (size.length() < 1e-6) issues.push('Degenerate bounding box');
    }
  }
  return { valid: issues.length === 0, issues, computedNormals };
}

export function maimInfo() {
  return {
    title: 'Geometry Hub',
    description: 'Central hub for importing, validating, and assembling models into the scene.',
    threeAvailable: !!THREE
  };
}