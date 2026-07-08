import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createInstanced(geometry, material, positions, colorFunc) {
    const im = new THREE.InstancedMesh(geometry, material, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((tp, i) => {
        dummy.position.set(tp.x, tp.y, tp.z);
        dummy.scale.set(tp.scale, tp.scale, tp.scale);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (colorFunc) im.setColorAt(i, colorFunc(tp));
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
}

export function getTreeGeometries() {
    const trunkColor = new THREE.Color(0x4d2926);
    const pineColor = new THREE.Color(0x1b3012);
    const oakColor = new THREE.Color(0x3a5f0b);
    const palmTrunkColor = new THREE.Color(0x5c4033);
    const palmLeafColor = new THREE.Color(0x228b22);
    const cactusColor = new THREE.Color(0x2d5a27);

    const treeTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.2, 0.4, 4, 6), trunkColor);
    treeTrunkGeo.translate(0, 2, 0);
    const treeFoliageGeo = setGeometryColor(new THREE.ConeGeometry(2, 6, 6), pineColor);
    treeFoliageGeo.translate(0, 5, 0);
    const pineGeo = mergeGeometries([treeTrunkGeo, treeFoliageGeo]);

    const oakTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.5, 3, 6), trunkColor);
    oakTrunkGeo.translate(0, 1.5, 0);
    const oakFoliageGeo = setGeometryColor(new THREE.SphereGeometry(2, 8, 8), oakColor);
    oakFoliageGeo.translate(0, 4, 0);
    const oakGeo = mergeGeometries([oakTrunkGeo, oakFoliageGeo]);

    const palmTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.2, 0.35, 6, 6), palmTrunkColor);
    palmTrunkGeo.translate(0, 3, 0);
    const palmLeaf1 = setGeometryColor(new THREE.CylinderGeometry(0.05, 0.8, 4, 3), palmLeafColor);
    palmLeaf1.rotateX(1.8);
    palmLeaf1.translate(0, 6, 2);
    const palmLeaf2 = palmLeaf1.clone().rotateY(Math.PI * 0.4);
    const palmLeaf3 = palmLeaf1.clone().rotateY(Math.PI * 0.8);
    const palmLeaf4 = palmLeaf1.clone().rotateY(Math.PI * 1.2);
    const palmLeaf5 = palmLeaf1.clone().rotateY(Math.PI * 1.6);
    const palmGeo = mergeGeometries([palmTrunkGeo, palmLeaf1, palmLeaf2, palmLeaf3, palmLeaf4, palmLeaf5]);

    const cactusBody = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), cactusColor);
    cactusBody.translate(0, 1.5, 0);
    const cactusArm = setGeometryColor(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 6), cactusColor);
    cactusArm.rotateZ(Math.PI / 2);
    cactusArm.translate(0.6, 2, 0);
    const cactusGeo = mergeGeometries([cactusBody, cactusArm]);

    // ── New vegetation types ──

    // Birch: white trunk, teardrop foliage
    const birchTrunkColor = new THREE.Color(0xe8e0d0);
    const birchLeafColor = new THREE.Color(0x5a8a3a);
    const birchTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.15, 0.2, 5, 6), birchTrunkColor);
    birchTrunkGeo.translate(0, 2.5, 0);
    const birchLeafGeo = setGeometryColor(new THREE.SphereGeometry(1.8, 8, 8), birchLeafColor);
    birchLeafGeo.scale(1, 1.3, 1);
    birchLeafGeo.translate(0, 6, 0);
    const birchGeo = mergeGeometries([birchTrunkGeo, birchLeafGeo]);

    // Willow: curved trunk, drooping canopy
    const willowTrunkColor = new THREE.Color(0x5a4030);
    const willowLeafColor = new THREE.Color(0x4a7a2a);
    const willowTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.3, 0.4, 4, 6), willowTrunkColor);
    willowTrunkGeo.translate(0, 2, 0);
    const willowCanopyGeo = setGeometryColor(new THREE.SphereGeometry(2.5, 8, 8), willowLeafColor);
    willowCanopyGeo.scale(1.2, 0.8, 1.2);
    willowCanopyGeo.translate(0, 4.5, 0);
    const willowGeo = mergeGeometries([willowTrunkGeo, willowCanopyGeo]);

    // Redwood: tall trunk, small crown
    const redwoodTrunkColor = new THREE.Color(0x6a3020);
    const redwoodLeafColor = new THREE.Color(0x2a4a1a);
    const redwoodTrunkGeo = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.6, 8, 8), redwoodTrunkColor);
    redwoodTrunkGeo.translate(0, 4, 0);
    const redwoodCrownGeo = setGeometryColor(new THREE.ConeGeometry(2, 4, 6), redwoodLeafColor);
    redwoodCrownGeo.translate(0, 9, 0);
    const redwoodGeo = mergeGeometries([redwoodTrunkGeo, redwoodCrownGeo]);

    // Bamboo: thin green stalks
    const bambooColor = new THREE.Color(0x7a9a3a);
    const bambooGeo1 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.1, 5, 4), bambooColor);
    bambooGeo1.translate(-0.15, 2.5, 0);
    const bambooGeo2 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.1, 6, 4), bambooColor);
    bambooGeo2.translate(0.15, 3, 0.1);
    const bambooLeafGeo = setGeometryColor(new THREE.ConeGeometry(0.8, 1.5, 4), new THREE.Color(0x5a8a2a));
    bambooLeafGeo.translate(0, 5.5, 0);
    const bambooGeo = mergeGeometries([bambooGeo1, bambooGeo2, bambooLeafGeo]);

    // Bush: low dense shrub
    const bushColor = new THREE.Color(0x3a6a2a);
    const bushGeo = setGeometryColor(new THREE.SphereGeometry(1, 6, 6), bushColor);
    bushGeo.scale(1.2, 0.7, 1.2);
    bushGeo.translate(0, 0.5, 0);

    // Rock / Boulder
    const rockColor = new THREE.Color(0x7a7a7a);
    const rockGeo = setGeometryColor(new THREE.DodecahedronGeometry(0.8, 0), rockColor);
    rockGeo.scale(1, 0.7, 1);
    rockGeo.translate(0, 0.3, 0);

    // Grass patch
    const grassColor = new THREE.Color(0x5a9a3a);
    const grassBlade1 = setGeometryColor(new THREE.ConeGeometry(0.1, 0.6, 3), grassColor);
    grassBlade1.translate(-0.2, 0.3, 0);
    const grassBlade2 = setGeometryColor(new THREE.ConeGeometry(0.1, 0.5, 3), grassColor);
    grassBlade2.translate(0.1, 0.25, 0.15);
    const grassBlade3 = setGeometryColor(new THREE.ConeGeometry(0.1, 0.55, 3), grassColor);
    grassBlade3.translate(0.15, 0.275, -0.1);
    const grassPatchGeo = mergeGeometries([grassBlade1, grassBlade2, grassBlade3]);

    // Flowers
    const flowerStemColor = new THREE.Color(0x3a6a2a);
    const flowerPetalColors = [new THREE.Color(0xff6a8a), new THREE.Color(0xffaa40), new THREE.Color(0xaa6aff), new THREE.Color(0xffffff)];
    const flowerStemGeo = setGeometryColor(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), flowerStemColor);
    flowerStemGeo.translate(0, 0.25, 0);
    const flowerPetalGeo = setGeometryColor(new THREE.SphereGeometry(0.15, 6, 6), flowerPetalColors[0]);
    flowerPetalGeo.translate(0, 0.55, 0);
    const flowerGeo = mergeGeometries([flowerStemGeo, flowerPetalGeo]);

    return { pineGeo, oakGeo, palmGeo, cactusGeo, birchGeo, willowGeo, redwoodGeo, bambooGeo, bushGeo, rockGeo, grassPatchGeo, flowerGeo };
}

