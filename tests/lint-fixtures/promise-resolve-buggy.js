// Test fixture: cases the lint rule MUST flag.
//
// Each `// expected-error: <rule-id>` comment sits on the line where the
// rule should fire, so a smoke test can grep the lint output to confirm
// every expected violation is reported.  Run with:
//   node_modules/.bin/eslint tests/lint-fixtures/promise-resolve-buggy.js

// ── Cases that MUST trigger the Promise.resolve(syncCall) rule ───────────

// expected-error: no-restricted-syntax
Promise.resolve(window.ProModelerApp.newProject({ starterSlugs: ['cube'] })).catch(() => {});

// expected-error: no-restricted-syntax
Promise.resolve(this.studio.exportSelectedModel?.(fmt)).catch(() => {});

// expected-error: no-restricted-syntax
Promise.resolve(window.ProModelerApp.loadProject(jsonData)).catch(() => {});

// expected-error: no-restricted-syntax
Promise.resolve(doSomething(1, 2, 3)).catch(() => {});

// expected-error: no-restricted-syntax
Promise.resolve(window.foo?.bar.baz(args)).catch(() => {});

// ── Cases that MUST also trigger the (X || Promise.resolve()) rule ───────

// expected-error: no-restricted-syntax
(this.studio.exportSelectedModel?.(fmt) || Promise.resolve()).catch(handler);

// expected-error: no-restricted-syntax
(window.ProModelerApp.newProject(args) || Promise.resolve()).catch(handler);

// expected-error: no-restricted-syntax — nullish-coalescing variant of the same bug
(window.ProModelerApp.loadProject(data) ?? Promise.resolve()).catch(handler);

// ── Cases that MUST also trigger no-eval / no-new-func ───────────────────

// expected-error: no-eval
eval('something');

// expected-error: no-new-func
const fn = new Function('a', 'b', 'return a + b');
