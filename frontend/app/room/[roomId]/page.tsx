"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check, Video } from "lucide-react";
import { getDisplayName } from "@/lib/display-name";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoGrid } from "@/components/VideoGrid";
import { MediaControls } from "@/components/MediaControls";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [name, setName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedName = getDisplayName();
    if (!storedName) {
      router.replace("/");
      return;
    }
    setName(storedName);
  }, [router]);

  async function handleCopyLink() {
    const url = `${window.location.origin}/room/${roomId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!name) {
    return null;
  }

  return (
    <RoomStage
      roomId={roomId}
      displayName={name}
      copied={copied}
      onCopyLink={handleCopyLink}
    />
  );
}

function RoomStage({
  roomId,
  displayName,
  copied,
  onCopyLink,
}: {
  roomId: string;
  displayName: string;
  copied: boolean;
  onCopyLink: () => void;
}) {
  const router = useRouter();
  const {
    localStream,
    remotePeers,
    mediaError,
    isMicOn,
    isCameraOn,
    toggleMic,
    toggleCamera,
    leave,
  } = useWebRTC(roomId, displayName);

  function handleLeave() {
    leave();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Video className="h-5 w-5 shrink-0" />
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold">Pulong</p>
            <p className="truncate font-mono text-xs text-foreground/60">
              {roomId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyLink}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Link
            </>
          )}
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-4 pb-28">
        {mediaError && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            Camera/mic error: {mediaError}
          </p>
        )}
        <VideoGrid
          localStream={localStream}
          localName={displayName}
          remotePeers={remotePeers}
          localCameraOn={isCameraOn}
        />
        <p className="text-center text-xs text-foreground/50">
          {remotePeers.length} other participant
          {remotePeers.length === 1 ? "" : "s"}
        </p>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 flex justify-center p-4">
        <MediaControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}