function setGeometryColor(geo, color) {
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}

export function getBuildingGeometries() {
    // Rural: Red body, dark roof
    const ruralBody = setGeometryColor(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.Color(0x8b0000));
    ruralBody.translate(0, 0.4, 0);
    const ruralRoof = setGeometryColor(new THREE.BoxGeometry(0.9, 0.4, 0.9), new THREE.Color(0x222222));
    ruralRoof.translate(0, 0.8, 0);
    const ruralGeo = mergeGeometries([ruralBody, ruralRoof]);

    // Suburban: Tan body, dark sloped roof
    const subBody = setGeometryColor(new THREE.BoxGeometry(1.2, 0.8, 1.2), new THREE.Color(0xddccbb));
    subBody.translate(0, 0.4, 0);
    const subRoof = setGeometryColor(new THREE.ConeGeometry(1.1, 0.6, 4), new THREE.Color(0x333333));
    subRoof.rotateY(Math.PI / 4);
    subRoof.translate(0, 1.1, 0);
    const subGeo = mergeGeometries([subBody, subRoof]);

    // Urban: Dark blue body, yellow windows
    const urbBody = setGeometryColor(new THREE.BoxGeometry(1.5, 8, 1.5), new THREE.Color(0x223344));
    urbBody.translate(0, 4, 0);
    
    const windowGeos = [];
    const windowColor = new THREE.Color(0xffffaa);
    for(let f = 1; f < 8; f++) {
        for(let s = 0; s < 4; s++) {
            const w = setGeometryColor(new THREE.BoxGeometry(0.2, 0.2, 0.1), windowColor);
            const angle = s * (Math.PI / 2);
            // Transform geometry directly as BufferGeometry doesn't have position/rotation properties like Object3D
            w.rotateY(-angle);
            w.translate(Math.cos(angle) * 0.76, f * 1.0, Math.sin(angle) * 0.76);
            windowGeos.push(w);
        }
    }
    const urbGeo = mergeGeometries([urbBody, ...windowGeos]);

    // Space: Dome + Light + Tube
    const dome = setGeometryColor(new THREE.SphereGeometry(1.5, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Color(0xaaaaaa));
    const tube = setGeometryColor(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), new THREE.Color(0xcccccc));
    tube.rotateZ(Math.PI / 2);
    tube.translate(1.5, 0.5, 0);
    const light = setGeometryColor(new THREE.SphereGeometry(0.25, 6, 6), new THREE.Color(0x00ff00));
    light.translate(0, 1.6, 0);
    const spaceGeo = mergeGeometries([dome, tube, light]);
    
    // ── New building types ──

    // Castle: stone walls + turret
    const castleWallColor = new THREE.Color(0x8a8a7a);
    const castleRoofColor = new THREE.Color(0x4a3a2a);
    const castleWallGeo = setGeometryColor(new THREE.BoxGeometry(2, 2, 2), castleWallColor);
    castleWallGeo.translate(0, 1, 0);
    const castleTurretGeo = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.4, 3, 8), castleWallColor);
    castleTurretGeo.translate(0.8, 1.5, 0.8);
    const castleTurretRoof = setGeometryColor(new THREE.ConeGeometry(0.5, 1, 8), castleRoofColor);
    castleTurretRoof.translate(0.8, 3.5, 0.8);
    const castleGeo = mergeGeometries([castleWallGeo, castleTurretGeo, castleTurretRoof]);

    // Temple: stepped pyramid
    const templeStoneColor = new THREE.Color(0xd0c8a0);
    const templeStep1 = setGeometryColor(new THREE.BoxGeometry(2, 0.4, 2), templeStoneColor);
    templeStep1.translate(0, 0.2, 0);
    const templeStep2 = setGeometryColor(new THREE.BoxGeometry(1.5, 0.4, 1.5), templeStoneColor);
    templeStep2.translate(0, 0.6, 0);
    const templeStep3 = setGeometryColor(new THREE.BoxGeometry(1, 0.4, 1), templeStoneColor);
    templeStep3.translate(0, 1.0, 0);
    const templeSpire = setGeometryColor(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 6), new THREE.Color(0xaa8840));
    templeSpire.translate(0, 2.0, 0);
    const templeGeo = mergeGeometries([templeStep1, templeStep2, templeStep3, templeSpire]);

    // Dock: wooden platform + posts
    const dockWoodColor = new THREE.Color(0x6a5030);
    const dockPlatform = setGeometryColor(new THREE.BoxGeometry(2, 0.15, 1), dockWoodColor);
    dockPlatform.translate(0, 0.5, 0);
    const dockPost1 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.08, 1, 4), dockWoodColor);
    dockPost1.translate(-0.8, 0.25, -0.4);
    const dockPost2 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.08, 1, 4), dockWoodColor);
    dockPost2.translate(0.8, 0.25, -0.4);
    const dockPost3 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.08, 1, 4), dockWoodColor);
    dockPost3.translate(-0.8, 0.25, 0.4);
    const dockPost4 = setGeometryColor(new THREE.CylinderGeometry(0.08, 0.08, 1, 4), dockWoodColor);
    dockPost4.translate(0.8, 0.25, 0.4);
    const dockGeo = mergeGeometries([dockPlatform, dockPost1, dockPost2, dockPost3, dockPost4]);

    // Lighthouse: white tower + red cap
    const lighthouseBaseColor = new THREE.Color(0xe8e8e8);
    const lighthouseBase = setGeometryColor(new THREE.CylinderGeometry(0.4, 0.5, 3, 8), lighthouseBaseColor);
    lighthouseBase.translate(0, 1.5, 0);
    const lighthouseTop = setGeometryColor(new THREE.CylinderGeometry(0.5, 0.4, 0.5, 8), new THREE.Color(0xcc2020));
    lighthouseTop.translate(0, 3.25, 0);
    const lighthouseLight = setGeometryColor(new THREE.SphereGeometry(0.2, 6, 6), new THREE.Color(0xffff80));
    lighthouseLight.translate(0, 3.6, 0);
    const lighthouseGeo = mergeGeometries([lighthouseBase, lighthouseTop, lighthouseLight]);

    return { ruralGeo, subGeo, urbGeo, spaceGeo, castleGeo, templeGeo, dockGeo, lighthouseGeo };
}