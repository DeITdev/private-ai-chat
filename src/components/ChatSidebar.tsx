import { Moon, Plus, Sun, User } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  useSidebar,
} from "~/components/ui/sidebar";
import { useTheme } from "./ThemeProvider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { db } from "~/lib/dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useLocation, useNavigate } from "react-router-dom";

export const ChatSidebar = () => {
  const [activeThread, setActiveThread] = useState("");
  const [dialogIsOpen, setDialogIsOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [viewMode, setViewMode] = useState<"chat" | "avatar">("chat");

  const { setTheme, theme } = useTheme();
  const { setOpenMobile } = useSidebar();

  const location = useLocation();
  const navigate = useNavigate();

  const threads = useLiveQuery(() => db.getAllThreads(), []);

  const handleToggleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  const handleToggleViewMode = () => {
    const newMode = viewMode === "chat" ? "avatar" : "chat";
    setViewMode(newMode);

    // Navigate to avatar route or back to thread
    if (newMode === "avatar") {
      navigate("/avatar");
    } else {
      // Navigate back to the active thread or first thread
      if (activeThread) {
        navigate(`/thread/${activeThread}`);
      } else if (threads && threads.length > 0) {
        navigate(`/thread/${threads[0].id}`);
      }
    }
  };

  const handleCreateThread = async () => {
    const threadId = await db.createThread(textInput);

    setDialogIsOpen(false);
    setTextInput("");
  };

  const handleOpenDialog = () => {
    setDialogIsOpen(true);
    setOpenMobile(false); // Close the drawer when opening dialog
  };

  useLayoutEffect(() => {
    const activeThreadId = location.pathname.split("/")[2];
    setActiveThread(activeThreadId);

    // Update view mode based on current route
    if (location.pathname === "/avatar") {
      setViewMode("avatar");
    } else {
      setViewMode("chat");
    }
  }, [location.pathname]);

  return (
    <>
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
              placeholder="Your new thread title"
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
      <SidebarPrimitive>
        <SidebarHeader>
          <Button
            onClick={handleOpenDialog}
            className="w-full justify-start"
            variant="ghost"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
              <SidebarMenu>
                {threads?.map((thread) => (
                  <SidebarMenuItem key={thread.id}>
                    <Link to={`/thread/${thread.id}`}>
                      <SidebarMenuButton isActive={thread.id === activeThread}>
                        {thread.title}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Button
            onClick={handleToggleViewMode}
            variant="ghost"
            className="w-full justify-start"
          >
            <User className="h-[1.2rem] w-[1.2rem] mr-2" />
            {viewMode === "chat" ? "Show Avatar" : "Show Chat"}
          </Button>
          <Button
            onClick={handleToggleTheme}
            variant="ghost"
            className="w-full justify-start"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />{" "}
            Toggle Theme
          </Button>
        </SidebarFooter>
      </SidebarPrimitive>
    </>
  );
};
