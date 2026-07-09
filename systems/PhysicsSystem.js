import * as THREE from 'three';

// ── Collision Groups (bitmask) ──
const GROUP = {
  SCENE:    1 << 0,
  DYNAMIC:  1 << 1,
  VEHICLE:  1 << 2,
  CLOTH:    1 << 3,
  FLUID:    1 << 4,
  TRIGGER:  1 << 5,
};

/**
 * PhysicsSystem — Full rigid + soft body simulation via cannon-es.
 *
 * Features:
 * - Rigid bodies (box, sphere, cylinder, trimesh, heightfield)
 * - RaycastVehicle with suspension, steering, engine force
 * - Soft bodies via spring-constrained particle networks
 * - Collision filtering via bitmask groups
 * - Debug wireframe visualization
 * - Constraint types: Distance, Hinge, PointToPoint, Lock, Spring
 * - Trigger volumes with enter/exit callbacks
 */
import { dbg } from '../app/dbg.js';

export class PhysicsSystem {
  constructor(studio) {
    this.studio = studio;
    this.enabled = false;
    this.world = null;
    this.meshes = [];
    this.vehicles = [];
    this.cloths = [];
    this.softBodies = [];
    this.constraints = [];
    this.triggers = [];
    this.debugHelpers = [];
    this.CANNON = null;
    this._inited = false;
    this._debugEnabled = false;
    this._accumulator = 0;
    this._fixedStep = 1 / 60;
    this._contactCallbacks = [];
    this._bodyMeshMap = new Map();
    this._fluidBodies = [];
  }

  async init() {
    if (this._inited) return;
    this._inited = true;

    if (!this.studio || !this.studio.scene) {
      this._inited = false;
      setTimeout(() => { try { this.init(); } catch(e) { dbg.warn('PhysicsSystem retry failed', e); } }, 500);
      dbg.warn('PhysicsSystem: studio.scene not ready, retrying init shortly.');
      return;
    }

    if (typeof window !== 'undefined' && window.ProModelerShims?.PhysicsPlaceholder?.forceShim) {
      console.info('PhysicsSystem: PhysicsPlaceholder forced; skipping dynamic cannon-es import.');
      this.CANNON = null;
    } else {
      try {
        const mod = await import('https://esm.sh/cannon-es@0.20.0');
        this.CANNON = mod && (mod.default ? mod.default : mod);
        if (!this.CANNON) throw new Error('Loaded cannon-es had no exports');
      } catch (err) {
        dbg.warn('cannon-es dynamic import failed, using PhysicsPlaceholder shim:', err);
        this.CANNON = null;
      }
    }

    if (!this.CANNON) {
      this._initShim();
      if (window?.ProModelerShims?.PhysicsPlaceholder) {
        try { window.ProModelerShims.PhysicsPlaceholder.init(); } catch(e) {}
      }
    }

    this._initWorld();
    dbg.log('PhysicsSystem initialized', this.CANNON._isShim ? '(shim)' : '(cannon-es)');
  }

  /* ── Shim (API-complete no-op fallback) ── */

  _initShim() {
    class ShimVec3 {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      vadd(v) { return new ShimVec3(this.x + v.x, this.y + v.y, this.z + v.z); }
      vsub(v) { return new ShimVec3(this.x - v.x, this.y - v.y, this.z - v.z); }
      scale(s) { return new ShimVec3(this.x * s, this.y * s, this.z * s); }
      length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
      normalize() { const l = this.length() || 1; return this.scale(1 / l); }
      cross(v) { return new ShimVec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    }
    class ShimQuat {
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; }
      setFromEuler() {}
      copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; }
    }
    class ShimBody {
      constructor(opts = {}) {
        this.mass = opts.mass ?? 0;
        this.position = opts.position ? new ShimVec3(opts.position.x, opts.position.y, opts.position.z) : new ShimVec3();
        this.quaternion = new ShimQuat();
        this.velocity = new ShimVec3();
        this.angularVelocity = new ShimVec3();
        this.force = new ShimVec3();
        this.torque = new ShimVec3();
        this.shapes = opts.shape ? [opts.shape] : [];
        this.shapeOffsets = [];
        this.shapeOrientations = [];
        this.collisionFilterGroup = opts.collisionFilterGroup ?? GROUP.DYNAMIC;
        this.collisionFilterMask = opts.collisionFilterMask ?? -1;
        this.type = opts.mass === 0 ? 1 : 2;
        this.material = opts.material;
        this.linearDamping = opts.linearDamping ?? 0.01;
        this.angularDamping = opts.angularDamping ?? 0.05;
        this.collisionResponse = true;
        this._listeners = {};
        this.sleepState = 0;
        this.allowSleep = opts.allowSleep ?? false;
      }
      addShape() {}
      removeShape() {}
      applyForce(f) { this.force.x += f.x; this.force.y += f.y; this.force.z += f.z; }
      applyImpulse(impulse) { this.velocity.x += impulse.x; this.velocity.y += impulse.y; this.velocity.z += impulse.z; }
      applyLocalForce() {}
      applyLocalImpulse() {}
      applyTorque(t) { this.torque.x += t.x; this.torque.y += t.y; this.torque.z += t.z; }
      addEventListener(name, fn) { (this._listeners[name] ??= []).push(fn); }
      sleep() { this.sleepState = 2; }
      wakeUp() { this.sleepState = 0; }
    }
    class ShimWorld {
      constructor() {
        this.gravity = new ShimVec3(0, -9.82, 0);
        this.broadphase = null;
        this.solver = { iterations: 10 };
        this.bodies = [];
        this.constraints = [];
        this.contactMaterials = [];
        this._listeners = {};
      }
      step() {}
      addBody(b) { this.bodies.push(b); }
      removeBody(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }
      addConstraint(c) { this.constraints.push(c); }
      removeConstraint(c) { const i = this.constraints.indexOf(c); if (i >= 0) this.constraints.splice(i, 1); }
      addContactMaterial(m) { this.contactMaterials.push(m); }
      addEventListener(name, fn) { (this._listeners[name] ??= []).push(fn); }
    }

