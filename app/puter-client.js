/* kamakazii_studio3D/app/puter-client.js
   Responsibility: Puter.js integration layer for Studio 3D — KV storage,
   user auth, AI completions, cloud save/load, and error logging.
   Modeled after kamakazii_3d_aero_comand/game/puter-client.js.
   Extracted as a standalone module so all three apps can eventually
   share a root-level puter-lib.js.
*/

// ═══════════════════════════════════════════════════════════════
//  SDK Availability & Lazy Loading
// ═══════════════════════════════════════════════════════════════

let _puterReady = false;
let _sdkLoadAttempted = false;
let _onReadyCallbacks = [];
let _authToken = null; // cached auth token

/**
 * Check whether the Puter.js SDK is loaded and ready.
 * Returns true if puter global exists and is authenticated.
 */
export function isPuterAvailable() {
  return _puterReady && typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn && puter.auth.isSignedIn();
}

/**
 * Wait for the Puter SDK to become available.
 * Resolves immediately if already ready; otherwise resolves
 * when the 'puterUserReady' custom event fires.
 */
export function waitForPuter(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (isPuterAvailable()) return resolve(true);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Puter SDK not available within ' + timeoutMs + 'ms'));
    }, timeoutMs);
    const handler = () => { cleanup(); resolve(true); };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('puterUserReady', handler);
    };
    window.addEventListener('puterUserReady', handler);
    // Trigger init in case SDK loaded but event hasn't fired
    if (!_sdkLoadAttempted) initPuter().catch(() => {});
  });
}

/**
 * Initialize the Puter SDK — checks for signed-in user and
 * dispatches 'puterUserReady' when ready.
 */
export async function initPuter() {
  if (_sdkLoadAttempted) return;
  _sdkLoadAttempted = true;
  try {
    if (typeof puter === 'undefined') {
      console.warn('[Puter] SDK not loaded — add <script src="https://js.puter.com/v2/"> to index.html');
      return;
    }
    // Check if user is already signed in
    if (puter.auth && puter.auth.isSignedIn && puter.auth.isSignedIn()) {
      _puterReady = true;
      window.dispatchEvent(new CustomEvent('puterUserReady'));
      return;
    }
    // If not signed in, attempt silent sign-in
    if (puter.auth && typeof puter.auth.signIn === 'function') {
      try {
        const user = await puter.auth.signIn({ silent: true });
        if (user) {
          _puterReady = true;
          window.dispatchEvent(new CustomEvent('puterUserReady'));
          return;
        }
      } catch (_) {
        // Silent sign-in failed — user needs to click login
        console.log('[Puter] Silent sign-in not available; user will need to click Sign In');
      }
    }
  } catch (e) {
    console.warn('[Puter] Init error:', e);
  }
}

// Listen for the Puter SDK load event
window.addEventListener('puterUserReady', () => {
  _puterReady = true;
});

// ═══════════════════════════════════════════════════════════════
//  Auth / User Identity
// ═══════════════════════════════════════════════════════════════

/**
 * Get the current signed-in user's display name.
 * Returns null if not signed in.
 */
export async function getUsername() {
  if (!isPuterAvailable()) return null;
  try {
    const user = await puter.auth.getUser();
    return user ? (user.username || user.name || user.email || null) : null;
  } catch (_) { return null; }
}

/**
 * Get the current user's avatar URL.
 */
export async function getAvatarUrl() {
  if (!isPuterAvailable()) return null;
  try {
    const user = await puter.auth.getUser();
    return user && user.avatar_url ? user.avatar_url : null;
  } catch (_) { return null; }
}

/**
 * Trigger Puter OAuth sign-in flow.
 * Returns user object on success, null on failure/cancel.
 */
export async function signIn() {
  try {
    if (typeof puter === 'undefined') {
      console.warn('[Puter] SDK not loaded');
      return null;
    }
    const user = await puter.auth.signIn();
    if (user) {
      _puterReady = true;
      window.dispatchEvent(new CustomEvent('puterUserReady'));
    }
    return user || null;
  } catch (e) {
    console.warn('[Puter] Sign-in failed:', e);
    return null;
  }
}

