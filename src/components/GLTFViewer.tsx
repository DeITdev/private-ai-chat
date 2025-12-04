import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as dat from "dat.gui";

export interface GLTFViewerRef {
  loadGLTF: (
    rootFile: File,
    rootPath: string,
    fileMap: Map<string, File>,
    onProgress?: (progress: number) => void
  ) => Promise<void>;
  clearScene: () => void;
  setEnvironment: (envName: string) => void;
  setWireframe: (enabled: boolean) => void;
  playAnimation: (index: number) => void;
}

// Basic neutral environment using RoomEnvironment-like setup
const createNeutralEnvironment = (
  renderer: THREE.WebGLRenderer
): THREE.Texture => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  geometry.deleteAttribute("uv");
  const roomMaterial = new THREE.MeshStandardMaterial({
    side: THREE.BackSide,
    color: 0xffffff,
  });
  const room = new THREE.Mesh(geometry, roomMaterial);
  room.scale.setScalar(10);
  scene.add(room);

  const mainLight = new THREE.PointLight(0xffffff, 50, 0, 2);
  mainLight.position.set(0.418, 16.199, 0.3);
  scene.add(mainLight);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const renderTarget = pmremGenerator.fromScene(scene, 0.04);
  pmremGenerator.dispose();

  return renderTarget.texture;
};

// Helper function to traverse materials
const traverseMaterials = (
  object: THREE.Object3D,
  callback: (material: THREE.Material) => void
) => {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach(callback);
  });
};

