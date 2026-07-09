// Test fixture: cases the lint rule MUST NOT flag.
//
// Each `// ok` comment is a positive case.  Running eslint on this file
// should report ZERO errors.  Run with:
//   node_modules/.bin/eslint tests/lint-fixtures/promise-resolve-clean.js

// ── The deferral pattern: correct fix ────────────────────────────────────

// ok
Promise.resolve().then(() => window.ProModelerApp.newProject(args)).catch(handler);

// ok
Promise.resolve().then(() => window.ProModelerApp.loadProject(data)).catch(handler);

// ok
Promise.resolve().then(() => doSomething(1, 2, 3)).catch(handler);

// ok — optional-chain call, but still deferred
Promise.resolve().then(() => this.studio.exportSelectedModel?.(fmt)).catch(handler);

// ── Promise.resolve with non-call args: not a sync-throw risk ────────────

// ok — variable, not a call
const p1 = Promise.resolve(someVariable);

// ok — object literal
const p2 = Promise.resolve({ foo: 'bar' });

// ok — array literal
const p3 = Promise.resolve([1, 2, 3]);

// ok — string literal
const p4 = Promise.resolve('hello');

// ok — number literal
const p5 = Promise.resolve(42);

// ok — no args
const p6 = Promise.resolve();

// ok — already a Promise variable
const p7 = Promise.resolve(anotherPromise);

// ok — chained, the call is in .then
const p8 = Promise.resolve(somePromise).then(() => doStuff());

// ── Migration target for the (X || Promise.resolve()) rule ──────────────
// The buggy fixture's `(X || Promise.resolve())` pattern migrates to this
// shape: the sync call is deferred into .then() so any throw is caught by
// the surrounding .catch chain.

// ok — optional chain call, deferred
Promise.resolve().then(() => this.studio.exportSelectedModel?.(fmt)).catch(handler);

// ok — non-optional call, deferred
Promise.resolve().then(() => window.ProModelerApp.newProject(args)).catch(handler);
