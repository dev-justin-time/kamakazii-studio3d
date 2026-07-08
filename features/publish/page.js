/**
 * Publish — Publish model to marketplace, export as game asset, one-click deploy
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'pub-type', type: 'select', label: 'Publish Target', default: '', options: [{"value":"marketplace","label":"Studio Marketplace"},{"value":"game-asset","label":"Game Asset (.k3dasset)"},{"value":"glb-export","label":"GLB Export"}] },
    { key: 'pub-name', type: 'text', label: 'Asset Name', default: '' },
    { key: 'pub-desc', type: 'text', label: 'Description', default: '' },
    { key: 'pub-tags', type: 'text', label: 'Tags', default: '3d,model' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'pub-now', type: 'button', label: '🚀 Publish', onClick: 'logPublish' },
    { key: 'pub-export', type: 'button', label: 'Export GLB', onClick: 'exportModel_glb' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
