/**
 * BoneRemapper — shared utility for the Rigging & Bones feature.
 *
 * Recognizes two flavors of "bone" in the scene graph:
 *   (a) **Studio-style Group bones** — added via `studio.addBone()`; a Three.js
 *       `Group` whose children include `__joint` (sphere) and `__shaft` (line).
 *   (b) **Imported `THREE.Bone` instances** — flagged via `obj.isBone === true`,
 *       typically nested under a `THREE.SkinnedMesh`. These come from glTF/FBX.
 *
 * The single utility entry point `isBoneLike(obj)` returns true for EITHER
 * flavor so callers don't have to branch.
 *
 * Every mutation that changes scene-graph state goes through this module; the
 * caller passes in the studio instance so we can:
 *   - record undo via `studio.pushUndo()`
 *   - re-select via `studio.selectObject()`
 *   - trigger a render via `studio.render()`
 *
 * Animation clip track names follow the three.js convention:
 *   `'BoneName.position'` / `'BoneName.quaternion'` / `'BoneName.scale'`
 * or with morph/array suffix: `'BoneName.morphTargetInfluences[N]'`.
 * `remapClipTracks` preserves those suffixes when the prefix (= bone name) is
 * part of a rename or mapping.
 *
 * Bone `"length"` is a visualisation, not a Three.js property. We implement it
 * by moving the bone's direct children outward along the bone's local +Y axis
 * (matching the studio convention set in `addBone`/`addSkeleton`). Children
 * already carrying their own offset are scaled proportionally so tip placement
 * stays smooth.
 */
import { dbg } from '../app/dbg.js';
import * as THREE from 'three';

// ── Predicates ─────────────────────────────────────────────────

/**
 * Recognize a node as a bone regardless of flavor.
 * Returns true for `THREE.Bone` instances AND for studio-style `Group` bones
 * (those that contain a `__joint` or `__shaft` helper child).
 */
export function isBoneLike(obj) {
  if (!obj) return false;
  if (obj.isBone) return true;
  if (!obj.children || obj.children.length === 0) return false;
  for (let i = 0; i < obj.children.length; i++) {
    const n = obj.children[i].name;
    if (n === '__joint' || n === '__shaft') return true;
  }
  return false;
}

/**
 * Walk a subtree and collect every bone-like node (depth-first, parent-first).
 * Does not descend INTO a SkinnedMesh's skeleton helper children — we only want
 * actual bones, not the helpers a renderer attaches.
 */
export function listBones(root) {
  const out = [];
  if (!root) return out;
  root.traverse((c) => {
    if (c === root) return; // skip the root itself
    if (isBoneLike(c)) out.push(c);
  });
  return out;
}

/**
 * Find the most likely "bone root" for a given object — the highest bone-like
 * ancestor OR the object itself if it's bone-like. Returns null for non-bone
 * objects that have no bone ancestor.
 */
export function findBoneRoot(obj) {
  if (!obj) return null;
  let cur = obj;
  let lastBone = isBoneLike(cur) ? cur : null;
  while (cur.parent) {
    cur = cur.parent;
    if (isBoneLike(cur)) lastBone = cur;
  }
  return lastBone || (isBoneLike(obj) ? obj : null);
}

/**
 * Map a bone to a stable depth int (root = 0). Used by the hierarchy outliner
 * for indent rendering.
 */
export function boneDepth(bone, root) {
  let d = 0;
  let cur = bone;
  while (cur.parent && cur.parent !== root) {
    cur = cur.parent;
    d++;
  }
  return d;
}

// ── Mutation: add / delete ─────────────────────────────────────

/**
 * Add a new bone as a child of `parent`. Mirrors `studio.addBone()` exactly so
 * the visual appearance matches the rest of the rig. Defaults to a name like
 * `Bone_<n>` based on how many bones already exist in the root subtree.
 *
 * Caller passes the studio so we can pushUndo / selectObject / render.
 * Returns the new bone Group (or null on failure).
 */
