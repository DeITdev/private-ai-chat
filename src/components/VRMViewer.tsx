import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

export interface VRMViewerRef {
  setExpression: (name: string, value: number) => void;
  loadVRM: (arrayBufferOrUrl: ArrayBuffer | string) => Promise<void>;
}

export const VRMViewer = forwardRef<VRMViewerRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);

  useImperativeHandle(ref, () => ({
    setExpression: (name: string, value: number) => {
      if (vrmRef.current?.expressionManager) {
        vrmRef.current.expressionManager.setValue(name, value);
      }
    },
    loadVRM: async (arrayBufferOrUrl: ArrayBuffer | string) => {
      return new Promise((resolve, reject) => {
        if (!loaderRef.current || !sceneRef.current) {
          reject(new Error("VRM loader not initialized"));
          return;
        }

        // Clear the scene - remove all children except lights and helpers
        const childrenToRemove = sceneRef.current.children.filter(
          (child) =>
            !(child instanceof THREE.Light) &&
            !(child instanceof THREE.GridHelper) &&
            !(child instanceof THREE.AxesHelper)
        );

        childrenToRemove.forEach((child) => {
          sceneRef.current?.remove(child);

          // Dispose the VRM model completely - including all textures
          child.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh) {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((mat: THREE.Material) => {
                    // Dispose all texture properties
                    const matWithTextures = mat as THREE.MeshStandardMaterial;
                    if (matWithTextures.map) matWithTextures.map.dispose();
                    if (matWithTextures.normalMap)
                      matWithTextures.normalMap.dispose();
                    if (matWithTextures.roughnessMap)
                      matWithTextures.roughnessMap.dispose();
                    if (matWithTextures.metalnessMap)
                      matWithTextures.metalnessMap.dispose();
                    if (matWithTextures.emissiveMap)
                      matWithTextures.emissiveMap.dispose();
                    if (matWithTextures.aoMap) matWithTextures.aoMap.dispose();
                    if (matWithTextures.lightMap)
                      matWithTextures.lightMap.dispose();
                    if (matWithTextures.alphaMap)
                      matWithTextures.alphaMap.dispose();
                    // Dispose material
                    mat.dispose();
                  });
                } else {
                  const mat = obj.material as THREE.MeshStandardMaterial;
                  // Dispose all texture properties
                  if (mat.map) mat.map.dispose();
                  if (mat.normalMap) mat.normalMap.dispose();
                  if (mat.roughnessMap) mat.roughnessMap.dispose();
                  if (mat.metalnessMap) mat.metalnessMap.dispose();
                  if (mat.emissiveMap) mat.emissiveMap.dispose();
                  if (mat.aoMap) mat.aoMap.dispose();
                  if (mat.lightMap) mat.lightMap.dispose();
                  if (mat.alphaMap) mat.alphaMap.dispose();
                  // Dispose material
                  mat.dispose();
                }
              }
            }
          });
        });

        vrmRef.current = null;

        if (typeof arrayBufferOrUrl === "string") {
          // Load from URL (for public assets)
          loaderRef.current.load(
            arrayBufferOrUrl,
            handleVRMLoad,
            (progress) => {
              console.log(
                "Loading model...",
                100.0 * (progress.loaded / progress.total),
                "%"
              );
            },
            (error) => {
              console.error("Error loading VRM from URL:", error);
              reject(error);
            }
          );
        } else {
          // Parse from ArrayBuffer (for uploaded files)
          // Create a fresh loader instance to avoid caching issues
          const freshLoader = new GLTFLoader();
          freshLoader.register((parser) => {
            return new VRMLoaderPlugin(parser);
          });

          // Create a proper Blob from ArrayBuffer
          const blob = new Blob([new Uint8Array(arrayBufferOrUrl)], {
            type: "application/octet-stream",
          });
          const blobUrl = URL.createObjectURL(blob);

          freshLoader.load(
            blobUrl,
            (gltf) => {
              URL.revokeObjectURL(blobUrl);
              handleVRMLoad(gltf);
            },
            (progress) => {
              console.log(
                "Loading uploaded model...",
                100.0 * (progress.loaded / progress.total),
                "%"
              );
            },
            (error) => {
              URL.revokeObjectURL(blobUrl);
              console.error("Error loading VRM from buffer:", error);
              reject(error);
            }
          );
        }

        function handleVRMLoad(gltf: GLTF) {
          const vrm = gltf.userData.vrm as VRM;

          vrm.scene.traverse((obj: THREE.Object3D) => {
            obj.frustumCulled = false;
          });

          sceneRef.current?.add(vrm.scene);
          vrmRef.current = vrm;

          // Reset all expressions to 0
          if (vrm.expressionManager) {
            for (const expName of Object.keys(
              vrm.expressionManager.expressionMap
            )) {
              vrm.expressionManager.setValue(expName, 0);
            }
          }

          // Set A-pose by rotating arms downward
          if (vrm.humanoid) {
            const leftUpperArm =
              vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
            const rightUpperArm =
              vrm.humanoid.getNormalizedBoneNode("rightUpperArm");

            // Rotate arms down about 30 degrees (0.52 radians) for A-pose
            if (leftUpperArm) {
              leftUpperArm.rotation.z = -0.52; // Left arm down
            }
            if (rightUpperArm) {
              rightUpperArm.rotation.z = 0.52; // Right arm down
            }
          }

          console.log(
            "Available Expressions:",
            vrm.expressionManager?.expressionMap
          );
          console.log("VRM model loaded!", vrm);
          resolve();
        }
      });
    },
  }));

  useEffect(() => {
    if (!canvasRef.current) return;

    const container = canvasRef.current.parentElement;
    if (!container) return;

    // Get container dimensions
    const getContainerSize = () => ({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const { width, height } = getContainerSize();

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 20.0);
    camera.position.set(0.0, 1.0, 5.0);

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.0, 0.0);
    controls.update();

    // Setup scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, Math.PI);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);

    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Setup loader
    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });
    loaderRef.current = loader;

    // Load default VRM model
    const modelUrl = "/Larasdyah.vrm";
    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm;

        vrm.scene.traverse((obj: THREE.Object3D) => {
          obj.frustumCulled = false;
        });

        // Reset all expressions to 0
        if (vrm.expressionManager) {
          for (const expName of Object.keys(
            vrm.expressionManager.expressionMap
          )) {
            vrm.expressionManager.setValue(expName, 0);
          }
        }

        // Set A-pose by rotating arms downward
        if (vrm.humanoid) {
          const leftUpperArm =
            vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
          const rightUpperArm =
            vrm.humanoid.getNormalizedBoneNode("rightUpperArm");

          // Rotate arms down about 30 degrees (0.52 radians) for A-pose
          if (leftUpperArm) {
            leftUpperArm.rotation.z = -0.52; // Left arm down
          }
          if (rightUpperArm) {
            rightUpperArm.rotation.z = 0.52; // Right arm down
          }
        }

        scene.add(vrm.scene);
        vrmRef.current = vrm;
      },
      undefined,
      (error) => console.error("Error loading default VRM model:", error)
    );

    // Add helpers for development
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Animation loop
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (vrmRef.current) {
        vrmRef.current.update(delta);
      }
      controls.update();

      renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    const handleResize = () => {
      const { width, height } = getContainerSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
      scene.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="canvas"
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
});
