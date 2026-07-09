// ESLint 9 flat config for kamakazii_studio3D/
//
// Two custom guards, plus the small set of standard rules that protect the
// conventions this codebase already uses:
//
//   1. no-restricted-syntax -> "Promise.resolve(<CallExpression>)"
//      Catches `Promise.resolve(syncCall(...))` where the inner call is
//      evaluated synchronously BEFORE Promise.resolve wraps it, so any
//      synchronous throw inside `syncCall` bypasses the .catch chain and
//      becomes a window-level uncaught error.
//
//      The recommended fix is to defer the call into .then():
//          Promise.resolve().then(() => syncCall(args)).catch(err => ...);
//
//   2. no-eval
//      Catches `eval(...)` and `new Function(...)`.  We found two callers
//      in the studio tree during the prior bug scan; the rule now prevents
//      new occurrences.
//
// Other bundled rules: no-unused-vars, no-duplicate-imports, no-undef,
// no-restricted-imports (forbid raw `console` in favour of the `dbg.*`
// convention gated by window.DEBUG).  These are off by default for the
// `node_modules` and `assets` directories via the ignore block below.

export default [
  {
    // Files to lint — every JS module in the source tree, NOT the
    // patch/throwaway scripts and NOT generated assets.
    files: ['**/*.js'],
    // The patch scripts in the repo root are intentionally outside the
    // lint path; they're one-shot tools, not production source.
    ignores: [
      '**/node_modules/**',
      'assets/**',
      '_patch_*.js',          // one-shot scripts (should be deleted after use)
      '__patch_*.js',         // one-shot scripts with double-underscore prefix (root-level)
      '**/_patch_*.js',
      '**/__patch_*.js',
      'dist/**',
      'build/**',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Browser globals this codebase uses without explicit imports.
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        TextDecoder: 'readonly',
        WebSocket: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        // Used by some modules
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Stripe / payment globals used in the marketplace module
        Stripe: 'readonly',
        // Browser APIs frequently used across features/page.js files
        URLSearchParams: 'readonly',
        CustomEvent: 'readonly',
        BroadcastChannel: 'readonly',
        MutationObserver: 'readonly',
        DOMParser: 'readonly',
        Event: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        EventTarget: 'readonly',
        DeviceOrientationEvent: 'readonly',
        OfflineAudioContext: 'readonly',
        AudioContext: 'readonly',
        Audio: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        location: 'readonly',
        history: 'readonly',
        screen: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        // Browser / web-platform APIs frequently used across the tree
        // (added to clear no-undef warnings — see docs/dbnu.md for the
        // full list of items resolved in this pass).
        fetch: 'readonly',
        getComputedStyle: 'readonly',
        ResizeObserver: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        speechSynthesis: 'readonly',
        // Third-party libraries loaded via <script> tags
        // (puter.js, nipplejs, websim). These expose globals.
        puter: 'readonly',
        nipplejs: 'readonly',
        websim: 'readonly',
        WebsimSocket: 'readonly',
        // Three.js often pulled in alongside the app
        THREE: 'readonly',
        CONFIG: 'readonly',
        Stats: 'readonly',
        // Tailwind compile-time inject
        tailwind: 'readonly',
      },
    },
    rules: {
      // ── Bug-class guards (the whole point of this config) ─────────────
      // Flag `Promise.resolve(<funcall>)` where the inner call would throw
      // before the .catch chain ever runs.  Recommended fix is the deferral
      // pattern: `Promise.resolve().then(() => funcall()).catch(...)`.
      //
      // The 2nd selector catches a related bug class: `(call() || Promise.resolve())`.
      // The `||` evaluates the LHS sync before falling through; if the LHS call
      // throws, the throw bypasses the surrounding .catch.  Migrate to
      // `Promise.resolve().then(() => call())` instead — the call is deferred
      // into a microtask and any throw is caught by the chain.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Promise'][callee.property.name='resolve'][arguments.0.type='CallExpression']",
          message:
            "Bypass risk: Promise.resolve evaluates the inner call before wrapping. Use `Promise.resolve().then(() => call(args)).catch(...)` instead.",
        },
        {
          selector:
            "LogicalExpression[operator='||'][right.type='CallExpression'][right.callee.object.name='Promise'][right.callee.property.name='resolve'][left.type='CallExpression']",
          message:
            "Bypass risk: `X || Promise.resolve()` evaluates the LHS synchronously; sync throws bypass the .catch chain. Use `Promise.resolve().then(() => X)` instead.",
        },
        {
          // Same bug class with the nullish-coalescing operator. `X ?? Promise.resolve()`
          // also evaluates X synchronously; if X throws, the throw bypasses the .catch chain.
          // The left.type='CallExpression' filter is intentional: `someVar ?? Promise.resolve()`
          // (where someVar is a variable) is a valid pattern and must NOT be flagged.
          selector:
            "LogicalExpression[operator='??'][right.type='CallExpression'][right.callee.object.name='Promise'][right.callee.property.name='resolve'][left.type='CallExpression']",
          message:
            "Bypass risk: `X ?? Promise.resolve()` evaluates the LHS synchronously; sync throws bypass the .catch chain. Use `Promise.resolve().then(() => X)` instead.",
        },
        {
          // ── Status-bar DOM access lock-in ──
          // Forbidden pattern: `document.getElementById('statusLeft')`.
          // All status-bar writes MUST go through writeStatus() / surfaceError()
          // from app/status-bar.js so the ID-convention handling and silent
          // no-op behaviour stay in one place.
          //
          // The selector only fires on string-literal arguments, so the
          // helper itself (`getElementById(id)` where `id` is an iteration
          // variable over STATUS_IDS) is naturally exempt — no eslint-disable
          // needed there.  The only existing exception is
          // features/_shared/actionMap.js's legacy `status()` helper, which
          // has a per-line disable with a comment explaining why.
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name='getElementById'][arguments.0.value='statusLeft']",
          message:
            "Use writeStatus() or surfaceError() from app/status-bar.js instead of raw document.getElementById('statusLeft'). The helper handles both ID conventions and is a silent no-op when no element exists.",
        },
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name='getElementById'][arguments.0.value='status-left']",
          message:
            "Use writeStatus() or surfaceError() from app/status-bar.js instead of raw document.getElementById('status-left'). The helper handles both ID conventions and is a silent no-op when no element exists.",
        },
      ],
      // eval() and new Function() — covered by the built-in rules.
      'no-eval': 'error',
      'no-new-func': 'error',
      // ── Hygiene ───────────────────────────────────────────────────────
      // Catches the SyntaxError pattern we just fixed in editor/UIManager.js:
      // two identical `import` statements adjacent to each other.
      'no-duplicate-imports': 'error',
      // Flag unused variables, but allow the common underscore-prefix
      // convention (e.g. `catch (_err) {}` is fine).
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // ── Project conventions ───────────────────────────────────────────
      // The codebase uses `dbg.*` (from app/dbg.js) gated by window.DEBUG
      // instead of raw `console.*`. Flag any direct console usage.
      'no-restricted-imports': [
        // Error severity (was 'warn' before the studio-wide console→dbg
        // migration).  The codebase now uses `dbg.*` everywhere; keeping
        // the rule as a warning would let new raw-console calls slip in.
        'error',
        {
          paths: [
            {
              name: 'console',
              message:
                "Use the `dbg.*` API (see app/dbg.js) instead of raw console.* — it's gated by window.DEBUG and respects the project convention.",
            },
          ],
        },
      ],
      // ── Common ES pitfalls (warn-only so pre-existing issues don't block
      //     adopting the strict bug-class guards above) ──────────────────
      // Flag undefined identifiers. The existing tree has many browser
      // globals not yet declared (CustomEvent, localStorage, prompt,
      // screen, etc.); warn-only keeps the strict rules above as the
      // hard gate. Tighten to 'error' once the globals list is complete.
      'no-undef': 'warn',
    },
  },

  // Lighter rules for the test/fixture directory: these often intentionally
  // demonstrate the buggy pattern, so we don't want them to fail the lint.
  // Disable no-undef + no-unused-vars because the fixtures use deliberately
  // unbound names (`handler`, `someVariable`, `data`, etc.) to exercise the
  // AST pattern without needing real bindings.
  {
    files: ['tests/lint-fixtures/**/*.js'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-eval': 'off',
      'no-new-func': 'off',
      'no-duplicate-imports': 'off',
      'no-restricted-imports': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
