import * as THREE from 'three';
import { createPerlin2D, createRandom } from './noiseUtils.js';
import { getBiomeColor } from './biomeUtils.js';
import { createInstanced, getTreeGeometries, getBuildingGeometries } from './decorationUtils.js';

// removed function createPerlin2D() {}
// removed function createRandom() {}

export function createTerrain(params) {
    const { size, resolution, scale, height, seed, preset, customHeightmap, octaves, persistence, customBiomes, treeDensity = 1.0, cityDensity = 0 } = params;
    
    const getSeed = (s) => {
        if (typeof s === 'string') {
            return s.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
        }
        return Math.floor(s * 1000000);
    };

    const baseSeed = getSeed(seed);
    const noise2D = createPerlin2D(baseSeed);
    const moistureFreq = 3.0 * (100 / scale); 
    const moistureNoise = createPerlin2D(baseSeed + 1000);
    const treeNoise = createPerlin2D(baseSeed + 2000);
    const cityNoise = createPerlin2D(baseSeed + 2500);
    
    // Pre-calculate random volcano positions if applicable to limit count to 1-3
    const volcanoMaps = ['default', 'circle_island', 'square_island', 'doughnut', 'venus'];
    const randomVolcanoes = [];
    if (volcanoMaps.includes(preset)) {
        const vRand = createRandom(baseSeed + 3000);
        const numV = Math.floor(vRand() * 3) + 1; // 1 to 3 volcanoes
        for (let k = 0; k < numV; k++) {
            randomVolcanoes.push({
                u: 0.2 + vRand() * 0.6,
                v: 0.2 + vRand() * 0.6
            });
        }
    }

    const geometry = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);
    const heightData = new Float32Array(resolution * resolution);

    const treePositions = { pine: [], oak: [], palm: [], cactus: [], birch: [], willow: [], redwood: [], bamboo: [], bush: [], rock: [], grassPatch: [], flower: [] };
    const cityPositions = { rural: [], suburban: [], urban: [], space: [], castle: [], temple: [], dock: [], lighthouse: [] };

    for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
            const nx = i / (resolution - 1);
            const ny = j / (resolution - 1);
            
            let h_val = 0;

            if (preset === 'custom' && customHeightmap) {
                h_val = sampleCustomHeightmap(nx, ny, customHeightmap);
            } else {
                let amp = 1.0;
                let freq = (scale / 1000); 
                let totalAmp = 0;
                
                // Use a large offset to prevent looping artifacts at (0,0)
                const offset = 5000;
                const wx = (nx - 0.5) * size * freq + offset;
                const wy = (ny - 0.5) * size * freq + offset;

                for (let k = 0; k < octaves; k++) {
                    const f = Math.pow(2, k);
                    h_val += amp * noise2D(wx * f, wy * f);
                    totalAmp += amp;
                    amp *= persistence;
                }
                h_val = (h_val / totalAmp + 1) / 2; 

                h_val = Math.pow(h_val, 1.5);

                const distToCenter = Math.sqrt((nx - 0.5)**2 + (ny - 0.5)**2) * 2;
                if (preset === 'circle_island') {
                    const mask = 1.0 - Math.pow(distToCenter, 2.5);
                    h_val *= Math.max(0, mask);
                } else if (preset === 'square_island') {
                    const maxDist = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2;
                    const mask = 1.0 - Math.pow(maxDist, 3);
                    h_val *= Math.max(0, mask);
                } else if (preset === 'doughnut' || preset === 'lava_doughnut') {
                    const ringRadius = 0.6;
                    const ringWidth = 0.25;
                    const ringMask = Math.max(0, 1.0 - Math.pow(Math.abs(distToCenter - ringRadius) / ringWidth, 2));
                    
                    if (preset === 'lava_doughnut') {
                        const holeRadius = ringRadius - ringWidth;
                        const d = distToCenter / (holeRadius + 0.1);
                        const cone = Math.max(0, 1.0 - d);
                        const crater = Math.max(0, 1.0 - d * 8.0); // Sharper, smaller hole
                        let v_h = Math.max(0, cone - crater * 0.9) * 1.5;
                        
                        if (d < 0.15) v_h = 0.65; 

                        h_val = h_val * ringMask;
                        h_val = Math.max(h_val, v_h);
                    } else {
                        h_val *= ringMask;
                    }
                } else if (preset === 'ring_of_fire') {
                    // Create multiple volcanoes in a ring
                    let volcanoVal = 0;
                    const numVolcanoes = 3; // Limited to 3 per request
                    const ringRad = 0.65;
                    for (let v = 0; v < numVolcanoes; v++) {
                        const angle = (v / (numVolcanoes)) * Math.PI * 2;
                        const vx = 0.5 + Math.cos(angle) * ringRad * 0.5;
                        const vy = 0.5 + Math.sin(angle) * ringRad * 0.5;
                        const d = Math.sqrt((nx - vx)**2 + (ny - vy)**2) * 10;
                        
                        // Main cone
                        let cone = Math.max(0, 1.0 - d);
                        // Crater - subtract a smaller, sharper cone at the top
                        let crater = Math.max(0, 1.0 - d * 5);
                        volcanoVal += Math.max(0, cone - crater * 0.8);
                    }
                    h_val = h_val * 0.4 + Math.min(1.2, volcanoVal);
                    // Add a general ring mask so it's an archipelago of volcanoes
                    const ringMask = Math.max(0, 1.0 - Math.pow(Math.abs(distToCenter - ringRad) / 0.4, 2));
                    h_val *= ringMask;
                } else if (preset === 'archipelago') {
                    // Lots of small islands
                    h_val = Math.pow(h_val, 0.8);
                    const islandNoise = createPerlin2D(baseSeed + 4000);
                    const islands = (islandNoise(nx * 8, ny * 8) + 1) / 2;
                    h_val = (h_val * 0.5 + islands * 0.5) - 0.2;
                } else if (preset === 'canyon') {
                    // Deep cuts in a plateau
                    const plateau = 0.7 + h_val * 0.1;
                    const riverNoise = createPerlin2D(baseSeed + 5000);
                    const river = Math.abs(riverNoise(nx * 2, ny * 2));
                    const riverMask = Math.pow(Math.max(0, 1.0 - river * 4.0), 2.0);
                    h_val = plateau - riverMask * 0.6;
                } else if (preset === 'alpine') {
                    // Sharp peaks
                    h_val = Math.pow(h_val, 0.6);
                    h_val = 1.0 - Math.abs(h_val * 2 - 1);
                    h_val = Math.pow(h_val, 1.5) * 1.2;
                } else if (preset === 'landlocked') {
                    // Raise the floor so no natural "oceans" exist
                    h_val = 0.2 + h_val * 0.8;
                } else if (preset === 'atoll') {
                    const ringRadius = 0.65;
                    const ringWidth = 0.12;
                    // Steep drop-off outside
                    const outerMask = 1.0 - Math.pow(Math.max(0, distToCenter - ringRadius) * 5, 2);
                    // The ring itself
                    const ringShape = Math.max(0, 1.0 - Math.pow(Math.abs(distToCenter - ringRadius) / ringWidth, 2));
                    // Lagoon floor
                    const lagoonDepth = (distToCenter < ringRadius) ? 0.22 : 0.05;
                    
                    h_val = lagoonDepth + (ringShape * 0.3) + (h_val * 0.1 * ringShape);
                    h_val *= Math.max(0.1, outerMask);
                }
            }

            // Apply pre-calculated random volcanoes
            if (randomVolcanoes.length > 0) {
                for (const vCenter of randomVolcanoes) {
                    const d = Math.sqrt((nx - vCenter.u)**2 + (ny - vCenter.v)**2) * 15;
                    const cone = Math.max(0, 1.0 - d);
                    const crater = Math.max(0, 1.0 - d * 5);
                    const v_h = Math.max(0, cone - crater * 0.8) * 0.8;
                    h_val = Math.max(h_val, v_h);
                }
            }

            const y = h_val * height;
            const idx = (j * resolution + i) * 3;
            positions[idx + 1] = y;
            heightData[j * resolution + i] = h_val;

            const moisture = (moistureNoise(nx * moistureFreq + 500, ny * moistureFreq + 500) + 1) / 2;
            const color = getBiomeColor(h_val, moisture, preset, customBiomes);
            colors[idx] = color.r;
            colors[idx + 1] = color.g;
            colors[idx + 2] = color.b;

            // Safety threshold to prevent underwater generation
            const isWaterPreset = !['mars', 'moon', 'landlocked'].includes(preset);
            const waterLevel = (params.showWater && isWaterPreset) ? 0.33 : 0.02;

            // Enhanced Natural Tree Generation
            if (preset !== 'mars' && preset !== 'moon' && preset !== 'venus' && treeDensity > 0 && h_val > waterLevel) {
                const tNoise = (treeNoise(nx * 20, ny * 20) + 1) / 2;
                // Use square root scaling so 1.0 remains the standard density but 50.0 can reach maximum coverage
                const densityThresh = 1.0 - (0.15 * Math.sqrt(treeDensity));
                if (tNoise > densityThresh) {
                    const pos = {
                        x: (nx - 0.5) * size,
                        y: y,
                        z: (ny - 0.5) * size,
                        scale: (0.6 + Math.random() * 0.8) * 0.1
                    };

                    // Willow near water (low elevation, high moisture) — check BEFORE oak
                    if (h_val >= waterLevel && h_val < 0.38 && moisture > 0.6) {
                        treePositions.willow.push(pos);
                    }
                    // Bamboo in tropical warm wet areas — check BEFORE oak
                    else if (h_val >= 0.35 && h_val < 0.45 && moisture > 0.7) {
                        treePositions.bamboo.push(pos);
                    }
                    // Birch in temperate mid-elevation — check BEFORE oak (tighter moisture range)
                    else if (h_val >= 0.38 && h_val < 0.55 && moisture > 0.45 && moisture < 0.6) {
                        treePositions.birch.push(pos);
                    }
                    // Palm trees on beaches
                    else if (h_val >= waterLevel && h_val < 0.36) {
                        treePositions.palm.push(pos);
                    }
                    // Oak trees in lush lowlands
                    else if (h_val >= 0.36 && h_val < 0.52 && moisture > 0.5) {
                        treePositions.oak.push(pos);
                    }
                    // Redwood in high-moisture mid-highlands
                    else if (h_val >= 0.5 && h_val < 0.7 && moisture > 0.65) {
                        treePositions.redwood.push(pos);
                    }
                    // Pine trees in cooler highlands or less moist areas
                    else if (h_val >= 0.52 && h_val < 0.7 && moisture > 0.3) {
                        treePositions.pine.push(pos);
                    }
                    // Bush scattered in dry mid-elevations
                    else if (h_val >= 0.35 && h_val < 0.55 && moisture > 0.2 && moisture < 0.5) {
                        if (Math.random() < 0.4) treePositions.bush.push(pos);
                    }
                    // Rocks/boulders on slopes and high terrain
                    else if (h_val >= 0.6 && h_val < 0.85) {
                        if (Math.random() < 0.15) treePositions.rock.push(pos);
                    }
                    // Grass patches in lowlands
                    else if (h_val >= waterLevel && h_val < 0.45 && moisture > 0.3) {
                        if (Math.random() < 0.5) treePositions.grassPatch.push(pos);
                    }
                    // Flowers in lush meadows
                    else if (h_val >= 0.38 && h_val < 0.5 && moisture > 0.5 && moisture < 0.75) {
                        if (Math.random() < 0.25) treePositions.flower.push(pos);
                    }
                    // Cactus in dry areas (Desert Biome)
                    else if (h_val >= 0.35 && h_val < 0.55 && moisture < 0.35) {
                        if (Math.random() < 1.5) {
                            treePositions.cactus.push(pos);
                        }
                    }
                }
            }

            // Natural City Generation
            const landmarkPos = {
                x: (nx - 0.5) * size,
                y: y,
                z: (ny - 0.5) * size,
                scale: 0.8 + Math.random() * 0.4
            };

            if (cityDensity > 0 && h_val > waterLevel && h_val < 0.7) {
                const cNoise = (cityNoise(nx * 20, ny * 20) + 1) / 2;
                // Density adjustment: lower thresholds mean more cities
                const threshold = 1.0 - (0.25 * cityDensity);
                if (cNoise > threshold) {
                    const pos = landmarkPos;
                    
                    const isSpace = (preset === 'moon' || preset === 'mars' || preset === 'venus');
                    if (isSpace) {
                        cityPositions.space.push(pos);
                    } else if (h_val < 0.4) {
                        cityPositions.rural.push(pos);
                    } else if (h_val < 0.5) {
                        cityPositions.suburban.push(pos);
                    } else {
                        cityPositions.urban.push(pos);
                    }
                }
            }

            // Landmark buildings — independent of cityDensity
            // Scale lazily: each landmark type gets a distinct size range
            if (h_val > waterLevel && preset !== 'mars' && preset !== 'moon' && preset !== 'venus') {
                if (Math.random() < 0.003 && h_val > 0.4 && h_val < 0.65) {
                    cityPositions.castle.push({ ...landmarkPos, scale: 1.5 + Math.random() * 1.0 });
                } else if (Math.random() < 0.002 && h_val > 0.5) {
                    cityPositions.temple.push({ ...landmarkPos, scale: 1.2 + Math.random() * 0.6 });
                } else if (Math.random() < 0.004 && h_val >= waterLevel && h_val < 0.36) {
                    cityPositions.dock.push({ ...landmarkPos, scale: 0.6 + Math.random() * 0.3 });
                } else if (Math.random() < 0.001 && h_val >= waterLevel && h_val < 0.38) {
                    cityPositions.lighthouse.push({ ...landmarkPos, scale: 0.8 + Math.random() * 0.4 });
                }
            }
        }
    }

    // ── Hydraulic Erosion Simulation ──
    // Must run AFTER heightData is filled but BEFORE colors are computed
    // so vertex colors match the eroded terrain.
    if (params.erosion && params.erosion > 0) {
        // Scale iterations by resolution so erosion strength is consistent
        const scaledIterations = Math.round(params.erosion * (resolution / 256));
        applyHydraulicErosion(heightData, resolution, Math.max(50, scaledIterations));
        // Recompute positions and colors from eroded heightData
        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                const idx2 = j * resolution + i;
                const posIdx = idx2 * 3;
                positions[posIdx + 1] = heightData[idx2] * height;
                const nx2 = i / (resolution - 1);
                const ny2 = j / (resolution - 1);
                const moisture2 = (moistureNoise(nx2 * moistureFreq + 500, ny2 * moistureFreq + 500) + 1) / 2;
                const color2 = getBiomeColor(heightData[idx2], moisture2, preset, customBiomes);
                colors[posIdx] = color2.r;
                colors[posIdx + 1] = color2.g;
                colors[posIdx + 2] = color2.b;
            }
        }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: false,
        roughness: 0.8,
        metalness: 0.05
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    // Asset generation
    const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0 });
    const cactusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const buildingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const spaceMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.2 });
    
    const { pineGeo, oakGeo, palmGeo, cactusGeo, birchGeo, willowGeo, redwoodGeo, bambooGeo, bushGeo, rockGeo, grassPatchGeo, flowerGeo } = getTreeGeometries();
    const { ruralGeo, subGeo, urbGeo, spaceGeo, castleGeo, templeGeo, dockGeo, lighthouseGeo } = getBuildingGeometries();

    const instances = [];
    // Increased slice limits further to accommodate high-res extreme density (up to 250k objects)
    const MAX_TREES = 150000;
    const MAX_BUILDINGS = 5000;

    if (treePositions.pine.length > 0) instances.push(createInstanced(pineGeo, foliageMat, treePositions.pine.slice(0, MAX_TREES)));
    if (treePositions.oak.length > 0) instances.push(createInstanced(oakGeo, foliageMat, treePositions.oak.slice(0, MAX_TREES)));
    if (treePositions.palm.length > 0) instances.push(createInstanced(palmGeo, foliageMat, treePositions.palm.slice(0, MAX_TREES)));
    if (treePositions.cactus.length > 0) instances.push(createInstanced(cactusGeo, cactusMat, treePositions.cactus.slice(0, MAX_TREES)));
    if (treePositions.birch.length > 0) instances.push(createInstanced(birchGeo, foliageMat, treePositions.birch.slice(0, MAX_TREES)));
    if (treePositions.willow.length > 0) instances.push(createInstanced(willowGeo, foliageMat, treePositions.willow.slice(0, MAX_TREES)));
    if (treePositions.redwood.length > 0) instances.push(createInstanced(redwoodGeo, foliageMat, treePositions.redwood.slice(0, MAX_TREES)));
    if (treePositions.bamboo.length > 0) instances.push(createInstanced(bambooGeo, foliageMat, treePositions.bamboo.slice(0, MAX_TREES)));
    if (treePositions.bush.length > 0) instances.push(createInstanced(bushGeo, foliageMat, treePositions.bush.slice(0, MAX_TREES)));
    if (treePositions.rock.length > 0) instances.push(createInstanced(rockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), treePositions.rock.slice(0, MAX_TREES)));
    if (treePositions.grassPatch.length > 0) instances.push(createInstanced(grassPatchGeo, foliageMat, treePositions.grassPatch.slice(0, MAX_TREES)));
    if (treePositions.flower.length > 0) instances.push(createInstanced(flowerGeo, foliageMat, treePositions.flower.slice(0, MAX_TREES)));

    if (cityPositions.rural.length > 0) {
        const inst = createInstanced(ruralGeo, buildingMat, cityPositions.rural.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.suburban.length > 0) {
        const inst = createInstanced(subGeo, buildingMat, cityPositions.suburban.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.urban.length > 0) {
        const inst = createInstanced(urbGeo, buildingMat, cityPositions.urban.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.space.length > 0) {
        const inst = createInstanced(spaceGeo, spaceMat, cityPositions.space.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.castle.length > 0) {
        const inst = createInstanced(castleGeo, buildingMat, cityPositions.castle.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.temple.length > 0) {
        const inst = createInstanced(templeGeo, buildingMat, cityPositions.temple.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.dock.length > 0) {
        const inst = createInstanced(dockGeo, buildingMat, cityPositions.dock.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }
    if (cityPositions.lighthouse.length > 0) {
        const inst = createInstanced(lighthouseGeo, buildingMat, cityPositions.lighthouse.slice(0, MAX_BUILDINGS));
        inst.userData.isCity = true;
        instances.push(inst);
    }

    const getHeight = (worldX, worldZ) => {
        const localX = (worldX / size + 0.5) * (resolution - 1);
        const localZ = (worldZ / size + 0.5) * (resolution - 1);
        const i = Math.floor(localX);
        const j = Math.floor(localZ);
        if (i < 0 || i >= resolution - 1 || j < 0 || j >= resolution - 1) return 0;
        const idx = j * resolution + i;
        return heightData[idx] * height;
    };

    return { 
        mesh, 
        treeInstances: instances, 
        heightData, 
        getHeight, 
        moistureNoise, 
        geometries: { ruralGeo, subGeo, urbGeo, spaceGeo },
        treeGeoms: { pineGeo, oakGeo, palmGeo, cactusGeo }
    };
}

function sampleCustomHeightmap(u, v, data) {
    const x = Math.floor(u * (data.width - 1));
    const y = Math.floor(v * (data.height - 1));
    const idx = (y * data.width + x) * 4;
    return data.pixels[idx] / 255;
}

/**
 * Simple particle-based hydraulic erosion.
 * Simulates water droplets carving realistic valleys and ridges.
 * @param {Float32Array} heightData - height values [0..1], modified in-place
 * @param {number} resolution - grid side length
 * @param {number} iterations - number of droplet simulations
 */
function applyHydraulicErosion(heightData, resolution, iterations) {
    const res = resolution;
    const idx = (x, y) => y * res + x;

    for (let drop = 0; drop < iterations; drop++) {
        // Random spawn position
        let px = Math.random() * (res - 1);
        let py = Math.random() * (res - 1);

        let dx = 0, dy = 0; // velocity
        let sediment = 0;   // carried sediment
        let water = 1.0;    // remaining water
        const maxSteps = 64;

        for (let step = 0; step < maxSteps && water > 0.01; step++) {
            const ix = Math.floor(px);
            const iy = Math.floor(py);
            if (ix < 1 || ix >= res - 2 || iy < 1 || iy >= res - 2) break;

            // Bilinear interpolation of height at fractional position
            const fx = px - ix;
            const fy = py - iy;
            const h00 = heightData[idx(ix, iy)];
            const h10 = heightData[idx(ix + 1, iy)];
            const h01 = heightData[idx(ix, iy + 1)];
            const h11 = heightData[idx(ix + 1, iy + 1)];
            const h = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;

            // Compute gradient (height difference -> slope direction)
            const gx = (h10 + h11 - h00 - h01) * 0.5;
            const gy = (h01 + h11 - h00 - h10) * 0.5;

            // Update velocity with inertia + gravity
            const inertia = 0.3;
            dx = dx * inertia - gx * (1 - inertia);
            dy = dy * inertia - gy * (1 - inertia);

            // Normalize direction
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-6) break;
            dx /= len;
            dy /= len;

            // Move droplet
            const newPx = px + dx;
            const newPy = py + dy;

            // New height after moving
            const nix = Math.floor(newPx);
            const niy = Math.floor(newPy);
            if (nix < 0 || nix >= res - 1 || niy < 0 || niy >= res - 1) break;

            const nfx = newPx - nix;
            const nfy = newPy - niy;
            const nh00 = heightData[idx(nix, niy)];
            const nh10 = heightData[idx(nix + 1, niy)];
            const nh01 = heightData[idx(nix, niy + 1)];
            const nh11 = heightData[idx(nix + 1, niy + 1)];
            const newH = nh00 * (1 - nfx) * (1 - nfy) + nh10 * nfx * (1 - nfy) + nh01 * (1 - nfx) * nfy + nh11 * nfx * nfy;

            const hDiff = newH - h;

            if (hDiff > 0) {
                // Moving uphill — deposit sediment
                const deposit = Math.min(sediment, hDiff);
                sediment -= deposit;
                // Deposit at current cell
                heightData[idx(ix, iy)] += deposit * 0.5;
                heightData[idx(ix + 1, iy)] += deposit * 0.125;
                heightData[idx(ix, iy + 1)] += deposit * 0.125;
                heightData[idx(ix + 1, iy + 1)] += deposit * 0.125;
                heightData[idx(ix - 1, iy)] += deposit * 0.0625;
                heightData[idx(ix, iy - 1)] += deposit * 0.0625;
            } else {
                // Moving downhill — erode
                const erodeAmount = Math.min(-hDiff, 0.005 * water);
                sediment += erodeAmount * 0.3;
                // Erode from current cell neighbors
                const e = erodeAmount * 0.15;
                heightData[idx(ix, iy)] -= erodeAmount;
                heightData[idx(ix + 1, iy)] -= e;
                heightData[idx(ix, iy + 1)] -= e;
                heightData[idx(ix + 1, iy + 1)] -= e;
            }

            // Evaporation and sediment capacity
            water *= 0.97;
            sediment *= 0.98;

            px = newPx;
            py = newPy;
        }

        // Deposit remaining sediment at final position
        const fx2 = Math.floor(px);
        const fy2 = Math.floor(py);
        if (fx2 >= 0 && fx2 < res - 1 && fy2 >= 0 && fy2 < res - 1) {
            heightData[idx(fx2, fy2)] += sediment * 0.25;
        }
    }

    // Clamp heights
    for (let i = 0; i < heightData.length; i++) {
        heightData[i] = Math.max(0, Math.min(1.5, heightData[i]));
    }
}

// removed function getBiomeColor() {}