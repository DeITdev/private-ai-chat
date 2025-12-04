import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Checkbox } from "~/components/ui/checkbox";
import { Slider } from "~/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

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

interface GLTFViewerProps {
  theme?: "light" | "dark";
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

export const GLTFViewer = forwardRef<GLTFViewerRef, GLTFViewerProps>(
  ({ theme = "dark" }, ref) => {
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
    const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);

    // UI State
    const [background, setBackground] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [wireframe, setWireframe] = useState(false);
    const [skeleton, setSkeleton] = useState(false);
    const [grid, setGrid] = useState(true);
    const [autoRotate, setAutoRotate] = useState(false);
    const [punctualLights, setPunctualLights] = useState(true);
    const [exposure, setExposure] = useState(0.0);
    const [toneMapping, setToneMapping] = useState<string>("Linear");
    const [ambientIntensity, setAmbientIntensity] = useState(0.3);
    const [ambientColor, setAmbientColor] = useState("#FFFFFF");
    const [directIntensity, setDirectIntensity] = useState(0.8 * Math.PI);
    const [directColor, setDirectColor] = useState("#FFFFFF");
    const [bgColor, setBgColor] = useState(
      theme === "light" ? "#f2f2f2" : "#191919"
    );
    const [pointSize, setPointSize] = useState(1.0);
    const [showControls, setShowControls] = useState(true);

    const stateRef = useRef({
      background: false,
      playbackSpeed: 1.0,
      wireframe: false,
      skeleton: false,
      grid: true,
      autoRotate: false,
      punctualLights: true,
      exposure: 0.0,
      toneMapping: THREE.LinearToneMapping as THREE.ToneMapping,
      ambientIntensity: 0.3,
      ambientColor: "#FFFFFF",
      directIntensity: 0.8 * Math.PI,
      directColor: "#FFFFFF",
      bgColor: theme === "light" ? "#f2f2f2" : "#191919",
      pointSize: 1.0,
      screenSpacePanning: true,
    });

    // Sync state to stateRef for rendering
    useEffect(() => {
      stateRef.current.background = background;
      stateRef.current.playbackSpeed = playbackSpeed;
      stateRef.current.wireframe = wireframe;
      stateRef.current.skeleton = skeleton;
      stateRef.current.grid = grid;
      stateRef.current.autoRotate = autoRotate;
      stateRef.current.punctualLights = punctualLights;
      stateRef.current.exposure = exposure;
      stateRef.current.toneMapping =
        toneMapping === "ACES Filmic"
          ? THREE.ACESFilmicToneMapping
          : THREE.LinearToneMapping;
      stateRef.current.ambientIntensity = ambientIntensity;
      stateRef.current.ambientColor = ambientColor;
      stateRef.current.directIntensity = directIntensity;
      stateRef.current.directColor = directColor;
      stateRef.current.bgColor = bgColor;
      stateRef.current.pointSize = pointSize;
    }, [
      background,
      playbackSpeed,
      wireframe,
      skeleton,
      grid,
      autoRotate,
      punctualLights,
      exposure,
      toneMapping,
      ambientIntensity,
      ambientColor,
      directIntensity,
      directColor,
      bgColor,
      pointSize,
    ]);

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
          const helper = new THREE.SkeletonHelper(
            mesh.skeleton.bones[0].parent!
          );
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
              const prop = (material as unknown as Record<string, unknown>)[
                key
              ];
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
      if (!sceneRef.current || !cameraRef.current || !controlsRef.current)
        return;

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
      };
    }, []);

    // Update background color when theme changes
    useEffect(() => {
      const newBgColor = theme === "light" ? "#f2f2f2" : "#191919";
      setBgColor(newBgColor);
      stateRef.current.bgColor = newBgColor;

      if (sceneRef.current) {
        sceneRef.current.background = new THREE.Color(newBgColor);
      }
    }, [theme]);

    return (
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: "block" }}
        />

        {/* shadcn UI Controls Panel */}
        {showControls ? (
          <div className="absolute top-20 right-4 w-[280px] max-h-[calc(100%-100px)] overflow-y-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border rounded-lg shadow-lg z-[100]">
            <Accordion
              type="multiple"
              defaultValue={["display", "lighting", "animation"]}
              className="w-full"
            >
              {/* Display Controls */}
              <AccordionItem value="display">
                <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                  Display
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="background" className="text-sm">
                      Background
                    </Label>
                    <Checkbox
                      id="background"
                      checked={background}
                      onCheckedChange={(checked) => {
                        setBackground(!!checked);
                        updateEnvironment();
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoRotate" className="text-sm">
                      Auto Rotate
                    </Label>
                    <Checkbox
                      id="autoRotate"
                      checked={autoRotate}
                      onCheckedChange={(checked) => {
                        setAutoRotate(!!checked);
                        updateDisplay();
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="wireframe" className="text-sm">
                      Wireframe
                    </Label>
                    <Checkbox
                      id="wireframe"
                      checked={wireframe}
                      onCheckedChange={(checked) => {
                        setWireframe(!!checked);
                        updateDisplay();
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="skeleton" className="text-sm">
                      Skeleton
                    </Label>
                    <Checkbox
                      id="skeleton"
                      checked={skeleton}
                      onCheckedChange={(checked) => {
                        setSkeleton(!!checked);
                        updateDisplay();
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="grid" className="text-sm">
                      Grid
                    </Label>
                    <Checkbox
                      id="grid"
                      checked={grid}
                      onCheckedChange={(checked) => {
                        setGrid(!!checked);
                        updateDisplay();
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pointSize" className="text-sm">
                      Point Size: {pointSize.toFixed(1)}
                    </Label>
                    <Slider
                      id="pointSize"
                      min={1}
                      max={16}
                      step={0.1}
                      value={[pointSize]}
                      onValueChange={([value]) => {
                        setPointSize(value);
                        updateDisplay();
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bgColor" className="text-sm">
                      Background Color
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <div
                            className="w-4 h-4 rounded border mr-2"
                            style={{ backgroundColor: bgColor }}
                          />
                          <span className="text-xs">{bgColor}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <div className="space-y-2">
                          <Label htmlFor="bgColorInput" className="text-sm">
                            Choose Color
                          </Label>
                          <Input
                            id="bgColorInput"
                            type="color"
                            value={bgColor}
                            onChange={(e) => {
                              setBgColor(e.target.value);
                              updateBackground();
                            }}
                            className="h-10 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={bgColor}
                            onChange={(e) => {
                              setBgColor(e.target.value);
                              updateBackground();
                            }}
                            className="font-mono text-xs"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Lighting Controls */}
              <AccordionItem value="lighting">
                <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                  Lighting
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="toneMapping" className="text-sm">
                      Tone Mapping
                    </Label>
                    <Select
                      value={toneMapping}
                      onValueChange={(value) => {
                        setToneMapping(value);
                        updateLights();
                      }}
                    >
                      <SelectTrigger id="toneMapping">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Linear">Linear</SelectItem>
                        <SelectItem value="ACES Filmic">ACES Filmic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exposure" className="text-sm">
                      Exposure: {exposure.toFixed(2)}
                    </Label>
                    <Slider
                      id="exposure"
                      min={-10}
                      max={10}
                      step={0.01}
                      value={[exposure]}
                      onValueChange={([value]) => {
                        setExposure(value);
                        updateLights();
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="punctualLights" className="text-sm">
                      Punctual Lights
                    </Label>
                    <Checkbox
                      id="punctualLights"
                      checked={punctualLights}
                      onCheckedChange={(checked) => {
                        setPunctualLights(!!checked);
                        updateLights();
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ambientIntensity" className="text-sm">
                      Ambient Intensity: {ambientIntensity.toFixed(2)}
                    </Label>
                    <Slider
                      id="ambientIntensity"
                      min={0}
                      max={2}
                      step={0.01}
                      value={[ambientIntensity]}
                      onValueChange={([value]) => {
                        setAmbientIntensity(value);
                        updateLights();
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ambientColor" className="text-sm">
                      Ambient Color
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <div
                            className="w-4 h-4 rounded border mr-2"
                            style={{ backgroundColor: ambientColor }}
                          />
                          <span className="text-xs">{ambientColor}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <div className="space-y-2">
                          <Label
                            htmlFor="ambientColorInput"
                            className="text-sm"
                          >
                            Choose Color
                          </Label>
                          <Input
                            id="ambientColorInput"
                            type="color"
                            value={ambientColor}
                            onChange={(e) => {
                              setAmbientColor(e.target.value);
                              updateLights();
                            }}
                            className="h-10 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={ambientColor}
                            onChange={(e) => {
                              setAmbientColor(e.target.value);
                              updateLights();
                            }}
                            className="font-mono text-xs"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="directIntensity" className="text-sm">
                      Direct Intensity: {directIntensity.toFixed(2)}
                    </Label>
                    <Slider
                      id="directIntensity"
                      min={0}
                      max={4}
                      step={0.01}
                      value={[directIntensity]}
                      onValueChange={([value]) => {
                        setDirectIntensity(value);
                        updateLights();
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="directColor" className="text-sm">
                      Direct Color
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <div
                            className="w-4 h-4 rounded border mr-2"
                            style={{ backgroundColor: directColor }}
                          />
                          <span className="text-xs">{directColor}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <div className="space-y-2">
                          <Label htmlFor="directColorInput" className="text-sm">
                            Choose Color
                          </Label>
                          <Input
                            id="directColorInput"
                            type="color"
                            value={directColor}
                            onChange={(e) => {
                              setDirectColor(e.target.value);
                              updateLights();
                            }}
                            className="h-10 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={directColor}
                            onChange={(e) => {
                              setDirectColor(e.target.value);
                              updateLights();
                            }}
                            className="font-mono text-xs"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Animation Controls */}
              <AccordionItem value="animation">
                <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
                  Animation
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="playbackSpeed" className="text-sm">
                      Playback Speed: {playbackSpeed.toFixed(2)}
                    </Label>
                    <Slider
                      id="playbackSpeed"
                      min={0}
                      max={1}
                      step={0.01}
                      value={[playbackSpeed]}
                      onValueChange={([value]) => {
                        setPlaybackSpeed(value);
                        if (mixerRef.current)
                          mixerRef.current.timeScale = value;
                      }}
                    />
                  </div>

                  <Button
                    onClick={playAllClips}
                    variant="outline"
                    className="w-full"
                  >
                    Play All
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Close Control Button */}
            <div className="p-4 border-t">
              <Button
                onClick={() => setShowControls(false)}
                variant="outline"
                className="w-full"
              >
                Close Control
              </Button>
            </div>
          </div>
        ) : (
          /* Open Control Button */
          <div className="absolute top-20 right-4 z-[100]">
            <Button
              onClick={() => setShowControls(true)}
              variant="default"
              size="sm"
            >
              Open Control
            </Button>
          </div>
        )}
      </div>
    );
  }
);

GLTFViewer.displayName = "GLTFViewer";
