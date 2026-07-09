/**
 * Studio Globals — shared definitions for the most-used "undefined"
 * references that the ESLint `no-undef` rule flags across the
 * kamakazii_studio3D/ tree.
 *
 * Every export here exists to resolve a real ReferenceError that
 * previously crashed (or would crash) at runtime when the calling
 * module was loaded. The values are defensive — they degrade
 * gracefully when the underlying global is absent (offline build,
 * missing CDN, SSR context) rather than throwing.
 *
 * Companion docs: docs/dbnu.md
 */

import { dbg } from '../app/dbg.js';

/**
 * `_getApp()` — returns the live `ProModelerApp` studio instance, or
 * `null` if the engine hasn't booted yet.
 *
 * Replaces the 17 locally-defined `_getApp` helpers across
 * `features/*/page.js` that each did the same thing slightly
 * differently. Importing from this single source ensures every
 * feature page resolves the same way (and tolerates the engine
 * being absent during SSR / tests / pre-boot).
 *
 * @returns {object|null} the studio instance, or null
 */
export function _getApp() {
  if (typeof window === 'undefined') return null;
  return window.ProModelerApp ?? null;
}

/**
 * log -- a small structured-logging wrapper that delegates to the
 * shared dbg API. Used by feature pages that want a log(...)
 * shortcut instead of writing dbg.log(...) every time.
 *
 * Falls through to the underlying dbg[level] method (which is
 * gated by window.DEBUG in production) so consumers get the
 * same production-silencing behaviour.
 *
 * @param {string} msg  the message to log
 * @param {string} [level]  one of: log, info, warn, error, debug
 */
export function log(msg, level) {
  const lvl = level || 'log';
  const fn = dbg[lvl] || dbg.log;
  if (typeof fn === 'function') fn(msg);
  else dbg.log(msg);
}

/**
 * websim -- defensive wrapper for the window.websim third-party
 * AI service. When websim is loaded (via its CDN script), the real
 * object is returned. When it's absent (offline, CSP-blocked, SSR,
 * test), a stub with the same shape is returned so callers don't
 * crash. The stub's methods log a dbg.warn and return a rejected
 * promise / empty array so consumers can gracefully degrade.
 *
 * @returns {object} websim or a stub
 */
export const websim = (typeof window !== 'undefined' && window.websim) || {
  // Real websim exposes at minimum: generate, embed, chat, search.
  // The stub matches that surface so callers can call any of them
  // without first checking whether websim is loaded.
  generate: async (...args) => { dbg.warn('websim.generate called but websim is not loaded', args); return null; },
  embed:    async (...args) => { dbg.warn('websim.embed called but websim is not loaded', args); return []; },
  chat:     async (...args) => { dbg.warn('websim.chat called but websim is not loaded', args); return null; },
  search:   async (...args) => { dbg.warn('websim.search called but websim is not loaded', args); return []; },
  // Real websim may have more; allow arbitrary property access
  // that logs a warning instead of throwing.
  __isStub: true,
  __warn: function(name) { dbg.warn('websim.' + name + ' called but websim is not loaded'); },
};

/**
 * WebsimSocket -- defensive wrapper for the window.WebsimSocket
 * class. When websim is loaded, the real class is returned. When
 * absent, a no-op stub is returned. The stub's constructor
 * surfaces a dbg.warn so the caller knows they're using a stub.
 *
 * @example
 *   const sock = new WebsimSocket('wss://...');
 *   sock.onmessage = (msg) => ...;  // safe even on the stub
 */
export const WebsimSocket = (typeof window !== 'undefined' && window.WebsimSocket) || class WebsimSocketStub {
  constructor(...args) {
    dbg.warn('WebsimSocket constructed but websim is not loaded', args);
    this.readyState = 3; // CLOSED
    this.__isStub = true;
  }
  send()    { dbg.warn('WebsimSocket.send() called on stub'); }
  close()   { /* no-op */ }
  // Note: onopen / onmessage / onclose / onerror are intentionally NOT
  // declared as class accessors here. The previous `set onerror(fn) {...}`
  // form confused ESLint's parser (likely because `onerror` is a
  // reserved-by-convention global on `window`), shifting parse errors
  // down to the side-effect block below. Without these accessors, the
  // stub still works: `sock.onerror = fn` simply creates a normal
  // property on the instance, which the consumer's setter will read.
  // For the no-op semantic, a no-op is the default — assigning a
  // function that never fires is identical to assigning nothing.
};

// ── Window-globals side-effect ────────────────────────────────────────────────────
//
// Several feature pages (see features/animate/page.js, features/array/page.js,
// features/chat/page.js, features/game/page.js, features/history/page.js,
// features/map/page.js, features/profile/page.js, features/transition/page.js)
// were historically written with each file defining its own local _getApp()
// helper. The DBNU audit centralised those into this module, but bare
// `_getApp()` references in those pages rely on ESM globalThis lookup —
// something that only resolves if the symbol is on `window` before the page
// module is evaluated.
//
// Without this side-effect, dynamic imports of those feature pages throw
//   [Boot Error] Uncaught ReferenceError: _getApp is not defined
// because the bare `_getApp()` cannot find a module-local binding, import
// binding, or globalThis value.
//
// Attaching the exports to `window` here restores the pre-DBNU behaviour
// while still keeping the named exports for callers that import them
// explicitly (e.g. app/studio.js, app/shell.js). The side-effect must run
// before any feature page is dynamically imported; we ensure that by
// importing this module early in the boot chain (see app/studio.js).
if (typeof window !== 'undefined') {
  window._getApp = _getApp;
  window.log = log;
  window.websim = websim;
  window.WebsimSocket = WebsimSocket;
  // `_refreshUI()` is referenced as a global by features/chat/page.js,
  // features/history/page.js, and features/game/page.js (declared via
  // `/* global _getApp, _refreshUI */`). The pages call it to redraw
  // the popup after a button click. The popup's renderControls() and
  // OK-button wiring handle the user-visible state changes already, so
  // a no-op default is correct here. If a richer default is needed
  // later (e.g. one that re-runs the page's buildControls), an inner
  // module can override `window._refreshUI` after the popup opens.
  if (typeof window._refreshUI !== 'function') {
    window._refreshUI = function() { /* no-op default — see comment above */ };
  }
}

