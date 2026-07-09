/**
 * Studio Shell — top icon bar + centered 3D viewport + popup page system.
 */
import { writeStatus } from './status-bar.js';

export class StudioShell {
  constructor(state) {
    this.state = state;
    this._features = {};
    this._activePopup = null;
    this._iconBar = null;
    this._viewportContainer = null;
    this._popupOverlay = null;
    this._popupContent = null;
    this._statusBar = null;
  }

  /** Register a feature module */
  registerFeature(id, meta) {
    this._features[id] = meta;
  }

  /** Mount the shell into a container element */
  mount(container) {
    container.innerHTML = '';
    container.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#111;color:#eee;font:13px/1.4 system-ui,sans-serif;overflow:hidden;position:relative;';

    // ── Search Bar ──
    this._searchBar = document.createElement('div');
    this._searchBar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 8px;background:#16162a;border-bottom:1px solid #2a2a3e;flex-shrink:0;';
    const searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.cssText = 'font-size:13px;line-height:1;opacity:0.5;';
    searchIcon.setAttribute('aria-hidden', 'true');
    this._searchBar.appendChild(searchIcon);
    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Find tool...';
    this._searchInput.setAttribute('aria-label', 'Search tools by name or description');
    this._searchInput.style.cssText = 'flex:1;background:rgba(255,255,255,0.06);border:1px solid #333;border-radius:4px;padding:5px 10px;color:#ccc;font-size:12px;outline:none;transition:border-color .15s;';
    this._searchInput.addEventListener('focus', () => {
      this._searchInput.style.borderColor = '#4a9eff';
    });
    this._searchInput.addEventListener('blur', () => {
      this._searchInput.style.borderColor = '#333';
    });
    this._searchBar.appendChild(this._searchInput);
    // Clear button
    this._searchClear = document.createElement('button');
    this._searchClear.textContent = '✕';
    this._searchClear.style.cssText = 'display:none;border:none;background:transparent;color:#666;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:3px;transition:all .15s;';
    this._searchClear.addEventListener('mouseenter', () => { this._searchClear.style.color = '#ccc'; });
    this._searchClear.addEventListener('mouseleave', () => { this._searchClear.style.color = '#666'; });
    this._searchClear.addEventListener('click', () => {
      this._searchInput.value = '';
      this._searchClear.style.display = 'none';
      this._filterIcons('');
      // Clear persisted query
      try { localStorage.removeItem('studioShellSearch'); } catch { /* noop */ }
      this._searchInput.focus();
    });
    this._searchBar.appendChild(this._searchClear);
    container.appendChild(this._searchBar);

    // ── Top Icon Bar ──
    this._iconBar = document.createElement('div');
    this._iconBar.style.cssText = 'display:flex;align-items:center;gap:2px;padding:4px 8px;background:#1a1a2e;border-bottom:1px solid #333;min-height:44px;overflow-x:auto;flex-shrink:0;';
    container.appendChild(this._iconBar);

    // Wire search input to filter & persist
    this._searchInput.addEventListener('input', () => {
      const val = this._searchInput.value;
      this._searchClear.style.display = val.trim() ? 'block' : 'none';
      this._filterIcons(val.toLowerCase().trim());
      // Persist to localStorage so query survives reload
      try { localStorage.setItem('studioShellSearch', val); } catch { /* noop */ }
    });

    // Keyboard shortcut: Ctrl+F or `/` focuses the search bar
    this._keydownHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this._searchInput.focus();
        this._searchInput.select();
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        this._searchInput.focus();
        this._searchInput.select();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);

    // ── Centered 3D Viewport ──
    this._viewportContainer = document.createElement('div');
    this._viewportContainer.id = 'viewport';
    this._viewportContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;background:#1a1a1a;';
    container.appendChild(this._viewportContainer);

    // ── Status Bar ──
    this._statusBar = document.createElement('div');
    this._statusBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:#0d0d1a;border-top:1px solid #333;font-size:11px;color:#888;flex-shrink:0;min-height:24px;';
    this._statusBar.innerHTML = '<span id="status-left">Ready</span><span id="status-right">FPS: 60</span>';
    container.appendChild(this._statusBar);

