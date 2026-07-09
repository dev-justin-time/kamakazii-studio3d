// Robust patch script (CRLF-tolerant, line-based) for the three bugs.
// Strategy: detect CRLF, normalise to LF, work on lines, write back.
//
// Bug 1 (CORRECTNESS): kill the deadlock-prone outer _defaultModelLoading IIFE
// in newProject multi-load path.
//
// Bug 2 (UX gap): detect null-return from loadDefaultModel and surface a real
// error + log it.
//
// Bug 3 (DIFF HYGIENE): remove redundant `cube.position.y = 0;` from the
// legacy newProject branch (constructor default is 0).

const fs = require('fs');
const file = 'app/studio.js';
let raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');
let lines = src.split('\n');

const log = (m) => console.log(m);

// ---- helper: find the first line starting exactly with `prefix` ----
const findLine = (prefix, startIdx = 0) => {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i] === prefix || lines[i].startsWith(prefix)) return i;
  }
  return -1;
};

// ---- helper: replace a [start..end] inclusive range with a block (LF lines) ----
const replaceRange = (startIdx, endIdx, blockLines) => {
  const out = lines.slice(0, startIdx).concat(blockLines, lines.slice(endIdx + 1));
  lines = out;
};

// ==================== FIX 1: remove the outer IIFE in newProject multi-load ====================
//
// Signature anchor: line `    this._defaultModelLoading = (async () => {`
// The buggy block ends at the matching IIFE close brace.
// We'll find by anchor + count braces forward.

let applied = 0;

// Find anchor line
const anchor1 = findLine('    this._defaultModelLoading = (async () => {');
if (anchor1 === -1) {
  log('FIX 1: anchor not found - newProject may already be fixed');
} else {
  // Walk forward, count braces from the open. Stop when depth returns to 0.
  let depth = 0;
  let sawOpen = false;
  let end1 = -1;
  for (let i = anchor1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; sawOpen = true; }
      else if (ch === '}') { depth--; if (sawOpen && depth === 0) { end1 = i; break; } }
    }
    if (end1 !== -1) break;
  }
  if (end1 === -1) {
    log('FIX 1: could not locate end of outer IIFE');
    process.exit(1);
  }

  // Replacement: keep the explanation comment + log line, then a flat try/catch
  // (no outer IIFE) so each inside `await this.loadDefaultModels(...)` does
  // not collide with the inner loadDefaultModel's own guard.
  const block1 = [
    '    log(`New project: seeding ${starterSlugs.length} starter asset(s)`);',
    '    try {',
    '      const results = await this.loadDefaultModels(starterSlugs);',
    '      const ok = results.filter(r => r && r.root).length;',
    '      const failed = results.filter(r => !r || !r.root);',
    "      log(`New project: seeded ${ok}/${starterSlugs.length} starter asset(s)`);",
    '      if (failed.length) {',
    "        log(`New project: failed to load ${failed.map(r => r.slug).join(', ')}`, 'error');",
    '      }',
    "      if (ok > 0 && typeof this.frameAll === 'function') this.frameAll();",
    '    } catch (err) {',
    "      log(`New project starter load failed: ${err && err.message ? err.message : err}`, 'error');",
    '    }',
  ];
  // Replace from anchor1 .. end1
  replaceRange(anchor1, end1, block1);
  applied++;
  log(`FIX 1 applied: replaced lines ${anchor1 + 1}-${end1 + 1} with ${block1.length}-line try/catch`);
}

// ==================== FIX 2: handle null root in loadDefaultModels ====================

// Anchor on the unique line `  async loadDefaultModels(slugs) {`
const startMethod2 = findLine('  async loadDefaultModels(slugs) {');
if (startMethod2 === -1) {
  log('FIX 2: loadDefaultModels anchor not found');
  process.exit(1);
}
// Walk forward to find the matching method close brace (back at 2-space).
let depth = 0;
let sawOpen = false;
let end2 = -1;
for (let i = startMethod2; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; sawOpen = true; }
    else if (ch === '}') { depth--; if (sawOpen && depth === 0) { end2 = i; break; } }
  }
  if (end2 !== -1) break;
}
if (end2 === -1) { log('FIX 2: end of loadDefaultModels not found'); process.exit(1); }

