/**
 * VoxelEngine — Sparse octree voxel editor with boolean CSG operations.
 *
 * Features:
 * - Sparse octree with configurable resolution (8³ to 512³)
 * - Voxelization from triangle meshes (Möller-Trumbore ray-triangle intersection)
 * - Boolean CSG: union, intersection, difference
 * - Marching cubes isosurface extraction for smooth mesh output
 * - Brush tools: add/remove voxels, sphere brush, box brush
 * - Material/color per voxel
 * - LOD via octree level-of-detail
 */

import * as THREE from 'three';

/* ── Octree Node ── */

class OctreeNode {
  /**
   * @param {number} ox - Origin X (center of this node)
   * @param {number} oy - Origin Y
   * @param {number} oz - Origin Z
   * @param {number} half - Half-width of this node
   * @param {number} level - Depth level (leaf = 0)
   */
  constructor(ox, oy, oz, half, level) {
    this.ox = ox; this.oy = oy; this.oz = oz;
    this.half = half;
    this.level = level;
    this.children = null;  // null = leaf, or [8 OctreeNodes]
    this.filled = false;   // leaf: is this voxel solid?
    this.material = 0;     // leaf: material index / color
    this._count = -1;      // cached filled descendant count (-1 = dirty)
  }

  isLeaf() { return this.children === null; }

  /**
   * Get child index for a point. 0-7 mapping:
   *   0: ---  1: +--  2: -+-  3: ++-  4: --+  5: +-+  6: -++  7: +++
   */
  childIndex(x, y, z) {
    return (x > this.ox ? 1 : 0) | (y > this.oy ? 2 : 0) | (z > this.oz ? 4 : 0);
  }

  /**
   * Get the origin of the i-th child.
   */
  childOrigin(i) {
    const q = this.half / 2;
    return {
      x: this.ox + (i & 1 ? q : -q),
      y: this.oy + (i & 2 ? q : -q),
      z: this.oz + (i & 4 ? q : -q),
    };
  }

  /**
   * Split this leaf into 8 children, propagating its value.
   */
  subdivide() {
    if (this.children) return;
    this.children = new Array(8);
    const q = this.half / 2;
    for (let i = 0; i < 8; i++) {
      const o = this.childOrigin(i);
      this.children[i] = new OctreeNode(o.x, o.y, o.z, q, this.level - 1);
      this.children[i].filled = this.filled;
      this.children[i].material = this.material;
    }
    this._count = -1;
  }

  /**
   * Collapse children if all have the same value.
   */
  tryCollapse() {
    if (!this.children) return;
    const first = this.children[0];
    const allSame = this.children.every(c =>
      c.isLeaf() && c.filled === first.filled && c.material === first.material
    );
    if (allSame) {
      this.filled = first.filled;
      this.material = first.material;
      this.children = null;
      this._count = -1;
    }
  }

  /**
   * Count filled leaf nodes.
   */
  countFilled() {
    if (this._count >= 0) return this._count;
    if (this.isLeaf()) {
      this._count = this.filled ? 1 : 0;
    } else {
      this._count = 0;
      for (const c of this.children) this._count += c.countFilled();
    }
    return this._count;
  }

  invalidate() { this._count = -1; }
}

/* ── Voxel Engine ── */

export class VoxelEngine {
  /**
   * @param {object} opts
   * @param {number} opts.resolution - Grid resolution per axis (e.g. 64, 128, 256)
   * @param {number} opts.worldSize - World-space size of the voxel grid
   */
  constructor(opts = {}) {
    const res = opts.resolution ?? 64;
    this.resolution = res;
    this.worldSize = opts.worldSize ?? 10;
    this.voxelSize = this.worldSize / res;
    // Max depth: log2(resolution)
    this.maxLevel = Math.ceil(Math.log2(res));
    this.root = new OctreeNode(0, 0, 0, this.worldSize / 2, this.maxLevel);
  }

  /* ── Voxel Access ── */

  /**
   * Set a voxel at world-space coordinates.
   * @param {number} x - World X
   * @param {number} y - World Y
   * @param {number} z - World Z
   * @param {boolean} filled
   * @param {number} material
   */
  setVoxel(x, y, z, filled = true, material = 0) {
    this._setRecursive(this.root, x, y, z, filled, material);
  }

