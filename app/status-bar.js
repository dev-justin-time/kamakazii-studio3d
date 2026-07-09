/**
 * Shared status-bar surfacing helpers.
 *
 * Centralises two patterns that were previously duplicated across 6+ files:
 *
 *   1. Plain status updates  → writeStatus(msg)
 *      Old shape: `if (statusEl) statusEl.textContent = msg;`
 *
 *   2. Error surfacing in a .catch() block  → surfaceError(err, prefix)
 *      Old shape:
 *        .catch(err => {
 *          dbg.error('[File] xxx failed:', err);
 *          const statusLeft = document.getElementById('statusLeft');
 *          if (statusLeft) statusLeft.textContent = `xxx failed: ${err.message || err}`;
 *        });
 *
 * Both helpers tolerate either of the two status-bar ID conventions
 * already in use across the codebase:
 *   - "statusLeft"   (features/file, features/ai, app/puter-client, app/studio)
 *   - "status-left"  (features/_shared/actionMap)
 *
 * The first element found wins; if neither exists the helpers are silent
 * no-ops (same as the previous `if (statusEl) ...` guard pattern).
 *
 * Usage:
 *   import { writeStatus, surfaceError } from '../../app/status-bar.js';
 *
 *   // Just show a transient message in the status bar
 *   writeStatus('🔊 Speaking...');
 *
 *   // Surface an error caught by .catch() so it's visible without DevTools
 *   Promise.resolve().then(() => someSyncCall()).catch(err =>
 *     surfaceError(err, 'New project failed')
 *   );
 */

import { dbg } from './dbg.js';

const STATUS_IDS = ['statusLeft', 'status-left'];

function _findStatusEl() {
  for (const id of STATUS_IDS) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

/**
 * Write a message to the bottom-left status bar.
 * No-op if neither `#statusLeft` nor `#status-left` exists in the DOM.
 * @param {string} msg
 */
export function writeStatus(msg) {
  const el = _findStatusEl();
  if (el) el.textContent = msg;
}

/**
 * Log an error via `dbg.error()` AND show a user-facing message in the
 * status bar.  Designed for `.catch(err => ...)` handlers so that
 * synchronous throws (e.g. from `Promise.resolve(syncCall())`) are
 * surfaced to users without opening DevTools.
 *
 * @param {Error|string|any} err          - the rejected/synced value
 * @param {string} [prefix='Error']       - human-readable label, e.g.
 *                                          'New project failed' or 'Open failed'
 */
export function surfaceError(err, prefix = 'Error') {
  dbg.error(prefix, err);
  // Fall back to 'unknown' so a .catch(null) renders "Open failed: unknown"
  // instead of the noisy "Open failed: null".
  const msg = err?.message || err || 'unknown';
  writeStatus(`${prefix}: ${msg}`);
}
