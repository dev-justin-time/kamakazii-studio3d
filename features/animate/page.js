/* global _getApp, _refreshUI, log */

/**
 * Animation — Timeline scrubber, frame stepping, speed control, loop toggle, keyframes
 */
import { renderControls } from '../_shared/renderControls.js';

/**
 * Extracts and normalizes animation state from the provided state object or the global app.
 * 
 * @param {Object} state - The current application state.
 * @returns {Object} Normalized animation metrics.
 */
function getAnimationState(state) {
  const app = typeof _getApp === 'function' ? _getApp() : null;
  const s = state || {};
  
  const selectedObject = s.selectedObject || app?.selectedObject || null;
  
  let keyframesMap = s.keyframes || app?.keyframes;
  let selectedKeyframes = null;
  
  if (selectedObject && keyframesMap) {
    const uuid = selectedObject.uuid;
    if (keyframesMap instanceof Map) {
      selectedKeyframes = keyframesMap.get(uuid);
    } else if (typeof keyframesMap === 'object') {
      selectedKeyframes = keyframesMap[uuid];
    }
  }
  
  const keyframeCount = Array.isArray(selectedKeyframes) ? selectedKeyframes.length : 0;
  
  return {
    currentFrame: s.currentFrame ?? app?.currentFrame ?? 1,
    totalFrames: s.totalFrames ?? app?.totalFrames ?? 250,
    isPlaying: s.isPlaying ?? app?.isAnimationPlaying ?? false,
    isLooping: s.isLooping ?? app?.isLooping ?? true,
    animationSpeed: s.animationSpeed ?? app?.animationSpeed ?? 1.0,
    selectedObject,
    keyframeCount,
    hasKeyframes: keyframeCount > 0
  };
}

/**
 * Builds the controls array dynamically based on the current application state.
 * 
 * @param {Object} state - The current application state.
 * @returns {Array} An array of control definitions for renderControls.
 */
function buildControls(state = {}) {
  const {
    currentFrame,
    totalFrames,
    isPlaying,
    isLooping,
    animationSpeed,
    selectedObject,
    keyframeCount,
    hasKeyframes
  } = getAnimationState(state);

  const playPauseLabel = isPlaying ? '⏸ Pause' : '▶ Play';
  const loopLabel = isLooping ? '🔁 Loop ON' : '🔁 Loop OFF';
  const frameLabel = `Frame ${currentFrame} / ${totalFrames}  ·  ${keyframeCount} keyframe${keyframeCount !== 1 ? 's' : ''} total`;
  
  const selInfoLabel = selectedObject 
    ? `Selected: ${selectedObject.name} (${keyframeCount} keyframes)`
    : 'No object selected — select an object to add keyframes';

  return [
    // ── Transport Controls ──
    { 
      key: 'play-pause', 
      label: playPauseLabel, 
      type: 'button', 
      onClick: () => {
        const app = _getApp();
        if (isPlaying) {
          app?.pauseAnimation();
        } else {
          app?.playAnimation();
        }
        _refreshUI();
      }
    },
    { 
      key: 'stop', 
      label: '⏹ Stop', 
      type: 'button', 
      onClick: () => {
        const app = _getApp();
        if (app) {
          app.pauseAnimation();
          app.setCurrentFrame(1);
          _refreshUI();
        }
      }
    },
    { key: 'sep-tp', label: '──────────', type: 'label' },

    // ── Timeline Scrubber ──
    {
      key: 'timeline-scrub',
      label: 'Timeline',
      type: 'slider',
      min: 1, 
      max: totalFrames, 
      step: 1, 
      default: currentFrame,
      description: 'Drag to scrub through the animation timeline',
      onChange: (val) => {
        _getApp()?.setCurrentFrame(val);
        _refreshUI();
      },
    },
    { key: 'frame-label', type: 'label', label: frameLabel },

    // ── Frame Stepping ──
    {
      key: 'step-prev',
      label: '◀◀ Prev Frame',
      type: 'button',
      disabled: currentFrame <= 1,
      onClick: () => { _getApp()?.stepFrame(-1); _refreshUI(); },
    },
    {
      key: 'step-next',
      label: 'Next Frame ▶▶',
      type: 'button',
      disabled: currentFrame >= totalFrames,
      onClick: () => { _getApp()?.stepFrame(1); _refreshUI(); },
    },
    { key: 'sep-step', label: '──────────', type: 'label' },

    // ── Speed Control ──
    {
      key: 'anim-speed',
      label: 'Animation Speed',
      type: 'slider',
      min: 0.1, max: 5, step: 0.1, default: animationSpeed,
      description: 'Playback speed multiplier',
      onChange: (val) => { _getApp()?.setAnimationSpeed(val); },
    },
    { 
      key: 'loop-toggle', 
      label: loopLabel, 
      type: 'button', 
      onClick: () => {
        _getApp()?.toggleLoop();
        _refreshUI();
      }
    },
    { key: 'sep-loop', label: '──────────', type: 'label' },

    // ── Keyframes ──
    {
      key: 'add-keyframe',
      label: '📷 Add Keyframe at Current Frame',
      type: 'button',
      disabled: !selectedObject,
      onClick: () => { _getApp()?.addKeyframe(); _refreshUI(); },
    },
    {
      key: 'clear-keyframes',
      label: '🗑 Clear Keyframes (selected)',
      type: 'button',
      disabled: !selectedObject || !hasKeyframes,
      onClick: () => {
        const app = _getApp();
        if (app?.selectedObject && app.keyframes) {
          const uuid = app.selectedObject.uuid;
          const hasKf = app.keyframes instanceof Map ? app.keyframes.has(uuid) : !!app.keyframes[uuid];
          if (hasKf) {
            if (typeof app.pushUndo === 'function') app.pushUndo();
            if (app.keyframes instanceof Map) {
              app.keyframes.delete(uuid);
            } else {
              delete app.keyframes[uuid];
            }
            log(`Cleared keyframes for ${app.selectedObject.name}`);
            _refreshUI();
          }
        }
      },
    },
    { key: 'sel-kf-info', type: 'label', label: selInfoLabel },
  ];
}

// Export meta for backward compatibility or external inspection
const meta = {
  controls: buildControls(), // Default state
  onApply: () => {},
};

/**
 * Renders the Animation UI panel.
 * 
 * @param {HTMLElement} container - The DOM element to render the controls into.
 * @param {Object} state - The current application state (used for dynamic UI updates).
 */
export function render(container, state) {
  // Generate fresh controls based on the current state to ensure UI is up-to-date
  const currentControls = buildControls(state);
  renderControls(container, currentControls);
}

export { meta };