import { useState, useRef, useEffect } from "react";
import { VRMViewer, VRMViewerRef } from "~/components/VRMViewer";
import {
  Dock,
  DockIcon,
  DockItem,
  DockLabel,
} from "~/components/ui/shadcn-io/dock";
import {
  Mic,
  Settings as SettingsIcon,
  Home,
  Upload,
  ChevronDown,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import ollama from "ollama";

const AvatarPage = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [isVRMLoaded, setIsVRMLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
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

  const startRecording = async () => {
    try {
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

          // Step 3: Send transcribed text to LLM (mistral:7b) with RAG context
          console.log("🤖 Sending to LLM for processing...");

          // Build system prompt with context if available
          let systemPrompt =
            "Kamu adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan jawaban yang SINGKAT dan LANGSUNG KE INTI. Jangan memberikan penjelasan panjang kecuali diminta. Untuk pertanyaan sederhana, jawab dengan 1-2 kalimat saja.";

          if (ragContext) {
            systemPrompt += `\n\nGunakan informasi berikut sebagai referensi untuk menjawab pertanyaan:\n\n${ragContext}\n\nJawab berdasarkan informasi di atas jika relevan dengan pertanyaan. Jika informasi tidak cukup atau tidak relevan, jawab berdasarkan pengetahuan umum.`;
          }

          const stream = await ollama.chat({
            model: "mistral:7b",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: transcribedText,
              },
            ],
            stream: true,
          });

          let fullResponse = "";
          for await (const part of stream) {
            if (part.message.content) {
              fullResponse += part.message.content;
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

  // Request microphone and speaker permissions on page load
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        // Request microphone permission
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            // Stop all tracks immediately after getting permission
            stream.getTracks().forEach((track) => track.stop());
          });
        console.log("✓ Microphone permission granted");
      } catch {
        console.warn("Microphone permission denied or unavailable");
      }

      try {
        // Request speaker permission (if supported)
        if (navigator.permissions) {
          const result = await navigator.permissions.query({
            name: "speaker" as PermissionName,
          } as PermissionDescriptor);
          console.log("Speaker permission status:", result.state);
        }
      } catch {
        console.log("Speaker permission query not supported on this browser");
      }
    };

    requestPermissions();
  }, []);

  // Enumerate audio devices
  useEffect(() => {
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

    navigator.mediaDevices.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        enumerateDevices
      );
    };
  }, [selectedInputId]);

  // Initial load: show loading overlay and progress for default model
  useEffect(() => {
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
          await vrmViewerRef.current.loadVRM(
            "/models/HatsuneMikuNT.vrm",
            (progress) => {
              if (!cancelled && !loadCancelledRef.current) {
                setLoadingProgress(progress);
              }
            }
          );
          if (!cancelled && !loadCancelledRef.current) {
            setIsLoading(false);
            setIsVRMLoaded(true);
            setShowSkipButton(false);
            if (skipTimeoutRef.current) {
              clearTimeout(skipTimeoutRef.current);
            }
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
  }, []);

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
    <div className="flex flex-col flex-1 h-screen relative overflow-hidden">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
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
                onClick={handleSkipLoading}
                variant="outline"
                className="mt-4 bg-white/10 hover:bg-white/20 text-white border-white/30"
              >
                Skip...
              </Button>
            )}
          </div>
        </div>
      )}

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 h-16 border-b bg-background/80 backdrop-blur-sm z-10">
        <h1 className="text-xl font-bold">3D Avatar Viewer</h1>

        {/* Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-base font-semibold"
            >
              Settings
              <SettingsIcon className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
      <main className="flex-1 w-full overflow-hidden">
        <VRMViewer ref={vrmViewerRef} />
      </main>
      <footer className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end pb-4">
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

          {/* Record Button with Microphone Selector */}
          <DockItem className={isRecording ? "animate-pulse" : ""}>
            <DockLabel>{isRecording ? "Stop" : "Record"}</DockLabel>
            <DockIcon>
              <div className="h-full w-full flex items-center justify-center relative">
                <button
                  onClick={handleToggleRecording}
                  className="h-full w-full flex items-center justify-center"
                >
                  <Mic
                    className={`h-full w-full ${
                      isRecording ? "text-red-500" : "text-foreground"
                    }`}
                  />
                </button>
                {/* Microphone Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(50%+8px)] flex items-center justify-center hover:opacity-70">
                      <ChevronDown className="h-3 w-3 text-foreground" />
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
                onClick={() => console.log("Animation clicked")}
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
                onClick={handleUploadModel}
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
};

export default AvatarPage;
