/**
 * PhysicsPro.js — Physics Pro Toolkit plugin for Kamakazii Studio 3D.
 *
 * Provides one-click physics primitives: vehicles, cloth, soft bodies, ragdolls,
 * and fluid simulations — all layered on top of the existing PhysicsSystem.
 *
 * Hooks are registered inline in PluginRegistry._registerBuiltIn().
 */

import * as THREE from 'three';

const PLUGIN_NAME = 'Physics Pro Toolkit';

/**
 * Execute the Physics Pro Toolkit — opens an interactive prompt for the user
 * to choose which physics object to create.
 */
export async function executePhysicsPro(editor) {
  if (!editor) {
    console.warn('[PhysicsPro] No editor available');
    return;
  }

  if (!editor.physicsSystem) {
    console.warn('[PhysicsPro] PhysicsSystem not found on editor');
    return;
  }

  const action = prompt(
    `${PLUGIN_NAME}\n\n` +
    'Available options:\n' +
    '  1 — Add Vehicle (car with suspension/wheels)\n' +
    '  2 — Add Cloth (falling fabric)\n' +
    '  3 — Add Soft Body (jell-o cube from selected mesh)\n' +
    '  4 — Add Ragdoll (simple stick figure)\n' +
    '  5 — Add Fluid (SPH-like particle splash)\n' +
    '  6 — Toggle Physics ON/OFF\n' +
    '  7 — Toggle Debug Visualization\n' +
    '\nEnter number (1-7):',
    '1'
  );

  switch (action?.trim()) {
    case '1': addVehicle(editor); break;
    case '2': addCloth(editor); break;
    case '3': addSoftBody(editor); break;
    case '4': addRagdoll(editor); break;
    case '5': addFluid(editor); break;
    case '6': togglePhysics(editor); break;
    case '7': toggleDebug(editor); break;
    default:
      editor.ui?.log(`${PLUGIN_NAME}: Cancelled or invalid option`, 'info');
  }
}

// ── Helper Implementations ──────────────────────────────────────

function ensurePhysics(editor) {
  const ps = editor.physicsSystem;
  if (!ps) { editor.ui?.log(`${PLUGIN_NAME}: PhysicsSystem not available`, 'error'); return null; }
  if (!ps.enabled) {
    ps.init().then(() => {
      ps.setEnabled(true);
      editor.ui?.log(`${PLUGIN_NAME}: Physics engine started`, 'info');
    });
  }
  return ps;
}

function addVehicle(editor) {
  const ps = ensurePhysics(editor);
  if (!ps) return;

  try {
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.4, 3.6);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x2266cc, roughness: 0.3, metalness: 0.6,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.set(0, 1.5, 0);
    chassis.castShadow = true;
    chassis.name = 'Vehicle_Chassis';
    editor.scene?.add(chassis);
    (editor.objects || []).push(chassis);

    const result = ps.createVehicle(chassis, {
      chassisMass: 150,
      wheels: [
        { position: new THREE.Vector3(-0.8, -0.3, 1.2) },
        { position: new THREE.Vector3(0.8, -0.3, 1.2) },
        { position: new THREE.Vector3(-0.8, -0.3, -1.2) },
        { position: new THREE.Vector3(0.8, -0.3, -1.2) },
      ],
    });

    if (!result) {
      editor.ui?.log(`${PLUGIN_NAME}: Vehicle creation failed (cannon-es may be in shim mode)`, 'error');
      return;
    }

    // Apply initial engine force so the vehicle moves
    if (ps.vehicles?.length > 0) {
      ps.setVehicleInput(ps.vehicles.length - 1, 0, 800, 0);
    }

    editor.ui?.log(`${PLUGIN_NAME}: Vehicle created! Use ps.setVehicleInput(0, steer, engine, brake)`, 'success');
    if (editor.selectObject) editor.selectObject(chassis);
  } catch (e) {
    console.warn('[PhysicsPro] addVehicle failed:', e);
    editor.ui?.log(`${PLUGIN_NAME}: Vehicle error — ${e.message}`, 'error');
  }
}

function addCloth(editor) {
  const ps = ensurePhysics(editor);
  if (!ps) return;

  try {
    const cloth = ps.createCloth(4, 3, 12, { x: 0, y: 6, z: 0 });
    if (cloth) {
      editor.ui?.log(`${PLUGIN_NAME}: Cloth created — watch it fall and drape over objects`, 'success');
      if (editor.selectObject) editor.selectObject(cloth);
    } else {
      editor.ui?.log(`${PLUGIN_NAME}: Cloth creation failed (cannon-es may be in shim mode)`, 'error');
    }
  } catch (e) {
    console.warn('[PhysicsPro] addCloth failed:', e);
    editor.ui?.log(`${PLUGIN_NAME}: Cloth error — ${e.message}`, 'error');
  }
}

function addSoftBody(editor) {
  const sel = editor.selectedObject || editor.selection;
  if (!sel?.isMesh) {
    editor.ui?.log(`${PLUGIN_NAME}: Select a mesh first to turn it into a soft body`, 'warning');
    return;
  }

  const ps = ensurePhysics(editor);
  if (!ps) return;

  try {
    const result = ps.createSoftBody(sel, { resolution: 5, mass: 0.2, stiffness: 200 });
    if (result) {
      editor.ui?.log(`${PLUGIN_NAME}: Soft body created! The mesh will now behave like jell-o`, 'success');
    } else {
      editor.ui?.log(`${PLUGIN_NAME}: Soft body failed (cannon-es may be in shim mode)`, 'warning');
    }
  } catch (e) {
    console.warn('[PhysicsPro] addSoftBody failed:', e);
    editor.ui?.log(`${PLUGIN_NAME}: Soft body error — ${e.message}`, 'error');
  }
}

