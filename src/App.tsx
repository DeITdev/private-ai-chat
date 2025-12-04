import { useState } from "react";
import { ChatSidebar } from "~/components/ChatSidebar";
import { SidebarProvider } from "~/components/ui/sidebar";
import { Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import AvatarVRMPage from "./pages/AvatarVRMPage";
import AvatarGLTFPage from "./pages/AvatarGLTFPage";
import HomePage from "./pages/HomePage";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="flex h-screen bg-background w-full">
        <ChatSidebar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/thread/:threadId" element={<ChatPage />} />
          <Route path="/avatar-vrm" element={<AvatarVRMPage />} />
          <Route path="/avatar-gltf" element={<AvatarGLTFPage />} />
        </Routes>
      </div>
    </SidebarProvider>
  );
}