// Anchor on the existing buggy `const root = await this.loadDefaultModel(slug);` line
const relAnchor2 = findLine('        const root = await this.loadDefaultModel(slug);', startMethod2);
if (relAnchor2 === -1) {
  log('FIX 2: inner-await line not found - already fixed?');
} else {
  // Find the line after which the `results.push({ slug, root });` lives, AND the
  // corresponding try/catch close. To be safe, replace a known range we assert
  // exists. We anchor the OLD buggy block by content lines.
  const bugBlock = [
    '      try {',
    '        // loadDefaultModel awaits the previous _defaultModelLoading, so',
    '        // successive calls serialise cleanly without re-entering the guard.',
    '        const root = await this.loadDefaultModel(slug);',
    '        if (root && root.position) {',
    '          const col = i % cols;',
    '          const row = Math.floor(i / cols);',
    '          // loadDefaultModel already aligned to ground (y = -0.5); preserve',
    '          // that and only offset x/z so characters do not stack on origin.',
    '          root.position.x = (col - (cols - 1) / 2) * cellSize;',
    '          root.position.z = (row - (rows - 1) / 2) * cellSize;',
    '        }',
    '        results.push({ slug, root });',
    '      } catch (err) {',
    '        results.push({ slug, root: null, error: err && err.message ? err.message : String(err) });',
    '      }',
  ];

  // Convert to a single string for fast substring check on full-`src`.
  let searchSrc = lines.join('\n');
  const blockJoined = bugBlock.join('\n');
  const idx = searchSrc.indexOf(blockJoined);
  if (idx === -1) {
    log('FIX 2: existing buggy block not found verbatim - may already be fixed');
  } else {
    // Locate the absolute line range for the buggy block.
    // Use offsetOf approach: count newlines up to idx.
    const prefix = searchSrc.slice(0, idx);
    const startLine2 = prefix.split('\n').length - 1; // 0-index of first line of block
    const endLine2 = startLine2 + bugBlock.length - 1;

    const newBlock2 = [
      '      let root = null;',
      '      let loadErr = null;',
      '      try {',
      '        root = await this.loadDefaultModel(slug);',
      '      } catch (err) {',
      '        loadErr = err && err.message ? err.message : String(err);',
      '      }',
      '      if (!root) {',
      '        // loadDefaultModel resolves with null on unknown slug OR internal failure;',
      '        // surface a useful error instead of silent zero.',
      '        if (!loadErr) loadErr = `loadDefaultModel returned null for ${slug} (unknown slug or silent load failure)`;',
      '        results.push({ slug, root: null, error: loadErr });',
      '        log(`Starter load failed for ${slug}: ${loadErr}`, \'error\');',
      '      } else {',
      '        if (root.position) {',
      '          const col = i % cols;',
      '          const row = Math.floor(i / cols);',
      '          // loadDefaultModel already aligned the model to ground; preserve y',
      '          // and only offset x/z so characters do not stack on origin.',
      '          root.position.x = (col - (cols - 1) / 2) * cellSize;',
      '          root.position.z = (row - (rows - 1) / 2) * cellSize;',
      '        }',
      '        results.push({ slug, root });',
      '      }',
    ];
    replaceRange(startLine2, endLine2, newBlock2);
    applied++;
    log(`FIX 2 applied: replaced lines ${startLine2 + 1}-${endLine2 + 1} (${bugBlock.length} -> ${newBlock2.length} lines)`);
  }
}

// ==================== FIX 3: remove redundant cube.position.y = 0 ====================
const posLine = findLine('      cube.position.y = 0;');
if (posLine === -1) {
  log('FIX 3: cube.position.y = 0 not found - already removed?');
} else {
  // Just delete that one line.
  lines.splice(posLine, 1);
  applied++;
  log(`FIX 3 applied: removed line ${posLine + 1}`);
}

// ==================== write back ====================
let out = lines.join('\n');
out = out.replace(/\n+$/, '\n');                    // canonical 1 trailing newline
const final = crlf ? out.replace(/\n/g, '\r\n') : out;
fs.writeFileSync(file, final);
log(`studio.js patched: ${applied}/3 fixes applied`);
