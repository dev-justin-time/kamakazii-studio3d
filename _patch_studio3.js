// One-shot patch: fix three bugs in studio.js loader path.
//
// Bug 1 (CORRECTNESS): newProject() multi-load path assigns its async IIFE
// to this._defaultModelLoading BEFORE calling loadDefaultModels. Inside the
// loop, loadDefaultModel(...) sees the guard set and returns the multi-load
// IIFE itself, so every slug awaits the same outer promise -> deadlock.
// Fix: drop the outer IIFE wrapping; just await loadDefaultModels directly.
// Each inner loadDefaultModel already self-guards with its own IIFE, so the
// loop serialises naturally without a conflicting outer guard.
//
// Bug 2 (UX): when loadDefaultModel returns null (unknown slug or its own
// 'returned null on failure' branch), the outer try/catch never fires, so we
// push { slug, root: null } with no error message -> 'seeded 0/N' silently.
// Fix: detect null root in loadDefaultModels and attach a meaningful error.
//
// Bug 3 (DIFF HYGIENE): legacy branch added `cube.position.y = 0;` which is
// the constructor default. Remove to keep legacy branch byte-identical.

const fs = require('fs');
const file = 'app/studio.js';
let raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');
let mutated = false;

// ---------- Fix 1: drop the outer IIFE wrapper in newProject multi-load ----------
const before1 = [
  "    // Multi-load path - scatter picked starter assets around the origin.",
  "    log(`New project: seeding ${starterSlugs.length} starter asset(s)`);",
  "    this._defaultModelLoading = (async () => {",
  "      try {",
  "        const results = await this.loadDefaultModels(starterSlugs);",
  "        const ok = results.filter(r => r && r.root).length;",
  "        log(`New project: seeded ${ok}/${starterSlugs.length} starter asset(s)`);",
  "        if (ok > 0 && typeof this.frameAll === 'function') this.frameAll();",
  "      } catch (err) {",
  "        log(`New project starter load failed: ${err && err.message ? err.message : err}`, 'error');",
  "      } finally {",
  "        this._defaultModelLoading = null;",
  "      }",
  "    })();",
  "  },",
].join('\n');

const after1 = [
  "    // Multi-load path - scatter picked starter assets around the origin.",
  "    // Note: we deliberately do NOT wrap this whole block in a",
  "    // _defaultModelLoading IIFE, because that guard is owned by",
  "    // loadDefaultModel(slug) itself and would short-circuit each inner",
  "    // call back to the outer promise (deadlock). Instead the for-loop in",
  "    // loadDefaultModels awaits each loadDefaultModel in turn, and each",
  "    // one serialises against concurrent invocations on its own.",
  "    log(`New project: seeding ${starterSlugs.length} starter asset(s)`);",
  "    try {",
  "      const results = await this.loadDefaultModels(starterSlugs);",
  "      const ok = results.filter(r => r && r.root).length;",
  "      const failed = results.filter(r => !r || !r.root);",
  "      log(`New project: seeded ${ok}/${starterSlugs.length} starter asset(s)`);",
  "      if (failed.length) {",
  "        log(`New project: failed to load ${failed.map(r => r.slug).join(', ')}`, 'error');",
  "      }",
  "      if (ok > 0 && typeof this.frameAll === 'function') this.frameAll();",
  "    } catch (err) {",
  "      log(`New project starter load failed: ${err && err.message ? err.message : err}`, 'error');",
  "    }",
  "  },",
].join('\n');

if (!src.includes(before1)) {
  console.error('FIX 1: marker not found in studio.js');
  process.exit(2);
}
src = src.replace(before1, after1);
mutated = true;
console.log('FIX 1 applied: removed outer _defaultModelLoading IIFE deadlock');

// ---------- Fix 2: surface null root as a real error in loadDefaultModels ----------
const before2 = [
  "      try {",
  "        // loadDefaultModel awaits the previous _defaultModelLoading, so",
  "        // successive calls serialise cleanly without re-entering the guard.",
  "        const root = await this.loadDefaultModel(slug);",
  "        if (root && root.position) {",
  "          const col = i % cols;",
  "          const row = Math.floor(i / cols);",
  "          // loadDefaultModel already aligned to ground (y = -0.5); preserve",
  "          // that and only offset x/z so characters do not stack on origin.",
  "          root.position.x = (col - (cols - 1) / 2) * cellSize;",
  "          root.position.z = (row - (rows - 1) / 2) * cellSize;",
  "        }",
  "        results.push({ slug, root });",
  "      } catch (err) {",
  "        results.push({ slug, root: null, error: err && err.message ? err.message : String(err) });",
  "      }",
].join('\n');

const after2 = [
  "      let root = null;",
  "      let loadErr = null;",
  "      try {",
  "        root = await this.loadDefaultModel(slug);",
  "      } catch (err) {",
  "        loadErr = err && err.message ? err.message : String(err);",
  "      }",
  "      if (!root) {",
  "        // loadDefaultModel resolves with null on unknown slug OR on its own",
  "        // internal failure; surface a useful message instead of silent zero.",
  "        if (!loadErr) loadErr = `loadDefaultModel returned null for ${slug} (unknown slug or silent load failure)`;",
  "        results.push({ slug, root: null, error: loadErr });",
  "        log(`Starter load failed for ${slug}: ${loadErr}`, 'error');",
  "      } else {",
  "        if (root.position) {",
  "          const col = i % cols;",
  "          const row = Math.floor(i / cols);",
  "          // loadDefaultModel already aligned the model to ground; preserve y and",
  "          // only offset x/z so characters do not stack on origin.",
  "          root.position.x = (col - (cols - 1) / 2) * cellSize;",
  "          root.position.z = (row - (rows - 1) / 2) * cellSize;",
  "        }",
  "        results.push({ slug, root });",
  "      }",
].join('\n');

if (!src.includes(before2)) {
  console.error('FIX 2: marker not found in studio.js');
  process.exit(2);
}
src = src.replace(before2, after2);
mutated = true;
console.log('FIX 2 applied: surfaces null-root as a real error');

// ---------- Fix 3: remove redundant cube.position.y = 0 in legacy branch ----------
const before3 = "      cube.receiveShadow = true;\n      cube.position.y = 0;\n      cube.name = 'Cube';\n";
const after3 = "      cube.receiveShadow = true;\n      cube.name = 'Cube';\n";

if (!src.includes(before3)) {
  console.error('FIX 3: marker not found in studio.js');
  process.exit(2);
}
src = src.replace(before3, after3);
mutated = true;
console.log('FIX 3 applied: removed redundant cube.position.y = 0');

// Normalise one trailing newline then re-CRLF if needed.
src = src.replace(/\n+$/, '\n');
const out = crlf ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(file, out);
if (!mutated) console.log('no-op');
else console.log('studio.js patched: bug 1 + bug 2 + bug 3 fixed');
