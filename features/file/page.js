/**
 * File Operations — New, Open, Save, Import, Export.
 *
 * The "New Project" control surfaces a checkable grid of every bundled
 * default model so the user can OPTIONALLY seed a fresh project with
 * one or more character models before clearing the scene.  Empty selection
 * falls back to the default cube (matches the pre-feature behaviour).
 *
 * Wired to Studio API via `window.ProModelerApp`:
 *   - studio.newProject({ starterSlugs }) — multi-load path
 *   - studio.newProject()                 — legacy default-cube path
 *   - studio.importModel(...)             — multi-file glTF/GLB/OBJ/STL…
 *   - studio.exportModel(format)          — GLB/GLTF/OBJ/STL export
 *   - studio.loadProject(data)            — JSON project restore
 *   - studio.saveProject()                — JSON project save
 */
import { dbg } from '../../app/dbg.js';
import { DEFAULT_MODELS } from '../../app/defaultModels.js';
import { renderControls } from '../_shared/renderControls.js';
import { writeStatus, surfaceError } from '../../app/status-bar.js';

/**
 * Build the full controls array.  The New Project section is rendered
 * as a rich DOM widget (not via the simple renderControls path) because
 * it needs multi-checkbox state and a custom submit button.
 *
 * `render(container)` mounts the controls and the New-Project picker.
 */
function buildControls(container, state) {
  container.innerHTML = '';

  // ── New Project picker (custom DOM, richer than the meta.controls scheme) ──
  const newSection = document.createElement('div');
  newSection.className = 'ctrl-group';
  newSection.style.cssText = 'margin-bottom:14px;padding:10px;border:1px solid #333;border-radius:6px;background:rgba(74,158,255,0.05);';

  const newHeader = document.createElement('div');
  newHeader.className = 'ctrl-label';
  newHeader.style.cssText = 'color:#4a9eff;font-size:13px;font-weight:600;margin-bottom:6px;';
  newHeader.textContent = 'Start New Project';
  newSection.appendChild(newHeader);

  const newHint = document.createElement('div');
  newHint.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.5;';
  newHint.innerHTML = 'Pick one or more bundled starter models to seed the new scene, or click <b>Empty Project</b> to start with just the default cube.';
  newSection.appendChild(newHint);

  // Quick Empty Start button — always available, matches the legacy flow
  const emptyBtn = document.createElement('button');
  emptyBtn.className = 'ctrl-button';
  emptyBtn.dataset.key = 'empty-project';
  emptyBtn.style.cssText = 'width:100%;margin-bottom:10px;padding:6px;background:#3a3a4a;color:#eee;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
  emptyBtn.textContent = '⚪ Empty Project (default cube)';
  emptyBtn.addEventListener('click', () => {
    if (window.ProModelerApp) {
      // Defer the call into .then() so a sync throw inside newProject also
      // gets caught. (Promise.resolve(syncCall) evaluates synchronously and
      // would bypass .catch on a sync throw.)
      Promise.resolve().then(() => window.ProModelerApp.newProject()).catch(err => surfaceError(err, 'New project failed'));
    }
    closeIfHooked(container);
  });
  newSection.appendChild(emptyBtn);

  // Checkable list of starter assets
  const list = document.createElement('div');
  list.style.cssText = 'display:grid;grid-template-columns:1fr;gap:4px;max-height:240px;overflow-y:auto;margin-bottom:10px;padding:4px;background:rgba(0,0,0,0.25);border-radius:4px;';

  DEFAULT_MODELS.forEach((model) => {
    const row = document.createElement('label');
    row.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:5px 7px', 'border-radius:3px',
      'font-size:11px', 'color:#ccc', 'cursor:pointer',
      'transition:background .12s',
    ].join(';');
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(74,158,255,0.12)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.starterSlug = model.slug;
    cb.style.cssText = 'flex:0 0 auto;width:14px;height:14px;accent-color:#4a9eff;';

    const meta = document.createElement('span');
    meta.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    meta.innerHTML = `<b style="color:#eee">${model.displayName}</b> <span style="color:#666">· ${model.kind === 'gltf-dir' ? 'glTF' : model.kind.toUpperCase()} · ${model.character}</span>`;
    row.appendChild(cb);
    row.appendChild(meta);
    list.appendChild(row);
  });
  newSection.appendChild(list);

  // Start-with-picks button
  const seedBtn = document.createElement('button');
  seedBtn.className = 'ctrl-button';
  seedBtn.dataset.key = 'seed-project';
  seedBtn.style.cssText = 'width:100%;padding:8px;background:#4a9eff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;';
  seedBtn.textContent = '🆕 Start Project with Selected Assets';
  seedBtn.addEventListener('click', () => {
    const picked = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
      .map((c) => c.dataset.starterSlug)
      .filter(Boolean);
    if (picked.length === 0) {
      dbg.warn('[File] No starter assets checked — falling back to empty project');
      if (window.ProModelerApp) {
        // Defer the call into .then() so a sync throw inside newProject also
        // gets caught. (Promise.resolve(syncCall) evaluates synchronously and
        // would bypass .catch on a sync throw.)
        Promise.resolve().then(() => window.ProModelerApp.newProject()).catch(err => surfaceError(err, 'New project failed'));
      }
      closeIfHooked(container);
      return;
    }
    dbg.log(`[File] Starting project with ${picked.length} starter asset(s):`, picked);
    if (window.ProModelerApp) {
      // Defer the call into .then() so a synchronous throw inside newProject
      // also gets caught. Promise.resolve(result) would evaluate result
      // synchronously before the wrapper, bypassing .catch on a sync throw.
      Promise.resolve().then(() => window.ProModelerApp.newProject({ starterSlugs: picked })).catch(err => surfaceError(err, 'New project failed'));
    }
    closeIfHooked(container);
  });
  newSection.appendChild(seedBtn);

  container.appendChild(newSection);

  // ── Separator ──
  const sep1 = document.createElement('div');
  sep1.className = 'ctrl-label';
  sep1.style.cssText = 'font-size:11px;color:#555;text-align:center;padding:4px 0;border-top:1px solid #333;margin:10px 0;';
  sep1.textContent = '────────── Open / Save ──────────';
  container.appendChild(sep1);

  // ── Open / Save / Import / Export — same options as before, via renderControls ──
  const meta = {
    controls: [
      { key: 'open', label: 'Open Project (.json)', type: 'button', onClick: () => {
        const inp = document.getElementById('projectOpen');
        if (!inp) return;
        inp.value = '';
        inp.accept = '.json';
        inp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target.result);
              if (window.ProModelerApp) {
                if (typeof window.ProModelerApp.loadProject === 'function') {
                  // Defer the call into .then() so a synchronous throw inside
                  // loadProject also gets caught. Promise.resolve(fn()) would
                  // evaluate fn() first and bypass the .catch on a sync throw.
                  // Promise.resolve() then handles async rejection uniformly.
                  Promise.resolve().then(() => window.ProModelerApp.loadProject(data)).catch((err) => surfaceError(err, 'Open failed'));
                } else if (data.objects) {
                  // Best-effort fallback for older engines. Surface both to log + status bar
                  // so the failure is visible without DevTools open.
                  window.ProModelerApp.objects = [];
                  dbg.warn('[File] Studio lacks loadProject — ingested objects dropped on the floor');
                  writeStatus('Open: studio lacks loadProject; data dropped');
                }
              }
            } catch (err) {
              surfaceError(err, 'Open failed');
            }
          };
          reader.readAsText(file);
        };
        inp.click();
      } },
      { key: 'save', label: 'Save Project (JSON)', type: 'button', onClick: () => {
        if (!window.ProModelerApp?.saveProject) { dbg.warn('[File] Studio has no saveProject'); return; }
        window.ProModelerApp.saveProject();
      } },
      { key: 'sep2', label: '──────────', type: 'label' },
      { key: 'import', label: 'Import Model (GLTF/GLB + .bin + textures)', type: 'button', onClick: () => importFromFile() },
      { key: 'sep3', label: '──────────', type: 'label' },
      { key: 'export-glb',  label: 'Export Selected as GLB',  type: 'button', onClick: () => window.ProModelerApp?.exportModel?.('glb') },
      { key: 'export-gltf', label: 'Export Selected as GLTF', type: 'button', onClick: () => window.ProModelerApp?.exportModel?.('gltf') },
      { key: 'export-obj',  label: 'Export Selected as OBJ',  type: 'button', onClick: () => window.ProModelerApp?.exportModel?.('obj') },
      { key: 'export-stl',  label: 'Export Selected as STL',  type: 'button', onClick: () => window.ProModelerApp?.exportModel?.('stl') },
    ],
    onApply: (state, app) => { dbg.log('[File] OK — project state applied'); },
  };

  renderControls(container, meta.controls);
}

