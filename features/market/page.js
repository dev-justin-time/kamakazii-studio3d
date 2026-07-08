/**
 * Marketplace page — launches the full MarketplaceUI in an expanded popup.
 * Imports MarketplaceAPI + MarketplaceUI from ../../marketplace/ and mounts them.
 * Supports Stripe live payments via env vars, URL params, or user input.
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    {
      key: 'launch',
      label: 'Launch Marketplace',
      type: 'button',
      onClick: async () => {
        try {
          await _launchMarketplace();
        } catch (err) {
          console.error('[Market] Launch failed:', err);
          const pc = document.getElementById('popupContent');
          if (pc) {
            pc.innerHTML = `<h2>Marketplace</h2>
              <div style="text-align:center;padding:20px;color:#ef4444;">
                <p>Failed to load marketplace.</p>
                <p style="font-size:11px;color:#888;margin-top:8px">${err.message}</p>
              </div>
              <button class="btn" onclick="document.getElementById('popupOverlay')?.classList.remove('open')">Close</button>`;
          }
        }
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  renderControls(container, meta.controls);
}
