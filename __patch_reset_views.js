/* One-shot CRLF-safe patcher that:
 *  1. Injects the floating Reset View button into tools/pose/main.js
 *     (anchored after the existing event listener block).
 *  2. Replaces the previous Blender injection in tools/blender/script.js
 *     with a corrected version that uses Box3.setFromObject().getCenter()
 *     for the framing target — so tall/wide/short models all frame
 *     consistently. */
const fs = require('fs');
const path = require('path');

const NL = '\n';
const esc = (s) => s.split(NL).join('\r\n');

function patch(file, from, to, label) {
  const fp = path.join(__dirname, file);
  let raw = fs.readFileSync(fp, 'utf8');
  if (!raw.includes('\r\n')) {
    console.error(`PATCH FAIL [${label}]: ${file} is not CRLF`);
    process.exit(1);
  }
  const fromCR = esc(from);
  const toCR = esc(to);
  if (!raw.includes(fromCR)) {
    console.error(`PATCH MISS [${label}]: anchor not found in ${file}`);
    process.exit(1);
  }
  // Replace ALL occurrences to be idempotent across re-runs.
  let count = 0;
  while (raw.includes(fromCR)) {
    raw = raw.replace(fromCR, toCR);
    count++;
  }
  fs.writeFileSync(fp, raw, 'utf8');
  console.log(`OK [${label}] — ${count} replacement(s) in ${file}`);
}

// ── 1) pose/main.js: inject the button after the existing event block ───
patch(
  'tools/pose/main.js',
  `    animateButton.addEventListener('click', onAnimateClick);
    resetButton.addEventListener('click', resetModelToInitialPose);
    audioToggleButton.addEventListener('click', toggleAudio);`,
  `    animateButton.addEventListener('click', onAnimateClick);
    resetButton.addEventListener('click', resetModelToInitialPose);
    audioToggleButton.addEventListener('click', toggleAudio);

    // Floating "Reset View" button — mirrors app/engine.js's
    // handleMenuAction('reset-view') so users can re-frame the camera
    // at the canonical 10-unit / 35\u00B0 downward viewpoint after
    // navigating away. Uses Box3.getCenter so tall/wide/short models
    // all frame consistently. Falls back to the humanoid model (or
    // scene origin) when nothing is selected.
    {
        if (!document.getElementById('pose-reset-view')) {
            const btn = document.createElement('button');
            btn.id = 'pose-reset-view';
            btn.textContent = '\uD83C\uDFAF Reset View';
            btn.title = 'Re-frame camera at 10-unit / 35\u00B0 downward viewpoint';
            btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;padding:8px 14px;border:1px solid #4a9eff;border-radius:6px;background:rgba(74,158,255,0.12);color:#4a9eff;font:600 12px/1 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(4px);transition:background .15s,color .15s;';
            btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(74,158,255,0.28)'; btn.style.color = '#fff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(74,158,255,0.12)'; btn.style.color = '#4a9eff'; });
            btn.addEventListener('click', () => {
                const target = (() => {
                    if (typeof humanoidModel !== 'undefined' && humanoidModel) {
                        const box = new THREE.Box3().setFromObject(humanoidModel);
                        return box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
                    }
                    return new THREE.Vector3(0, 0, 0);
                })();
                frameAtDistance(camera, controls, target, 10, 35, 25);
            });
            document.body.appendChild(btn);
        }
    }`,
  'pose inject'
);

// ── 2) blender/script.js: replace the previous (position-only) injection ─
patch(
  'tools/blender/script.js',
  `        btn.addEventListener('click', () => {
            const target = activeObject
                ? new THREE.Vector3().setFromMatrixPosition(activeObject.matrixWorld)
                : new THREE.Vector3(0, 0, 0);
            frameAtDistance(camera, controls, target, 10, 35, 25);
        });`,
  `        btn.addEventListener('click', () => {
            // Use Box3 center so tall/wide/short models frame consistently.
            const target = (() => {
                if (activeObject) {
                    const box = new THREE.Box3().setFromObject(activeObject);
                    return box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
                }
                return new THREE.Vector3(0, 0, 0);
            })();
            frameAtDistance(camera, controls, target, 10, 35, 25);
        });`,
  'blender Box3 fix'
);
