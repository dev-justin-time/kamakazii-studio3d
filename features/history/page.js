/* global _getApp, _refreshUI */

/**
 * History — Full undo/redo history browser — view, jump, clear, compare snapshots
 */
import { renderControls } from '../_shared/renderControls.js';

/**
 * Extracts and normalizes history state from various possible state shapes.
 * Supports explicit booleans, single-array history, or dual-stack (past/future) history.
 * 
 * @param {Object} state - The current application state.
 * @returns {Object} Normalized history metrics.
 */
function getHistoryState(state) {
  let canUndo = false;
  let canRedo = false;
  let undoCount = 0;
  let redoCount = 0;

  if (typeof state.canUndo === 'boolean') {
    canUndo = state.canUndo;
    canRedo = state.canRedo ?? false;
    undoCount = state.undoCount ?? (canUndo ? 1 : 0);
    redoCount = state.redoCount ?? (canRedo ? 1 : 0);
  } else if (Array.isArray(state.history)) {
    const idx = state.historyIndex ?? (state.history.length - 1);
    undoCount = Math.max(0, idx);
    redoCount = Math.max(0, state.history.length - 1 - idx);
    canUndo = undoCount > 0;
    canRedo = redoCount > 0;
  } else {
    const past = state.undoStack || state.past || [];
    const future = state.redoStack || state.future || [];
    undoCount = past.length;
    redoCount = future.length;
    canUndo = undoCount > 0;
    canRedo = redoCount > 0;
  }

  return {
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    currentStep: undoCount + 1,
    totalSteps: undoCount + redoCount + 1,
  };
}

/**
 * Builds the controls array dynamically based on the current application state.
 * 
 * @param {Object} state - The current application state.
 * @returns {Array} An array of control definitions for renderControls.
 */
function buildControls(state = {}) {
  const { canUndo, canRedo, undoCount, redoCount, currentStep, totalSteps } = getHistoryState(state);

  return [
    { key: 'hist-info', type: 'label', label: 'Undo/Redo history for the current session.' },
    { 
      key: 'hist-status', 
      type: 'label', 
      label: `Step ${currentStep} of ${totalSteps}` 
    },
    { key: 'sep1', type: 'label', label: '──────────' },
    
    { 
      key: 'undo', 
      type: 'button', 
      label: canUndo ? `↩ Undo (${undoCount})` : '↩ Undo', 
      disabled: !canUndo,
      onClick: () => { _getApp()?.undo(); _refreshUI(); } 
    },
    { 
      key: 'redo', 
      type: 'button', 
      label: canRedo ? `↪ Redo (${redoCount})` : '↪ Redo', 
      disabled: !canRedo,
      onClick: () => { _getApp()?.redo(); _refreshUI(); } 
    },
    
    { key: 'sep2', type: 'label', label: '──────────' },
    
    { 
      key: 'hist-clear', 
      type: 'button', 
      label: '🗑️ Clear History', 
      disabled: totalSteps <= 1,
      onClick: () => { _getApp()?.logClearHistory(); _refreshUI(); } 
    },
    { 
      key: 'hist-export', 
      type: 'button', 
      label: '💾 Export as Log', 
      disabled: totalSteps <= 1,
      onClick: () => { _getApp()?.logExportHistory(); _refreshUI(); } 
    }
  ];
}

// Export meta for backward compatibility or external inspection
const meta = {
  controls: buildControls(), // Default state
  onApply: () => {},
};

/**
 * Renders the History UI panel.
 * 
 * @param {HTMLElement} container - The DOM element to render the controls into.
 * @param {Object} state - The current application state (used for dynamic UI updates).
 */
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "history";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "history");
  }
// Generate fresh controls based on the current state to ensure UI is up-to-date
  const currentControls = buildControls(state);
  renderControls(container, currentControls);
}

export { meta };