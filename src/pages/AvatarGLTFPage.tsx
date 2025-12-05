import { useState, useRef, useEffect } from "react";
import { GLTFViewer, GLTFViewerRef } from "~/components/GLTFViewer";
import {
  Dock,
  DockIcon,
  DockItem,
  DockLabel,
} from "~/components/ui/shadcn-io/dock";
import {
  Home,
  Upload,
  Menu,
  Mic,
  Settings as SettingsIcon,
  ChevronDown,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Separator } from "~/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { predefinedAvatars, predefinedAnimations } from "~/constants";
import { SelectionModal } from "~/components/SelectionModal";
import { useNavigate, useLocation } from "react-router-dom";
import { useSidebar } from "~/components/ui/sidebar";
import { useTheme } from "~/components/ThemeProvider";

const AvatarGLTFPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isGLTFLoaded, setIsGLTFLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [enableSmoothCamera, setEnableSmoothCamera] = useState(true);
  const [cameraFollowCharacter, setCameraFollowCharacter] = useState(false);
  const [viewerMode, setViewerMode] = useState<"vrm" | "gltf">("gltf");
  const [showAnimationModal, setShowAnimationModal] = useState(false);
  const [selectedAnimation, setSelectedAnimation] = useState(
    "/models/animations/Breathing_Idle.fbx"
  );
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(
    "/models/Larasdyah_Character2.glb"
  );
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [hasLoadedFromNavigation, setHasLoadedFromNavigation] = useState(false);

  const gltfViewerRef = useRef<GLTFViewerRef>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const { toggleSidebar } = useSidebar();
  const { theme } = useTheme();

  const handleUploadModel = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await processFiles(files);
      // Reset file input after successful upload
      event.target.value = "";
    }
  };

  const handleAnimationSelect = async (animationPath: string) => {
    try {
      console.log("🎭 Loading animation:", animationPath);
      setShowAnimationModal(false);
      // TODO: Implement animation loading for GLTF viewer if needed
      setSelectedAnimation(animationPath);
      console.log("✅ Animation loaded successfully!");
    } catch (error) {
      console.error("❌ Failed to load animation:", error);
    }
  };

  const handleViewerModeChange = (mode: string) => {
    if (mode === "vrm") {
      navigate("/avatar-vrm");
    } else {
      setViewerMode("gltf");
    }
  };

  const handleAvatarSelect = async (avatarPath: string) => {
    try {
      console.log("🔄 Switching to avatar:", avatarPath);
      setShowAvatarModal(false);

      // Convert VRM path to GLTF path
      let gltfPath = avatarPath;
      if (avatarPath === "/models/Larasdyah.vrm") {
        gltfPath = "/models/Larasdyah_Character2.glb";
      } else if (avatarPath.endsWith(".vrm")) {
        // For other VRM models, navigate to VRM viewer
        navigate("/avatar-vrm", { state: { loadModel: avatarPath } });
        return;
      }

      // Clear existing model first
      if (gltfViewerRef.current) {
        gltfViewerRef.current.clearScene();
        setIsGLTFLoaded(false);
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      setIsLoading(true);
      setLoadingProgress(0);

      // Fetch the model file
      const response = await fetch(gltfPath);
      const blob = await response.blob();
      const file = new File([blob], gltfPath.split("/").pop() || "model.glb", {
        type: "model/gltf-binary",
      });

      const fileMap = new Map<string, File>();
      fileMap.set(file.name, file);

      if (gltfViewerRef.current) {
        await gltfViewerRef.current.loadGLTF(file, "", fileMap, (progress) => {
          setLoadingProgress(progress);
        });
        setIsLoading(false);
        setIsGLTFLoaded(true);
        setSelectedAvatar(gltfPath);
        console.log("✅ Avatar loaded successfully!");
      }
    } catch (error) {
      console.error("❌ Failed to switch avatar:", error);
      setIsLoading(false);
      setIsGLTFLoaded(false);
    }
  };

  const processFiles = async (files: FileList) => {
    try {
      console.log("📁 Files selected:", files.length);

      // Find the main GLTF/GLB file
      let rootFile: File | null = null;
      let rootPath = "";
      const fileMap = new Map<string, File>();

      Array.from(files).forEach((file) => {
        if (file.name.match(/\.(gltf|glb)$/i)) {
          rootFile = file;
          rootPath = file.webkitRelativePath
            ? file.webkitRelativePath.replace(file.name, "")
            : "";
        }
        const path = file.webkitRelativePath || file.name;
        fileMap.set(path, file);
      });

      if (!rootFile) {
        alert("No .gltf or .glb file found. Please select a valid GLTF model.");
        return;
      }

      // Type assertion to help TypeScript
      const modelFile: File = rootFile;

      console.log(
        "🔄 Loading GLTF model:",
        modelFile.name,
        `(${(modelFile.size / 1024 / 1024).toFixed(2)} MB)`
      );

      // Step 1: Clear existing model first
      console.log("🧹 Clearing existing model...");
      if (gltfViewerRef.current) {
        gltfViewerRef.current.clearScene();
        setIsGLTFLoaded(false);
      }

      // Step 2: Small delay to ensure cleanup is complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Step 3: Load the new model
      setIsLoading(true);
      setLoadingProgress(0);

      if (gltfViewerRef.current) {
        await gltfViewerRef.current.loadGLTF(
          modelFile,
          rootPath,
          fileMap,
          (progress) => {
            setLoadingProgress(progress);
          }
        );
        setIsLoading(false);
        setIsGLTFLoaded(true);
        console.log("✅ GLTF model loaded successfully!");
      }
    } catch (error) {
      console.error("❌ Failed to load GLTF file:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load GLTF file. Please make sure it's a valid GLTF model."
      );
      setIsLoading(false);
      setIsGLTFLoaded(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const items = e.dataTransfer.items;
    if (items) {
      const files: File[] = [];

      // Process all items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            await traverseFileTree(entry, "", files);
          } else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }

      if (files.length > 0) {
        // Create a FileList-like object
        const dt = new DataTransfer();
        files.forEach((file) => dt.items.add(file));
        await processFiles(dt.files);
      }
    }
  };

  // Recursive function to traverse directory structure
  const traverseFileTree = async (
    item: FileSystemEntry,
    path: string,
    files: File[]
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        (item as FileSystemFileEntry).file((file) => {
          // Create a new file with webkitRelativePath
          const newFile = new File([file], file.name, { type: file.type });
          Object.defineProperty(newFile, "webkitRelativePath", {
            value: path + file.name,
            writable: false,
          });
          files.push(newFile);
          resolve();
        });
      } else if (item.isDirectory) {
        const dirReader = (item as FileSystemDirectoryEntry).createReader();
        dirReader.readEntries(async (entries) => {
          for (const entry of entries) {
            await traverseFileTree(entry, path + item.name + "/", files);
          }
          resolve();
        });
      }
    });
  };

  // Global error handling
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("🔴 Global error:", event.error);
      setError(event.message || "An error occurred");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("🔴 Unhandled rejection:", event.reason);
      setError(String(event.reason));
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
    };
  }, []);

  // Enumerate audio devices
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("⚠️ MediaDevices API not available on this device");
      return;
    }

    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );
        setAudioInputs(audioDevices);
        if (audioDevices.length > 0 && !selectedInputId) {
          setSelectedInputId(audioDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error enumerating devices:", error);
      }
    };

    enumerateDevices();

    if (navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", enumerateDevices);
    }

    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          enumerateDevices
        );
      }
    };
  }, [selectedInputId]);

  // Load model from navigation state (e.g., from VRM page Larasdyah button)
  useEffect(() => {
    const state = location.state as { loadModel?: string } | null;

    // Prevent duplicate loads
    if (state?.loadModel && gltfViewerRef.current && !hasLoadedFromNavigation) {
      const modelPath = state.loadModel;

      // Clear the navigation state IMMEDIATELY to prevent re-renders
      navigate(location.pathname, { replace: true, state: {} });
      setHasLoadedFromNavigation(true);

      const loadModelFromPath = async () => {
        try {
          setIsLoading(true);
          setLoadingProgress(0);

          // Fetch the model file
          const response = await fetch(modelPath);
          if (!response.ok) {
            throw new Error(`Failed to fetch model: ${response.statusText}`);
          }

          const blob = await response.blob();
          const file = new File(
            [blob],
            modelPath.split("/").pop() || "model.glb",
            {
              type: "model/gltf-binary",
            }
          );

          const fileMap = new Map<string, File>();
          fileMap.set(file.name, file);

          if (gltfViewerRef.current) {
            await gltfViewerRef.current.loadGLTF(
              file,
              "",
              fileMap,
              (progress) => {
                setLoadingProgress(progress);
              }
            );
            setIsLoading(false);
            setIsGLTFLoaded(true);
            setSelectedAvatar(modelPath);
            console.log("✅ GLTF model loaded from navigation state!");
          }
        } catch (error) {
          console.error("❌ Failed to load GLTF from navigation state:", error);
          setError(
            error instanceof Error ? error.message : "Failed to load GLTF file."
          );
          setIsLoading(false);
          setHasLoadedFromNavigation(false); // Reset on error
        }
      };

      loadModelFromPath();
    }
  }, [location.state, location.pathname, navigate, hasLoadedFromNavigation]);

  return (
    <div
      className="flex flex-col h-screen w-full fixed inset-0 overflow-hidden lg:pl-64"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Error Display */}
      {error && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center lg:left-64">
          <div className="text-center space-y-4 p-8 bg-background/90 rounded-lg max-w-md">
            <h2 className="text-2xl font-bold text-red-500">Error</h2>
            <p className="text-sm text-foreground">{error}</p>
            <Button onClick={() => setError(null)} variant="outline">
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center lg:left-64">
          <div className="text-center space-y-4">
            <div className="text-6xl font-bold text-white">
              {loadingProgress}%
            </div>
            <div className="text-xl text-white/80">Loading 3D Model...</div>
            <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm z-40 flex items-center justify-center lg:left-64 border-4 border-dashed border-primary">
          <div className="text-center space-y-4">
            <Upload className="w-24 h-24 mx-auto text-primary" />
            <div className="text-3xl font-bold text-primary">
              Drop GLTF/GLB file here
            </div>
          </div>
        </div>
      )}

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 h-16 border-b bg-background/80 backdrop-blur-sm z-10 lg:left-64">
        <div className="flex items-center gap-2 lg:gap-2 w-full lg:w-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-bold absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0">
            3D Avatar Viewer
          </h1>
        </div>

        {/* Desktop Settings Dropdown - Hidden on Mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-base font-semibold max-md:w-10 max-md:h-10 max-md:p-0"
            >
              <span className="max-md:hidden">Settings</span>
              <SettingsIcon className="md:ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Smooth Camera Toggle */}
            <div className="flex items-center justify-between px-2 py-3 cursor-pointer hover:bg-accent rounded-sm">
              <span className="text-sm font-medium">Smooth Camera</span>
              <Switch
                checked={enableSmoothCamera}
                onCheckedChange={setEnableSmoothCamera}
              />
            </div>
            {/* Camera Follow Character Toggle */}
            <div className="flex items-center justify-between px-2 py-3 cursor-pointer hover:bg-accent rounded-sm">
              <span className="text-sm font-medium">
                Camera Follow Character
              </span>
              <Switch
                checked={cameraFollowCharacter}
                onCheckedChange={setCameraFollowCharacter}
              />
            </div>
            {/* Separator */}
            <Separator className="my-1" />
            {/* Viewer Mode Tabs */}
            <div className="px-2 py-3">
              <p className="text-sm font-medium mb-2">Viewer Mode</p>
              <Tabs value={viewerMode} onValueChange={handleViewerModeChange}>
                <TabsList className="w-full">
                  <TabsTrigger value="vrm" className="flex-1">
                    VRM
                  </TabsTrigger>
                  <TabsTrigger value="gltf" className="flex-1">
                    GLTF
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {/* Separator */}
            <Separator className="my-1" />
            {/* Reset Camera Position Button */}
            <DropdownMenuRadioItem
              value="reset"
              onClick={() => {
                // TODO: Implement reset camera for GLTF viewer
                console.log("Reset camera position");
              }}
              className="flex items-center justify-center py-3 cursor-pointer hover:bg-accent"
            >
              <span className="text-sm font-medium">Reset Camera Position</span>
            </DropdownMenuRadioItem>
            {/* Upload 3D Model */}
            <DropdownMenuRadioItem
              value="upload"
              onClick={(e) => {
                e.preventDefault();
                handleUploadModel();
              }}
              className="flex flex-col items-center justify-center py-6 cursor-pointer hover:bg-accent"
            >
              <Upload className="h-8 w-8 mb-2" />
              <span className="text-sm font-medium">
                Upload 3D Model (GLTF)
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 w-full overflow-hidden relative">
        {!isGLTFLoaded && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center space-y-6 bg-background/90 p-8 rounded-lg max-w-md pointer-events-auto">
              <div className="text-6xl">📦</div>
              <div>
                <h2 className="text-2xl font-bold mb-2">
                  Drag glTF 2.0 file or folder here
                </h2>
                <p className="text-muted-foreground">
                  Or click the button below to upload
                </p>
              </div>
              <Button onClick={handleUploadModel} size="lg">
                <Upload className="mr-2 h-5 w-5" />
                Choose file
              </Button>
            </div>
          </div>
        )}
        <GLTFViewer
          ref={gltfViewerRef}
          theme={theme === "system" ? "dark" : theme}
        />
      </main>

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end pb-4 lg:left-64">
        {/* Dock with Action Buttons */}
        <Dock magnification={100} distance={140}>
          {/* Home Button */}
          <DockItem>
            <DockLabel>Home</DockLabel>
            <DockIcon>
              <button
                onClick={() => navigate("/")}
                className="h-full w-full flex items-center justify-center"
              >
                <Home className="h-full w-full text-foreground" />
              </button>
            </DockIcon>
          </DockItem>

          {/* Microphone Button with Selector */}
          <DockItem>
            <DockLabel>Microphone</DockLabel>
            <DockIcon>
              <div className="h-full w-full flex items-center justify-center relative">
                <button
                  onClick={() => console.log("Microphone clicked")}
                  className="h-full w-full flex items-center justify-center"
                >
                  <Mic className="h-full w-full text-foreground" />
                </button>
                {/* Microphone Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(50%+8px)] flex items-center justify-center hover:opacity-70">
                      <ChevronDown className="h-4 w-4 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {audioInputs.map((device) => (
                      <DropdownMenuRadioItem
                        key={device.deviceId}
                        value={device.deviceId}
                        onClick={() => setSelectedInputId(device.deviceId)}
                      >
                        {device.label ||
                          `Microphone (${device.deviceId.slice(0, 5)})`}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DockIcon>
          </DockItem>

          {/* Animation Button */}
          <DockItem>
            <DockLabel>Animation</DockLabel>
            <DockIcon>
              <button
                onClick={() => setShowAnimationModal(true)}
                className="h-full w-full flex items-center justify-center"
              >
                <svg
                  viewBox="0 0 36 36"
                  className="h-full w-full text-foreground"
                  fill="none"
                >
                  <use href="/src/assets/sprite.svg#animation" />
                </svg>
              </button>
            </DockIcon>
          </DockItem>

          {/* 3D Model Button */}
          <DockItem>
            <DockLabel>3D Avatar</DockLabel>
            <DockIcon>
              <button
                onClick={() => setShowAvatarModal(true)}
                className="h-full w-full flex items-center justify-center"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-full w-full text-foreground"
                  fill="none"
                >
                  <use href="/src/assets/sprite.svg#3D" />
                </svg>
              </button>
            </DockIcon>
          </DockItem>
        </Dock>
      </footer>

      {/* 3D Avatar Selection Modal */}
      <SelectionModal
        open={showAvatarModal}
        onOpenChange={setShowAvatarModal}
        title="Select 3D Avatar"
        description="Choose from the available 3D avatars below"
        items={predefinedAvatars}
        selectedItem={selectedAvatar}
        onSelectItem={handleAvatarSelect}
        descriptionId="avatar-dialog-description"
      />

      {/* Animation Selection Modal */}
      <SelectionModal
        open={showAnimationModal}
        onOpenChange={setShowAnimationModal}
        title="Select Animation"
        description="Choose from the available animations below"
        items={predefinedAnimations}
        selectedItem={selectedAnimation}
        onSelectItem={handleAnimationSelect}
        descriptionId="animation-dialog-description"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb"
        onChange={handleFileSelected}
        className="hidden"
        multiple
        // @ts-expect-error - webkitdirectory is not in the types
        webkitdirectory=""
        directory=""
      />
    </div>
  );
};

export default AvatarGLTFPage;
