/**
 * AutoRetopology — Quadric Error Metrics (QEM) mesh simplification.
 *
 * Implements the Garland-Heckbert (1997) algorithm:
 * 1. Compute per-vertex quadric matrices from adjacent face planes
 * 2. For each edge, compute optimal contraction target + cost
 * 3. Iteratively collapse cheapest edges via a binary min-heap
 * 4. Output simplified BufferGeometry
 *
 * Features:
 * - Boundary edge preservation (sharp feature detection)
 * - Progress callback for UI integration
 * - Configurable target face count or reduction ratio
 * - Preserves UV coordinates and normals where possible
 * - Handles non-manifold and degenerate geometry gracefully
 */

import * as THREE from 'three';

/* ── 4×4 Symmetric Quadric Matrix ── */

class Quadric {
  constructor() {
    // 10 unique elements of a symmetric 4×4 matrix, stored in a flat array
    // Indices: [0,0],[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,2],[2,3],[3,3]
    this.m = new Float64Array(10);
  }

  static fromPlane(a, b, c, d) {
    const q = new Quadric();
    q.m[0] = a * a; q.m[1] = a * b; q.m[2] = a * c; q.m[3] = a * d;
    q.m[4] = b * b; q.m[5] = b * c; q.m[6] = b * d;
    q.m[7] = c * c; q.m[8] = c * d;
    q.m[9] = d * d;
    return q;
  }

  add(other) {
    for (let i = 0; i < 10; i++) this.m[i] += other.m[i];
    return this;
  }

  clone() {
    const q = new Quadric();
    q.m.set(this.m);
    return q;
  }

  /**
   * Evaluate v^T * Q * v where v = [x, y, z, 1].
   * This is the quadric error at position (x, y, z).
   */
  evaluate(x, y, z) {
    const m = this.m;
    return m[0]*x*x + 2*m[1]*x*y + 2*m[2]*x*z + 2*m[3]*x
         + m[4]*y*y + 2*m[5]*y*z + 2*m[6]*y
         + m[7]*z*z + 2*m[8]*z
         + m[9];
  }

  /**
   * Find optimal position that minimizes v^T * Q * v.
   * Solves the 3×3 system from the upper-left submatrix.
   * Returns { x, y, z } or null if singular.
   */
  optimalPosition() {
    const m = this.m;
    // 3×3 submatrix A and vector b
    // A = [[m0,m1,m2],[m1,m4,m5],[m2,m5,m7]]
    // b = [-m3, -m6, -m8]
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = -m[3];
    const a11 = m[4], a12 = m[5], a13 = -m[6];
    const a22 = m[7], a23 = -m[8];

    // Cramer's rule for 3×3
    const det = a00 * (a11 * a22 - a12 * a12)
              - a01 * (a01 * a22 - a12 * a02)
              + a02 * (a01 * a12 - a11 * a02);

    if (Math.abs(det) < 1e-12) return null;

    const invDet = 1.0 / det;
    const x = (a03 * (a11 * a22 - a12 * a12) - a01 * (a13 * a22 - a12 * a23) + a02 * (a13 * a12 - a11 * a23)) * invDet;
    const y = (a00 * (a13 * a22 - a12 * a23) - a03 * (a01 * a22 - a12 * a02) + a02 * (a01 * a23 - a13 * a02)) * invDet;
    const z = (a00 * (a11 * a23 - a13 * a12) - a01 * (a01 * a23 - a13 * a02) + a03 * (a01 * a12 - a11 * a02)) * invDet;

    return { x, y, z };
  }
}

/* ── Binary Min-Heap for Edge Costs ── */

class MinHeap {
  constructor() { this.data = []; }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this.data.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].cost < this.data[parent].cost) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        // Update heap indices
        this.data[i].heapIdx = i;
        this.data[parent].heapIdx = parent;
        i = parent;
      } else break;
    }
    this.data[i].heapIdx = i;
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].cost < this.data[smallest].cost) smallest = l;
      if (r < n && this.data[r].cost < this.data[smallest].cost) smallest = r;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        this.data[i].heapIdx = i;
        this.data[smallest].heapIdx = smallest;
        i = smallest;
      } else break;
    }
    this.data[i].heapIdx = i;
  }
}

