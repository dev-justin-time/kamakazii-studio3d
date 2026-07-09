/**
 * Shared status-bar surfacing helpers.
 *
 * Centralises patterns that were previously duplicated across 6+ files:
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
 *   3. Production-debug toggle → ensureDbgToggle()
 *      Lazy-injects a small button next to the status bar; clicking it
 *      toggles the `dbg.*` console gate (see shared/dbg.js).
 *
 *   4. PhysicsSystem toolbar → wirePhysicsStatusBar()
 *      Surfaces 4 PhysicsSystem affordances in two places:
 *        (a) inline pills + icon-buttons next to the status bar
 *            (Physics: ON/OFF indicator, Reset, Wireframes, Sync, plus
 *             a launcher that toggles the floating panel)
 *        (b) a small draggable floating "Physics" panel (top-right by
 *            default) with the same 4 controls rendered larger and
 *            more discoverable. Position + visibility persist in
 *            localStorage so they survive page reloads.
 *
 * All helpers tolerate either of the two status-bar ID conventions
 * already in use across the codebase:
 *   - "statusLeft"   (features/file, features/ai, app/puter-client, app/studio)
 *   - "status-left"  (features/_shared/actionMap)
 *
 * The first element found wins; if neither exists the helpers are silent
 * no-ops (same as the previous `if (statusEl) ...` guard pattern).
 *
 * Usage:
 *   import { writeStatus, surfaceError, ensureDbgToggle, wirePhysicsStatusBar } from './app/status-bar.js';
 *
 *   // Just show a transient message in the status bar
 *   writeStatus('🔊 Speaking...');
 *
 *   // Surface an error caught by .catch() so it's visible without DevTools
 *   Promise.resolve().then(() => someSyncCall()).catch(err =>
 *     surfaceError(err, 'New project failed')
 *   );
 *
 *   // Manually force the debug toggle to appear (auto-called on DOMContentLoaded)
 *   ensureDbgToggle();
 *
 *   // Manually force the physics toolbar wiring (auto-called on DOMContentLoaded)
 *   wirePhysicsStatusBar();
 */

import { dbg } from './dbg.js';
import { createDbgToggle } from '../../shared/dbg-toggle.js';

const STATUS_IDS = ['statusLeft', 'status-left'];
const LS_PHYS_POS = 'kamikazzi:physics-toolbar-pos';
const LS_PHYS_VIS = 'kamikazzi:physics-toolbar-visible';

let _toggleEnsured = false;
let _toggleCleanup = null;

// ── Physics toolbar state ──────────────────────────────────────
let _physicsBarEnsured = false;
let _physicsBarCleanup = null;

