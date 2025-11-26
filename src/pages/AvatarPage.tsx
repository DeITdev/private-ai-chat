import { useState, useRef, useEffect } from "react";
import { VRMViewer, VRMViewerRef } from "~/components/VRMViewer";
import {
  Mic,
  AudioWaveform,
  ChevronDown,
  Settings as SettingsIcon,
  Upload,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import ollama from "ollama";

const AvatarPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentMode, setCurrentMode] = useState<"voice" | "chat">("voice");
  const [messageInput, setMessageInput] = useState("");
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [isVRMLoaded, setIsVRMLoaded] = useState(false);
  const [isModelVisible, setIsModelVisible] = useState(true);
  const [lastUploadedModel, setLastUploadedModel] = useState<ArrayBuffer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vrmViewerRef = useRef<VRMViewerRef>(null);
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isAudioSetupRef = useRef(false);

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
            if (selectedOutputId) {
              await audioRef.current
                .setSinkId(selectedOutputId)
                .catch((error) => {
                  console.error("Error setting audio output:", error);
                });
            }

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

  const clearModel = () => {
    if (vrmViewerRef.current) {
      vrmViewerRef.current.clearScene();
      setIsVRMLoaded(false);
      setIsModelVisible(false);
    }
  };

  const toggleModelVisibility = async () => {
    if (isModelVisible) {
      // Clear the model
      clearModel();
    } else {
      // Show the last uploaded model or default model
      if (vrmViewerRef.current) {
        if (lastUploadedModel) {
          // Reload the last uploaded model
          console.log("🔄 Reloading last uploaded model...");
          await vrmViewerRef.current.loadVRM(lastUploadedModel);
        } else {
          // Load default model
          console.log("🔄 Loading default model...");
          await vrmViewerRef.current.loadVRM("/Larasdyah.vrm");
        }
        setIsVRMLoaded(true);
        setIsModelVisible(true);
      }
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
        console.log("📁 File selected:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Step 1: Clear existing model first
        console.log("🧹 Clearing existing model...");
        if (vrmViewerRef.current) {
          vrmViewerRef.current.clearScene();
          setIsVRMLoaded(false);
          setIsModelVisible(false);
        }
        
        // Step 2: Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Step 3: Read file as ArrayBuffer
        console.log("📖 Reading file...");
        const arrayBuffer = await file.arrayBuffer();
        console.log("✅ File read complete, loading VRM...");
        
        // Step 4: Save the ArrayBuffer for later reloading
        setLastUploadedModel(arrayBuffer);
        
        // Step 5: Load the new model
        if (vrmViewerRef.current) {
          await vrmViewerRef.current.loadVRM(arrayBuffer);
          setIsVRMLoaded(true);
          setIsModelVisible(true);
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
        setIsVRMLoaded(false);
        setIsModelVisible(false);
      }
    } else {
      alert("Please select a valid VRM file (.vrm extension)");
    }
  };

  const handleSwitchMode = (newMode: "voice" | "chat") => {
    setCurrentMode(newMode);
  };

  const handleChatSubmit = () => {
    if (!messageInput.trim()) return;
    // TODO: Implement chat submission with avatar
    setMessageInput("");
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
        const outputs = devices.filter(
          (device) => device.kind === "audiooutput"
        );

        setAudioInputs(inputs);
        setAudioOutputs(outputs);

        if (inputs.length > 0 && !selectedInputId) {
          setSelectedInputId(inputs[0].deviceId);
        }
        if (outputs.length > 0 && !selectedOutputId) {
          setSelectedOutputId(outputs[0].deviceId);
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
  }, [selectedInputId, selectedOutputId]);

  // Check if VRM is loaded by polling
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (vrmViewerRef.current && !isVRMLoaded) {
        setIsVRMLoaded(true);
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [isVRMLoaded]);

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

            <DropdownMenuSeparator />

            {/* Clear/Show 3D Model */}
            <DropdownMenuRadioItem
              value="toggle-model"
              onClick={(e) => {
                e.preventDefault();
                toggleModelVisibility();
              }}
              className="cursor-pointer"
            >
              {isModelVisible ? "Clear 3D Model" : "Show 3D Model"}
            </DropdownMenuRadioItem>

            <DropdownMenuSeparator />

            {/* Mode Switch - Chat Mode */}
            {currentMode === "voice" && (
              <DropdownMenuRadioItem
                value="chat-mode"
                onClick={(e) => {
                  e.preventDefault();
                  handleSwitchMode("chat");
                }}
                className="cursor-pointer"
              >
                Switch to Chat Mode
              </DropdownMenuRadioItem>
            )}

            {/* Mode Switch - Voice Mode */}
            {currentMode === "chat" && (
              <DropdownMenuRadioItem
                value="voice-mode"
                onClick={(e) => {
                  e.preventDefault();
                  handleSwitchMode("voice");
                }}
                className="cursor-pointer"
              >
                Switch to Voice Mode
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className="flex-1 w-full h-full overflow-hidden">
        <VRMViewer ref={vrmViewerRef} />
      </main>
      <footer className="absolute bottom-0 left-0 right-0 p-4 z-10">
        {currentMode === "voice" && (
          <div className="max-w-3xl mx-auto flex justify-center items-center gap-4">
            {/* Speaker Selection Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-base font-semibold"
                >
                  Speaker
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Select Speaker</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={selectedOutputId}
                  onValueChange={setSelectedOutputId}
                >
                  {audioOutputs.map((device) => (
                    <DropdownMenuRadioItem
                      key={device.deviceId}
                      value={device.deviceId}
                    >
                      {device.label ||
                        `Speaker (${device.deviceId.slice(0, 5)})`}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Record Button */}
            <Button
              onClick={handleToggleRecording}
              size="unsized"
              className={`h-20 w-20 rounded-full transition-all ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  : "bg-primary hover:bg-primary/90"
              }`}
            >
              {isRecording ? (
                <AudioWaveform className="h-12 w-12" />
              ) : (
                <Mic className="h-12 w-12" />
              )}
            </Button>

            {/* Microphone Selection Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-base font-semibold"
                >
                  Microphone
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Select Microphone</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={selectedInputId}
                  onValueChange={setSelectedInputId}
                >
                  {audioInputs.map((device) => (
                    <DropdownMenuRadioItem
                      key={device.deviceId}
                      value={device.deviceId}
                    >
                      {device.label ||
                        `Microphone (${device.deviceId.slice(0, 5)})`}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {currentMode === "chat" && (
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              className="flex-1 bg-white dark:bg-slate-900 text-black dark:text-white border-2 border-slate-300 dark:border-slate-600 focus:border-primary dark:focus:border-primary resize-none"
              placeholder="Type your message to chat with the avatar..."
              rows={2}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSubmit();
                }
              }}
            />
            <Button onClick={handleChatSubmit} type="button">
              Send
            </Button>
          </div>
        )}
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