/**
 * Sign out / disconnect Puter session.
 */
export async function signOut() {
  try {
    if (puter.auth && typeof puter.auth.signOut === 'function') {
      await puter.auth.signOut();
    }
    _puterReady = false;
    // Clear cached token
    localStorage.removeItem('puterApiKey');
    window.dispatchEvent(new CustomEvent('puterUserSignedOut'));
  } catch (e) {
    console.warn('[Puter] Sign-out failed:', e);
  }
}

/**
 * Refresh the current user session.
 */
export async function refreshUser() {
  _sdkLoadAttempted = false;
  _puterReady = false;
  await initPuter();
}

// ═══════════════════════════════════════════════════════════════
//  KV Storage (with localStorage fallback)
// ═══════════════════════════════════════════════════════════════

function kvLocalGet(key) {
  try { return localStorage.getItem('puter_kv_' + key); } catch (_) { return null; }
}
function kvLocalSet(key, val) {
  try { localStorage.setItem('puter_kv_' + key, val); } catch (_) {}
}
function kvLocalRemove(key) {
  try { localStorage.removeItem('puter_kv_' + key); } catch (_) {}
}

/**
 * Set a value in Puter KV (with localStorage fallback).
 */
export async function kvSet(key, value) {
  // Always persist to local first (offline-first)
  kvLocalSet(key, typeof value === 'string' ? value : JSON.stringify(value));
  if (!isPuterAvailable()) return;
  try {
    await puter.kv.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.warn('[Puter KV] Write failed (local fallback active):', key, e);
  }
}

/**
 * Get a value from Puter KV (with localStorage fallback).
 * Returns parsed JSON or raw string.
 */
export async function kvGet(key) {
  // Try Puter first
  if (isPuterAvailable()) {
    try {
      const data = await puter.kv.get(key);
      if (data !== null && data !== undefined) {
        // Sync to local for offline availability
        kvLocalSet(key, typeof data === 'string' ? data : JSON.stringify(data));
        try { return JSON.parse(data); } catch (_) { return data; }
      }
    } catch (e) {
      console.warn('[Puter KV] Read failed, falling back to local:', key, e);
    }
  }
  // Fallback to localStorage
  const local = kvLocalGet(key);
  if (local !== null) {
    try { return JSON.parse(local); } catch (_) { return local; }
  }
  return null;
}

/**
 * Delete a key from Puter KV (and local).
 */
