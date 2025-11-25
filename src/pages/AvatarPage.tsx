import { useState, useRef, useEffect } from "react";
import { VRMViewer, VRMViewerRef } from "~/components/VRMViewer";
import { Mic, AudioWaveform } from "lucide-react";
import { Button } from "~/components/ui/button";

const AvatarPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vrmViewerRef = useRef<VRMViewerRef>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

        console.log("Voice volume:", average, "Mouth value:", mouthValue);

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

      mediaRecorder.onstop = () => {
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

        // Play the recorded audio
        if (audioRef.current) {
          audioRef.current.src = url;
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

  // Periodic blink idle animation
  useEffect(() => {
    const triggerBlink = () => {
      if (vrmViewerRef.current) {
        // Blink: close eyes quickly
        vrmViewerRef.current.setExpression("blink", 1.0);

        // Open eyes after 150ms
        setTimeout(() => {
          if (vrmViewerRef.current) {
            vrmViewerRef.current.setExpression("blink", 0);
          }
        }, 150);
      }
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
  }, []);

  return (
    <div className="flex flex-col flex-1 h-screen relative">
      <header className="absolute top-0 left-0 right-0 flex items-center px-4 h-16 border-b bg-background/80 backdrop-blur-sm z-10">
        <h1 className="text-xl font-bold ml-4">3D Avatar Viewer</h1>
      </header>
      <main className="flex-1 w-full h-full">
        <VRMViewer ref={vrmViewerRef} />
      </main>
      <footer className="absolute bottom-0 left-0 right-0 border-t p-4 bg-background/80 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto flex justify-center items-center">
          <Button
            onClick={handleToggleRecording}
            className={`h-20 w-20 rounded-full transition-all ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                : "bg-primary hover:bg-primary/90"
            }`}
            size="icon"
          >
            {isRecording ? (
              <AudioWaveform className="h-10 w-10" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </Button>
        </div>
      </footer>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default AvatarPage;
