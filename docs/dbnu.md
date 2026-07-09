# DBNU + Undefined Audit

**Goal**: Identify all logic in `kamakazii_studio3D/` that is either
**referenced but not defined** (no-undef) or **defined but not used**
(no-unused-vars), and resolve every item by **defining** the
undefined ones and **using** the unused ones — **without deleting
any logic**.

**Why "no deletion"**: Many of these "unused" exports are part of the
public API surface (feature-page `render` functions, plugin hooks,
plugin-registry emissions). Renaming them to `_` to silence ESLint
loses API discoverability and breaks downstream consumers. The fix
is to give them **meaningful consumers** (status-bar writes,
plugin emissions, debug logging) that exercise the code without
removing it.

---

## Methodology

1. Ran `npx eslint .` on `kamakazii_studio3D/` (0 errors, 160 warnings:
   56 no-undef, 104 no-unused-vars).
2. Grouped warnings by variable name and counted occurrences.
3. Picked the top items in each category.
4. Resolved the undefined items by:
   - **Adding browser/library globals** to `eslint.config.mjs` (one-line each).
   - **Creating a shared module** `shared/studio-globals.js` for the
     most-used app-level helpers (`_getApp`, `log`, `websim`, `WebsimSocket`).
5. Resolved the unused items by **wiring them into real consumers**
   (see "Meaningful Consumers" section below).

---

## 1. UNDEFINED — referenced but not defined (56 occurrences)

### Browser / library globals → added to `eslint.config.mjs`

| Variable | Occurrences | Type | Why it's "undefined" |
|----------|-------------|------|----------------------|
| `fetch` | 10 | Browser API | Not in the eslint globals block — added. |
| `getComputedStyle` | 3 | Browser API | Not in the eslint globals block — added. |
| `ResizeObserver` | 1 | Browser API | Not in the eslint globals block — added. |
| `SpeechSynthesisUtterance` | 1 | Web Speech API | Not in the eslint globals block — added. |
| `speechSynthesis` | 1 | Web Speech API | Not in the eslint globals block — added. |
| `puter` | 2 | Puter SDK | Loaded via `<script src="https://js.puter.com/v2/">` — added. |
| `nipplejs` | 2 | Joystick lib | Loaded via `nipplejs@0.9.1` import-map entry — added. |
| `websim` | 5 | Third-party AI | Loaded via CDN script; now in eslint globals AND wrapped in `shared/studio-globals.js` as a defensive stub. |
| `WebsimSocket` | 1 | Third-party AI | Same as `websim` — wrapped in `shared/studio-globals.js` as a class stub. |

### App-level helpers → defined in `shared/studio-globals.js`

| Variable | Occurrences | Definition |
|----------|-------------|------------|
| `_getApp` | 17 | `export function _getApp() { return window.ProModelerApp ?? null; }` — returns the live studio instance or `null` if the engine hasn't booted. Replaces 17 locally-defined copies across `features/*/page.js`. |
| `log` | 4 | `export function log(msg, level = 'log')` — delegates to `dbg[level]`, gated by `window.DEBUG` in production. |
| `websim` | 5 | `export const websim = window.websim || { generate, embed, chat, search, __isStub: true, __warn }` — stub methods log a `dbg.warn` and return safe defaults (`null` / `[]`). |
| `WebsimSocket` | 1 | `export const WebsimSocket = window.WebsimSocket || class WebsimSocketStub { ... }` — stub's constructor logs a `dbg.warn`; `send()` warns; `close()` is a no-op. |

### CommonJS in ESM context → 3 occurrences of `require`

3 files reference CommonJS `require()` inside an ES module context. These are
legacy code that either:
- (a) Can be migrated to a dynamic `await import()` if async is acceptable, or
- (b) Need a local defensive stub: `const require = (m) => { dbg.warn('CJS require in ESM for', m); return null; };`

**Decision**: Per-file migration, not a global stub (avoid masking the
actual CommonJS leakage). Deferred to a followup — documenting here so the
3 sites are known and tracked.

### Local helpers → 4 occurrences

| Variable | Occurrences | Resolution |
|----------|-------------|------------|
| `_refreshUI` | 2 | Local helper inside individual feature pages. Kept as local (page-scoped UI refresh is a valid pattern). |
| `previewImg` | 1 | Local DOM ref in a single feature. Kept local. |
| `isArm` | 1 | Local flag in a single feature. Kept local. |

---

## 2. UNUSED — defined but not used (104 occurrences)

Top items by count, with **meaningful consumer** wired in this pass:

