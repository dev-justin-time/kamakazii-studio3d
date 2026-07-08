/**
 * Terrain Presets — Pre-built terrain configurations for quick map creation
 * Provides curated terrain presets with elevation, erosion, and texture settings
 */

const TERRAIN_PRESETS = {
  mountainRange: {
    name: 'Mountain Range',
    icon: '🏔️',
    description: 'Dramatic peaks with ridges and valleys',
    settings: {
      size: 4000,
      erosion: 0.65,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.001,
      noiseOctaves: 6,
      noisePersistence: 0.55,
      texture: 'rocky',
      waterLevel: 0.15,
      snowLine: 0.75
    },
    tags: ['highlands', 'extreme', 'adventure']
  },
  rollingHills: {
    name: 'Rolling Hills',
    icon: '🌿',
    description: 'Gentle undulating terrain for pastoral scenes',
    settings: {
      size: 4000,
      erosion: 0.45,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.002,
      noiseOctaves: 4,
      noisePersistence: 0.4,
      texture: 'grass',
      waterLevel: 0.08,
      snowLine: 0.95
    },
    tags: ['gentle', 'pastoral', 'open']
  },
  coastalCliffs: {
    name: 'Coastal Cliffs',
    icon: '🌊',
    description: 'Dramatic coastline with sheer drops and beaches',
    settings: {
      size: 4000,
      erosion: 0.7,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.0015,
      noiseOctaves: 5,
      noisePersistence: 0.5,
      texture: 'sandy',
      waterLevel: 0.35,
      snowLine: 0.9
    },
    tags: ['coastal', 'dramatic', 'water']
  },
  desertCanyon: {
    name: 'Desert Canyon',
    icon: '🏜️',
    description: 'Deep canyons with mesa formations',
    settings: {
      size: 4000,
      erosion: 0.8,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.0008,
      noiseOctaves: 6,
      noisePersistence: 0.6,
      texture: 'sandy',
      waterLevel: 0.02,
      snowLine: 0.99
    },
    tags: ['arid', 'canyon', 'desert']
  },
  volcanicIsland: {
    name: 'Volcanic Island',
    icon: '🌋',
    description: 'Central peak surrounded by ocean',
    settings: {
      size: 3000,
      erosion: 0.5,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.0012,
      noiseOctaves: 5,
      noisePersistence: 0.5,
      texture: 'rocky',
      waterLevel: 0.4,
      snowLine: 0.6
    },
    tags: ['island', 'volcanic', 'tropical']
  },
  frozenTundra: {
    name: 'Frozen Tundra',
    icon: '❄️',
    description: 'Flat icy plains with subtle elevation changes',
    settings: {
      size: 5000,
      erosion: 0.3,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.0005,
      noiseOctaves: 3,
      noisePersistence: 0.35,
      texture: 'snowy',
      waterLevel: 0.2,
      snowLine: 0.1
    },
    tags: ['arctic', 'flat', 'winter']
  },
  jungleBasin: {
    name: 'Jungle Basin',
    icon: '🌴',
    description: 'Low-lying dense vegetation with rivers',
    settings: {
      size: 4000,
      erosion: 0.55,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.0018,
      noiseOctaves: 5,
      noisePersistence: 0.48,
      texture: 'grass',
      waterLevel: 0.25,
      snowLine: 0.99
    },
    tags: ['tropical', 'wet', 'lush']
  },
  alienWorld: {
    name: 'Alien World',
    icon: '👾',
    description: 'Exotic terrain with unusual formations',
    settings: {
      size: 3500,
      erosion: 0.9,
      noiseSeed: Math.floor(Math.random() * 99999),
      noiseScale: 0.003,
      noiseOctaves: 7,
      noisePersistence: 0.7,
      texture: 'rocky',
      waterLevel: 0.1,
      snowLine: 0.5
    },
    tags: ['exotic', 'sci-fi', 'unusual']
  }
};

export function init(container) {
  container.innerHTML = `
    <div class="terrain-presets-panel" style="padding: 20px; height: 100%; overflow-y: auto;">
      <div class="header" style="margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px; font-size: 18px; color: var(--text-primary);">Terrain Presets</h2>
        <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
          Quick-start terrain configurations for common landscapes
        </p>
      </div>
      
      <div class="search-bar" style="margin-bottom: 16px;">
        <input type="text" id="preset-search" placeholder="Search presets..." 
          style="width: 100%; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px;">
      </div>
      
      <div class="preset-tags" style="margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 6px;" id="tag-filters">
        <button class="tag-btn active" data-tag="all" style="padding: 4px 10px; background: var(--accent); color: white; border: none; border-radius: 12px; font-size: 11px; cursor: pointer;">All</button>
      </div>
      
      <div class="presets-grid" id="presets-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
        ${Object.entries(TERRAIN_PRESETS).map(([key, preset]) => `
          <div class="preset-card" data-key="${key}" data-tags="${preset.tags.join(',')}"
            style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span style="font-size: 24px;">${preset.icon}</span>
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">${preset.name}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">${preset.description}</div>
              </div>
            </div>
            <div class="preset-preview" style="height: 80px; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 10px; overflow: hidden;">
              <canvas data-preset="${key}" width="280" height="80"></canvas>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${preset.tags.map(tag => `<span style="font-size: 10px; padding: 2px 6px; background: var(--bg-tertiary); border-radius: 8px; color: var(--text-secondary);">${tag}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="custom-preset" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">Save Custom Preset</h3>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="custom-preset-name" placeholder="Preset name..." 
            style="flex: 1; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px;">
          <button id="save-custom-preset" style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">Save Current</button>
        </div>
      </div>
    </div>
  `;

  // Initialize previews
  initPreviews();
  
  // Setup search
  const searchInput = container.querySelector('#preset-search');
  searchInput?.addEventListener('input', filterPresets);
  
  // Setup tag filters
  initTagFilters();
  
  // Setup click handlers
  container.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => applyPreset(card.dataset.key));
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent)';
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border)';
      card.style.transform = 'none';
    });
  });
  
  // Save custom preset
  container.querySelector('#save-custom-preset')?.addEventListener('click', saveCustomPreset);
}

