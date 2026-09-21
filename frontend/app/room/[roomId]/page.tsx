"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { getDisplayName } from "@/lib/display-name";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [name, setName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedName = getDisplayName();
    if (!storedName) {
      // No display name in this session (e.g. the room URL was opened
      // directly) — send them back to the lobby instead of crashing.
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
    // Redirect is in-flight — render nothing rather than a flash of content.
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 text-center">
      <h1 className="text-2xl font-semibold">
        You&apos;re in room <span className="font-mono">{roomId}</span> as{" "}
        {name}
      </h1>
      <p className="max-w-md text-sm text-foreground/70">
        Screen sharing, mic/camera toggles, and chat land in the next build
        steps. Local and remote camera feeds below are a plain wire-check —
        the real grid UI is next.
      </p>
      <button
        type="button"
        onClick={handleCopyLink}
        className="flex items-center gap-2 rounded-lg border border-foreground/20 px-4 py-2.5 text-sm font-medium hover:bg-foreground/5"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy Link
          </>
        )}
      </button>

      <RoomVideoWireCheck roomId={roomId} displayName={name} />
    </div>
  );
}

/**
 * TASK-003 wire-check only — proves the WebRTC mesh actually connects and
 * streams. The real responsive VideoTile grid + layout is TASK-004.
 */
function RoomVideoWireCheck({
  roomId,
  displayName,
}: {
  roomId: string;
  displayName: string;
}) {
  const { localStream, remotePeers, mediaError } = useWebRTC(
    roomId,
    displayName
  );
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4">
      {mediaError && (
        <p className="text-sm text-red-500">
          Camera/mic error: {mediaError}
        </p>
      )}
      <div className="flex flex-wrap gap-4 justify-center">
        <VideoPreview
          videoRef={localVideoRef}
          label={`${displayName} (you)`}
          muted
        />
        {remotePeers.map((peer) => (
          <RemoteVideoPreview key={peer.socketId} peer={peer} />
        ))}
      </div>
      <p className="text-xs text-foreground/50">
        {remotePeers.length} other participant
        {remotePeers.length === 1 ? "" : "s"} in this room.
      </p>
    </div>
  );
}

function RemoteVideoPreview({
  peer,
}: {
  peer: { socketId: string; displayName: string; stream: MediaStream | null };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  return <VideoPreview videoRef={videoRef} label={peer.displayName} />;
}

function VideoPreview({
  videoRef,
  label,
  muted = false,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-64 h-48 rounded-lg bg-black object-cover"
      />
      <span className="text-xs text-foreground/70">{label}</span>
    </div>
  );
}