export function addBone(studio, parent) {
  if (!studio || !parent) return null;
  if (typeof studio.pushUndo === 'function') studio.pushUndo();
  const root = findBoneRoot(parent) || parent;
  const existing = listBones(parent.parent || parent);
  let n = 1;
  // Try to keep the auto-numbering meaningful within the SAME root
  for (const b of existing) {
    const m = /Bone_(\d+)/.exec(b.name || '');
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  }
  const bone = createStudioBone(`Bone_${n}`);
  // Insert at parent's local +Y like the studio convention
  bone.position.set(0, 1, 0);
  parent.add(bone);
  if (Array.isArray(studio.objects)) studio.objects.push(bone);
  if (typeof studio.selectObject === 'function') studio.selectObject(bone);
  if (typeof studio.render === 'function') studio.render();
  dbg.log(`[BoneRemapper] added Bone_${n} under ${parent.name || '(unnamed)'}`);
  return bone;
}

/**
 * Create a fresh studio-style bone Group with the standard visuals. Exposed
 * for callers that need to construct without yet attaching to a parent.
 */
export function createStudioBone(name) {
  const group = new THREE.Group();
  group.name = name || 'Bone';
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa44 })
  );
  sphere.name = '__joint';
  group.add(sphere);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.5, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffaa44 })
  );
  line.name = '__shaft';
  group.add(line);
  return group;
}

/**
 * Delete a bone, re-parenting its direct children to the bone's parent so
 * the chain isn't orphaned. Children are position-compensated so they stay
 * in world space.
 *
 * Why re-parent instead of cascade-delete? The user said "delete bone" without
 * specifying, and re-parenting is the non-destructive default — Blender does
 * the same. Cascade-delete as a separate toggle (with confirm) would be a
 * reasonable follow-up.
 *
 * Returns true on success, false if the bone was already detached / invalid.
 */
export function deleteBone(studio, bone) {
  if (!studio || !bone || !bone.parent) return false;
  if (typeof studio.pushUndo === 'function') studio.pushUndo();
  const parent = bone.parent;
  // Capture world transforms of each child so we can preserve them after re-parent
  const childEntries = [];
  bone.updateWorldMatrix(true, false);
  for (const child of bone.children.slice()) {
    child.updateWorldMatrix(true, false);
    childEntries.push({ child, worldPos: child.getWorldPosition(new THREE.Vector3()), worldQuat: child.getWorldQuaternion(new THREE.Quaternion()) });
    bone.remove(child);
  }
  // Reparent children, restoring their world-positions
  for (const { child, worldPos, worldQuat } of childEntries) {
    parent.add(child);
    parent.updateWorldMatrix(true, false);
    // Re-apply world transform under the new parent
    child.position.copy(parent.worldToLocal(worldPos));
    child.quaternion.copy(new THREE.Quaternion().setFromQuaternion(worldQuat).premultiply(new THREE.Quaternion().setFromQuaternion(parent.getWorldQuaternion(new THREE.Quaternion())).invert()));
  }
  // Detach and dispose the bone's own resources
  for (const ch of bone.children.slice()) {
    if (ch.geometry) ch.geometry.dispose();
    if (ch.material) ch.material.dispose();
  }
  parent.remove(bone);
  if (Array.isArray(studio.objects)) {
    studio.objects = studio.objects.filter((o) => o !== bone);
  }
  if (bone === studio.selectedObject && typeof studio.selectObject === 'function') {
    studio.selectObject(parent);
  }
  if (typeof studio.render === 'function') studio.render();
  dbg.log(`[BoneRemapper] deleted ${bone.name || '(unnamed)'}, ${childEntries.length} children reparented`);
  return true;
}

// ── Mutation: rename ───────────────────────────────────────────

/**
 * Rename a bone. Refuses if:
 *   - `newName` is empty or contains a forward slash (three.js PropertyBinding
 *     uses slashes as path separators).
 *   - Another bone in the same root already has `newName` (would cause
 *     PropertyBinding collisions on track playback).
 *   - `bone` is null or its current name already matches `newName` (no-op).
 *
 * If the studio loaded animation clips reference the OLD name via track.name,
 * `remapClipTracks` is called automatically so playback doesn't break.
 *
 * Returns `{ ok: true, propagations }` on success or `{ ok: false, reason }`
 * on validation failure.
 */
