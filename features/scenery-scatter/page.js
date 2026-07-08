/**
 * Scenery Scatter — Distribute objects across terrain using rules
 * Paint or procedurally place vegetation, rocks, structures, and decals
 */

const SCATTER_CATEGORIES = {
  vegetation: {
    name: 'Vegetation',
    icon: '🌿',
    items: [
      { id: 'tree-oak', name: 'Oak Tree', icon: '🌳', scale: [0.8, 1.2], density: 0.3 },
      { id: 'tree-pine', name: 'Pine Tree', icon: '🌲', scale: [0.7, 1.3], density: 0.5 },
      { id: 'tree-palm', name: 'Palm Tree', icon: '🌴', scale: [0.9, 1.1], density: 0.2 },
      { id: 'bush', name: 'Bush', icon: '🌿', scale: [0.5, 1.0], density: 0.8 },
      { id: 'grass-tall', name: 'Tall Grass', icon: '🌾', scale: [0.8, 1.2], density: 0.9 },
      { id: 'flower', name: 'Flowers', icon: '🌸', scale: [0.3, 0.7], density: 0.6 },
      { id: 'mushroom', name: 'Mushroom', icon: '🍄', scale: [0.4, 0.8], density: 0.4 }
    ]
  },
  rocks: {
    name: 'Rocks & Stones',
    icon: '🪨',
    items: [
      { id: 'rock-large', name: 'Boulder', icon: '🪨', scale: [1.0, 3.0], density: 0.1 },
      { id: 'rock-medium', name: 'Rock', icon: '🪨', scale: [0.5, 1.5], density: 0.3 },
      { id: 'rock-small', name: 'Pebbles', icon: '⚪', scale: [0.2, 0.5], density: 0.6 },
      { id: 'crystal', name: 'Crystal', icon: '💎', scale: [0.5, 2.0], density: 0.05 },
      { id: 'cliff', name: 'Cliff Rock', icon: '⛰️', scale: [2.0, 5.0], density: 0.02 }
    ]
  },
  structures: {
    name: 'Structures',
    icon: '🏠',
    items: [
      { id: 'house', name: 'House', icon: '🏠', scale: [1.0, 1.0], density: 0.01 },
      { id: 'tower', name: 'Tower', icon: '🗼', scale: [1.0, 1.0], density: 0.005 },
      { id: 'bridge', name: 'Bridge', icon: '🌉', scale: [1.0, 1.0], density: 0.002 },
      { id: 'ruins', name: 'Ruins', icon: '🏛️', scale: [1.0, 2.0], density: 0.008 },
      { id: 'camp', name: 'Camp', icon: '⛺', scale: [1.0, 1.0], density: 0.005 },
      { id: 'fence', name: 'Fence', icon: '🏗️', scale: [1.0, 1.0], density: 0.03 }
    ]
  },
  props: {
    name: 'Props',
    icon: '📦',
    items: [
      { id: 'barrel', name: 'Barrel', icon: '🛢️', scale: [0.8, 1.0], density: 0.1 },
      { id: 'crate', name: 'Crate', icon: '📦', scale: [0.8, 1.2], density: 0.1 },
      { id: 'lantern', name: 'Lantern', icon: '🏮', scale: [0.5, 0.8], density: 0.05 },
      { id: 'sign', name: 'Signpost', icon: '🪧', scale: [1.0, 1.0], density: 0.02 },
      { id: 'cart', name: 'Cart', icon: '🛒', scale: [1.0, 1.0], density: 0.01 }
    ]
  },
  effects: {
    name: 'Effects',
    icon: '✨',
    items: [
      { id: 'fireflies', name: 'Fireflies', icon: '✨', scale: [1.0, 1.0], density: 0.4 },
      { id: 'dust', name: 'Dust Particles', icon: '💨', scale: [1.0, 1.0], density: 0.6 },
      { id: 'mist', name: 'Ground Mist', icon: '🌫️', scale: [1.0, 1.0], density: 0.2 },
      { id: 'leaves', name: 'Falling Leaves', icon: '🍂', scale: [1.0, 1.0], density: 0.3 }
    ]
  }
};

