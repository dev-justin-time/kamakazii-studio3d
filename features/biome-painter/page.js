/**
 * Biome Painter — Paint terrain biomes with brush tools
 * Assign vegetation, ground cover, and environmental zones to terrain areas
 */

const BIOME_TYPES = {
  temperateForest: {
    name: 'Temperate Forest',
    icon: '🌲',
    color: '#2d5a27',
    vegetation: ['oak', 'birch', 'pine', 'fern'],
    groundCover: 'grass',
    density: 0.7,
    description: 'Mixed deciduous and coniferous trees'
  },
  tropicalJungle: {
    name: 'Tropical Jungle',
    icon: '🌴',
    color: '#1a4a1a',
    vegetation: ['palm', 'bamboo', 'monstera', 'vine'],
    groundCover: 'dense-grass',
    density: 0.95,
    description: 'Dense canopy with exotic flora'
  },
  desert: {
    name: 'Desert',
    icon: '🏜️',
    color: '#c4a35a',
    vegetation: ['cactus', 'tumbleweed', 'succulent'],
    groundCover: 'sand',
    density: 0.08,
    description: 'Arid wasteland with sparse vegetation'
  },
  arctic: {
    name: 'Arctic Tundra',
    icon: '❄️',
    color: '#d4e5f7',
    vegetation: ['pine-snow', 'moss'],
    groundCover: 'snow',
    density: 0.15,
    description: 'Frozen plains with minimal plant life'
  },
  swamp: {
    name: 'Swamp',
    icon: '🐸',
    color: '#3a5a3a',
    vegetation: ['willow', 'cypress', 'lily-pad', 'reed'],
    groundCover: 'mud',
    density: 0.8,
    description: 'Wetlands with murky waters'
  },
  volcanic: {
    name: 'Volcanic',
    icon: '🌋',
    color: '#4a2a2a',
    vegetation: [],
    groundCover: 'lava-rock',
    density: 0,
    description: 'Barren volcanic terrain'
  },
  alpine: {
    name: 'Alpine Meadow',
    icon: '⛰️',
    color: '#5a7a4a',
    vegetation: ['pine', 'wildflower', 'grass-tall'],
    groundCover: 'alpine-grass',
    density: 0.5,
    description: 'High altitude grasslands'
  },
  ocean: {
    name: 'Ocean Floor',
    icon: '🌊',
    color: '#1a3a5a',
    vegetation: ['kelp', 'coral', 'seaweed'],
    groundCover: 'sand-wet',
    density: 0.4,
    description: 'Underwater biome for submerged areas'
  }
};

const BRUSH_SETTINGS = {
  size: 30,
  opacity: 0.8,
  hardness: 0.7,
  spacing: 0.5,
  jitter: 0.1,
  mode: 'paint' // paint, erase, smooth, fill
};

let selectedBiome = 'temperateForest';
let brushSettings = { ...BRUSH_SETTINGS };
let isPainting = false;
let biomeMap = null; // Will hold painted biome data
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;
let _keydownHandler = null;

export function render(container) {
  init(container);
}

