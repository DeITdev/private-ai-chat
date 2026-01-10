"use client";

import { useState, useRef, useEffect } from "react";
import { VRMViewer, VRMViewerRef } from "@/components/VRMViewer";
import { VRMDatGUIControl } from "@/components/VRMDatGUIControl";
import { DockMenu } from "@/components/DockMenu";
import { ChatPrompt } from "@/components/ChatPrompt";

interface PoseData {
  name?: string;
  code?: string;
  vrmVersion?: string;
  data?: Record<string, unknown>;
}
import { Settings as SettingsIcon, Upload, Menu } from "lucide-react";
import { predefinedAvatars } from "@/constants";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { SelectionModal } from "@/components/SelectionModal";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";

// API URL for chat backend
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL || "http://localhost:5004";

export default function AvatarVRMPage() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [isVRMLoaded, setIsVRMLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(
    "/models/vrm/HatsuneMikuNT.vrm"
  );
  const [hasLoadedInitially, setHasLoadedInitially] = useState(false);
  const [showChatPrompt, setShowChatPrompt] = useState(false);
  const [enableSmoothCamera, setEnableSmoothCamera] = useState(true);
  const [cameraFollowCharacter, setCameraFollowCharacter] = useState(false);
  const [hideGridAxes, setHideGridAxes] = useState(false);
  const [viewerMode, setViewerMode] = useState<"vrm" | "gltf">("vrm");
  const [animationSpeed, setAnimationSpeed] = useState(0.5);

  // VRM Control states
  const [expressions, setExpressions] = useState<
    Array<{ name: string; value: number }>
  >([]);
  const [shapeKeys, setShapeKeys] = useState<
    Array<{ name: string; value: number }>
  >([]);
  const [springBones, setSpringBones] = useState<
    Array<{
      name: string;
      settings: {
        dragForce: number;
        gravityPower: number;
        hitRadius: number;
        stiffness: number;
        gravityDir: { x: number; y: number; z: number };
      };
    }>
  >([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vrmViewerRef = useRef<VRMViewerRef>(null);
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isAudioSetupRef = useRef(false);
  const skipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadCancelledRef = useRef(false);
  const audioPermissionRequestedRef = useRef(false);
  const { toggleSidebar } = useSidebar();

  const handleSkipLoading = () => {
    console.log("⏭️ User skipped loading");
    loadCancelledRef.current = true;
    setIsLoading(false);
    setShowSkipButton(false);
    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = null;
    }
  };

  // Handle audio playback from chat input
  const handleChatAudioGenerated = (audioUrl: string) => {
    console.log("🔊 Playing audio from chat input...");

    if (audioRef.current) {
      audioRef.current.src = audioUrl;

      // Setup audio analysis for mouth animation (only once)
      if (!isAudioSetupRef.current && audioRef.current) {
        const audioContext = new AudioContext();
        const audioElement = audioRef.current;
        const source = audioContext.createMediaElementSource(audioElement);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        isAudioSetupRef.current = true;
      }

      // Animate mouth based on TTS audio
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        let isPlaying = true;

        const animateMouth = () => {
          if (!isPlaying || !analyserRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const average = sum / dataArray.length;
          const mouthValue = Math.min(Math.max((average - 5) / 50, 0), 1);

          if (vrmViewerRef.current) {
            vrmViewerRef.current.setExpression("aa", mouthValue);
          }

          requestAnimationFrame(animateMouth);
        };

        // Start animation when audio plays
        audioRef.current.onplay = () => {
          isPlaying = true;
          animateMouth();
        };

        // Stop animation when audio ends
        audioRef.current.onended = () => {
          isPlaying = false;
          if (vrmViewerRef.current) {
            vrmViewerRef.current.setExpression("aa", 0);
          }
        };
      }

      audioRef.current.play();
    }
  };

  const startRecording = async () => {
    try {
      // Request audio permission on first use
      if (!audioPermissionRequestedRef.current) {
        console.log("🎤 Requesting microphone permission...");
        audioPermissionRequestedRef.current = true;
      }

      const audioConstraints = selectedInputId
        ? { deviceId: { exact: selectedInputId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordedAudioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        try {
          // Step 1: Send audio to Whisper for transcription
          const formData = new FormData();
          formData.append("audio", recordedAudioBlob, "recording.webm");

          console.log("🎤 Sending audio to Whisper for transcription...");
          const whisperResponse = await fetch(
            "http://localhost:5001/transcribe",
            {
              method: "POST",
              body: formData,
            }
          );

          if (!whisperResponse.ok) {
            throw new Error("Whisper transcription failed");
          }

          const whisperData = await whisperResponse.json();
          const transcribedText = whisperData.text;
          console.log("✅ Transcription:", transcribedText);

          // Step 2: Query RAG system for relevant context
          console.log("🔍 Querying RAG system for context...");
          let ragContext = "";
          try {
            const ragResponse = await fetch("http://localhost:5003/query", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query: transcribedText }),
            });

            if (ragResponse.ok) {
              const ragData = await ragResponse.json();
              if (ragData.has_context) {
                ragContext = ragData.context;
                console.log(
                  "✅ RAG Context retrieved:",
                  ragData.contexts.length,
                  "chunks"
                );
              } else {
                console.log("ℹ No relevant context found in documents");
              }
            } else {
              console.warn(
                "⚠ RAG server unavailable, continuing without context"
              );
            }
          } catch (error) {
            console.warn("⚠ RAG query failed:", error);
            console.log("  Continuing without document context...");
          }

          // Step 3: Send to backend chat server (same as ChatPage)
          console.log("🤖 Sending to LLM for processing...");

          // Build system prompt with context if available
          let systemPrompt =
            "Kamu adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan jawaban yang SINGKAT dan LANGSUNG KE INTI. Jangan memberikan penjelasan panjang kecuali diminta. Untuk pertanyaan sederhana, jawab dengan 1-2 kalimat saja.";

          if (ragContext) {
            systemPrompt += `\n\nGunakan informasi berikut sebagai referensi untuk menjawab pertanyaan:\n\n${ragContext}\n\nJawab berdasarkan informasi di atas jika relevan dengan pertanyaan. Jika informasi tidak cukup atau tidak relevan, jawab berdasarkan pengetahuan umum.`;
          }

          const chatMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcribedText },
          ];

          const response = await fetch(`${CHAT_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "mistral:7b",
              messages: chatMessages,
              stream: true,
            }),
          });

          if (!response.ok) {
            throw new Error("Chat server error");
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";

          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.message?.content) {
                  fullResponse += json.message.content;
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
          console.log("✅ LLM Response:", fullResponse);

          // Step 4: Send LLM response to TTS server
          console.log("🔊 Sending to TTS for speech synthesis...");
          const ttsResponse = await fetch("http://localhost:5002/synthesize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: fullResponse }),
          });

          if (!ttsResponse.ok) {
            throw new Error("TTS synthesis failed");
          }

          const ttsAudioBlob = await ttsResponse.blob();
          const audioUrl = URL.createObjectURL(ttsAudioBlob);
          console.log("✅ TTS audio generated");

          // Step 5: Play TTS audio and animate mouth
          if (audioRef.current) {
            audioRef.current.src = audioUrl;

            // Setup audio analysis for mouth animation (only once)
            if (!isAudioSetupRef.current && audioRef.current) {
              const audioContext = new AudioContext();
              const audioElement = audioRef.current;
              const source =
                audioContext.createMediaElementSource(audioElement);
              const analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              analyser.connect(audioContext.destination);

              audioContextRef.current = audioContext;
              analyserRef.current = analyser;
              isAudioSetupRef.current = true;
            }

            // Animate mouth based on TTS audio
            if (analyserRef.current) {
              const dataArray = new Uint8Array(
                analyserRef.current.frequencyBinCount
              );
              let isPlaying = true;

              const animateMouth = () => {
                if (!isPlaying || !analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);
                const sum = dataArray.reduce((a, b) => a + b, 0);
                const average = sum / dataArray.length;
                const mouthValue = Math.min(Math.max((average - 5) / 50, 0), 1);

                if (vrmViewerRef.current) {
                  vrmViewerRef.current.setExpression("aa", mouthValue);
                }

                requestAnimationFrame(animateMouth);
              };

              // Start animation when audio plays
              audioRef.current.onplay = () => {
                isPlaying = true;
                animateMouth();
              };

              // Stop animation when audio ends
              audioRef.current.onended = () => {
                isPlaying = false;
                if (vrmViewerRef.current) {
                  vrmViewerRef.current.setExpression("aa", 0);
                }
              };
            }

            audioRef.current.play();
          }
        } catch (error) {
          console.error("❌ Error in voice processing pipeline:", error);
          alert(
            "Failed to process voice. Please check if all servers are running."
          );
        }

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleUploadModel = () => {
    // Don't clear automatically - user should use "Clear 3D Model" first if needed
    fileInputRef.current?.click();
  };

  const handleAvatarSelect = async (avatarPath: string) => {
    try {
      console.log("🔄 Switching to avatar:", avatarPath);

      // Special handling for Larasdyah - navigate to GLTF viewer
      if (avatarPath === "/models/glb/Larasdyah_Character2.glb") {
        console.log("🔄 Navigating to GLTF viewer for Larasdyah model");
        router.push("/avatar-gltf");
        setShowAvatarModal(false);
        return;
      }

      setShowAvatarModal(false);

      // Clear existing model first
      if (vrmViewerRef.current) {
        vrmViewerRef.current.clearScene();
        setIsVRMLoaded(false);
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      setIsLoading(true);
      setLoadingProgress(0);

      if (vrmViewerRef.current) {
        await vrmViewerRef.current.loadVRM(avatarPath, (progress) => {
          setLoadingProgress(progress);
        });
        setIsLoading(false);
        setIsVRMLoaded(true);
        setSelectedAvatar(avatarPath);
        setHasLoadedInitially(true); // Mark as loaded to prevent useEffect from re-running

        // Update VRM data for controls
        setTimeout(() => updateVRMData(), 100);

        console.log("✅ Avatar switched successfully!");
      }
    } catch (error) {
      console.error("❌ Failed to switch avatar:", error);
      setIsLoading(false);
      setIsVRMLoaded(false);
    }
  };

  const handleViewerModeChange = (mode: string) => {
    if (mode === "gltf") {
      router.push("/avatar-gltf");
    } else {
      setViewerMode("vrm");
    }
  };

  // Update VRM data for controls
  const updateVRMData = () => {
    if (vrmViewerRef.current) {
      const newExpressions = vrmViewerRef.current.getExpressions();
      const newShapeKeys = vrmViewerRef.current.getShapeKeys();
      const newSpringBones = vrmViewerRef.current.getSpringBones();

      console.log("📊 Retrieved expressions:", newExpressions);
      console.log("📊 Retrieved shapeKeys:", newShapeKeys);
      console.log("📊 Retrieved springBones:", newSpringBones);

      setExpressions(newExpressions);
      setShapeKeys(newShapeKeys);
      setSpringBones(newSpringBones);

      console.log("✅ State updated");
    }
  };

  // VRM Control Handlers
  const handlePoseLoad = (poseData: PoseData) => {
    if (vrmViewerRef.current) {
      vrmViewerRef.current.loadPose(
        poseData as {
          name?: string;
          code?: string;
          vrmVersion?: string;
          data?: Record<string, { rotation: [number, number, number, number] }>;
        }
      );
    }
  };

  const handleBoneManipulationModeChange = (mode: "off" | "ik" | "fk") => {
    console.log("Bone manipulation mode changed to:", mode);
    if (vrmViewerRef.current) {
      vrmViewerRef.current.setBoneManipulationMode(mode);
    }
  };

  const handleExpressionChange = (name: string, value: number) => {
    if (vrmViewerRef.current) {
      vrmViewerRef.current.setExpression(name, value);
      // Update local state
      setExpressions((prev) =>
        prev.map((exp) => (exp.name === name ? { ...exp, value } : exp))
      );
    }
  };

  const handleShapeKeyChange = (name: string, value: number) => {
    if (vrmViewerRef.current) {
      vrmViewerRef.current.setShapeKey(name, value);
      // Update local state
      setShapeKeys((prev) =>
        prev.map((key) => (key.name === name ? { ...key, value } : key))
      );
    }
  };

  const handleSpringBoneSettingChange = (
    boneName: string,
    setting: string,
    value: number
  ) => {
    console.log(`Spring bone ${boneName} ${setting} changed to:`, value);
    // Spring bone settings would need to be applied via VRM spring bone manager
    // This is more advanced and may require direct access to the VRM spring bone system
  };

  const handleSavePose = (poseName: string) => {
    if (vrmViewerRef.current) {
      const poseData = vrmViewerRef.current.getCurrentPoseData();
      if (poseData) {
        poseData.name = poseName;
        console.log("Saved pose:", poseData);
        // You could save this to localStorage or a database
      }
    }
  };

  const handleAnimationPlay = async (animationUrl: string) => {
    if (vrmViewerRef.current) {
      try {
        await vrmViewerRef.current.loadAnimation(animationUrl);
        console.log("✅ Animation loaded:", animationUrl);
      } catch (error) {
        console.error("❌ Failed to load animation:", error);
      }
    }
  };

  const handleAnimationSpeedChange = (speed: number) => {
    setAnimationSpeed(speed);
    if (vrmViewerRef.current) {
      vrmViewerRef.current.setAnimationSpeed(speed);
    }
  };

  const handleResetCharacter = () => {
    if (vrmViewerRef.current) {
      // Reset character position to origin and stop animation
      vrmViewerRef.current.resetCharacterPosition();

      // Reset camera position
      vrmViewerRef.current.resetCameraPosition();

      console.log("✅ Character reset to T-pose and origin position");
    }
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith(".vrm")) {
      try {
        console.log(
          "📁 File selected:",
          file.name,
          `(${(file.size / 1024 / 1024).toFixed(2)} MB)`
        );

        // Step 1: Clear existing model first
        console.log("🧹 Clearing existing model...");
        if (vrmViewerRef.current) {
          vrmViewerRef.current.clearScene();
          setIsVRMLoaded(false);
        }

        // Step 2: Small delay to ensure cleanup is complete
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Step 3: Read file as ArrayBuffer
        console.log("📖 Reading file...");
        setIsLoading(true);
        setLoadingProgress(0);

        const arrayBuffer = await file.arrayBuffer();
        console.log("✅ File read complete, loading VRM...");

        // Step 4: Load the new model
        if (vrmViewerRef.current) {
          await vrmViewerRef.current.loadVRM(arrayBuffer, (progress) => {
            setLoadingProgress(progress);
          });
          setIsLoading(false);
          setIsVRMLoaded(true);

          // Update VRM data for controls
          setTimeout(() => updateVRMData(), 100);

          console.log("✅ VRM model loaded successfully!");
          // Reset file input after successful upload
          event.target.value = "";
        }
      } catch (error) {
        console.error("❌ Failed to load VRM file:", error);
        alert(
          "Failed to load VRM file. Please make sure it's a valid VRM model."
        );
        // Reset states on error
        setIsLoading(false);
        setIsVRMLoaded(false);
      }
    } else {
      alert("Please select a valid VRM file (.vrm extension)");
    }
  };

  // Audio permission will be requested on first record button press

  // Global error handling for debugging mobile issues
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
    // Check if mediaDevices API is available (may not be on some mobile browsers)
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("⚠️ MediaDevices API not available on this device");
      return;
    }

    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === "audioinput");

        setAudioInputs(inputs);

        if (inputs.length > 0 && !selectedInputId) {
          setSelectedInputId(inputs[0].deviceId);
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

  // Initial load: show loading overlay and progress for default model
  useEffect(() => {
    // Only load on initial mount, not when selectedAvatar changes
    if (hasLoadedInitially) return;

    let cancelled = false;
    const loadDefaultModel = async () => {
      if (vrmViewerRef.current) {
        setIsLoading(true);
        setLoadingProgress(0);
        setShowSkipButton(false);
        loadCancelledRef.current = false;

        // Start timer to show skip button after 10 seconds
        skipTimeoutRef.current = setTimeout(() => {
          if (!cancelled && !loadCancelledRef.current) {
            setShowSkipButton(true);
          }
        }, 10000);

        try {
          await vrmViewerRef.current.loadVRM(selectedAvatar, (progress) => {
            if (!cancelled && !loadCancelledRef.current) {
              setLoadingProgress(progress);
            }
          });
          if (!cancelled && !loadCancelledRef.current) {
            setIsLoading(false);
            setIsVRMLoaded(true);
            setHasLoadedInitially(true);
            setShowSkipButton(false);
            if (skipTimeoutRef.current) {
              clearTimeout(skipTimeoutRef.current);
            }

            // Update VRM data for controls
            setTimeout(() => updateVRMData(), 100);
          }
        } catch {
          if (!cancelled && !loadCancelledRef.current) {
            setIsLoading(false);
            setIsVRMLoaded(false);
            setShowSkipButton(false);
          }
        }
      }
    };
    loadDefaultModel();
    return () => {
      cancelled = true;
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Periodic blink idle animation
  useEffect(() => {
    // Don't start blinking until VRM is loaded
    if (!isVRMLoaded) return;

    const triggerBlink = () => {
      if (!vrmViewerRef.current) return;

      // Smooth blink animation with transitions
      const transitionDuration = 100; // 0.1 seconds
      const steps = 10;
      const stepDelay = transitionDuration / steps;

      // Close eyes (0 -> 1)
      let currentStep = 0;
      const closeInterval = setInterval(() => {
        currentStep++;
        const value = currentStep / steps;
        if (vrmViewerRef.current) {
          vrmViewerRef.current.setExpression("blink", value);
        }
        if (currentStep >= steps) {
          clearInterval(closeInterval);

          // Keep eyes closed briefly
          setTimeout(() => {
            // Open eyes (1 -> 0)
            let openStep = steps;
            const openInterval = setInterval(() => {
              openStep--;
              const value = openStep / steps;
              if (vrmViewerRef.current) {
                vrmViewerRef.current.setExpression("blink", value);
              }
              if (openStep <= 0) {
                clearInterval(openInterval);
              }
            }, stepDelay);
          }, 50);
        }
      }, stepDelay);
    };

    // Random blink interval between 2-4 seconds
    const scheduleNextBlink = () => {
      const delay = 2000 + Math.random() * 2000; // 2000-4000ms
      blinkIntervalRef.current = setTimeout(() => {
        triggerBlink();
        scheduleNextBlink();
      }, delay);
    };

    scheduleNextBlink();

    return () => {
      if (blinkIntervalRef.current) {
        clearTimeout(blinkIntervalRef.current);
      }
    };
  }, [isVRMLoaded]);

  return (
    <div
      className="flex flex-col w-full fixed inset-0 overflow-hidden lg:pl-64"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
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
            {showSkipButton && (
              <Button
                variant="outline"
                onClick={handleSkipLoading}
                className="mt-4"
              >
                Skip Loading
              </Button>
            )}
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

        {/* Desktop Settings Dropdown */}
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
            {/* Hide Grid and Axes Toggle */}
            <div className="flex items-center justify-between px-2 py-3 cursor-pointer hover:bg-accent rounded-sm">
              <span className="text-sm font-medium">Hide Grid & Axes</span>
              <Switch
                checked={hideGridAxes}
                onCheckedChange={setHideGridAxes}
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
                if (vrmViewerRef.current) {
                  vrmViewerRef.current.resetCameraPosition();
                }
              }}
              className="flex items-center justify-center py-3 cursor-pointer hover:bg-accent"
            >
              <span className="text-sm font-medium">Reset Camera Position</span>
            </DropdownMenuRadioItem>
            {/* Reset Character Button */}
            <DropdownMenuRadioItem
              value="reset-character"
              onClick={handleResetCharacter}
              className="flex items-center justify-center py-3 cursor-pointer hover:bg-accent"
            >
              <span className="text-sm font-medium">Reset Character</span>
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
              <span className="text-sm font-medium">Upload 3D Model (VRM)</span>
            </DropdownMenuRadioItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 w-full overflow-hidden relative">
        <VRMViewer
          ref={vrmViewerRef}
        />
        {isVRMLoaded && (
          <VRMDatGUIControl
            expressions={expressions}
            shapeKeys={shapeKeys}
            springBones={springBones}
            animationSpeed={animationSpeed}
            onExpressionChange={handleExpressionChange}
            onShapeKeyChange={handleShapeKeyChange}
            onSpringBoneSettingChange={handleSpringBoneSettingChange}
            onPoseLoad={handlePoseLoad}
            onBoneManipulationModeChange={handleBoneManipulationModeChange}
            onSavePose={handleSavePose}
            onAnimationPlay={handleAnimationPlay}
            onAnimationSpeedChange={handleAnimationSpeedChange}
          />
        )}
      </main>

      <DockMenu
        isRecording={isRecording}
        audioInputs={audioInputs}
        onToggleRecording={handleToggleRecording}
        onSelectAudioInput={setSelectedInputId}
        onNavigateHome={() => router.push("/")}
        onOpenChatPrompt={() => setShowChatPrompt((prev) => !prev)}
        onOpenAvatarModal={() => setShowAvatarModal(true)}
      />

      {/* Chat Prompt */}
      <ChatPrompt
        open={showChatPrompt}
        onClose={() => setShowChatPrompt(false)}
        onAudioGenerated={handleChatAudioGenerated}
      />

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

      <audio ref={audioRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept=".vrm"
        onChange={handleFileSelected}
        className="hidden"
      />
    </div>
  );
}
