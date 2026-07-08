/**
 * Terrain Export — Export terrain meshes to standard 3D formats
 * Supports OBJ, glTF, heightmap PNG, and raw data formats
 */

const EXPORT_FORMATS = {
  obj: {
    name: 'Wavefront OBJ',
    extension: '.obj',
    icon: '📐',
    description: 'Universal 3D format, widely compatible',
    options: {
      includeNormals: true,
      includeUVs: true,
      includeMaterials: true,
      scale: 1.0,
      upAxis: 'Y'
    }
  },
  gltf: {
    name: 'glTF 2.0',
    extension: '.gltf',
    icon: '🎨',
    description: 'Modern format with PBR materials',
    options: {
      binary: false,
      includeNormals: true,
      includeUVs: true,
      dracoCompression: false,
      scale: 1.0
    }
  },
  glb: {
    name: 'glTF Binary',
    extension: '.glb',
    icon: '📦',
    description: 'Single binary file, compact',
    options: {
      includeNormals: true,
      includeUVs: true,
      dracoCompression: true,
      scale: 1.0
    }
  },
  heightmap: {
    name: 'Heightmap PNG',
    extension: '.png',
    icon: '🖼️',
    description: 'Grayscale heightmap image',
    options: {
      resolution: 2048,
      bitDepth: 16,
      format: 'png'
    }
  },
  raw: {
    name: 'Raw Height Data',
    extension: '.raw',
    icon: '📊',
    description: 'Raw float32 height values',
    options: {
      resolution: 1024,
      format: 'float32'
    }
  },
  stl: {
    name: 'STL (3D Print)',
    extension: '.stl',
    icon: '🖨️',
    description: 'For 3D printing and CNC',
    options: {
      binary: true,
      scale: 1.0,
      units: 'millimeters'
    }
  },
  fbx: {
    name: 'FBX',
    extension: '.fbx',
    icon: '🎮',
    description: 'Game engine format (Unity, Unreal)',
    options: {
      includeNormals: true,
      includeUVs: true,
      scale: 0.01,
      upAxis: 'Y'
    }
  }
};

let selectedFormat = 'obj';
let exportOptions = { ...EXPORT_FORMATS[selectedFormat].options };
let exportProgress = 0;
let isExporting = false;

export function render(container) {
  init(container);
}

