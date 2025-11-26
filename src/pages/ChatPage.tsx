import { useLayoutEffect, useRef, useState } from "react";
import { ChatMessage } from "~/components/ChatMessage";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import ollama from "ollama";
import { ThoughtMessage } from "~/components/ThoughtMessage";
import { db } from "~/lib/dexie";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

const ChatPage = () => {
  const [messageInput, setMessageInput] = useState("");
  const [streamedMessage, setStreamedMessage] = useState("");
  const [streamedThought, setStreamedThought] = useState("");

  const scrollToBottomRef = useRef<HTMLDivElement>(null);

  const params = useParams();

  const messages = useLiveQuery(
    () => db.getMessagesForThread(params.threadId as string),
    [params.threadId]
  );

  const handleSubmit = async () => {
    if (!messageInput.trim()) return;

    await db.createMessage({
      content: messageInput,
      role: "user",
      thought: "",
      thread_id: params.threadId as string,
    });

    setMessageInput("");

    const modelName = "deepseek-r1:1.5b";

    // Try with thinking first, fallback to without thinking if unsupported
    let stream;
    let supportsThinking = true;

    try {
      stream = await ollama.chat({
        model: modelName,
        messages: [
          {
            role: "system",
            content:
              "Anda adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan penjelasan yang detail dan mudah dipahami.",
          },
          {
            role: "user",
            content: messageInput.trim(),
          },
        ],
        think: true,
        stream: true,
      });
    } catch (error) {
      // If thinking is not supported, retry without it
      if (
        error instanceof Error &&
        error.message.includes("does not support thinking")
      ) {
        console.log(
          `Model ${modelName} does not support thinking, using standard mode`
        );
        supportsThinking = false;
        stream = await ollama.chat({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "Anda adalah asisten AI yang membantu. Selalu jawab dalam Bahasa Indonesia yang sopan dan jelas. Berikan penjelasan yang detail dan mudah dipahami.",
            },
            {
              role: "user",
              content: messageInput.trim(),
            },
          ],
          stream: true,
        });
      } else {
        throw error;
      }
    }

    let fullContent = "";
    let fullThought = "";

    for await (const part of stream) {
      // Handle thinking chunks (only if model supports it)
      if (supportsThinking && part.message.thinking) {
        fullThought += part.message.thinking;
        setStreamedThought(fullThought);
      }

      // Handle content chunks
      if (part.message.content) {
        fullContent += part.message.content;
        setStreamedMessage(fullContent);
      }
    }

    await db.createMessage({
      content: fullContent,
      role: "assistant",
      thought: fullThought,
      thread_id: params.threadId as string,
    });

    setStreamedMessage("");
    setStreamedThought("");
  };

  const handleScrollToBottom = () => {
    scrollToBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useLayoutEffect(() => {
    handleScrollToBottom();
  }, [streamedMessage, streamedThought, messages]);

  return (
    <div className="flex flex-col flex-1">
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

          {!!streamedThought && <ThoughtMessage thought={streamedThought} />}

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
