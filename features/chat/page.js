/**
 * Chat — Conversation with message history, scene context, save/export
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    // ── Quick Prompts ──
    { key: 'info-quick', type: 'label', label: 'Quick Questions:' },
    { key: 'tip-model', label: '💡 Modeling Tip', type: 'button', onClick: () => _askAI('Give me a quick 3D modeling tip.') },
    { key: 'tip-material', label: '🎨 Material Advice', type: 'button', onClick: () => _askAI('Suggest materials for my current selection or scene.') },
    { key: 'tip-perf', label: '⚡ Performance Tip', type: 'button', onClick: () => _askAI('How can I optimize my 3D scene for better performance?') },
    { key: 'tip-scene', label: '🌍 Scene Composition', type: 'button', onClick: () => _askAI('Suggest improvements for my scene layout and composition.') },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Custom Send ──
    { key: 'info-custom', type: 'label', label: 'Send a custom message:' },
    {
      key: 'send-chat',
      label: 'Send Message',
      type: 'button',
      onClick: () => {
        const textarea = document.getElementById('chatCustomInput');
        const msg = textarea?.value?.trim();
        if (msg) {
          _askAI(msg);
          textarea.value = '';
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Chat Log ──
    { key: 'chat-log', type: 'label', label: 'Chat log — ask a question to begin.' },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Actions ──
    {
      key: 'clear-chat',
      label: '🗑 Clear Chat',
      type: 'button',
      onClick: () => { _clearChat(); },
    },
    {
      key: 'export-chat',
      label: '📤 Export Chat Log',
      type: 'button',
      onClick: () => { _exportChat(); },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-collab', type: 'label', label: '  • Real-time multi-user editing' },
    { key: 'info-comments', type: 'label', label: '  • Scene annotations & comments' },
    { key: 'info-history', type: 'label', label: '  • Edit history & version tracking' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
