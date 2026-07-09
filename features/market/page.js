/**
 * Marketplace page — launches the full MarketplaceUI in an expanded popup.
 * Imports MarketplaceAPI + MarketplaceUI from ../../marketplace/ and mounts them.
 * Supports Stripe live payments via env vars, URL params, or user input.
 */
import { dbg } from '../../app/dbg.js';
import { renderControls } from '../_shared/renderControls.js';

/** Launch the full marketplace UI into the popup content container */
async function _launchMarketplace() {
  const container = document.getElementById('popupContent');
  if (!container) {
    throw new Error('#popupContent element not found in DOM');
  }

  // Dynamically import marketplace modules (they're large — only load on demand)
  const { MarketplaceAPI } = await import('../../marketplace/index.js');
  const { MarketplaceUI } = await import('../../marketplace/marketplace-ui.js');

  // Create the API with a minimal editor state (the shell's state object)
  // Falls back to window.ProModelerApp if available for deeper editor integration.
  const editorState = window.ProModelerApp || {};
  const api = new MarketplaceAPI(editorState);
  await api.init();

  // Configure Stripe if env vars or URL params are present
  const urlParams = new URLSearchParams(window.location.search);
  const stripeKey = urlParams.get('stripe_pk') || import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY;
  if (stripeKey) {
    api.configureStripe({ publishableKey: stripeKey });
  }

  // Mount the marketplace UI
  const ui = new MarketplaceUI(api, container);
  ui.mount();

  // Apply marketplace-specific CSS
  _injectMarketplaceStyles();
}

