/**
 * motionStorage.js — Unified motion clip database for the 3D editor.
 *
 * Provides automatic extraction, deduplication, persistence, and reuse of
 * THREE.AnimationClips across models. Mirrors the localStorage + Puter-KV
 * cloud-sync pattern used by tools/map-maker/mapStorage.js.
 *
 * Features:
 *   • Auto-extract clips from imported glTF/GLB on the studio's import path
 *     (`extractAndSaveMotions` is called from studio._playAnimationClips).
 *   • Signature-based dedup — two clips with the same `name|duration|track-count|
 *     track-property-types` hash are treated as identical so re-importing the
 *     same model never adds a duplicate entry.
 *   • Cross-model reuse via `applyMotionToObject` — track names are scrubbed
 *     of their leading source-root at extraction time, then re-applied to
 *     the new target with whatever bone paths it has in common.
 *   • localStorage `kamikazii_motion_*` + puter.kv `kamikazii3d_motion_*`
 *     cross-device sync.
 *   • Export full database as a portable JSON file (`motion-db.json`) and
 *     re-import on another machine.
 *
 * Data shape per motion entry:
 *   { id, name, duration, sourceModel, signature, extractedAt,
 *     trackCount, clipJson: { name, duration, tracks: [...] } }
 */

// ----------------------------------------------------------------
// Storage key constants — mirror kamakazii_map_* naming pattern
// ----------------------------------------------------------------
const LS_INDEX  = 'kamikazii_motion_index';
const LS_PREFIX = 'kamikazii_motion_';
const CLOUD_PREFIX = 'kamikazii3d_motion_';
const MOTION_VERSION = 1;
const MAX_SAVED_MOTIONS = 200;

// Serialize concurrent `extractAndSaveMotions` calls so two imports fired
// within ~10ms don't both read the same baseline `_readIndex()` snapshot
// and double-insert the same signature under different ids. Each call
// chains onto the previous one; rejections don't break the chain.
let _inflight = Promise.resolve();

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _localGet(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function _localSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (_) { /* quota exceeded — silently ignore */ }
}

function _localRemove(key) {
  try { localStorage.removeItem(key); }
  catch (_) { /* noop */ }
}

function _getPuter() {
  if (typeof window !== 'undefined' && window.puter && window.puter.kv) return window.puter;
  return null;
}

async function _cloudSet(key, value) {
  const p = _getPuter();
  if (!p) return false;
  try { await p.kv.set(CLOUD_PREFIX + key, JSON.stringify(value)); return true; }
  catch { return false; }
}

async function _cloudGet(key) {
  const p = _getPuter();
  if (!p) return undefined;
  try {
    const raw = await p.kv.get(CLOUD_PREFIX + key);
    if (raw === undefined || raw === null) return undefined;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return undefined; }
}

async function _cloudRemove(key) {
  const p = _getPuter();
  if (!p) return;
  try { await p.kv.set(CLOUD_PREFIX + key, null); }
  catch (_) { /* noop */ }
}

// ----------------------------------------------------------------
// Index management
// ----------------------------------------------------------------

function _readIndex() {
  return _localGet(LS_INDEX) || [];
}

function _writeIndex(index) {
  _localSet(LS_INDEX, index);
  _cloudSet('_index', index).catch(() => {});
}

// ----------------------------------------------------------------
// Signature: structural-hash for dedup
// ----------------------------------------------------------------

/**
 * Build a dedup signature for a clip.
 *
 * We hash structural metadata (normalized name + duration + track count +
 * the set of property types touched by the first 5 tracks), NOT the
 * numerical keyframe values. That keeps the signature stable across DCC
 * exporters (Blender/Three.js/mixamo) which add tiny floating-point noise
 * to the same animation. The first-imported copy wins; subsequent
 * "re-extract" calls hit the dedup branch and add nothing to the DB.
 *
 * Example: three different exports of the same Wolf "idle" animation
 * (with slightly different float precision) all hash to the same signature
 * and are stored exactly once.
 *
 * @param {THREE.AnimationClip} clip
 * @returns {string}
 */
export function generateMotionSignature(clip) {
  if (!clip) return '';
  const dur = Number(clip.duration || 0).toFixed(2);
  const trackCount = (clip.tracks || []).length;
  // Property types: split each track.name on '.'; the last segment is
  // 'position' / 'quaternion' / 'scale' / 'morphTargetInfluences[N]'.
  const props = (clip.tracks || []).slice(0, 5)
    .map(t => String(t.name || '').split('.').pop() || '')
    .join(',');
  // Normalize name — strip trailing "_001" Blender duplicates
  const name = String(clip.name || '').replace(/_\d{3,}$/, '').trim();
  return `${name}|${dur}|${trackCount}|${props}`;
}

