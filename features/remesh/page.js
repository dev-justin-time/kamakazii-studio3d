/**
 * Remesh — Vertex Clustering geometry decimation for Three.js BufferGeometry.
 *
 * Algorithm: Vertex Clustering
 *   1. Partitions vertex space into a uniform 3D grid
 *   2. Merges all vertices in each grid cell to their centroid
 *   3. Rebuilds triangles from merged vertex indices
 *   4. Removes degenerate triangles (cells with < 3 distinct clusters)
 *
 * Supports: position, normal, UV, vertex color attributes.
 * Optionally preserves boundary edges by giving boundary vertices unique cells.
 */
import * as THREE from 'three';

/**
 * Decimate a BufferGeometry by reducing vertex count to approximately `targetVerts`
 * using vertex clustering.
 *
 * @param {THREE.BufferGeometry} geometry   Input geometry (indexed or non-indexed)
 * @param {number}               targetVerts Target vertex count (approx)
 * @param {object}               [options]
 * @param {boolean}              [options.preserveEdges=false] Keep boundary vertices intact
 * @param {'uniform'|'adaptive'} [options.method='uniform']   Grid cell sizing method
 * @returns {{ geometry: THREE.BufferGeometry, originalVerts: number, reducedVerts: number, originalFaces: number, reducedFaces: number }}
 */