function _findStatusEl() {
  for (const id of STATUS_IDS) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function _safeGetLS(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function _safeSetLS(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* private mode */ }
}

/**
 * Write a message to the bottom-left status bar.
 * No-op if neither `#statusLeft` nor `#status-left` exists in the DOM.
 * @param {string} msg
 */
export function writeStatus(msg) {
  const el = _findStatusEl();
  if (el) el.textContent = msg;
  // Lazy-ensure the debug toggle exists once a status bar appears.
  ensureDbgToggle();
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

/**
 * Lazy-inject a tiny button next to the status bar that toggles the
 * shared `dbg.*` console gate. Idempotent — multiple calls are safe
 * (the first one that finds a status bar wins; subsequent calls are
 * no-ops). Also auto-called once on DOMContentLoaded.
 */
export function ensureDbgToggle() {
  if (_toggleEnsured) return;
  const statusEl = _findStatusEl();
  if (!statusEl || !statusEl.parentNode) return;

  _toggleEnsured = true;

  let btn = document.getElementById('dbgToggle');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'dbgToggle';
    btn.type = 'button';
    // Minimal inline styles — projects can override with their own CSS
    // targeting `.dbg-toggle-on` / `.dbg-toggle-off`.
    btn.style.cssText = [
      'margin-left:0.5em',
      'font-family:monospace',
      'font-size:10px',
      'cursor:pointer',
      'background:transparent',
      'border:1px solid currentColor',
      'border-radius:3px',
      'padding:0 4px',
      'opacity:0.7',
      'vertical-align:middle',
    ].join(';');
    statusEl.parentNode.insertBefore(btn, statusEl.nextSibling);
  }

  _toggleCleanup = createDbgToggle(btn);
}

/* ── Physics toolbar wiring ──────────────────────────────────── */

/**
 * Look up `window.ProModelerApp?.physicsSystem`. Returns null if the
 * engine isn't loaded yet (status bar can be loaded in a page that
 * doesn't have the engine — we want to fail soft, not crash).
 */
function _getPhysics() {
  if (typeof window === 'undefined') return null;
  const app = window.ProModelerApp;
  return app?.physicsSystem ?? null;
}

/**
 * Build a small inline "Physics: ON/OFF" pill button + 3 icon buttons
 * + a launcher button. Inserted right after the dbg toggle (or after
 * the status bar element if no dbg toggle).
 *
 * Returns the array of elements created (in DOM order) so the caller
 * can also bind extra event listeners if needed.
 */
function _buildInlineControls(parent) {
  // ── Pill: Physics: ON/OFF ──
  const pill = document.createElement('button');
  pill.id = 'physToggle';
  pill.type = 'button';
  pill.title = 'Click to enable / disable physics simulation';
  pill.setAttribute('aria-label', 'Toggle physics simulation');
  pill.style.cssText = [
    'margin-left:0.5em',
    'font-family:monospace',
    'font-size:10px',
    'cursor:pointer',
    'background:transparent',
    'border:1px solid currentColor',
    'border-radius:10px',
    'padding:0 6px',
    'opacity:0.85',
    'vertical-align:middle',
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
  ].join(';');

  // The dot + label are inside the pill so we can update them in place.
  pill.innerHTML = '<span class="phys-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#cc4444;transition:background 0.15s"></span><span class="phys-label">Physics: OFF</span>';

  // ── Reset State ──
  const resetBtn = document.createElement('button');
  resetBtn.id = 'physReset';
  resetBtn.type = 'button';
  resetBtn.textContent = '↻';
  resetBtn.title = 'Reset physics state (clears all bodies, vehicles, constraints)';
  resetBtn.setAttribute('aria-label', 'Reset physics state');
  _styleIconButton(resetBtn);

  // ── Toggle Wireframes (eye) ──
  const wireBtn = document.createElement('button');
  wireBtn.id = 'physWire';
  wireBtn.type = 'button';
  wireBtn.textContent = '👁';
  wireBtn.title = 'Toggle wireframe debug helpers';
  wireBtn.setAttribute('aria-label', 'Toggle physics wireframe debug');
  _styleIconButton(wireBtn);

  // ── Sync Scene ──
  const syncBtn = document.createElement('button');
  syncBtn.id = 'physSync';
  syncBtn.type = 'button';
  syncBtn.textContent = '⇅';
  syncBtn.title = 'Sync scene objects into the physics world';
  syncBtn.setAttribute('aria-label', 'Sync scene to physics');
  _styleIconButton(syncBtn);

  // ── Toolbar launcher (toggles the floating panel) ──
  const launchBtn = document.createElement('button');
  launchBtn.id = 'physLauncher';
  launchBtn.type = 'button';
  launchBtn.textContent = '🜲';
  launchBtn.title = 'Show / hide the floating physics toolbar';
  launchBtn.setAttribute('aria-label', 'Toggle floating physics toolbar');
  _styleIconButton(launchBtn);

  const elements = [pill, resetBtn, wireBtn, syncBtn, launchBtn];
  for (const el of elements) parent.appendChild(el);
  return elements;
}

/**
 * Apply the visual disabled state to a button. Used by both
 * `_styleIconButton` (inline) and `_makeBigButton` (floating panel) so
 * the studio-not-ready state is visible everywhere — a `disabled`
 * button that looks identical to an enabled one defeats the purpose
 * of disabling it.
 */
function _applyDisabledStyle(btn) {
  if (!btn) return;
  if (btn.disabled) {
    btn.style.opacity = '0.35';
    btn.style.cursor = 'not-allowed';
    btn.style.filter = 'grayscale(0.6)';
  } else {
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.style.filter = '';
  }
}

function _styleIconButton(btn) {
  btn.style.cssText = [
    'margin-left:0.25em',
    'font-family:monospace',
    'font-size:11px',
    'cursor:pointer',
    'background:transparent',
    'border:1px solid currentColor',
    'border-radius:3px',
    'padding:0 5px',
    'opacity:0.7',
    'vertical-align:middle',
    'line-height:1.4',
  ].join(';');
  // Subtle hover/active states via inline event handlers (no CSS file
  // dependency). We also do this on mousedown to mimic a "pressed" feel.
  btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.opacity = '0.7'; });
  btn.addEventListener('mousedown', () => { if (!btn.disabled) btn.style.opacity = '0.55'; });
  btn.addEventListener('mouseup',   () => { if (!btn.disabled) btn.style.opacity = '1'; });
}