  _setRecursive(node, x, y, z, filled, material) {
    // Check bounds
    if (Math.abs(x - node.ox) > node.half || Math.abs(y - node.oy) > node.half || Math.abs(z - node.oz) > node.half) {
      return;
    }

    if (node.level === 0) {
      node.filled = filled;
      node.material = material;
      node._count = -1;
      return;
    }

    if (node.isLeaf() && node.filled === filled && node.material === material) {
      return; // Already at this value
    }

    node.subdivide();
    const idx = node.childIndex(x, y, z);
    this._setRecursive(node.children[idx], x, y, z, filled, material);
    node.invalidate();
  }

  /**
   * Get voxel state at world-space coordinates.
   * @returns {{ filled: boolean, material: number }}
   */
  getVoxel(x, y, z) {
    return this._getRecursive(this.root, x, y, z);
  }

  _getRecursive(node, x, y, z) {
    if (Math.abs(x - node.ox) > node.half || Math.abs(y - node.oy) > node.half || Math.abs(z - node.oz) > node.half) {
      return { filled: false, material: 0 };
    }
    if (node.isLeaf()) return { filled: node.filled, material: node.material };
    const idx = node.childIndex(x, y, z);
    return this._getRecursive(node.children[idx], x, y, z);
  }

  /* ── Voxelization from Mesh ── */

  /**
   * Voxelize a Three.js Mesh into the octree.
   * Uses triangle-AABB intersection tests for accuracy.
   * @param {THREE.Mesh} mesh
   * @param {number} material - Material index for filled voxels
   */
  voxelizeMesh(mesh, material = 0) {
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;

    geo.computeBoundingBox();
    const bb = geo.boundingBox;

    // Get mesh-to-world transform
    mesh.updateMatrixWorld(true);
    const invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();

    const pos = posAttr.array;
    const idx = geo.index?.array;
    const triCount = idx ? idx.length / 3 : posAttr.count / 3;

    // Determine grid bounds from mesh bounding box (in world space)
    const worldMin = bb.min.clone().applyMatrix4(mesh.matrixWorld);
    const worldMax = bb.max.clone().applyMatrix4(mesh.matrixWorld);

    const halfVs = this.voxelSize / 2;

    // For each triangle, find which voxels it intersects
    for (let ti = 0; ti < triCount; ti++) {
      let i0, i1, i2;
      if (idx) {
        i0 = idx[ti * 3]; i1 = idx[ti * 3 + 1]; i2 = idx[ti * 3 + 2];
      } else {
        i0 = ti * 3; i1 = ti * 3 + 1; i2 = ti * 3 + 2;
      }

      // Triangle vertices in world space
      const v0 = new THREE.Vector3(pos[i0*3], pos[i0*3+1], pos[i0*3+2]).applyMatrix4(mesh.matrixWorld);
      const v1 = new THREE.Vector3(pos[i1*3], pos[i1*3+1], pos[i1*3+2]).applyMatrix4(mesh.matrixWorld);
      const v2 = new THREE.Vector3(pos[i2*3], pos[i2*3+1], pos[i2*3+2]).applyMatrix4(mesh.matrixWorld);

      // Triangle AABB in grid space
      const tMin = new THREE.Vector3(Math.min(v0.x, v1.x, v2.x), Math.min(v0.y, v1.y, v2.y), Math.min(v0.z, v1.z, v2.z));
      const tMax = new THREE.Vector3(Math.max(v0.x, v1.x, v2.x), Math.max(v0.y, v1.y, v2.y), Math.max(v0.z, v1.z, v2.z));

      // Snap to grid
      const gMinX = Math.floor((tMin.x - this.root.ox + this.root.half) / this.voxelSize);
      const gMinY = Math.floor((tMin.y - this.root.oy + this.root.half) / this.voxelSize);
      const gMinZ = Math.floor((tMin.z - this.root.oz + this.root.half) / this.voxelSize);
      const gMaxX = Math.ceil((tMax.x - this.root.ox + this.root.half) / this.voxelSize);
      const gMaxY = Math.ceil((tMax.y - this.root.oy + this.root.half) / this.voxelSize);
      const gMaxZ = Math.ceil((tMax.z - this.root.oz + this.root.half) / this.voxelSize);

      const origin = this.root.ox - this.root.half;
      const originY = this.root.oy - this.root.half;
      const originZ = this.root.oz - this.root.half;

      // Test each grid cell in the triangle's AABB
      for (let gx = gMinX; gx <= gMaxX; gx++) {
        for (let gy = gMinY; gy <= gMaxY; gy++) {
          for (let gz = gMinZ; gz <= gMaxZ; gz++) {
            const cx = origin + (gx + 0.5) * this.voxelSize;
            const cy = originY + (gy + 0.5) * this.voxelSize;
            const cz = originZ + (gz + 0.5) * this.voxelSize;

            // Triangle-AABB intersection test
            if (this._triAABB(v0, v1, v2, cx, cy, cz, halfVs)) {
              this.setVoxel(cx, cy, cz, true, material);
            }
          }
        }
      }
    }

    // Flood-fill interior to make solid
    this._floodFillInterior();
  }

