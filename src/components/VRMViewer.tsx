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
  loadAnimation: (animationPath: string) => Promise<void>;
  setCameraControlsEnabled: (enabled: boolean) => void;
  resetCameraPosition: () => void;
  setCameraFollowCharacter: (enabled: boolean) => void;
  setHideGridAxes: (hide: boolean) => void;
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
  const currentAnimationRef = useRef<THREE.AnimationAction | null>(null);
  const loadedAnimationsRef = useRef<Map<string, THREE.AnimationClip>>(
    new Map()
  );
  const initialCameraPositionRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, 1, 5)
  );
  const initialCameraTargetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, 1, 0)
  );
  const characterOriginRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const cameraFollowCharacterRef = useRef<boolean>(false);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const cameraFollowOffsetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, 0, 0)
  );
  const originalFollowTargetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(0, 1, 0)
  );
  const isRightMouseDownRef = useRef<boolean>(false);
  const lastMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    setExpression: (name: string, value: number) => {
      if (vrmRef.current?.expressionManager) {
        vrmRef.current.expressionManager.setValue(name, value);
      }
    },
    setCameraControlsEnabled: (enabled: boolean) => {
      if (controlsRef.current) {
        controlsRef.current.enableDamping = enabled;
        if (!enabled) {
          // Reset damping immediately when disabled
          controlsRef.current.update();
        }
      }
    },
    resetCameraPosition: () => {
      if (controlsRef.current && cameraRef.current) {
        // Reset camera to initial position and target
        cameraRef.current.position.copy(initialCameraPositionRef.current);
        controlsRef.current.target.copy(initialCameraTargetRef.current);
        controlsRef.current.update();
      }
    },
    setCameraFollowCharacter: (enabled: boolean) => {
      cameraFollowCharacterRef.current = enabled;
      if (enabled) {
        // Reset offset to zero when enabling
        cameraFollowOffsetRef.current.set(0, 0, 0);
        // Store original target position
        if (vrmRef.current) {
          const hips = vrmRef.current.humanoid?.getNormalizedBoneNode("hips");
          if (hips) {
            const hipsPosition = new THREE.Vector3();
            hips.getWorldPosition(hipsPosition);
            originalFollowTargetRef.current.copy(hipsPosition);
          }
        }
      }
    },
    setHideGridAxes: (hide: boolean) => {
      if (gridHelperRef.current) {
        gridHelperRef.current.visible = !hide;
      }
      if (axesHelperRef.current) {
        axesHelperRef.current.visible = !hide;
      }
    },
    loadAnimation: async (animationPath: string) => {
      if (!vrmRef.current) {
        throw new Error("VRM not loaded");
      }

      return new Promise((resolve, reject) => {
        // Check if animation is already loaded
        if (loadedAnimationsRef.current.has(animationPath)) {
          const clip = loadedAnimationsRef.current.get(animationPath)!;
          playAnimation(clip);
          resolve();
          return;
        }

        // Load new animation
        const fbxLoader = new FBXLoader();
        fbxLoader.load(
          animationPath,
          (fbx) => {
            console.log("🎬 Animation FBX loaded:", animationPath);

            // Remap Mixamo animation to VRM
            const vrmAnimationClip = remapMixamoAnimationToVrm(
              vrmRef.current!,
              fbx
            );

            // Cache the animation
            loadedAnimationsRef.current.set(animationPath, vrmAnimationClip);

            // Play the animation
            playAnimation(vrmAnimationClip);

            console.log("✨ Animation loaded and playing:", animationPath);
            resolve();
          },
          undefined,
          (error) => {
            console.error("Error loading animation:", error);
            reject(error);
          }
        );
      });
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

        // Check model size on mobile devices
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile && arrayBufferOrUrl instanceof ArrayBuffer) {
          const sizeInMB = arrayBufferOrUrl.byteLength / (1024 * 1024);
          console.log(`📦 Model size: ${sizeInMB.toFixed(2)}MB`);
          if (sizeInMB > 15) {
            // Warning for large models on mobile
            console.warn(
              `⚠️ Large model (${sizeInMB.toFixed(
                1
              )}MB) may cause performance issues on mobile`
            );
          }
        }

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

            // Store initial camera position and target for reset feature
            initialCameraPositionRef.current.copy(cameraRef.current.position);
            initialCameraTargetRef.current.copy(controlsRef.current.target);

            // Store character origin for camera follow feature
            characterOriginRef.current.copy(center);

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

  const playAnimation = (clip: THREE.AnimationClip) => {
    if (!vrmRef.current) return;

    // Create mixer if it doesn't exist
    if (!mixerRef.current) {
      mixerRef.current = new THREE.AnimationMixer(vrmRef.current.scene);
    }

    // Stop current animation if playing
    if (currentAnimationRef.current) {
      currentAnimationRef.current.fadeOut(0.3);
    }

    // Play new animation
    const action = mixerRef.current.clipAction(clip);
    action.reset();
    action.fadeIn(0.3);
    action.timeScale = 0.5; // Set speed to 0.5x (same as breathing idle)
    action.play();

    currentAnimationRef.current = action;
  };

  const loadBreathingAnimation = (vrm: VRM) => {
    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      "/models/animations/Breathing_Idle.fbx",
      (fbx) => {
        console.log("🎬 Breathing Idle FBX loaded");

        // Remap Mixamo animation to VRM
        const vrmAnimationClip = remapMixamoAnimationToVrm(vrm, fbx);

        // Cache the animation
        loadedAnimationsRef.current.set(
          "/models/animations/Breathing_Idle.fbx",
          vrmAnimationClip
        );

        // Create animation mixer for VRM model
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Play the animation with slower speed (0.5x = half speed)
        const action = mixer.clipAction(vrmAnimationClip);
        action.timeScale = 0.5;
        action.play();

        currentAnimationRef.current = action;

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

    // Check WebGL support FIRST
    const testCanvas = document.createElement("canvas");
    const gl =
      testCanvas.getContext("webgl") ||
      (testCanvas.getContext(
        "experimental-webgl"
      ) as WebGLRenderingContext | null);

    if (!gl) {
      console.error("❌ WebGL not supported!");
      const errorDiv = document.createElement("div");
      errorDiv.className =
        "absolute inset-0 flex items-center justify-center bg-black/50 text-white z-50";
      errorDiv.innerHTML =
        '<div class="text-center p-8"><h2 class="text-2xl font-bold text-red-500 mb-4">WebGL Not Supported</h2><p>Your device does not support WebGL. 3D features will not work.</p></div>';
      container.appendChild(errorDiv);
      return;
    }

    console.log("✅ WebGL supported");
    console.log("📱 Device info:", {
      userAgent: navigator.userAgent,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    });

    // Capture blob URLs set for cleanup
    const blobUrlsToCleanup = activeBlobUrlsRef.current;

    // Get container dimensions
    const getContainerSize = () => ({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const { width, height } = getContainerSize();

    // Detect mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Setup renderer with mobile optimizations
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: !isMobile, // Disable antialiasing on mobile for performance
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false, // Don't fail on slow devices
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 3)); // Limit pixel ratio on mobile
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Add WebGL context loss/restore handlers
    const canvas = canvasRef.current;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.error("⚠️ WebGL context lost!");
    };

    const handleContextRestored = () => {
      console.log("✅ WebGL context restored");
      // Reinitialize if needed
    };

    canvas.addEventListener(
      "webglcontextlost",
      handleContextLost as EventListener
    );
    canvas.addEventListener(
      "webglcontextrestored",
      handleContextRestored as EventListener
    );

    // Setup camera with mobile-optimized FOV
    const fov = isMobile ? 45.0 : 30.0; // Wider FOV for mobile
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 20.0);
    camera.position.set(0.0, 1.0, 5.0);
    cameraRef.current = camera;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.0, 0.0);

    // Enable smooth damping for inertia-like behavior (rotation and zoom)
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Enable smooth zoom
    controls.enableZoom = true;
    controls.zoomSpeed = 1.0;

    // Set distance constraints
    controls.minDistance = 1;
    controls.maxDistance = 10;

    // Allow full 360-degree rotation (no polar angle limits)
    // controls.maxPolarAngle = Math.PI / 2; // Removed to allow full rotation

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
    gridHelperRef.current = gridHelper;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    axesHelperRef.current = axesHelper;
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

      // Follow character if enabled (tracks hips bone position)
      if (cameraFollowCharacterRef.current && vrmRef.current) {
        // Find hips bone (common VRM bone name)
        const hips = vrmRef.current.humanoid?.getNormalizedBoneNode("hips");
        if (hips) {
          // Get world position of hips
          const hipsPosition = new THREE.Vector3();
          hips.getWorldPosition(hipsPosition);
          // Apply user-defined offset
          const targetPosition = hipsPosition
            .clone()
            .add(cameraFollowOffsetRef.current);
          // Update camera target to follow hips with offset
          controls.target.copy(targetPosition);
        }
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

    // Mouse event handlers for camera follow offset adjustment
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 2 && cameraFollowCharacterRef.current) {
        // Right mouse button
        isRightMouseDownRef.current = true;
        lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
        event.preventDefault();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (isRightMouseDownRef.current && cameraFollowCharacterRef.current) {
        const deltaX = event.clientX - lastMousePositionRef.current.x;
        const deltaY = event.clientY - lastMousePositionRef.current.y;

        // Adjust offset based on mouse movement
        // Scale factor for sensitivity (adjust as needed)
        const sensitivity = 0.005;
        cameraFollowOffsetRef.current.x += deltaX * sensitivity;
        cameraFollowOffsetRef.current.y -= deltaY * sensitivity; // Inverted Y for intuitive control

        lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
        event.preventDefault();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        isRightMouseDownRef.current = false;
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (cameraFollowCharacterRef.current) {
        event.preventDefault(); // Prevent context menu when camera follow is active
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener(
        "webglcontextlost",
        handleContextLost as EventListener
      );
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored as EventListener
      );
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
