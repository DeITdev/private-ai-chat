"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageSquare, User, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/dexie";
import { useSidebar } from "@/components/ui/sidebar";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [dialogIsOpen, setDialogIsOpen] = useState(false);
  const [textInput, setTextInput] = useState("");

  const handleCreateNewChat = async () => {
    setDialogIsOpen(true);
  };

  const handleCreateThread = async () => {
    try {
      const threadTitle = textInput.trim() || "New Chat";
      console.log("Creating thread with title:", threadTitle);
      const threadId = await db.createThread(threadTitle);
      console.log("Thread created with ID:", threadId);
      setDialogIsOpen(false);
      setTextInput("");
      router.push(`/thread/${threadId}`);
    } catch (error) {
      console.error("Error creating thread:", error);
      alert("Failed to create thread. Check console for details.");
    }
  };

  const handleGoToAvatar = () => {
    router.push("/avatar-vrm");
  };

  return (
    <div
      className="flex flex-col w-full"
      style={{ height: "calc(var(--vh, 1vh) * 100)" }}
    >
      {/* Create Thread Dialog */}
      <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new thread</DialogTitle>
          </DialogHeader>

          <div className="space-y-1">
            <Label htmlFor="thread-title">Thread title</Label>
            <Input
              id="thread-title"
              value={textInput}
              onChange={(e) => {
                setTextInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateThread();
                }
              }}
              placeholder="Your new thread title"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateThread}>Create Thread</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Header */}
      <header className="flex items-center justify-between px-4 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Larasdyah</h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="max-w-2xl w-full space-y-8">
          {/* Welcome Section - Hidden on mobile header, shown in content */}
          <div className="text-center space-y-2 lg:block">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Selamat Datang
            </h2>
            <p className="text-muted-foreground text-base lg:text-lg">
              Asisten AI pribadi Anda
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Chat Card */}
            <Card
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={handleCreateNewChat}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">
                    Ngobrol dengan Larasdyah
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Mulai percakapan baru dan tanyakan apa saja yang Anda
                    inginkan
                  </p>
                </div>
                <Button className="w-full" variant="default">
                  Mulai Ngobrol
                </Button>
              </div>
            </Card>

            {/* Avatar Card */}
            <Card
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={handleGoToAvatar}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Larasdyah 3D Avatar</h2>
                  <p className="text-sm text-muted-foreground">
                    Berinteraksi dengan avatar 3D menggunakan suara dan teks
                  </p>
                </div>
                <Button className="w-full" variant="default">
                  Buka Avatar
                </Button>
              </div>
            </Card>
          </div>

          {/* Footer Info */}
          <div className="text-center text-sm text-muted-foreground">
            <p>Pilih mode interaksi yang Anda inginkan untuk memulai</p>
          </div>
        </div>
      </div>
    </div>
  );
}