function initPreviews() {
  // Generate mini terrain previews on each card's canvas
  Object.keys(TERRAIN_PRESETS).forEach(key => {
    const canvas = document.querySelector(`canvas[data-preset="${key}"]`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const preset = TERRAIN_PRESETS[key];
    generatePreview(ctx, canvas.width, canvas.height, preset.settings);
  });
}

function generatePreview(ctx, width, height, settings) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x * settings.noiseScale * 10;
      const ny = y * settings.noiseScale * 10;
      
      // Simple noise approximation
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      for (let i = 0; i < settings.noiseOctaves; i++) {
        value += amplitude * Math.sin(nx * frequency + i) * Math.cos(ny * frequency + i * 0.7);
        amplitude *= settings.noisePersistence;
        frequency *= 2;
      }
      value = (value + 1) / 2;
      
      // Color based on height
      let r, g, b;
      if (value < settings.waterLevel) {
        r = 30; g = 80; b = 150;
      } else if (value < settings.snowLine) {
        const t = (value - settings.waterLevel) / (settings.snowLine - settings.waterLevel);
        if (settings.texture === 'sandy') {
          r = 180 + t * 40; g = 150 + t * 30; b = 80 + t * 20;
        } else if (settings.texture === 'snowy') {
          r = 200 + t * 50; g = 210 + t * 40; b = 220 + t * 35;
        } else {
          r = 40 + t * 80; g = 100 + t * 60; b = 30 + t * 40;
        }
      } else {
        r = 230; g = 235; b = 240;
      }
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function initTagFilters() {
  const allTags = new Set();
  Object.values(TERRAIN_PRESETS).forEach(p => p.tags.forEach(t => allTags.add(t)));
  
  const container = document.getElementById('tag-filters');
  if (!container) return;
  
  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.style.cssText = 'padding: 4px 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 12px; font-size: 11px; cursor: pointer; color: var(--text-secondary);';
    btn.addEventListener('click', () => filterByTag(tag));
    container.appendChild(btn);
  });
}

function filterByTag(tag) {
  const cards = document.querySelectorAll('.preset-card');
  const btns = document.querySelectorAll('.tag-btn');
  
  btns.forEach(btn => {
    if (btn.dataset.tag === tag || (tag === 'all' && btn.dataset.tag === 'all')) {
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
      btn.style.borderColor = 'var(--accent)';
    } else {
      btn.style.background = 'var(--bg-tertiary)';
      btn.style.color = 'var(--text-secondary)';
      btn.style.borderColor = 'var(--border)';
    }
  });
  
  cards.forEach(card => {
    if (tag === 'all' || card.dataset.tags.includes(tag)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

function filterPresets() {
  const search = document.getElementById('preset-search')?.value.toLowerCase() || '';
  const cards = document.querySelectorAll('.preset-card');
  
  cards.forEach(card => {
    const key = card.dataset.key;
    const preset = TERRAIN_PRESETS[key];
    const matches = preset.name.toLowerCase().includes(search) || 
                   preset.description.toLowerCase().includes(search) ||
                   preset.tags.some(t => t.includes(search));
    card.style.display = matches ? 'block' : 'none';
  });
}

function applyPreset(key) {
  const preset = TERRAIN_PRESETS[key];
  if (!preset) return;
  
  // Post message to parent/map-maker iframe
  window.parent?.postMessage({
    type: 'apply-terrain-preset',
    preset: preset.settings,
    name: preset.name
  }, '*');
  
  // Also dispatch custom event
  window.dispatchEvent(new CustomEvent('terrain-preset-applied', {
    detail: { key, preset }
  }));
}

function saveCustomPreset() {
  const nameInput = document.getElementById('custom-preset-name');
  const name = nameInput?.value?.trim();
  if (!name) {
    alert('Please enter a preset name');
    return;
  }
  
  // Get current settings from map-maker
  window.parent?.postMessage({
    type: 'get-current-terrain-settings'
  }, '*');
  
  // Listen for response
  const handler = (e) => {
    if (e.data?.type === 'current-terrain-settings') {
      window.removeEventListener('message', handler);
      
      const customPresets = JSON.parse(localStorage.getItem('kamakazii_custom_presets') || '{}');
      customPresets[name.toLowerCase().replace(/\s+/g, '-')] = {
        name,
        icon: '⭐',
        description: 'Custom preset',
        settings: e.data.settings,
        tags: ['custom'],
        isCustom: true,
        createdAt: Date.now()
      };
      localStorage.setItem('kamakazii_custom_presets', JSON.stringify(customPresets));
      
      nameInput.value = '';
      alert(`Preset "${name}" saved!`);
    }
  };
  window.addEventListener('message', handler);
}

export function destroy() {
  // Cleanup
}