export function renameBone(studio, bone, newName) {
  if (!bone) return { ok: false, reason: 'no-bone' };
  if (typeof newName !== 'string') return { ok: false, reason: 'invalid-name' };
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, reason: 'empty-name' };
  if (trimmed.includes('/')) return { ok: false, reason: 'name-contains-slash' };
  const oldName = bone.name || '';
  if (oldName === trimmed) return { ok: true, propagations: 0 };
  const root = findBoneRoot(bone) || bone.parent || bone;
  // Check for duplicate within the root
  const others = listBones(root).filter((b) => b !== bone);
  if (others.some((b) => (b.name || '') === trimmed)) {
    return { ok: false, reason: 'duplicate-name' };
  }
  if (typeof studio.pushUndo === 'function') studio.pushUndo();
  bone.name = trimmed;
  // Propagate to clips
  const clips = collectClips(studio, root);
  const propagations = remapClipTracks(clips, { [oldName]: trimmed });
  if (typeof studio.render === 'function') studio.render();
  dbg.log(`[BoneRemapper] renamed ${oldName} → ${trimmed} (${propagations} clip tracks updated)`);
  return { ok: true, propagations };
}

// ── Mutation: resize (length) ──────────────────────────────────

/**
 * Resize a bone by moving its direct children outward along its local +Y axis
 * by `length` units, preserving the child's local offset relative to the
 * bone. The children that already sit on the +Y axis (the chain tip) move
 * proportionally; children at the base (e.g. shadow poses) move too but
 * maintain their relative geometry.
 *
 * `length` is clamped to a sane range (0.05 to 50). Returns true on success.
 *
 * Implementation note: we factor the rescale so children keep their relative
 * position around the bone's local origin rather than collapsing them all to
 * 0,0,0. This matches Blender's "Bone Length" behaviour.
 */
export function setBoneLength(studio, bone, length) {
  if (!bone) return false;
  const L = Math.max(0.05, Math.min(50, parseFloat(length) || 0));
  if (typeof studio.pushUndo === 'function') studio.pushUndo();
  // Compute the current "chain tip" distance along +Y from the bone origin.
  // Use the maximum Y of any direct child that sits along +Y axis. If no such
  // child exists, default to 1.0 so we scale relative to it.
  let tipY = 0;
  for (const child of bone.children) {
    const py = child.position.y;
    if (py > tipY) tipY = py;
  }
  // 0.5 is the default child offset addBone/addSkeleton uses; treat as 1.0
  // baseline if nothing on +Y axis to keep the math stable.
  const baseLen = tipY > 0 ? tipY : 1;
  const ratio = L / baseLen;
  for (const child of bone.children) {
    child.position.y *= ratio;
  }
  if (typeof studio.render === 'function') studio.render();
  dbg.log(`[BoneRemapper] resized ${bone.name || '(unnamed)'} to length ${L}`);
  return true;
}

// ── Bulk mutation: find/replace + mapping ───────────────────────

/**
 * Find/replace across every bone in `root`. Supports regex via `opts.regex=true`
 * OR literal substring otherwise. Returns `{ renamed, skipped, results[] }`.
 *
 * Each successful rename propagates to clip tracks as it happens.
 */
export function findAndReplace(studio, root, find, replace, opts = {}) {
  if (!root || typeof find !== 'string') return { renamed: 0, skipped: 0, results: [] };
  const useRegex = !!opts.regex;
  let pattern = null;
  if (useRegex) {
    try { pattern = new RegExp(find, 'g'); } catch (_) { return { renamed: 0, skipped: 0, results: [], error: 'invalid-regex' }; }
  }
  const results = [];
  let renamed = 0;
  let skipped = 0;
  // Snapshot the bones first; mutations would otherwise mutate the iterated list
  const bones = listBones(root).slice();
  for (const bone of bones) {
    const old = bone.name || '';
    const next = useRegex ? old.replace(pattern, replace) : old.split(find).join(replace);
    if (next === old) continue;
    const r = renameBone(studio, bone, next);
    results.push({ from: old, to: next, ...r });
    if (r.ok) renamed++; else skipped++;
  }
  return { renamed, skipped, results };
}

/**
 * Apply a `{ fromName: toName }` mapping to every bone in `root`. Multiple
 * bones can map to the same destination (Three.js handles this) — we just
 * log if it happens so the user can fix conflicts manually.
 *
 * Returns `{ applied, skipped, conflicts[] }`.
 */
