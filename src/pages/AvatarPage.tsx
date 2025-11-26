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

const AvatarPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentMode, setCurrentMode] = useState<"voice" | "chat">("voice");
  const [messageInput, setMessageInput] = useState("");
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [isVRMLoaded, setIsVRMLoaded] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vrmViewerRef = useRef<VRMViewerRef>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      // Setup Web Audio API for voice analysis
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start voice-driven mouth animation
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let isAnimating = true;
      const animateVoice = () => {
        if (!isAnimating) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume (0-255)
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;

        // Map volume to aa expression (0.0 - 1.0)
        // Normalize and apply threshold - adjusted sensitivity
        const mouthValue = Math.min(Math.max((average - 5) / 50, 0), 1);

        if (vrmViewerRef.current) {
          vrmViewerRef.current.setExpression("aa", mouthValue);
        }

        animationFrameRef.current = requestAnimationFrame(animateVoice);
      };
      animateVoice();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const url = URL.createObjectURL(audioBlob);

        // Stop animation first
        isAnimating = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (vrmViewerRef.current) {
          vrmViewerRef.current.setExpression("aa", 0);
        }

        // Send audio to Whisper backend for transcription
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          console.log("Sending audio to Whisper for transcription...");
          const response = await fetch("http://localhost:5001/transcribe", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            console.log("=== WHISPER TRANSCRIPTION ===");
            console.log("Text:", data.text);
            console.log("Language:", data.language);
            console.log("============================");
          } else {
            console.error("Transcription failed:", await response.text());
          }
        } catch (error) {
          console.error("Error sending audio to Whisper:", error);
        }

        // Play the recorded audio
        if (audioRef.current) {
          audioRef.current.src = url;
          if (selectedOutputId) {
            audioRef.current.setSinkId(selectedOutputId).catch((error) => {
              console.error("Error setting audio output:", error);
            });
          }
          audioRef.current.play();
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
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith(".vrm")) {
      try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        if (vrmViewerRef.current) {
          await vrmViewerRef.current.loadVRM(arrayBuffer);
          setIsVRMLoaded(true); // Mark VRM as loaded
          // Reset file input after successful upload
          event.target.value = "";
        }
      } catch (error) {
        console.error("Failed to load VRM file:", error);
        alert(
          "Failed to load VRM file. Please make sure it's a valid VRM model."
        );
      }
    } else {
      alert("Please select a valid VRM file");
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