/**
 * Build the floating physics panel. Returns the panel element.
 * The panel is a small draggable window with 4 large buttons.
 * Position is restored from localStorage if present; otherwise
 * the panel starts at top:80px, right:16px.
 */
function _buildFloatingPanel() {
  const panel = document.createElement('div');
  panel.id = 'physToolbar';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Physics toolbar');

  // Restore position
  let pos = null;
  try {
    const raw = _safeGetLS(LS_PHYS_POS);
    if (raw) pos = JSON.parse(raw);
  } catch (_) { pos = null; }
  const top  = (pos && Number.isFinite(pos.top))  ? pos.top  : 80;
  const left = (pos && Number.isFinite(pos.left)) ? pos.left : null;

  // Build a layered style. Use position:fixed; if `left` is null we
  // anchor to the right edge via `right:16px`. The user can drag to
  // reposition; we save the resolved (top,left) on dragend.
  panel.style.cssText = [
    'position:fixed',
    left !== null ? `top:${top}px` : 'top:80px',
    left !== null ? `left:${left}px` : 'right:16px',
    'z-index:99998',
    'background:rgba(20,22,28,0.92)',
    'color:#e0e6f0',
    'border:1px solid rgba(120,140,170,0.4)',
    'border-radius:6px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
    'font-family:monospace',
    'font-size:12px',
    'min-width:180px',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';');

  // Header (drag handle + close)
  const header = document.createElement('div');
  header.style.cssText = [
    'padding:6px 10px',
    'background:rgba(40,46,58,0.9)',
    'border-bottom:1px solid rgba(120,140,170,0.3)',
    'border-radius:6px 6px 0 0',
    'display:flex',
    'justify-content:space-between',
    'align-items:center',
    'cursor:move',
  ].join(';');
  header.innerHTML = '<span>⚙ Physics</span>';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = 'Hide toolbar (use the 🜲 launcher in the status bar to show it again)';
  closeBtn.setAttribute('aria-label', 'Close physics toolbar');
  closeBtn.style.cssText = [
    'background:transparent',
    'border:none',
    'color:#aab4c4',
    'font-size:16px',
    'line-height:1',
    'cursor:pointer',
    'padding:0 4px',
  ].join(';');
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#ff6666'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#aab4c4'; });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Body: 2x2 grid of large buttons
  const body = document.createElement('div');
  body.style.cssText = [
    'display:grid',
    'grid-template-columns:1fr 1fr',
    'gap:6px',
    'padding:8px',
  ].join(';');

  const powerBtn = _makeBigButton('physPowerBig', 'Power', 'ON / OFF', 'Click to toggle physics simulation');
  const resetBig = _makeBigButton('physResetBig', 'Reset', '↻', 'Reset physics state (clears all bodies, vehicles, constraints)');
  const wireBig  = _makeBigButton('physWireBig',  'Wireframes', '👁', 'Toggle wireframe debug helpers');
  const syncBig  = _makeBigButton('physSyncBig',  'Sync', '⇅', 'Sync scene objects into the physics world');

  body.appendChild(powerBtn.btn);
  body.appendChild(resetBig.btn);
  body.appendChild(wireBig.btn);
  body.appendChild(syncBig.btn);
  panel.appendChild(body);

  // Visibility from localStorage (default: visible)
  let visible = true;
  const visRaw = _safeGetLS(LS_PHYS_VIS);
  if (visRaw === '0' || visRaw === 'false') visible = false;
  panel.style.display = visible ? 'block' : 'none';

  // Drag handling on the header
  const dragTeardown = _makeDraggable(panel, header, (resolvedTop, resolvedLeft) => {
    _safeSetLS(LS_PHYS_POS, JSON.stringify({ top: resolvedTop, left: resolvedLeft }));
  });

  // Close button hides the panel and persists.
  // We also stop propagation on mousedown so clicking the × doesn't
  // also start a phantom drag (the close button lives inside the
  // drag handle, so without this the drag's mousedown would fire
  // first, then the click would hide the panel, leaving the drag
  // listeners attached in a stale state).
  closeBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    _safeSetLS(LS_PHYS_VIS, '0');
  });

  document.body.appendChild(panel);

  return {
    panel,
    powerBtn,
    resetBig,
    wireBig,
    syncBig,
    setVisible(v) {
      panel.style.display = v ? 'block' : 'none';
      _safeSetLS(LS_PHYS_VIS, v ? '1' : '0');
    },
    isVisible() { return panel.style.display !== 'none'; },
    // Exposed so the cleanup function can detach the drag's window
    // listeners — otherwise they leak every time the panel is
    // destroyed and recreated.
    _teardownDrag: dragTeardown,
  };
}

