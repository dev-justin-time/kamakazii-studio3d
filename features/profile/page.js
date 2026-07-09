/* global _getApp, THREE, log, _refreshUI */

/**
 * Profile — User preferences, display options, editor settings
 * 
 * Manages and persists user preferences (theme, grid, gizmo, performance) 
 * using localStorage and applies them dynamically to the editor state.
 */
import { renderControls } from '../_shared/renderControls.js';

/**
 * Builds the controls array dynamically based on the current application state.
 * Reads current preferences to set the correct default values in the UI.
 * 
 * @param {Object} state - The current application state.
 * @returns {Array} An array of control definitions for renderControls.
 */
function buildControls(state = {}) {
  const app = _getApp();
  const prefs = state.preferences || app?.preferences || {};
  
  // Read current state with fallbacks to ensure UI reflects actual app state
  const currentTheme = prefs.theme || 'dark';
  const currentBgColor = prefs.bgColor || '#1a1a1a';
  const showGrid = prefs.showGrid !== false;
  const gridSnap = prefs.gridSnap !== false;
  const gizmoSize = prefs.gizmoSize || 1;
  const gizmoLocal = prefs.gizmoLocal === true;
  const shadowsEnabled = prefs.shadowsEnabled !== false;

  // Helper to update a preference, persist it to localStorage, and apply it
  const updatePref = (key, value, applyFn) => {
    if (app) {
      app.preferences = app.preferences || {};
      app.preferences[key] = value;
      try { 
        localStorage.setItem('proModeler_prefs', JSON.stringify(app.preferences)); 
      } catch (_e) { /* ignore storage errors (e.g., private browsing) */ }
    }
    if (applyFn) applyFn(value);
    if (typeof _refreshUI === 'function') _refreshUI();
  };

  return [
    { key: 'info', type: 'label', label: 'Editor preferences and display settings:' },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Theme ──
    { key: 'info-theme', type: 'label', label: 'Appearance:' },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: currentTheme,
      options: [
        { value: 'dark', label: 'Dark (default)' },
        { value: 'darker', label: 'Darker' },
        { value: 'blueprint', label: 'Blueprint' },
      ],
      description: 'Editor color scheme',
      onChange: (val) => {
        updatePref('theme', val, (v) => {
          const themes = { dark: '#1a1a1a', darker: '#0a0a0a', blueprint: '#0d1b2a' };
          document.body.style.background = themes[v] || '#111';
          if (app?.scene) {
            const bg = { dark: 0x1a1a1a, darker: 0x0a0a0a, blueprint: 0x0d1b2a };
            app.scene.background = new THREE.Color(bg[v] || 0x1a1a1a);
            if (typeof app.render === 'function') app.render();
          }
        });
      },
    },
    {
      key: 'bg-color',
      label: 'Background Color',
      type: 'color',
      default: currentBgColor,
      description: 'Custom scene background color (overrides theme)',
      onChange: (val) => { 
        updatePref('bgColor', val, (v) => {
          if (app?.scene) {
            app.scene.background = new THREE.Color(v);
            if (typeof app.render === 'function') app.render();
          }
        }); 
      },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Display ──
    { key: 'info-display', type: 'label', label: 'Display:' },
    {
      key: 'grid-toggle',
      label: 'Show Grid',
      type: 'toggle',
      default: showGrid,
      onChange: (val) => {
        updatePref('showGrid', val, (v) => {
          if (app?.scene) {
            app.scene.children.forEach(c => {
              if (c.isGridHelper) c.visible = v;
            });
            if (typeof app.render === 'function') app.render();
          }
        });
      },
    },
    {
      key: 'grid-snap',
      label: 'Grid Snap',
      type: 'toggle',
      default: gridSnap,
      description: 'Snap to grid when using Move tool',
      onChange: (val) => { 
        updatePref('gridSnap', val, (v) => {
          if (typeof app?.setGridSnapEnabled === 'function') app.setGridSnapEnabled(v); 
        }); 
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Gizmo ──
    { key: 'info-gizmo', type: 'label', label: 'Transform Gizmo:' },
    {
      key: 'gizmo-size',
      label: 'Gizmo Size',
      type: 'slider',
      min: 0.5, max: 3, step: 0.1,
      default: gizmoSize,
      description: 'Size of the transform controls (move/rotate/scale)',
      onChange: (val) => { 
        updatePref('gizmoSize', val, (v) => {
          if (typeof app?.setGizmoSize === 'function') app.setGizmoSize(v); 
        }); 
      },
    },
    {
      key: 'gizmo-local',
      label: 'Use Local Space',
      type: 'toggle',
      default: gizmoLocal,
      description: 'Transform in local object space instead of world space',
      onChange: (val) => {
        updatePref('gizmoLocal', val, (v) => {
          if (app?.transformControls) {
            app.transformControls.setSpace(v ? 'local' : 'world');
          }
        });
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Performance ──
    { key: 'info-perf', type: 'label', label: 'Performance:' },
    {
      key: 'shadow-toggle',
      label: 'Shadows Enabled',
      type: 'toggle',
      default: shadowsEnabled,
      description: 'Toggle shadow rendering (disable for better performance)',
      onChange: (val) => {
        updatePref('shadowsEnabled', val, (v) => {
          if (app?.renderer) {
            app.renderer.shadowMap.enabled = v;
            if (typeof app.render === 'function') app.render();
          }
        });
      },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info-about', type: 'label', label: 'About:' },
    {
      key: 'about',
      type: 'label',
      label: `ProModeler Studio v${(() => {
        try { return '1.2.0'; } catch (_e) { return 'dev'; }
      })()}`,
    },
    {
      key: 'reset-defaults',
      label: '↺ Reset to Defaults',
      type: 'button',
      onClick: () => {
        if (!app) return;
        
        // Clear persisted preferences
        app.preferences = {};
        try { localStorage.removeItem('proModeler_prefs'); } catch (_e) {}
        
        // Apply default settings
        if (app.scene) {
          app.scene.background = new THREE.Color(0x1a1a1a);
          app.scene.children.forEach(c => { if (c.isGridHelper) c.visible = true; });
        }
        if (typeof app.setGridSnapEnabled === 'function') app.setGridSnapEnabled(true);
        if (typeof app.setGizmoSize === 'function') app.setGizmoSize(1);
        if (app.renderer) app.renderer.shadowMap.enabled = true;
        if (app.transformControls) app.transformControls.setSpace('world');
        
        document.body.style.background = '#1a1a1a';
        
        if (typeof app.render === 'function') app.render();
        log('Preferences reset to defaults');
        
        // Refresh UI to reflect reset defaults
        if (typeof _refreshUI === 'function') _refreshUI();
      },
    },
  ];
}

// Export meta for backward compatibility or external inspection
const meta = {
  controls: buildControls(),
  onApply: () => {},
};

/**
 * Renders the Profile UI panel.
 * Uses the state parameter to read current preferences and reflect them in the UI.
 * 
 * @param {HTMLElement} container - The DOM element to render the controls into.
 * @param {Object} state - The current application state.
 */
export function render(container, state) {
  // Generate fresh controls based on the current state to ensure UI is up-to-date
  const currentControls = buildControls(state);
  renderControls(container, currentControls);
}

export { meta };