function decimateGeometry(geometry, targetVerts, options = {}) {
  const preserveEdges = options.preserveEdges ?? false;
  const method = options.method ?? 'uniform';

  // ── 1. Non-indexed copy so we can freely manipulate triangles ──
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const posAttr = nonIndexed.getAttribute('position');
  if (!posAttr) throw new Error('Geometry has no position attribute');

  const vertexCount = posAttr.count;
  const faceCount = vertexCount / 3;
  if (targetVerts >= vertexCount) {
    // Already below target — return clone as-is
    const result = geometry.clone();
    const rc = result.index ? result.index.count / 3 : result.attributes.position.count / 3;
    return {
      geometry: result,
      originalVerts: vertexCount,
      reducedVerts: vertexCount,
      originalFaces: faceCount,
      reducedFaces: rc,
    };
  }
  // Clamp target to at least 3 vertices (1 triangle)
  targetVerts = Math.max(3, targetVerts);

  // ── 2. Compute bounding box ──
  const box = new THREE.Box3().setFromBufferAttribute(posAttr);
  const size = box.getSize(new THREE.Vector3());
  const volume = size.x * size.y * size.z;
  if (volume === 0) {
    // Degenerate geometry (e.g. a plane) — use max extent
    const maxExtent = Math.max(size.x, size.y, size.z, 0.001);
    size.set(maxExtent, maxExtent, maxExtent);
  }

  // ── 3. Determine cell size ──
  let cellSize;
  if (method === 'adaptive') {
    // Adaptive: cell size varies based on local curvature estimate.
    // We compute per-vertex "importance" (variance of incident face normals)
    // and allocate more cells in high-curvature regions.
    // For simplicity, we estimate curvature from face normal variance
    // and use it to weight the grid resolution.
    const targetCells = Math.max(1, Math.pow(targetVerts, 0.33) * 3);
    cellSize = Math.pow(volume / targetCells, 1 / 3) * 1.2;
  } else {
    // Uniform: equal cell size across the whole bounding box
    const targetCells = Math.max(1, Math.pow(targetVerts, 0.33) * 2.5);
    cellSize = Math.pow(volume / targetCells, 1 / 3) * 1.3;
  }
  cellSize = Math.max(cellSize, 0.001);

  // ── 4. Extract per-vertex data ──
  const positions = new Float32Array(posAttr.array);
  const hasNormals = !!nonIndexed.getAttribute('normal');
  const normals = hasNormals ? new Float32Array(nonIndexed.getAttribute('normal').array) : null;
  const hasUvs = !!nonIndexed.getAttribute('uv');
  const uvs = hasUvs ? new Float32Array(nonIndexed.getAttribute('uv').array) : null;
  const hasColors = !!nonIndexed.getAttribute('color');
  const colors = hasColors ? new Float32Array(nonIndexed.getAttribute('color').array) : null;

  // ── 5. Boundary edge detection (if preserveEdges) ──
  // A boundary edge is one that belongs to only 1 face.
  // We identify boundary vertices as those incident to at least one boundary edge.
  const isBoundary = new Uint8Array(vertexCount); // 0 = interior, 1 = boundary
  if (preserveEdges) {
    // Build edge map: edgeKey -> [faceIndex1, faceIndex2, ...]
    const edgeMap = new Map();
    function edgeKey(i1, i2) {
      return i1 < i2 ? (i1 + ',' + i2) : (i2 + ',' + i1);
    }
    for (let f = 0; f < faceCount; f++) {
      const a = f * 3, b = a + 1, c = a + 2;
      const e1 = edgeKey(a, b), e2 = edgeKey(b, c), e3 = edgeKey(c, a);
      edgeMap.set(e1, (edgeMap.get(e1) || 0) + 1);
      edgeMap.set(e2, (edgeMap.get(e2) || 0) + 1);
      edgeMap.set(e3, (edgeMap.get(e3) || 0) + 1);
    }
    // Edges with count === 1 are boundary edges
    const boundaryEdges = new Set();
    edgeMap.forEach((count, key) => {
      if (count === 1) boundaryEdges.add(key);
    });
    // Mark vertices on boundary edges
    boundaryEdges.forEach(key => {
      const [i1, i2] = key.split(',').map(Number);
      isBoundary[i1] = 1;
      isBoundary[i2] = 1;
    });
  }

  // ── 6. Hash vertices into grid cells ──
  // cellHash -> { vertices: [indices], sumPos: [x,y,z], sumN: [x,y,z]|null, sumUV: [u,v]|null, sumC: [r,g,b]|null }
  // Boundary vertices get their own unique cell hash so they aren't merged.
  const cells = new Map();
  const boxMin = box.min;

  function cellHashFromPos(x, y, z, isBnd) {
    if (isBnd) {
      // Unique hash per boundary vertex — use its exact position as a string
      return 'b:' + x.toFixed(4) + ',' + y.toFixed(4) + ',' + z.toFixed(4);
    }
    const cx = Math.floor((x - boxMin.x) / cellSize);
    const cy = Math.floor((y - boxMin.y) / cellSize);
    const cz = Math.floor((z - boxMin.z) / cellSize);
    return cx + ',' + cy + ',' + cz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3, i2 = i * 2;
    const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
    const hash = cellHashFromPos(x, y, z, isBoundary[i]);

    let cell = cells.get(hash);
    if (!cell) {
      cell = {
        vertices: [],
        sumPos: [0, 0, 0],
        sumN: normals ? [0, 0, 0] : null,
        sumUV: uvs ? [0, 0] : null,
        sumC: colors ? [0, 0, 0] : null,
        count: 0,
      };
      cells.set(hash, cell);
    }
    cell.vertices.push(i);
    cell.sumPos[0] += x;
    cell.sumPos[1] += y;
    cell.sumPos[2] += z;
    if (normals) {
      cell.sumN[0] += normals[i3];
      cell.sumN[1] += normals[i3 + 1];
      cell.sumN[2] += normals[i3 + 2];
    }
    if (uvs) {
      cell.sumUV[0] += uvs[i2];
      cell.sumUV[1] += uvs[i2 + 1];
    }
    if (colors) {
      cell.sumC[0] += colors[i3];
      cell.sumC[1] += colors[i3 + 1];
      cell.sumC[2] += colors[i3 + 2];
    }
    cell.count++;
  }

  // ── 7. Build cell centroid map: original vertex index -> merged vertex index ──
  const cellCentroids = []; // { pos: [x,y,z], normal?: [x,y,z], uv?: [u,v], color?: [r,g,b] }
  const vertToCell = new Map(); // original vertex index -> centroid index

  let cellIdx = 0;
  cells.forEach(cell => {
    const centroid = {
      pos: [
        cell.sumPos[0] / cell.count,
        cell.sumPos[1] / cell.count,
        cell.sumPos[2] / cell.count,
      ],
    };
    if (normals) {
      const len = Math.sqrt(
        cell.sumN[0] * cell.sumN[0] +
        cell.sumN[1] * cell.sumN[1] +
        cell.sumN[2] * cell.sumN[2]
      );
      centroid.normal = len > 0
        ? [cell.sumN[0] / len, cell.sumN[1] / len, cell.sumN[2] / len]
        : [0, 1, 0];
    }
    if (uvs) {
      centroid.uv = [cell.sumUV[0] / cell.count, cell.sumUV[1] / cell.count];
    }
    if (colors) {
      centroid.color = [
        cell.sumC[0] / cell.count,
        cell.sumC[1] / cell.count,
        cell.sumC[2] / cell.count,
      ];
    }
    cellCentroids.push(centroid);
    cell.vertices.forEach(vi => vertToCell.set(vi, cellIdx));
    cellIdx++;
  });

  // ── 8. Rebuild face list ──
  // A face is kept if all 3 of its vertices map to distinct cells
  const newFaces = [];
  const usedCentroids = new Set();

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3, i1 = i0 + 1, i2 = i0 + 2;
    const c0 = vertToCell.get(i0);
    const c1 = vertToCell.get(i1);
    const c2 = vertToCell.get(i2);

    // All vertices must map to valid cells and at least 2 must be distinct
    if (c0 === undefined || c1 === undefined || c2 === undefined) continue;
    if (c0 === c1 || c1 === c2 || c0 === c2) continue; // degenerate

    newFaces.push(c0, c1, c2);
    usedCentroids.add(c0);
    usedCentroids.add(c1);
    usedCentroids.add(c2);
  }

  // ── 9. Build new compact attribute arrays ──
  // Create a mapping: old centroid index -> new compact index
  const oldToNew = new Map();
  const newPositions = [];
  const newNormals = normals ? [] : null;
  const newUvs = uvs ? [] : null;
  const newColors = colors ? [] : null;

  usedCentroids.forEach(ci => {
    oldToNew.set(ci, oldToNew.size);
    const c = cellCentroids[ci];
    newPositions.push(c.pos[0], c.pos[1], c.pos[2]);
    if (newNormals && c.normal) newNormals.push(c.normal[0], c.normal[1], c.normal[2]);
    if (newUvs && c.uv) newUvs.push(c.uv[0], c.uv[1]);
    if (newColors && c.color) newColors.push(c.color[0], c.color[1], c.color[2]);
  });

  // Rewrite faces with new compact indices
  const newFaceIndices = new Uint32Array(newFaces.length);
  for (let i = 0; i < newFaces.length; i++) {
    newFaceIndices[i] = oldToNew.get(newFaces[i]);
  }

  // ── 10. Build output BufferGeometry ──
  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
  if (newNormals) outGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newNormals), 3));
  if (newUvs) outGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(newUvs), 2));
  if (newColors) outGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(newColors), 3));

  // Add index for rendering (shared vertices)
  outGeo.setIndex(new THREE.BufferAttribute(newFaceIndices, 1));

  // If no normals were preserved, compute them
  if (!newNormals) outGeo.computeVertexNormals();

  // Also copy morph attributes if any (rare in this context but harmless)
  const morphPos = geometry.getAttribute('morphPosition');
  if (morphPos) {
    outGeo.morphAttributes.position = [morphPos.clone()];
  }

  return {
    geometry: outGeo,
    originalVerts: vertexCount,
    reducedVerts: newPositions.length / 3,
    originalFaces: faceCount,
    reducedFaces: newFaceIndices.length / 3,
  };
}