function _makeBigButton(id, label, glyph, title) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:2px',
    'padding:8px 6px',
    'background:rgba(60,68,82,0.6)',
    'border:1px solid rgba(120,140,170,0.4)',
    'border-radius:4px',
    'color:#e0e6f0',
    'font-family:monospace',
    'font-size:11px',
    'cursor:pointer',
    'min-height:46px',
    'line-height:1.2',
    'text-align:center',
  ].join(';');
  // Glyph + label
  const glyphEl = document.createElement('div');
  glyphEl.className = 'phys-big-glyph';
  glyphEl.textContent = glyph;
  glyphEl.style.cssText = 'font-size:18px;line-height:1';
  const labelEl = document.createElement('div');
  labelEl.className = 'phys-big-label';
  labelEl.textContent = label;
  labelEl.style.cssText = 'font-size:10px;opacity:0.85';
  btn.appendChild(glyphEl);
  btn.appendChild(labelEl);
  // Hover/active — check `disabled` so a disabled button doesn't get
  // the hover treatment (which would visually re-enable it).
  btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.background = 'rgba(80,90,110,0.7)'; });
  btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.background = 'rgba(60,68,82,0.6)'; });
  btn.addEventListener('mousedown', () => { if (!btn.disabled) btn.style.background = 'rgba(40,48,62,0.8)'; });
  btn.addEventListener('mouseup',   () => { if (!btn.disabled) btn.style.background = 'rgba(80,90,110,0.7)'; });
  return { btn, glyphEl, labelEl };
}

/**
 * Make `target` draggable by dragging on `handle`. Calls `onDrop(top, left)`
 * with the resolved pixel position after the drag ends.
 *
 * Uses `requestAnimationFrame` to update position smoothly during drag
 * and clamps the panel inside the viewport on every frame.
 */