export const GLTFViewer = forwardRef<GLTFViewerRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const contentRef = useRef<THREE.Object3D | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const lightsRef = useRef<THREE.Light[]>([]);
  const neutralEnvRef = useRef<THREE.Texture | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const guiRef = useRef<dat.GUI | null>(null);
  const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);

  const stateRef = useRef({
    background: false,
    playbackSpeed: 1.0,
    wireframe: false,
    skeleton: false,
    grid: true,
    autoRotate: false,
    punctualLights: true,
    exposure: 0.0,
    toneMapping: THREE.LinearToneMapping,
    ambientIntensity: 0.3,
    ambientColor: "#FFFFFF",
    directIntensity: 0.8 * Math.PI,
    directColor: "#FFFFFF",
    bgColor: "#191919",
    pointSize: 1.0,
    screenSpacePanning: true,
  });

  const updateLights = useCallback(() => {
    const state = stateRef.current;
    const lights = lightsRef.current;
    const renderer = rendererRef.current;

    if (!renderer) return;

    if (state.punctualLights && !lights.length) {
      addLights();
    } else if (!state.punctualLights && lights.length) {
      removeLights();
    }

    renderer.toneMapping = state.toneMapping as THREE.ToneMapping;
    renderer.toneMappingExposure = Math.pow(2, state.exposure);

    if (lights.length === 2) {
      lights[0].intensity = state.ambientIntensity;
      (lights[0] as THREE.AmbientLight).color.set(state.ambientColor);
      lights[1].intensity = state.directIntensity;
      (lights[1] as THREE.DirectionalLight).color.set(state.directColor);
    }
  }, []);

  const updateDisplay = useCallback(() => {
    if (!contentRef.current || !sceneRef.current) return;

    // Remove existing skeleton helpers
    if (skeletonHelpersRef.current.length) {
      skeletonHelpersRef.current.forEach((helper) =>
        sceneRef.current?.remove(helper)
      );
      skeletonHelpersRef.current = [];
    }

    // Update materials
    traverseMaterials(contentRef.current, (material) => {
      if ("wireframe" in material) {
        (material as THREE.MeshStandardMaterial).wireframe =
          stateRef.current.wireframe;
      }

      if (material instanceof THREE.PointsMaterial) {
        material.size = stateRef.current.pointSize;
      }
    });

    // Add skeleton helpers if enabled
    contentRef.current.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (mesh.geometry && mesh.skeleton && stateRef.current.skeleton) {
        const helper = new THREE.SkeletonHelper(mesh.skeleton.bones[0].parent!);
        (helper.material as THREE.LineBasicMaterial).linewidth = 3;
        sceneRef.current?.add(helper);
        skeletonHelpersRef.current.push(helper);
      }
    });

    // Update grid and axes
    if (stateRef.current.grid !== Boolean(gridHelperRef.current)) {
      if (stateRef.current.grid) {
        gridHelperRef.current = new THREE.GridHelper(10, 10);
        axesHelperRef.current = new THREE.AxesHelper(5);
        axesHelperRef.current.renderOrder = 999;
        sceneRef.current.add(gridHelperRef.current);
        sceneRef.current.add(axesHelperRef.current);
      } else {
        if (gridHelperRef.current)
          sceneRef.current.remove(gridHelperRef.current);
        if (axesHelperRef.current)
          sceneRef.current.remove(axesHelperRef.current);
        gridHelperRef.current = null;
        axesHelperRef.current = null;
      }
    }

    if (controlsRef.current) {
      controlsRef.current.autoRotate = stateRef.current.autoRotate;
    }
  }, []);

  const updateBackground = useCallback(() => {
    if (!sceneRef.current) return;
    sceneRef.current.background = new THREE.Color(stateRef.current.bgColor);
  }, []);

  const updateEnvironment = useCallback(() => {
    if (!sceneRef.current || !neutralEnvRef.current) return;

    const backgroundColor = new THREE.Color(stateRef.current.bgColor);
    sceneRef.current.environment = neutralEnvRef.current;
    sceneRef.current.background = stateRef.current.background
      ? neutralEnvRef.current
      : backgroundColor;
  }, []);

  const playAllClips = useCallback(() => {
    if (!mixerRef.current) return;
    clipsRef.current.forEach((clip) => {
      const action = mixerRef.current!.clipAction(clip);
      action.reset().play();
    });
  }, []);

  const addGUI = useCallback(() => {
    if (guiRef.current) {
      guiRef.current.destroy();
    }

    const gui = new dat.GUI({
      autoPlace: false,
      width: 260,
      hideable: true,
    });
    guiRef.current = gui;

    // Display controls
    const dispFolder = gui.addFolder("Display");
    dispFolder.add(stateRef.current, "background").onChange(updateEnvironment);
    dispFolder.add(stateRef.current, "autoRotate").onChange(updateDisplay);
    dispFolder.add(stateRef.current, "wireframe").onChange(updateDisplay);
    dispFolder.add(stateRef.current, "skeleton").onChange(updateDisplay);
    dispFolder.add(stateRef.current, "grid").onChange(updateDisplay);
    if (controlsRef.current) {
      dispFolder.add(controlsRef.current, "screenSpacePanning");
    }
    dispFolder
      .add(stateRef.current, "pointSize", 1, 16)
      .onChange(updateDisplay);
    dispFolder.addColor(stateRef.current, "bgColor").onChange(updateBackground);
    dispFolder.open();

    // Lighting controls
    const lightFolder = gui.addFolder("Lighting");
    lightFolder
      .add(stateRef.current, "toneMapping", {
        Linear: THREE.LinearToneMapping,
        "ACES Filmic": THREE.ACESFilmicToneMapping,
      })
      .onChange(updateLights);
    lightFolder
      .add(stateRef.current, "exposure", -10, 10, 0.01)
      .onChange(updateLights);
    lightFolder
      .add(stateRef.current, "punctualLights")
      .listen()
      .onChange(updateLights);
    lightFolder
      .add(stateRef.current, "ambientIntensity", 0, 2)
      .onChange(updateLights);
    lightFolder
      .addColor(stateRef.current, "ambientColor")
      .onChange(updateLights);
    lightFolder
      .add(stateRef.current, "directIntensity", 0, 4)
      .onChange(updateLights);
    lightFolder
      .addColor(stateRef.current, "directColor")
      .onChange(updateLights);
    lightFolder.open();

    // Animation controls
    const animFolder = gui.addFolder("Animation");
    animFolder
      .add(stateRef.current, "playbackSpeed", 0, 1)
      .onChange((speed: number) => {
        if (mixerRef.current) mixerRef.current.timeScale = speed;
      });
    animFolder.add({ playAll: () => playAllClips() }, "playAll");

    // Append GUI to canvas parent
    const container = canvasRef.current?.parentElement;
    if (container) {
      const guiWrap = document.createElement("div");
      guiWrap.style.position = "absolute";
      guiWrap.style.top = "80px";
      guiWrap.style.right = "16px";
      guiWrap.style.zIndex = "100";
      guiWrap.appendChild(gui.domElement);
      container.appendChild(guiWrap);
    }
  }, [
    updateLights,
    updateDisplay,
    updateBackground,
    updateEnvironment,
    playAllClips,
  ]);

  useImperativeHandle(ref, () => ({
    clearScene: () => {
      if (!sceneRef.current || !contentRef.current) return;

      sceneRef.current.remove(contentRef.current);

      // Dispose geometry
      contentRef.current.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      });

      // Dispose textures
      contentRef.current.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.material) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => {
          for (const key in material) {
            const prop = (material as unknown as Record<string, unknown>)[key];
            if (
              key !== "envMap" &&
              prop &&
              typeof prop === "object" &&
              prop !== null &&
              "isTexture" in prop
            ) {
              (prop as THREE.Texture).dispose();
            }
          }
        });
      });

      contentRef.current = null;
      clipsRef.current = [];

      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }

      // Remove skeleton helpers
      if (skeletonHelpersRef.current.length) {
        skeletonHelpersRef.current.forEach((helper) =>
          sceneRef.current?.remove(helper)
        );
        skeletonHelpersRef.current = [];
      }

      console.log("✅ Scene cleared");
    },

    setEnvironment: (envName: string) => {
      console.log("Setting environment:", envName);
      updateEnvironment();
    },

    setWireframe: (enabled: boolean) => {
      stateRef.current.wireframe = enabled;
      updateDisplay();
    },

    playAnimation: (index: number) => {
      if (!mixerRef.current || !clipsRef.current[index]) return;
      mixerRef.current.stopAllAction();
      const action = mixerRef.current.clipAction(clipsRef.current[index]);
      action.reset().play();
    },

    loadGLTF: async (
      rootFile: File,
      rootPath: string,
      fileMap: Map<string, File>,
      onProgress?: (progress: number) => void
    ) => {
      return new Promise((resolve, reject) => {
        if (!loaderRef.current || !sceneRef.current) {
          reject(new Error("GLTF loader not initialized"));
          return;
        }

        // Clear previous blob URLs
        blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        blobUrlsRef.current.clear();

        // Create blob URLs for all files
        const blobUrlMap = new Map<string, string>();
        fileMap.forEach((file, path) => {
          const blobUrl = URL.createObjectURL(file);
          blobUrlsRef.current.add(blobUrl);
          blobUrlMap.set(path, blobUrl);
        });

        // Get the main file blob URL
        const mainPath = rootPath + rootFile.name;
        const mainBlobUrl =
          blobUrlMap.get(mainPath) || blobUrlMap.get(rootFile.name);

        if (!mainBlobUrl) {
          reject(new Error("Could not create blob URL for main file"));
          return;
        }

        // Set URL modifier to intercept asset loading
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          const decodedUrl = decodeURI(url);
          const normalizedUrl = rootPath + decodedUrl.replace(/^(\.?\/)/, "");

          // Try to find the file in the map
          for (const [path, blobUrl] of blobUrlMap) {
            if (
              path === normalizedUrl ||
              path.endsWith(decodedUrl) ||
              path === decodedUrl
            ) {
              return blobUrl;
            }
          }

          return url;
        });

        const loader = new GLTFLoader(manager);

        // Setup DRACOLoader for compressed models
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(
          "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
        );
        dracoLoader.preload();
        loader.setDRACOLoader(dracoLoader);

        loader.load(
          mainBlobUrl,
          (gltf: GLTF) => {
            handleGLTFLoad(gltf);
            resolve();
          },
          (progressEvent) => {
            if (progressEvent.lengthComputable) {
              const percent = Math.round(
                (progressEvent.loaded / progressEvent.total) * 100
              );
              onProgress?.(percent);
            }
          },
          (error) => {
            console.error("Error loading GLTF:", error);
            reject(error);
          }
        );
      });
    },
  }));

  const handleGLTFLoad = (gltf: GLTF) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const scene = gltf.scene || gltf.scenes[0];
    const clips = gltf.animations || [];

    if (!scene) {
      throw new Error(
        "This model contains no scene, and cannot be viewed here."
      );
    }

    scene.updateMatrixWorld();

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    // Reset controls
    controlsRef.current.reset();

    // Center the model
    scene.position.x -= center.x;
    scene.position.y -= center.y;
    scene.position.z -= center.z;

    // Update camera and controls
    controlsRef.current.maxDistance = size * 10;
    cameraRef.current.near = size / 100;
    cameraRef.current.far = size * 100;
    cameraRef.current.updateProjectionMatrix();

    cameraRef.current.position.copy(center);
    cameraRef.current.position.x += size / 2.0;
    cameraRef.current.position.y += size / 5.0;
    cameraRef.current.position.z += size / 2.0;
    cameraRef.current.lookAt(center);

    controlsRef.current.target.copy(new THREE.Vector3(0, 0, 0));
    controlsRef.current.saveState();

    sceneRef.current.add(scene);
    contentRef.current = scene;
    clipsRef.current = clips;

    // Check if scene has lights
    let hasLights = false;
    scene.traverse((node) => {
      if (node instanceof THREE.Light) {
        hasLights = true;
      }
    });

    // Update punctual lights state
    stateRef.current.punctualLights = !hasLights;

    // Add default lights if none present
    if (!hasLights && lightsRef.current.length === 0) {
      addLights();
    }

    // Setup animations
    if (clips.length > 0) {
      mixerRef.current = new THREE.AnimationMixer(scene);
      // Auto-play first animation
      const action = mixerRef.current.clipAction(clips[0]);
      action.play();
    }

    // Update GUI and display
    updateLights();
    updateDisplay();
    updateEnvironment();

    console.log("✅ GLTF model loaded:", {
      animations: clips.length,
      hasLights,
      size: size.toFixed(2),
    });
  };

  const addLights = () => {
    if (!cameraRef.current) return;

    const ambientLight = new THREE.AmbientLight(
      stateRef.current.ambientColor,
      stateRef.current.ambientIntensity
    );
    ambientLight.name = "ambient_light";
    cameraRef.current.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      stateRef.current.directColor,
      stateRef.current.directIntensity
    );
    directionalLight.position.set(0.5, 0, 0.866);
    directionalLight.name = "main_light";
    cameraRef.current.add(directionalLight);

    lightsRef.current.push(ambientLight, directionalLight);
  };

  const removeLights = () => {
    lightsRef.current.forEach((light) => {
      if (light.parent) {
        light.parent.remove(light);
      }
    });
    lightsRef.current = [];
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const container = canvasRef.current.parentElement;
    if (!container) return;

    // Capture blob URLs for cleanup
    const blobUrlsToCleanup = blobUrlsRef.current;

    // Check WebGL support
    const testCanvas = document.createElement("canvas");
    const gl =
      testCanvas.getContext("webgl") ||
      (testCanvas.getContext(
        "experimental-webgl"
      ) as WebGLRenderingContext | null);

    if (!gl) {
      console.error("❌ WebGL not supported!");
      return;
    }

    console.log("✅ WebGL supported");

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = stateRef.current.toneMapping as THREE.ToneMapping;
    renderer.toneMappingExposure = Math.pow(2, stateRef.current.exposure);
    rendererRef.current = renderer;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      1000
    );
    camera.position.set(0, 1, 5);
    cameraRef.current = camera;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(stateRef.current.bgColor);
    sceneRef.current = scene;

    // Add camera to scene (required for lights attached to camera)
    scene.add(camera);

    // Create neutral environment
    const neutralEnv = createNeutralEnvironment(renderer);
    neutralEnvRef.current = neutralEnv;
    scene.environment = neutralEnv;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Fix for touch events error
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    controls.update();
    controlsRef.current = controls;

    // Add default lights (before model loads)
    addLights();

    // Add grid and axes helpers (initially visible)
    const gridHelper = new THREE.GridHelper(10, 10);
    gridHelperRef.current = gridHelper;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    axesHelperRef.current = axesHelper;
    scene.add(axesHelper);

    // Setup loader
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
    );
    dracoLoader.preload();
    loader.setDRACOLoader(dracoLoader);
    loaderRef.current = loader;

    // Add GUI controls
    addGUI();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = clockRef.current.getDelta();

      // Update mixer
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
      scene.clear();
      removeLights();

      // Revoke blob URLs
      blobUrlsToCleanup.forEach((url) => URL.revokeObjectURL(url));

      // Dispose neutral environment
      if (neutralEnvRef.current) {
        neutralEnvRef.current.dispose();
      }

      // Destroy GUI
      if (guiRef.current) {
        guiRef.current.destroy();
        guiRef.current = null;
      }
    };
  }, [addGUI]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
});

GLTFViewer.displayName = "GLTFViewer";
