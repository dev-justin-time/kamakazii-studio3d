/**
 * Inventory feature page — Pick-and-load the studio's bundled default models.
 *
 * Renders a card grid of every entry in app/defaultModels.js (`.glb` and
 * multi-file glTF folder assets both supported). Clicking a card calls
 * `studio.loadDefaultModel(slug)`, which replaces the boot-time default cube
 * with the chosen character.
 *
 * Exposed via `window.ProModelerApp.getDefaultModels()` so scripts/testing
 * tooling can also drive the registry programmatically.
 */

import { DEFAULT_MODELS } from '../../app/defaultModels.js';
import { dbg } from '../../app/dbg.js';

// Pure-DOM render — popupContent lives in features/_shared/popupPage.js
// but we implement inline here for tighter styling control of the grid.
export function render(container, state) {
  const studio = (state && typeof state.get === 'function' && state.get('studio'))
              || window.ProModelerApp;

  container.innerHTML = '';

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:14px;';
  header.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#eee">Starter Models</div>
    <div style="font-size:11px;color:#888;margin-top:3px;line-height:1.5">
      ${DEFAULT_MODELS.length} bundled characters &mdash; replace the default cube with one click.
      Standalone <code>.glb</code> entries load instantly; multi-file glTF folders fetch
      <code>scene.gltf</code> + <code>scene.bin</code> + textures, then bundle them.
    </div>
  `;
  container.appendChild(header);

  // ── Two-section grid: Standalone .glb | Multi-file folders ──
  const byKind = {
    'glb': DEFAULT_MODELS.filter(m => m.kind === 'glb'),
    'gltf-dir': DEFAULT_MODELS.filter(m => m.kind === 'gltf-dir'),
  };

  for (const [kind, list] of Object.entries(byKind)) {
    if (list.length === 0) continue;

    const sectionLabel = document.createElement('div');
    sectionLabel.style.cssText = 'margin:10px 0 6px;font-size:11px;color:#4a9eff;text-transform:uppercase;letter-spacing:1px;font-weight:600;';
    sectionLabel.textContent = kind === 'glb' ? 'Standalone .glb' : 'Multi-file glTF folders';
    container.appendChild(sectionLabel);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr;gap:6px;';

    list.forEach(model => {
      grid.appendChild(_renderCard(model, studio, container));
    });

    container.appendChild(grid);
  }

  // ── Footer: slug list for the console / scripts ──
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #333;font-size:10px;color:#555;line-height:1.6;';
  footer.innerHTML = `
    <div>All ${DEFAULT_MODELS.length} slugs:</div>
    <div style="font-family:monospace;word-break:break-word;margin-top:3px;color:#888">
      ${listDefaultModelSlugs().join(' · ')}
    </div>
  `;
  container.appendChild(footer);
  // Note: the shell automatically appends an OK button via _addOkButton()
  // after render() returns, so we don't add our own close button here.
}

/**
 * One card per model. Shows display name, fidelity, character slug, tags,
 * and a Load button. While loading, the card swaps its button to a status
 * label so multiple clicks don't queue duplicate fetches.
 */
function _renderCard(model, studio, container) {
  const card = document.createElement('div');
  card.style.cssText = [
    'display:flex', 'align-items:center', 'gap:10px',
    'padding:8px 10px', 'border:1px solid #333', 'border-radius:6px',
    'background:rgba(255,255,255,0.03)', 'transition:border-color .15s,background .15s',
  ].join(';');
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = '#4a9eff';
    card.style.background = 'rgba(74,158,255,0.06)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = '#333';
    card.style.background = 'rgba(255,255,255,0.03)';
  });

  // Avatar slot — small letter-chip (no thumbnails yet)
  const avatar = document.createElement('div');
  const initials = (model.displayName || model.slug).slice(0, 2).toUpperCase();
  avatar.textContent = initials;
  const hue = _hueFor(model.slug);
  avatar.style.cssText = [
    'flex:0 0 36px', 'width:36px', 'height:36px',
    'display:flex', 'align-items:center', 'justify-content:center',
    `background:hsl(${hue},40%,25%)`, `color:hsl(${hue},80%,75%)`,
    'border-radius:6px', 'font-weight:700', 'font-size:12px',
    'font-family:monospace', 'flex-shrink:0',
  ].join(';');
  card.appendChild(avatar);

  // Text block
  const text = document.createElement('div');
  text.style.cssText = 'flex:1;min-width:0;';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;color:#eee;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  title.textContent = model.displayName;
  text.appendChild(title);
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:10px;color:#888;margin-top:2px;';
  sub.textContent = `${model.kind === 'glb' ? 'GLB' : 'glTF folder'} · ${model.character} · ${model.fidelity}${model.tags.length ? ' · ' + model.tags.join(', ') : ''}`;
  text.appendChild(sub);
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:10px;color:#666;margin-top:2px;line-height:1.4;';
  desc.textContent = model.description;
  text.appendChild(desc);
  // ── Licence badge (so the user always sees the terms before loading) ──
  if (model.licenseFile) {
    const licenceRow = document.createElement('div');
    licenceRow.style.cssText = [
      'display:flex', 'align-items:center', 'gap:6px',
      'margin-top:4px', 'padding-top:3px',
      'border-top:1px solid rgba(255,255,255,0.06)',
      'font-size:9px', 'line-height:1.3',
    ].join(';');
    const isUnknown = model.licenseFile.includes('LICENCE-UNKNOWN');
    const badge = document.createElement('span');
    badge.style.cssText = [
      'display:inline-block', 'flex:0 0 auto',
      'padding:1px 5px', 'border-radius:3px',
      'font-weight:600', 'letter-spacing:0.4px',
      isUnknown
        ? 'background:rgba(255,170,0,0.18);color:#ffaa00;border:1px solid rgba(255,170,0,0.4);'
        : 'background:rgba(74,158,255,0.18);color:#4a9eff;border:1px solid rgba(74,158,255,0.4);',
    ].join(';');
    badge.textContent = isUnknown ? '⚠ unknown' : 'CC ⚖';
    licenceRow.appendChild(badge);
    const link = document.createElement('a');
    link.href = model.licenseFile;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = [
      'flex:1', 'min-width:0',
      'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
      'color:#888', 'text-decoration:none',
      'cursor:pointer',
    ].join(';');
    link.title = model.licenseFile;
    link.textContent = isUnknown
      ? `${model.licenseFile.split('/').pop()}  (replace before shipping)`
      : model.licenseFile.split('/').pop();
    link.addEventListener('mouseenter', () => { link.style.color = '#4a9eff'; });
    link.addEventListener('mouseleave', () => { link.style.color = '#888'; });
    licenceRow.appendChild(link);
    text.appendChild(licenceRow);
  }
  card.appendChild(text);

  // Load button
  const btn = document.createElement('button');
  btn.textContent = 'Load';
  btn.style.cssText = [
    'flex:0 0 auto', 'padding:6px 14px', 'border:none', 'border-radius:4px',
    'background:#4a9eff', 'color:#fff', 'font-size:12px', 'font-weight:600',
    'cursor:pointer', 'transition:background .15s',
  ].join(';');
  btn.addEventListener('mouseenter', () => btn.style.background = '#3a8eef');
  btn.addEventListener('mouseleave', () => btn.style.background = '#4a9eff');
  btn.addEventListener('click', async () => {
    if (!studio || typeof studio.loadDefaultModel !== 'function') {
      btn.textContent = 'No App';
      btn.style.background = '#a04040';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Loading…';
    btn.style.background = '#555';
    try {
      const root = await studio.loadDefaultModel(model.slug);
      if (root) {
        btn.textContent = 'Loaded ✓';
        btn.style.background = '#22a55a';
        card.style.borderColor = '#22a55a';
      } else {
        btn.textContent = 'Failed';
        btn.style.background = '#a04040';
        btn.disabled = false;
      }
    } catch (err) {
      btn.textContent = 'Error';
      btn.style.background = '#a04040';
      btn.disabled = false;
      // eslint-disable-next-line no-console
      dbg.error('Load failed:', err);
    }
  });
  card.appendChild(btn);

  return card;
}

/** Stable per-slug hue so each card has its own colour. */
function _hueFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}