function _makeDraggable(target, handle, onDrop) {
  let dragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;
  let pendingLeft = null, pendingTop = null;
  let rafId = 0;

  function applyPending() {
    if (pendingLeft !== null) { target.style.left = pendingLeft + 'px'; pendingLeft = null; }
    if (pendingTop  !== null) { target.style.top  = pendingTop  + 'px'; pendingTop  = null; }
    rafId = 0;
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return; // left-click only
    dragging = true;
    const rect = target.getBoundingClientRect();
    // Resolve the current pixel position relative to the viewport.
    // The panel may have been set with `right:16px` initially; switch
    // to explicit `left` on first drag so we can drag freely.
    if (!target.style.left) {
      target.style.right = 'auto';
      target.style.left = rect.left + 'px';
    }
    origLeft = parseFloat(target.style.left) || rect.left;
    origTop  = parseFloat(target.style.top)  || rect.top;
    startX = e.clientX;
    startY = e.clientY;
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth  - w);
    const maxTop  = Math.max(0, window.innerHeight - h);
    pendingLeft = clamp(origLeft + dx, 0, maxLeft);
    pendingTop  = clamp(origTop  + dy, 0, maxTop);
    if (!rafId) rafId = requestAnimationFrame(applyPending);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    // Apply any pending position synchronously so onDrop sees the final value
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; applyPending(); }
    const finalLeft = parseFloat(target.style.left) || 0;
    const finalTop  = parseFloat(target.style.top)  || 0;
    if (typeof onDrop === 'function') {
      try { onDrop(finalTop, finalLeft); } catch (_) { /* ignore */ }
    }
  }

  handle.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  // Cancel any in-flight drag if the user switches tabs
  window.addEventListener('blur', () => { if (dragging) onPointerUp(); });

  return () => {
    handle.removeEventListener('mousedown', onPointerDown);
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('blur', onPointerUp);
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  };
}

/**
 * Wire PhysicsSystem affordances into the status bar (inline) and a
 * draggable floating panel. Idempotent — multiple calls are safe; the
 * first one that finds a status bar element wins, subsequent calls
 * return the same cleanup function.
 *
 * Also auto-called once on DOMContentLoaded.
 *
 * @returns {() => void} cleanup function (clears poll interval + listeners)
 */
export function wirePhysicsStatusBar() {
  if (_physicsBarEnsured) return _physicsBarCleanup;

  const statusEl = _findStatusEl();
  if (!statusEl || !statusEl.parentNode) {
    // No status bar → nothing to anchor to. Mark as "ensured" anyway
    // so we don't keep polling. Floating panel can still be built.
    _physicsBarEnsured = true;
    const floating = _buildFloatingPanel();
    const poll = _wirePhysicsActions(floating, null);
    _physicsBarCleanup = _buildCleanup(floating, poll, []);
    return _physicsBarCleanup;
  }

  _physicsBarEnsured = true;

  // ── Inline controls (anchored after the dbg toggle if present) ──
  const inlineEls = _buildInlineControls(statusEl.parentNode);
  const [pill, resetBtn, wireBtn, syncBtn, launchBtn] = inlineEls;

  // ── Floating panel ──
  const floating = _buildFloatingPanel();

  // ── Wire actions (the 4 affordances + launcher) ──
  const poll = _wirePhysicsActions(floating, { pill, resetBtn, wireBtn, syncBtn, launchBtn });

  // Sync the launcher's initial opacity with the panel's persisted
  // visibility (the panel may have been hidden on the last session).
  if (launchBtn) {
    launchBtn.style.opacity = floating.isVisible() ? '1' : '0.7';
  }

  // Cleanup: poll interval + drag listeners + inline elements
  const cleanup = _buildCleanup(floating, poll, inlineEls);
  _physicsBarCleanup = cleanup;
  return cleanup;
}

