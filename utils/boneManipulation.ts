import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export type BoneManipulationMode = "off" | "ik" | "fk";

type HumanBoneName =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightShoulder"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot";

export class BoneManipulationController {
  private vrm: VRM;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private mode: BoneManipulationMode = "off";

  // Visualization
  private boneHelpers: Map<string, THREE.Mesh> = new Map();
  private boneLines: THREE.LineSegments | null = null;
  private helperGroup: THREE.Group;

  // Interaction
  private transformControl: TransformControls | null = null;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();

  // IK
  private ikTargets: Map<string, THREE.Vector3> = new Map();

  constructor(
    vrm: VRM,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ) {
    this.vrm = vrm;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.helperGroup = new THREE.Group();
    this.helperGroup.name = "BoneManipulationHelpers";
    this.scene.add(this.helperGroup);
  }

  setMode(mode: BoneManipulationMode) {
    this.cleanup();
    this.mode = mode;

    if (mode === "fk") {
      this.setupFKMode();
    } else if (mode === "ik") {
      this.setupIKMode();
    }
  }

  private setupFKMode() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // Create bone helpers (spheres at each joint)
    const boneNames: HumanBoneName[] = [
      "hips",
      "spine",
      "chest",
      "upperChest",
      "neck",
      "head",
      "leftShoulder",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightShoulder",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
    ];

    boneNames.forEach((boneName) => {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      if (bone) {
        const geometry = new THREE.SphereGeometry(0.03, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.7,
          depthTest: false,
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = boneName;
        sphere.userData.boneName = boneName;

        // Position sphere at bone location
        const worldPos = new THREE.Vector3();
        bone.getWorldPosition(worldPos);
        sphere.position.copy(worldPos);

        this.boneHelpers.set(boneName, sphere);
        this.helperGroup.add(sphere);
      }
    });

    // Create bone lines (skeleton visualization)
    this.createBoneLines();

    // Setup TransformControls for rotation
    this.transformControl = new TransformControls(
      this.camera,
      this.renderer.domElement
    );
    this.transformControl.setMode("rotate");
    this.transformControl.setSize(0.5);
    this.transformControl.setSpace("local"); // Use local space for bone rotations
    this.transformControl.showX = true;
    this.transformControl.showY = true;
    this.transformControl.showZ = true;
    this.transformControl.addEventListener("dragging-changed", (event) => {
      // Disable orbit controls when dragging
      this.renderer.domElement.dispatchEvent(
        new CustomEvent("transform-dragging", { detail: event.value })
      );
    });

    // TransformControls has an internal _root Object3D that needs to be added to scene
    const root = (this.transformControl as unknown as { _root: THREE.Object3D })
      ._root;
    if (root) {
      this.scene.add(root);
    }

    // Add click listener for bone selection
    this.renderer.domElement.addEventListener("click", this.onFKClick);
  }

  private setupIKMode() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // Create IK end effectors (hands and feet)
    const ikBones: Array<{ name: HumanBoneName; color: number }> = [
      { name: "leftHand", color: 0xff0000 },
      { name: "rightHand", color: 0x0000ff },
      { name: "leftFoot", color: 0xffff00 },
      { name: "rightFoot", color: 0x00ffff },
    ];

    ikBones.forEach(({ name, color }) => {
      const bone = humanoid.getNormalizedBoneNode(name);
      if (bone) {
        const geometry = new THREE.SphereGeometry(0.05, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = `ik_${name}`;
        sphere.userData.ikBoneName = name;

        const worldPos = new THREE.Vector3();
        bone.getWorldPosition(worldPos);
        sphere.position.copy(worldPos);

        this.boneHelpers.set(name, sphere);
        this.helperGroup.add(sphere);
      }
    });

    // Create bone lines
    this.createBoneLines();

    // Setup TransformControls for dragging
    this.transformControl = new TransformControls(
      this.camera,
      this.renderer.domElement
    );
    this.transformControl.setMode("translate");
    this.transformControl.setSize(0.8);
    this.transformControl.setSpace("world"); // Use world space for IK targets
    this.transformControl.showX = true;
    this.transformControl.showY = true;
    this.transformControl.showZ = true;
    this.transformControl.addEventListener("dragging-changed", (event) => {
      this.renderer.domElement.dispatchEvent(
        new CustomEvent("transform-dragging", { detail: event.value })
      );
    });
    this.transformControl.addEventListener("objectChange", this.onIKTransform);

    // TransformControls has an internal _root Object3D that needs to be added to scene
    const root = (this.transformControl as unknown as { _root: THREE.Object3D })
      ._root;
    if (root) {
      this.scene.add(root);
    }

    // Add click listener for IK helper selection
    this.renderer.domElement.addEventListener("click", this.onIKClick);
  }

