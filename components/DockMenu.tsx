import {
  Dock,
  DockIcon,
  DockItem,
  DockLabel,
} from "@/components/ui/shadcn-io/dock";
import { Mic, Home, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ChatIcon, ThreeDIcon } from "@/assets";

interface DockMenuProps {
  isRecording?: boolean;
  audioInputs?: MediaDeviceInfo[];
  onToggleRecording?: () => void;
  onSelectAudioInput?: (deviceId: string) => void;
  onNavigateHome?: () => void;
  onOpenChatPrompt?: () => void;
  onOpenAvatarModal?: () => void;
}

export const DockMenu = ({
  isRecording = false,
  audioInputs = [],
  onToggleRecording,
  onSelectAudioInput,
  onNavigateHome,
  onOpenChatPrompt,
  onOpenAvatarModal,
}: DockMenuProps) => {
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-10 flex justify-center items-end pb-4 lg:left-64">
      {/* Dock with Action Buttons */}
      <Dock magnification={100} distance={140}>
        {/* Home Button */}
        <DockItem>
          <DockLabel>Home</DockLabel>
          <DockIcon>
            <button
              onClick={onNavigateHome}
              className="h-full w-full flex items-center justify-center"
            >
              <Home className="h-full w-full text-foreground" />
            </button>
          </DockIcon>
        </DockItem>

        {/* Record Button with Microphone Selector */}
        {onToggleRecording && (
          <DockItem className={isRecording ? "animate-pulse" : ""}>
            <DockLabel>{isRecording ? "Stop" : "Record"}</DockLabel>
            <DockIcon>
              <div className="h-full w-full flex items-center justify-center relative">
                <button
                  onClick={onToggleRecording}
                  className="h-full w-full flex items-center justify-center"
                >
                  <Mic
                    className={`h-full w-full ${
                      isRecording ? "text-red-500" : "text-foreground"
                    }`}
                  />
                </button>
                {/* Microphone Selector Dropdown */}
                {audioInputs.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(50%+8px)] flex items-center justify-center hover:opacity-70">
                        <ChevronDown className="h-4 w-4 text-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {audioInputs.map((device) => (
                        <DropdownMenuRadioItem
                          key={device.deviceId}
                          value={device.deviceId}
                          onClick={() => onSelectAudioInput?.(device.deviceId)}
                        >
                          {device.label ||
                            `Microphone (${device.deviceId.slice(0, 5)})`}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </DockIcon>
          </DockItem>
        )}

        {/* Chat Button */}
        {onOpenChatPrompt && (
          <DockItem>
            <DockLabel>Chat</DockLabel>
            <DockIcon>
              <button
                onClick={onOpenChatPrompt}
                className="h-full w-full flex items-center justify-center"
              >
                <ChatIcon className="h-full w-full text-foreground" />
              </button>
            </DockIcon>
          </DockItem>
        )}

        {/* 3D Model Button */}
        {onOpenAvatarModal && (
          <DockItem>
            <DockLabel>3D Avatar</DockLabel>
            <DockIcon>
              <button
                onClick={onOpenAvatarModal}
                className="h-full w-full flex items-center justify-center"
              >
                <ThreeDIcon className="h-full w-full text-foreground" />
              </button>
            </DockIcon>
          </DockItem>
        )}
      </Dock>
    </footer>
  );
};