/**
 * Open the hidden `#projectOpen` input as a multi-file model picker.
 * Mirrors the prior projectOpen.click() pattern from the old monolithic
 * UI page so import continues to work end-to-end.
 */
function importFromFile() {
  const inp = document.getElementById('projectOpen');
  if (!inp) return;
  inp.value = '';
  inp.multiple = true;
  inp.accept = '.gltf,.glb,.obj,.stl,.bin,.png,.jpg,.jpeg,.webp,.hdr,.ktx2';
  inp.onchange = (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const fileMap = Object.fromEntries(fileList.map((f) => [f.name, URL.createObjectURL(f)]));
    const mainFile = fileList.find((f) => /\.(gltf|glb|obj|stl)$/i.test(f.name)) || fileList[0];
    // studio.importModel is `async` so it always returns a Promise with .catch.
    // The optional-chain (?.) may yield undefined if the studio isn't mounted
    // or lacks an importModel method — guard only against that, not against the
    // catch method itself.
    const importPromise = window.ProModelerApp?.importModel?.({
      url: fileMap[mainFile.name],
      files: fileMap,
      name: mainFile.name,
    });
    if (importPromise) {
      importPromise.catch((err) => surfaceError(err, 'Import failed'));
    }
  };
  inp.click();
}

/**
 * Close the popup if the shell wires a close hook.  No-op if not present.
 */
function closeIfHooked(/* container */) {
  if (typeof window.__closeFilePopup === 'function') {
    window.__closeFilePopup();
  }
}

export const meta = { controls: [] };   // legacy export — actual UI in render()
export function render(container, state) {   // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "file";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "file");
  }
buildControls(container, state); }
