/* ═══════════════════════════════════════════════════════════════════════════
   puter-client.js  –  Studio 3D Puter.js integration
   ═══════════════════════════════════════════════════════════════════════════
   Wraps the shared puter-lib.js (project root) with Studio 3D-specific
   convenience methods: image generation (txt2img), TTS playback, and the
   initPuter() function expected by the existing ui/index.html.

   Usage:
     import { initPuter, getUsername, generateImage, speak } from '../app/puter-client.js';
     await initPuter();
     const url = await generateImage('cyberpunk city at sunset');
     speak('Image generated successfully');
   ═══════════════════════════════════════════════════════════════════════════ */

import { dbg } from './dbg.js';
import { writeStatus } from './status-bar.js';
import { setCloudStatus, CloudState } from '../../shared/cloud-status.js';
import puterLib, {
  resolvePuter,
  isPuterAvailable,
  isCloudDisabled,
  resetCloudCircuit,
  auth,
  kv,
  fs,
  ai,
  ClientLogger,
  setKvPrefix,
} from '../../puter-lib.js';

// ── Re-export shared lib for convenience ───────────────────────────────────
export {
  resolvePuter,
  isPuterAvailable,
  isCloudDisabled,
  resetCloudCircuit,
  auth,
  kv,
  fs,
  ai,
  ClientLogger,
  setKvPrefix,
};
export default puterLib;

// ── Auth convenience re-exports for existing ui/index.html imports ─────────
// ui/index.html does: import { initPuter, getUsername } from '../app/puter-client.js';
export const getUsername = () => auth.getUsername();
export const getUser = () => auth.getUser();
export const getAvatarUrl = () => auth.getAvatarUrl();
export const isSignedIn = () => auth.isSignedIn();

// ─── Studio 3D-specific: initPuter() ──────────────────────────────────────
// Called by ui/index.html during boot to initialize the Puter SDK and
// subscribe to auth state changes.

let _puterInitialized = false;
let _puterUser = null;
let _onAuthChangeCallbacks = [];

/**
 * Initialize Puter SDK for Studio 3D.
 * Resolves the SDK, sets the KV prefix, and caches the current user.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {Promise<boolean>} Whether Puter was successfully initialized.
 */
export async function initPuter() {
  if (_puterInitialized) return !!_puterUser;

  // Set KV key prefix to avoid collisions with other apps
  setKvPrefix('studio3d_');

  const p = await resolvePuter();
  if (!p) {
    dbg.warn('[puter-client] Puter SDK not available');
    _puterInitialized = true;
    _puterUser = null;
    // Paint the status-bar cloud pill so the user sees the cloud is
    // unavailable (the editor UIManager will also paint its own dot;
    // this ensures the status bar is correct even if UIManager hasn't
    // initialised yet). The puter-lib circuit breaker will now throttle
    // any further Puter calls until the user clicks the pill to recheck.
    setCloudStatus('statusCloudDot', CloudState.DISCONNECTED, 'Puter not available', 'status-cloud-indicator', '');
    return false;
  }

  // Try to get the current user
  try {
    _puterUser = await auth.getUser();
    if (_puterUser) {
      dbg.log('[puter-client] Signed in as', _puterUser.username || _puterUser.name);
    } else {
      dbg.log('[puter-client] Puter SDK ready, user not signed in');
    }
  } catch (_) {
    _puterUser = null;
  }

  _puterInitialized = true;
  return true;
}

/**
 * Register a callback for Puter auth state changes.
 * The callback is called with the user object (or null) whenever the
 * sign-in state changes.
 *
 * @param {Function} cb — callback(user|null)
 * @returns {Function} unsubscribe
 */
export function onAuthChange(cb) {
  _onAuthChangeCallbacks.push(cb);
  // Immediately invoke with current state
  if (_puterInitialized) cb(_puterUser);
  return () => {
    const i = _onAuthChangeCallbacks.indexOf(cb);
    if (i >= 0) _onAuthChangeCallbacks.splice(i, 1);
  };
}

// ─── Image Generation (txt2img) ───────────────────────────────────────────

/**
 * Generate an image using Puter AI text-to-image.
 * Wraps puter-lib's `ai.generateImage()` with Studio 3D-specific defaults
 * and a synchronous fallback message for the status bar.
 *
 * @param {string}  prompt       — Text description of the image.
 * @param {object}  [options]
 * @param {string}  [options.size='512x512'] — Image size.
 * @param {string}  [options.negative_prompt] — Things to avoid.
 * @param {boolean} [options.silent=false] — If true, skip status bar updates.
 * @returns {Promise<string|null>} The image URL, or null on failure.
 */
export async function generateImage(prompt, options = {}) {
  if (!_puterInitialized) await initPuter();
  if (!isPuterAvailable()) {
    dbg.warn('[puter-client] Cannot generate image: Puter SDK unavailable');
    return null;
  }

  if (!options.silent) writeStatus('🎨 Generating image...');

  try {
    const url = await ai.generateImage(prompt, {
      size: options.size || '512x512',
      negative_prompt: options.negative_prompt || undefined,
    });

    if (url) {
      if (!options.silent) writeStatus('✅ Image generated');
      return url;
    }

    if (!options.silent) writeStatus('⚠️ Image generation failed');
    return null;
  } catch (e) {
    dbg.warn('[puter-client] generateImage error:', e);
    if (!options.silent) writeStatus('⚠️ Image generation error');
    return null;
  }
}

// ─── Text-to-Speech (TTS) ─────────────────────────────────────────────────

let _ttsAudioContext = null;

/**
 * Get or create a shared AudioContext for TTS playback.
 */
function _getTtsContext() {
  if (!_ttsAudioContext) {
    try {
      _ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
  }
  if (_ttsAudioContext.state === 'suspended') {
    _ttsAudioContext.resume().catch(() => {});
  }
  return _ttsAudioContext;
}

/**
 * Speak text using Puter AI TTS (txt2speech).
 * Downloads the audio data and plays it through the Web Audio API.
 * Falls back to the Web Speech API if Puter AI TTS is unavailable.
 *
 * @param {string}  text       — The text to speak.
 * @param {object}  [options]
 * @param {boolean} [options.silent=false] — Skip status bar updates.
 * @param {boolean} [options.voice=false]  — Use Web Speech API instead.
 * @returns {Promise<boolean>} Whether TTS was successful.
 */
export async function speak(text, options = {}) {
  if (!_puterInitialized) await initPuter();
  if (!text || !text.trim()) return false;

  if (!options.silent) writeStatus('🔊 Speaking...');

  // Option 1: Use Puter AI TTS
  if (!options.voice) {
    try {
      const audioResult = await ai.textToSpeech(text);
      if (audioResult) {
        // audioResult could be a URL or a data URI
        const ctx = _getTtsContext();
        if (ctx) {
          const response = await fetch(audioResult);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.start(0);
          if (!options.silent) writeStatus('🔊 Speaking');
          return true;
        }
      }
    } catch (e) {
      dbg.warn('[puter-client] Puter TTS failed, falling back to Web Speech:', e);
    }
  }

  // Option 2: Fallback to Web Speech API
  if ('speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      speechSynthesis.speak(utterance);
      if (!options.silent) writeStatus('🔊 Speaking (browser)');
      return true;
    } catch (e) {
      dbg.warn('[puter-client] Web Speech TTS failed:', e);
    }
  }

  if (!options.silent) writeStatus('⚠️ TTS unavailable');
  return false;
}

/**
 * Get the cached Puter user (fast, no async).
 * Returns null if not yet initialized or not signed in.
 */
export function getPuterUser() {
  return _puterUser;
}
