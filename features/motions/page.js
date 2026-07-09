/**
 * Motions — Motion Database UI
 *
 * Browse every auto-extracted clip, apply to the currently selected
 * model, and download / import the full database as a portable JSON.
 *
 * Wired into the shell via `app/shell.js`'s "Animation & Rigging" group —
 * the shell dynamically imports `features/motions/page.js` when the icon
 * is clicked (see features/inventory/page.js for the precedent).
 */
import { renderControls } from '../_shared/renderControls.js';

// tiny helper used by the meta-button showValue callbacks
const _getApp = () => (typeof window !== 'undefined' ? window.ProModelerApp : null);

const meta = {
  controls: [
    { key: 'motions-header', type: 'label', label: '💾 Motion Database — auto-extracted from every import' },

    { key: 'motions-list', type: 'label', label: 'Loading…' },

    { key: 'motions-actions-sep', label: '──────────', type: 'label' },

    {
      key: 'motions-apply',
      label: '▶ Apply Selected Motion to Model',
      type: 'button',
      onClick: async (_state) => {
        const app = _getApp();
        if (!app) return;
        const sel = document.querySelector('#popupContent select[data-key="motions-list"]');
        const id = sel?.value;
        if (!id) { alert('Pick a motion from the list first.'); return; }
        if (!app.selectedObject) {
          alert('Select a model in the scene first — then re-open this panel to apply.');
          return;
        }
        const res = await app.applyMotionToObject(id);
        if (!res?.ok) alert('Could not apply: ' + (res?.reason || 'unknown'));
      },
    },

    {
      key: 'motions-refresh',
      label: '🔄 Refresh List',
      type: 'button',
      onClick: async () => { await _refreshList(); },
    },

    {
      key: 'motions-export',
      label: '⬇️ Download Database (JSON)',
      type: 'button',
      onClick: async () => {
        const { exportMotionsDatabase } = await import('../../editor/motionStorage.js');
        const r = await exportMotionsDatabase();
        const el = document.querySelector('#popupContent [data-key="motions-export-label"]');
        if (el) el.textContent = `✔ Downloaded motion-db.json (${r.count} motions)`;
      },
    },
    { key: 'motions-export-label', type: 'label', label: '' },

    {
      key: 'motions-import',
      label: '⬆️ Import Database (JSON)',
      type: 'button',
      onClick: async () => {
        document.getElementById('motions-import-input')?.click();
      },
    },
    { key: 'motions-import-label', type: 'label', label: '' },

    { key: 'motions-danger-sep', label: '──────────', type: 'label' },
    {
      key: 'motions-delete',
      label: '🗑 Delete Selected Motion',
      type: 'button',
      onClick: async () => {
        const sel = document.querySelector('#popupContent select[data-key="motions-list"]');
        const id = sel?.value;
        if (!id) { alert('Pick a motion from the list first.'); return; }
        if (!confirm('Delete this motion from the database? This cannot be undone.')) return;
        const { deleteMotion } = await import('../../editor/motionStorage.js');
        await deleteMotion(id);
        await _refreshList();
      },
    },
    {
      key: 'motions-clear',
      label: '🧹 Clear Entire Database',
      type: 'button',
      onClick: async () => {
        if (!confirm('Delete EVERY motion from the database? This cannot be undone.')) return;
        const { clearAllMotions } = await import('../../editor/motionStorage.js');
        await clearAllMotions();
        await _refreshList();
      },
    },
  ],
};

export { meta };

/** Refresh the `<select>` listing every cached motion. */
async function _refreshList() {
  let list;
  try {
    const { listMotions } = await import('../../editor/motionStorage.js');
    list = await listMotions();
  } catch (_) {
    list = [];
  }
  const sel = document.querySelector('#popupContent select[data-key="motions-list"]');
  if (!sel) return;
  sel.innerHTML = '';
  if (!list || list.length === 0) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '(no motions yet — import a model)';
    sel.appendChild(o);
    const hdr = document.querySelector('#popupContent [data-key="motions-list"]');
    if (hdr) hdr.textContent = '0 clips stored';
    return;
  }
  for (const m of list) {
    const o = document.createElement('option');
    o.value = m.id;
    const dur = Number(m.duration || 0).toFixed(2);
    o.textContent = `${m.name || 'Clip'}  ·  ${dur}s  ·  ${m.sourceModel || '?'}  [${m.trackCount || 0} tracks]`;
    sel.appendChild(o);
  }
  const hdr = document.querySelector('#popupContent [data-key="motions-list"]');
  if (hdr) hdr.textContent = `${list.length} clip${list.length === 1 ? '' : 's'} stored`;
}

export async function render(container, _state) {
  renderControls(container, meta.controls);

  // Populate the select once the dropdown DOM exists (renderControls is sync,
  // the select is appended immediately)
  await _refreshList();

  // Hidden file input for the "Import Database" button
  let input = document.getElementById('motions-import-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'motions-import-input';
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.cssText = 'display:none;';
    document.body.appendChild(input);
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const { importMotionsDatabase } = await import('../../editor/motionStorage.js');
      const r = await importMotionsDatabase(file);
      const lbl = document.querySelector('#popupContent [data-key="motions-import-label"]');
      if (lbl) lbl.textContent = `✔ Imported ${r.added} new motion(s) (${r.skipped} duplicate skipped)`;
      input.value = '';
      await _refreshList();
    });
  }
}