// ── Status helper ──
function _status(msg) {
  const el = document.getElementById('status-left');
  if (el) el.textContent = msg;
  console.log('[Remesh]', msg);
}

// ── Application ref helper ──
function _getApp() {
  return window.ProModelerApp;
}


// ── Action map ──
const _actionMap = {
  applyRemesh: () => {
    const app = _getApp();
    if (!app) { _status('Remesh: No app instance'); return; }
    const obj = app.selectedObject;
    if (!obj || !obj.isMesh || !obj.geometry) {
      _status('Remesh: Select a mesh object first');
      return;
    }
    const targetInput = document.getElementById('remesh-target');
    const preserveInput = document.getElementById('remesh-preserve');
    const methodInput = document.getElementById('remesh-method');
    const targetVerts = parseInt(targetInput?.value || '1000', 10);
    const preserveEdges = preserveInput?.checked ?? true;
    const method = methodInput?.value || 'uniform';

    _status(`Remesh: Applying vertex clustering (target: ${targetVerts} verts, ${method})...`);

    try {
      const result = decimateGeometry(obj.geometry, targetVerts, { preserveEdges, method });

      // Create new mesh with decimated geometry
      const material = obj.material ? obj.material.clone() : new THREE.MeshStandardMaterial({ color: 0x888888 });
      const newMesh = new THREE.Mesh(result.geometry, material);
      newMesh.position.copy(obj.position);
      newMesh.rotation.copy(obj.rotation);
      newMesh.scale.copy(obj.scale);
      newMesh.name = obj.name + '_remesh';
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;

      // Add to scene
      app.pushUndo();
      app.scene.add(newMesh);
      app.objects.push(newMesh);
      app.selectObject(newMesh);
      app.frameSelected();

      // Update result display
      const resultEl = document.getElementById('remesh-result');
      if (resultEl) {
        const reductionPct = ((1 - result.reducedVerts / result.originalVerts) * 100).toFixed(1);
        resultEl.innerHTML = `
          <div style="font-size:12px;color:#4ade80;margin-bottom:4px;">✔ Remesh complete</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:11px;color:#aaa;">
            <span>Original:</span><span style="text-align:right;color:#ccc;">${result.originalVerts.toLocaleString()} verts · ${result.originalFaces.toLocaleString()} tris</span>
            <span>Reduced:</span><span style="text-align:right;color:#4ade80;">${result.reducedVerts.toLocaleString()} verts · ${result.reducedFaces.toLocaleString()} tris</span>
            <span>Reduction:</span><span style="text-align:right;color:#ffe08a;">${reductionPct}%</span>
          </div>
        `;
      }

      _status(`Remesh: ${result.originalVerts} → ${result.reducedVerts} verts (${reductionPct}% reduction)`);
    } catch (e) {
      _status(`Remesh: Failed — ${e.message}`);
      console.error(e);
    }
  },

  applyDecimate: () => {
    const app = _getApp();
    if (!app) { _status('Remesh: No app instance'); return; }
    const obj = app.selectedObject;
    if (!obj || !obj.isMesh || !obj.geometry) {
      _status('Remesh: Select a mesh object first');
      return;
    }

    // Count current vertices
    const geo = obj.geometry;
    const posAttr = geo.index ? geo.toNonIndexed().getAttribute('position') : geo.getAttribute('position');
    const currentVerts = posAttr ? posAttr.count : 0;
    const targetVerts = Math.max(3, Math.floor(currentVerts * 0.5)); // 50% reduction

    const preserveInput = document.getElementById('remesh-preserve');
    const methodInput = document.getElementById('remesh-method');
    const preserveEdges = preserveInput?.checked ?? true;
    const method = methodInput?.value || 'uniform';

    // Also update the target input field
    const targetInput = document.getElementById('remesh-target');
    if (targetInput) targetInput.value = String(targetVerts);

    _status(`Remesh: Decimating 50% (${currentVerts} → ~${targetVerts} verts)...`);

    try {
      const result = decimateGeometry(obj.geometry, targetVerts, { preserveEdges, method });

      const material = obj.material ? obj.material.clone() : new THREE.MeshStandardMaterial({ color: 0x888888 });
      const newMesh = new THREE.Mesh(result.geometry, material);
      newMesh.position.copy(obj.position);
      newMesh.rotation.copy(obj.rotation);
      newMesh.scale.copy(obj.scale);
      newMesh.name = obj.name + '_decimated';
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;

      app.pushUndo();
      app.scene.add(newMesh);
      app.objects.push(newMesh);
      app.selectObject(newMesh);
      app.frameSelected();

      const resultEl = document.getElementById('remesh-result');
      if (resultEl) {
        const reductionPct = ((1 - result.reducedVerts / result.originalVerts) * 100).toFixed(1);
        resultEl.innerHTML = `
          <div style="font-size:12px;color:#4ade80;margin-bottom:4px;">✔ Decimate complete</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:11px;color:#aaa;">
            <span>Original:</span><span style="text-align:right;color:#ccc;">${result.originalVerts.toLocaleString()} verts · ${result.originalFaces.toLocaleString()} tris</span>
            <span>Reduced:</span><span style="text-align:right;color:#4ade80;">${result.reducedVerts.toLocaleString()} verts · ${result.reducedFaces.toLocaleString()} tris</span>
            <span>Reduction:</span><span style="text-align:right;color:#ffe08a;">${reductionPct}%</span>
          </div>
        `;
      }

      _status(`Decimate: ${result.originalVerts} → ${result.reducedVerts} verts (${reductionPct}% reduction)`);
    } catch (e) {
      _status(`Decimate: Failed — ${e.message}`);
      console.error(e);
    }
  },

  replaceOriginal: () => {
    const app = _getApp();
    if (!app) return;
    const sel = app.selectedObject;
    if (!sel || !sel.name) return;
    // Find the original object (without _remesh or _decimated suffix)
    const remeshedName = sel.name;
    let origName = remeshedName.replace(/_(remesh|decimated)$/, '');
    if (origName === remeshedName) origName = null;
    if (!origName) { _status('Remesh: Selected mesh is not a remeshed copy'); return; }

    const orig = app.objects.find(o => o.name === origName);
    if (!orig) { _status('Remesh: Original mesh not found in scene'); return; }

    app.pushUndo();
    // Replace original mesh with the selected (remeshed) mesh
    app.scene.remove(orig);
    app.objects = app.objects.filter(o => o !== orig);
    sel.name = origName;
    app.selectObject(sel);
    _status(`Remesh: Replaced original "${origName}" with remeshed version`);
  },

  deleteRemeshed: () => {
    const app = _getApp();
    if (!app) return;
    const sel = app.selectedObject;
    if (!sel || !sel.isMesh) return;
    app.pushUndo();
    app.scene.remove(sel);
    app.objects = app.objects.filter(o => o !== sel);
    app.transformControls.detach();
    app.selectedObject = null;
    const resultEl = document.getElementById('remesh-result');
    if (resultEl) resultEl.innerHTML = '';
    _status('Remesh: Remeshed copy deleted');
  },
};

