import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Base Command class - expects execute and undo methods to be defined by subclasses.
 * These methods will receive a 'context' object containing necessary external dependencies.
 */
class Command {
    constructor(name) {
        this.name = name;
    }
    execute(context) {
        throw new Error("Execute method must be implemented by subclass.");
    }
    undo(context) {
        throw new Error("Undo method must be implemented by subclass.");
    }
}

export class ApplyBevelModifierCommand extends Command {
    constructor(object, newBevelParams, oldBevelParams = null) {
        super("ApplyBevelModifier");
        this.object = object;
        this.newBevelParams = { ...newBevelParams }; 
        this.oldBevelParams = oldBevelParams ? { ...oldBevelParams } : null; 

        // Store original base geometry only if it's the first time bevel is applied
        if (!object.userData.originalBaseGeometryForBevel) {
            object.userData.originalBaseGeometryForBevel = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBevel; 
        
        this.prevAppliedGeometry = object.geometry; // Store current geometry to dispose if it changes
    }

    execute(context) {
        if (!(this.object instanceof THREE.Mesh)) {
            console.warn(`Bevel modifier requires a Mesh. Object: ${this.object.name} is ${this.object.type}`);
            return;
        }

        let newGeometry;
        const isBox = (this.originalBaseGeometry || this.object.geometry) instanceof THREE.BoxGeometry;

        if (isBox) {
            // Optimized path for BoxGeometry: use RoundedBoxGeometry
            const parameters = this.originalBaseGeometry.parameters;
            const width = parameters.width || 1;
            const height = parameters.height || 1;
            const depth = parameters.depth || 1;
            const radius = this.newBevelParams.amount;
            const segments = Math.floor(this.newBevelParams.segments);
            newGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
        } else {
            // General path: chamfer edges on any mesh geometry
            newGeometry = generateBevelGeometry(this.originalBaseGeometry, this.newBevelParams);
        }
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
             this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bevel = this.newBevelParams; 
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object); 
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldBevelParams) {
            const parameters = this.originalBaseGeometry.parameters;
            const width = parameters.width || 1;
            const height = parameters.height || 1;
            const depth = parameters.depth || 1;
            const radius = this.oldBevelParams.amount;
            const segments = Math.floor(this.oldBevelParams.segments);
            const prevGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.bevel = this.oldBevelParams;
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.bevel;
            }
            delete this.object.userData.originalBaseGeometryForBevel; // Clear original reference if back to non-beveled state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveBevelModifierCommand extends Command {
    constructor(object, bevelParams) {
        super("RemoveBevelModifier");
        this.object = object;
        this.removedBevelParams = { ...bevelParams }; 
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBevel; 
        this.prevAppliedGeometry = object.geometry; 
    }

    execute(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry; 
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.bevel; 
        }
        delete this.object.userData.originalBaseGeometryForBevel; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const parameters = this.originalBaseGeometry.parameters;
        const width = parameters.width || 1;
        const height = parameters.height || 1;
        const depth = parameters.depth || 1;
        const radius = this.removedBevelParams.amount;
        const segments = Math.floor(this.removedBevelParams.segments);

        const newGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bevel = this.removedBevelParams; 
        this.object.userData.originalBaseGeometryForBevel = this.originalBaseGeometry; // Restore original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyArrayModifierCommand extends Command {
    constructor(object, newArrayParams, oldArrayParams = null, prevArrayClonesUUIDs = []) {
        super("ApplyArrayModifier");
        this.object = object;
        this.newArrayParams = { ...newArrayParams };
        this.oldArrayParams = oldArrayParams ? { ...oldArrayParams } : null;
        this.prevArrayClonesUUIDs = [...prevArrayClonesUUIDs]; 

        this.clonesCreatedByThisExecution = []; 
        this.removedClones = []; // Used for undo
    }

