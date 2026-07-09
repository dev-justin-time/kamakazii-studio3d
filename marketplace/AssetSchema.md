# k3dasset — Asset Bundle Schema

> **Version:** 1.0.0  
> **Format identifier:** `k3dasset`  
> **Purpose:** Serializable 3D asset container for Kamakazii Studio 3D marketplace.
>
> Assets are stored as JSON on Puter FS under `CloudAssets/{assetId}/asset.k3dasset`.
> Embedded textures are stored as data URIs within the JSON or as separate files
> in the same directory. Large assets should use native 3D formats (glTF/GLB/OBJ)
> which are loaded via the native loader pipeline instead.

---

## Top-Level Structure

```json
{
  "version": "1.0.0",
  "format": "k3dasset",
  "assetId": "v_hero_01",
  "generatedAt": 1743552000000,
  "creatorId": "creator-kamakazii",
  "creatorName": "Kamakazii Studio",

  "items": [ /* Item[] */ ],
  "textures": { /* TextureMap */ }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | ✅ | Semver version of the k3dasset format (not the asset). |
| `format` | `string` | ✅ | Always `"k3dasset"`. Used for format detection. |
| `assetId` | `string` | ✅ | Unique asset identifier matching the Puter FS path. |
| `generatedAt` | `number` | ✅ | Unix timestamp (ms) when the bundle was generated. |
| `creatorId` | `string` | — | Creator's Puter user ID or KV store ID. |
| `creatorName` | `string` | — | Display name of the creator. |
| `items` | `Item[]` | ✅ | Array of reconstructable 3D objects. |
| `textures` | `object` | — | Map of texture path → data URI (base64). |

---

## Item

Each item in `items[]` represents a single reconstructable mesh or group.

```json
{
  "name": "Voxel Hero",
  "type": "mesh",
  "geometry": { /* Geometry */ },
  "material": { /* Material */ },
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "children": [ /* Item[] */ ],
  "visible": true,
  "castShadow": true,
  "receiveShadow": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Object name displayed in outliner. |
| `type` | `string` | ✅ | One of: `"mesh"`, `"group"`, `"light"`, `"camera"`, `"skinned-mesh"`, `"bone"`. |
| `geometry` | `Geometry` | if `type === "mesh"` | Serialized geometry data. |
| `material` | `Material\|Material[]` | — | Single material or array (multi-material). |
| `transform` | `Transform` | — | Position, rotation, scale arrays. |
| `children` | `Item[]` | — | Nested child items (for groups/hierarchies). |
| `visible` | `boolean` | — | Default `true`. |
| `castShadow` | `boolean` | — | Default `true` for meshes. |
| `receiveShadow` | `boolean` | — | Default `true` for meshes. |

---

## Geometry

Two possible formats:

### 1. Parametric geometry (primitives)

Used for simple shapes created in-editor. The `parameters` object matches
Three.js geometry constructor args.

```json
{
  "type": "BoxGeometry",
  "parameters": { "width": 1, "height": 1, "depth": 1 },
  "vertexCount": 24,
  "indexCount": 36,
  "hasNormals": true,
  "hasUVs": true
}
```

Supported parametric types and their parameters:

| Geometry Type | Parameters |
|---------------|-----------|
| `BoxGeometry` | `{ width, height, depth, widthSegments?, heightSegments?, depthSegments? }` |
| `SphereGeometry` | `{ radius, widthSegments?, heightSegments?, phiStart?, phiLength?, thetaStart?, thetaLength? }` |
| `CylinderGeometry` | `{ radiusTop, radiusBottom, height, radialSegments?, heightSegments?, openEnded? }` |
| `ConeGeometry` | `{ radius, height, radialSegments?, heightSegments?, openEnded? }` |
| `PlaneGeometry` | `{ width, height, widthSegments?, heightSegments? }` |
| `TorusGeometry` | `{ radius, tube, radialSegments?, tubularSegments?, arc? }` |
| `TorusKnotGeometry` | `{ radius, tube, tubularSegments?, radialSegments?, p?, q? }` |
| `RingGeometry` | `{ innerRadius, outerRadius, thetaSegments?, phiSegments?, thetaStart?, thetaLength? }` |
| `LatheGeometry` | `{ points: [[x,y],...], segments?, phiStart?, phiLength? }` |

### 2. Full buffer geometry (arbitrary meshes)

Used for complex or imported assets where the actual vertex data must be
preserved exactly. Arrays are stored as flat `number[]` (Float32Array or
Uint32Array values serialized to JSON).

```json
{
  "type": "BufferGeometry",
  "format": "buffer",
  "vertexCount": 1200,
  "attributes": {
    "position": {
      "array": [-0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0],
      "itemSize": 3,
      "count": 1200,
      "normalized": false
    },
    "normal": {
      "array": [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      "itemSize": 3,
      "count": 1200,
      "normalized": false
    },
    "uv": {
      "array": [0, 0, 0, 1, 1, 1, 1, 0],
      "itemSize": 2,
      "count": 1200,
      "normalized": false
    },
    "color": {
      "array": [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1],
      "itemSize": 3,
      "count": 1200,
      "normalized": false
    }
  },
  "index": {
    "array": [0, 1, 2, 0, 2, 3],
    "count": 6000
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | ✅ | `"BufferGeometry"` or specific parametric type. |
| `format` | `string` | if buffer | `"buffer"` indicates full buffer data (vs parametric). |
| `attributes` | `object` | if buffer | Map of attribute name → `BufferAttribute`. |
| `attributes.{name}.array` | `number[]` | ✅ | Flat typed array data (Float32Array values). |
| `attributes.{name}.itemSize` | `number` | ✅ | 3 for position/normal, 2 for uv, 4 for tangent. |
| `attributes.{name}.count` | `number` | ✅ | Number of vertices in this attribute. |
| `attributes.{name}.normalized` | `boolean` | — | Whether values should be normalized. |
| `index` | `object` | — | Index buffer for non-triangle-strip geometry. |
| `index.array` | `number[]` | ✅ | Flat Uint32Array index data. |
| `index.count` | `number` | ✅ | Number of indices. |

**Minimum required attributes:** `position` must always be present.

---

## Material

```json
{
  "type": "MeshStandardMaterial",
  "name": "HeroBody",
  "color": 3355503,
  "roughness": 0.5,
  "metalness": 0.1,
  "opacity": 1,
  "transparent": false,
  "wireframe": false,
  "side": 2,
  "emissive": 0,
  "emissiveIntensity": 0,
  "map": "textures/hero_diffuse.png",
  "normalMap": null,
  "roughnessMap": null,
  "metalnessMap": null,
  "clearcoat": 0,
  "clearcoatRoughness": 0,
  "transmission": 0,
  "thickness": 0,
  "ior": 1.5,
  "iridescence": 0,
  "sheen": 0,
  "sheenColor": null,
  "envMapIntensity": 1,
  "vertexColors": false,
  "morphTargets": false
}
```

Texture references (`"map"`, `"normalMap"`, etc.) refer to keys in the
top-level `textures` object. The importer resolves them at load time.

---

## Texture Map

```json
{
  "textures/hero_diffuse.png": "data:image/png;base64,iVBORw0KGgo...",
  "textures/hero_normal.png": "data:image/png;base64,...",
  "textures/hero_roughness.png": "data:image/png;base64,..."
}
```

Keys are relative paths used by material `map`/`normalMap`/etc. fields.
Values are data URIs (base64-encoded image data).

---

## Transform

```json
{
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1]
}
```

All arrays are `[x, y, z]`. Rotation is in **radians** (Euler XYZ order).

---

## Puter FS Directory Layout

```
CloudAssets/
  {creatorId}/
    {assetId}/
      asset.k3dasset          # Main bundle JSON
      thumbnail.webp          # Optional: preview image
      versions/
        v1.0.0.json           # Versioned bundle snapshot (optional)
        v1.1.0.json
```

---

## Example: Minimal Bundle

```json
{
  "version": "1.0.0",
  "format": "k3dasset",
  "assetId": "demo_free_voxel_kit",
  "generatedAt": 1743552000000,
  "creatorName": "Kamakazii Studio",
  "items": [
    {
      "name": "Starter Cube",
      "type": "mesh",
      "geometry": {
        "type": "BoxGeometry",
        "parameters": { "width": 1, "height": 1, "depth": 1 },
        "vertexCount": 24,
        "indexCount": 36,
        "hasNormals": true,
        "hasUVs": false
      },
      "material": {
        "type": "MeshStandardMaterial",
        "color": 6316128,
        "roughness": 0.5,
        "metalness": 0.1
      },
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      }
    }
  ]
}
```