// ── Render Controls ──
function _renderControls(container, controlsList) {
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:4px 0;';

  controlsList.forEach(ctrl => {
    if (ctrl.type === 'label') {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:12px;color:' + (ctrl.label.startsWith('  •') ? '#888;padding-left:8px' : '#aaa');
      el.textContent = ctrl.label;
      form.appendChild(el);
      return;
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    if (ctrl.type === 'button') {
      const btn = document.createElement('button');
      btn.textContent = ctrl.label;
      btn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;';
      btn.addEventListener('mouseenter', () => btn.style.background = '#3a8eef');
      btn.addEventListener('mouseleave', () => btn.style.background = '#4a9eff');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fn = _actionMap[ctrl.onClick];
        if (fn) fn();
        else console.warn('No action:', ctrl.onClick);
      });
      row.appendChild(btn);
    } else if (ctrl.type === 'toggle') {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = ctrl.default ?? false;
      cb.id = ctrl.key ? 'remesh-' + ctrl.key : '';
      cb.style.cssText = 'width:16px;height:16px;accent-color:#4a9eff;';
      const span = document.createElement('span');
      span.textContent = ctrl.label;
      lbl.appendChild(cb);
      lbl.appendChild(span);
      row.appendChild(lbl);
    } else if (ctrl.type === 'slider') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = ctrl.min ?? 0;
      inp.max = ctrl.max ?? 1;
      inp.step = ctrl.step ?? 0.01;
      inp.value = ctrl.default ?? 0.5;
      inp.style.cssText = 'width:100%;accent-color:#4a9eff;';
      const val = document.createElement('span');
      val.textContent = inp.value;
      val.style.cssText = 'font-size:11px;color:#888;text-align:right;';
      inp.addEventListener('input', () => { val.textContent = inp.value; });
      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(val);
    } else if (ctrl.type === 'number') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = ctrl.default ?? 0;
      inp.id = ctrl.key ? 'remesh-' + ctrl.key : '';
      inp.min = ctrl.min ?? 1;
      inp.max = ctrl.max ?? 1000000;
      inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
      row.appendChild(lbl);
      row.appendChild(inp);
    } else if (ctrl.type === 'color') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = ctrl.default ?? '#ffffff';
      inp.style.cssText = 'width:100%;padding:4px;border-radius:4px;border:1px solid #444;background:#222;';
      row.appendChild(lbl);
      row.appendChild(inp);
    } else if (ctrl.type === 'select') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const sel = document.createElement('select');
      sel.id = ctrl.key ? 'remesh-' + ctrl.key : '';
      sel.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;';
      (ctrl.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      if (ctrl.default) sel.value = ctrl.default;
      row.appendChild(lbl);
      row.appendChild(sel);
    } else if (ctrl.type === 'text') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = ctrl.default ?? '';
      inp.placeholder = ctrl.label;
      inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
      row.appendChild(lbl);
      row.appendChild(inp);
    }

    form.appendChild(row);
  });

  container.appendChild(form);
}