export async function kvDelete(key) {
  kvLocalRemove(key);
  if (isPuterAvailable()) {
    try { await puter.kv.delete(key); } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════
//  AI Completions
// ═══════════════════════════════════════════════════════════════

/**
 * Send a chat completion request to Puter AI.
 * Returns the response text or null on failure.
 */
export async function aiChat(prompt, options = {}) {
  if (!isPuterAvailable()) return null;
  try {
    if (puter.ai && typeof puter.ai.chat === 'function') {
      const response = await puter.ai.chat(prompt, options);
      return response || null;
    }
    // Fallback to completions API
    if (puter.ai && typeof puter.ai.complete === 'function') {
      const response = await puter.ai.complete(prompt, options);
      return response || null;
    }
    console.warn('[Puter AI] No chat/completion API available');
    return null;
  } catch (e) {
    console.warn('[Puter AI] Chat failed:', e);
    return null;
  }
}

/**
 * Generate an image using Puter AI txt2img.
 * Returns the image URL or null on failure.
 */
export async function aiGenerateImage(prompt, options = {}) {
  if (!isPuterAvailable()) return null;
  try {
    const url = await puter.ai.txt2img(prompt, options);
    return url || null;
  } catch (e) {
    console.warn('[Puter AI] Image generation failed:', e);
    return null;
  }
}

/**
 * Synthesize text to speech using Puter AI.
 * Plays the audio and returns an Audio element.
 */
export async function aiSpeak(text, cacheKey) {
  if (!isPuterAvailable()) return null;
  try {
    const audio = await puter.ai.txt2speech(text);
    if (audio) {
      audio.play().catch(() => {});
    }
    return audio || null;
  } catch (e) {
    console.warn('[Puter AI] TTS failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  File System
// ═══════════════════════════════════════════════════════════════

/**
 * Write a file to the user's Puter drive.
 */
export async function fsWrite(path, data) {
  if (!isPuterAvailable()) return;
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    await puter.fs.write(path, blob);
  } catch (e) {
    console.warn('[Puter FS] Write failed:', path, e);
  }
}

/**
 * Read a file from the user's Puter drive.
 */
export async function fsRead(path) {
  if (!isPuterAvailable()) return null;
  try {
    return await puter.fs.read(path);
  } catch (e) {
    console.warn('[Puter FS] Read failed:', path, e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Scene / Project Cloud Sync
// ═══════════════════════════════════════════════════════════════

const SCENE_KV_PREFIX = 'studio3d_scene_';
const PROJECT_LIST_KEY = 'studio3d_project_list';

/**
 * Save a scene snapshot to Puter KV (with local fallback).
 * @param {string} projectId - unique project identifier
 * @param {object} sceneData - serialized scene (objects, materials, lights, cameras)
 */
export async function saveSceneSnapshot(projectId, sceneData) {
  const key = SCENE_KV_PREFIX + projectId;
  const payload = {
    version: 1,
    timestamp: Date.now(),
    data: sceneData,
  };
  await kvSet(key, payload);

  // Update project list
  const list = (await kvGet(PROJECT_LIST_KEY)) || [];
  const existing = list.findIndex(p => p.id === projectId);
  const entry = { id: projectId, name: sceneData.name || projectId, updatedAt: Date.now() };
  if (existing >= 0) list[existing] = entry;
  else list.push(entry);
  await kvSet(PROJECT_LIST_KEY, list);
}

/**
 * Load a scene snapshot from Puter KV (with local fallback).
 */
export async function loadSceneSnapshot(projectId) {
  const key = SCENE_KV_PREFIX + projectId;
  const data = await kvGet(key);
  return data ? data.data : null;
}

/**
 * List all saved projects.
 */
export async function listProjects() {
  const list = (await kvGet(PROJECT_LIST_KEY)) || [];
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Delete a saved project.
 */
export async function deleteProject(projectId) {
  await kvDelete(SCENE_KV_PREFIX + projectId);
  const list = (await kvGet(PROJECT_LIST_KEY)) || [];
  const filtered = list.filter(p => p.id !== projectId);
  await kvSet(PROJECT_LIST_KEY, filtered);
}

// ═══════════════════════════════════════════════════════════════
//  Settings Sync
// ═══════════════════════════════════════════════════════════════

const SETTINGS_KEY = 'studio3d_settings';

/**
 * Save user settings to cloud (with local fallback).
 */
export async function saveSettings(settings) {
  await kvSet(SETTINGS_KEY, settings);
}

/**
 * Load user settings from cloud (with local fallback).
 */
export async function loadSettings() {
  return await kvGet(SETTINGS_KEY);
}

// ═══════════════════════════════════════════════════════════════
//  Auto-init on script load
// ═══════════════════════════════════════════════════════════════

// Attempt silent init when this module loads
initPuter().catch(() => {});

export default {
  isPuterAvailable,
  waitForPuter,
  initPuter,
  getUsername,
  getAvatarUrl,
  signIn,
  signOut,
  refreshUser,
  kvSet,
  kvGet,
  kvDelete,
  aiChat,
  aiGenerateImage,
  aiSpeak,
  fsWrite,
  fsRead,
  saveSceneSnapshot,
  loadSceneSnapshot,
  listProjects,
  deleteProject,
  saveSettings,
  loadSettings,
};