/**
 * Strip the source model's root node name from every track, so the same
 * animation can be re-applied to a model with a different root name.
 *
 * Example: a clip from `Wolf.glb` with tracks named `Wolf_CharGeo/Spine.quaternion`
 * becomes `Spine.quaternion`. If the target model has a Spine bone, that
 * track re-binds on import. Tracks whose name doesn't start with `root + '/'`
 * are passed through unchanged — useful for clips that were authored
 * with bone-relative paths already.
 *
 * MUTATES `clipJson.tracks[i].name` IN PLACE rather than cloning. This is
 * intentional (avoids another deep clone after `clip.toJSON()` already
 * returned a fresh object), but callers MUST either pass a freshly-
 * serialised JSON (as `buildMotionSnapshot` does) or be sure they don't
 * need the pre-scrub names afterwards. Never call this on an entry
 * returned from `getMotion()`.
 *
 * Accepts and returns the THREE.AnimationClip.toJSON()-shaped object so
 * no Three.js dependency is needed at storage time.
 *
 * @param {object} clipJson  — clip.toJSON() result
 * @param {string} rootName  — root Object3D name from the source scene
 * @returns {object}         — same shape, scrubbed
 */
export function scrubTrackNames(clipJson, rootName) {
  if (!clipJson || !Array.isArray(clipJson.tracks)) return clipJson;
  const root = String(rootName || '').trim();
  if (!root) return clipJson;
  const prefix = root + '/';
  for (const t of clipJson.tracks) {
    if (typeof t.name !== 'string') continue;
    // Only strip if the track name explicitly starts with `root + '/'`.
    if (t.name.startsWith(prefix)) {
      t.name = t.name.slice(prefix.length);
    } else if (t.name === root) {
      // rare: track on root only — strip it since target won't have the
      // same root name.
      t.name = '';
    }
  }
  return clipJson;
}

// ----------------------------------------------------------------
// Snapshot builder
// ----------------------------------------------------------------

/**
 * Prepare a persistence-ready entry from a THREE.AnimationClip.
 *
 * @param {THREE.AnimationClip} clip
 * @param {string} sourceModel  — e.g. "Wolf" (used as display only)
 * @param {string} [rootName]   — optional, root node to strip from track names
 * @returns {object} persistence entry with id/signature/clipJson
 */
export function buildMotionSnapshot(clip, sourceModel, rootName) {
  if (!clip) return null;
  // `clip.toJSON()` serialises times/values as plain arrays; rehydration
  // via `THREE.AnimationClip.parse(json)` rebuilds a working clip.
  const json = JSON.parse(JSON.stringify(clip.toJSON()));
  scrubTrackNames(json, rootName || sourceModel);
  // Signature on POST-SCRUB names so re-importing the same model with a
  // different root casing (Wolf vs wolf) deduplicates correctly.
  const sig = generateMotionSignature({ name: json.name, duration: json.duration, tracks: json.tracks });
  return {
    id: _generateId(),
    name: json.name || ('Motion ' + new Date().toLocaleString()),
    duration: Number(json.duration || 0),
    sourceModel: sourceModel || 'unknown',
    signature: sig,
    extractedAt: Date.now(),
    trackCount: (clip.tracks || []).length,
    clipJson: json,
    version: MOTION_VERSION,
  };
}

// ----------------------------------------------------------------
// Public API: extract + save
// ----------------------------------------------------------------

/**
 * Auto-extract every clip to the motion database with dedup.
 * Called by the studio's `_playAnimationClips` hook so every import
 * (default-model load, file drop, marketplace pull) flows through the
 * same path. Re-importing the same model is a no-op thanks to the
 * signature-based dedup.
 *
 * Concurrency: wrapped in `_inflight` so two imports inside the same
 * tick can't both pass the dedup check before either has written.
 *
 * Side effects:
 *   • Each UNIQUE clip becomes a new localStorage entry
 *   • Index is updated and pushed to Puter KV (best-effort)
 *   • Returns `{ added, skipped, total }` for the caller's UI feedback
 *
 * @param {Array<THREE.AnimationClip>} clips
 * @param {string} sourceModel        — display name only
 * @param {string} [rootName]         — root Object3D name for track scrub
 * @returns {Promise<{added:number, skipped:number, total:number}>}
 */
export async function extractAndSaveMotions(clips, sourceModel, rootName) {
  if (!Array.isArray(clips) || clips.length === 0) {
    return { added: 0, skipped: 0, total: 0 };
  }
  // Serialize concurrent calls so two imports fired within ~10ms don't
  // both read the same baseline `_readIndex()` and double-insert the
  // same signature under different ids.
  const task = _inflight.then(() => _doExtract(clips, sourceModel, rootName));
  _inflight = task.catch(() => {}); // keep the chain alive on rejection
  return task;
}

