/**
 * Animation — Timeline scrubber, frame stepping, speed control, loop toggle, keyframes
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    // ── Transport Controls ──
    { key: 'play-pause', label: '▶ Play', type: 'button', onClick: () => {
      const app = _getApp();
      if (app?.isAnimationPlaying) {
        app.pauseAnimation();
      } else {
        app?.playAnimation();
      }
      _refreshUI();
    }},
    { key: 'stop', label: '⏹ Stop', type: 'button', onClick: () => {
      const app = _getApp();
      if (app) {
        app.pauseAnimation();
        app.setCurrentFrame(1);
        _refreshUI();
      }
    }},
    { key: 'sep-tp', label: '──────────', type: 'label' },

    // ── Timeline Scrubber ──
    {
      key: 'timeline-scrub',
      label: 'Timeline',
      type: 'slider',
      min: 1, max: 250, step: 1, default: 1,
      description: 'Drag to scrub through the animation timeline',
      onChange: (val) => {
        _getApp()?.setCurrentFrame(val);
        _refreshUI();
      },
    },
    { key: 'frame-label', type: 'label', label: 'Frame 1 / 250  ·  0 keyframes total' },

    // ── Frame Stepping ──
    {
      key: 'step-prev',
      label: '◀◀ Prev Frame',
      type: 'button',
      onClick: () => { _getApp()?.stepFrame(-1); _refreshUI(); },
    },
    {
      key: 'step-next',
      label: 'Next Frame ▶▶',
      type: 'button',
      onClick: () => { _getApp()?.stepFrame(1); _refreshUI(); },
    },
    { key: 'sep-step', label: '──────────', type: 'label' },

    // ── Speed Control ──
    {
      key: 'anim-speed',
      label: 'Animation Speed',
      type: 'slider',
      min: 0.1, max: 5, step: 0.1, default: 1,
      description: 'Playback speed multiplier',
      onChange: (val) => { _getApp()?.setAnimationSpeed(val); },
    },
    { key: 'loop-toggle', label: '🔁 Loop ON', type: 'button', onClick: () => {
      _getApp()?.toggleLoop();
      _refreshUI();
    }},
    { key: 'sep-loop', label: '──────────', type: 'label' },

    // ── Keyframes ──
    {
      key: 'add-keyframe',
      label: '📷 Add Keyframe at Current Frame',
      type: 'button',
      onClick: () => { _getApp()?.addKeyframe(); _refreshUI(); },
    },
    {
      key: 'clear-keyframes',
      label: '🗑 Clear Keyframes (selected)',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app?.selectedObject && app.keyframes.has(app.selectedObject.uuid)) {
          app.pushUndo();
          app.keyframes.delete(app.selectedObject.uuid);
          log(`Cleared keyframes for ${app.selectedObject.name}`);
          _refreshUI();
        }
      },
    },
    { key: 'sel-kf-info', type: 'label', label: 'No object selected — select an object to add keyframes' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
