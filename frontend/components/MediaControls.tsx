"use client";

import type { ReactNode } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
} from "lucide-react";

export interface MediaControlsProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
}

export function MediaControls({
  isMicOn,
  isCameraOn,
  isScreenSharing,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onLeave,
}: MediaControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-foreground/10 bg-zinc-900/90 px-4 py-3 shadow-lg backdrop-blur">
      <ControlButton
        label={isMicOn ? "Mute microphone" : "Unmute microphone"}
        active={isMicOn}
        onClick={onToggleMic}
      >
        {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </ControlButton>

      <ControlButton
        label={isCameraOn ? "Turn camera off" : "Turn camera on"}
        active={isCameraOn}
        onClick={onToggleCamera}
        disabled={isScreenSharing}
      >
        {isCameraOn ? (
          <Video className="h-5 w-5" />
        ) : (
          <VideoOff className="h-5 w-5" />
        )}
      </ControlButton>

      <ControlButton
        label={isScreenSharing ? "Stop sharing" : "Share screen"}
        active={!isScreenSharing}
        onClick={onToggleScreenShare}
        highlight={isScreenSharing}
      >
        {isScreenSharing ? (
          <ScreenShareOff className="h-5 w-5" />
        ) : (
          <ScreenShare className="h-5 w-5" />
        )}
      </ControlButton>

      <button
        type="button"
        onClick={onLeave}
        aria-label="Leave meeting"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}

function ControlButton({
  label,
  active,
  onClick,
  children,
  disabled = false,
  highlight = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        highlight
          ? "bg-emerald-600 text-white hover:bg-emerald-500"
          : active
            ? "bg-foreground/10 text-foreground hover:bg-foreground/20"
            : "bg-red-600/90 text-white hover:bg-red-500"
      }`}
    >
      {children}
    </button>
  );
}