const SCATTER_RULES = {
  minSlope: 0,
  maxSlope: 45,
  minHeight: 0,
  maxHeight: 1,
  minScale: 0.5,
  maxScale: 2.0,
  alignToNormal: true,
  randomRotation: true,
  randomScale: true,
  collisionRadius: 5,
  density: 0.5,
  seed: Date.now()
};

let selectedCategory = 'vegetation';
let selectedItem = SCATTER_CATEGORIES[selectedCategory].items[0]?.id || null;
let scatterRules = { ...SCATTER_RULES };
let scatteredObjects = [];
let isScattering = false;

export function render(container) {
  init(container);
}

export function init(container) {
  container.innerHTML = `
    <div class="scenery-scatter-panel" style="display: grid; grid-template-columns: 220px 1fr 240px; height: 100%; gap: 1px; background: var(--border);">
      <!-- Left: Categories & Items -->
      <div class="scatter-palette" style="background: var(--bg-primary); padding: 12px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Scatter Objects</h3>
        
        <!-- Category tabs -->
        <div class="category-tabs" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;">
          ${Object.entries(SCATTER_CATEGORIES).map(([key, cat]) => `
            <button class="cat-tab ${key === selectedCategory ? 'active' : ''}" data-category="${key}"
              style="padding: 6px 8px; background: ${key === selectedCategory ? 'var(--accent)' : 'var(--bg-secondary)'};
                     color: ${key === selectedCategory ? 'white' : 'var(--text-secondary)'};
                     border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 16px;"
              title="${cat.name}">${cat.icon}</button>
          `).join('')}
        </div>
        
        <!-- Item list -->
        <div class="item-list" id="item-list">
          ${SCATTER_CATEGORIES[selectedCategory].items.map((item, i) => `
            <div class="scatter-item ${i === 0 ? 'selected' : ''}" data-item-id="${item.id}"
              style="display: flex; align-items: center; gap: 8px; padding: 8px; margin-bottom: 4px;
                     background: ${i === 0 ? 'var(--bg-secondary)' : 'transparent'};
                     border: 1px solid ${i === 0 ? 'var(--accent)' : 'transparent'};
                     border-radius: 4px; cursor: pointer;">
              <span style="font-size: 20px;">${item.icon}</span>
              <div>
                <div style="font-size: 12px; color: var(--text-primary);">${item.name}</div>
                <div style="font-size: 10px; color: var(--text-secondary);">Density: ${(item.density * 100).toFixed(0)}%</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Center: Preview Canvas -->
      <div class="scatter-canvas-area" style="background: var(--bg-secondary); position: relative; overflow: hidden;">
        <canvas id="scatter-canvas" style="width: 100%; height: 100%; cursor: crosshair;"></canvas>
        
        <div class="canvas-tools" style="position: absolute; top: 10px; left: 10px; display: flex; gap: 6px;">
          <button class="scatter-mode active" data-mode="paint" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Paint scatter">🖌️</button>
          <button class="scatter-mode" data-mode="erase" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Erase">🧹</button>
          <button class="scatter-mode" data-mode="select" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Select">👆</button>
          <div style="width: 1px; background: var(--border);"></div>
          <button id="scatter-undo" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">↩️</button>
          <button id="scatter-redo" style="padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">↪️</button>
        </div>
        
        <div class="scatter-info" style="position: absolute; bottom: 10px; left: 10px; background: var(--bg-primary); padding: 6px 10px; border-radius: 4px; font-size: 11px; color: var(--text-secondary);">
          Objects: <span id="object-count">0</span> | Selected: <span id="selected-count">0</span>
        </div>
      </div>
      
      <!-- Right: Rules & Settings -->
      <div class="scatter-rules" style="background: var(--bg-primary); padding: 12px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Scatter Rules</h3>
        
        <div class="rule-group" style="margin-bottom: 16px;">
          <h4 style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">TERRAIN FILTERS</h4>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Min Slope: <span id="min-slope-val">${scatterRules.minSlope}°</span></span>
            <input type="range" id="min-slope" min="0" max="90" value="${scatterRules.minSlope}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Max Slope: <span id="max-slope-val">${scatterRules.maxSlope}°</span></span>
            <input type="range" id="max-slope" min="0" max="90" value="${scatterRules.maxSlope}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Min Height: <span id="min-height-val">${(scatterRules.minHeight * 100).toFixed(0)}%</span></span>
            <input type="range" id="min-height" min="0" max="100" value="${scatterRules.minHeight * 100}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Max Height: <span id="max-height-val">${(scatterRules.maxHeight * 100).toFixed(0)}%</span></span>
            <input type="range" id="max-height" min="0" max="100" value="${scatterRules.maxHeight * 100}" style="width: 100%;">
          </label>
        </div>
        
        <div class="rule-group" style="margin-bottom: 16px;">
          <h4 style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">TRANSFORM</h4>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Min Scale: <span id="min-scale-val">${scatterRules.minScale.toFixed(1)}</span></span>
            <input type="range" id="min-scale" min="0.1" max="5" step="0.1" value="${scatterRules.minScale}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Max Scale: <span id="max-scale-val">${scatterRules.maxScale.toFixed(1)}</span></span>
            <input type="range" id="max-scale" min="0.1" max="10" step="0.1" value="${scatterRules.maxScale}" style="width: 100%;">
          </label>
          
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary);">
              <input type="checkbox" id="align-normal" ${scatterRules.alignToNormal ? 'checked' : ''}> Align to Normal
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary);">
              <input type="checkbox" id="random-rotation" ${scatterRules.randomRotation ? 'checked' : ''}> Random Rotation
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary);">
              <input type="checkbox" id="random-scale" ${scatterRules.randomScale ? 'checked' : ''}> Random Scale
            </label>
          </div>
        </div>
        
        <div class="rule-group" style="margin-bottom: 16px;">
          <h4 style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">DISTRIBUTION</h4>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Density: <span id="density-val">${(scatterRules.density * 100).toFixed(0)}%</span></span>
            <input type="range" id="density" min="0" max="100" value="${scatterRules.density * 100}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Collision Radius: <span id="collision-val">${scatterRules.collisionRadius}</span></span>
            <input type="range" id="collision-radius" min="1" max="50" value="${scatterRules.collisionRadius}" style="width: 100%;">
          </label>
          
          <label style="display: block; margin-bottom: 8px;">
            <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">Seed: </span>
            <div style="display: flex; gap: 4px;">
              <input type="number" id="scatter-seed" value="${scatterRules.seed}" style="flex: 1; padding: 6px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-size: 11px;">
              <button id="randomize-seed" style="padding: 6px 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">🎲</button>
            </div>
          </label>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 16px;">
          <button id="auto-scatter" style="padding: 10px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Auto Scatter</button>
          <button id="clear-scattered" style="padding: 8px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">Clear All</button>
          <button id="export-scattered" style="padding: 8px; background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 6px; cursor: pointer; font-size: 12px;">Export Placement</button>
        </div>
      </div>
    </div>
  `;

  initCanvas();
  setupEventListeners();
}

function initCanvas() {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw terrain representation
  drawTerrainPreview(ctx, canvas.width, canvas.height);
}

function drawTerrainPreview(ctx, width, height) {
  // Simple terrain visualization
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#4a7a4a');
  gradient.addColorStop(0.3, '#3a6a3a');
  gradient.addColorStop(0.6, '#2a5a2a');
  gradient.addColorStop(1, '#1a4a1a');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add some terrain contours
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < width; x += 10) {
      ctx.lineTo(x, y + Math.sin(x * 0.02) * 10);
    }
    ctx.stroke();
  }
}

function setupEventListeners() {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas) return;
  
  // Category tabs
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedCategory = tab.dataset.category;
      document.querySelectorAll('.cat-tab').forEach(t => {
        t.style.background = t.dataset.category === selectedCategory ? 'var(--accent)' : 'var(--bg-secondary)';
        t.style.color = t.dataset.category === selectedCategory ? 'white' : 'var(--text-secondary)';
      });
      updateItemList();
    });
  });
  
  // Scatter mode buttons
  document.querySelectorAll('.scatter-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scatter-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Canvas events
  canvas.addEventListener('mousedown', startScattering);
  canvas.addEventListener('mousemove', (e) => {
    if (isScattering) scatterAtPoint(e);
  });
  canvas.addEventListener('mouseup', () => { isScattering = false; });
  canvas.addEventListener('mouseleave', () => { isScattering = false; });
  
  // Rule sliders
  setupSlider('min-slope', 'minSlope', v => `${v}°`);
  setupSlider('max-slope', 'maxSlope', v => `${v}°`);
  setupSlider('min-height', 'minHeight', v => `${v}%`, 100);
  setupSlider('max-height', 'maxHeight', v => `${v}%`, 100);
  setupSlider('min-scale', 'minScale', v => v.toFixed(1));
  setupSlider('max-scale', 'maxScale', v => v.toFixed(1));
  setupSlider('density', 'density', v => `${v}%`, 100);
  setupSlider('collision-radius', 'collisionRadius', v => v.toString());
  
  // Checkboxes
  document.getElementById('align-normal')?.addEventListener('change', (e) => {
    scatterRules.alignToNormal = e.target.checked;
  });
  document.getElementById('random-rotation')?.addEventListener('change', (e) => {
    scatterRules.randomRotation = e.target.checked;
  });
  document.getElementById('random-scale')?.addEventListener('change', (e) => {
    scatterRules.randomScale = e.target.checked;
  });
  
  // Seed
  document.getElementById('scatter-seed')?.addEventListener('change', (e) => {
    scatterRules.seed = parseInt(e.target.value) || Date.now();
  });
  document.getElementById('randomize-seed')?.addEventListener('click', () => {
    scatterRules.seed = Date.now();
    document.getElementById('scatter-seed').value = scatterRules.seed;
  });
  
  // Action buttons
  document.getElementById('auto-scatter')?.addEventListener('click', autoScatter);
  document.getElementById('clear-scattered')?.addEventListener('click', clearScattered);
  document.getElementById('export-scattered')?.addEventListener('click', exportPlacement);
}

function setupSlider(id, ruleKey, formatter, divisor = 1) {
  const input = document.getElementById(id);
  const display = document.getElementById(`${id}-val`);
  if (!input) return;
  
  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    scatterRules[ruleKey] = divisor ? val / divisor : val;
    if (display) display.textContent = formatter(val);
  });
}

function updateItemList() {
  const container = document.getElementById('item-list');
  if (!container) return;
  
  const category = SCATTER_CATEGORIES[selectedCategory];
  container.innerHTML = category.items.map((item, i) => `
    <div class="scatter-item ${i === 0 ? 'selected' : ''}" data-item-id="${item.id}"
      style="display: flex; align-items: center; gap: 8px; padding: 8px; margin-bottom: 4px;
             background: ${i === 0 ? 'var(--bg-secondary)' : 'transparent'};
             border: 1px solid ${i === 0 ? 'var(--accent)' : 'transparent'};
             border-radius: 4px; cursor: pointer;">
      <span style="font-size: 20px;">${item.icon}</span>
      <div>
        <div style="font-size: 12px; color: var(--text-primary);">${item.name}</div>
        <div style="font-size: 10px; color: var(--text-secondary);">Density: ${(item.density * 100).toFixed(0)}%</div>
      </div>
    </div>
  `).join('');
  
  selectedItem = category.items[0]?.id || null;
  
  container.querySelectorAll('.scatter-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedItem = item.dataset.itemId;
      container.querySelectorAll('.scatter-item').forEach(i => {
        i.style.background = i.dataset.itemId === selectedItem ? 'var(--bg-secondary)' : 'transparent';
        i.style.borderColor = i.dataset.itemId === selectedItem ? 'var(--accent)' : 'transparent';
      });
    });
  });
}

function startScattering(e) {
  isScattering = true;
  scatterAtPoint(e);
}

function scatterAtPoint(e) {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const ctx = canvas.getContext('2d');
  const category = SCATTER_CATEGORIES[selectedCategory];
  const item = category.items.find(i => i.id === selectedItem);
  if (!item) return;
  
  // Apply density
  if (Math.random() > scatterRules.density) return;
  
  // Calculate scale
  let scale = 1;
  if (scatterRules.randomScale) {
    scale = scatterRules.minScale + Math.random() * (scatterRules.maxScale - scatterRules.minScale);
  }
  
  // Add jitter
  const jitterX = (Math.random() - 0.5) * 20;
  const jitterY = (Math.random() - 0.5) * 20;
  
  const finalX = x + jitterX;
  const finalY = y + jitterY;
  
  // Draw object representation
  const size = 10 * scale;
  ctx.save();
  ctx.translate(finalX, finalY);
  
  if (scatterRules.randomRotation) {
    ctx.rotate(Math.random() * Math.PI * 2);
  }
  
  ctx.font = `${size * 2}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.icon, 0, 0);
  ctx.restore();
  
  // Store scattered object
  scatteredObjects.push({
    id: Date.now() + Math.random(),
    itemId: item.id,
    category: selectedCategory,
    x: finalX,
    y: finalY,
    scale,
    rotation: scatterRules.randomRotation ? Math.random() * Math.PI * 2 : 0
  });
  
  updateObjectCount();
}