/** Inject CSS styles for the marketplace UI into the page */
function _injectMarketplaceStyles() {
  if (document.getElementById('k3d-mkt-styles')) return;

  const style = document.createElement('style');
  style.id = 'k3d-mkt-styles';
  style.textContent = `
    .k3d-mkt-overlay {
      display: flex;
      gap: 0;
      height: 100%;
      min-height: 400px;
      overflow: hidden;
      border-radius: 6px;
    }
    .k3d-mkt-sidebar {
      width: 220px;
      flex-shrink: 0;
      background: #181825;
      border-right: 1px solid #2a2a3e;
      padding: 12px 0;
      overflow-y: auto;
    }
    .k3d-mkt-main {
      flex: 1;
      overflow-y: auto;
      background: #1e1e2e;
      padding: 20px;
    }
    .k3d-mkt-logo {
      padding: 8px 16px 16px;
      font-size: 16px;
      font-weight: 600;
      color: #4a9eff;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #2a2a3e;
      margin-bottom: 8px;
    }
    .k3d-mkt-search {
      padding: 0 12px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #2a2a3e;
      margin-bottom: 8px;
    }
    .k3d-mkt-search input {
      flex: 1;
      background: rgba(255,255,255,0.06);
      border: 1px solid #333;
      border-radius: 4px;
      padding: 6px 10px;
      color: #ccc;
      font-size: 12px;
      outline: none;
    }
    .k3d-mkt-search input:focus {
      border-color: #4a9eff;
    }
    .k3d-mkt-nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 8px;
    }
    .k3d-mkt-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      font-size: 13px;
      color: #ccc;
      position: relative;
    }
    .k3d-mkt-nav-item:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    .k3d-mkt-nav-item.active {
      background: rgba(74,158,255,0.15);
      color: #4a9eff;
    }
    .k3d-mkt-badge {
      margin-left: auto;
      background: #4a9eff;
      color: #fff;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .k3d-mkt-count {
      margin-left: auto;
      color: #666;
      font-size: 11px;
    }
    .k3d-mkt-nav-divider {
      height: 1px;
      background: #2a2a3e;
      margin: 8px 12px;
    }
    .k3d-mkt-nav-section-title {
      padding: 4px 12px;
      font-size: 10px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .k3d-mkt-header {
      margin-bottom: 24px;
    }
    .k3d-mkt-header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      margin: 0 0 4px;
    }
    .k3d-mkt-header p {
      color: #888;
      font-size: 13px;
      margin: 0;
    }
    .k3d-mkt-section {
      margin-bottom: 32px;
    }
    .k3d-mkt-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .k3d-mkt-section-header h2 {
      font-size: 16px;
      font-weight: 600;
      color: #eee;
      margin: 0;
    }
    .k3d-mkt-section-header h2 i {
      margin-right: 8px;
      color: #4a9eff;
    }
    .k3d-mkt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
    }
    .k3d-mkt-product-card {
      background: #252538;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .k3d-mkt-product-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .k3d-mkt-product-thumb {
      height: 120px;
      background-size: cover;
      background-position: center;
      position: relative;
      display: flex;
      gap: 6px;
      padding: 8px;
    }
    .k3d-mkt-product-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      height: fit-content;
    }
    .k3d-mkt-product-badge.free {
      background: rgba(74,222,128,0.2);
      color: #4ade80;
    }
    .k3d-mkt-product-badge.paid {
      background: rgba(74,158,255,0.2);
      color: #4a9eff;
    }
    .k3d-mkt-product-badge.featured {
      background: rgba(251,191,36,0.2);
      color: #fbbf24;
    }
    .k3d-mkt-product-info {
      padding: 10px;
    }
    .k3d-mkt-product-info h3 {
      font-size: 13px;
      font-weight: 600;
      color: #eee;
      margin: 0 0 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .k3d-mkt-product-creator {
      font-size: 11px;
      color: #888;
      margin: 0 0 6px;
    }
    .k3d-mkt-product-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: #666;
    }
    .k3d-mkt-stars {
      color: #fbbf24;
      letter-spacing: 1px;
    }
    .k3d-mkt-reviews {
      color: #888;
    }
    .k3d-mkt-empty {
      text-align: center;
      padding: 40px 20px;
      color: #666;
      font-size: 13px;
    }
    .k3d-mkt-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
    }
    .k3d-mkt-sort {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #aaa;
    }
    .k3d-mkt-sort select {
      background: #252538;
      border: 1px solid #333;
      color: #ccc;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
    .k3d-mkt-filter-tags {
      display: flex;
      gap: 4px;
    }
    .k3d-mkt-filter-btn {
      padding: 4px 12px;
      border-radius: 16px;
      border: 1px solid #333;
      background: transparent;
      color: #aaa;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .k3d-mkt-filter-btn:hover {
      border-color: #4a9eff;
      color: #4a9eff;
    }
    .k3d-mkt-filter-btn.active {
      background: #4a9eff;
      border-color: #4a9eff;
      color: #fff;
    }
    .k3d-mkt-category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }
    .k3d-mkt-category-card {
      background: #252538;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }
    .k3d-mkt-category-card:hover {
      background: #2d2d42;
      transform: translateY(-1px);
    }
    .k3d-mkt-category-card i {
      font-size: 24px;
      color: #4a9eff;
      margin-bottom: 8px;
    }
    .k3d-mkt-category-name {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #ddd;
      margin-bottom: 4px;
    }
    .k3d-mkt-category-count {
      font-size: 11px;
      color: #666;
    }
    .k3d-mkt-detail {
      max-width: 900px;
    }
    .k3d-mkt-back-btn {
      background: transparent;
      border: 1px solid #333;
      color: #aaa;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 16px;
      transition: all 0.15s;
    }
    .k3d-mkt-back-btn:hover {
      border-color: #4a9eff;
      color: #4a9eff;
    }
    .k3d-mkt-detail-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .k3d-mkt-detail-gallery {
      min-height: 300px;
    }
    .k3d-mkt-detail-main-image {
      background: #181825;
      border-radius: 8px;
      height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .k3d-mkt-detail-main-image i {
      font-size: 60px;
      color: #333;
    }
    .k3d-mkt-detail-thumbs {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .k3d-mkt-thumb {
      width: 60px;
      height: 60px;
      background: #181825;
      border-radius: 6px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.15s;
    }
    .k3d-mkt-thumb.active {
      border-color: #4a9eff;
    }
    .k3d-mkt-detail-info h1 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin: 0 0 8px;
    }
    .k3d-mkt-detail-creator {
      color: #aaa;
      font-size: 13px;
      margin: 0 0 12px;
    }
    .k3d-mkt-stars-large {
      font-size: 18px;
      color: #fbbf24;
      margin-bottom: 12px;
    }
    .k3d-mkt-stars-large span {
      font-size: 13px;
      color: #888;
      margin-left: 8px;
    }
    .k3d-mkt-detail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
      color: #888;
      margin-bottom: 16px;
    }
    .k3d-mkt-detail-price-section {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .k3d-mkt-price-tag {
      font-size: 24px;
      font-weight: 700;
      color: #4a9eff;
    }
    .k3d-mkt-price-tag.free {
      color: #4ade80;
    }
    .k3d-mkt-license-badge {
      background: rgba(255,255,255,0.06);
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 11px;
      color: #aaa;
    }
    .k3d-mkt-detail-desc {
      color: #bbb;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .k3d-mkt-detail-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .k3d-mkt-tag {
      background: rgba(74,158,255,0.1);
      color: #4a9eff;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
    }
    .k3d-mkt-detail-actions {
      display: flex;
      gap: 8px;
    }
    .k3d-mkt-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .k3d-mkt-btn-primary {
      background: #4a9eff;
      color: #fff;
    }
    .k3d-mkt-btn-primary:hover {
      background: #3a8eef;
    }
    .k3d-mkt-btn-secondary {
      background: #333;
      color: #aaa;
    }
    .k3d-mkt-btn-secondary:hover {
      background: #444;
      color: #eee;
    }
    .k3d-mkt-btn-warning {
      background: #f59e0b;
      color: #fff;
    }
    .k3d-mkt-btn-warning:hover {
      background: #d97706;
    }
    .k3d-mkt-btn-icon {
      width: 36px;
      height: 36px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #333;
      color: #888;
    }
    .k3d-mkt-btn-icon:hover {
      background: #444;
      color: #eee;
    }
    .k3d-mkt-btn-large {
      width: 100%;
      padding: 12px;
      font-size: 15px;
      justify-content: center;
    }
    .k3d-mkt-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .k3d-mkt-detail-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #2a2a3e;
    }
    .k3d-mkt-detail-section h3 {
      font-size: 16px;
      font-weight: 600;
      color: #eee;
      margin: 0 0 16px;
    }
    .k3d-mkt-review {
      padding: 12px;
      background: #252538;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .k3d-mkt-review-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .k3d-mkt-review-date {
      color: #666;
      margin-left: auto;
    }
    .k3d-mkt-verified-badge {
      color: #4ade80;
      font-size: 11px;
    }
    .k3d-mkt-review p {
      color: #bbb;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
    }
    .k3d-mkt-checkout-layout {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 24px;
    }
    .k3d-mkt-checkout-form h1 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin: 0 0 20px;
    }
    .k3d-mkt-checkout-summary {
      background: #252538;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .k3d-mkt-checkout-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
      color: #ccc;
      border-bottom: 1px solid #2a2a3e;
    }
    .k3d-mkt-checkout-total {
      display: flex;
      justify-content: space-between;
      padding: 12px 0 0;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .k3d-mkt-checkout-stripe-info {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(74,158,255,0.1);
      padding: 10px;
      border-radius: 6px;
      font-size: 12px;
      color: #4a9eff;
      margin-bottom: 16px;
    }
    .k3d-mkt-checkout-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: rgba(251,191,36,0.1);
      padding: 10px;
      border-radius: 6px;
      font-size: 11px;
      color: #fbbf24;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .k3d-mkt-checkout-note code {
      background: rgba(0,0,0,0.3);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
    }
    .k3d-mkt-checkout-redirect-note {
      font-size: 11px;
      color: #666;
      margin-top: 8px;
      text-align: center;
    }
    .k3d-mkt-checkout-guarantee {
      background: #252538;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      text-align: center;
    }
    .k3d-mkt-checkout-guarantee i {
      font-size: 24px;
      color: #4a9eff;
      margin-bottom: 8px;
    }
    .k3d-mkt-checkout-guarantee h4 {
      color: #eee;
      margin: 0 0 4px;
      font-size: 13px;
    }
    .k3d-mkt-checkout-guarantee p {
      color: #888;
      font-size: 11px;
      margin: 0;
      line-height: 1.4;
    }
    .k3d-mkt-success-message {
      text-align: center;
      padding: 40px 20px;
    }
    .k3d-mkt-success-message i {
      font-size: 48px;
      color: #4ade80;
      margin-bottom: 16px;
    }
    .k3d-mkt-success-message h3 {
      color: #eee;
      font-size: 18px;
      margin: 0 0 8px;
    }
    .k3d-mkt-success-message p {
      color: #aaa;
      font-size: 13px;
      margin: 0 0 4px;
    }
    .k3d-mkt-success-message code {
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 3px;
      color: #4ade80;
    }
    .k3d-mkt-sim-note {
      color: #fbbf24;
      font-size: 11px;
      margin-top: 8px;
    }
    .k3d-mkt-error {
      color: #ef4444;
      text-align: center;
      padding: 40px;
    }
    .k3d-mkt-plugin-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .k3d-mkt-plugin-item {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #252538;
      border-radius: 8px;
      padding: 12px;
    }
    .k3d-mkt-plugin-item.disabled {
      opacity: 0.5;
    }
    .k3d-mkt-plugin-icon {
      width: 40px;
      height: 40px;
      background: #181825;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4a9eff;
      font-size: 18px;
      flex-shrink: 0;
    }
    .k3d-mkt-plugin-info {
      flex: 1;
    }
    .k3d-mkt-plugin-info h4 {
      font-size: 13px;
      font-weight: 600;
      color: #eee;
      margin: 0 0 4px;
    }
    .k3d-mkt-plugin-version {
      font-size: 11px;
      color: #666;
      font-weight: 400;
    }
    .k3d-mkt-plugin-info p {
      font-size: 11px;
      color: #888;
      margin: 0 0 4px;
      line-height: 1.4;
    }
    .k3d-mkt-plugin-meta {
      display: flex;
      gap: 8px;
      font-size: 10px;
      color: #666;
    }
    .k3d-mkt-plugin-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .k3d-mkt-creator-stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .k3d-mkt-stat-card {
      background: #252538;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .k3d-mkt-stat-card i {
      font-size: 24px;
      color: #4a9eff;
      margin-bottom: 8px;
    }
    .k3d-mkt-stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
    }
    .k3d-mkt-stat-label {
      font-size: 11px;
      color: #888;
      margin-top: 4px;
    }
    .k3d-mkt-product-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .k3d-mkt-product-list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #252538;
      border-radius: 8px;
      padding: 12px;
    }
    .k3d-mkt-product-list-info {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
    }
    .k3d-mkt-product-list-info h4 {
      font-size: 13px;
      font-weight: 600;
      color: #eee;
      margin: 0;
    }
    .k3d-mkt-product-status {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-draft { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .status-review { background: rgba(74,158,255,0.15); color: #4a9eff; }
    .status-published { background: rgba(74,222,128,0.15); color: #4ade80; }
    .status-rejected { background: rgba(239,68,68,0.15); color: #ef4444; }
    .k3d-mkt-product-list-actions {
      display: flex;
      gap: 4px;
    }
    .k3d-mkt-transaction-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .k3d-mkt-transaction-item {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      color: #aaa;
      padding: 8px;
      background: #252538;
      border-radius: 6px;
    }
    .k3d-mkt-preview-container {
      position: relative;
      overflow: hidden;
    }
    .k3d-mkt-preview-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #555;
      font-size: 12px;
    }
    .k3d-mkt-preview-loading i {
      font-size: 40px;
    }
    .k3d-mkt-stripe-redirect-info {
      text-align: center;
      padding: 24px;
    }
    .k3d-mkt-stripe-redirect-info i {
      font-size: 36px;
      color: #4a9eff;
      margin-bottom: 12px;
    }
    .k3d-mkt-stripe-redirect-info a {
      color: #4a9eff;
    }
    .k3d-mkt-stripe-redirect-note {
      font-size: 11px;
      color: #888;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}

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
          dbg.error('[Market] Launch failed:', err);
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