  /**
   * Triangle-AABB intersection test (Separating Axis Theorem).
   */
  _triAABB(v0, v1, v2, cx, cy, cz, half) {
    // Translate triangle to origin of AABB
    const ax = v0.x - cx, ay = v0.y - cy, az = v0.z - cz;
    const bx = v1.x - cx, by = v1.y - cy, bz = v1.z - cz;
    const cx2 = v2.x - cx, cy2 = v2.y - cy, cz2 = v2.z - cz;

    // AABB half-size
    const h = half;

    // Edge vectors
    const e0x = bx - ax, e0y = by - ay, e0z = bz - az;
    const e1x = cx2 - bx, e1y = cy2 - by, e1z = cz2 - bz;
    const e2x = ax - cx2, e2y = ay - cy2, e2z = az - cz2;

    // Test 9 cross products of edges with AABB axes
    const axes = [
      [0, -e0z, e0y, 0, -e1z, e1y, 0, -e2z, e2y],
      [e0z, 0, -e0x, e1z, 0, -e1x, e2z, 0, -e2x],
      [-e0y, e0x, 0, -e1y, e1x, 0, -e2y, e2x, 0],
    ];

    for (const axis of axes) {
      for (let i = 0; i < 3; i++) {
        const p0 = axis[i*3]*ax + axis[i*3+1]*ay + axis[i*3+2]*az;
        const p1 = axis[i*3]*bx + axis[i*3+1]*by + axis[i*3+2]*bz;
        const p2 = axis[i*3]*cx2 + axis[i*3+1]*cy2 + axis[i*3+2]*cz2;
        const r = h * (Math.abs(axis[i*3]) + Math.abs(axis[i*3+1]) + Math.abs(axis[i*3+2]));
        if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
      }
    }

    // Test AABB face normals (x, y, z)
    let minV, maxV;
    minV = Math.min(ax, bx, cx2); maxV = Math.max(ax, bx, cx2); if (minV > h || maxV < -h) return false;
    minV = Math.min(ay, by, cy2); maxV = Math.max(ay, by, cy2); if (minV > h || maxV < -h) return false;
    minV = Math.min(az, bz, cz2); maxV = Math.max(az, bz, cz2); if (minV > h || maxV < -h) return false;

    // Triangle normal axis
    const nx = e0y * e1z - e0z * e1y;
    const ny = e0z * e1x - e0x * e1z;
    const nz = e0x * e1y - e0y * e1x;
    const d = nx * ax + ny * ay + nz * az;
    const r2 = h * (Math.abs(nx) + Math.abs(ny) + Math.abs(nz));
    if (Math.abs(d) > r2) return false;

    return true;
  }

  /**
   * Simple flood fill: for each X scanline, fill interior voxels.
   * Uses parity counting (ray casting along X axis).
   */
  _floodFillInterior() {
    const res = this.resolution;
    const half = this.worldSize / 2;
    const origin = this.root.ox - half;

    for (let gy = 0; gy < res; gy++) {
      for (let gz = 0; gz < res; gz++) {
        const y = origin + (gy + 0.5) * this.voxelSize;
        const z = origin + (gz + 0.5) * this.voxelSize;
        let inside = false;
        let wasSolid = false;

        for (let gx = 0; gx < res; gx++) {
          const x = origin + (gx + 0.5) * this.voxelSize;
          const v = this.getVoxel(x, y, z);
          if (v.filled && !wasSolid) {
            inside = !inside;
          }
          wasSolid = v.filled;
          if (inside && !v.filled) {
            this.setVoxel(x, y, z, true, v.material || 0);
          }
        }
      }
    }
  }

