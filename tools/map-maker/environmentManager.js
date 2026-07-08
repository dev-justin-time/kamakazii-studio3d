import * as THREE from 'three';
import { createPerlin2D } from './noiseUtils.js';

export class EnvironmentManager {
    constructor(scene) {
        this.scene = scene;
        this.water = null;
        this.clouds = null;
        this.cloudCanvas = null;
        this.stars = null;
        this.initWater();
    }

    initWater() {
        const waterGeo = new THREE.PlaneGeometry(16384, 16384, 128, 128);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x004d71,
            transparent: true,
            opacity: 0.8,
            roughness: 0.05,
            metalness: 0.3
        });
        this.water = new THREE.Mesh(waterGeo, waterMat);
        this.water.rotation.x = -Math.PI / 2;
        this.scene.add(this.water);        // Store original vertex positions for wave animation
        const posArr = waterGeo.attributes.position.array;
        this._waterOrigY = new Float32Array(posArr.length / 3);
        for (let i = 0; i < this._waterOrigY.length; i++) {
            this._waterOrigY[i] = posArr[i * 3 + 1];
        }
        this._waterVertexCount = this._waterOrigY.length;

        // Day/night cycle state
        this._timeOfDay = 0.5; // 0=midnight, 0.5=noon, 1=midnight
        this._dayNightEnabled = false;
        this._cachedSunLight = null;
        this._cachedAmbientLights = [];
    }

    update(params) {
        const { preset, size, height, seed, showWater } = params;

        // Water visibility and color
        if (preset === 'mars' || preset === 'moon' || preset === 'landlocked' || !showWater) {
            this.water.visible = false;
        } else {
            this.water.visible = true;
            this.water.position.y = height * 0.3;
            if (preset === 'ring_of_fire') {
                this.water.material.color.set(0xff4500); // Match volcano lava orange
                this.water.material.opacity = 1.0;
                this.water.material.emissive = new THREE.Color(0x330000);
            } else if (preset === 'lava_doughnut') {
                this.water.material.emissive = new THREE.Color(0x000000);
                this.water.material.color.set(0x004d71);
                this.water.material.opacity = 0.8;
            } else if (preset === 'venus') {
                this.water.material.color.set(0x8a7f0e); // Corrosive yellow-green
                this.water.material.opacity = 0.95;
                this.water.material.emissive = new THREE.Color(0x1a1a00);
            } else {
                this.water.material.emissive = new THREE.Color(0x000000);
                this.water.material.color.set(0x004d71);
                this.water.material.opacity = 0.8;
            }
        }

        // Clouds visibility and creation
        if (preset !== 'mars' && preset !== 'moon') {
            this.createClouds(size, height, seed, preset === 'venus');
            this.clouds.visible = true;
        } else if (this.clouds) {
            this.clouds.visible = false;
        }

        // Stars for Moon preset
        if (this.stars) this.scene.remove(this.stars);
        if (preset === 'moon') {
            const starGeo = new THREE.BufferGeometry();
            const starPos = [];
            for (let i = 0; i < 3000; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = 8000;
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);
                starPos.push(x, y, z);
            }
            starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
            const starMat = new THREE.PointsMaterial({ 
                color: 0xffffff, size: 2, transparent: true, opacity: 0.9, sizeAttenuation: false, fog: false 
            });
            this.stars = new THREE.Points(starGeo, starMat);
            this.scene.add(this.stars);
        }
    }

    createClouds(size, height, seed, isVenus = false) {
        if (this.clouds) {
            this.scene.remove(this.clouds);
            this.clouds.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.alphaMap) child.material.alphaMap.dispose();
                    child.material.dispose();
                }
            });
        }

        const cloudRes = 512; 
        const canvas = document.createElement('canvas');
        canvas.width = cloudRes;
        canvas.height = cloudRes;
        const ctx = canvas.getContext('2d');
        this.cloudCanvas = canvas;
        
        const cloudNoise = createPerlin2D(seed + 999);
        const imgData = ctx.createImageData(cloudRes, cloudRes);
        for (let y = 0; y < cloudRes; y++) {
            for (let x = 0; x < cloudRes; x++) {
                const nx = x / cloudRes;
                const ny = y / cloudRes;
                
                let v = 0, amp = 1.0, freq = 2.5; 
                for (let k = 0; k < 6; k++) {
                    v += amp * cloudNoise(nx * freq + 10, ny * freq + 10);
                    amp *= 0.5; freq *= 2.0;
                }
                
                v = (v + 0.5); 
                v = Math.pow(Math.max(0, v), 2.5) * 0.7; 
                v = Math.max(0, Math.min(1, (v - 0.2) * 1.5));

                const idx = (y * cloudRes + x) * 4;
                if (isVenus) {
                    imgData.data[idx] = 220;
                    imgData.data[idx + 1] = 180;
                    imgData.data[idx + 2] = 50;
                } else {
                    imgData.data[idx] = 255;
                    imgData.data[idx + 1] = 255;
                    imgData.data[idx + 2] = 255;
                }
                imgData.data[idx + 3] = Math.floor(v * 255);
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        
        // Create cloud structure as a group to add "depth" and avoid flat "Minecraft" look
        this.clouds = new THREE.Group();
        const cloudGeo = new THREE.PlaneGeometry(size * 10, size * 10); 
        
        const createCloudLayer = (yOffset, opacity, speedMult, emissiveInt) => {
            const layerTex = texture.clone();
            layerTex.needsUpdate = true;
            const mat = new THREE.MeshStandardMaterial({
                map: layerTex,
                alphaMap: layerTex,
                transparent: true,
                opacity: opacity,
                depthWrite: false,
                side: THREE.DoubleSide,
                fog: false,
                emissive: 0xffffff,
                emissiveIntensity: emissiveInt,
                roughness: 1,
                metalness: 0
            });
            const mesh = new THREE.Mesh(cloudGeo, mat);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.y = yOffset;
            mesh.userData.speedMult = speedMult;
            return mesh;
        };

        const baseHeight = height + (size * 0.2) + 100;
        const layer1 = createCloudLayer(baseHeight, 0.9, 1.0, 1.0);
        const layer2 = createCloudLayer(baseHeight + 40, 0.7, 0.6, 0.7);
        const layer3 = createCloudLayer(baseHeight + 100, 0.5, 0.4, 0.4);
        
        this.clouds.add(layer1);
        this.clouds.add(layer2);
        this.clouds.add(layer3);
        this.scene.add(this.clouds);
    }

    /**
     * Set time of day (0=midnight, 0.5=noon, 1=midnight).
     * Controls sun position, light color, sky tint, fog density.
     */
    setTimeOfDay(t) {
        this._timeOfDay = Math.max(0, Math.min(1, t));
        this._dayNightEnabled = true;
        this._applyDayNight();
    }

    _applyDayNight() {
        const t = this._timeOfDay;
        // Sun elevation: peaks at noon (t=0.5), 0 at horizon (t=0 or t=1)
        const sunAngle = Math.sin(t * Math.PI);
        const sunHeight = Math.max(0, sunAngle);

        // Light color: warm sunrise/sunset, white noon, blue moonlight
        let r, g, b, intensity;
        if (sunHeight > 0.1) {
            // Daytime — lerp warm->white->warm
            const warmth = 1 - Math.abs(t - 0.5) * 4; // peaks at noon
            r = 1.0;
            g = 0.85 + warmth * 0.15;
            b = 0.6 + warmth * 0.4;
            intensity = 0.5 + sunHeight * 0.8;
        } else {
            // Nighttime — dim blue
            r = 0.2; g = 0.25; b = 0.4;
            intensity = 0.15;
        }

        // Cache light references on first call to avoid scene.traverse every frame
        if (!this._cachedSunLight) {
            this._cachedSunLight = null;
            this._cachedAmbientLights = [];
            this.scene.traverse(child => {
                if (child.isDirectionalLight && !this._cachedSunLight) {
                    this._cachedSunLight = child;
                }
                if (child.isAmbientLight || child.isHemisphereLight) {
                    this._cachedAmbientLights.push(child);
                }
            });
        }

        // Update cached directional sun light
        if (this._cachedSunLight) {
            this._cachedSunLight.color.setRGB(r, g, b);
            this._cachedSunLight.intensity = intensity;
            const angle = (t - 0.25) * Math.PI * 2;
            this._cachedSunLight.position.set(
                Math.cos(angle) * 100,
                Math.sin(angle) * 100 + 20,
                50
            );
        }

        // Update cached ambient/hemisphere lights
        for (const light of this._cachedAmbientLights) {
            light.intensity = 0.2 + sunHeight * 0.4;
        }

        // Sky background color
        if (sunHeight > 0.1) {
            const skyR = 0.3 + sunHeight * 0.23;
            const skyG = 0.5 + sunHeight * 0.32;
            const skyB = 0.7 + sunHeight * 0.16;
            this.scene.background = new THREE.Color(skyR, skyG, skyB);
        } else {
            this.scene.background = new THREE.Color(0x0a0a1a);
        }

        // Fog color matches sky
        if (this.scene.fog) {
            this.scene.fog.color.copy(this.scene.background);
        }

        // Water darkens at night — use waterBright to scale the base color
        if (this.water && this.water.visible) {
            const waterBright = 0.3 + sunHeight * 0.7;
            // Darken the water color proportionally to sunlight
            const baseColor = this.water.material.color;
            // Store original water color on first use
            if (!this._origWaterColor) {
                this._origWaterColor = baseColor.clone();
            }
            baseColor.copy(this._origWaterColor).multiplyScalar(waterBright);
            this.water.material.emissive = new THREE.Color(
                0.0, 0.02 * sunHeight, 0.04 * sunHeight
            );
        }
    }

    animate(time, camera, terrainHeight) {
        if (this.clouds && this.clouds.visible) {
            this.clouds.children.forEach(layer => {
                const mult = layer.userData.speedMult || 1.0;
                const offsetX = time * 0.008 * mult;
                const offsetY = time * 0.004 * mult;
                layer.material.map.offset.set(offsetX, offsetY);
                if (layer.material.alphaMap) {
                    layer.material.alphaMap.offset.set(offsetX, offsetY);
                }
            });
        }

        // ── Wave-animated water with vertex displacement ──
        if (this.water && this.water.visible) {
            this.water.position.x = camera.position.x;
            this.water.position.z = camera.position.z;

            // Animate water vertices with sine waves for realistic ripples
            const geo = this.water.geometry;
            const posArr = geo.attributes.position.array;
            const t2 = time * 0.8;
            for (let i = 0; i < this._waterVertexCount; i++) {
                const ix = i * 3;
                const x = posArr[ix];
                const z = posArr[ix + 2];
                // Multi-frequency wave displacement
                const wave1 = Math.sin(x * 0.005 + t2) * 0.8;
                const wave2 = Math.sin(z * 0.008 + t2 * 1.3) * 0.4;
                const wave3 = Math.sin((x + z) * 0.012 + t2 * 0.7) * 0.2;
                posArr[ix + 1] = this._waterOrigY[i] + wave1 + wave2 + wave3;
            }
            geo.attributes.position.needsUpdate = true;

            // Texture drift for foam/detail
            if (this.water.material.map) {
                this.water.material.map.offset.x = time * 0.02;
                this.water.material.map.offset.y = time * 0.01;
            }
        }

        // ── Day/night cycle (auto-advance if enabled) ──
        if (this._dayNightEnabled) {
            this._timeOfDay = (this._timeOfDay + 0.00005) % 1.0;
            this._applyDayNight();
        }
    }
}