/**
 * Terrain Analytics — Analyze terrain properties and visualize statistics
 * Height distribution, slope analysis, flow maps, and terrain metrics
 */
import { bindToolButtons, runProgressSteps, downloadFile } from '../_shared/canvasUtils.js';

const ANALYSIS_TYPES = {
  height: {
    name: 'Height Distribution',
    icon: '📊',
    description: 'Analyze elevation distribution across terrain',
    color: '#4a9eff'
  },
  slope: {
    name: 'Slope Analysis',
    icon: '⛰️',
    description: 'Measure steepness and grade angles',
    color: '#ff6b4a'
  },
  aspect: {
    name: 'Aspect (Facing)',
    icon: '🧭',
    description: 'Determine which direction slopes face',
    color: '#4aff6b'
  },
  flow: {
    name: 'Water Flow',
    icon: '💧',
    description: 'Simulate water drainage paths',
    color: '#4a6bff'
  },
  roughness: {
    name: 'Surface Roughness',
    icon: '🔍',
    description: 'Measure terrain texture and detail',
    color: '#ffaa4a'
  },
  visibility: {
    name: 'Viewshed Analysis',
    icon: '👁️',
    description: 'Calculate visible areas from a point',
    color: '#ff4aaa'
  }
};

const TERRAIN_METRICS = {
  totalArea: { value: 0, unit: 'km²', label: 'Total Area' },
  avgElevation: { value: 0, unit: 'm', label: 'Avg Elevation' },
  maxElevation: { value: 0, unit: 'm', label: 'Max Elevation' },
  minElevation: { value: 0, unit: 'm', label: 'Min Elevation' },
  elevationRange: { value: 0, unit: 'm', label: 'Elevation Range' },
  avgSlope: { value: 0, unit: '°', label: 'Avg Slope' },
  maxSlope: { value: 0, unit: '°', label: 'Max Slope' },
  flatArea: { value: 0, unit: '%', label: 'Flat Area (<5°)' },
  steepArea: { value: 0, unit: '%', label: 'Steep Area (>30°)' },
  roughness: { value: 0, unit: '', label: 'Roughness Index' },
  symmetry: { value: 0, unit: '%', label: 'Symmetry Score' },
  drainage: { value: 0, unit: '', label: 'Drainage Density' }
};

let selectedAnalysis = 'height';
let analysisData = null;
let isAnalyzing = false;

export function render(container) {
  init(container);
}

