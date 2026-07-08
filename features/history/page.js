/**
 * History — Full undo/redo history browser — view, jump, clear, compare snapshots
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'hist-info', type: 'label', label: 'Undo/Redo history for the current session.' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'undo', type: 'button', label: '↩ Undo', onClick: 'undo' },
    { key: 'redo', type: 'button', label: '↪ Redo', onClick: 'redo' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'hist-clear', type: 'button', label: 'Clear History', onClick: 'logClearHistory' },
    { key: 'hist-export', type: 'button', label: 'Export as Log', onClick: 'logExportHistory' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
