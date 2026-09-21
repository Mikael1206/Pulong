"use client";

import type { RemotePeer } from "@/hooks/useWebRTC";
import { VideoTile } from "@/components/VideoTile";

interface VideoGridProps {
  localStream: MediaStream | null;
  localName: string;
  remotePeers: RemotePeer[];
}

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-3xl mx-auto";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

export function VideoGrid({
  localStream,
  localName,
  remotePeers,
}: VideoGridProps) {
  const count = 1 + remotePeers.length;

  return (
    <div className={`grid w-full gap-3 ${gridClass(count)}`}>
      <VideoTile
        stream={localStream}
        displayName={localName}
        muted
        isLocal
      />
      {remotePeers.map((peer) => (
        <VideoTile
          key={peer.socketId}
          stream={peer.stream}
          displayName={peer.displayName}
        />
      ))}
    </div>
  );
}
