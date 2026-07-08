/**
 * _shared/canvasUtils.js
 *
 * Shared canvas and UI utilities for the 5 custom-UI feature pages.
 * Extracts repeated patterns: canvas init, undo/redo, tool buttons,
 * slider binding, item selection, tag/search filtering, blob download.
 */

// ── Canvas Initialization ────────────────────────────────────

/**
 * Resize a canvas to fill its parent and optionally draw a grid.
 * @param {string} canvasId
 * @param {Object} opts
 * @param {string} [opts.bg='#2a2a2a']
 * @param {boolean} [opts.grid=false]
 * @param {number} [opts.gridSize=50]
 * @param {string} [opts.gridColor='#3a3a3a']
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D } | null}
 */
export function initCanvas(canvasId, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.bg ?? '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (opts.grid) {
    const size = opts.gridSize ?? 50;
    ctx.strokeStyle = opts.gridColor ?? '#3a3a3a';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += size) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  return { canvas, ctx };
}

/**
 * Clear a canvas and fill with a background color.
 */
export function clearCanvas(canvas, ctx, bg = '#2a2a2a') {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Undo / Redo ──────────────────────────────────────────────

/**
 * Create an undo/redo manager for a Uint8Array-based data map.
 * @param {Object} opts
 * @param {number} [opts.maxHistory=50]
 * @returns {{ save(Uint8Array), undo(Uint8Array), redo(Uint8Array), clear(), getState() }}
 */
export function createUndoManager(opts = {}) {
  const max = opts.maxHistory ?? 50;
  let history = [];
  let index = -1;

  return {
    save(data) {
      history = history.slice(0, index + 1);
      history.push(new Uint8Array(data));
      index = history.length - 1;
      if (history.length > max) { history.shift(); index--; }
    },
    undo(current) {
      if (index <= 0) return null;
      index--;
      return new Uint8Array(history[index]);
    },
    redo(current) {
      if (index >= history.length - 1) return null;
      index++;
      return new Uint8Array(history[index]);
    },
    clear() { history = []; index = -1; },
    getState() { return { history, index }; },
  };
}

/**
 * Bind Ctrl+Z / Ctrl+Y keyboard shortcuts to undo/redo callbacks.
 * Returns a cleanup function to remove the listener.
 */
export function bindUndoRedoKeys(onUndo, onRedo) {
  const handler = (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); onUndo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); onRedo(); }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

// ── Tool / Mode Buttons ──────────────────────────────────────

/**
 * Wire up a set of mutually-exclusive toggle buttons.
 * Clicking one sets it active and removes active from siblings.
 * Calls `onMode(mode)` with the selected mode.
 * @param {string} selector — CSS selector for the button group (e.g. '.tool-btn')
 * @param {string} dataAttr — data attribute holding the mode value (e.g. 'mode')
 * @param {Function} onMode — callback(newMode)
 */
export function bindToolButtons(selector, dataAttr, onMode) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onMode(btn.dataset[dataAttr]);
    });
  });
}

// ── Slider → Property Binding ────────────────────────────────

/**
 * Bind a range input to update a display label and a target object property.
 * @param {string} inputId — id of the <input type="range">
 * @param {string} displayId — id of the <span> showing the value
 * @param {Function} formatFn — (rawValue) => display string
 * @param {Object} target — object to write the parsed value into
 * @param {string} prop — property name on `target`
 * @param {Object} [opts]
 * @param {number} [opts.divisor=1] — divide raw value before writing to target
 */
export function bindSlider(inputId, displayId, formatFn, target, prop, opts = {}) {
  const input = document.getElementById(inputId);
  const display = document.getElementById(displayId);
  if (!input) return;
  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    target[prop] = opts.divisor ? val / opts.divisor : val;
    if (display) display.textContent = formatFn(val);
  });
}

// ── Item Selection with Highlight ────────────────────────────

/**
 * Wire up a list of selectable items with visual highlight on click.
 * @param {string} itemSelector — CSS selector for items
 * @param {string} dataAttr — data attribute holding the item's id
 * @param {Function} onSelect — callback(itemId)
 * @param {Object} [opts]
 * @param {string} [opts.containerSelector] — scope query to this container
 */