    execute(context) {
        if (!this.object) return;

        // Remove previous clones if they exist
        // Note: The previous clones UUIDs are stored in prevArrayClonesUUIDs
        // which might have been from a previous state before this command was executed.
        // It's crucial for undo/redo consistency.
        const currentClonesToRemove = this.object.userData.arrayClones ? [...this.object.userData.arrayClones] : [];
        currentClonesToRemove.forEach(uuid => {
            const clone = context.scene.getObjectByProperty('uuid', uuid);
            if (clone) {
                if (context.selectedObject === clone) { 
                    context.selectNewObject(null);
                }
                context.scene.remove(clone);
                context.disposeObject(clone); // Dispose of the removed clone's resources
                // No need to store in this.removedClones here, as this is for the *current* execute
                // and the undo will handle restoring the *old* state or the scene before this execute.
            }
        });
        
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.array = this.newArrayParams;
        this.object.userData.arrayClones = []; 
        this.clonesCreatedByThisExecution = []; 

        const originalObject = this.object;
        const count = Math.max(1, this.newArrayParams.count); 
        const relativeOffset = new THREE.Vector3(
            this.newArrayParams.relativeOffset.x,
            this.newArrayParams.relativeOffset.y,
            this.newArrayParams.relativeOffset.z
        );
        const constantOffset = new THREE.Vector3(
            this.newArrayParams.constantOffset.x,
            this.newArrayParams.constantOffset.y,
            this.newArrayParams.constantOffset.z
        );

        let objectSize = new THREE.Vector3(1,1,1); 
        if (originalObject.geometry) {
            originalObject.geometry.computeBoundingBox();
            const bbox = originalObject.geometry.boundingBox;
            objectSize = bbox.getSize(new THREE.Vector3());
        }

        for (let i = 1; i < count; i++) {
            const clone = originalObject.clone();
            clone.uuid = THREE.MathUtils.generateUUID(); 
            clone.name = `${originalObject.name || "Object"} Array.${String(i).padStart(3, '0')}`;
            clone.userData = {
                isManagedObject: true,
                isArrayCloneOf: originalObject.uuid, 
                modifiers: {} 
            };
            
            const scaledRelOffsetX = relativeOffset.x * objectSize.x * originalObject.scale.x;
            const scaledRelOffsetY = relativeOffset.y * objectSize.y * originalObject.scale.y;
            const scaledRelOffsetZ = relativeOffset.z * objectSize.z * originalObject.scale.z;

            clone.position.set(
                originalObject.position.x + (scaledRelOffsetX * i) + (constantOffset.x * i),
                originalObject.position.y + (scaledRelOffsetY * i) + (constantOffset.y * i),
                originalObject.position.z + (scaledRelOffsetZ * i) + (constantOffset.z * i)
            );
            clone.rotation.copy(originalObject.rotation);
            clone.scale.copy(originalObject.scale);

            context.scene.add(clone);
            this.object.userData.arrayClones.push(clone.uuid); 
            this.clonesCreatedByThisExecution.push(clone.uuid); 
        }

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object); 
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        
        // Remove clones created by this specific execution
        this.clonesCreatedByThisExecution.forEach(cloneUUID => {
            const cloneObject = context.scene.getObjectByProperty('uuid', cloneUUID);
            if (cloneObject) {
                if (context.selectedObject === cloneObject) { 
                    context.selectNewObject(null);
                }
                context.scene.remove(cloneObject);
                context.disposeObject(cloneObject);
            }
        });
        this.clonesCreatedByThisExecution = []; 