    this.CANNON = {
      _isShim: true,
      World: ShimWorld,
      Body: ShimBody,
      Vec3: ShimVec3,
      Quaternion: ShimQuat,
      Box: class { constructor(h) { this.halfExtents = h; } },
      Sphere: class { constructor(r) { this.radius = r; } },
      Cylinder: class { constructor(rt, rb, h, s) { this.radiusTop = rt; this.radiusBottom = rb; this.height = h; this.numSegments = s; } },
      Plane: class { constructor() {} },
      Trimesh: class { constructor(v, i) { this.vertices = v; this.indices = i; } },
      Particle: class { constructor() {} },
      Heightfield: class { constructor(d, opts) { this.data = d; this.elementSize = opts?.elementSize ?? 1; } },
      Material: class { constructor(n) { this.name = n; } },
      ContactMaterial: class { constructor(m1, m2, opts) { this.materials = [m1, m2]; Object.assign(this, opts); } },
      DistanceConstraint: class { constructor(a, b, d) { this.bodyA = a; this.bodyB = b; this.distance = d; } },
      HingeConstraint: class { constructor(a, b, opts) { this.bodyA = a; this.bodyB = b; Object.assign(this, opts || {}); } },
      PointToPointConstraint: class { constructor(a, pa, b, pb) { this.bodyA = a; this.bodyB = b; this.pivotA = pa; this.pivotB = pb; } },
      LockConstraint: class { constructor(a, b) { this.bodyA = a; this.bodyB = b; } },
      Spring: class { constructor(a, b, opts) { this.bodyA = a; this.bodyB = b; Object.assign(this, opts || {}); this.applyForce = () => {}; } },
      SAPBroadphase: class { constructor() {} },
      RaycastVehicle: class {
        constructor(opts) { this.chassisBody = opts.chassisBody; this.wheelInfos = []; this.world = null; }
        addWheel(opts) { const wi = { ...opts, steering: 0, engineForce: 0, brake: 0, rotation: 0, worldTransform: { position: new ShimVec3(), quaternion: new ShimQuat() } }; this.wheelInfos.push(wi); return this.wheelInfos.length - 1; }
        setSteeringValue(v, i) { if (this.wheelInfos[i]) this.wheelInfos[i].steering = v; }
        applyEngineForce(f, i) { if (this.wheelInfos[i]) this.wheelInfos[i].engineForce = f; }
        setBrake(b, i) { if (this.wheelInfos[i]) this.wheelInfos[i].brake = b; }
        updateVehicle() {}
        addToWorld() {}
        removeFromWorld() {}
      },
    };
  }

  _initWorld() {
    try {
      this.world = new this.CANNON.World();
      this.world.gravity.set(0, -9.82, 0);

      if (this.CANNON.SAPBroadphase) {
        try { this.world.broadphase = new this.CANNON.SAPBroadphase(this.world); } catch(e) {}
      }
      if (this.world.solver) this.world.solver.iterations = 10;

      this.defaultMaterial = new this.CANNON.Material('default');
      this.fluidMaterial = new this.CANNON.Material('fluid');

      try {
        this.world.addContactMaterial(new this.CANNON.ContactMaterial(
          this.defaultMaterial, this.defaultMaterial,
          { friction: 0.3, restitution: 0.5 }
        ));
        this.world.addContactMaterial(new this.CANNON.ContactMaterial(
          this.fluidMaterial, this.fluidMaterial,
          { friction: 0.0, restitution: 0.0 }
        ));
        this.world.addContactMaterial(new this.CANNON.ContactMaterial(
          this.fluidMaterial, this.defaultMaterial,
          { friction: 0.1, restitution: 0.15 }
        ));
      } catch(e) {}

      if (this.world.addEventListener) {
        this.world.addEventListener('beginContact', (e) => this._onBeginContact(e));
        this.world.addEventListener('endContact', (e) => this._onEndContact(e));
      }
    } catch(e) {
      dbg.warn('PhysicsSystem._initWorld error:', e);
    }
  }

  /* ── Enable / Disable ── */

  setEnabled(enabled) {
    const was = !!this.enabled;
    this.enabled = !!enabled;
    if (this.enabled && !this._inited) {
      this.init().catch(err => dbg.warn('PhysicsSystem.init on enable failed', err));
    }
    if (this.enabled && !was) {
      if (this.meshes.length === 0 && this.cloths.length === 0) {
        try { this.syncScene(); } catch(e) { dbg.warn('PhysicsSystem.syncScene failed on enable', e); }
      }
    }
    dbg.log(`Physics simulation ${this.enabled ? 'enabled' : 'disabled'}`);
  }

  /* ── Scene Sync ── */

  syncScene() {
    if (!this.world) return;
    this.meshes.forEach(item => {
      if (item?.body && this.world.removeBody) {
        try { this.world.removeBody(item.body); } catch(e) {}
      }
    });
    this.meshes = [];

    // Ground plane
    try {
      if (this.CANNON.Plane && this.CANNON.Body) {
        const groundBody = new this.CANNON.Body({
          mass: 0,
          shape: new this.CANNON.Plane(),
          material: this.defaultMaterial,
          collisionFilterGroup: GROUP.SCENE,
          collisionFilterMask: GROUP.DYNAMIC | GROUP.VEHICLE | GROUP.CLOTH | GROUP.FLUID,
        });
        if (groundBody.quaternion?.setFromEuler) {
          groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        }
        this.world.addBody(groundBody);
      }
    } catch(e) {}

    // Convert scene meshes to rigid bodies
    (this.studio.objects || []).forEach(obj => {
      if (obj?.isMesh && obj.name !== 'Plane' && obj.name !== 'outline' && obj.name !== '__hoverOutline' && !obj.userData.isCloth) {
        this.addBody(obj);
      }
    });
  }

  /* ── Rigid Bodies ── */

  addBody(mesh, mass = 1, opts = {}) {
    if (!mesh?.geometry || !this.world) return null;

    const geometry = mesh.geometry;
    try { geometry.computeBoundingBox?.(); } catch(e) {}
    const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);

    let shape = null;
    try {
      const type = (geometry.type || '').toLowerCase();
      if (type.includes('sphere') && this.CANNON.Sphere) {
        shape = new this.CANNON.Sphere(size.x / 2);
      } else if (type.includes('cylinder') && this.CANNON.Cylinder) {
        shape = new this.CANNON.Cylinder(size.x / 2, size.x / 2, size.y, 12);
      } else if (this.CANNON.Box && this.CANNON.Vec3) {
        shape = new this.CANNON.Box(new this.CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
      }
    } catch(e) { shape = null; }

    if (!shape) return null;

    try {
      const group = opts.group ?? (mass === 0 ? GROUP.SCENE : GROUP.DYNAMIC);
      const mask = opts.mask ?? -1;
      const body = new this.CANNON.Body({
        mass,
        position: new this.CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        shape,
        material: opts.material ?? this.defaultMaterial,
        collisionFilterGroup: group,
        collisionFilterMask: mask,
        linearDamping: opts.linearDamping ?? 0.01,
        angularDamping: opts.angularDamping ?? 0.05,
      });
      if (body.quaternion?.set) {
        body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
      }
      body.allowSleep = true;
      if (body.sleepSpeedLimit !== undefined) body.sleepSpeedLimit = 0.1;
      if (body.sleepTimeLimit !== undefined) body.sleepTimeLimit = 1;

      this.world.addBody(body);
      this.meshes.push({ mesh, body });
      this._bodyMeshMap.set(body, mesh);
      return body;
    } catch(e) {
      dbg.warn('PhysicsSystem.addBody failed:', e);
      return null;
    }
  }

  removeBody(mesh) {
    const idx = this.meshes.findIndex(m => m.mesh === mesh);
    if (idx < 0) return;
    const item = this.meshes[idx];
    try { this.world?.removeBody(item.body); } catch(e) {}
    this._bodyMeshMap.delete(item.body);
    this.meshes.splice(idx, 1);
  }

  /**
   * Add a trimesh collision shape from geometry vertices/faces.
   */
  addTrimesh(mesh, mass = 0) {
    if (!mesh?.geometry || !this.world || !this.CANNON.Trimesh) return null;
    const geo = mesh.geometry;
    const pos = geo.attributes.position?.array;
    if (!pos) return null;

    const vertices = new Float32Array(pos);
    let indices;
    if (geo.index?.array) {
      indices = new Uint32Array(geo.index.array);
    } else {
      indices = new Uint32Array(pos.length / 3);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
    }

    try {
      const shape = new this.CANNON.Trimesh(vertices, indices);
      const body = new this.CANNON.Body({
        mass,
        position: new this.CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        shape,
        material: this.defaultMaterial,
        collisionFilterGroup: mass === 0 ? GROUP.SCENE : GROUP.DYNAMIC,
      });
      if (body.quaternion?.set) {
        body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
      }
      this.world.addBody(body);
      this.meshes.push({ mesh, body });
      this._bodyMeshMap.set(body, mesh);
      return body;
    } catch(e) {
      dbg.warn('addTrimesh failed:', e);
      return null;
    }
  }

  /**
   * Add a heightfield terrain body.
   */
  addHeightfield(data, elementSize = 1, position) {
    if (!this.world || !this.CANNON.Heightfield) return null;
    try {
      const shape = new this.CANNON.Heightfield(data, { elementSize });
      const body = new this.CANNON.Body({
        mass: 0,
        material: this.defaultMaterial,
        collisionFilterGroup: GROUP.SCENE,
      });
      body.addShape(shape);
      if (position) body.position.set(position.x, position.y, position.z);
      this.world.addBody(body);
      return body;
    } catch(e) {
      dbg.warn('addHeightfield failed:', e);
      return null;
    }
  }

  /* ── Constraints ── */

  createConstraint(type, bodyA, bodyB, opts = {}) {
    if (!this.world) return null;
    let constraint = null;
    try {
      switch (type) {
        case 'distance': {
          const dist = opts.distance ?? bodyA.position.vsub(bodyB.position).length();
          constraint = new this.CANNON.DistanceConstraint(bodyA, bodyB, dist);
          break;
        }
        case 'hinge': {
          const pA = opts.pivotA ? new this.CANNON.Vec3(opts.pivotA.x, opts.pivotA.y, opts.pivotA.z) : new this.CANNON.Vec3();
          const pB = opts.pivotB ? new this.CANNON.Vec3(opts.pivotB.x, opts.pivotB.y, opts.pivotB.z) : new this.CANNON.Vec3();
          const axA = opts.axisA ? new this.CANNON.Vec3(opts.axisA.x, opts.axisA.y, opts.axisA.z) : new this.CANNON.Vec3(1, 0, 0);
          const axB = opts.axisB ? new this.CANNON.Vec3(opts.axisB.x, opts.axisB.y, opts.axisB.z) : new this.CANNON.Vec3(1, 0, 0);
          constraint = new this.CANNON.HingeConstraint(bodyA, bodyB, { pivotA: pA, pivotB: pB, axisA: axA, axisB: axB });
          break;
        }
        case 'point': {
          const ppA = opts.pivotA ? new this.CANNON.Vec3(opts.pivotA.x, opts.pivotA.y, opts.pivotA.z) : new this.CANNON.Vec3();
          const ppB = opts.pivotB ? new this.CANNON.Vec3(opts.pivotB.x, opts.pivotB.y, opts.pivotB.z) : new this.CANNON.Vec3();
          constraint = new this.CANNON.PointToPointConstraint(bodyA, ppA, bodyB, ppB);
          break;
        }
        case 'lock': {
          constraint = new this.CANNON.LockConstraint(bodyA, bodyB);
          break;
        }
        case 'spring': {
          constraint = new this.CANNON.Spring(bodyA, bodyB, {
            restLength: opts.restLength ?? 1,
            stiffness: opts.stiffness ?? 100,
            damping: opts.damping ?? 1,
          });
          break;
        }
      }
      if (constraint) {
        if (type !== 'spring') this.world.addConstraint(constraint);
        this.constraints.push({ constraint, bodyA, bodyB, type });
      }
    } catch(e) {
      dbg.warn(`createConstraint(${type}) failed:`, e);
    }
    return constraint;
  }

  removeConstraint(constraint) {
    const idx = this.constraints.findIndex(c => c.constraint === constraint);
    if (idx < 0) return;
    try { this.world?.removeConstraint(constraint); } catch(e) {}
    this.constraints.splice(idx, 1);
  }

  /* ── Vehicle Physics ── */

  createVehicle(chassisMesh, opts = {}) {
    if (!this.world || !this.CANNON.RaycastVehicle) return null;

    const chassisBody = this.addBody(chassisMesh, opts.chassisMass ?? 150, {
      group: GROUP.VEHICLE,
      mask: GROUP.SCENE | GROUP.DYNAMIC | GROUP.TRIGGER,
    });
    if (!chassisBody) return null;

    // Remove from regular meshes (vehicle handles its own sync)
    const meshIdx = this.meshes.findIndex(m => m.body === chassisBody);
    const chassisRef = meshIdx >= 0 ? this.meshes[meshIdx].mesh : chassisMesh;
    if (meshIdx >= 0) this.meshes.splice(meshIdx, 1);

    const vehicle = new this.CANNON.RaycastVehicle({
      chassisBody,
      indexRightAxis: opts.indexRightAxis ?? 0,
      indexUpAxis: opts.indexUpAxis ?? 1,
      indexForwardAxis: opts.indexForwardAxis ?? 2,
    });

    const wheelDefs = opts.wheels ?? [
      { position: new this.CANNON.Vec3(-0.8, -0.4, 1.2) },
      { position: new this.CANNON.Vec3(0.8, -0.4, 1.2) },
      { position: new this.CANNON.Vec3(-0.8, -0.4, -1.2) },
      { position: new this.CANNON.Vec3(0.8, -0.4, -1.2) },
    ];

    const wheelIndices = [];
    for (const wd of wheelDefs) {
      const idx = vehicle.addWheel({
        chassisConnectionPointLocal: wd.position,
        directionLocal: wd.direction ?? new this.CANNON.Vec3(0, -1, 0),
        axleLocal: wd.axle ?? new this.CANNON.Vec3(-1, 0, 0),
        suspensionRestLength: wd.suspensionRestLength ?? 0.3,
        radius: wd.radius ?? 0.35,
        suspensionStiffness: wd.suspensionStiffness ?? 30,
        dampingRelaxation: wd.dampingRelaxation ?? 2.3,
        dampingCompression: wd.dampingCompression ?? 4.4,
        maxSuspensionForce: wd.maxSuspensionForce ?? 100000,
        frictionSlip: wd.frictionSlip ?? 3,
        rollInfluence: wd.rollInfluence ?? 0.1,
        maxSuspensionTravel: wd.maxSuspensionTravel ?? 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
      });
      wheelIndices.push(idx);
    }

    vehicle.addToWorld(this.world);

    // Create wheel visual meshes
    const wheelMeshes = wheelIndices.map((wi, i) => {
      const r = vehicle.wheelInfos[wi]?.radius ?? 0.35;
      const geo = new THREE.CylinderGeometry(r, r, 0.2, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
      const wm = new THREE.Mesh(geo, mat);
      wm.rotation.z = Math.PI / 2;
      wm.name = `Wheel_${i}`;
      this.studio.scene.add(wm);
      return wm;
    });

    const entry = { chassis: chassisRef, vehicle, wheelMeshes, wheelIndices };
    this.vehicles.push(entry);
    return entry;
  }

  setVehicleInput(index, steer = 0, engineForce = 0, brake = 0) {
    const entry = this.vehicles[index];
    if (!entry) return;
    const v = entry.vehicle;
    const frontCount = Math.min(2, entry.wheelIndices.length);
    for (let i = 0; i < frontCount; i++) {
      v.setSteeringValue(steer, entry.wheelIndices[i]);
    }
    for (let i = frontCount; i < entry.wheelIndices.length; i++) {
      v.applyEngineForce(engineForce, entry.wheelIndices[i]);
      v.setBrake(brake, entry.wheelIndices[i]);
    }
    for (let i = 0; i < frontCount; i++) {
      v.setBrake(brake, entry.wheelIndices[i]);
    }
  }

  /* ── Soft Bodies / Cloth ── */

  createCloth(width, height, segments, pos) {
    if (!pos) pos = { x: 0, y: 5, z: 0 };
    if (!this.world || !this.CANNON) {
      dbg.warn('createCloth skipped: physics backend not available');
      return null;
    }

    const gapX = width / segments;
    const gapY = height / segments;
    const particleMass = 0.5;
    const particles = [];
    const springs = [];
    const cols = segments + 1;
    const rows = segments + 1;

    try {
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const mass = (j === rows - 1) ? 0 : particleMass;
          const body = new this.CANNON.Body({
            mass,
            shape: new this.CANNON.Particle(),
            position: new this.CANNON.Vec3(
              pos.x + (i - segments * 0.5) * gapX,
              pos.y - (j - segments * 0.5) * gapY,
              pos.z
            ),
            linearDamping: 0.5,
            collisionFilterGroup: GROUP.CLOTH,
            collisionFilterMask: GROUP.SCENE,
          });
          particles.push(body);
          this.world.addBody(body);
        }
      }

      const connect = (i1, j1, i2, j2, stiffness, damping) => {
        const idx1 = i1 * rows + j1;
        const idx2 = i2 * rows + j2;
        if (!particles[idx1] || !particles[idx2]) return;
        const p1 = particles[idx1].position;
        const p2 = particles[idx2].position;
        const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2);
        try {
          springs.push(new this.CANNON.Spring(particles[idx1], particles[idx2], { restLength: dist, stiffness, damping }));
        } catch(e) {}
      };

      // Structural springs
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (i < cols - 1) connect(i, j, i + 1, j, 500, 5);
          if (j < rows - 1) connect(i, j, i, j + 1, 500, 5);
        }
      }
      // Shear springs
      for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows - 1; j++) {
          connect(i, j, i + 1, j + 1, 200, 3);
          connect(i + 1, j, i, j + 1, 200, 3);
        }
      }
      // Bend springs
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (i < cols - 2) connect(i, j, i + 2, j, 100, 2);
          if (j < rows - 2) connect(i, j, i, j + 2, 100, 2);
        }
      }

      const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
      const material = new THREE.MeshStandardMaterial({ color: 0x4a9eff, side: THREE.DoubleSide, roughness: 0.5 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.name = 'Cloth';
      mesh.userData.isCloth = true;
      this.studio.scene.add(mesh);
      (this.studio.objects || []).push(mesh);

      this.cloths.push({ mesh, particles, springs, cols, rows });
      dbg.log(`Cloth created: ${width}x${height}, ${segments} segs, ${springs.length} springs`);
      return mesh;
    } catch(e) {
      dbg.error('createCloth failed:', e);
      return null;
    }
  }

  createSoftBody(mesh, opts = {}) {
    if (!mesh?.geometry || !this.world) return null;
    mesh.geometry.computeBoundingBox?.();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return null;

    const resolution = opts.resolution ?? 5;
    const mass = opts.mass ?? 0.2;
    const stiffness = opts.stiffness ?? 200;
    const damping = opts.damping ?? 3;

    const particles = [];
    const springs = [];
    const stepX = (bb.max.x - bb.min.x) / resolution;
    const stepY = (bb.max.y - bb.min.y) / resolution;
    const stepZ = (bb.max.z - bb.min.z) / resolution;

    for (let x = 0; x <= resolution; x++) {
      for (let y = 0; y <= resolution; y++) {
        for (let z = 0; z <= resolution; z++) {
          const body = new this.CANNON.Body({
            mass,
            shape: new this.CANNON.Particle(),
            position: new this.CANNON.Vec3(
              mesh.position.x + bb.min.x + x * stepX,
              mesh.position.y + bb.min.y + y * stepY,
              mesh.position.z + bb.min.z + z * stepZ
            ),
            linearDamping: 0.3,
            collisionFilterGroup: GROUP.CLOTH,
            collisionFilterMask: GROUP.SCENE | GROUP.DYNAMIC,
          });
          particles.push(body);
          this.world.addBody(body);
        }
      }
    }

    const dim = resolution + 1;
    const idx3d = (x, y, z) => x * dim * dim + y * dim + z;

    for (let x = 0; x <= resolution; x++) {
      for (let y = 0; y <= resolution; y++) {
        for (let z = 0; z <= resolution; z++) {
          const a = idx3d(x, y, z);
          if (x < resolution) springs.push(new this.CANNON.Spring(particles[a], particles[idx3d(x + 1, y, z)], { restLength: stepX, stiffness, damping }));
          if (y < resolution) springs.push(new this.CANNON.Spring(particles[a], particles[idx3d(x, y + 1, z)], { restLength: stepY, stiffness, damping }));
          if (z < resolution) springs.push(new this.CANNON.Spring(particles[a], particles[idx3d(x, y, z + 1)], { restLength: stepZ, stiffness, damping }));
        }
      }
    }

    // Pin surface particles
    if (opts.pinSurface !== false) {
      for (let x = 0; x <= resolution; x++) {
        for (let y = 0; y <= resolution; y++) {
          for (let z = 0; z <= resolution; z++) {
            if (x === 0 || x === resolution || y === 0 || y === resolution || z === 0 || z === resolution) {
              const p = particles[idx3d(x, y, z)];
              p.mass = 0;
              p.type = 1;
            }
          }
        }
      }
    }

    this.softBodies.push({ mesh, particles, springs, dim });
    dbg.log(`Soft body: ${particles.length} particles, ${springs.length} springs`);
    return { mesh, particles, springs };
  }

  /* ── Fluid ── */

  createFluid(position, particleCount = 100) {
    if (!this.world || !this.CANNON) {
      dbg.warn('createFluid skipped: physics backend not available');
      return;
    }

    const radius = 0.15;
    const geo = new THREE.SphereGeometry(radius, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.1, metalness: 0.8 });
    const group = new THREE.Group();
    group.name = 'Fluid Simulation';
    this.studio.scene.add(group);
    (this.studio.objects || []).push(group);

    for (let i = 0; i < particleCount; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const x = position.x + (Math.random() - 0.5) * 1.0;
      const z = position.z + (Math.random() - 0.5) * 1.0;
      const y = position.y + i * (radius * 1.5);
      mesh.position.set(x, y, z);

      try {
        const body = new this.CANNON.Body({
          mass: 0.1,
          shape: new this.CANNON.Sphere(radius),
          position: new this.CANNON.Vec3(x, y, z),
          material: this.fluidMaterial,
          collisionFilterGroup: GROUP.FLUID,
          collisionFilterMask: GROUP.SCENE | GROUP.DYNAMIC | GROUP.FLUID,
          linearDamping: 0.1,
        });
        this.world.addBody(body);
        this.studio.scene.add(mesh);
        this.meshes.push({ mesh, body });
        this._fluidBodies.push({ mesh, body });
      } catch(e) {
        this.studio.scene.add(mesh);
      }
    }
    dbg.log(`Fluid: ${particleCount} particles`);
  }

  /* ── Trigger Volumes ── */

  addTrigger(mesh, onEnter, onExit) {
    if (!mesh?.geometry || !this.world) return null;
    mesh.geometry.computeBoundingBox?.();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return null;
    const s = bb.getSize(new THREE.Vector3());

    try {
      const body = new this.CANNON.Body({
        mass: 0,
        shape: new this.CANNON.Box(new this.CANNON.Vec3(s.x / 2, s.y / 2, s.z / 2)),
        position: new this.CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        collisionFilterGroup: GROUP.TRIGGER,
        collisionFilterMask: GROUP.DYNAMIC | GROUP.VEHICLE,
      });
      body.collisionResponse = false;
      this.world.addBody(body);

      const trigger = { mesh, body, onEnter, onExit, inside: new Set() };
      this.triggers.push(trigger);
      this._bodyMeshMap.set(body, mesh);
      return trigger;
    } catch(e) {
      dbg.warn('addTrigger failed:', e);
      return null;
    }
  }

  /* ── Contact Events ── */

  _onBeginContact(event) {
    if (!event?.bodyA || !event?.bodyB) return;
    for (const trigger of this.triggers) {
      const other = event.bodyA === trigger.body ? event.bodyB : event.bodyB === trigger.body ? event.bodyA : null;
      if (other && !trigger.inside.has(other)) {
        trigger.inside.add(other);
        try { trigger.onEnter?.(other, this._bodyMeshMap.get(other)); } catch(e) {}
      }
    }
    for (const cb of this._contactCallbacks) {
      if ((event.bodyA === cb.bodyA && event.bodyB === cb.bodyB) ||
          (event.bodyA === cb.bodyB && event.bodyB === cb.bodyA)) {
        try { cb.onContact(event); } catch(e) {}
      }
    }
  }

  _onEndContact(event) {
    if (!event?.bodyA || !event?.bodyB) return;
    for (const trigger of this.triggers) {
      const other = event.bodyA === trigger.body ? event.bodyB : event.bodyB === trigger.body ? event.bodyA : null;
      if (other && trigger.inside.has(other)) {
        trigger.inside.delete(other);
        try { trigger.onExit?.(other, this._bodyMeshMap.get(other)); } catch(e) {}
      }
    }
  }

  onContact(bodyA, bodyB, callback) {
    this._contactCallbacks.push({ bodyA, bodyB, onContact: callback });
  }

  /* ── Debug Visualization ── */

  setDebug(enabled) {
    this._debugEnabled = !!enabled;
    if (!enabled) {
      this.debugHelpers.forEach(h => { h.parent?.remove(h); h.geometry?.dispose(); h.material?.dispose(); });
      this.debugHelpers = [];
    }
  }

  _updateDebug() {
    if (!this._debugEnabled) return;
    this.debugHelpers.forEach(h => { h.parent?.remove(h); h.geometry?.dispose(); h.material?.dispose(); });
    this.debugHelpers = [];
    if (!this.CANNON || !this.world) return;

    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });

    for (const { body } of this.meshes) {
      if (!body?.shapes?.length) continue;
      for (const shape of body.shapes) {
        let positions;
        if (shape.halfExtents) {
          const h = shape.halfExtents;
          const v = [-h.x,-h.y,-h.z, h.x,-h.y,-h.z, h.x,h.y,-h.z, -h.x,h.y,-h.z, -h.x,-h.y,h.z, h.x,-h.y,h.z, h.x,h.y,h.z, -h.x,h.y,h.z];
          const edges = [0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7];
          positions = new Float32Array(edges.length * 3);
          for (let i = 0; i < edges.length; i++) { positions[i*3]=v[edges[i]*3]; positions[i*3+1]=v[edges[i]*3+1]; positions[i*3+2]=v[edges[i]*3+2]; }
        } else if (shape.radius) {
          // Sphere wireframe
          const r = shape.radius;
          const segs = 12;
          const pts = [];
          for (let a = 0; a < 3; a++) {
            for (let i = 0; i < segs; i++) {
              const t0 = (i/segs)*Math.PI*2, t1 = ((i+1)/segs)*Math.PI*2;
              const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
              if (a===0) pts.push(r*c0,r*s0,0, r*c1,r*s1,0);
              else if (a===1) pts.push(r*c0,0,r*s0, r*c1,0,r*s1);
              else pts.push(0,r*c0,r*s0, 0,r*c1,r*s1);
            }
          }
          positions = new Float32Array(pts);
        } else {
          continue; // Skip unsupported shapes (trimesh, heightfield)
        }
        if (positions?.length > 0) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          const line = new THREE.LineSegments(geo, mat);
          line.position.copy(body.position);
          line.quaternion.copy(body.quaternion);
          this.studio.scene.add(line);
          this.debugHelpers.push(line);
        }
      }
    }
  }

  /* ── Main Update Loop ── */

  update(deltaTime) {
    if (!this.enabled || !this.world) return;

    try {
      this._accumulator += Math.min(deltaTime, 0.1);

      while (this._accumulator >= this._fixedStep) {
        this._applySpringForces();
        if (typeof this.world.step === 'function') {
          this.world.step(this._fixedStep, this._fixedStep, 3);
        }
        this._accumulator -= this._fixedStep;
      }

      this._syncPhysicsToScene();
      this._syncCloths();
      this._syncVehicles();

      if (this._debugEnabled) this._updateDebug();
    } catch(e) {
      dbg.warn('Physics update failed:', e);
    }
  }

  _applySpringForces() {
    for (const cloth of this.cloths) {
      for (const spring of cloth.springs) {
        try { spring.applyForce?.(); } catch(e) {}
      }
    }
    for (const sb of this.softBodies) {
      for (const spring of sb.springs) {
        try { spring.applyForce?.(); } catch(e) {}
      }
    }
  }

  _syncPhysicsToScene() {
    for (const item of this.meshes) {
      try {
        if (!item.body || !item.mesh) continue;
        if (item.body.position && typeof item.body.position.x !== 'undefined') {
          if (item.mesh.position?.copy) {
            item.mesh.position.copy(item.body.position);
          } else if (item.mesh.position?.set) {
            item.mesh.position.set(item.body.position.x, item.body.position.y, item.body.position.z);
          }
        }
        if (item.body.quaternion && item.mesh.quaternion?.copy) {
          item.mesh.quaternion.copy(item.body.quaternion);
        }
      } catch(e) {}
    }
  }

  _syncCloths() {
    for (const cloth of this.cloths) {
      try {
        const positions = cloth.mesh.geometry.attributes.position?.array;
        if (!positions) continue;
        for (let i = 0; i < cloth.particles.length; i++) {
          const body = cloth.particles[i];
          if (!body?.position) continue;
          positions[i * 3] = body.position.x;
          positions[i * 3 + 1] = body.position.y;
          positions[i * 3 + 2] = body.position.z;
        }
        cloth.mesh.geometry.attributes.position.needsUpdate = true;
        cloth.mesh.geometry.computeVertexNormals();
      } catch(e) {}
    }
  }

  _syncVehicles() {
    for (const entry of this.vehicles) {
      try {
        entry.vehicle.updateVehicle?.();
        const cb = entry.vehicle.chassisBody;
        if (cb && entry.chassis) {
          entry.chassis.position.copy(cb.position);
          entry.chassis.quaternion.copy(cb.quaternion);
        }
        for (let i = 0; i < entry.wheelMeshes.length; i++) {
          const wi = entry.vehicle.wheelInfos?.[entry.wheelIndices[i]];
          const wm = entry.wheelMeshes[i];
          if (!wi || !wm) continue;
          const t = wi.worldTransform;
          if (t) { wm.position.copy(t.position); wm.quaternion.copy(t.quaternion); }
          wm.rotation.x += wi.rotation ?? 0;
        }
      } catch(e) {}
    }
  }

  /* ── Cleanup ── */

  dispose() {
    this.enabled = false;
    for (const { body } of this.meshes) {
      try { this.world?.removeBody(body); } catch(e) {}
    }
    this.meshes = [];
    for (const entry of this.vehicles) {
      try { entry.vehicle.removeFromWorld?.(); } catch(e) {}
    }
    this.vehicles = [];
    for (const c of this.constraints) {
      try { this.world?.removeConstraint(c.constraint); } catch(e) {}
    }
    this.constraints = [];
    this.setDebug(false);
    for (const t of this.triggers) {
      try { this.world?.removeBody(t.body); } catch(e) {}
    }
    this.triggers = [];
    this._bodyMeshMap.clear();
    this._fluidBodies = [];
    dbg.log('PhysicsSystem disposed');
  }
}

export { GROUP };