/** Inner impl — MUST be called via the `_inflight` chain in `extractAndSaveMotions`. */
async function _doExtract(clips, sourceModel, rootName) {
  const index = _readIndex();
  // Build a fast signature lookup of already-stored clips
  const known = new Set();
  for (const entry of index) if (entry?.signature) known.add(entry.signature);

  let added = 0, skipped = 0;
  const newEntries = [];

  for (const clip of clips) {
    if (!clip || !clip.tracks || clip.tracks.length === 0) { skipped++; continue; }
    // Build the snapshot up front so we can reuse its already-scrubbed
    // signature — duplicates the scrub logic that used to live inline.
    const snap = buildMotionSnapshot(clip, sourceModel, rootName);
    if (!snap || !snap.signature) { skipped++; continue; }
    if (known.has(snap.signature)) { skipped++; continue; }
    known.add(snap.signature);
    _localSet(LS_PREFIX + snap.id, snap);
    await _cloudSet(snap.id, snap);
    newEntries.unshift({ id: snap.id, name: snap.name, duration: snap.duration, sourceModel: snap.sourceModel, timestamp: snap.extractedAt, signature: snap.signature, trackCount: snap.trackCount });
    added++;
  }

  if (added > 0) {
    const merged = [...newEntries, ...index.filter(e => !newEntries.find(n => n.id === e.id))];
    while (merged.length > MAX_SAVED_MOTIONS) {
      const removed = merged.pop();
      _localRemove(LS_PREFIX + removed.id);
      await _cloudRemove(removed.id);
    }
    _writeIndex(merged);
  }

  return { added, skipped, total: clips.length };
}

// ----------------------------------------------------------------
// Public API: load / list / delete
// ----------------------------------------------------------------

export async function getMotion(id) {
  if (!id) return null;
  const cloud = await _cloudGet(id);
  if (cloud) {
    _localSet(LS_PREFIX + id, cloud);
    return cloud;
  }
  return _localGet(LS_PREFIX + id);
}

export async function listMotions() {
  const cloudIdx = await _cloudGet('_index');
  if (Array.isArray(cloudIdx) && cloudIdx.length > 0) {
    const localIdx = _readIndex();
    const merged = _mergeIndexes(localIdx, cloudIdx);
    _writeIndex(merged);
    return merged;
  }
  return _readIndex();
}

function _mergeIndexes(local, cloud) {
  const seen = new Map();
  for (const e of [...local, ...cloud]) {
    if (!e || !e.id) continue;
    if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function deleteMotion(id) {
  if (!id) return;
  _localRemove(LS_PREFIX + id);
  await _cloudRemove(id);
  const index = _readIndex().filter(e => e.id !== id);
  _writeIndex(index);
}

/** Bulk-delete every motion. Used by the database "Clear" button. */
export async function clearAllMotions() {
  const idx = _readIndex();
  for (const e of idx) {
    _localRemove(LS_PREFIX + e.id);
    await _cloudRemove(e.id);
  }
  _writeIndex([]);
}

// ----------------------------------------------------------------
// Public API: export / import (JSON file)
// ----------------------------------------------------------------

/**
 * Download the full motion database as a JSON file. The shape is
 * self-describing so users can post-it on a repo and `importMotionsDatabase`
 * the same data — no need to share entries one-at-a-time.
 *
 * Output shape:
 *   { version, exportedAt, motions: [...entries with full clipJson] }
 */
export async function exportMotionsDatabase() {
  const idx = await listMotions();
  const motions = [];
  for (const entry of idx) {
    const full = await getMotion(entry.id);
    if (full) motions.push(full);
  }
  const payload = {
    version: MOTION_VERSION,
    exportedAt: new Date().toISOString(),
    source: 'kamakazii_studio3d_motion_db',
    motions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.download = `motion-db_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { count: motions.length };
}

/**
 * Import a previously-exported motion database JSON file. Entries with the
 * signature matching an existing local motion are skipped (no duplication).
 *
 * @param {File} file
 * @returns {Promise<{added:number, skipped:number, total:number}>}
 */
export async function importMotionsDatabase(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ added: 0, skipped: 0, total: 0 });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.motions)) {
          return resolve({ added: 0, skipped: 0, total: 0 });
        }
        const index = _readIndex();
        const known = new Set(index.map(e => e.signature).filter(Boolean));
        let added = 0, skipped = 0;
        const newEntries = [];
        for (const m of data.motions) {
          if (!m || !m.signature || !m.clipJson) { skipped++; continue; }
          if (known.has(m.signature)) { skipped++; continue; }
          // Assign fresh id so re-imports never collide with the original
          const fresh = { ...m, id: _generateId(), extractedAt: Date.now() };
          _localSet(LS_PREFIX + fresh.id, fresh);
          newEntries.unshift({ id: fresh.id, name: fresh.name, duration: fresh.duration, sourceModel: fresh.sourceModel, timestamp: fresh.extractedAt, signature: fresh.signature, trackCount: fresh.trackCount });
          known.add(fresh.signature);
          added++;
        }
        if (added > 0) {
          const merged = [...newEntries, ...index];
          while (merged.length > MAX_SAVED_MOTIONS) merged.pop();
          _writeIndex(merged);
          _cloudSet('_index', merged).catch(() => {});
        }
        resolve({ added, skipped, total: data.motions.length });
      } catch (_) {
        resolve({ added: 0, skipped: 0, total: 0 });
      }
    };
    reader.onerror = () => resolve({ added: 0, skipped: 0, total: 0 });
    reader.readAsText(file);
  });
}