export function bindItemSelection(itemSelector, dataAttr, onSelect, opts = {}) {
  const scope = opts.containerSelector
    ? document.querySelector(opts.containerSelector)
    : document;
  if (!scope) return;

  scope.querySelectorAll(itemSelector).forEach(item => {
    item.addEventListener('click', () => {
      const selectedId = item.dataset[dataAttr];
      scope.querySelectorAll(itemSelector).forEach(i => {
        i.style.background = i.dataset[dataAttr] === selectedId ? 'var(--bg-secondary)' : 'transparent';
        i.style.borderColor = i.dataset[dataAttr] === selectedId ? 'var(--accent)' : 'var(--border)';
      });
      onSelect(selectedId);
    });
  });
}

// ── Tag Filtering ────────────────────────────────────────────

/**
 * Initialize tag filter buttons from a set of tags.
 * @param {string} containerId — id of the tag button container
 * @param {Set<string>} tags — all available tags
 * @param {Function} onFilter — callback(tag)
 */
export function initTagFilters(containerId, tags, onFilter) {
  const container = document.getElementById(containerId);
  if (!container) return;

  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.style.cssText = 'padding:4px 10px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:12px;font-size:11px;cursor:pointer;color:var(--text-secondary);';
    btn.addEventListener('click', () => onFilter(tag));
    container.appendChild(btn);
  });
}

/**
 * Highlight the active tag button and dim others.
 */
export function highlightTagButton(tag) {
  document.querySelectorAll('.tag-btn').forEach(btn => {
    const isActive = btn.dataset.tag === tag || (tag === 'all' && btn.dataset.tag === 'all');
    btn.style.background = isActive ? 'var(--accent)' : 'var(--bg-tertiary)';
    btn.style.color = isActive ? 'white' : 'var(--text-secondary)';
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
  });
}

// ── Search Filtering ─────────────────────────────────────────

/**
 * Wire a search input to filter items by matching against a lookup function.
 * @param {string} inputId — id of the search <input>
 * @param {NodeList|Function} getCards — NodeList or function returning NodeList of cards
 * @param {Function} matches — (card, query) => boolean
 */
export function bindSearchFilter(inputId, getCards, matches) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    const cards = typeof getCards === 'function' ? getCards() : getCards;
    cards.forEach(card => {
      card.style.display = matches(card, q) ? '' : 'none';
    });
  });
}

// ── Blob Download ────────────────────────────────────────────

/**
 * Trigger a file download from a string or Blob.
 * @param {string} content — file content
 * @param {string} filename
 * @param {string} [mime='application/octet-stream']
 */
export function downloadFile(content, filename, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a file download from a canvas as PNG.
 */
export function downloadCanvasPNG(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Progress Stepper ─────────────────────────────────────────

/**
 * Run an async sequence of steps with progress display.
 * @param {string} containerId — id of the progress container div
 * @param {string} textId — id of the text display element
 * @param {string} percentId — id of the percent display element
 * @param {Array<{text: string, percent: number, delay?: number}>} steps
 * @param {Function} onComplete — called when all steps finish
 */
export async function runProgressSteps(containerId, textId, percentId, steps, onComplete) {
  const container = document.getElementById(containerId);
  const textEl = document.getElementById(textId);
  const percentEl = document.getElementById(percentId);
  if (!container || !textEl || !percentEl) return;

  container.style.display = 'block';

  for (const step of steps) {
    await new Promise(r => setTimeout(r, step.delay ?? 600));
    textEl.textContent = step.text;
    percentEl.textContent = `${step.percent}%`;
  }

  if (onComplete) onComplete();

  setTimeout(() => { container.style.display = 'none'; }, 800);
}

// ── Procedural Noise Helper ──────────────────────────────────

/**
 * Simple multi-octave sine noise for terrain preview generation.
 * @param {number} nx — normalized x (0..1)
 * @param {number} ny — normalized y (0..1)
 * @param {number} octaves
 * @param {number} persistence — amplitude decay per octave
 * @returns {number} value in range ~(-1..1)
 */
export function sineNoise(nx, ny, octaves = 4, persistence = 0.5) {
  let value = 0, amplitude = 1, frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * Math.sin(nx * frequency + i) * Math.cos(ny * frequency + i * 0.7);
    amplitude *= persistence;
    frequency *= 2;
  }
  return value;
}
