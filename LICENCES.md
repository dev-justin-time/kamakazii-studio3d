# KAMAKAZII STUDIO 3D — Third-Party Asset Licences

This directory and document enumerate every third-party 3D model shipped
with KAMAKAZII STUDIO 3D under `assets/models/`, the corresponding
licence text copied into `licences/`, and the canonical attribution
(source URL, author, licence type).

All bundled 3D models are sourced from [Sketchfab](https://sketchfab.com)
and each carries a licence chosen by the original author.  By default
every model is released under Creative Commons (CC-BY-4.0 or
CC-BY-NC-4.0).  **You are responsible** for honouring those licences
when you ship, embed, or redistribute a model from this directory.

## How the licence files are wired

| Item | Where it lives |
| --- | --- |
| Bundle of starter models | `./assets/models/<slug>/…` (multi-file glTF) **or** `./assets/models/<slug>.glb` (loose) |
| Licence text (per model) | `./licences/<slug>.txt`  (copied from each asset's `license.txt` next to the binary, when present) |
| Licence pointer in JS | `app/defaultModels.js` `licenseFile: './licences/<slug>.txt'` |
| UI attribution surface | `features/inventory/page.js` — every starter model card shows the licence type and a `licences/<slug>.txt` link |

The inventory popup reads each model's `licenseFile` and shows the
human-readable licence name on the card so the user always sees the
terms before clicking **Load**.

## Conventions

- **Multi-file glTF folders** keep their `license.txt` alongside
  `scene.gltf`.  We copy it to `./licences/<slug>.txt` at build time.
- **Loose `.glb` files** at the top of `assets/models/` usually do NOT
  ship a `license.txt`.  When that happens, we write a stub file at
  `./licences/<slug>.LICENCE-UNKNOWN.txt` flagging the gap.  Owners of
  the studio must fill those in before shipping a release that
  distributes those `.glb` files.
- We deliberately **do not** mutate the source files in
  `assets/models/`; licence copying is one-way
  (`assets/models/<slug>/license.txt → licences/<slug>.txt`).  Editing
  the canonical source under `assets/models/` is the only way to
  change attribution for a specific model.

## Per-model licences (auto-generated summary table)

The table below mirrors every entry in `app/defaultModels.js`. The
`licenceFile` column points at the file in `./licences/` that contains
the human-readable licence text.

| Slug | Display name | Kind | Fidelity | licenceFile |
| --- | --- | --- | --- | --- |
| simba | Simba | glb | updated | `./licences/simba.LICENCE-UNKNOWN.txt` |
| jessie_the_fox_updated_texture | Jessie the Fox | glb | updated | `./licences/jessie_the_fox_updated_texture.LICENCE-UNKNOWN.txt` |
| jack_the_wolf_updated_texture | Jack the Wolf (high-fidelity) | glb | updated | `./licences/jack_the_wolf_updated_texture.LICENCE-UNKNOWN.txt` |
| monk_the_husky_updated_texture | Monk the Husky (high-fidelity) | glb | updated | `./licences/monk_the_husky_updated_texture.LICENCE-UNKNOWN.txt` |
| big_boo_super_mario_world_custom | Big Boo | gltf-dir | updated | `./licences/big_boo_super_mario_world_custom.txt` |
| boo | Boo | gltf-dir | original | `./licences/boo.txt` |
| cute_spooky_cat | Cute Spooky Cat | gltf-dir | original | `./licences/cute_spooky_cat.txt` |
| duke_the_lion | Duke the Lion | gltf-dir | original | `./licences/duke_the_lion.txt` |
| henery-hawk | Henery Hawk | gltf-dir | original | `./licences/henery-hawk.txt` |
| jack_the_wolf | Jack the Wolf | gltf-dir | original | `./licences/jack_the_wolf.txt` |
| jack_the_wolf_updated_texture_dir | Jack the Wolf (updated) | gltf-dir | updated | `./licences/jack_the_wolf_updated_texture.txt` |
| jade_the_tiger | Jade the Tiger | gltf-dir | original | `./licences/jade_the_tiger.txt` |
| monk_the_husky | Monk the Husky | gltf-dir | original | `./licences/monk_the_husky.txt` |
| monk_the_husky_updated_texture_dir | Monk the Husky (updated) | gltf-dir | updated | `./licences/monk_the_husky_updated_texture.txt` |
| nix_the_fox | Nix the Fox | gltf-dir | original | `./licences/nix_the_fox.txt` |
| nix_the_fox_updated_texture | Nix the Fox (updated) | gltf-dir | updated | `./licences/nix_the_fox_updated_texture.txt` |
| shadow_the_hedgehog_sonic_forcesgmod | Shadow the Hedgehog | gltf-dir | original | `./licences/shadow_the_hedgehog_sonic_forcesgmod.txt` |
| shadow_the_hedgehog_hyphen | Shadow the Hedgehog (hyphen) | gltf-dir | original | `./licences/shadow_the_hedgehog_hyphen.LICENCE-UNKNOWN.txt` |

## Licence-type legend

The licence files inside `./licences/` follow Sketchfab's standardised
export format:

```
Model Information:
* title:    …
* source:   <Sketchfab URL>
* author:   <display name + profile URL>

Model License:
* license type:   CC-BY-4.0  /  CC-BY-NC-4.0
* requirements:   Author must be credited … etc.
```

We collapse both flavours into one of two columns on inventory cards:

- **CC-BY-4.0** — author must be credited, commercial use allowed.
- **CC-BY-NC-4.0** — author must be credited, **no commercial use**.

## Adding a new starter model

1. Drop your bundle into `./assets/models/<slug>/` (or
   `./assets/models/<slug>.glb` for a single binary).
2. Make sure `assets/models/<slug>/license.txt` is present and follows
   Sketchfab's export format.
3. Append the entry to `app/defaultModels.js` with a `licenseFile:
   './licences/<slug>.txt'` field.
4. Run the licence-copy script (or just `cp assets/models/<slug>/license.txt
   licences/<slug>.txt`).
5. Update the per-model table above.

That's it — the inventory popup will pick the licence up automatically.
