"use client";

import type { ReactNode } from "react";
import type { RemotePeer } from "@/hooks/useWebRTC";
import { LOCAL_PRESENTER_ID } from "@/hooks/useWebRTC";
import { VideoTile } from "@/components/VideoTile";

interface VideoGridProps {
  localStream: MediaStream | null;
  localName: string;
  remotePeers: RemotePeer[];
  localCameraOn?: boolean;
  isLocalScreenSharing?: boolean;
  presentingPeerId: string | null;
}

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-3xl mx-auto";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 9) return "grid-cols-2 sm:grid-cols-3";
  if (count <= 16) return "grid-cols-3 sm:grid-cols-4";
  if (count <= 36) return "grid-cols-4 sm:grid-cols-6";
  // Webinar / block-class density (60–100+)
  return "grid-cols-5 sm:grid-cols-8 lg:grid-cols-10";
}

export function VideoGrid({
  localStream,
  localName,
  remotePeers,
  localCameraOn = true,
  isLocalScreenSharing = false,
  presentingPeerId,
}: VideoGridProps) {
  const localTile = (
    <VideoTile
      key={`local-${localCameraOn ? "on" : "off"}-${isLocalScreenSharing ? "share" : "cam"}`}
      stream={localStream}
      displayName={localName}
      muted
      isLocal
      cameraOff={!localCameraOn && !isLocalScreenSharing}
      isPresenting={presentingPeerId === LOCAL_PRESENTER_ID}
    />
  );

  const remoteTiles = remotePeers.map((peer) => (
    <VideoTile
      key={peer.socketId}
      stream={peer.stream}
      displayName={peer.displayName}
      isPresenting={presentingPeerId === peer.socketId}
    />
  ));

  if (!presentingPeerId) {
    const count = 1 + remotePeers.length;
    return (
      <div className={`grid w-full gap-3 ${gridClass(count)}`}>
        {localTile}
        {remoteTiles}
      </div>
    );
  }

  // Presenter stage: large focal tile + filmstrip of everyone else.
  let stage: ReactNode = null;
  const filmstrip: ReactNode[] = [];

  if (presentingPeerId === LOCAL_PRESENTER_ID) {
    stage = (
      <VideoTile
        key="stage-local"
        stream={localStream}
        displayName={localName}
        muted
        isLocal
        isPresenting
      />
    );
    remotePeers.forEach((peer) => {
      filmstrip.push(
        <VideoTile
          key={`strip-${peer.socketId}`}
          stream={peer.stream}
          displayName={peer.displayName}
        />
      );
    });
  } else {
    const presenter = remotePeers.find((p) => p.socketId === presentingPeerId);
    if (presenter) {
      stage = (
        <VideoTile
          key={`stage-${presenter.socketId}`}
          stream={presenter.stream}
          displayName={presenter.displayName}
          isPresenting
        />
      );
    }
    filmstrip.push(
      <VideoTile
        key="strip-local"
        stream={localStream}
        displayName={localName}
        muted
        isLocal
        cameraOff={!localCameraOn && !isLocalScreenSharing}
      />
    );
    remotePeers
      .filter((p) => p.socketId !== presentingPeerId)
      .forEach((peer) => {
        filmstrip.push(
          <VideoTile
            key={`strip-${peer.socketId}`}
            stream={peer.stream}
            displayName={peer.displayName}
          />
        );
      });
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="w-full max-w-5xl mx-auto">{stage}</div>
      {filmstrip.length > 0 && (
        <div className="grid max-h-48 w-full grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {filmstrip}
        </div>
      )}
    </div>
  );
}
