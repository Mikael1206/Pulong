"use client";

import { useEffect, useRef } from "react";

export interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  muted?: boolean;
  isLocal?: boolean;
  /** Explicit camera-off override (local toggle); still falls back to track state. */
  cameraOff?: boolean;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hasLiveVideo(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)
  );
}

export function VideoTile({
  stream,
  displayName,
  muted = false,
  isLocal = false,
  cameraOff = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = !cameraOff && hasLiveVideo(stream);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  const label = isLocal ? `${displayName} (you)` : displayName;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-zinc-900 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`absolute inset-0 h-full w-full object-cover ${
          showVideo ? "opacity-100" : "opacity-0"
        }`}
      />
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-xl font-semibold text-foreground">
            {initialsFromName(displayName)}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <span className="text-xs font-medium text-white drop-shadow">{label}</span>
      </div>
    </div>
  );
}
