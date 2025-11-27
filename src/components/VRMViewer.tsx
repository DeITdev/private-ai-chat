import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm";

export interface VRMViewerRef {
  setExpression: (name: string, value: number) => void;
  loadVRM: (
    arrayBufferOrUrl: ArrayBuffer | string,
    onProgress?: (progress: number) => void
  ) => Promise<void>;
  clearScene: () => void;
}

export const VRMViewer = forwardRef<VRMViewerRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const activeBlobUrlsRef = useRef<Set<string>>(new Set());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const loadingIdRef = useRef<number>(0);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useImperativeHandle(ref, () => ({
    setExpression: (name: string, value: number) => {
      if (vrmRef.current?.expressionManager) {
        vrmRef.current.expressionManager.setValue(name, value);
      }
    },
    clearScene: () => {
      if (!sceneRef.current) return;

      // Simply remove VRM models from scene (like R3F does on unmount)
      const childrenToRemove = sceneRef.current.children.filter(
        (child) =>
          !(child instanceof THREE.Light) &&
          !(child instanceof THREE.GridHelper) &&
          !(child instanceof THREE.AxesHelper)
      );

      childrenToRemove.forEach((child) => {
        sceneRef.current?.remove(child);
      });

      vrmRef.current = null;
      console.log("✅ Scene cleared (models removed, textures preserved)");
    },
    loadVRM: async (
      arrayBufferOrUrl: ArrayBuffer | string,
      onProgress?: (progress: number) => void
    ) => {
      return new Promise((resolve, reject) => {
        if (!loaderRef.current || !sceneRef.current) {
          reject(new Error("VRM loader not initialized"));
          return;
        }

        // Increment loading ID to cancel any previous loads
        loadingIdRef.current += 1;
        const currentLoadingId = loadingIdRef.current;
        console.log("🔄 Starting model load #" + currentLoadingId);

        // FIRST: Revoke old blob URLs from previous uploads
        // This is safe because we're about to clear the old model
        if (activeBlobUrlsRef.current.size > 0) {
          console.log(
            "🗑️ Revoking",
            activeBlobUrlsRef.current.size,
            "old blob URL(s)..."
          );
          activeBlobUrlsRef.current.forEach((blobUrl) => {
            URL.revokeObjectURL(blobUrl);
          });
          activeBlobUrlsRef.current.clear();
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
          // DO NOT dispose here - textures might still be in use by WebGL
          // Let the renderer manage texture lifecycle
        });

        vrmRef.current = null;

        // If empty string, just clear and resolve
        if (typeof arrayBufferOrUrl === "string" && arrayBufferOrUrl === "") {
          console.log("Scene cleared (empty URL provided)");
          resolve();
          return;
        }

        if (typeof arrayBufferOrUrl === "string") {
          // Load from URL (for public assets)
          loaderRef.current.load(
            arrayBufferOrUrl,
            handleVRMLoad,
            (progress) => {
              const percent = Math.round(
                100.0 * (progress.loaded / progress.total)
              );
              console.log("Loading model...", percent, "%");
              onProgress?.(percent);
            },
            (error) => {
              console.error("Error loading VRM from URL:", error);
              reject(error);
            }
          );
        } else {
          // Parse from ArrayBuffer (for uploaded files)
          console.log("Loading VRM from ArrayBuffer...");

          // Create blob URL and track it
          // WebGL needs continuous access to textures during model lifetime
          const blob = new Blob([arrayBufferOrUrl], {
            type: "model/gltf-binary",
          });
          const blobUrl = URL.createObjectURL(blob);

          // Track this blob URL for later cleanup
          activeBlobUrlsRef.current.add(blobUrl);
          console.log(
            "Created and tracked blob URL:",
            blobUrl.substring(0, 50) + "..."
          );

          loaderRef.current.load(
            blobUrl,
            handleVRMLoad,
            (progress) => {
              const percent = Math.round(
                100.0 * (progress.loaded / progress.total)
              );
              console.log("Loading uploaded model...", percent, "%");
              onProgress?.(percent);
            },
            (error) => {
              console.error("Error loading VRM from buffer:", error);
              reject(error);
            }
          );
        }

        function handleVRMLoad(gltf: GLTF) {
          // Check if this load is still current
          if (currentLoadingId !== loadingIdRef.current) {
            console.log(
              "⚠️ Ignoring outdated model load #" +
                currentLoadingId +
                " (current: #" +
                loadingIdRef.current +
                ")"
            );
            reject(new Error("Model load cancelled - newer load started"));
            return;
          }

          const vrm = gltf.userData.vrm as VRM;

          // Optimize VRM model (from reference project)
          console.log("🔧 Optimizing VRM model...");
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);

          vrm.scene.traverse((obj: THREE.Object3D) => {
            obj.frustumCulled = false;
          });

          sceneRef.current?.add(vrm.scene);
          vrmRef.current = vrm;

          // Auto-adjust camera to fit the model
          if (cameraRef.current && controlsRef.current) {
            // Calculate bounding box of the model
            const box = new THREE.Box3().setFromObject(vrm.scene);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            // Calculate optimal camera distance
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = cameraRef.current.fov * (Math.PI / 180);
            let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2));
            cameraDistance *= 1.5; // Add some padding

            // Position camera to look at model center
            const cameraHeight = center.y;
            cameraRef.current.position.set(
              center.x,
              cameraHeight,
              center.z + cameraDistance
            );

            // Update controls target to model center
            controlsRef.current.target.copy(center);
            controlsRef.current.update();

            console.log("📐 Model bounds:", {
              size: {
                x: size.x.toFixed(2),
                y: size.y.toFixed(2),
                z: size.z.toFixed(2),
              },
              center: {
                x: center.x.toFixed(2),
                y: center.y.toFixed(2),
                z: center.z.toFixed(2),
              },
              cameraDistance: cameraDistance.toFixed(2),
            });
          }

          // Reset all expressions to 0
          if (vrm.expressionManager) {
            for (const expName of Object.keys(
              vrm.expressionManager.expressionMap
            )) {
              vrm.expressionManager.setValue(expName, 0);
            }
          }

          console.log(
            "Available Expressions:",
            vrm.expressionManager?.expressionMap
          );
          console.log("VRM model loaded!", vrm);

          // Load breathing idle animation
          loadBreathingAnimation(vrm);

          resolve();
        }
      });
    },
  }));

  const loadBreathingAnimation = (vrm: VRM) => {
    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      "/models/animations/Breathing Idle.fbx",
      (fbx) => {
        console.log("🎬 Breathing Idle FBX loaded");

        // Remap Mixamo animation to VRM
        const vrmAnimationClip = remapMixamoAnimationToVrm(vrm, fbx);

        // Create animation mixer for VRM model
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Play the animation with slower speed (0.5x = half speed)
        const action = mixer.clipAction(vrmAnimationClip);
        action.timeScale = 0.5;
        action.play();

        console.log("✨ Breathing animation playing at 0.5x speed");
      },
      undefined,
      (error) => {
        console.error("Error loading breathing animation:", error);
      }
    );
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const container = canvasRef.current.parentElement;
    if (!container) return;

    // Capture blob URLs set for cleanup
    const blobUrlsToCleanup = activeBlobUrlsRef.current;

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
    cameraRef.current = camera;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.0, 0.0);
    controls.update();
    controlsRef.current = controls;

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

      // Update animation mixer
      if (mixerRef.current) {
        mixerRef.current.update(delta);
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

      // Revoke all blob URLs on unmount
      blobUrlsToCleanup.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
      blobUrlsToCleanup.clear();
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
