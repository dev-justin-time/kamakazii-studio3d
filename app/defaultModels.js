/**
 * Default-model registry — bundled starter characters that ship with the
 * studio under /assets/models/. Two layouts are supported:
 *
 *   kind: 'glb'       — single self-contained binary glTF, passed straight to
 *                        studio.importModel(url) once the URL is fetched.
 *   kind: 'gltf-dir'  — multi-file package (scene.gltf + scene.bin +
 *                        textures/*) loaded via resolveDefaultPackage(),
 *                        which fetches every referenced asset and builds a
 *                        { url, files, name } blob-URL package ready for
 *                        studio.importModel({ url, files, name }).
 *
 * The slug is unique per asset and is what callers pass to
 * studio.loadDefaultModel(slug). When both a .glb and an updated-texture
 * folder share the same base name, the folder is suffixed with `_dir` to
 * keep slugs distinct (e.g. `monk_the_husky_updated_texture` is the .glb;
 * `monk_the_husky_updated_texture_dir` is the folder of the same name).
 */

const MODELS_BASE = './assets/models';

/** @typedef {{
 *   slug: string,
 *   displayName: string,
 *   kind: 'glb' | 'gltf-dir',
 *   url: string,
 *   description: string,
 *   character: 'mario' | 'ghost' | 'cat' | 'lion' | 'fox' | 'wolf' | 'tiger'
 *             | 'husky' | 'hawk' | 'hedgehog',
 *   tags: string[],
 *   fidelity: 'original' | 'updated'
 * }} DefaultModelEntry
 */

