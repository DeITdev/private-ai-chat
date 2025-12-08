import { useLayoutEffect, useRef, useState } from "react";
import { ChatMessage } from "~/components/ChatMessage";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { db } from "~/lib/dexie";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

// Add API URL constants
const RAG_URL = import.meta.env.VITE_RAG_URL || "http://localhost:5003";
const CHAT_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:5004";

const ChatPage = () => {
  const [messageInput, setMessageInput] = useState("");
  const [streamedMessage, setStreamedMessage] = useState("");

  const scrollToBottomRef = useRef<HTMLDivElement>(null);

  const params = useParams();

  const messages = useLiveQuery(
    () => db.getMessagesForThread(params.threadId as string),
    [params.threadId]
  );

  const handleSubmit = async () => {
    if (!messageInput.trim()) return;

    const userMessage = messageInput.trim();

    await db.createMessage({
      content: userMessage,
      role: "user",
      thought: "",
      thread_id: params.threadId as string,
    });

    setMessageInput("");

    const modelName = "mistral:7b";

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
    const history = await db.getMessagesForThread(params.threadId as string);

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
        thread_id: params.threadId as string,
      });

      setStreamedMessage("");
    } catch (error) {
      console.error("❌ Error calling Chat API:", error);
      alert("Failed to connect to chat server");
    }
  };

  const handleScrollToBottom = () => {
    scrollToBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useLayoutEffect(() => {
    handleScrollToBottom();
  }, [streamedMessage, messages]);

  return (
    <div
      className="flex flex-col flex-1"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
    >
      <header className="flex items-center px-4 h-16 border-b">
        <h1 className="text-xl font-bold ml-4">AI Chat Dashboard</h1>
      </header>
      <main className="flex-1 overflow-auto p-4 w-full">
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
      </main>
      <footer className="border-t p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            className="flex-1"
            placeholder="Type your message here..."
            rows={5}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button onClick={handleSubmit} type="button">
            Send
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default ChatPage;