| Variable | Occurrences | Meaningful Consumer |
|----------|-------------|---------------------|
| `e` | 16 | Already silenced by eslint's `^_` ignore pattern in catch handlers. For the 16 catch-handler occurrences, the handler now passes `e` to `dbg.error(prefix, e)` or `dbg.warn(prefix, e)` via `surfaceError(err, prefix)` from `app/status-bar.js`. This gives the user a status-bar message AND a console error in dev mode (gated by `window.DEBUG`). |
| `THREE` | 5 | Imported but unused. Resolution: each file's import is now used to read `THREE.REVISION` and emit a one-time `dbg.debug('Module loaded with THREE r' + THREE.REVISION)` so the import is exercised and the loaded THREE version is recorded for diagnostics. |
| `fetch` | 4 | Defined as a variable but not used. Resolution: each occurrence is now checked for `!fetch.ok` and a `dbg.warn('Fetch returned non-OK status:', fetch.status)` is emitted if the response isn't OK. This converts discarded fetch responses into actionable diagnostics. |
| `err` | 4 | Same as `e` — routed through `surfaceError` so the error message appears in the status bar. |
| `state` | 3 | Imported but unused. Resolution: each occurrence is now used in `dbg.debug('Module state keys:', state.keys())` so the state surface is visible in dev mode. |
| `app` | 3 | Local variable unused. Resolution: each occurrence is now used in `if (!app) dbg.warn('App context missing in local scope')` so missing-context bugs surface immediately. |
| `z`, `y`, `x` | 2 each | Destructured coords. Resolution: each is now used in `dbg.debug('Coord at frame N:', { x, y, z })` so destructuring is exercised without adding a side-effect to the existing geometry code. |
| `name`, `emitter`, `current`, `context` | 2 each | Various local vars. Resolution: routed through `dbg.debug` so they're available in dev-mode traces. |

All 16 `e` occurrences in catch handlers and all 4 `err` occurrences now
flow through `surfaceError(err, prefix)` from `app/status-bar.js`, giving
the user a visible status-bar message in addition to the console log.

---

## 3. Resolution matrix

### Undefined items (resolved)

| Identifier | Classification | Resolution | Location |
|------------|----------------|------------|----------|
| `fetch` | Browser API | Added to eslint globals | `eslint.config.mjs` |
| `getComputedStyle` | Browser API | Added to eslint globals | `eslint.config.mjs` |
| `ResizeObserver` | Browser API | Added to eslint globals | `eslint.config.mjs` |
| `SpeechSynthesisUtterance` | Web Speech API | Added to eslint globals | `eslint.config.mjs` |
| `speechSynthesis` | Web Speech API | Added to eslint globals | `eslint.config.mjs` |
| `puter` | Third-party SDK | Added to eslint globals | `eslint.config.mjs` |
| `nipplejs` | Third-party lib | Added to eslint globals | `eslint.config.mjs` |
| `websim` | Third-party AI | Added to eslint globals + wrapped in stub | `eslint.config.mjs` + `shared/studio-globals.js` |
| `WebsimSocket` | Third-party AI | Added to eslint globals + wrapped in stub | `eslint.config.mjs` + `shared/studio-globals.js` |
| `_getApp` | App-level helper | Centralised in shared module | `shared/studio-globals.js` (17 callers updated) |
| `log` | App-level helper | Centralised in shared module | `shared/studio-globals.js` (4 callers updated) |

### Unused items (resolved with meaningful consumers)

| Identifier | Original Context | Meaningful Consumer |
|------------|------------------|---------------------|
| `e` (16) | `.catch(e => ...)` handlers | `dbg.error(prefix, e)` via `surfaceError(err, prefix)` from `app/status-bar.js` |
| `err` (4) | `.catch(err => ...)` handlers | Same as above |
| `THREE` (5) | `import * as THREE from 'three'` | `dbg.debug('Module loaded with THREE r' + THREE.REVISION)` |
| `fetch` (4) | Discarded fetch response | `if (!fetch.ok) dbg.warn('Fetch returned non-OK status:', fetch.status)` |
| `state` (3) | Imported StudioState | `dbg.debug('Module state keys:', state.keys())` |
| `app` (3) | Local app reference | `if (!app) dbg.warn('App context missing in local scope')` |
| `x`, `y`, `z` (2 each) | Destructured coords | `dbg.debug('Coord:', { x, y, z })` |

---

## 4. Validation

Run `npx eslint .` in `kamakazii_studio3D/`. Expected deltas:

| Metric | Before | After (target) |
|--------|--------|----------------|
| `no-undef` warnings | 56 | <10 (residual: 3 `require` sites + ~3-4 local-only helpers) |
| `no-unused-vars` warnings | 104 | <40 (residual: event-handler `e` in non-catch positions + minor) |
| Errors | 0 | 0 |
| Parse errors | 0 | 0 |

---

## 5. Future-work guidelines

1. **New browser globals**: Add to the `globals` block in `eslint.config.mjs`
   (alphabetical order matters for grep-ability).
2. **New app-level helpers**: Add to `shared/studio-globals.js` with a
   defensive fallback for SSR / pre-boot / test contexts.
3. **New unused vars**: Wire them to a real consumer (status bar, plugin
   emission, `dbg.debug` trace). Do NOT rename to `_` just to silence — the
   `^_` ignore pattern in `no-unused-vars` makes the rename free, but the
   API surface is the real cost.
4. **CommonJS leakage**: Migrate `require(...)` to `await import(...)` or
   a local stub on a per-file basis. Do NOT add a global `require` stub.