function _wirePhysicsActions(floating, inline) {
  // ── The 4 action functions, factored out so the inline buttons and
  //    the floating-panel buttons all reuse the same logic. ──
  const doToggle = () => {
    const ps = _getPhysics();
    if (!ps) { writeStatus('Physics: studio not ready'); return; }
    ps.setEnabled(!ps.enabled);
    writeStatus(`Physics ${ps.enabled ? 'enabled' : 'disabled'}`);
  };
  const doReset = () => {
    const ps = _getPhysics();
    if (!ps) { writeStatus('Physics: studio not ready'); return; }
    if (ps.vehicles) {
      for (const v of ps.vehicles) {
        if (typeof v._cleanupInput === 'function') { try { v._cleanupInput(); } catch (_) {} }
      }
    }
    try { ps.dispose(); } catch (e) { dbg.warn('Physics reset: dispose failed', e); }
    try { ps.setEnabled(true); } catch (e) { dbg.warn('Physics reset: re-enable failed', e); }
    writeStatus('Physics reset (all bodies cleared)');
  };
  const doWire = () => {
    const ps = _getPhysics();
    if (!ps) { writeStatus('Physics: studio not ready'); return; }
    ps.setDebug(!ps._debugEnabled);
    writeStatus(`Physics wireframes: ${ps._debugEnabled ? 'ON' : 'OFF'}`);
  };
  const doSync = () => {
    const ps = _getPhysics();
    if (!ps) { writeStatus('Physics: studio not ready'); return; }
    try { ps.setEnabled(true); ps.syncScene(); } catch (e) {
      dbg.warn('Physics sync failed', e);
      writeStatus('Physics sync failed');
      return;
    }
    writeStatus(`Scene synced (${ps.meshes?.length ?? 0} bodies)`);
  };

  // ── Wire inline buttons ──
  if (inline) {
    const { pill, resetBtn, wireBtn, syncBtn, launchBtn } = inline;
    pill.addEventListener('click', () => { doToggle(); refresh(); });
    resetBtn.addEventListener('click', () => { doReset(); refresh(); });
    wireBtn.addEventListener('click', () => { doWire(); refresh(); });
    syncBtn.addEventListener('click', () => { doSync(); refresh(); });
    launchBtn.addEventListener('click', () => {
      const next = !floating.isVisible();
      floating.setVisible(next);
      launchBtn.style.opacity = next ? '1' : '0.7';
    });
    // Start disabled — the first refresh() tick that sees a real
    // physicsSystem will enable them. Prevents clicks during the
    // DOMContentLoaded race where window.ProModelerApp hasn't been
    // constructed yet.
    for (const el of [pill, resetBtn, wireBtn, syncBtn, launchBtn]) {
      if (el) el.disabled = true;
    }
  }

  // ── Wire floating panel buttons ──
  if (floating?.powerBtn?.btn)  floating.powerBtn.btn.addEventListener('click', () => { doToggle(); refresh(); });
  if (floating?.resetBig?.btn)  floating.resetBig.btn.addEventListener('click', () => { doReset(); refresh(); });
  if (floating?.wireBig?.btn)   floating.wireBig.btn.addEventListener('click', () => { doWire(); refresh(); });
  if (floating?.syncBig?.btn)   floating.syncBig.btn.addEventListener('click', () => { doSync(); refresh(); });
  // Disable floating buttons until the studio is ready too.
  for (const b of [floating?.powerBtn?.btn, floating?.resetBig?.btn, floating?.wireBig?.btn, floating?.syncBig?.btn]) {
    if (b) b.disabled = true;
  }

  // ── Poll physics state every 1s to keep the inline pill + power
  //    button visually in sync with the underlying PhysicsSystem. ──
  const POLL_MS = 1000;
  // Track whether the studio has been seen at least once so we can
  // flip the buttons from `disabled` to enabled. They start disabled
  // to absorb the DOMContentLoaded race (status-bar.js and engine.js
  // both listen on the same event; whichever was registered second
  // runs second, so physicsSystem may be undefined at wire time).
  let _studioReady = !!_getPhysics();
  const _allButtons = () => [
    inline?.pill, inline?.resetBtn, inline?.wireBtn, inline?.syncBtn, inline?.launchBtn,
    floating?.powerBtn?.btn, floating?.resetBig?.btn, floating?.wireBig?.btn, floating?.syncBig?.btn,
  ];
  function _setButtonsEnabled(on) {
    for (const el of _allButtons()) {
      if (!el) continue;
      el.disabled = !on;
      // Manually apply the disabled visual state — inline `style`
      // doesn't react to the :disabled pseudo-class, and we don't
      // shadow the `disabled` property on each button (which would
      // be surprising for future readers). Calling the helper here
      // keeps the styling in lockstep with the property.
      _applyDisabledStyle(el);
    }
  }
  _setButtonsEnabled(_studioReady);

  function refresh() {
    const ps = _getPhysics();
    const enabled = !!(ps && ps.enabled);
    const wireOn = !!(ps && ps._debugEnabled);

    if (!_studioReady && ps) {
      _studioReady = true;
      _setButtonsEnabled(true);
    }

    if (inline?.pill) {
      const dot = inline.pill.querySelector('.phys-dot');
      const lbl = inline.pill.querySelector('.phys-label');
      if (dot) dot.style.background = enabled ? '#3edc7c' : '#cc4444';
      if (lbl) lbl.textContent = enabled ? 'Physics: ON' : 'Physics: OFF';
      inline.pill.title = enabled
        ? 'Click to disable physics simulation'
        : 'Click to enable physics simulation';
    }
    if (inline?.wireBtn) {
      inline.wireBtn.style.background = wireOn ? 'rgba(80,200,120,0.25)' : 'transparent';
      inline.wireBtn.title = wireOn ? 'Wireframes ON (click to turn off)' : 'Toggle wireframe debug helpers';
    }
    if (floating?.powerBtn) {
      const { btn, glyphEl, labelEl } = floating.powerBtn;
      if (glyphEl) glyphEl.textContent = enabled ? '●' : '○';
      if (labelEl) labelEl.textContent = enabled ? 'ON' : 'OFF';
      btn.style.borderColor = enabled
        ? 'rgba(80,200,120,0.8)'
        : 'rgba(120,140,170,0.4)';
      btn.style.color = enabled ? '#3edc7c' : '#cc4444';
      btn.title = enabled ? 'Click to disable physics' : 'Click to enable physics';
    }
    if (floating?.wireBig) {
      const { btn } = floating.wireBig;
      btn.style.borderColor = wireOn
        ? 'rgba(80,200,120,0.8)'
        : 'rgba(120,140,170,0.4)';
    }
  }
  refresh(); // initial sync so the pill isn't stale on first paint
  const intervalId = setInterval(refresh, POLL_MS);

  return {
    intervalId,
    refresh,
    stop() { clearInterval(intervalId); },
  };
}

function _buildCleanup(floating, poll, inlineEls) {
  return function cleanup() {
    try { poll?.stop?.(); } catch (_) {}
    // Detach the drag's window listeners before removing the panel
    // node — otherwise the mousemove/mouseup/blur handlers stay
    // attached to window forever (they only run on the header, not
    // the panel, so panel.remove() doesn't catch them).
    try { floating?._teardownDrag?.(); } catch (_) {}
    try { floating?.panel?.remove?.(); } catch (_) {}
    for (const el of inlineEls) {
      try { el?.remove?.(); } catch (_) {}
    }
    _physicsBarEnsured = false;
    _physicsBarCleanup = null;
  };
}

// Auto-inject on DOMContentLoaded so the toggle is visible on page load
// without any code having to call writeStatus first. Guarded by
// `typeof document !== 'undefined'` for SSR / Node.js contexts.
if (typeof document !== 'undefined') {
  const _boot = () => {
    ensureDbgToggle();
    wirePhysicsStatusBar();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    // DOM is already ready (script loaded after parsing).
    _boot();
  }
}
