import * as THREE from 'three';

export function getBiomeColor(h, m, preset, customBiomes = []) {
    // Custom Biomes check first
    if (customBiomes && customBiomes.length > 0) {
        let closest = null;
        let minDist = 0.06;
        for (const cb of customBiomes) {
            const dist = Math.abs(h - cb.range);
            if (dist < minDist) {
                minDist = dist;
                closest = cb;
            }
        }
        if (closest) return new THREE.Color(closest.color);
    }

    if (preset === 'ring_of_fire') {
        if (h < 0.3) return new THREE.Color(0xff4500); // Lava orange
        if (h < 0.4) return new THREE.Color(0x331100); // Burnt rock
        if (h > 0.62) return new THREE.Color(0xffaa00);
        const vIntensity = Math.max(0.05, h * 0.2);
        return new THREE.Color(vIntensity, vIntensity * 0.4, vIntensity * 0.2);
    }

    if (preset === 'mars') {
        if (h < 0.2) return new THREE.Color(0x3d1400);
        if (h < 0.5) return new THREE.Color(0xa5452a);
        if (h < 0.8) return new THREE.Color(0xe27b58);
        return new THREE.Color(0xfff0e0);
    }
    
    if (preset === 'moon') {
        if (h < 0.3) return new THREE.Color(0x1a1a1a);
        if (h < 0.6) return new THREE.Color(0x444444);
        if (h < 0.9) return new THREE.Color(0x888888);
        return new THREE.Color(0xcccccc);
    }

    if (preset === 'venus') {
        if (h < 0.3) return new THREE.Color(0x5a4a2a);
        if (h < 0.6) return new THREE.Color(0x8a6d3b);
        if (h < 0.8) return new THREE.Color(0xb08d57);
        return new THREE.Color(0xe5d09e);
    }

    if (preset === 'landlocked') {
        if (h < 0.3) return new THREE.Color(0x556b2f); // Darker grass/scrub
        if (h < 0.5) return new THREE.Color(0x6b8e23); // Olive
        if (h < 0.7) return new THREE.Color(0x8b4513); // Brown
        return new THREE.Color(0xffffff); // Peaks
    }

    if (preset === 'atoll') {
        if (h < 0.15) return new THREE.Color(0x002b5c); // Deep Blue outer
        if (h < 0.3) return new THREE.Color(0x00a0b0);  // Turquoise Lagoon
        if (h < 0.38) return new THREE.Color(0xfff8dc); // White sand ring
        if (h < 0.5) return new THREE.Color(0x228b22);  // Lush palms
        return new THREE.Color(0x555555); // Old reef rock
    }

    // ── New Realistic Biomes ──

    if (preset === 'tundra') {
        if (h < 0.25) return new THREE.Color(0x4a6670); // Frozen lake
        if (h < 0.35) return new THREE.Color(0x8a9a7a); // Lichen/moss
        if (h < 0.5) return new THREE.Color(0x9aaa8a);  // Sparse tundra grass
        if (h < 0.65) return new THREE.Color(0x7a8a6a); // Dwarf shrub
        if (h < 0.8) return new THREE.Color(0xb0a898);  // Rocky scree
        return new THREE.Color(0xe8e8e8);               // Permafrost snow
    }

    if (preset === 'rainforest') {
        if (h < 0.28) return new THREE.Color(0x1a5c3a); // Dense canopy
        if (h < 0.35) return new THREE.Color(0xd2b48c); // River sand
        if (h < 0.5) {
            if (m > 0.6) return new THREE.Color(0x0a4a1a); // Deep jungle
            return new THREE.Color(0x1a6a2a);               // Lighter forest
        }
        if (h < 0.65) return new THREE.Color(0x2a7a3a); // Highland forest
        if (h < 0.8) return new THREE.Color(0x4a5a3a);  // Cloud forest
        return new THREE.Color(0x8a9a8a);               // Misty peaks
    }

    if (preset === 'savanna') {
        if (h < 0.25) return new THREE.Color(0x2d70d6); // Water hole
        if (h < 0.35) return new THREE.Color(0xc4a862); // Dry mud
        if (h < 0.5) {
            if (m < 0.3) return new THREE.Color(0xb8a040); // Golden grass
            return new THREE.Color(0x8a9a3a);               // Green grass
        }
        if (h < 0.65) return new THREE.Color(0xa08830); // Tall dry grass
        if (h < 0.8) return new THREE.Color(0x8a6a2a);  // Laterite soil
        return new THREE.Color(0xb0a080);               // Kopje rock
    }

    if (preset === 'badlands') {
        if (h < 0.2) return new THREE.Color(0x8a4a2a);  // Deep eroded clay
        if (h < 0.35) return new THREE.Color(0xb06030); // Red clay
        if (h < 0.5) return new THREE.Color(0xd08040);  // Orange sandstone
        if (h < 0.65) return new THREE.Color(0xc8a060); // Yellow layer
        if (h < 0.8) return new THREE.Color(0xa08860);  // Grey caprock
        return new THREE.Color(0xd0c8b0);               // White chalk
    }

    if (preset === 'mesa') {
        if (h < 0.25) return new THREE.Color(0xc2a060); // Desert floor
        if (h < 0.45) return new THREE.Color(0xd08840); // Slope sandstone
        if (h < 0.55) return new THREE.Color(0xb84020); // Red cliff band
        if (h < 0.7) return new THREE.Color(0xd0a060);  // Mesa wall
        if (h < 0.85) return new THREE.Color(0xc8b080); // Cap rock
        return new THREE.Color(0xe0d8c0);               // Flat top
    }

    if (preset === 'fjord') {
        if (h < 0.2) return new THREE.Color(0x0a2a4a);  // Deep fjord water
        if (h < 0.28) return new THREE.Color(0x1a4a6a); // Shallow coastal
        if (h < 0.35) return new THREE.Color(0x8a8a6a); // Rocky shore
        if (h < 0.5) return new THREE.Color(0x3a6a2a);  // Coastal forest
        if (h < 0.7) return new THREE.Color(0x5a6a4a);  // Mountain heath
        if (h < 0.85) return new THREE.Color(0x8a8a8a); // Bare rock
        return new THREE.Color(0xe0e8f0);               // Snow cap
    }

    if (h < 0.3) return new THREE.Color(0x2d70d6); // Deep Water
    if (h < 0.35) return m > 0.5 ? new THREE.Color(0xd2b48c) : new THREE.Color(0xeee8aa); // Sand
    if (h < 0.55) {
        if (m < 0.3) return new THREE.Color(0xc2b280); // Desert
        if (m < 0.6) return new THREE.Color(0x6b8e23); // Grass
        return new THREE.Color(0x228b22); // Forest
    }
    if (h < 0.7) return m < 0.4 ? new THREE.Color(0x8b4513) : new THREE.Color(0x555555); // Rock
    if (h < 0.8) return new THREE.Color(0xeeeeee); // High Alt/Snow mix
    return new THREE.Color(0xffffff); // Pure Snow
}