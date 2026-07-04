/**
 * MarketplaceAPI Unit Test
 *
 * Verifies that MarketplaceAPI can be imported and constructed without errors.
 * This is a smoke test for the ES module import chain — if PluginRegistry,
 * AssetBundler, or any other sub-module has a broken import, this test fails.
 *
 * Run by opening studio/marketplace/test/index.html in a browser
 * while the dev server is running (npm run start).
 */

export async function runTest() {
  // ── 1. Import ──
  console.log('[Test] Importing MarketplaceAPI...');
  const { MarketplaceAPI } = await import('../index.js');
  console.log('[Test] MarketplaceAPI imported successfully');

  // ── 2. Create minimal mock editorState ──
  const mockEditorState = {
    version: '1.0.0',
    ui: {
      log: (msg, level) => console.log(`[Editor UI] ${level || 'info'}: ${msg}`),
    },
    // Minimal stubs for subsystems that might access editor properties
    scene: null,
    camera: null,
    renderer: null,
    objects: [],
    selectedObject: null,
    handleMenuAction: () => {},
  };

  // ── 3. Construct ──
  console.log('[Test] Constructing MarketplaceAPI...');
  const api = new MarketplaceAPI(mockEditorState);
  console.log('[Test] MarketplaceAPI constructed successfully');
  console.log(`[Test]   plugins: ${api.plugins.getInstalled().length} installed`);
  console.log(`[Test]   store products: ${api.store.products.size}`);

  // ── 4. Init ──
  console.log('[Test] Calling api.init()...');
  const initResult = await api.init();
  console.log(`[Test]   init returned: ${JSON.stringify(initResult)}`);

  // ── 5. Verify subsystem shapes ──
  console.log('[Test] Verifying subsystem interfaces...');

  const checks = [
    ['api.plugins',          typeof api.plugins.install === 'function'],
    ['api.plugins.emit',     typeof api.plugins.emit === 'function'],
    ['api.assets',           typeof api.assets === 'object'],
    ['api.licenses',         typeof api.licenses.grantEntitlement === 'function'],
    ['api.monetization',     typeof api.monetization.createCheckout === 'function'],
    ['api.store',            typeof api.store.getCategories === 'function'],
    ['api.creator',          typeof api.creator.getDashboardStats === 'function'],
    ['api.init',             typeof api.init === 'function'],
    ['api.serialize',        typeof api.serialize === 'function'],
    ['api.getDashboard',     typeof api.getDashboard === 'function'],
  ];

  let allPassed = true;
  for (const [name, ok] of checks) {
    if (ok) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ ${name} — missing or not a function`);
      allPassed = false;
    }
  }

  // ── 6. Serialize/deserialize round-trip ──
  console.log('[Test] Serialize/deserialize round-trip...');
  const serialized = api.serialize();
  const api2 = new MarketplaceAPI(mockEditorState);
  api2.deserialize(serialized);
  console.log('[Test] Deserialize completed');

  // ── 7. Plugin install/disable/enable lifecycle ──
  console.log('[Test] Plugin lifecycle (install → disable → enable)...');
  const pluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Unit Test',
    description: 'Auto-generated test plugin for lifecycle validation',
    hooks: {
      onBoot: () => console.log('[Test] Test plugin onBoot fired'),
    },
  };
  const installResult = await api.plugins.install(pluginManifest);
  console.log(`  Install: ${installResult.success ? '✅' : '❌'} ${installResult.error || ''}`);
  allPassed = allPassed && installResult.success;

  const disableResult = api.plugins.disable('test-plugin');
  console.log(`  Disable: ${disableResult.success ? '✅' : '❌'} ${disableResult.error || ''}`);
  allPassed = allPassed && disableResult.success;

  const enableResult = api.plugins.enable('test-plugin');
  console.log(`  Re-enable: ${enableResult.success ? '✅' : '❌'} ${enableResult.error || ''}`);
  allPassed = allPassed && enableResult.success;

  const uninstallResult = api.plugins.uninstall('test-plugin');
  console.log(`  Uninstall: ${uninstallResult.success ? '✅' : '❌'} ${uninstallResult.error || ''}`);
  allPassed = allPassed && uninstallResult.success;

  // ── 8. Hook emission ──
  console.log('[Test] Hook emission (emit onBoot)...');
  const hookResults = api.plugins.emit('onBoot', { version: '1.0.0' });
  console.log(`  ${hookResults.length} handler(s) executed`);

  // ── Summary ──
  console.log('');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(allPassed
    ? '✅ ALL CHECKS PASSED'
    : '❌ SOME CHECKS FAILED'
  );

  return allPassed;
}