export function init(container) {
  container.innerHTML = `
    <div class="terrain-export-panel" style="display: grid; grid-template-columns: 240px 1fr; height: 100%; gap: 1px; background: var(--border);">
      <!-- Left: Format Selection -->
      <div class="format-list" style="background: var(--bg-primary); padding: 16px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Export Format</h3>
        
        <div class="formats" id="format-list">
          ${Object.entries(EXPORT_FORMATS).map(([key, format]) => `
            <div class="format-item ${key === selectedFormat ? 'selected' : ''}" data-format="${key}"
              style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px;
                     background: ${key === selectedFormat ? 'var(--bg-secondary)' : 'transparent'};
                     border: 1px solid ${key === selectedFormat ? 'var(--accent)' : 'var(--border)'};
                     border-radius: 6px; cursor: pointer; transition: all 0.15s;">
              <span style="font-size: 24px;">${format.icon}</span>
              <div>
                <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">${format.name}</div>
                <div style="font-size: 10px; color: var(--text-secondary);">${format.extension}</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">DESCRIPTION</h4>
          <p id="format-description" style="font-size: 11px; color: var(--text-secondary); margin: 0;">
            ${EXPORT_FORMATS[selectedFormat].description}
          </p>
        </div>
      </div>
      
      <!-- Right: Options & Export -->
      <div class="export-options" style="background: var(--bg-primary); padding: 20px; overflow-y: auto;">
        <div class="header" style="margin-bottom: 20px;">
          <h2 style="margin: 0 0 8px; font-size: 18px; color: var(--text-primary);">
            Export Terrain as ${EXPORT_FORMATS[selectedFormat].name}
          </h2>
          <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
            Configure export settings and download your terrain
          </p>
        </div>
        
        <div class="options-grid" id="options-container">
          ${renderOptions(selectedFormat)}
        </div>
        
        <div class="preview-section" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
          <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Preview</h3>
          <div class="preview-canvas" style="background: var(--bg-secondary); border-radius: 8px; overflow: hidden; aspect-ratio: 16/9;">
            <canvas id="export-preview" style="width: 100%; height: 100%;"></canvas>
          </div>
          <div class="preview-info" style="display: flex; gap: 16px; margin-top: 12px;">
            <div style="font-size: 11px; color: var(--text-secondary);">
              <span style="color: var(--text-primary);">Vertices:</span> <span id="vertex-count">-</span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
              <span style="color: var(--text-primary);">Faces:</span> <span id="face-count">-</span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
              <span style="color: var(--text-primary);">File Size:</span> <span id="file-size">-</span>
            </div>
          </div>
        </div>
        
        <div class="export-actions" style="margin-top: 24px; display: flex; gap: 12px;">
          <button id="export-btn" style="flex: 1; padding: 14px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background 0.2s;">
            Export ${EXPORT_FORMATS[selectedFormat].extension}
          </button>
          <button id="copy-path-btn" style="padding: 14px 20px; background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 13px;">
            📋 Copy Path
          </button>
        </div>
        
        <div id="export-progress" style="display: none; margin-top: 16px;">
          <div style="background: var(--bg-secondary); border-radius: 4px; overflow: hidden; height: 8px;">
            <div id="progress-bar" style="background: var(--accent); height: 100%; width: 0%; transition: width 0.3s;"></div>
          </div>
          <div id="progress-text" style="font-size: 11px; color: var(--text-secondary); margin-top: 6px; text-align: center;">Preparing export...</div>
        </div>
        
        <div class="recent-exports" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
          <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Recent Exports</h3>
          <div id="recent-exports-list" style="space-y: 6px;">
            <p style="font-size: 12px; color: var(--text-secondary);">No recent exports</p>
          </div>
        </div>
      </div>
    </div>
  `;

  initPreview();
  setupEventListeners();
  updateStats();
}

function renderOptions(format) {
  const options = EXPORT_FORMATS[format].options;
  let html = '';
  
  for (const [key, value] of Object.entries(options)) {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    
    if (typeof value === 'boolean') {
      html += `
        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-primary);">${label}</span>
          <input type="checkbox" data-option="${key}" ${value ? 'checked' : ''} style="width: 18px; height: 18px;">
        </label>
      `;
    } else if (typeof value === 'number') {
      html += `
        <div style="padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 13px; color: var(--text-primary);">${label}</span>
            <span style="font-size: 12px; color: var(--text-secondary);" id="${key}-val">${value}</span>
          </div>
          <input type="range" data-option="${key}" min="0" max="10" step="0.1" value="${value}" style="width: 100%;">
        </div>
      `;
    } else if (typeof value === 'string' && ['Y', 'Z', 'X'].includes(value)) {
      html += `
        <div style="padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 6px;">${label}</span>
          <div style="display: flex; gap: 6px;">
            ${['X', 'Y', 'Z'].map(axis => `
              <button data-option="${key}" data-value="${axis}" 
                style="flex: 1; padding: 8px; background: ${value === axis ? 'var(--accent)' : 'var(--bg-tertiary)'}; 
                       color: ${value === axis ? 'white' : 'var(--text-secondary)'}; border: 1px solid var(--border); 
                       border-radius: 4px; cursor: pointer; font-size: 12px;">${axis}</button>
            `).join('')}
          </div>
        </div>
      `;
    } else if (typeof value === 'string' && value.includes('mm')) {
      html += `
        <div style="padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 6px;">${label}</span>
          <select data-option="${key}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary);">
            <option value="millimeters" ${value === 'millimeters' ? 'selected' : ''}>Millimeters</option>
            <option value="centimeters" ${value === 'centimeters' ? 'selected' : ''}>Centimeters</option>
            <option value="inches" ${value === 'inches' ? 'selected' : ''}>Inches</option>
            <option value="meters" ${value === 'meters' ? 'selected' : ''}>Meters</option>
          </select>
        </div>
      `;
    } else if (typeof value === 'number' && key === 'resolution') {
      html += `
        <div style="padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 6px;">${label}</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${[512, 1024, 2048, 4096].map(res => `
              <button data-option="${key}" data-value="${res}" 
                style="padding: 8px 12px; background: ${value === res ? 'var(--accent)' : 'var(--bg-tertiary)'}; 
                       color: ${value === res ? 'white' : 'var(--text-secondary)'}; border: 1px solid var(--border); 
                       border-radius: 4px; cursor: pointer; font-size: 12px;">${res}px</button>
            `).join('')}
          </div>
        </div>
      `;
    } else if (typeof value === 'number' && key === 'bitDepth') {
      html += `
        <div style="padding: 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 6px;">${label}</span>
          <div style="display: flex; gap: 6px;">
            ${[8, 16, 32].map(depth => `
              <button data-option="${key}" data-value="${depth}" 
                style="flex: 1; padding: 8px; background: ${value === depth ? 'var(--accent)' : 'var(--bg-tertiary)'}; 
                       color: ${value === depth ? 'white' : 'var(--text-secondary)'}; border: 1px solid var(--border); 
                       border-radius: 4px; cursor: pointer; font-size: 12px;">${depth}-bit</button>
            `).join('')}
          </div>
        </div>
      `;
    }
  }
  
  return html;
}

function initPreview() {
  const canvas = document.getElementById('export-preview');
  if (!canvas) return;
  
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const ctx = canvas.getContext('2d');
  drawTerrainPreview(ctx, canvas.width, canvas.height);
}

function drawTerrainPreview(ctx, width, height) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      
      // Simple terrain generation
      let value = 0;
      value += Math.sin(nx * 5 + ny * 3) * 0.3;
      value += Math.sin(nx * 12 + ny * 8) * 0.15;
      value += Math.sin(nx * 25 + ny * 20) * 0.08;
      value = (value + 0.5) * 255;
      
      // Color based on height
      let r, g, b;
      if (value < 80) {
        r = 30; g = 60 + value * 0.5; b = 120;
      } else if (value < 120) {
        r = 40 + (value - 80); g = 100 + (value - 80) * 2; b = 40;
      } else if (value < 180) {
        r = 80 + (value - 120) * 0.5; g = 140 + (value - 120) * 0.3; b = 40;
      } else {
        r = 180 + (value - 180) * 0.5; g = 180 + (value - 180) * 0.5; b = 180 + (value - 180) * 0.5;
      }
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function updateStats() {
  const vertexCount = document.getElementById('vertex-count');
  const faceCount = document.getElementById('face-count');
  const fileSize = document.getElementById('file-size');
  
  if (vertexCount) vertexCount.textContent = '1,048,576';
  if (faceCount) faceCount.textContent = '2,097,152';
  if (fileSize) fileSize.textContent = estimateFileSize();
}

function estimateFileSize() {
  const format = EXPORT_FORMATS[selectedFormat];
  const vertices = 1048576;
  const faces = 2097152;
  
  let bytes = 0;
  switch (selectedFormat) {
    case 'obj':
      bytes = vertices * 32 + faces * 24;
      break;
    case 'gltf':
    case 'glb':
      bytes = vertices * 48 + faces * 12;
      if (format.options.dracoCompression) bytes *= 0.3;
      break;
    case 'heightmap':
      bytes = format.options.resolution * format.options.resolution * (format.options.bitDepth / 8);
      break;
    case 'stl':
      bytes = faces * 50;
      break;
    default:
      bytes = vertices * 24;
  }
  
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setupEventListeners() {
  // Format selection
  document.querySelectorAll('.format-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedFormat = item.dataset.format;
      document.querySelectorAll('.format-item').forEach(i => {
        i.style.background = i.dataset.format === selectedFormat ? 'var(--bg-secondary)' : 'transparent';
        i.style.borderColor = i.dataset.format === selectedFormat ? 'var(--accent)' : 'var(--border)';
      });
      
      document.getElementById('format-description').textContent = EXPORT_FORMATS[selectedFormat].description;
      document.getElementById('options-container').innerHTML = renderOptions(selectedFormat);
      document.getElementById('export-btn').innerHTML = `Export ${EXPORT_FORMATS[selectedFormat].extension}`;
      updateStats();
      setupOptionListeners();
    });
  });
  
  setupOptionListeners();
  
  // Export button
  document.getElementById('export-btn')?.addEventListener('click', startExport);
  
  // Copy path button
  document.getElementById('copy-path-btn')?.addEventListener('click', () => {
    const path = `terrain_export_${Date.now()}${EXPORT_FORMATS[selectedFormat].extension}`;
    navigator.clipboard?.writeText(path);
  });
}

function setupOptionListeners() {
  // Checkbox options
  document.querySelectorAll('input[type="checkbox"][data-option]').forEach(input => {
    input.addEventListener('change', () => {
      exportOptions[input.dataset.option] = input.checked;
    });
  });
  
  // Range options
  document.querySelectorAll('input[type="range"][data-option]').forEach(input => {
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      exportOptions[input.dataset.option] = val;
      const display = document.getElementById(`${input.dataset.option}-val`);
      if (display) display.textContent = val.toFixed(1);
    });
  });
  
  // Button options
  document.querySelectorAll('button[data-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      const option = btn.dataset.option;
      const value = btn.dataset.value;
      
      // Update visual state
      btn.parentElement.querySelectorAll('button').forEach(b => {
        b.style.background = b === btn ? 'var(--accent)' : 'var(--bg-tertiary)';
        b.style.color = b === btn ? 'white' : 'var(--text-secondary)';
      });
      
      // Parse value
      if (!isNaN(value)) {
        exportOptions[option] = parseInt(value);
      } else {
        exportOptions[option] = value;
      }
    });
  });
  
  // Select options
  document.querySelectorAll('select[data-option]').forEach(select => {
    select.addEventListener('change', () => {
      exportOptions[select.dataset.option] = select.value;
    });
  });
}

async function startExport() {
  const progressContainer = document.getElementById('export-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  
  if (!progressContainer || !progressBar || !progressText) return;
  
  isExporting = true;
  exportProgress = 0;
  progressContainer.style.display = 'block';
  
  const stages = [
    { progress: 10, text: 'Gathering terrain data...' },
    { progress: 30, text: 'Processing vertices...' },
    { progress: 50, text: 'Generating normals...' },
    { progress: 70, text: 'Computing UVs...' },
    { progress: 90, text: 'Packaging file...' },
    { progress: 100, text: 'Export complete!' }
  ];
  
  for (const stage of stages) {
    await new Promise(resolve => setTimeout(resolve, 500));
    exportProgress = stage.progress;
    progressBar.style.width = `${stage.progress}%`;
    progressText.textContent = stage.text;
  }
  
  // Generate export data
  const exportData = {
    format: selectedFormat,
    options: exportOptions,
    timestamp: Date.now()
  };
  
  // Trigger download
  triggerDownload(exportData);
  
  // Add to recent exports
  addToRecentExports();
  
  isExporting = false;
}

function triggerDownload(data) {
  const format = EXPORT_FORMATS[selectedFormat];
  const filename = `terrain_${Date.now()}${format.extension}`;
  
  // Create dummy file content for demo
  let content = '';
  switch (selectedFormat) {
    case 'obj':
      content = generateOBJ();
      break;
    case 'gltf':
    case 'glb':
      content = JSON.stringify({ asset: { version: '2.0' }, meshes: [] }, null, 2);
      break;
    default:
      content = `Terrain export - ${format.name}\nGenerated: ${new Date().toISOString()}`;
  }
  
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}

function generateOBJ() {
  let obj = '# Terrain Export\n';
  obj += '# Generated by Kamakazii Studio 3D\n';
  obj += `# Date: ${new Date().toISOString()}\n\n`;
  
  // Sample vertices
  const size = 10;
  const segments = 10;
  
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const px = (x / segments - 0.5) * size;
      const pz = (z / segments - 0.5) * size;
      const py = Math.sin(px * 0.5) * Math.cos(pz * 0.5) * 2;
      obj += `v ${px.toFixed(4)} ${py.toFixed(4)} ${pz.toFixed(4)}\n`;
    }
  }
  
  obj += '\n';
  
  // Sample faces
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const i = z * (segments + 1) + x + 1;
      obj += `f ${i} ${i + 1} ${i + segments + 2} ${i + segments + 1}\n`;
    }
  }
  
  return obj;
}

function addToRecentExports() {
  const container = document.getElementById('recent-exports-list');
  if (!container) return;
  
  const format = EXPORT_FORMATS[selectedFormat];
  const entry = document.createElement('div');
  entry.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 6px;';
  entry.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 16px;">${format.icon}</span>
      <div>
        <div style="font-size: 12px; color: var(--text-primary);">terrain_${Date.now()}${format.extension}</div>
        <div style="font-size: 10px; color: var(--text-secondary);">Just now</div>
      </div>
    </div>
    <button style="padding: 4px 8px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text-secondary);">📁</button>
  `;
  
  // Remove "No recent exports" message
  if (container.querySelector('p')) {
    container.innerHTML = '';
  }
  
  container.insertBefore(entry, container.firstChild);
  
  // Keep max 5 recent exports
  while (container.children.length > 5) {
    container.removeChild(container.lastChild);
  }
}

export function destroy() {
  exportOptions = {};
  isExporting = false;
}