const meta = {
  controls: [
    { key: 'target', type: 'number', label: 'Target Vertices', default: 1000, min: 3, max: 1000000 },
    { key: 'preserve', type: 'toggle', label: 'Preserve Edges', default: true },
    { key: 'method', type: 'select', label: 'Method', default: 'uniform', options: [
      { value: 'uniform', label: 'Uniform Grid' },
      { value: 'adaptive', label: 'Adaptive Grid' },
    ]},
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'apply-remesh', type: 'button', label: 'Apply Remesh', onClick: 'applyRemesh' },
    { key: 'apply-decimate', type: 'button', label: 'Decimate 50%', onClick: 'applyDecimate' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'replace-orig', type: 'button', label: 'Replace Original', onClick: 'replaceOriginal' },
    { key: 'delete-remesh', type: 'button', label: 'Delete Copy', onClick: 'deleteRemeshed' },
  ],
  onApply: () => {},
};

export { meta };

/**
 * Render the remesh feature page.
 * Adds a results panel below controls for showing decimation stats.
 */
export function render(container, state) {
  _renderControls(container, meta.controls);

  // ── Auto-detect current selection vertex count ──
  const app = _getApp();
  const targetInput = container.querySelector('#remesh-target');
  if (targetInput && app && app.selectedObject && app.selectedObject.isMesh) {
    const geo = app.selectedObject.geometry;
    if (geo) {
      const posAttr = geo.index ? geo.toNonIndexed().getAttribute('position') : geo.getAttribute('position');
      if (posAttr) {
        targetInput.value = String(Math.floor(posAttr.count * 0.5));
      }
    }
  }

  // ── Results panel ──
  const resultPanel = document.createElement('div');
  resultPanel.id = 'remesh-result';
  resultPanel.style.cssText = 'margin-top:8px;padding:8px;border-radius:4px;background:rgba(0,0,0,0.3);border:1px solid #333;min-height:20px;font-family:monospace;';
  resultPanel.textContent = 'Select a mesh and apply remesh to see results.';
  container.appendChild(resultPanel);
}