  private onFKClick = (event: MouseEvent) => {
    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find clicked bone helper
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.boneHelpers.values())
    );

    if (intersects.length > 0) {
      const clicked = intersects[0].object as THREE.Mesh;
      const boneName = clicked.userData.boneName as string;

      // Highlight selected bone
      this.boneHelpers.forEach((helper, name) => {
        (helper.material as THREE.MeshBasicMaterial).color.setHex(
          name === boneName ? 0xffff00 : 0x00ff00
        );
      });

      // Attach transform control to the bone itself
      const bone = this.vrm.humanoid?.getNormalizedBoneNode(
        boneName as HumanBoneName
      );
      if (bone && this.transformControl) {
        this.transformControl.attach(bone);
      }
    }
  };

  private onIKClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.boneHelpers.values())
    );

    if (intersects.length > 0 && this.transformControl) {
      const clicked = intersects[0].object;
      this.transformControl.attach(clicked);
    }
  };

  private onIKTransform = () => {
    if (!this.transformControl?.object) return;

    const helper = this.transformControl.object as THREE.Mesh;
    const boneName = helper.userData.ikBoneName as string;

    if (boneName) {
      this.ikTargets.set(boneName, helper.position.clone());
      this.solveIK(boneName);
    }
  };

  private solveIK(endEffectorName: string) {
    // CCD IK solver (Cyclic Coordinate Descent)
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    const targetPos = this.ikTargets.get(endEffectorName);
    if (!targetPos) return;

    // Define bone chains for IK
    const chains: Record<string, HumanBoneName[]> = {
      leftHand: ["leftUpperArm", "leftLowerArm", "leftHand"],
      rightHand: ["rightUpperArm", "rightLowerArm", "rightHand"],
      leftFoot: ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
      rightFoot: ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
    };

    const chain = chains[endEffectorName];
    if (!chain) return;

    // Get bones in chain
    const bones = chain
      .map((name) => humanoid.getNormalizedBoneNode(name))
      .filter((bone): bone is THREE.Object3D => bone !== null);

    if (bones.length < 2) return;

    // Iterative CCD algorithm
    const iterations = 10;
    const threshold = 0.01;

    for (let iter = 0; iter < iterations; iter++) {
      // Work backwards from end effector
      for (let i = bones.length - 2; i >= 0; i--) {
        const bone = bones[i];
        const endEffector = bones[bones.length - 1];

        // Get positions in world space
        const bonePos = new THREE.Vector3();
        const endEffectorPos = new THREE.Vector3();
        bone.getWorldPosition(bonePos);
        endEffector.getWorldPosition(endEffectorPos);

        // Check if we're close enough
        const distance = endEffectorPos.distanceTo(targetPos);
        if (distance < threshold) break;

        // Calculate rotation needed
        const toEnd = new THREE.Vector3()
          .subVectors(endEffectorPos, bonePos)
          .normalize();
        const toTarget = new THREE.Vector3()
          .subVectors(targetPos, bonePos)
          .normalize();

        // Calculate rotation quaternion
        const rotationQuat = new THREE.Quaternion().setFromUnitVectors(
          toEnd,
          toTarget
        );

        // Apply rotation to bone
        bone.quaternion.multiply(rotationQuat);
      }
    }
  }

  private createBoneLines() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    const positions: number[] = [];

    // Define bone connections (parent -> child)
    const connections: Array<[HumanBoneName, HumanBoneName]> = [
      ["hips", "spine"],
      ["spine", "chest"],
      ["chest", "upperChest"],
      ["upperChest", "neck"],
      ["neck", "head"],
      ["upperChest", "leftShoulder"],
      ["leftShoulder", "leftUpperArm"],
      ["leftUpperArm", "leftLowerArm"],
      ["leftLowerArm", "leftHand"],
      ["upperChest", "rightShoulder"],
      ["rightShoulder", "rightUpperArm"],
      ["rightUpperArm", "rightLowerArm"],
      ["rightLowerArm", "rightHand"],
      ["hips", "leftUpperLeg"],
      ["leftUpperLeg", "leftLowerLeg"],
      ["leftLowerLeg", "leftFoot"],
      ["hips", "rightUpperLeg"],
      ["rightUpperLeg", "rightLowerLeg"],
      ["rightLowerLeg", "rightFoot"],
    ];

    connections.forEach(([parent, child]) => {
      const parentBone = humanoid.getNormalizedBoneNode(parent);
      const childBone = humanoid.getNormalizedBoneNode(child);

      if (parentBone && childBone) {
        const parentPos = new THREE.Vector3();
        const childPos = new THREE.Vector3();
        parentBone.getWorldPosition(parentPos);
        childBone.getWorldPosition(childPos);

        positions.push(parentPos.x, parentPos.y, parentPos.z);
        positions.push(childPos.x, childPos.y, childPos.z);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });

    this.boneLines = new THREE.LineSegments(geometry, material);
    this.helperGroup.add(this.boneLines);
  }

  update() {
    if (this.mode === "off") return;

    // Update bone helper positions
    this.boneHelpers.forEach((helper, boneName) => {
      const bone = this.vrm.humanoid?.getNormalizedBoneNode(
        boneName as HumanBoneName
      );
      if (bone) {
        const worldPos = new THREE.Vector3();
        bone.getWorldPosition(worldPos);
        helper.position.copy(worldPos);
      }
    });

    // Update bone lines
    this.updateBoneLines();
  }

  private updateBoneLines() {
    if (!this.boneLines) return;

    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    const positions: number[] = [];

    const connections: Array<[HumanBoneName, HumanBoneName]> = [
      ["hips", "spine"],
      ["spine", "chest"],
      ["chest", "upperChest"],
      ["upperChest", "neck"],
      ["neck", "head"],
      ["upperChest", "leftShoulder"],
      ["leftShoulder", "leftUpperArm"],
      ["leftUpperArm", "leftLowerArm"],
      ["leftLowerArm", "leftHand"],
      ["upperChest", "rightShoulder"],
      ["rightShoulder", "rightUpperArm"],
      ["rightUpperArm", "rightLowerArm"],
      ["rightLowerArm", "rightHand"],
      ["hips", "leftUpperLeg"],
      ["leftUpperLeg", "leftLowerLeg"],
      ["leftLowerLeg", "leftFoot"],
      ["hips", "rightUpperLeg"],
      ["rightUpperLeg", "rightLowerLeg"],
      ["rightLowerLeg", "rightFoot"],
    ];

    connections.forEach(([parent, child]) => {
      const parentBone = humanoid.getNormalizedBoneNode(parent);
      const childBone = humanoid.getNormalizedBoneNode(child);

      if (parentBone && childBone) {
        const parentPos = new THREE.Vector3();
        const childPos = new THREE.Vector3();
        parentBone.getWorldPosition(parentPos);
        childBone.getWorldPosition(childPos);

        positions.push(parentPos.x, parentPos.y, parentPos.z);
        positions.push(childPos.x, childPos.y, childPos.z);
      }
    });

    this.boneLines.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    this.boneLines.geometry.attributes.position.needsUpdate = true;
  }

  cleanup() {
    // Remove all helpers
    this.helperGroup.clear();
    this.boneHelpers.clear();
    this.boneLines = null;
    this.ikTargets.clear();

    // Remove transform control
    if (this.transformControl) {
      this.transformControl.detach();
      this.transformControl.removeEventListener(
        "objectChange",
        this.onIKTransform
      );

      // Remove the internal _root from scene
      const root = (
        this.transformControl as unknown as { _root: THREE.Object3D }
      )._root;
      if (root) {
        this.scene.remove(root);
      }

      this.transformControl.dispose();
      this.transformControl = null;
    }

    // Remove event listeners
    this.renderer.domElement.removeEventListener("click", this.onFKClick);
    this.renderer.domElement.removeEventListener("click", this.onIKClick);
  }

  dispose() {
    this.cleanup();
    this.scene.remove(this.helperGroup);
  }
}
