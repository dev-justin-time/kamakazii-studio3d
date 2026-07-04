# KAMAKAZII STUDIO 3D

> **3D Model Editor & Game Content Studio** — A browser-based 3D creation suite integrated into the Kamikazzi branded game suite.

---

## Overview

KAMAKAZII STUDIO 3D is a full-featured 3D editor and content creation tool that runs entirely in the browser. It provides modeling, sculpting, animation, texture painting, node-based material editing, physics simulation, and marketplace plugin support — designed as the companion studio for the Kamikazzi game suite.

Built with Three.js and designed for the Puter ecosystem, it supports everything from rapid prototyping to detailed asset creation.

---

## Features

### Core Systems
| System | Description |
|--------|-------------|
| **3D Viewport** | Centered perspective/orthographic viewport with orbit controls |
| **Sculpting** | Brush-based mesh sculpting with multiple brush types |
| **Texture Painting** | Layer-based texture and vertex painting |
| **Animation** | Timeline, keyframes, clips, playback controls |
| **Node Editor** | Visual material and effect graph editor |
| **Physics** | Rigid body simulation, collision detection, SPH fluid solver |
| **Procedural Generation** | Terrain, voxel, and procedural mesh generation |
| **Audio System** | Spatial audio, synthesis, playback |

### Editor Tools
| Tool | Features |
|------|----------|
| **Transform** | Move, rotate, scale, snap, mirror |
| **Selection** | Click, box select, lasso |
| **Mesh Editing** | Subdivide, extrude, bevel, boolean operations |
| **Rigging** | Bones, skinning, weight painting, auto-rig |
| **UV Editing** | Unwrap, relax, atlas, stitch |
| **Import/Export** | GLTF, GLB, OBJ, STL, JSON formats |

### Marketplace & Plugins
- **Plugin Registry** with lifecycle hooks (`onBeforeRender`, `onObjectSelected`, etc.)
- **Asset Store** for downloading models, textures, and presets
- **Creator Portal** for publishing and monetizing your work
- **License Manager** for per-asset licensing

### AI Integration
- Dual-platform AI bridge (WebSim + Puter)
- AI-assisted mesh generation and retopology
- Texture generation from text prompts
- Scene description and auto-layout

---

## Project Structure

```
kamakazii_studio3D/
├── app/               # Application core (shell, engine, state, cache, AI bridge)
├── assets/            # Static assets (models, textures, audio)
├── blender/           # Blender-like modeling tools
├── docs/              # Architecture plans and documentation
├── editor/            # Editor tool managers (UI, model, objects, camera, animation)
├── features/          # Feature pages (file, select, edit, sculpt, paint, AI, etc.)
├── flags/             # Feature flags
├── locales/           # Internationalization (en/studio.json)
├── marketplace/       # Marketplace module (API, UI, plugins, store, licensing)
├── pages/             # Page loaders for feature popups
├── systems/           # Engine systems (physics, sculpt, paint, node editor, audio, etc.)
├── tools/             # Standalone tools (blender, pose editor, map maker)
├── ui/                # HTML pages and styles
├── ARCHITECTURE_PLAN.md
└── README.md
```

---

## Quick Start

```bash
# From the suite root
python -m http.server 8765
# Open http://localhost:8765/kamakazii_studio3D/ui/index.html
```

### Development
No build step required — the app uses ES modules with import maps. All code runs in modern browsers supporting WebGL.

---

## Systems Architecture

### Engine Loop
```
requestAnimationFrame
  ├── onBeforeRender hook (plugins)
  ├── PhysicsSystem.update()
  │   └── onPhysicsStep hook
  ├── Scene render
  └── onAfterRender hook (plugins)
```

### Plugin Lifecycle
```
PluginRegistry.emit('onBoot')         → System startup
PluginRegistry.emit('onSceneReady')   → Scene initialized
PluginRegistry.emit('onObjectAdded')  → New object created
PluginRegistry.emit('onObjectSelected')→ Selection changed
PluginRegistry.emit('onToolChange')   → Tool switched
PluginRegistry.emit('onBeforeRender') → Render frame start
PluginRegistry.emit('onAfterRender')  → Render frame end
```

### State Management
Centralized state via `app/state.js`:
- `state.get(key)` — read values
- `state.set(key, value)` — write with subscriber notification
- `state.subscribe(key, callback)` — react to changes
- Shared across all feature pages and systems

---

## Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | 0.128.0 | 3D rendering engine |
| Three.js Addons | — | OrbitControls, TransformControls, etc. |
| Puter.js | SDK | Cloud storage, AI, multiplayer |

---

## Puter Deployment

To deploy on the [Puter App Store](https://developer.puter.com/app-center/):
1. Host the `kamakazii_studio3D/` directory on a web server
2. Set entry URL to `/kamakazii_studio3D/ui/index.html`
3. Upload icon: `assets/icons/icon-512.png`
4. Category: Developer Tools / 3D Modeling

---

## License

MIT — See project root for details.

*Built with Three.js. Plane model assets used for reference under CC-BY.*