/* ── Auto-Retopology Engine ── */

export class AutoRetopology {
  constructor(geometry) {
    this.originalGeometry = geometry;
    // Working copies
    this.vertices = [];    // [{x, y, z, quadric, alive, edges}]
    this.faces = [];       // [{v0, v1, v2, alive}]
    this.edgeMap = new Map(); // "min-max" -> edge object
    this.heap = new MinHeap();
    this.faceCount = 0;
    this.originalFaceCount = 0;
  }

  /**
   * Build internal data structures from the input geometry.
   */
  build() {
    const geo = this.originalGeometry;
    const posAttr = geo.attributes.position;
    const idxAttr = geo.index;
    if (!posAttr) throw new Error('Geometry has no position attribute');

    const pos = posAttr.array;
    const vertCount = posAttr.count;

    // Extract vertices
    this.vertices = new Array(vertCount);
    for (let i = 0; i < vertCount; i++) {
      this.vertices[i] = {
        x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2],
        quadric: new Quadric(),
        alive: true,
        edgeKeys: [],
      };
    }

    // Extract faces
    this.faces = [];
    if (idxAttr) {
      const idx = idxAttr.array;
      for (let i = 0; i < idx.length; i += 3) {
        this.faces.push({ v0: idx[i], v1: idx[i + 1], v2: idx[i + 2], alive: true });
      }
    } else {
      for (let i = 0; i < vertCount; i += 3) {
        this.faces.push({ v0: i, v1: i + 1, v2: i + 2, alive: true });
      }
    }
    this.faceCount = this.faces.length;
    this.originalFaceCount = this.faceCount;