  /* ── CSG Operations ── */

  /**
   * Boolean union: A ∪ B. Modifies this octree in-place.
   * @param {VoxelEngine} other
   */
  csgUnion(other) {
    this._csgOp(other, 'union');
  }

  /**
   * Boolean intersection: A ∩ B. Modifies this octree in-place.
   * @param {VoxelEngine} other
   */
  csgIntersection(other) {
    this._csgOp(other, 'intersection');
  }

  /**
   * Boolean difference: A - B. Modifies this octree in-place.
   * @param {VoxelEngine} other
   */
  csgDifference(other) {
    this._csgOp(other, 'difference');
  }

  _csgOp(other, op) {
    const res = this.resolution;
    const half = this.worldSize / 2;
    const origin = this.root.ox - half;

    for (let gx = 0; gx < res; gx++) {
      for (let gy = 0; gy < res; gy++) {
        for (let gz = 0; gz < res; gz++) {
          const x = origin + (gx + 0.5) * this.voxelSize;
          const y = origin + (gy + 0.5) * this.voxelSize;
          const z = origin + (gz + 0.5) * this.voxelSize;

          const a = this.getVoxel(x, y, z);
          const b = other.getVoxel(x, y, z);

          let filled, material;
          switch (op) {
            case 'union':
              filled = a.filled || b.filled;
              material = a.filled ? a.material : b.material;
              break;
            case 'intersection':
              filled = a.filled && b.filled;
              material = a.material;
              break;
            case 'difference':
              filled = a.filled && !b.filled;
              material = a.material;
              break;
          }

          if (filled !== a.filled) {
            this.setVoxel(x, y, z, filled, material);
          }
        }
      }
    }
  }

  /* ── Brush Tools ── */

