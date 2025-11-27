import Dexie, { Table } from "dexie";

// Polyfill for crypto.randomUUID for browsers that don't support it
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Table declaration
interface DEX_Thread {
  id: string; // UUID
  title: string;
  created_at: Date;
  updated_at: Date;
}

interface DEX_Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought: string;
  created_at: Date;
  thread_id: string;
}

class ChatDB extends Dexie {
  threads!: Table<DEX_Thread>;
  messages!: Table<DEX_Message>;

  constructor() {
    super("chatdb");

    this.version(1).stores({
      threads: "id, title, created_at, updated_at",
      messages: "id, role, content, thought, created_at, thread_id",
    });

    this.threads.hook("creating", (_, obj) => {
      obj.created_at = new Date();
      obj.updated_at = new Date();
    });

    this.messages.hook("creating", (_, obj) => (obj.created_at = new Date()));
  }

  async createThread(title: string) {
    const id = generateUUID();

    await this.threads.add({
      id,
      title,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return id;
  }

  async getAllThreads() {
    return this.threads.reverse().sortBy("updated_at");
  }

  async createMessage(
    message: Pick<DEX_Message, "role" | "content" | "thread_id" | "thought">
  ) {
    const messageId = generateUUID();

    await this.transaction("rw", [this.threads, this.messages], async () => {
      await this.messages.add({
        ...message,
        id: messageId,
        created_at: new Date(),
      });

      await this.threads.update(message.thread_id, {
        updated_at: new Date(),
      });
    });

    return messageId;
  }

  async getMessagesForThread(threadId: string) {
    return this.messages
      .where("thread_id")
      .equals(threadId)
      .sortBy("created_at");
  }
}

export const db = new ChatDB();