function autoScatter() {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const category = SCATTER_CATEGORIES[selectedCategory];
  const item = category.items.find(i => i.id === selectedItem);
  if (!item) return;
  
  const cellSize = scatterRules.collisionRadius * 2;
  const cols = Math.ceil(canvas.width / cellSize);
  const rows = Math.ceil(canvas.height / cellSize);
  
  // Simple seeded random
  let seed = scatterRules.seed;
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (seededRandom() > scatterRules.density) continue;
      
      const x = col * cellSize + cellSize / 2 + (seededRandom() - 0.5) * cellSize * 0.5;
      const y = row * cellSize + cellSize / 2 + (seededRandom() - 0.5) * cellSize * 0.5;
      
      let scale = 1;
      if (scatterRules.randomScale) {
        scale = scatterRules.minScale + seededRandom() * (scatterRules.maxScale - scatterRules.minScale);
      }
      
      const size = 10 * scale;
      ctx.save();
      ctx.translate(x, y);
      if (scatterRules.randomRotation) {
        ctx.rotate(seededRandom() * Math.PI * 2);
      }
      ctx.font = `${size * 2}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, 0, 0);
      ctx.restore();
      
      scatteredObjects.push({
        id: Date.now() + Math.random(),
        itemId: item.id,
        category: selectedCategory,
        x, y, scale,
        rotation: scatterRules.randomRotation ? seededRandom() * Math.PI * 2 : 0
      });
    }
  }
  
  updateObjectCount();
}

function clearScattered() {
  scatteredObjects = [];
  initCanvas();
  updateObjectCount();
}

function exportPlacement() {
  const data = {
    objects: scatteredObjects,
    rules: scatterRules,
    timestamp: Date.now()
  };
  
  window.parent?.postMessage({
    type: 'export-scatter-placement',
    data
  }, '*');
  
  window.dispatchEvent(new CustomEvent('scatter-exported', { detail: data }));
}

function updateObjectCount() {
  const countEl = document.getElementById('object-count');
  if (countEl) countEl.textContent = scatteredObjects.length;
}

export function destroy() {
  scatteredObjects = [];
}
