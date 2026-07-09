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
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "extensions";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "extensions");
  }
renderControls(container, meta.controls);
}
