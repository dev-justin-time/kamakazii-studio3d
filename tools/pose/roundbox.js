/*
  roundbox.js
  Title: RoundBox Utilities
  Purpose: Factory for creating rounded box geometries with filleted edges.
  Uses Three.js RoundedBoxGeometry addon for proper chamfered edges.
*/

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Create a rounded box mesh with filleted edges.
 *
 * @param {number} width    - Box width (X)
 * @param {number} height   - Box height (Y)
 * @param {number} depth    - Box depth (Z)
 * @param {number} radius   - Fillet radius (must be < 0.5 * min(width, height, depth))
 * @param {number} segments - Subdivisions along each fillet arc (higher = smoother)
 * @param {THREE.Material} material
 * @returns {THREE.Mesh}
 */
export function createRoundBox(
  width = 1,
  height = 1,
  depth = 1,
  radius = 0.1,
  segments = 4,
  material = new THREE.MeshStandardMaterial({ color: 0x888888 })
) {
  // Clamp radius to prevent self-intersecting geometry
  const maxRadius = 0.499 * Math.min(width, height, depth);
  const clampedRadius = Math.max(0, Math.min(radius, maxRadius));
  const clampedSegments = Math.max(1, Math.floor(segments));

  const geo = new RoundedBoxGeometry(width, height, depth, clampedSegments, clampedRadius);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.roundBox = { width, height, depth, radius: clampedRadius, segments: clampedSegments };
  return mesh;
}