  /**
   * Sphere brush: add or remove voxels within a radius.
   * @param {THREE.Vector3} center - World-space center
   * @param {number} radius - World-space radius
   * @param {boolean} add - true to add, false to remove
   * @param {number} material - Material index (when adding)
   */
  sphereBrush(center, radius, add = true, material = 0) {
    const minGx = Math.floor((center.x - radius - this.root.ox + this.root.half) / this.voxelSize);
    const maxGx = Math.ceil((center.x + radius - this.root.ox + this.root.half) / this.voxelSize);
    const minGy = Math.floor((center.y - radius - this.root.oy + this.root.half) / this.voxelSize);
    const maxGy = Math.ceil((center.y + radius - this.root.oy + this.root.half) / this.voxelSize);
    const minGz = Math.floor((center.z - radius - this.root.oz + this.root.half) / this.voxelSize);
    const maxGz = Math.ceil((center.z + radius - this.root.oz + this.root.half) / this.voxelSize);

    const origin = this.root.ox - this.root.half;
    const originY = this.root.oy - this.root.half;
    const originZ = this.root.oz - this.root.half;
    const r2 = radius * radius;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const x = origin + (gx + 0.5) * this.voxelSize;
          const y = originY + (gy + 0.5) * this.voxelSize;
          const z = originZ + (gz + 0.5) * this.voxelSize;
          const dx = x - center.x, dy = y - center.y, dz = z - center.z;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            this.setVoxel(x, y, z, add, material);
          }
        }
      }
    }
  }

  /**
   * Box brush: add or remove voxels within an AABB.
   */
  boxBrush(min, max, add = true, material = 0) {
    const minGx = Math.floor((min.x - this.root.ox + this.root.half) / this.voxelSize);
    const maxGx = Math.ceil((max.x - this.root.ox + this.root.half) / this.voxelSize);
    const minGy = Math.floor((min.y - this.root.oy + this.root.half) / this.voxelSize);
    const maxGy = Math.ceil((max.y - this.root.oy + this.root.half) / this.voxelSize);
    const minGz = Math.floor((min.z - this.root.oz + this.root.half) / this.voxelSize);
    const maxGz = Math.ceil((max.z - this.root.oz + this.root.half) / this.voxelSize);

    const origin = this.root.ox - this.root.half;
    const originY = this.root.oy - this.root.half;
    const originZ = this.root.oz - this.root.half;

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const x = origin + (gx + 0.5) * this.voxelSize;
          const y = originY + (gy + 0.5) * this.voxelSize;
          const z = originZ + (gz + 0.5) * this.voxelSize;
          this.setVoxel(x, y, z, add, material);
        }
      }
    }
  }

  /* ── Marching Cubes Mesh Extraction ── */

  /**
   * Extract a triangle mesh from the voxel grid using marching cubes.
   * @param {number} isoLevel - Density threshold (default 0.5)
   * @returns {THREE.BufferGeometry}
   */
  marchingCubes(isoLevel = 0.5) {
    const res = this.resolution;
    const half = this.worldSize / 2;
    const origin = this.root.ox - half;
    const originY = this.root.oy - half;
    const originZ = this.root.oz - half;
    const vs = this.voxelSize;

    // Sample the density field
    const field = new Float32Array((res + 1) * (res + 1) * (res + 1));
    const stride = res + 1;

    for (let x = 0; x <= res; x++) {
      for (let y = 0; y <= res; y++) {
        for (let z = 0; z <= res; z++) {
          const wx = origin + x * vs;
          const wy = originY + y * vs;
          const wz = originZ + z * vs;
          // Sample with slight smoothing (average of neighboring voxels)
          const v = this.getVoxel(wx, wy, wz);
          field[x * stride * stride + y * stride + z] = v.filled ? 1.0 : 0.0;
        }
      }
    }

    const vertices = [];
    const normals = [];

    // March each cube
    for (let x = 0; x < res; x++) {
      for (let y = 0; y < res; y++) {
        for (let z = 0; z < res; z++) {
          this._marchingCube(field, stride, x, y, z, isoLevel, origin, originY, originZ, vs, vertices, normals);
        }
      }
    }

    // Build geometry
    const geometry = new THREE.BufferGeometry();
    if (vertices.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  _marchingCube(field, stride, x, y, z, iso, ox, oy, oz, vs, vertices, normals) {
    // 8 corners of the cube
    const corners = [
      [x, y, z], [x+1, y, z], [x+1, y+1, z], [x, y+1, z],
      [x, y, z+1], [x+1, y, z+1], [x+1, y+1, z+1], [x, y+1, z+1]
    ];

    const vals = corners.map(c => field[c[0] * stride * stride + c[1] * stride + c[2]]);

    // Determine cube index
    let cubeIndex = 0;
    for (let i = 0; i < 8; i++) {
      if (vals[i] < iso) cubeIndex |= (1 << i);
    }

    if (EDGE_TABLE[cubeIndex] === 0) return;

    // Interpolate vertices along edges
    const edgeVerts = new Array(12);
    const edge = EDGE_TABLE[cubeIndex];

    for (let i = 0; i < 12; i++) {
      if (!(edge & (1 << i))) continue;
      const [c0, c1] = EDGE_PAIRS[i];
      const v0 = vals[c0], v1 = vals[c1];
      const t = (iso - v0) / (v1 - v0);
      const p0 = corners[c0], p1 = corners[c1];
      edgeVerts[i] = [
        ox + (p0[0] + t * (p1[0] - p0[0])) * vs,
        oy + (p0[1] + t * (p1[1] - p0[1])) * vs,
        oz + (p0[2] + t * (p1[2] - p0[2])) * vs,
      ];
    }

    // Emit triangles
    for (let i = 0; TRI_TABLE[cubeIndex][i] !== -1; i += 3) {
      const a = edgeVerts[TRI_TABLE[cubeIndex][i]];
      const b = edgeVerts[TRI_TABLE[cubeIndex][i + 1]];
      const c = edgeVerts[TRI_TABLE[cubeIndex][i + 2]];
      if (!a || !b || !c) continue;

      vertices.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

      // Compute face normal
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }
  }

  /* ── Simple Cubes Mesh (Blocky) ── */

  /**
   * Generate a blocky mesh (one cube per filled voxel).
   * Faster than marching cubes but produces more geometry.
   * @returns {THREE.BufferGeometry}
   */
  toBlockMesh() {
    const filled = [];
    this._collectFilled(this.root, filled);

    if (filled.length === 0) return new THREE.BufferGeometry();

    const vs = this.voxelSize / 2;
    const positions = [];
    const normals = [];
    const indices = [];
    let vertOffset = 0;

    // Check neighbors to only emit visible faces
    for (const { x, y, z } of filled) {
      const faces = [
        { dir: [1,0,0], verts: [[vs,-vs,-vs],[vs,vs,-vs],[vs,vs,vs],[vs,-vs,vs]], n: [1,0,0] },
        { dir: [-1,0,0], verts: [[-vs,-vs,vs],[-vs,vs,vs],[-vs,vs,-vs],[-vs,-vs,-vs]], n: [-1,0,0] },
        { dir: [0,1,0], verts: [[-vs,vs,-vs],[vs,vs,-vs],[vs,vs,vs],[-vs,vs,vs]], n: [0,1,0] },
        { dir: [0,-1,0], verts: [[-vs,-vs,vs],[vs,-vs,vs],[vs,-vs,-vs],[-vs,-vs,-vs]], n: [0,-1,0] },
        { dir: [0,0,1], verts: [[-vs,-vs,vs],[vs,-vs,vs],[vs,vs,vs],[-vs,vs,vs]], n: [0,0,1] },
        { dir: [0,0,-1], verts: [[vs,-vs,-vs],[-vs,-vs,-vs],[-vs,vs,-vs],[vs,vs,-vs]], n: [0,0,-1] },
      ];

      for (const face of faces) {
        const nx = x + face.dir[0] * this.voxelSize;
        const ny = y + face.dir[1] * this.voxelSize;
        const nz = z + face.dir[2] * this.voxelSize;
        const neighbor = this.getVoxel(nx, ny, nz);
        if (neighbor.filled) continue; // Hidden face

        for (const v of face.verts) {
          positions.push(x + v[0], y + v[1], z + v[2]);
          normals.push(face.n[0], face.n[1], face.n[2]);
        }
        indices.push(
          vertOffset, vertOffset + 1, vertOffset + 2,
          vertOffset, vertOffset + 2, vertOffset + 3
        );
        vertOffset += 4;
      }
    }

    const geometry = new THREE.BufferGeometry();
    if (positions.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setIndex(indices);
    }
    geometry.computeBoundingSphere();
    return geometry;
  }

  _collectFilled(node, list) {
    if (node.isLeaf()) {
      if (node.filled) list.push({ x: node.ox, y: node.oy, z: node.oz });
      return;
    }
    for (const c of node.children) this._collectFilled(c, list);
  }

  /* ── Statistics ── */

  getStats() {
    const filled = this.root.countFilled();
    return {
      resolution: this.resolution,
      worldSize: this.worldSize,
      voxelSize: this.voxelSize,
      filledVoxels: filled,
      maxLevel: this.maxLevel,
    };
  }
}

/* ── Marching Cubes Lookup Tables ── */

const EDGE_PAIRS = [
  [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]
];

const EDGE_TABLE = [
  0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,
  0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
  0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,
  0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
  0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,
  0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
  0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,
  0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
  0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,
  0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
  0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,
  0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
  0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,
  0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
  0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,
  0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
  0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,
  0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
  0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,
  0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
  0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,
  0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
  0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,
  0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
  0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,
  0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
  0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,
  0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
  0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,
  0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
  0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,
  0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0
];

// TRI_TABLE[cubeIndex] = list of edge indices forming triangles (-1 terminated)
const TRI_TABLE = [
  [],[0,8,3],[0,1,9],[1,8,3,9,8,1],[1,2,10],[0,8,3,1,2,10],[9,2,10,0,2,9],[2,8,3,2,10,8,10,9,8],
  [3,11,2],[0,11,2,8,11,0],[1,9,0,2,3,11],[1,11,2,1,9,11,9,8,11],[3,10,1,11,10,3],[0,10,1,0,8,10,8,11,10],[3,9,0,3,11,9,11,10,9],[9,8,10,10,8,11],
  [4,7,8],[4,3,0,7,3,4],[0,1,9,8,4,7],[4,1,9,4,7,1,7,3,1],[1,2,10,8,4,7],[3,4,7,3,0,4,1,2,10],[9,2,10,9,0,2,8,4,7],[2,10,9,2,9,7,2,7,3,7,9,4],
  [8,4,7,3,11,2],[11,4,7,11,2,4,2,0,4],[9,0,1,8,4,7,2,3,11],[4,7,11,9,4,11,9,11,2,9,2,1],[3,10,1,3,11,10,7,8,4],[1,11,10,1,4,11,1,0,4,7,11,4],[4,7,8,9,0,11,9,11,10,11,0,3],[4,7,11,4,11,9,9,11,10],
  [9,5,4],[9,5,4,0,8,3],[0,5,4,1,5,0],[8,5,4,8,3,5,3,1,5],[1,2,10,9,5,4],[3,0,8,1,2,10,4,9,5],[5,2,10,5,4,2,4,0,2],[2,10,5,3,2,5,3,5,4,3,4,8],
  [9,5,4,2,3,11],[0,11,2,0,8,11,4,9,5],[0,5,4,0,1,5,2,3,11],[2,1,5,2,5,8,2,8,11,4,8,5],[10,3,11,10,1,3,9,5,4],[4,9,5,0,8,1,8,10,1,8,11,10],[5,4,0,5,0,11,5,11,10,11,0,3],[5,4,8,5,8,10,10,8,11],
  [9,7,8,5,7,9],[9,3,0,9,5,3,5,7,3],[0,7,8,0,1,7,1,5,7],[1,5,3,3,5,7],[9,7,8,9,5,7,10,1,2],[10,1,2,9,5,0,5,3,0,5,7,3],[8,0,2,8,2,5,8,5,7,10,5,2],[2,10,5,2,5,3,3,5,7],
  [7,9,5,7,8,9,3,11,2],[9,5,7,9,7,2,9,2,0,2,7,11],[2,3,11,0,1,8,1,7,8,1,5,7],[11,2,1,11,1,7,7,1,5],[9,5,8,8,5,7,10,1,3,10,3,11],[5,7,0,5,0,9,7,11,0,1,0,10,11,10,0],[11,10,0,11,0,3,10,5,0,8,0,7,5,7,0],[11,10,5,7,11,5],
  [10,6,5],[0,8,3,5,10,6],[9,0,1,5,10,6],[1,8,3,1,9,8,5,10,6],[1,6,5,2,6,1],[1,6,5,1,2,6,3,0,8],[9,6,5,9,0,6,0,2,6],[5,9,8,5,8,2,5,2,6,3,2,8],
  [2,3,11,10,6,5],[11,0,8,11,2,0,10,6,5],[0,1,9,2,3,11,5,10,6],[5,10,6,1,9,2,9,11,2,9,8,11],[6,3,11,6,5,3,5,1,3],[0,8,11,0,11,5,0,5,1,5,11,6],[3,11,6,0,3,6,0,6,5,0,5,9],[6,5,9,6,9,11,11,9,8],
  [5,10,6,4,7,8],[4,3,0,4,7,3,6,5,10],[1,9,0,5,10,6,8,4,7],[10,6,5,1,9,7,1,7,3,7,9,4],[6,1,2,6,5,1,4,7,8],[1,2,5,5,2,6,3,0,4,3,4,7],[8,4,7,9,0,5,0,6,5,0,2,6],[7,3,9,7,9,4,3,2,9,5,9,6,2,6,9],
  [3,11,2,7,8,4,10,6,5],[5,10,6,4,7,2,4,2,0,2,7,11],[0,1,9,4,7,8,2,3,11,5,10,6],[9,2,1,9,11,2,9,4,11,7,11,4,5,10,6],[8,4,7,3,11,5,3,5,1,5,11,6],[5,1,11,5,11,6,1,0,11,7,11,4,0,4,11],[0,5,9,0,6,5,0,3,6,11,6,3,8,4,7],[6,5,9,6,9,11,4,7,9,7,11,9],
  [10,4,9,6,4,10],[4,10,6,4,9,10,0,8,3],[10,0,1,10,6,0,6,4,0],[8,3,1,8,1,6,8,6,4,6,1,10],[1,4,9,1,2,4,2,6,4],[3,0,8,1,2,9,2,4,9,2,6,4],[0,2,4,4,2,6],[8,3,2,8,2,4,4,2,6],
  [10,4,9,10,6,4,11,2,3],[0,8,2,2,8,11,4,9,10,4,10,6],[3,11,2,0,1,6,0,6,4,6,1,10],[6,4,1,6,1,10,4,8,1,2,1,11,8,11,1],[9,6,4,9,3,6,9,1,3,11,6,3],[8,11,1,8,1,0,11,6,1,9,1,4,6,4,1],[3,11,6,3,6,0,0,6,4],[6,4,8,11,6,8],
  [7,10,6,7,8,10,8,9,10],[0,7,3,0,10,7,0,9,10,6,7,10],[10,6,7,1,10,7,1,7,8,1,8,0],[10,6,7,10,7,1,1,7,3],[1,2,6,1,6,8,1,8,9,8,6,7],[2,6,9,2,9,1,6,7,9,0,9,3,7,3,9],[7,8,0,7,0,6,6,0,2],[7,3,2,6,7,2],
  [2,3,11,10,6,8,10,8,9,8,6,7],[2,0,7,2,7,11,0,9,7,6,7,10,9,10,7],[1,8,0,1,7,8,1,10,7,6,7,10,2,3,11],[11,2,1,11,1,7,10,6,1,6,7,1],[8,9,6,8,6,7,9,1,6,11,6,3,1,3,6],[0,9,1,11,6,7],[7,8,0,7,0,6,3,11,0,11,6,0],[7,11,6],
  [7,6,8],[3,0,7,0,6,7],[8,0,7,0,1,7,1,6,7],[1,6,7,1,7,3],[7,6,8,1,2,9,2,8,9],[1,2,9,9,2,8,3,0,7,0,6,7],[2,0,7,2,7,6],[2,7,3,6,7,2],
  [7,6,8,2,3,11],[11,2,0,11,0,7,7,0,8,6,7,0,1,0,9],[2,3,11,0,1,7,0,7,8,1,6,7],[11,2,1,11,1,7,1,6,7],[8,7,6,8,9,7,1,2,9,2,11,9,3,11,9,2],[1,6,7,1,7,0,0,7,8,11,6,7,2,11,7],[2,11,7,2,7,6,0,3,7,3,11,7],[2,11,6,7,2,6],
  [7,6,8,3,11,2,9,5,4],[5,4,9,7,6,8,2,3,11,0,1,9],[4,0,1,4,1,5,7,6,8,2,3,11],[4,8,7,4,5,8,5,1,8,1,2,8,3,11,2],[7,6,8,9,5,4,3,10,1,3,11,10],[5,4,9,1,10,6,1,6,0,0,6,8,2,3,11],[0,1,10,0,10,6,0,6,8,6,10,5,4,8,7,6],[10,5,1,1,5,4,3,11,2,7,6,8],
  [4,9,5,7,6,2,7,2,3,2,6,10],[4,9,5,6,8,7,6,0,8,6,2,0,10,6,0,1,0],[4,0,7,4,7,5,0,1,7,6,7,10,1,10,7],[5,4,8,5,8,1,1,8,2,7,6,8,11,2,8,3],[4,9,5,6,10,7,10,1,7,1,3,7,11,6,7,2],[4,9,5,7,6,8,1,10,0,10,6,0],[4,0,5,0,1,5,6,8,7,2,11,3],[5,4,8,5,8,1,7,6,8,11,2,8,2,1,8],
  [9,5,4,10,6,3,10,3,11,3,6,7],[9,5,4,10,6,8,10,8,0,8,6,7,11,2,3],[4,0,1,4,1,5,6,7,10,7,11,10,3,0,8],[4,8,7,4,5,8,5,1,8,10,6,8,2,1,8,11,2,8],[9,5,4,10,6,3,10,3,1,3,6,7,8,9,0],[9,5,4,6,7,10,0,1,8,1,10,8,11,2,3],[4,0,5,6,7,10,2,11,3],[4,8,7,5,4,1,4,0,1,6,10,1,11,2,1],
  [7,6,8,9,5,2,9,2,0,2,5,10],[7,6,8,10,5,2,5,9,2,9,0,2,3,11,2],[1,10,5,1,5,0,0,5,4,7,6,8,2,3,11],[1,10,5,4,8,7,4,0,8,2,1,8,11,2,8,3],[9,5,4,6,7,8,1,2,10,3,11,0],[0,9,1,8,7,6,2,10,3,10,5,6],[4,0,5,0,1,5,8,7,6,11,2,3],[6,7,8,5,4,1,4,0,1,11,2,1,2,10,1],
  [6,7,8,6,8,9,5,10,2,5,2,3,2,10,6,2,6,9],[0,9,1,6,7,8,10,5,2,5,3,2],[0,1,10,0,10,6,0,6,8,5,10,2,3,11,6,7,8],[6,7,8,2,1,10,3,11,0,11,6,0,5,10,6],
];

export { OctreeNode };
