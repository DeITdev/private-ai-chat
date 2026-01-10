"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEventHandler,
} from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { db } from "@/lib/dexie";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
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
import { Paperclip, X, Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Add API URL constants (using Next.js env vars)
const RAG_URL = process.env.NEXT_PUBLIC_RAG_URL || "http://localhost:5003";
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL || "http://localhost:5004";

export default function ChatPage() {
  const [messageInput, setMessageInput] = useState("");
  const [streamedMessage, setStreamedMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState("mistral:7b");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const params = useParams();
  const { toggleSidebar } = useSidebar();

  const threadId = params.threadId as string;

  const messages = useLiveQuery(
    () => db.getMessagesForThread(threadId),
    [threadId]
  );

  // Fetch available Ollama models
  useLayoutEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${CHAT_URL}/models`);
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
            setAvailableModels(["mistral:7b"]);
          }
        } else {
          setAvailableModels(["mistral:7b"]);
        }
      } catch (error) {
        console.warn("Failed to fetch models (backend may be offline):", error);
        setAvailableModels(["mistral:7b"]);
      }
    };

    fetchModels();
  }, []);

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
    if (!messageInput.trim()) return;

    setStatus("submitted");

    const userMessage = messageInput.trim();

    await db.createMessage({
      content: userMessage,
      role: "user",
      thought: "",
      thread_id: threadId,
    });

    setMessageInput("");
    setAttachments([]);

    setTimeout(() => {
      setStatus("streaming");
    }, 200);

    const modelName = selectedModel;

    // Query RAG system for relevant context
    console.log("🔍 Querying RAG system for context...");
    let ragContext = "";
    try {
      const ragResponse = await fetch(`${RAG_URL}/query`, {
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
            ragData.contexts.length,
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

    // Get conversation history
    const history = await db.getMessagesForThread(threadId);

    // Build system prompt with context if available
    let systemPrompt =
      "Kamu adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan jawaban yang SINGKAT dan LANGSUNG KE INTI. Jangan memberikan penjelasan panjang kecuali diminta. Untuk pertanyaan sederhana, jawab dengan 1-2 kalimat saja.";

    if (ragContext) {
      systemPrompt += `\n\nGunakan informasi berikut sebagai referensi untuk menjawab pertanyaan:\n\n${ragContext}\n\nJawab berdasarkan informasi di atas jika relevan dengan pertanyaan. Jika informasi tidak cukup atau tidak relevan, jawab berdasarkan pengetahuan umum.`;
    }

    // Build messages array with conversation history
    const chatMessages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ];

    try {
      // Send to backend chat server (which proxies to Ollama)
      const response = await fetch(`${CHAT_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: chatMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat server error");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              fullContent += json.message.content;
              setStreamedMessage(fullContent);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      await db.createMessage({
        content: fullContent,
        role: "assistant",
        thought: "",
        thread_id: threadId,
      });

      setStreamedMessage("");
      setStatus("ready");
    } catch (error) {
      console.error("❌ Error calling Chat API:", error);
      setStatus("error");
      alert("Failed to connect to chat server");
    }
  };

  const handleScrollToBottom = () => {
    scrollToBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useLayoutEffect(() => {
    handleScrollToBottom();
  }, [streamedMessage, messages]);

  // Handle scroll for header border visibility
  useLayoutEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    const handleScroll = () => {
      setIsScrolled(mainElement.scrollTop > 0);
    };

    mainElement.addEventListener("scroll", handleScroll);
    return () => mainElement.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className="flex flex-col flex-1"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
    >
      <main ref={mainRef} className="flex-1 overflow-auto w-full">
        <header
          className={`sticky top-0 flex items-center px-4 h-16 z-10 transition-colors bg-background 2xl:bg-transparent 2xl:border-none ${
            isScrolled ? "border-b" : ""
          }`}
        >
          <div className="flex items-center gap-2 lg:gap-2 w-full lg:w-auto">
            {/* Mobile Hamburger Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-bold absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0">
              AI Chat Dashboard
            </h1>
          </div>

          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto lg:w-auto lg:px-3"
              >
                <Settings className="h-5 w-5" />
                <span className="hidden lg:inline ml-2">Settings</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>Export Chat History</DropdownMenuItem>
              <DropdownMenuItem>Clear Conversation</DropdownMenuItem>
              <DropdownMenuItem>Chat Preferences</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="p-4">
          <div className="mx-auto space-y-4 pb-20 max-w-screen-md">
            {messages?.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
                thought={message.thought}
              />
            ))}

            {!!streamedMessage && (
              <ChatMessage role="assistant" content={streamedMessage} />
            )}

            <div ref={scrollToBottomRef}></div>
          </div>
        </div>
      </main>
      <footer className="p-4">
        <div className="max-w-3xl mx-auto">
          <PromptInput onSubmit={handleSubmit}>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3">
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
                setMessageInput(e.target.value)
              }
              value={messageInput}
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
              <PromptInputSubmit disabled={!messageInput} status={status} />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </footer>
    </div>
  );
}
