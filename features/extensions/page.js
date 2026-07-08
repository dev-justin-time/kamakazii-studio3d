/**
 * Extensions — Plugin manager — browse, install, enable/disable, update studio extensions
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'ext-browse', type: 'button', label: 'Browse Extensions', onClick: 'logBrowseExt' },
    { key: 'ext-search', type: 'button', label: 'Search', onClick: 'logSearchExt' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'ext-open-market', type: 'button', label: 'Open Marketplace', onClick: 'logOpenMarket' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