function addRagdoll(editor) {
  const ps = ensurePhysics(editor);
  if (!ps) return;

  try {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8844, roughness: 0.6 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x44aaff, roughness: 0.4 });

    // Create the group first so physics bodies are created relative to the final position
    const group = new THREE.Group();
    group.name = 'Ragdoll';
    group.position.set(0, 0, -3);

    // ── Build parts (add to group, not scene — avoids reparenting later) ──
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), bodyMat);
    torso.position.set(0, 3.0, 0);
    torso.castShadow = true;
    torso.name = 'Ragdoll_Torso';
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), jointMat);
    head.position.set(0, 3.9, 0);
    head.castShadow = true;
    head.name = 'Ragdoll_Head';
    group.add(head);

    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), bodyMat);
    lArm.position.set(-0.5, 3.2, 0);
    lArm.castShadow = true;
    lArm.name = 'Ragdoll_LArm';
    group.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), bodyMat);
    rArm.position.set(0.5, 3.2, 0);
    rArm.castShadow = true;
    rArm.name = 'Ragdoll_RArm';
    group.add(rArm);

    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), bodyMat);
    lLeg.position.set(-0.25, 2.35, 0);
    lLeg.castShadow = true;
    lLeg.name = 'Ragdoll_LLeg';
    group.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), bodyMat);
    rLeg.position.set(0.25, 2.35, 0);
    rLeg.castShadow = true;
    rLeg.name = 'Ragdoll_RLeg';
    group.add(rLeg);

    // ── Add group to scene before creating bodies (so world matrices are current) ──
    editor.scene?.add(group);

    // ── Create physics bodies — meshes are now at final world positions ──
    const torsoBody = ps.addBody(torso, 30);
    const headBody = head ? ps.addBody(head, 8) : null;
    const lArmBody = lArm ? ps.addBody(lArm, 5) : null;
    const rArmBody = rArm ? ps.addBody(rArm, 5) : null;
    const lLegBody = lLeg ? ps.addBody(lLeg, 10) : null;
    const rLegBody = rLeg ? ps.addBody(rLeg, 10) : null;

    // ── Constraints ──
    if (torsoBody && headBody) {
      ps.createConstraint('point', torsoBody, headBody, {
        pivotA: { x: 0, y: 0.5, z: 0 },
        pivotB: { x: 0, y: -0.3, z: 0 },
      });
    }
    if (torsoBody && lArmBody) {
      ps.createConstraint('hinge', torsoBody, lArmBody, {
        pivotA: { x: -0.4, y: 0.3, z: 0 },
        axisA: { x: 0, y: 0, z: 1 },
        pivotB: { x: 0, y: 0.3, z: 0 },
        axisB: { x: 0, y: 0, z: 1 },
      });
    }
    if (torsoBody && rArmBody) {
      ps.createConstraint('hinge', torsoBody, rArmBody, {
        pivotA: { x: 0.4, y: 0.3, z: 0 },
        axisA: { x: 0, y: 0, z: 1 },
        pivotB: { x: 0, y: 0.3, z: 0 },
        axisB: { x: 0, y: 0, z: 1 },
      });
    }
    if (torsoBody && lLegBody) {
      ps.createConstraint('hinge', torsoBody, lLegBody, {
        pivotA: { x: -0.25, y: -0.5, z: 0 },
        axisA: { x: 0, y: 0, z: 1 },
        pivotB: { x: 0, y: 0.35, z: 0 },
        axisB: { x: 0, y: 0, z: 1 },
      });
    }
    if (torsoBody && rLegBody) {
      ps.createConstraint('hinge', torsoBody, rLegBody, {
        pivotA: { x: 0.25, y: -0.5, z: 0 },
        axisA: { x: 0, y: 0, z: 1 },
        pivotB: { x: 0, y: 0.35, z: 0 },
        axisB: { x: 0, y: 0, z: 1 },
      });
    }

    // Register all parts for selection
    (editor.objects || []).push(group);

    editor.ui?.log(`${PLUGIN_NAME}: Ragdoll created with 6 hinge joints!`, 'success');
    if (editor.selectObject) editor.selectObject(group);
  } catch (e) {
    console.warn('[PhysicsPro] addRagdoll failed:', e);
    editor.ui?.log(`${PLUGIN_NAME}: Ragdoll error — ${e.message}`, 'error');
  }
}

function addFluid(editor) {
  const ps = ensurePhysics(editor);
  if (!ps) return;

  try {
    const pos = new THREE.Vector3(0, 4, 0);
    ps.createFluid(pos, 150);
    editor.ui?.log(`${PLUGIN_NAME}: Fluid particle splash created!`, 'success');
  } catch (e) {
    console.warn('[PhysicsPro] addFluid failed:', e);
    editor.ui?.log(`${PLUGIN_NAME}: Fluid error — ${e.message}`, 'error');
  }
}

function togglePhysics(editor, force) {
  const ps = editor.physicsSystem;
  if (!ps) { editor.ui?.log(`${PLUGIN_NAME}: PhysicsSystem not available`, 'error'); return; }

  const enabled = force !== undefined ? force : !ps.enabled;
  ps.setEnabled(enabled);
  editor.ui?.log(`${PLUGIN_NAME}: Simulation ${enabled ? 'STARTED' : 'STOPPED'}`, 'info');
}

function toggleDebug(editor) {
  const ps = editor.physicsSystem;
  if (!ps) { editor.ui?.log(`${PLUGIN_NAME}: PhysicsSystem not available`, 'error'); return; }

  const enabled = !ps._debugEnabled;
  ps.setDebug(enabled);
  editor.ui?.log(`${PLUGIN_NAME}: Debug viz ${enabled ? 'ON' : 'OFF'}`, 'info');
}