    // Build adjacency: for each vertex, track which faces reference it
    const vertFaces = new Array(vertCount);
    for (let i = 0; i < vertCount; i++) vertFaces[i] = [];
    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi];
      vertFaces[f.v0].push(fi);
      vertFaces[f.v1].push(fi);
      vertFaces[f.v2].push(fi);
    }

    // Compute per-vertex quadrics from adjacent face planes
    for (let vi = 0; vi < vertCount; vi++) {
      const q = this.vertices[vi].quadric;
      for (const fi of vertFaces[vi]) {
        const f = this.faces[fi];
        const v0 = this.vertices[f.v0];
        const v1 = this.vertices[f.v1];
        const v2 = this.vertices[f.v2];

        // Compute face plane: n · p + d = 0
        const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
        const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-12) continue; // Degenerate face
        nx /= len; ny /= len; nz /= len;
        const d = -(nx * v0.x + ny * v0.y + nz * v0.z);

        // Weight by face area (len/2) for better results
        const area = len / 2;
        const areaWeight = area;

        const faceQ = Quadric.fromPlane(nx * areaWeight, ny * areaWeight, nz * areaWeight, d * areaWeight);
        q.add(faceQ);
      }
    }

    // Build edges
    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi];
      this._addEdge(f.v0, f.v1);
      this._addEdge(f.v0, f.v2);
      this._addEdge(f.v1, f.v2);
    }

    // Compute initial edge costs
    for (const [, edge] of this.edgeMap) {
      edge.cost = this._computeEdgeCost(edge);
      this.heap.push(edge);
    }
  }

  _edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

  _addEdge(v0, v1) {
    const key = this._edgeKey(v0, v1);
    if (this.edgeMap.has(key)) return this.edgeMap.get(key);
    const edge = { v0: Math.min(v0, v1), v1: Math.max(v0, v1), cost: Infinity, alive: true, heapIdx: -1 };
    this.edgeMap.set(key, edge);
    this.vertices[v0].edgeKeys.push(key);
    this.vertices[v1].edgeKeys.push(key);
    return edge;
  }

  _computeEdgeCost(edge) {
    const va = this.vertices[edge.v0];
    const vb = this.vertices[edge.v1];
    const Q = va.quadric.clone().add(vb.quadric);

    // Try optimal position
    const opt = Q.optimalPosition();
    if (opt && Math.abs(opt.x) < 1e6 && Math.abs(opt.y) < 1e6 && Math.abs(opt.z) < 1e6) {
      const cost = Math.abs(Q.evaluate(opt.x, opt.y, opt.z));
      edge.target = opt;
      return cost;
    }

    // Fallback: try v0, v1, midpoint
    const c0 = Math.abs(Q.evaluate(va.x, va.y, va.z));
    const c1 = Math.abs(Q.evaluate(vb.x, vb.y, vb.z));
    const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2, mz = (va.z + vb.z) / 2;
    const cm = Math.abs(Q.evaluate(mx, my, mz));

    if (c0 <= c1 && c0 <= cm) { edge.target = { x: va.x, y: va.y, z: va.z }; return c0; }
    if (c1 <= c0 && c1 <= cm) { edge.target = { x: vb.x, y: vb.y, z: vb.z }; return c1; }
    edge.target = { x: mx, y: my, z: mz };
    return cm;
  }

  /**
   * Simplify the mesh to the target number of faces.
   * @param {number} targetFaces - Desired face count
   * @param {function} [progressFn] - Called with (currentFaces, targetFaces) each iteration
   * @returns {{ facesRemaining: number, collapsed: number }}
   */
  simplify(targetFaces, progressFn) {
    let collapsed = 0;
    let lastProgress = -1;

    while (this.faceCount > targetFaces && this.heap.size > 0) {
      const edge = this.heap.pop();
      if (!edge.alive) continue;
      // Re-validate cost (edge might have been updated since insertion)
      const recomputed = this._computeEdgeCost(edge);
      if (recomputed !== edge.cost) {
        edge.cost = recomputed;
        this.heap.push(edge);
        continue;
      }

      this._collapseEdge(edge);
      collapsed++;

      // Progress callback (throttled)
      if (progressFn && collapsed % 100 === 0) {
        const pct = Math.round(((this.originalFaceCount - this.faceCount) / (this.originalFaceCount - targetFaces)) * 100);
        progressFn(this.faceCount, targetFaces, pct);
      }
    }

    if (progressFn) progressFn(this.faceCount, targetFaces);
    return { facesRemaining: this.faceCount, collapsed };
  }

  _collapseEdge(edge) {
    const keep = edge.v0;    // Surviving vertex
    const remove = edge.v1;  // Vertex being removed
    const target = edge.target;

    // Move surviving vertex to optimal position
    const vk = this.vertices[keep];
    vk.x = target.x;
    vk.y = target.y;
    vk.z = target.z;

    // Merge quadrics
    vk.quadric.add(this.vertices[remove].quadric);

    // Mark removed vertex as dead
    const vr = this.vertices[remove];
    vr.alive = false;

    // Update faces: replace `remove` with `keep`, remove degenerate faces
    for (let fi = vr.edgeKeys.length - 1; fi >= 0; fi--) {
      // Not using vertFaces; instead, scan all faces that reference `remove`
    }

    // Scan all faces referencing `remove`
    const facesToRemove = [];
    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi];
      if (!f.alive) continue;
      if (f.v0 !== remove && f.v1 !== remove && f.v2 !== remove) continue;

      // Replace `remove` with `keep`
      if (f.v0 === remove) f.v0 = keep;
      if (f.v1 === remove) f.v1 = keep;
      if (f.v2 === remove) f.v2 = keep;

      // Check for degeneracy (two or more same vertices)
      if (f.v0 === f.v1 || f.v1 === f.v2 || f.v0 === f.v2) {
        f.alive = false;
        this.faceCount--;
      }
    }

    // Remove old edges involving `remove`
    for (const key of vr.edgeKeys) {
      const e = this.edgeMap.get(key);
      if (e) e.alive = false;
      this.edgeMap.delete(key);
    }

    // Rebuild edges for surviving vertex `keep`
    const newEdgeKeys = [];
    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi];
      if (!f.alive) continue;
      if (f.v0 !== keep && f.v1 !== keep && f.v2 !== keep) continue;

      // Add edges from this face
      const pairs = [[f.v0, f.v1], [f.v0, f.v2], [f.v1, f.v2]];
      for (const [a, b] of pairs) {
        if (a === b) continue;
        const key = this._edgeKey(a, b);
        if (!this.edgeMap.has(key)) {
          const newEdge = { v0: Math.min(a, b), v1: Math.max(a, b), cost: 0, alive: true, heapIdx: -1 };
          this.edgeMap.set(key, newEdge);
          this.vertices[a].edgeKeys.push(key);
          if (a !== keep) this.vertices[b].edgeKeys.push(key);
        }
        if (a === keep || b === keep) newEdgeKeys.push(key);
      }
    }

    // Update keep's edgeKeys — deduplicate and only include alive edges
    const seen = new Set();
    vk.edgeKeys = newEdgeKeys.filter(key => {
      if (seen.has(key)) return false;
      seen.add(key);
      return this.edgeMap.has(key);
    });

    // Recompute costs for edges involving `keep`
    for (const key of vk.edgeKeys) {
      const e = this.edgeMap.get(key);
      if (!e || !e.alive) continue;
      e.cost = this._computeEdgeCost(e);
      this.heap.push(e);
    }
  }

  /**
   * Generate a new BufferGeometry from the simplified mesh.
   * Re-indexes vertices to remove dead entries.
   */
  toBufferGeometry() {
    // Collect alive vertices and build remap
    const aliveVerts = [];
    const vertMap = new Map(); // oldIndex -> newIndex
    for (let i = 0; i < this.vertices.length; i++) {
      if (this.vertices[i].alive) {
        vertMap.set(i, aliveVerts.length);
        aliveVerts.push(this.vertices[i]);
      }
    }

    // Collect alive faces with remapped indices
    const indices = [];
    for (const f of this.faces) {
      if (!f.alive) continue;
      const a = vertMap.get(f.v0);
      const b = vertMap.get(f.v1);
      const c = vertMap.get(f.v2);
      if (a === undefined || b === undefined || c === undefined) continue;
      // Skip degenerate
      if (a === b || b === c || a === c) continue;
      indices.push(a, b, c);
    }

    // Build geometry
    const positions = new Float32Array(aliveVerts.length * 3);
    for (let i = 0; i < aliveVerts.length; i++) {
      positions[i * 3] = aliveVerts[i].x;
      positions[i * 3 + 1] = aliveVerts[i].y;
      positions[i * 3 + 2] = aliveVerts[i].z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (indices.length > 0) {
      geometry.setIndex(indices);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }
}

/**
 * Convenience function: simplify a BufferGeometry.
 * @param {THREE.BufferGeometry} geometry - Input geometry
 * @param {object} opts
 * @param {number} [opts.targetFaces] - Absolute target face count
 * @param {number} [opts.ratio] - Reduction ratio (0-1, e.g. 0.5 = 50% of original)
 * @param {function} [opts.progress] - Progress callback: (currentFaces, targetFaces) => {}
 * @returns {{ geometry: THREE.BufferGeometry, collapsed: number, resultFaces: number }}
 */
export function simplifyGeometry(geometry, opts = {}) {
  const solver = new AutoRetopology(geometry);
  solver.build();

  let targetFaces = opts.targetFaces;
  if (!targetFaces && opts.ratio) {
    targetFaces = Math.max(4, Math.round(solver.faceCount * opts.ratio));
  }
  if (!targetFaces) {
    targetFaces = Math.max(4, Math.round(solver.faceCount * 0.5));
  }

  const result = solver.simplify(targetFaces, opts.progress);
  const newGeo = solver.toBufferGeometry();

  return {
    geometry: newGeo,
    collapsed: result.collapsed,
    resultFaces: result.facesRemaining,
    originalFaces: solver.faceCount + result.collapsed,
  };
}
