import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

export interface VRMViewerRef {
  setExpression: (name: string, value: number) => void;
}

export const VRMViewer = forwardRef<VRMViewerRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);

  useImperativeHandle(ref, () => ({
    setExpression: (name: string, value: number) => {
      if (vrmRef.current?.expressionManager) {
        vrmRef.current.expressionManager.setValue(name, value);
      }
    },
  }));

  useEffect(() => {
    if (!canvasRef.current) return;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      30.0,
      window.innerWidth / window.innerHeight,
      0.1,
      20.0
    );
    camera.position.set(0.0, 1.0, 5.0);

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.0, 0.0);
    controls.update();

    // Setup scene
    const scene = new THREE.Scene();

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, Math.PI);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);

    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Load VRM model
    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    const modelUrl = "/HatsuneMikuNT.vrm";

    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm;

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);

        vrm.scene.traverse((obj: THREE.Object3D) => {
          obj.frustumCulled = false;
        });

        scene.add(vrm.scene);
        vrmRef.current = vrm;

        console.log(
          "Available Expressions:",
          vrm.expressionManager?.expressionMap
        );
        console.log("VRM model loaded!", vrm);
      },
      (progress) =>
        console.log(
          "Loading model...",
          100.0 * (progress.loaded / progress.total),
          "%"
        ),
      (error) => console.error(error)
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
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
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