        if (this.oldArrayParams) {
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.array = this.oldArrayParams;
            this.object.userData.arrayClones = []; 

            const originalObject = this.object;
            const count = Math.max(1, this.oldArrayParams.count);
            const relativeOffset = new THREE.Vector3(
                this.oldArrayParams.relativeOffset.x,
                this.oldArrayParams.relativeOffset.y,
                this.oldArrayParams.relativeOffset.z
            );
            const constantOffset = new THREE.Vector3(
                this.oldArrayParams.constantOffset.x,
                this.oldArrayParams.constantOffset.y,
                this.oldArrayParams.constantOffset.z
            );

            let objectSize = new THREE.Vector3(1,1,1);
            if (originalObject.geometry) {
                originalObject.geometry.computeBoundingBox();
                const bbox = originalObject.geometry.boundingBox;
                objectSize = bbox.getSize(new THREE.Vector3());
            }

            for (let i = 1; i < count; i++) {
                const clone = originalObject.clone();
                clone.uuid = THREE.MathUtils.generateUUID(); 
                clone.name = `${originalObject.name || "Object"} Array.${String(i).padStart(3, '0')}`;
                clone.userData = {
                    isManagedObject: true,
                    isArrayCloneOf: originalObject.uuid,
                    modifiers: {}
                };
                
                const scaledRelOffsetX = relativeOffset.x * objectSize.x * originalObject.scale.x;
                const scaledRelOffsetY = relativeOffset.y * objectSize.y * originalObject.scale.y;
                const scaledRelOffsetZ = relativeOffset.z * objectSize.z * originalObject.scale.z;

                clone.position.set(
                    originalObject.position.x + (scaledRelOffsetX * i) + (constantOffset.x * i),
                    originalObject.position.y + (scaledRelOffsetY * i) + (constantOffset.y * i),
                    originalObject.position.z + (scaledRelOffsetZ * i) + (constantOffset.z * i)
                );
                clone.rotation.copy(originalObject.rotation);
                clone.scale.copy(originalObject.scale);

                context.scene.add(clone);
                this.object.userData.arrayClones.push(clone.uuid); 
            }
        } else {
            // If there was no previous array modifier, restore previously removed clones (if any)
            // The `prevArrayClonesUUIDs` capture the state *before* this command executed.
            // It's crucial for undo/redo consistency.
            this.prevArrayClonesUUIDs.forEach(uuid => {
                const clone = context.scene.getObjectByProperty('uuid', uuid);
                if (!clone) { // Only re-add if it's not already in the scene (e.g. from an earlier command's undo)
                    const originalCloneObject = this.removedCloneObjects.find(obj => obj.uuid === uuid);
                    if (originalCloneObject) {
                        context.scene.add(originalCloneObject);
                    }
                }
            });

            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.array;
            }
            delete this.object.userData.arrayClones;
        }
        
        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveArrayModifierCommand extends Command {
    constructor(object, removedArrayParams, removedClonesUUIDs) {
        super("RemoveArrayModifier");
        this.object = object;
        this.removedArrayParams = { ...removedArrayParams };
        this.removedClonesUUIDs = removedClonesUUIDs ? [...removedClonesUUIDs] : [];
        this.removedCloneObjects = []; // Will be populated in execute/undo
    }
    
    execute(context) {
        if (!this.object) return;
        // Capture clones to be removed at execution time
        this.removedCloneObjects = this.removedClonesUUIDs.map(uuid => context.scene.getObjectByProperty('uuid', uuid)).filter(Boolean);
        
        this.removedCloneObjects.forEach(clone => {
            if (context.selectedObject === clone) {
                context.selectNewObject(null);
            }
            context.scene.remove(clone);
            context.disposeObject(clone);
        });
        
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.array;
        }
        delete this.object.userData.arrayClones;

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        this.removedCloneObjects.forEach(clone => {
            context.scene.add(clone);
        });
        
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.array = this.removedArrayParams;
        this.object.userData.arrayClones = this.removedClonesUUIDs;

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyScrewModifierCommand extends Command {
    constructor(object, newScrewParams, oldScrewParams = null) {
        super("ApplyScrewModifier");
        this.object = object;
        this.newScrewParams = { ...newScrewParams };
        this.oldScrewParams = oldScrewParams ? { ...oldScrewParams } : null;

        // Store original base geometry only if it's the first time screw is applied
        if (!object.userData.originalBaseGeometryForScrew) {
            object.userData.originalBaseGeometryForScrew = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForScrew;

        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        const newGeometry = generateScrewGeometry(this.originalBaseGeometry, this.newScrewParams);
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.screw = this.newScrewParams;
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldScrewParams) {
            const prevGeometry = generateScrewGeometry(this.originalBaseGeometry, this.oldScrewParams);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.screw = this.oldScrewParams;
            this.object.userData.originalBaseGeometryForScrew = this.originalBaseGeometry; // Restore reference
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.screw;
            }
            delete this.object.userData.originalBaseGeometryForScrew; // Clear original reference if back to non-screwed state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveScrewModifierCommand extends Command {
    constructor(object, screwParams) {
        super("RemoveScrewModifier");
        this.object = object;
        this.removedScrewParams = { ...screwParams };
        this.originalBaseGeometry = object.userData.originalBaseGeometryForScrew;
        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry;
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.screw;
        }
        delete this.object.userData.originalBaseGeometryForScrew; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const newGeometry = generateScrewGeometry(this.originalBaseGeometry, this.removedScrewParams);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.screw = this.removedScrewParams;
        this.object.userData.originalBaseGeometryForScrew = this.originalBaseGeometry; // Restore reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyBendModifierCommand extends Command {
    constructor(object, newBendParams, oldBendParams = null) {
        super("ApplyBendModifier");
        this.object = object;
        this.newBendParams = { ...newBendParams };
        this.oldBendParams = oldBendParams ? { ...oldBendParams } : null;

        if (!object.userData.originalBaseGeometryForBend) {
            object.userData.originalBaseGeometryForBend = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBend;

        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        const newGeometry = generateBendGeometry(this.originalBaseGeometry, this.newBendParams);
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bend = this.newBendParams;
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldBendParams) {
            const prevGeometry = generateBendGeometry(this.originalBaseGeometry, this.oldBendParams);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.bend = this.oldBendParams;
            this.object.userData.originalBaseGeometryForBend = this.originalBaseGeometry; // Restore reference
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.bend;
            }
            delete this.object.userData.originalBaseGeometryForBend; // Clear original reference if back to non-bent state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveBendModifierCommand extends Command {
    constructor(object, bendParams) {
        super("RemoveBendModifier");
        this.object = object;
        this.removedBendParams = { ...bendParams };
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBend;
        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry;
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.bend;
        }
        delete this.object.userData.originalBaseGeometryForBend; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const newGeometry = generateBendGeometry(this.originalBaseGeometry, this.removedBendParams);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bend = this.removedBendParams;
        this.object.userData.originalBaseGeometryForBend = this.originalBaseGeometry; // Restore reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}


export function generateScrewGeometry(sourceGeometry, params) {
    const { angle, screw, iterations, steps, axis } = params;
    const totalAngle = THREE.MathUtils.degToRad(angle);
    const totalScrewOffset = screw;

    const rotationAxis = new THREE.Vector3(
        axis === 'X' ? 1 : 0,
        axis === 'Y' ? 1 : 0,
        axis === 'Z' ? 1 : 0
    );

    const sourcePositionAttribute = sourceGeometry.attributes.position;
    const sourceVertices = [];
    if (!sourcePositionAttribute) return new THREE.BufferGeometry(); // Handle empty geometry
    
    for (let i = 0; i < sourcePositionAttribute.count; i++) {
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(sourcePositionAttribute, i);
        sourceVertices.push(vertex);
    }
    const numSourceVertices = sourceVertices.length;
    if (numSourceVertices === 0) return new THREE.BufferGeometry();

    const newPositions = [];
    const newIndices = [];
    const newUvs = [];
    const rotationMatrix = new THREE.Matrix4();
    
    // Total steps for a single iteration
    const segmentSteps = Math.max(1, Math.floor(steps)); 

    for (let iter = 0; iter < iterations; iter++) {
        for (let s = 0; s <= segmentSteps; s++) {
            const currentIterationAngle = totalAngle * iter;
            const currentIterationOffset = totalScrewOffset * iter;

            const angleProgress = (s / segmentSteps);
            const currentSegmentAngle = angleProgress * totalAngle;
            const currentSegmentOffset = angleProgress * totalScrewOffset;

            rotationMatrix.makeRotationAxis(rotationAxis, currentIterationAngle + currentSegmentAngle);
            const translation = rotationAxis.clone().multiplyScalar(currentIterationOffset + currentSegmentOffset);
            
            for(let i = 0; i < numSourceVertices; i++) {
                const newVertex = sourceVertices[i].clone().applyMatrix4(rotationMatrix);
                newVertex.add(translation);
                newPositions.push(newVertex.x, newVertex.y, newVertex.z);
                // Simple UV generation for now - could be more complex
                // Assuming original UVs, if any, are 2D
                if (sourceGeometry.attributes.uv) {
                    newUvs.push(sourceGeometry.attributes.uv.getX(i), sourceGeometry.attributes.uv.getY(i));
                } else {
                    // LSCM-style conformal UV unwrap: project vertex onto the screw ribbon surface.
                    // Use the arc-length along the ribbon (angleProgress) as U,
                    // and the cross-section position as V.
                    const u = angleProgress; // 0..1 along ribbon length
                    // V: normalize vertex position relative to source bounding box center
                    const vDist = Math.sqrt(newVertex.x * newVertex.x + newVertex.z * newVertex.z);
                    const v = vDist > 0 ? (Math.atan2(newVertex.z, newVertex.x) / (2 * Math.PI) + 0.5) : 0.5;
                    newUvs.push(u, v);
                }
            }

            // Create faces from segments, forming a ribbon
            if (s < segmentSteps) {
                const baseIndex = (iter * (segmentSteps + 1) + s) * numSourceVertices;
                const nextBaseIndex = (iter * (segmentSteps + 1) + s + 1) * numSourceVertices;

                const sourceIndex = sourceGeometry.index;
                if (sourceIndex) {
                    // Connect vertices forming quads between current and next segment
                    for (let i = 0; i < sourceIndex.count; i += 3) {
                        const v0 = sourceIndex.getX(i);
                        const v1 = sourceIndex.getX(i + 1);
                        const v2 = sourceIndex.getX(i + 2);

                        // Edges of the source triangle
                        const edges = [[v0, v1], [v1, v2], [v2, v0]];

                        edges.forEach(([idxA, idxB]) => {
                            // Triangle 1
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(baseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxB);
                            
                            // Triangle 2
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(nextBaseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxA);
                        });
                    }
                } else { // Handle non-indexed geometry (simple triangles)
                    for (let i = 0; i < numSourceVertices; i += 3) {
                        const v0 = i;
                        const v1 = i + 1;
                        const v2 = i + 2;

                        if (v2 >= numSourceVertices) continue; // Ensure valid triangle

                        // Edges of the source triangle
                        const edges = [[v0, v1], [v1, v2], [v2, v0]];

                        edges.forEach(([idxA, idxB]) => {
                            // Triangle 1
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(baseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxB);
                            
                            // Triangle 2
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(nextBaseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxA);
                        });
                    }
                }
            }
        }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newUvs.length > 0 && newUvs.length === newPositions.length / 3 * 2) {
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    return newGeometry;
}

export function generateBendGeometry(sourceGeometry, params) {
    const { angle, axis } = params; // angle in degrees, axis: 'X', 'Y', 'Z' (the axis along which the object extends and is bent)
    const bendAngleRad = THREE.MathUtils.degToRad(angle);

    const sourcePositions = sourceGeometry.attributes.position;
    const newPositions = [];
    const newUvs = [];

    if (!sourcePositions) return new THREE.BufferGeometry();

    sourceGeometry.computeBoundingBox();
    const bbox = sourceGeometry.boundingBox;
    
    // Determine the primary axis for bending and the plane where curvature occurs
    let primaryAxis, tangentAxis, normalAxis;
    let primaryMin, primaryMax;

    if (axis === 'X') {
        primaryAxis = 'x'; tangentAxis = 'y'; normalAxis = 'z';
        primaryMin = bbox.min.x; primaryMax = bbox.max.x;
    } else if (axis === 'Y') {
        primaryAxis = 'y'; tangentAxis = 'x'; normalAxis = 'z';
        primaryMin = bbox.min.y; primaryMax = bbox.max.y;
    } else { // axis === 'Z'
        primaryAxis = 'z'; tangentAxis = 'x'; normalAxis = 'y'; // Bending along Z, curving in XZ plane (Y remains unchanged)
        primaryMin = bbox.min.z; primaryMax = bbox.max.z;
    }

    const lengthAlongPrimaryAxis = primaryMax - primaryMin;
    if (lengthAlongPrimaryAxis === 0 || bendAngleRad === 0) {
        // If no length along the axis or no bend angle, return original geometry
        return sourceGeometry.clone(); 
    }

    // Calculate the radius of the bend
    const radius = lengthAlongPrimaryAxis / bendAngleRad;
    const offset = radius; // Offset to ensure bend starts from a flat plane (tangent)

    for (let i = 0; i < sourcePositions.count; i++) {
        const x_orig = sourcePositions.getX(i);
        const y_orig = sourcePositions.getY(i);
        const z_orig = sourcePositions.getZ(i);

        let p_primary, p_tangent, p_normal;
        
        // Map original coordinates to bending system
        if (axis === 'X') {
            p_primary = x_orig; p_tangent = y_orig; p_normal = z_orig;
        } else if (axis === 'Y') {
            p_primary = y_orig; p_tangent = x_orig; p_normal = z_orig;
        } else { // axis === 'Z'
            p_primary = z_orig; p_tangent = x_orig; p_normal = y_orig;
        }

        // Normalize primary coordinate relative to min/max
        const normalizedPrimary = (p_primary - primaryMin) / lengthAlongPrimaryAxis;
        const currentAngle = normalizedPrimary * bendAngleRad;

        // Apply cylindrical bend transformation
        // new primary coord becomes part of arc, new normal coord becomes distance from arc
        const new_p_primary = radius * Math.sin(currentAngle);
        const new_p_normal = radius * Math.cos(currentAngle) - offset + p_normal;
        
        // Reconstruct coordinates and translate back to original min/max bounds
        if (axis === 'X') {
            newPositions.push(new_p_primary + primaryMin, p_tangent, new_p_normal);
        } else if (axis === 'Y') {
            newPositions.push(p_tangent, new_p_primary + primaryMin, new_p_normal);
        } else { // axis === 'Z'
            newPositions.push(new_p_normal, p_tangent, new_p_primary + primaryMin);
        }
        
        if (sourceGeometry.attributes.uv) {
            newUvs.push(sourceGeometry.attributes.uv.getX(i), sourceGeometry.attributes.uv.getY(i));
        }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newUvs.length > 0) {
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    if (sourceGeometry.index) {
        newGeometry.setIndex(sourceGeometry.index);
    }
    newGeometry.computeVertexNormals();
    return newGeometry;
}

// Export the base Command class so other commands in script.js can extend it.
export { Command };

/**
 * Generate a beveled (chamfered) version of any arbitrary BufferGeometry.
 *
 * Algorithm:
 *   1. Build edge-face adjacency from the indexed geometry
 *   2. Identify sharp edges (dihedral angle > angleLimit)
 *   3. For each sharp edge, duplicate and offset vertices along edge normals
 *   4. Create chamfer strip faces connecting original and offset vertices
 *   5. Reassemble into a new BufferGeometry with proper UVs and normals
 *
 * @param {THREE.BufferGeometry} sourceGeometry
 * @param {Object} params
 * @param {number} params.amount    - Bevel width (offset distance)
 * @param {number} [params.segments=1] - Subdivisions along the chamfer strip
 * @param {number} [params.angleLimit=30] - Minimum dihedral angle (degrees) to bevel
 * @returns {THREE.BufferGeometry}
 */
export function generateBevelGeometry(sourceGeometry, params) {
    const amount = params.amount || 0.1;
    const segments = Math.max(1, Math.floor(params.segments || 1));
    const angleLimitRad = THREE.MathUtils.degToRad(params.angleLimit !== undefined ? params.angleLimit : 30);

    // Ensure we have indexed geometry
    let geo = sourceGeometry;
    if (!geo.index) {
        geo = geo.clone();
        // Create a trivial index for non-indexed geometry
        const posAttr = geo.attributes.position;
        const idx = [];
        for (let i = 0; i < posAttr.count; i++) idx.push(i);
        geo.setIndex(idx);
    }

    const positions = geo.attributes.position;
    // Clone geometry to avoid mutating the input when computing normals
    if (!geo.attributes.normal) {
        geo = geo.clone();
        geo.computeVertexNormals();
    }
    const normals = geo.attributes.normal;
    const uvs = geo.attributes.uv;
    const index = geo.index;

    const faceCount = index.count / 3;
    const vertCount = positions.count;

    // ── Step 1: Build edge-face adjacency ──
    const edgeFaces = new Map(); // "vMin_vMax" -> [{ faceIdx, normal }]
    const faceNormals = [];

    for (let f = 0; f < faceCount; f++) {
        const i0 = index.getX(f * 3);
        const i1 = index.getX(f * 3 + 1);
        const i2 = index.getX(f * 3 + 2);

        // Compute face normal
        const p0 = new THREE.Vector3().fromBufferAttribute(positions, i0);
        const p1 = new THREE.Vector3().fromBufferAttribute(positions, i1);
        const p2 = new THREE.Vector3().fromBufferAttribute(positions, i2);
        const e1 = new THREE.Vector3().subVectors(p1, p0);
        const e2 = new THREE.Vector3().subVectors(p2, p0);
        const fn = new THREE.Vector3().crossVectors(e1, e2).normalize();
        faceNormals.push(fn);

        // Register edges
        const edges = [[i0, i1], [i1, i2], [i2, i0]];
        for (const [a, b] of edges) {
            const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
            if (!edgeFaces.has(key)) edgeFaces.set(key, []);
            edgeFaces.get(key).push({ faceIdx: f, normal: fn, verts: [a, b] });
        }
    }

    // ── Step 2: Identify sharp edges ──
    const sharpEdges = [];
    for (const [key, faces] of edgeFaces) {
        if (faces.length === 2) {
            const dot = faces[0].normal.dot(faces[1].normal);
            const dihedral = Math.acos(Math.min(1, Math.max(-1, dot)));
            if (dihedral >= angleLimitRad) {
                sharpEdges.push({
                    key,
                    v0: faces[0].verts[0],
                    v1: faces[0].verts[1],
                    normal0: faces[0].normal,
                    normal1: faces[1].normal,
                    face0: faces[0].faceIdx,
                    face1: faces[1].faceIdx,
                    dihedral
                });
            }
        }
    }

    if (sharpEdges.length === 0) {
        return sourceGeometry.clone(); // No edges to bevel
    }

    // ── Step 3: Build vertex offset map ──
    // For each vertex involved in a sharp edge, compute an offset direction
    // as the average of the bisectors of all adjacent sharp edges.
    const vertexOffsets = new Map(); // vertIdx -> { offset: Vector3, count: number }

    for (const edge of sharpEdges) {
        // Edge direction
        const p0 = new THREE.Vector3().fromBufferAttribute(positions, edge.v0);
        const p1 = new THREE.Vector3().fromBufferAttribute(positions, edge.v1);
        const edgeDir = new THREE.Vector3().subVectors(p1, p0).normalize();

        // Bisector of the two face normals (points inward toward the chamfer)
        const bisector = new THREE.Vector3()
            .addVectors(edge.normal0, edge.normal1)
            .normalize();

        // Offset direction: perpendicular to edge, in the plane of the chamfer
        const offsetDir = new THREE.Vector3()
            .crossVectors(edgeDir, bisector)
            .normalize();

        // The actual offset is along the face normals, projected to be perpendicular to the edge
        // For each vertex, accumulate offset from both adjacent faces
        for (const vi of [edge.v0, edge.v1]) {
            if (!vertexOffsets.has(vi)) {
                vertexOffsets.set(vi, { offset: new THREE.Vector3(), count: 0 });
            }
            const entry = vertexOffsets.get(vi);
            // Offset along each face normal, pulling the vertex inward
            entry.offset.add(edge.normal0.clone().multiplyScalar(-1));
            entry.offset.add(edge.normal1.clone().multiplyScalar(-1));
            entry.count += 2;
        }
    }

    // Normalize offsets and scale by amount
    for (const [vi, entry] of vertexOffsets) {
        entry.offset.divideScalar(entry.count).normalize().multiplyScalar(amount);
    }

    // ── Step 4: Build new geometry ──
    const newPositions = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];

    // Copy original vertices
    for (let i = 0; i < vertCount; i++) {
        newPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
        if (normals) {
            newNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
        }
        if (uvs) {
            newUvs.push(uvs.getX(i), uvs.getY(i));
        }
    }

    // For each sharp edge, create chamfer strip vertices
    // Map: "vertIdx_segmentIdx" -> new vertex index
    const chamferVertMap = new Map();

    function addChamferVertex(origIdx, segIdx) {
        const mapKey = `${origIdx}_${segIdx}`;
        if (chamferVertMap.has(mapKey)) return chamferVertMap.get(mapKey);

        const newIdx = newPositions.length / 3;
        const origPos = new THREE.Vector3().fromBufferAttribute(positions, origIdx);
        const entry = vertexOffsets.get(origIdx);

        if (entry) {
            const t = segIdx / segments;
            // Interpolate along a curve from original to offset position
            const offsetPos = origPos.clone().add(entry.offset.clone().multiplyScalar(t));
            newPositions.push(offsetPos.x, offsetPos.y, offsetPos.z);
        } else {
            newPositions.push(origPos.x, origPos.y, origPos.z);
        }

        // Copy normal
        if (normals) {
            const n = new THREE.Vector3().fromBufferAttribute(normals, origIdx);
            newNormals.push(n.x, n.y, n.z);
        }

        // Copy UV
        if (uvs) {
            const u = uvs.getX(origIdx);
            const v = uvs.getY(origIdx);
            newUvs.push(u, v);
        }

        chamferVertMap.set(mapKey, newIdx);
        return newIdx;
    }

    // Track which original faces need their edge vertices replaced
    const faceEdgeReplacements = new Map(); // faceIdx -> { edgeKey -> [newVertIndices] }

    for (const edge of sharpEdges) {
        // Create chamfer strip vertices for both endpoints at each segment
        const stripA = []; // segments+1 vertices for v0
        const stripB = []; // segments+1 vertices for v1

        for (let s = 0; s <= segments; s++) {
            stripA.push(addChamferVertex(edge.v0, s));
            stripB.push(addChamferVertex(edge.v1, s));
        }

        // Create chamfer strip faces (quads split into triangles)
        for (let s = 0; s < segments; s++) {
            const a0 = stripA[s], a1 = stripA[s + 1];
            const b0 = stripB[s], b1 = stripB[s + 1];

            // Two triangles per quad
            newIndices.push(a0, b0, b1);
            newIndices.push(a0, b1, a1);
        }

        // Record that face0 and face1 need their edge vertices replaced
        // with the innermost chamfer vertices (segment = segments)
        const innerA = stripA[segments];
        const innerB = stripB[segments];

        for (const faceIdx of [edge.face0, edge.face1]) {
            if (!faceEdgeReplacements.has(faceIdx)) faceEdgeReplacements.set(faceIdx, []);
            faceEdgeReplacements.get(faceIdx).push({
                edgeKey: edge.key,
                oldVerts: [edge.v0, edge.v1],
                newVerts: [innerA, innerB]
            });
        }
    }

    // ── Step 5: Reassemble original faces with replaced vertices ──
    // Build merged vertMap per face FIRST, then apply — prevents overwrite bug
    // when a face has multiple sharp edges sharing a vertex.
    for (let f = 0; f < faceCount; f++) {
        let i0 = index.getX(f * 3);
        let i1 = index.getX(f * 3 + 1);
        let i2 = index.getX(f * 3 + 2);

        const replacements = faceEdgeReplacements.get(f);
        if (replacements) {
            // Merge all edge replacements into a single vertMap
            // (last replacement wins — both point to the same innermost chamfer vertex)
            const mergedMap = {};
            for (const rep of replacements) {
                mergedMap[rep.oldVerts[0]] = rep.newVerts[0];
                mergedMap[rep.oldVerts[1]] = rep.newVerts[1];
            }

            if (mergedMap[i0] !== undefined) i0 = mergedMap[i0];
            if (mergedMap[i1] !== undefined) i1 = mergedMap[i1];
            if (mergedMap[i2] !== undefined) i2 = mergedMap[i2];
        }

        newIndices.push(i0, i1, i2);
    }

    // ── Step 6: Assemble final geometry ──
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
        result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    if (newUvs.length > 0) {
        result.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    result.setIndex(newIndices);
    result.computeVertexNormals();

    return result;
}