    // ── Popup Overlay ──
    this._popupOverlay = document.createElement('div');
    this._popupOverlay.id = 'popupOverlay';
    this._popupOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;';
    this._popupContent = document.createElement('div');
    this._popupContent.id = 'popupContent';
    this._popupContent.style.cssText = 'background:#1e1e2e;border-radius:8px;border:1px solid #444;min-width:320px;max-width:480px;max-height:80vh;overflow-y:auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    this._popupOverlay.appendChild(this._popupContent);
    this._popupOverlay.addEventListener('click', (e) => { if (e.target === this._popupOverlay) this._closePopup(); });
    document.body.appendChild(this._popupOverlay);

    // ── Render icons ──
    this._renderIconBar();

    // ── Restore persisted search query ──
    this._restoreSearch();

    // ── Store refs in state ──
    this.state.set('shell', this);
    this.state.set('viewport', this._viewportContainer);
  }

  _renderIconBar() {
    // Grouped icon definitions — each group gets a visual divider + label
    this._iconGroups = [
      {
        category: 'File & Selection',
        items: [
          { id: 'file',     label: 'File',         icon: '📁', desc: 'New, open, save, export projects' },
          { id: 'select',   label: 'Select',       icon: '🎯', desc: 'Click, box, lasso selection tools' },
          { id: 'edit',     label: 'Edit',         icon: '✏️', desc: 'Transform, snap, mirror, slice, merge' },
          { id: 'boolean',  label: 'Boolean',      icon: '🔲', desc: 'CSG boolean ops — union, subtract, intersect' },
          { id: 'curve',    label: 'Curve',        icon: '📐', desc: 'Bezier/NURBS curves, path extrusion' },
          { id: 'array',    label: 'Array',        icon: '🔁', desc: 'Linear, radial, grid array modifiers' },
        ]
      },
      {
        category: 'Sculpting & Modeling',
        items: [
          { id: 'object',   label: 'Object',       icon: '🧊', desc: 'Add primitives, properties, hierarchy' },
          { id: 'sculpt',   label: 'Sculpt',       icon: '🪨', desc: 'Clay, smooth, inflate, pinch, crease brushes' },
          { id: 'remesh',   label: 'Remesh',       icon: '🔄', desc: 'Remesh, decimate, retopology solver' },
          { id: 'deform',   label: 'Deform',       icon: '🌊', desc: 'Bend, twist, taper, stretch, lattice deform' },
        ]
      },
      {        category: 'Animation & Rigging',
        items: [
          { id: 'transition', label: 'Transition', icon: '🔄', desc: 'Tween, morph, interpolate objects' },
          { id: 'rig',      label: 'Rig',          icon: '🦴', desc: 'Bones, FK/IK, skinning, weights' },
          { id: 'mocap',    label: 'Mocap',        icon: '🎬', desc: 'Motion capture import & retarget' },
          { id: 'animate',  label: 'Animate',      icon: '⏯️', desc: 'Timeline, keyframes, clips, playback' },
          { id: 'mixer',    label: 'Mixer',        icon: '🎛️', desc: 'Animation mixer — blend clips, cross-fade, layers' },
          { id: 'motions',  label: 'Motions',      icon: '🗄️', desc: 'Motion database — auto-extract, dedup, reuse animations across models, export/import as JSON' },
          { id: 'constraints', label: 'Constraints', icon: '🔗', desc: 'IK/FK, parent, look-at, path constraints' },
          { id: 'shapes',   label: 'Shape Keys',   icon: '🎭', desc: 'Blend shapes, morph targets, shape key editor' },
        ]      
      },
      {
        category: 'Materials & Textures',
        items: [
          { id: 'texture',  label: 'Texture',      icon: '🎨', desc: 'UV mapping, bake, import textures' },
          { id: 'shaders',  label: 'Shaders',      icon: '✨', desc: 'Shader graph, custom materials, PBR editor' },
          { id: 'decal',    label: 'Decal',        icon: '📋', desc: 'Project decals, stickers onto surfaces' },
          { id: 'bake',     label: 'Bake',         icon: '🔥', desc: 'Bake normal/AO/curvature/lightmaps' },
          { id: 'uv',       label: 'UV Tools',     icon: '🗾', desc: 'Unwrap, seam marking, island packing' },
          { id: 'paint',    label: 'Paint',        icon: '🖌️', desc: 'Vertex & texture paint, layers' },
        ]
      },
      {
        category: 'AI & Pipeline',
        items: [
          { id: 'ai',       label: 'AI',           icon: '🤖', desc: 'AI generation, suggestions, texturing' },
          { id: 'script',   label: 'Script',       icon: '📜', desc: 'JS scripting console, automation, batch ops' },
          { id: 'batch',    label: 'Batch',        icon: '📑', desc: 'Batch rename, recolor, rescale, merge' },
          { id: 'snapshot', label: 'Snapshot',     icon: '📸', desc: 'Screenshot, GIF capture, turntable render' },
        ]
      },
      {
        category: 'Scene & Camera',
        items: [
          { id: 'camera',   label: 'Camera',       icon: '📷', desc: 'Camera management, FOV, presets' },
          { id: 'lighting', label: 'Lighting',     icon: '💡', desc: 'Lights, HDRI, environment' },
          { id: 'sky',      label: 'Sky',          icon: '🌌', desc: 'Procedural atmosphere, HDRI skybox, sun' },
          { id: 'weather',  label: 'Weather',      icon: '🌧️', desc: 'Rain, snow, fog, volumetric clouds, wind' },
        ]
      },
      {
        category: 'World Building',
        items: [
          { id: 'map',      label: 'Map',          icon: '🗺️', desc: 'Terrain generation, level editing' },
          { id: 'terrain',  label: 'Terrain',       icon: '⛰️', desc: 'Heightmap editor, erosion, paint terrain' },
          { id: 'water',    label: 'Water',        icon: '🌊', desc: 'Ocean, lake, river simulation with waves' },
          { id: 'foliage',  label: 'Foliage',      icon: '🌿', desc: 'Grass, trees, vegetation scatter system' },
          { id: 'game',     label: 'Game',         icon: '🎮', desc: 'Game mode export, physics setup' },
          { id: 'physics',  label: 'Physics',      icon: '⚡', desc: 'Rigid body, soft body, cloth simulation' },
          { id: 'terrain-presets', label: 'Presets',  icon: '🏔️', desc: 'Pre-built terrain configurations — quick start maps' },
          { id: 'biome-painter', label: 'Biomes',    icon: '🎨', desc: 'Paint terrain biomes with brush tools' },
          { id: 'scenery-scatter', label: 'Scatter',  icon: '🌳', desc: 'Distribute vegetation, rocks, props across terrain' },
          { id: 'terrain-export', label: 'Export',    icon: '📤', desc: 'Export terrain to OBJ, glTF, heightmap, STL, FBX' },
          { id: 'terrain-analytics', label: 'Analytics', icon: '📊', desc: 'Height distribution, slope, flow, viewshed analysis' },
        ]
      },
      {
        category: 'VFX & Particles',
        items: [
          { id: 'particles', label: 'Particles',   icon: '✨', desc: 'Fire, smoke, sparks, dust, magic emitters' },
          { id: 'fire',     label: 'Fire FX',      icon: '🔥', desc: 'Campfire, explosion, smoke plume, embers' },
          { id: 'trails',   label: 'Trails',       icon: '🌠', desc: 'Motion trails, ghost frames, smear effects' },
        ]
      },
      {
        category: 'Data & Analysis',
        items: [
          { id: 'performance', label: 'Performance', icon: '📊', desc: 'FPS, draw calls, frame time, memory' },
          { id: 'report',   label: 'Report',       icon: '📋', desc: 'Scene diagnostics, stats, material audit' },
          { id: 'history',  label: 'History',      icon: '🕐', desc: 'Undo/redo history browser, snapshot compare' },
        ]
      },
      {
        category: 'Assets & Collaboration',
        items: [
          { id: 'inventory', label: 'Inventory',   icon: '📦', desc: 'Asset library, materials, textures' },
          { id: 'market',   label: 'Market',       icon: '🏪', desc: 'Asset marketplace, purchases' },
          { id: 'voxel',    label: 'Voxel',        icon: '🧱', desc: 'Sparse octree voxel editor (planned)' },
          { id: 'extensions', label: 'Extensions', icon: '🔌', desc: 'Plugin manager, browse, install, configure' },
          { id: 'publish',  label: 'Publish',      icon: '🚀', desc: 'Publish to marketplace, export as asset' },
          { id: 'team',     label: 'Team',         icon: '👥', desc: 'Real-time collaboration, review, merge' },
          { id: 'chat',     label: 'Chat',         icon: '💬', desc: 'Collaboration, comments, AI chat' },
          { id: 'profile',  label: 'Profile',      icon: '👤', desc: 'User settings, preferences' },
        ]
      },
      {
        // Single-click modeless actions — bypass the popup system.
        category: 'Quick Actions',
        items: [
          { id: 'reset-view', label: 'Reset View',  icon: '🎯', desc: 'Re-frame camera at 10-unit, 35° downward viewpoint (post-import angle)' },
        ]
      },
    ];

    this._iconBar.innerHTML = '';
    this._iconButtons = [];
    this._iconDividerEls = []; // track divider DOM elements per group

    this._iconGroups.forEach((group, gi) => {
      const { category, items } = group;

      // ── Category divider (skip for first group — no divider at start) ──
      if (gi > 0) {
        const divider = document.createElement('div');
        divider.dataset.group = gi;
        divider.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;padding:0 4px;';
        // Thin vertical line
        const line = document.createElement('span');
        line.style.cssText = 'display:block;width:1px;height:28px;background:#2a2a3e;flex-shrink:0;';
        divider.appendChild(line);
        // Muted category label
        const label = document.createElement('span');
        label.textContent = category;
        label.style.cssText = 'font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;user-select:none;';
        divider.appendChild(label);
        this._iconBar.appendChild(divider);
        this._iconDividerEls.push(divider);
      } else {
        // Push a placeholder so indexes align
        this._iconDividerEls.push(null);
      }

      // ── Group items ──
      items.forEach(({ id, label, icon, desc }) => {
        const btn = document.createElement('button');
        btn.dataset.feature = id;
        btn.dataset.group = gi;
        btn.dataset.category = category.toLowerCase();
        btn.dataset.searchtext = `${label.toLowerCase()} ${desc.toLowerCase()} ${category.toLowerCase()}`;
        btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 8px;border:none;border-radius:4px;background:transparent;color:#aaa;cursor:pointer;font-size:10px;transition:all .15s;white-space:nowrap;position:relative;';
        btn.innerHTML = `<span style="font-size:18px;line-height:1">${icon}</span><span>${label}</span>`;
        this._iconButtons.push(btn);

        // Hover tooltip
        let tooltip = null;
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(255,255,255,0.08)';
          btn.style.color = '#fff';
          tooltip = document.createElement('div');
          tooltip.className = 'sh-tooltip';
          tooltip.textContent = desc;
          tooltip.style.cssText = 'position:fixed;bottom:100%;left:50%;transform:translateX(-50%);background:#222;color:#eee;padding:4px 10px;border-radius:4px;font-size:11px;white-space:nowrap;pointer-events:none;z-index:999;border:1px solid #444;margin-bottom:4px;';
          btn.appendChild(tooltip);
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'transparent';
          btn.style.color = '#aaa';
          if (tooltip) { tooltip.remove(); tooltip = null; }
        });

        // Click → open popup (or single-click for modeless actions like
        // 'reset-view' which bypass the popup and fire handleMenuAction)
        btn.addEventListener('click', () => {
          if (id === 'reset-view') {
            const app = (this.state && typeof this.state.get === 'function' && this.state.get('studio'))
                      || window.ProModelerApp;
            if (app && typeof app.handleMenuAction === 'function') {
              app.handleMenuAction('reset-view');
            }
            return;
          }
          this._openPopup(id, label);
        });

        this._iconBar.appendChild(btn);
      });
    });
  }

  /** Restore the last search query from localStorage and apply it */
  _restoreSearch() {
    try {
      const saved = localStorage.getItem('studioShellSearch');
      if (saved && this._searchInput) {
        this._searchInput.value = saved;
        this._searchClear.style.display = 'block';
        this._filterIcons(saved.toLowerCase().trim());
      }
    } catch { /* localStorage may be unavailable */ }
  }

  /** Filter visible icons by search query — matches label, desc, feature id, and category */
  _filterIcons(query) {
    const showAll = !query;
    let matchCount = 0;

    // Track visibility per group index so we can show/hide dividers
    const groupVisible = {};

    for (const btn of this._iconButtons) {
      const searchText = btn.dataset.searchtext || '';
      const id = btn.dataset.feature || '';
      const matches = showAll || searchText.includes(query) || id.includes(query);
      btn.style.display = matches ? '' : 'none';
      if (matches) {
        matchCount++;
        // Mark this button's group as having at least one visible item
        const gi = btn.dataset.group;
        if (gi !== undefined) groupVisible[gi] = true;
      }
    }

    // Show/hide category dividers based on whether their group has any visible items
    this._iconGroups.forEach((group, gi) => {
      const divider = this._iconDividerEls[gi];
      if (divider) {
        divider.style.display = (showAll || groupVisible[gi]) ? '' : 'none';
      }
    });

    // Update status bar with match count (if there's a filter active)
    if (this._searchInput) {
      writeStatus(showAll
        ? 'Ready'
        : `${matchCount} tool${matchCount !== 1 ? 's' : ''} match${matchCount !== 1 ? '' : 'es'} "${query}"`);
    }
  }

  /** Open a feature popup — loads from features/<id>/index.html or renders built-in */
  async _openPopup(id, label) {
    if (this._activePopup === id) { this._closePopup(); return; }

    this._popupContent.innerHTML = `<div style="margin-bottom:16px;font-size:16px;font-weight:600;color:#eee">${label}</div><div style="text-align:center;padding:20px;color:#666">Loading...</div>`;
    this._popupOverlay.style.display = 'flex';
    this._activePopup = id;

    // Timeout guard — if the dynamic import takes > 8s, show fallback
    let _timedOut = false;
    const timeoutId = setTimeout(() => {
      _timedOut = true;
      this._popupContent.innerHTML = `<div style="margin-bottom:16px;font-size:16px;font-weight:600;color:#eee">${label}</div><div style="padding:12px;color:#888">Feature page timed out — the module may not exist or failed to load.<br><span style="font-size:11px">features/${id}/page.js could not be loaded within 8s</span></div>`;
      this._addOkButton();
    }, 8000);

    try {
      // Try to dynamically import the feature page module
      const mod = await import(`../features/${id}/page.js`);
      if (_timedOut) return; // already fell back
      clearTimeout(timeoutId);
      this._popupContent.innerHTML = '';
      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom:16px;font-size:16px;font-weight:600;color:#eee';
      header.textContent = label;
      this._popupContent.appendChild(header);
      mod.render(this._popupContent, this.state);
      // Add OK button
      this._addOkButton();
    } catch (e) {
      clearTimeout(timeoutId);
      if (_timedOut) return;
      // Fallback: render basic controls
      this._popupContent.innerHTML = `<div style="margin-bottom:16px;font-size:16px;font-weight:600;color:#eee">${label}</div><div style="padding:12px;color:#888">Feature page failed to load<br><span style="font-size:11px">${e.message}</span></div>`;
      this._addOkButton();
    }
  }

  _addOkButton() {
    const ok = document.createElement('button');
    ok.textContent = 'OK ✓';
    ok.style.cssText = 'margin-top:16px;width:100%;padding:10px;border:none;border-radius:6px;background:#4a9eff;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;';
    ok.addEventListener('mouseenter', () => ok.style.background = '#3a8eef');
    ok.addEventListener('mouseleave', () => ok.style.background = '#4a9eff');
    ok.addEventListener('click', () => this._closePopup());
    this._popupContent.appendChild(ok);
  }

  _closePopup() {
    this._popupOverlay.style.display = 'none';
    this._activePopup = null;
  }

  /** Update status bar text */
  setStatus(left, right) {
    if (left) writeStatus(left);
    const r = document.getElementById('status-right');
    if (r && right) r.textContent = right;
  }

  getViewport() { return this._viewportContainer; }

  /**
   * Dispose/unmount — clean up event listeners, DOM nodes, and references
   * to prevent memory leaks when the shell is torn down.
   */
  dispose() {
    // 1. Remove global keydown listener
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }

    // 2. Close any open popup (guard: mount() may never have been called)
    if (this._popupOverlay) this._closePopup();

    // 3. Remove the popup overlay from document.body (we appended it in mount)
    if (this._popupOverlay && this._popupOverlay.parentNode) {
      this._popupOverlay.parentNode.removeChild(this._popupOverlay);
    }

    // 4. Clear icon button references so they can be GC'd
    this._iconButtons = [];
    this._iconDividerEls = [];
    this._iconGroups = null;

    // 5. Null out all DOM refs
    this._searchBar = null;
    this._searchInput = null;
    this._searchClear = null;
    this._iconBar = null;
    this._viewportContainer = null;
    this._popupOverlay = null;
    this._popupContent = null;
    this._statusBar = null;

    // 6. Clear state references (guard: state may not expose delete())
    if (this.state && typeof this.state.delete === 'function') {
      this.state.delete('shell');
      this.state.delete('viewport');
    }
  }
}
