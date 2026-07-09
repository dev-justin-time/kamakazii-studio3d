/* One-shot helper: migrate raw console.{log,warn,error,info} calls to
 * dbg.* across kamakazii_studio3D/ source.
 *
 *   Behaviour:
 *     • Walks every .js under the project (skipping node_modules + the
 *       tests/lint-fixtures dir).
 *     • Skips the dbg.js implementation file itself + app/error-logger.js
 *       (it's the global error handler that must always log to console).
 *     • For each remaining file:
 *         1. Count the raw `console.{log,warn,error,info}` callsites
 *            ONLY on lines that are not inside a string literal or a
 *            comment.
 *         2. Replace those with `dbg.{log,warn,error,info}(` using a
 *            anchored regex so `console.log inside '...'` doesn't fire.
 *         3. If the file doesn't already import dbg, add the right
 *            relative-path import after the last existing import line.
 *     • Write back only files that actually changed.
 *     • Prints a per-file summary sorted by replacement count.
 *
 *   Idempotent: running twice produces zero extra changes.
 *
 *   Deletable after the migration lands.
 */
import { dbg } from 'app/dbg.js';


'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname);
const ALLOW = new Set([
  path.join(PROJECT, 'app', 'dbg.js'),
  path.join(PROJECT, 'app', 'error-logger.js'),
  path.join(PROJECT, 'marketplace', 'test', 'test.js'),
]);

/** Walk project for .js files, skipping allow-list + dirs we don't lint. */
function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(PROJECT, p).replace(/\\/g, '/');
      if (rel === 'node_modules') continue;
      if (rel.startsWith('tests/lint-fixtures')) continue;
      if (rel === 'tests') continue; // generic /tests dir
      if (rel.startsWith('assets')) continue;
      walk(p, results);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (ALLOW.has(p)) {
        skipped(p, 'allow-list');
      } else {
        results.push(p);
      }
    }
  }
  return results;
}

const skippedLog = [];
function skipped(p, reason) { skippedLog.push({ file: path.relative(PROJECT, p), reason }); }

const METHODS = ['', 'log', 'warn', 'error', 'info']; // '' sentinel

/** Replace console.METHOD( with dbg.METHOD( on lines that aren't string/comment. */
function migrate(src) {
  const lines = src.split('\n');
  let totalReplacements = 0;
  let perMethod = { log: 0, warn: 0, error: 0, info: 0 };
  const newLines = [];
  let inString = false;
  let stringQuote = null;
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    let out = '';
    let j = 0;
    let lineCommentStart = -1;
    while (j < rawLine.length) {
      const ch = rawLine[j];
      const next = rawLine[j + 1];

      if (inLineComment) {
        out += ch;
        j++;
        continue;
      }
      if (inBlockComment) {
        out += ch;
        if (ch === '*' && next === '/') {
          out += next;
          j += 2;
          inBlockComment = false;
        } else {
          j++;
        }
        continue;
      }
      if (inString) {
        out += ch;
        if (ch === '\\' && j + 1 < rawLine.length) {
          out += next;
          j += 2;
          continue;
        }
        if (ch === stringQuote) {
          inString = false;
          stringQuote = null;
        }
        j++;
        continue;
      }
      // Not in string, not in comment yet — check transitions.
      if (ch === "'" || ch === '"' || ch === '`') {
        inString = true;
        stringQuote = ch;
        out += ch;
        j++;
        continue;
      }
      if (ch === '/' && next === '/') {
        inLineComment = true;
        lineCommentStart = j;
        out += ch;
        j++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        out += ch + next;
        j += 2;
        continue;
      }
      // Try to match a console.METHOD( call token at this position.
      let matched = false;
      for (const method of ['log', 'warn', 'error', 'info']) {
        const token = `console.${method}(`;
        if (rawLine.startsWith(token, j)) {
          // Preceded by start-of-line OR a non-identifier char to avoid
          // matching `console.log` embedded inside another identifier
          // (theoretically possible though unlikely).
          const prevCh = j === 0 ? '' : rawLine[j - 1];
          const prevIsIdent = /[A-Za-z0-9_$]/.test(prevCh);
          if (!prevIsIdent) {
            out += `dbg.${method}(`;
            j += token.length;
            totalReplacements++;
            perMethod[method]++;
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        out += ch;
        j++;
      }
    }
    newLines.push(out);
    // Reset per-line comment flag at end of line.
    inLineComment = false;
  }
  return { src: newLines.join('\n'), count: totalReplacements, perMethod };
}

function alreadyImportsDbg(src) {
  return /from\s+['"][^'"]*dbg\.js['"]/.test(src);
}

function dbgImportPath(filePath) {
  const rel = path.relative(PROJECT, filePath).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts[0] === 'app') return './dbg.js';
  const upSteps = parts.length - 1;
  return '../'.repeat(upSteps) + 'app/dbg.js';
}

function insertImport(src, importPath) {
  const lines = src.split('\n');
  // Find last import statement line; insert after it.
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) lastIdx = i;
  }
  const insertion = `import { dbg } from '${importPath}';`;
  if (lastIdx === -1) {
    // No imports — insert at top of file (after leading comments/whitespace).
    let insertAt = 0;
    while (insertAt < lines.length && /^\s*(\/\/|\/\*|\*)/.test(lines[insertAt])) insertAt++;
    lines.splice(insertAt, 0, insertion, '');
  } else {
    lines.splice(lastIdx + 1, 0, insertion);
  }
  return lines.join('\n');
}

const files = walk(PROJECT);
const summary = [];

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  // Normalize CRLF -> LF for in-script regex matching, then restore later.
  const hadCRLF = /\r\n/.test(src);
  const normalized = hadCRLF ? src.replace(/\r\n/g, '\n') : src;
  const { src: migrated, count, perMethod } = migrate(normalized);
  if (count === 0) continue;
  let withImport = migrated;
  if (!alreadyImportsDbg(withImport)) {
    withImport = insertImport(withImport, dbgImportPath(file));
  }
  const finalSrc = hadCRLF ? withImport.replace(/\n/g, '\r\n') : withImport;
  fs.writeFileSync(file, finalSrc);
  summary.push({
    file: path.relative(PROJECT, file).replace(/\\/g, '/'),
    count,
    perMethod,
  });
}

dbg.log('Skipped (allow-list):');
for (const s of skippedLog) dbg.log('  ' + s.file + '  -- ' + s.reason);

dbg.log('\nFiles modified: ' + summary.length);
const totalReplaced = summary.reduce((n, s) => n + s.count, 0);
dbg.log('Total replacements: ' + totalReplaced);
dbg.log('\nPer-file (sorted by count):');
summary.sort((a, b) => b.count - a.count);
for (const s of summary) {
  dbg.log('  ' + s.count.toString().padStart(3) + '  ' + s.file +
    '  [log=' + s.perMethod.log + ', warn=' + s.perMethod.warn +
    ', error=' + s.perMethod.error + ', info=' + s.perMethod.info + ']');
}