export function init(container) {
  container.innerHTML = `
    <div class="terrain-analytics-panel" style="display: grid; grid-template-columns: 200px 1fr 280px; height: 100%; gap: 1px; background: var(--border);">
      <!-- Left: Analysis Types -->
      <div class="analysis-types" style="background: var(--bg-primary); padding: 12px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Analysis</h3>
        
        <div class="type-list" id="analysis-list">
          ${Object.entries(ANALYSIS_TYPES).map(([key, type]) => `
            <div class="analysis-item ${key === selectedAnalysis ? 'selected' : ''}" data-type="${key}"
              style="display: flex; align-items: center; gap: 8px; padding: 10px; margin-bottom: 4px;
                     background: ${key === selectedAnalysis ? 'var(--bg-secondary)' : 'transparent'};
                     border: 1px solid ${key === selectedAnalysis ? type.color : 'var(--border)'};
                     border-radius: 6px; cursor: pointer; transition: all 0.15s;">
              <span style="font-size: 18px;">${type.icon}</span>
              <div>
                <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">${type.name}</div>
                <div style="font-size: 10px; color: var(--text-secondary);">${type.description}</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <button id="run-analysis" style="width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; margin-bottom: 8px;">
            Run Analysis
          </button>
          <button id="export-results" style="width: 100%; padding: 8px; background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">
            Export Results
          </button>
        </div>
      </div>
      
      <!-- Center: Visualization -->
      <div class="visualization-area" style="background: var(--bg-secondary); position: relative; overflow: hidden;">
        <div class="viz-header" style="position: absolute; top: 10px; left: 10px; z-index: 10; display: flex; gap: 8px;">
          <div style="background: var(--bg-primary); padding: 6px 10px; border-radius: 4px; font-size: 11px; color: var(--text-secondary);">
            ${ANALYSIS_TYPES[selectedAnalysis].name}
          </div>
          <div id="viz-mode" style="display: flex; gap: 4px;">
            <button class="viz-btn active" data-viz="heatmap" style="padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 18px;">🗺️</button>
            <button class="viz-btn" data-viz="3d" style="padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 18px;">🏔️</button>
            <button class="viz-btn" data-viz="histogram" style="padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 18px;">📊</button>
            <button class="viz-btn" data-viz="contour" style="padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 18px;">〰️</button>
          </div>
        </div>
        
        <canvas id="analytics-canvas" style="width: 100%; height: 100%;"></canvas>
        
        <div class="viz-legend" id="viz-legend" style="position: absolute; bottom: 10px; right: 10px; background: var(--bg-primary); padding: 8px; border-radius: 4px;">
          <!-- Dynamic legend content -->
        </div>
        
        <div class="analysis-progress" id="analysis-progress" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-primary); padding: 20px; border-radius: 8px; text-align: center;">
          <div class="spinner" style="width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
          <div id="progress-text" style="font-size: 13px; color: var(--text-primary);">Analyzing terrain...</div>
          <div id="progress-percent" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">0%</div>
        </div>
        
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
      
      <!-- Right: Metrics & Stats -->
      <div class="metrics-panel" style="background: var(--bg-primary); padding: 16px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Terrain Metrics</h3>
        
        <div class="metrics-grid" id="metrics-grid">
          ${Object.entries(TERRAIN_METRICS).map(([key, metric]) => `
            <div class="metric-card" style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
              <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px;">${metric.label}</div>
              <div style="display: flex; align-items: baseline; gap: 4px;">
                <span class="metric-value" data-metric="${key}" style="font-size: 18px; font-weight: 600; color: var(--text-primary);">--</span>
                <span style="font-size: 11px; color: var(--text-secondary);">${metric.unit}</span>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">ELEVATION PROFILE</h4>
          <div style="background: var(--bg-secondary); border-radius: 6px; overflow: hidden; height: 120px;">
            <canvas id="profile-canvas" style="width: 100%; height: 100%;"></canvas>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 10px; color: var(--text-secondary);">
            <span>West</span>
            <span>Center Line</span>
            <span>East</span>
          </div>
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">SLOPE DISTRIBUTION</h4>
          <div style="background: var(--bg-secondary); border-radius: 6px; overflow: hidden; height: 100px;">
            <canvas id="slope-canvas" style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">BIOME BREAKDOWN</h4>
          <div id="biome-breakdown" style="space-y: 4px;">
            <!-- Dynamic biome data -->
          </div>
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">COMPARISON</h4>
          <div style="display: flex; gap: 6px;">
            <button id="compare-previous" style="flex: 1; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text-secondary);">
              Previous
            </button>
            <button id="compare-baseline" style="flex: 1; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text-secondary);">
              Baseline
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  initCanvas();
  setupEventListeners();
  generateSampleData();
}

function initCanvas() {
  const canvas = document.getElementById('analytics-canvas');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  drawAnalysisVisualization(ctx, canvas.width, canvas.height);
}

function drawAnalysisVisualization(ctx, width, height) {
  const type = ANALYSIS_TYPES[selectedAnalysis];
  
  switch (selectedAnalysis) {
    case 'height':
      drawHeightMap(ctx, width, height);
      break;
    case 'slope':
      drawSlopeMap(ctx, width, height);
      break;
    case 'aspect':
      drawAspectMap(ctx, width, height);
      break;
    case 'flow':
      drawFlowMap(ctx, width, height);
      break;
    case 'roughness':
      drawRoughnessMap(ctx, width, height);
      break;
    case 'visibility':
      drawViewshedMap(ctx, width, height);
      break;
  }
  
  updateLegend();
}

function drawHeightMap(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      
      let value = 0;
      value += Math.sin(nx * 5 + ny * 3) * 0.3;
      value += Math.sin(nx * 12 + ny * 8) * 0.15;
      value += Math.sin(nx * 25 + ny * 20) * 0.08;
      value = (value + 0.5);
      
      // Height color ramp
      const r = Math.floor(value * 100 + 50);
      const g = Math.floor(value * 150 + 50);
      const b = Math.floor(value * 80 + 50);
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function drawSlopeMap(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      
      // Calculate slope (gradient magnitude)
      const dx = Math.cos(nx * 10) * 0.5;
      const dy = Math.sin(ny * 10) * 0.5;
      const slope = Math.sqrt(dx * dx + dy * dy);
      
      // Color based on slope
      const r = Math.floor(slope * 255);
      const g = Math.floor((1 - slope) * 255);
      const b = 50;
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function drawAspectMap(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width - 0.5;
      const ny = y / height - 0.5;
      
      // Aspect (direction)
      const angle = Math.atan2(ny, nx);
      const normalized = (angle + Math.PI) / (2 * Math.PI);
      
      // HSV to RGB (simplified)
      const h = normalized;
      const s = 0.8;
      const v = 0.9;
      
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      
      let r, g, b;
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      
      data[idx] = Math.floor(r * 255);
      data[idx + 1] = Math.floor(g * 255);
      data[idx + 2] = Math.floor(b * 255);
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function drawFlowMap(ctx, width, height) {
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(0, 0, width, height);
  
  // Draw flow lines
  ctx.strokeStyle = 'rgba(74, 107, 255, 0.6)';
  ctx.lineWidth = 2;
  
  for (let i = 0; i < 50; i++) {
    let x = Math.random() * width;
    let y = Math.random() * height;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    for (let step = 0; step < 100; step++) {
      const nx = x / width;
      const ny = y / height;
      
      // Flow direction (downhill)
      const dx = -Math.sin(nx * 10 + ny * 5) * 5;
      const dy = -Math.cos(ny * 10 + nx * 5) * 5;
      
      x += dx;
      y += dy;
      
      if (x < 0 || x > width || y < 0 || y > height) break;
      
      ctx.lineTo(x, y);
    }
    
    ctx.stroke();
  }
}

function drawRoughnessMap(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      
      // Roughness (high frequency noise)
      let roughness = 0;
      roughness += Math.sin(nx * 50 + ny * 30) * 0.3;
      roughness += Math.sin(nx * 100 + ny * 80) * 0.2;
      roughness += Math.sin(nx * 200 + ny * 150) * 0.1;
      roughness = (roughness + 0.6) * 255;
      
      // Grayscale
      data[idx] = roughness;
      data[idx + 1] = roughness;
      data[idx + 2] = roughness;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function drawViewshedMap(ctx, width, height) {
  ctx.fillStyle = '#2a1a1a';
  ctx.fillRect(0, 0, width, height);
  
  // Observer point
  const ox = width * 0.5;
  const oy = height * 0.5;
  
  // Draw visibility rays
  ctx.strokeStyle = 'rgba(255, 74, 170, 0.3)';
  ctx.lineWidth = 1;
  
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    const rayLength = 200 + Math.random() * 100;
    const ex = ox + Math.cos(angle) * rayLength;
    const ey = oy + Math.sin(angle) * rayLength;
    
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  
  // Observer marker
  ctx.fillStyle = '#ff4aaa';
  ctx.beginPath();
  ctx.arc(ox, oy, 8, 0, Math.PI * 2);
  ctx.fill();
}

function updateLegend() {
  const legend = document.getElementById('viz-legend');
  if (!legend) return;
  
  const type = ANALYSIS_TYPES[selectedAnalysis];
  let html = `<div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px;">${type.name}</div>`;
  
  switch (selectedAnalysis) {
    case 'height':
      html += `
        <div style="display: flex; align-items: center; gap: 4px;">
          <div style="width: 60px; height: 10px; background: linear-gradient(to right, #326432, #96963c); border-radius: 2px;"></div>
          <span style="font-size: 9px;">Low → High</span>
        </div>
      `;
      break;
    case 'slope':
      html += `
        <div style="display: flex; align-items: center; gap: 4px;">
          <div style="width: 60px; height: 10px; background: linear-gradient(to right, #00ff00, #ff0000); border-radius: 2px;"></div>
          <span style="font-size: 9px;">Flat → Steep</span>
        </div>
      `;
      break;
    case 'aspect':
      html += `
        <div style="font-size: 9px; color: var(--text-secondary);">
          <div>N: Blue</div>
          <div>E: Green</div>
          <div>S: Yellow</div>
          <div>W: Red</div>
        </div>
      `;
      break;
  }
  
  legend.innerHTML = html;
}

function generateSampleData() {
  // Generate random terrain metrics
  Object.keys(TERRAIN_METRICS).forEach(key => {
    const metric = TERRAIN_METRICS[key];
    switch (key) {
      case 'totalArea':
        metric.value = (Math.random() * 50 + 10).toFixed(1);
        break;
      case 'avgElevation':
        metric.value = Math.floor(Math.random() * 500 + 100);
        break;
      case 'maxElevation':
        metric.value = Math.floor(Math.random() * 1000 + 500);
        break;
      case 'minElevation':
        metric.value = Math.floor(Math.random() * 100);
        break;
      case 'elevationRange':
        metric.value = TERRAIN_METRICS.maxElevation.value - TERRAIN_METRICS.minElevation.value;
        break;
      case 'avgSlope':
        metric.value = (Math.random() * 20 + 5).toFixed(1);
        break;
      case 'maxSlope':
        metric.value = (Math.random() * 40 + 30).toFixed(1);
        break;
      case 'flatArea':
        metric.value = Math.floor(Math.random() * 30 + 10);
        break;
      case 'steepArea':
        metric.value = Math.floor(Math.random() * 20 + 5);
        break;
      case 'roughness':
        metric.value = (Math.random() * 0.5 + 0.2).toFixed(2);
        break;
      case 'symmetry':
        metric.value = Math.floor(Math.random() * 40 + 30);
        break;
      case 'drainage':
        metric.value = (Math.random() * 2 + 0.5).toFixed(1);
        break;
    }
  });
  
  updateMetricsDisplay();
  drawElevationProfile();
  drawSlopeDistribution();
  updateBiomeBreakdown();
}

function updateMetricsDisplay() {
  Object.entries(TERRAIN_METRICS).forEach(([key, metric]) => {
    const el = document.querySelector(`[data-metric="${key}"]`);
    if (el) el.textContent = metric.value;
  });
}

function drawElevationProfile() {
  const canvas = document.getElementById('profile-canvas');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'var(--bg-tertiary)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw profile line
  ctx.strokeStyle = ANALYSIS_TYPES.height.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  for (let x = 0; x < canvas.width; x++) {
    const nx = x / canvas.width;
    let y = Math.sin(nx * Math.PI * 2) * 30 + Math.sin(nx * Math.PI * 4) * 15;
    y = canvas.height / 2 - y;
    
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  
  ctx.stroke();
  
  // Fill under curve
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
  ctx.fill();
}

function drawSlopeDistribution() {
  const canvas = document.getElementById('slope-canvas');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'var(--bg-tertiary)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw histogram
  const bins = 10;
  const barWidth = canvas.width / bins - 2;
  
  for (let i = 0; i < bins; i++) {
    const height = Math.random() * canvas.height * 0.8 + canvas.height * 0.1;
    const x = i * (barWidth + 2) + 1;
    const y = canvas.height - height;
    
    ctx.fillStyle = i < 3 ? '#4aff6b' : i < 7 ? '#ffaa4a' : '#ff6b4a';
    ctx.fillRect(x, y, barWidth, height);
  }
}

function updateBiomeBreakdown() {
  const container = document.getElementById('biome-breakdown');
  if (!container) return;
  
  const biomes = [
    { name: 'Grassland', percent: 35, color: '#4aff6b' },
    { name: 'Forest', percent: 28, color: '#2d5a27' },
    { name: 'Rocky', percent: 18, color: '#8a8a8a' },
    { name: 'Water', percent: 12, color: '#4a6bff' },
    { name: 'Snow', percent: 7, color: '#e0e8f0' }
  ];
  
  container.innerHTML = biomes.map(biome => `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
      <div style="width: 12px; height: 12px; background: ${biome.color}; border-radius: 2px;"></div>
      <div style="flex: 1; font-size: 11px; color: var(--text-primary);">${biome.name}</div>
      <div style="font-size: 11px; color: var(--text-secondary);">${biome.percent}%</div>
    </div>
    <div style="height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; margin-bottom: 8px;">
      <div style="height: 100%; width: ${biome.percent}%; background: ${biome.color}; border-radius: 2px;"></div>
    </div>
  `).join('');
}

function setupEventListeners() {
  // Analysis type selection
  document.querySelectorAll('.analysis-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedAnalysis = item.dataset.type;
      document.querySelectorAll('.analysis-item').forEach(i => {
        const type = ANALYSIS_TYPES[i.dataset.type];
        i.style.background = i.dataset.type === selectedAnalysis ? 'var(--bg-secondary)' : 'transparent';
        i.style.borderColor = i.dataset.type === selectedAnalysis ? type.color : 'var(--border)';
      });
      
      const canvas = document.getElementById('analytics-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawAnalysisVisualization(ctx, canvas.width, canvas.height);
      }
    });
  });
  
  // Visualization mode buttons
  bindToolButtons('.viz-btn', 'viz', () => {});
  
  // Run analysis button
  document.getElementById('run-analysis')?.addEventListener('click', runAnalysis);
  
  // Export results button
  document.getElementById('export-results')?.addEventListener('click', exportResults);
  
  // Comparison buttons
  document.getElementById('compare-previous')?.addEventListener('click', () => {
    // Compare with previous analysis
  });
  document.getElementById('compare-baseline')?.addEventListener('click', () => {
    // Compare with baseline
  });
}

async function runAnalysis() {
  isAnalyzing = true;
  const steps = [
    { text: 'Loading terrain data...', percent: 10 },
    { text: 'Computing gradients...', percent: 30 },
    { text: 'Analyzing features...', percent: 50 },
    { text: 'Generating visualizations...', percent: 70 },
    { text: 'Calculating statistics...', percent: 90 },
    { text: 'Analysis complete!', percent: 100 }
  ];

  await runProgressSteps('analysis-progress', 'progress-text', 'progress-percent', steps, () => {
    generateSampleData();
    const canvas = document.getElementById('analytics-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      drawAnalysisVisualization(ctx, canvas.width, canvas.height);
    }
    isAnalyzing = false;
  });
}

function exportResults() {
  const data = {
    analysisType: selectedAnalysis,
    metrics: TERRAIN_METRICS,
    timestamp: Date.now()
  };
  downloadFile(JSON.stringify(data, null, 2), `terrain_analysis_${selectedAnalysis}_${Date.now()}.json`, 'application/json');
}

export function destroy() {
  analysisData = null;
  isAnalyzing = false;
}