export function init(container) {
  container.innerHTML = `
    <div class="biome-painter-panel" style="display: grid; grid-template-columns: 240px 1fr 200px; height: 100%; gap: 1px; background: var(--border);">
      <!-- Left: Biome Palette -->
      <div class="biome-palette" style="background: var(--bg-primary); padding: 16px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Biomes</h3>
        <div class="biome-list" id="biome-list">
          ${Object.entries(BIOME_TYPES).map(([key, biome]) => `
            <div class="biome-item ${key === selectedBiome ? 'selected' : ''}" data-biome="${key}"
              style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; 
                     background: ${key === selectedBiome ? 'var(--bg-secondary)' : 'transparent'};
                     border: 1px solid ${key === selectedBiome ? 'var(--accent)' : 'var(--border)'};
                     border-radius: 6px; cursor: pointer; transition: all 0.15s;">
              <div style="width: 32px; height: 32px; background: ${biome.color}; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 18px;">${biome.icon}</span>
              </div>
              <div>
                <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">${biome.name}</div>
                <div style="font-size: 10px; color: var(--text-secondary);">Density: ${(biome.density * 100).toFixed(0)}%</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">RECENT BIOMES</h4>
          <div id="recent-biomes" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
        </div>
      </div>
      
      <!-- Center: Canvas -->
      <div class="canvas-area" style="background: var(--bg-secondary); position: relative; overflow: hidden;">
        <canvas id="biome-canvas" style="width: 100%; height: 100%; cursor: crosshair;"></canvas>
        <div class="canvas-overlay" style="position: absolute; top: 10px; left: 10px; display: flex; gap: 6px;">
          <button class="tool-btn active" data-mode="paint" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer;" title="Paint">🖌️</button>
          <button class="tool-btn" data-mode="erase" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer;" title="Eraser">🧹</button>
          <button class="tool-btn" data-mode="smooth" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer;" title="Smooth">💨</button>
          <button class="tool-btn" data-mode="fill" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer;" title="Fill">🪣</button>
          <div style="width: 1px; background: var(--border); margin: 0 4px;"></div>
          <button id="undo-btn" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 16px; cursor: pointer;" title="Undo">↩️</button>
          <button id="redo-btn" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; font-size: 16px; cursor: pointer;" title="Redo">↪️</button>
        </div>
        <div class="brush-cursor" id="brush-cursor" style="position: absolute; pointer-events: none; border: 2px solid white; border-radius: 50%; transform: translate(-50%, -50%); mix-blend-mode: difference;"></div>
      </div>
      
      <!-- Right: Brush Settings -->
      <div class="brush-settings" style="background: var(--bg-primary); padding: 16px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Brush</h3>
        
        <label style="display: block; margin-bottom: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Size: <span id="size-val">${brushSettings.size}</span></span>
          <input type="range" id="brush-size" min="5" max="200" value="${brushSettings.size}" style="width: 100%;">
        </label>
        
        <label style="display: block; margin-bottom: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Opacity: <span id="opacity-val">${(brushSettings.opacity * 100).toFixed(0)}%</span></span>
          <input type="range" id="brush-opacity" min="0" max="100" value="${brushSettings.opacity * 100}" style="width: 100%;">
        </label>
        
        <label style="display: block; margin-bottom: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Hardness: <span id="hardness-val">${(brushSettings.hardness * 100).toFixed(0)}%</span></span>
          <input type="range" id="brush-hardness" min="0" max="100" value="${brushSettings.hardness * 100}" style="width: 100%;">
        </label>
        
        <label style="display: block; margin-bottom: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Spacing: <span id="spacing-val">${(brushSettings.spacing * 100).toFixed(0)}%</span></span>
          <input type="range" id="brush-spacing" min="10" max="200" value="${brushSettings.spacing * 100}" style="width: 100%;">
        </label>
        
        <label style="display: block; margin-bottom: 12px;">
          <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Jitter: <span id="jitter-val">${(brushSettings.jitter * 100).toFixed(0)}%</span></span>
          <input type="range" id="brush-jitter" min="0" max="100" value="${brushSettings.jitter * 100}" style="width: 100%;">
        </label>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">LAYERS</h4>
          <div id="biome-layers" style="space-y: 4px;"></div>
          <button id="add-layer-btn" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px dashed var(--border); border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text-secondary); margin-top: 8px;">
            + Add Layer
          </button>
        </div>
        
        <div style="margin-top: 16px;">
          <button id="apply-biomes" style="width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Apply to Terrain</button>
          <button id="clear-biomes" style="width: 100%; padding: 8px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px; margin-top: 6px;">Clear All</button>
        </div>
      </div>
    </div>
  `;

  initCanvas();
  setupEventListeners();
  initBiomeMap();
}

function initCanvas() {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function initBiomeMap() {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas) return;
  
  biomeMap = new Uint8Array(canvas.width * canvas.height);
  history = [new Uint8Array(biomeMap)];
  historyIndex = 0;
}

function setupEventListeners() {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas) return;
  
  // Biome selection
  document.querySelectorAll('.biome-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedBiome = item.dataset.biome;
      document.querySelectorAll('.biome-item').forEach(i => {
        i.style.background = i.dataset.biome === selectedBiome ? 'var(--bg-secondary)' : 'transparent';
        i.style.borderColor = i.dataset.biome === selectedBiome ? 'var(--accent)' : 'var(--border)';
      });
      addToRecent(selectedBiome);
    });
  });
  
  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      brushSettings.mode = btn.dataset.mode;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Brush sliders
  const sliders = [
    { id: 'brush-size', prop: 'size', display: 'size-val', format: v => v },
    { id: 'brush-opacity', prop: 'opacity', display: 'opacity-val', format: v => `${v}%` },
    { id: 'brush-hardness', prop: 'hardness', display: 'hardness-val', format: v => `${v}%` },
    { id: 'brush-spacing', prop: 'spacing', display: 'spacing-val', format: v => `${v}%` },
    { id: 'brush-jitter', prop: 'jitter', display: 'jitter-val', format: v => `${v}%` }
  ];
  
  sliders.forEach(({ id, prop, display, format }) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      if (prop === 'size') {
        brushSettings[prop] = val;
      } else {
        brushSettings[prop] = val / 100;
      }
      document.getElementById(display).textContent = format(val);
    });
  });
  
  // Canvas painting
  canvas.addEventListener('mousedown', startPainting);
  canvas.addEventListener('mousemove', (e) => {
    updateBrushCursor(e);
    if (isPainting) paint(e);
  });
  canvas.addEventListener('mouseup', stopPainting);
  canvas.addEventListener('mouseleave', stopPainting);
  
  // Undo/Redo
  document.getElementById('undo-btn')?.addEventListener('click', undo);
  document.getElementById('redo-btn')?.addEventListener('click', redo);
  
  // Keyboard shortcuts
  _keydownHandler = (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  };
  window.addEventListener('keydown', _keydownHandler);
  
  // Apply button
  document.getElementById('apply-biomes')?.addEventListener('click', applyBiomes);
  document.getElementById('clear-biomes')?.addEventListener('click', clearBiomes);
}

function updateBrushCursor(e) {
  const cursor = document.getElementById('brush-cursor');
  if (!cursor) return;
  
  const rect = e.target.getBoundingClientRect();
  cursor.style.left = `${e.clientX - rect.left}px`;
  cursor.style.top = `${e.clientY - rect.top}px`;
  cursor.style.width = `${brushSettings.size}px`;
  cursor.style.height = `${brushSettings.size}px`;
}

function startPainting(e) {
  isPainting = true;
  paint(e);
}

function stopPainting() {
  if (isPainting) {
    isPainting = false;
    saveHistory();
  }
}

function paint(e) {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas || !biomeMap) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(e.clientX - rect.left);
  const y = Math.floor(e.clientY - rect.top);
  const ctx = canvas.getContext('2d');
  
  const biome = BIOME_TYPES[selectedBiome];
  const radius = brushSettings.size / 2;
  
  if (brushSettings.mode === 'fill') {
    fillArea(x, y, selectedBiome);
    return;
  }
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const py = y + dy;
      
      if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;
      
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      
      // Hardness falloff
      const falloff = 1 - (dist / radius);
      const hardness = falloff > brushSettings.hardness ? 1 : falloff / brushSettings.hardness;
      const alpha = hardness * brushSettings.opacity;
      
      const idx = py * canvas.width + px;
      
      if (brushSettings.mode === 'erase') {
        biomeMap[idx] = 0;
        ctx.fillStyle = `rgba(42, 42, 42, ${alpha})`;
      } else if (brushSettings.mode === 'smooth') {
        // Average with neighbors
        let sum = 0;
        let count = 0;
        for (let sy = -1; sy <= 1; sy++) {
          for (let sx = -1; sx <= 1; sx++) {
            const ni = (py + sy) * canvas.width + (px + sx);
            if (ni >= 0 && ni < biomeMap.length) {
              sum += biomeMap[ni];
              count++;
            }
          }
        }
        biomeMap[idx] = Math.round(sum / count);
      } else {
        // Paint mode
        if (Math.random() < brushSettings.spacing) {
          biomeMap[idx] = Object.keys(BIOME_TYPES).indexOf(selectedBiome) + 1;
          ctx.fillStyle = biome.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        }
      }
      
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function fillArea(startX, startY, biomeKey) {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas || !biomeMap) return;
  
  const targetBiome = biomeMap[startY * canvas.width + startX];
  const newBiomeIdx = Object.keys(BIOME_TYPES).indexOf(biomeKey) + 1;
  
  if (targetBiome === newBiomeIdx) return;
  
  const stack = [[startX, startY]];
  const visited = new Set();
  const ctx = canvas.getContext('2d');
  const biome = BIOME_TYPES[biomeKey];
  
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    
    if (visited.has(key)) continue;
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
    
    const idx = y * canvas.width + x;
    if (biomeMap[idx] !== targetBiome) continue;
    
    visited.add(key);
    biomeMap[idx] = newBiomeIdx;
    
    ctx.fillStyle = biome.color;
    ctx.fillRect(x, y, 1, 1);
    
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  
  saveHistory();
}

function saveHistory() {
  if (!biomeMap) return;
  history = history.slice(0, historyIndex + 1);
  history.push(new Uint8Array(biomeMap));
  historyIndex = history.length - 1;
  
  if (history.length > MAX_HISTORY) {
    history.shift();
    historyIndex--;
  }
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  biomeMap = new Uint8Array(history[historyIndex]);
  redrawCanvas();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  biomeMap = new Uint8Array(history[historyIndex]);
  redrawCanvas();
}

function redrawCanvas() {
  const canvas = document.getElementById('biome-canvas');
  if (!canvas || !biomeMap) return;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const biomes = Object.values(BIOME_TYPES);
  
  for (let i = 0; i < biomeMap.length; i++) {
    if (biomeMap[i] > 0) {
      const biome = biomes[biomeMap[i] - 1];
      const hex = biome.color;
      imageData.data[i * 4] = parseInt(hex.slice(1, 3), 16);
      imageData.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      imageData.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      imageData.data[i * 4 + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function addToRecent(biomeKey) {
  const container = document.getElementById('recent-biomes');
  if (!container) return;
  
  const biome = BIOME_TYPES[biomeKey];
  const chip = document.createElement('button');
  chip.style.cssText = `width: 28px; height: 28px; background: ${biome.color}; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px;`;
  chip.textContent = biome.icon;
  chip.title = biome.name;
  chip.addEventListener('click', () => {
    selectedBiome = biomeKey;
    document.querySelectorAll('.biome-item').forEach(i => {
      i.style.background = i.dataset.biome === selectedBiome ? 'var(--bg-secondary)' : 'transparent';
      i.style.borderColor = i.dataset.biome === selectedBiome ? 'var(--accent)' : 'var(--border)';
    });
  });
  
  // Keep max 8 recent
  while (container.children.length >= 8) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(chip);
}

function applyBiomes() {
  if (!biomeMap) return;
  
  const biomeData = {
    map: Array.from(biomeMap),
    width: document.getElementById('biome-canvas')?.width || 0,
    height: document.getElementById('biome-canvas')?.height || 0,
    biomes: Object.keys(BIOME_TYPES)
  };
  
  window.parent?.postMessage({
    type: 'apply-biome-map',
    data: biomeData
  }, '*');
  
  window.dispatchEvent(new CustomEvent('biomes-applied', { detail: biomeData }));
}

function clearBiomes() {
  if (!biomeMap) return;
  biomeMap.fill(0);
  saveHistory();
  redrawCanvas();
}

export function destroy() {
  if (_keydownHandler) {
    window.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  biomeMap = null;
  history = [];
  historyIndex = -1;
}