/** @type {DefaultModelEntry[]} */
export const DEFAULT_MODELS = [
  // ── Standalone .glb files (highest fidelity, single binary download) ──
  {
    slug: 'simba',
    displayName: 'Simba',
    kind: 'glb',
    url: `${MODELS_BASE}/simba.glb`,
    description: 'Lion cub character — rigged for animation',
    character: 'lion',
    tags: ['lion', 'cub', 'star-sparrow'],
    fidelity: 'updated',
  },
  {
    slug: 'jessie_the_fox_updated_texture',
    displayName: 'Jessie the Fox',
    kind: 'glb',
    url: `${MODELS_BASE}/jessie_the_fox_updated_texture.glb`,
    description: 'Vixen-style fox character with high-detail texture map',
    character: 'fox',
    tags: ['fox', 'vixen'],
    fidelity: 'updated',
  },
  {
    slug: 'jack_the_wolf_updated_texture',
    displayName: 'Jack the Wolf (high-fidelity)',
    kind: 'glb',
    url: `${MODELS_BASE}/jack_the_wolf_updated_texture.glb`,
    description: 'Wolf character in the updated-texture variant',
    character: 'wolf',
    tags: ['wolf'],
    fidelity: 'updated',
  },
  {
    slug: 'monk_the_husky_updated_texture',
    displayName: 'Monk the Husky (high-fidelity)',
    kind: 'glb',
    url: `${MODELS_BASE}/monk_the_husky_updated_texture.glb`,
    description: 'Sled-pulling husky with refined PBR materials',
    character: 'husky',
    tags: ['husky', 'sled-dog'],
    fidelity: 'updated',
  },

  // ── Mario-universe ghosts ──
  {
    slug: 'big_boo_super_mario_world_custom',
    displayName: 'Big Boo',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/big_boo_super_mario_world_custom/scene.gltf`,
    description: 'Giant King Boo boss variant from Super Mario World',
    character: 'ghost',
    tags: ['mario', 'boo', 'boss'],
    fidelity: 'updated',
  },
  {
    slug: 'boo',
    displayName: 'Boo',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/boo/scene.gltf`,
    description: 'Standard Boo ghost — Mario universe',
    character: 'ghost',
    tags: ['mario', 'boo'],
    fidelity: 'original',
  },
  {
    slug: 'cute_spooky_cat',
    displayName: 'Cute Spooky Cat',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/cute_spooky_cat/scene.gltf`,
    description: 'Cartoon-stylized ghost kitty',
    character: 'cat',
    tags: ['spooky', 'cat', 'ghost'],
    fidelity: 'original',
  },

  // ── Forest-cast lineup (Big-Bad-Wolfwood / Star-Sparrow series) ──
  {
    slug: 'duke_the_lion',
    displayName: 'Duke the Lion',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/duke_the_lion/scene.gltf`,
    description: 'Stately lion with a full mane',
    character: 'lion',
    tags: ['lion', 'mane'],
    fidelity: 'original',
  },
  {
    slug: 'henery_hawk',
    displayName: 'Henery Hawk',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/henery-hawk/scene.gltf`,
    description: 'Hawk character from the Looney Tunes-style cast',
    character: 'hawk',
    tags: ['hawk', 'bird'],
    fidelity: 'original',
  },
  {
    slug: 'jack_the_wolf',
    displayName: 'Jack the Wolf',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/jack_the_wolf/scene.gltf`,
    description: 'Wolf character (original texture set)',
    character: 'wolf',
    tags: ['wolf'],
    fidelity: 'original',
  },
  {
    slug: 'jack_the_wolf_updated_texture_dir',
    displayName: 'Jack the Wolf (updated)',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/jack_the_wolf_updated_texture/scene.gltf`,
    description: 'Wolf with the upgraded texture set, in the folder layout',
    character: 'wolf',
    tags: ['wolf'],
    fidelity: 'updated',
  },
  {
    slug: 'jade_the_tiger',
    displayName: 'Jade the Tiger',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/jade_the_tiger/scene.gltf`,
    description: 'Striped tiger with emerald accents',
    character: 'tiger',
    tags: ['tiger', 'jade'],
    fidelity: 'original',
  },
  {
    slug: 'monk_the_husky',
    displayName: 'Monk the Husky',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/monk_the_husky/scene.gltf`,
    description: 'Husky character with the original texture set',
    character: 'husky',
    tags: ['husky', 'sled-dog'],
    fidelity: 'original',
  },
  {
    slug: 'monk_the_husky_updated_texture_dir',
    displayName: 'Monk the Husky (updated)',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/monk_the_husky_updated_texture/scene.gltf`,
    description: 'Husky with the upgraded texture set, in the folder layout',
    character: 'husky',
    tags: ['husky', 'sled-dog'],
    fidelity: 'updated',
  },
  {
    slug: 'nix_the_fox',
    displayName: 'Nix the Fox',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/nix_the_fox/scene.gltf`,
    description: 'Fox character with the original texture set',
    character: 'fox',
    tags: ['fox'],
    fidelity: 'original',
  },
  {
    slug: 'nix_the_fox_updated_texture',
    displayName: 'Nix the Fox (updated)',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/nix_the_fox_updated_texture/scene.gltf`,
    description: 'Fox with the upgraded texture set',
    character: 'fox',
    tags: ['fox'],
    fidelity: 'updated',
  },
  {
    slug: 'shadow_the_hedgehog',
    displayName: 'Shadow the Hedgehog',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/shadow_the_hedgehog_sonic_forcesgmod/scene.gltf`,
    description: 'GMod/Sonic-Forces-style hedgehog (underscore variant)',
    character: 'hedgehog',
    tags: ['hedgehog', 'sonic', 'shadow'],
    fidelity: 'original',
  },
  {
    slug: 'shadow_the_hedgehog_hyphen',
    displayName: 'Shadow the Hedgehog (hyphen)',
    kind: 'gltf-dir',
    url: `${MODELS_BASE}/shadow-the-hedgehog-sonic-forcesgmod/scene.gltf`,
    description: 'GMod/Sonic-Forces-style hedgehog (hyphen variant)',
    character: 'hedgehog',
    tags: ['hedgehog', 'sonic', 'shadow'],
    fidelity: 'original',
  },
];

/** Find an entry by slug. Returns `undefined` if not found. */
export function findDefaultModel(slug) {
  return DEFAULT_MODELS.find(m => m.slug === slug);
}

/** All slugs — handy for UI affordances and tests. */
export function listDefaultModelSlugs() {
  return DEFAULT_MODELS.map(m => m.slug);
}

/**
 * Caveat: the fetcher only walks top-level `buffers[].uri` and `images[].uri`.
 * Bundled assets here are vanilla PBR glTFs and don't use Draco/KTX2/
 * `KHR_materials_specular` extensions that would introduce out-of-band URIs;
 * if such extensions are added later, augment the referrer walk accordingly.
 */

/**
 * Resolve a default model entry to a value that `studio.importModel()` can
 * consume directly.
 *
 * - For `.glb` entries, this returns the URL string (`studio.importModel` has
 *   its own URL loading path).
 * - For folder entries, this fetches `scene.gltf` first, parses it to discover
 *   the `.bin` and any texture URIs it references, fetches every referenced
 *   asset, and bundles them as a `{ url, files, name }` package where every
 *   filename in `files` is mapped to a `blob:` URL. Object URLs are kept
 *   alive until the caller revokes them — `studio.importModel({...})`
 *   revokes them after GLTFLoader finishes.
 *
 * @param {string} slug
 * @returns {Promise<string | { url: string, files: Record<string,string>, name: string }>}
 */
export async function resolveDefaultPackage(slug) {
  const entry = findDefaultModel(slug);
  if (!entry) {
    throw new Error(`[defaultModels] Unknown slug: ${slug}`);
  }

  if (entry.kind === 'glb') {
    // Make sure the file is reachable so callers see a clear network error
    // instead of a silent "no method" failure from the GLTFLoader.
    // Single-URL path — the GLTFLoader surfaces its own network errors
    // when the file is missing, so no pre-flight HEAD request is needed.
    return entry.url;
  }

  // gltf-dir: walk the dependency tree and bundle it
  const indexParts = entry.url.split('/');
  const indexName = indexParts.pop();      // scene.gltf
  const baseAbs = new URL(indexParts.join('/') + '/', window.location.href).href;

  // Fetch scene.gltf and capture its blob URL
  const indexResp = await fetch(entry.url);
  if (!indexResp.ok) {
    throw new Error(`[defaultModels] Failed to fetch ${entry.url} (HTTP ${indexResp.status})`);
  }
  const indexBlob = await indexResp.blob();
  const files = { [indexName]: URL.createObjectURL(indexBlob) };

  // Parse the glTF JSON to find every relative URI we need to fetch
  let gltfJson;
  try {
    gltfJson = JSON.parse(await indexBlob.text());
  } catch (err) {
    throw new Error(`[defaultModels] ${entry.url} is not valid JSON: ${err.message}`);
  }
  const refs = new Set();
  if (Array.isArray(gltfJson.buffers)) {
    gltfJson.buffers.forEach(b => { if (b && typeof b.uri === 'string') refs.add(b.uri); });
  }
  if (Array.isArray(gltfJson.images)) {
    gltfJson.images.forEach(i => { if (i && typeof i.uri === 'string') refs.add(i.uri); });
  }

  // Fetch referenced assets in parallel
  await Promise.all(Array.from(refs).map(async (rel) => {
    const absUrl = new URL(rel, baseAbs).href;
    const resp = await fetch(absUrl);
    if (!resp.ok) {
      throw new Error(`[defaultModels] Failed to fetch ${absUrl} (HTTP ${resp.status})`);
    }
    const blob = await resp.blob();
    const filename = rel.split('/').pop().split('?')[0];
    files[filename] = URL.createObjectURL(blob);
  }));

  return { url: files[indexName], files, name: indexName };
}
