"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check, Video } from "lucide-react";
import { getDisplayName } from "@/lib/display-name";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoGrid } from "@/components/VideoGrid";
import { MediaControls } from "@/components/MediaControls";
import { ChatDrawer } from "@/components/ChatDrawer";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [name, setName] = useState<string | null>(null);
  const [nameChecked, setNameChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    const storedName = getDisplayName();
    if (!storedName) {
      router.replace("/");
      return;
    }
    setName(storedName);
    setNameChecked(true);
  }, [router]);

  async function handleCopyLink() {
    const url = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Could not copy — select and copy the room link from the address bar.");
    }
  }

  if (!nameChecked || !name) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-8 text-center">
        <Video className="h-8 w-8 text-emerald-400" aria-hidden />
        <p className="text-sm text-[var(--muted)]">Loading room…</p>
      </div>
    );
  }

  return (
    <RoomStage
      roomId={roomId}
      displayName={name}
      copied={copied}
      copyError={copyError}
      onCopyLink={handleCopyLink}
    />
  );
}

function RoomStage({
  roomId,
  displayName,
  copied,
  copyError,
  onCopyLink,
}: {
  roomId: string;
  displayName: string;
  copied: boolean;
  copyError: string | null;
  onCopyLink: () => void;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const {
    localStream,
    remotePeers,
    mediaError,
    screenShareError,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    presentingPeerId,
    localSocketId,
    messages,
    sendChatMessage,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    leave,
  } = useWebRTC(roomId, displayName);

  const connecting = !localStream && !mediaError;

  // Unread badge: count messages from others while the drawer is closed.
  const seenCountRef = useRef(0);
  useEffect(() => {
    if (chatOpen) {
      seenCountRef.current = messages.length;
      setUnreadCount(0);
      return;
    }

    const newOnes = messages.slice(seenCountRef.current);
    const fromOthers = newOnes.filter((m) => m.senderId !== localSocketId);
    if (fromOthers.length > 0) {
      setUnreadCount((prev) => prev + fromOthers.length);
    }
    seenCountRef.current = messages.length;
  }, [messages, chatOpen, localSocketId]);

  function handleLeave() {
    leave();
    router.push("/");
  }

  function handleToggleScreenShare() {
    if (isScreenSharing) {
      void stopScreenShare();
    } else {
      void startScreenShare();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Video className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold">Pulong</p>
            <p className="truncate font-mono text-xs text-[var(--muted)]">
              {roomId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyLink}
          className="focus-ring flex shrink-0 items-center gap-2 rounded-lg border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden />
              Copy Link
            </>
          )}
        </button>
      </header>

      <main
        className={`flex flex-1 flex-col gap-3 p-4 pb-28 transition-[margin] ${
          chatOpen ? "mr-0 sm:mr-96" : ""
        }`}
      >
        {copyError && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            {copyError}
          </p>
        )}
        {mediaError && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            Camera/mic error: {mediaError}
          </p>
        )}
        {screenShareError && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            Screen share: {screenShareError}
          </p>
        )}
        {connecting && (
          <p className="rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2 text-sm text-[var(--muted)]">
            Connecting to media…
          </p>
        )}
        <VideoGrid
          localStream={localStream}
          localName={displayName}
          remotePeers={remotePeers}
          localCameraOn={isCameraOn}
          isLocalScreenSharing={isScreenSharing}
          presentingPeerId={presentingPeerId}
        />
        <p className="text-center text-xs text-[var(--muted)]">
          {remotePeers.length} other participant
          {remotePeers.length === 1 ? "" : "s"}
        </p>
      </main>

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        localSocketId={localSocketId}
        onSend={sendChatMessage}
      />

      <div className="fixed inset-x-0 bottom-0 z-10 flex justify-center p-4">
        <MediaControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
          isChatOpen={chatOpen}
          unreadCount={unreadCount}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={handleToggleScreenShare}
          onToggleChat={() => setChatOpen((open) => !open)}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}