export function applyMapping(studio, root, mapping) {
  if (!root || !mapping || typeof mapping !== 'object') {
    return { applied: 0, skipped: 0, conflicts: [] };
  }
  const results = { applied: 0, skipped: 0, conflicts: [] };
  const bones = listBones(root).slice();
  for (const bone of bones) {
    const old = bone.name || '';
    if (!(old in mapping)) continue;
    const target = mapping[old];
    const r = renameBone(studio, bone, target);
    if (r.ok) results.applied++; else { results.skipped++; results.conflicts.push({ bone: old, target, reason: r.reason }); }
  }
  return results;
}

/**
 * Snapshot every bone name in `root` → `{ oldName: oldName }` so the user can
 * save a mapping preset. Note we map name → name (no transformation); the
 * user edits the result before applying.
 */
export function exportMapping(root) {
  const out = {};
  if (!root) return out;
  for (const b of listBones(root)) {
    const name = b.name || '';
    if (!name) continue;
    out[name] = name;
  }
  return out;
}

// ── Animation-clip track preservation ──────────────────────────

/**
 * Walk every animation clip reachable from the scene and update track names
 * so renamed bones stay connected to their animations. Returns the number
 * of tracks that were rewritten.
 *
 * Three.js track.name conventions handled:
 *   `BoneName.position`, `BoneName.quaternion`, `BoneName.scale`,
 *   `BoneName.morphTargetInfluences[N]`, `BoneName.[uuid].property`, etc.
 * We do a `.split('.')[0]` prefix match so any suffix is preserved.
 */
export function remapClipTracks(clips, mapping) {
  if (!Array.isArray(clips) || !mapping || typeof mapping !== 'object') return 0;
  let count = 0;
  for (const clip of clips) {
    if (!clip || !Array.isArray(clip.tracks)) continue;
    for (const track of clip.tracks) {
      if (!track || typeof track.name !== 'string') continue;
      const dot = track.name.indexOf('.');
      if (dot < 0) continue;
      const prefix = track.name.slice(0, dot);
      const suffix = track.name.slice(dot);
      if (prefix in mapping) {
        const newPrefix = mapping[prefix];
        if (newPrefix && newPrefix !== prefix) {
          track.name = newPrefix + suffix;
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Collect `THREE.AnimationClip`s reachable from the studio. Tries several
 * sources so renamed bones stay connected across import + scene-state:
 *   - `studio.animations`
 *   - every `userData.animationClips` on imported roots
 *
 * De-duplicates by reference so renames only touch each clip once.
 */
export function collectClips(studio, root) {
  const out = [];
  const seen = new Set();
  const push = (c) => { if (c && !seen.has(c)) { seen.add(c); out.push(c); } };
  if (studio && Array.isArray(studio.animations)) {
    for (const c of studio.animations) push(c);
  }
  // Walk the scene for userData-stored clip lists
  if (studio && studio.scene && typeof studio.scene.traverse === 'function') {
    studio.scene.traverse((c) => {
      if (c && c.userData && Array.isArray(c.userData.animationClips)) {
        for (const clip of c.userData.animationClips) push(clip);
      }
    });
  }
  // Plus any explicit root passed in
  if (root && root.userData && Array.isArray(root.userData.animationClips)) {
    for (const clip of root.userData.animationClips) push(clip);
  }
  return out;
}

/**
 * Format a friendly summary suitable for the status label.
 * `result` can be any return value from renameBone / applyMapping / findAndReplace.
 */
export function summarize(result) {
  if (!result) return 'No result';
  if (result.ok === false) return `✗ ${result.reason || 'failed'}`;
  if (typeof result.renamed === 'number') {
    const skip = result.skipped ? ` (${result.skipped} skipped)` : '';
    const err = result.error ? ` [${result.error}]` : '';
    return `✓ ${result.renamed} renamed${skip}${err}`;
  }
  if (typeof result.applied === 'number') {
    const skip = result.skipped ? `, ${result.skipped} skipped` : '';
    return `✓ ${result.applied} applied${skip}`;
  }
  if (result.ok === true && typeof result.propagations === 'number') {
    return `✓ renamed (${result.propagations} clip tracks updated)`;
  }
  return '✓ ok';
}
