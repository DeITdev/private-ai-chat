"use client";

import { useState, useEffect, useRef, type FormEventHandler } from "react";
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ui/shadcn-io/ai/prompt-input";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatPromptProps {
  open: boolean;
  onClose: () => void;
  onAudioGenerated?: (audioUrl: string) => void;
}

export const ChatPrompt = ({
  open,
  onClose,
  onAudioGenerated,
}: ChatPromptProps) => {
  const [text, setText] = useState("");
  const [selectedModel, setSelectedModel] = useState("mistral:7b");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch available Ollama models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("http://localhost:5004/models");
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          const modelNames = data.models.map(
            (model: { name: string }) => model.name
          );
          if (modelNames.length > 0) {
            setAvailableModels(modelNames);
            setSelectedModel(modelNames[0]);
          } else {
            // No models returned, use fallback
            setAvailableModels(["mistral:7b"]);
          }
        } else {
          // Invalid response format, use fallback
          setAvailableModels(["mistral:7b"]);
        }
      } catch (error) {
        console.warn("Failed to fetch models (backend may be offline):", error);
        // Fallback to default model - don't crash the UI
        setAvailableModels(["mistral:7b"]);
      }
    };

    if (open) {
      fetchModels();
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    setStatus("submitted");

    try {
      const userMessage = text.trim();

      // Clear input immediately for better UX
      setText("");
      setAttachments([]);

      setTimeout(() => {
        setStatus("streaming");
      }, 200);

      // Step 1: Query RAG system for relevant context
      console.log("🔍 Querying RAG system for context...");
      let ragContext = "";
      try {
        const ragResponse = await fetch("http://localhost:5003/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: userMessage }),
        });

        if (ragResponse.ok) {
          const ragData = await ragResponse.json();
          if (ragData.has_context) {
            ragContext = ragData.context;
            console.log(
              "✅ RAG Context retrieved:",
              ragData.contexts?.length || 0,
              "chunks"
            );
          } else {
            console.log("ℹ No relevant context found in documents");
          }
        } else {
          console.warn("⚠ RAG server unavailable, continuing without context");
        }
      } catch (error) {
        console.warn("⚠ RAG query failed:", error);
        console.log("  Continuing without document context...");
      }

      // Step 2: Build system prompt with context
      let systemPrompt =
        "Kamu adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan jawaban yang SINGKAT dan LANGSUNG KE INTI. Jangan memberikan penjelasan panjang kecuali diminta. Untuk pertanyaan sederhana, jawab dengan 1-2 kalimat saja.";

      if (ragContext) {
        systemPrompt += `\n\nGunakan informasi berikut sebagai referensi untuk menjawab pertanyaan:\n\n${ragContext}\n\nJawab berdasarkan informasi di atas jika relevan dengan pertanyaan. Jika informasi tidak cukup atau tidak relevan, jawab berdasarkan pengetahuan umum.`;
      }

      // Step 3: Send to backend chat server
      console.log("🤖 Sending to LLM...");
      
      const chatMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ];

      const response = await fetch("http://localhost:5004/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
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

      // Step 5: Trigger avatar to speak through callback
      if (onAudioGenerated) {
        onAudioGenerated(audioUrl);
      }

      setStatus("ready");
    } catch (error) {
      console.error("❌ Failed to process chat message:", error);
      setStatus("error");
      setTimeout(() => {
        setStatus("ready");
      }, 2000);
    }
  };

  return (
    <div
      className={`
      fixed inset-0 z-50 flex items-end justify-center pointer-events-none
      transition-opacity duration-300
      ${open ? "opacity-100" : "opacity-0 pointer-events-none"}
    `}
    >
      <div
        ref={containerRef}
        className={`
          pointer-events-auto mb-32 w-[95vw] sm:w-[500px] md:w-[600px] lg:w-[700px] lg:translate-x-32
          transition-all duration-300 ease-out
          ${open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}
        `}
      >
        <PromptInput onSubmit={handleSubmit}>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 text-sm"
                >
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(index)}
                    className="hover:bg-background rounded-sm p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <PromptInputTextarea
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setText(e.target.value)
            }
            value={text}
            placeholder="Type your message..."
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <PromptInputButton
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </PromptInputButton>
              <PromptInputModelSelect
                onValueChange={setSelectedModel}
                value={selectedModel}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {availableModels.map((model) => (
                    <PromptInputModelSelectItem key={model} value={model}>
                      {model}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                Close Chat
              </Button>
              <PromptInputSubmit disabled={!text} status={status} />
            </div>
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};
