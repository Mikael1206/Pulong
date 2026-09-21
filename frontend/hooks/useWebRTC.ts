"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@shared/socket-events";
import type {
  ExistingPeersPayload,
  ReceiveAnswerPayload,
  ReceiveIceCandidatePayload,
  ReceiveOfferPayload,
  RoomParticipant,
  ScreenSharePayload,
  UserLeftPayload,
} from "@shared/socket-events";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

/** Sentinel for local user as presenter in UI state. */
export const LOCAL_PRESENTER_ID = "local";

export interface RemotePeer {
  socketId: string;
  displayName: string;
  stream: MediaStream | null;
}

export interface UseWebRTCResult {
  localStream: MediaStream | null;
  remotePeers: RemotePeer[];
  mediaError: string | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  /** `LOCAL_PRESENTER_ID`, a remote socketId, or null. */
  presentingPeerId: string | null;
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  leave: () => void;
}

export function useWebRTC(
  roomId: string,
  displayName: string
): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [presentingPeerId, setPresentingPeerId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const isScreenSharingRef = useRef(false);

  const buildPreviewStream = useCallback((videoTrack: MediaStreamTrack | null) => {
    const audioTracks = cameraStreamRef.current?.getAudioTracks() ?? [];
    const tracks: MediaStreamTrack[] = [...audioTracks];
    if (videoTrack) tracks.unshift(videoTrack);
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, []);

  const replaceOutboundVideo = useCallback(async (track: MediaStreamTrack | null) => {
    const replacements = Array.from(peerConnectionsRef.current.values()).map(
      async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(track);
        }
      }
    );
    await Promise.all(replacements);
  }, []);

  const stopScreenShareInternal = useCallback(async () => {
    const screenStream = screenStreamRef.current;
    screenStreamRef.current = null;
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);

    screenStream?.getTracks().forEach((track) => track.stop());

    const cameraVideo =
      cameraStreamRef.current?.getVideoTracks().find(
        (t) => t.readyState === "live"
      ) ?? null;

    await replaceOutboundVideo(cameraVideo);
    setLocalStream(buildPreviewStream(cameraVideo));

    socketRef.current?.emit(SOCKET_EVENTS.STOP_SCREEN_SHARE);
    setPresentingPeerId((prev) =>
      prev === LOCAL_PRESENTER_ID ? null : prev
    );
  }, [buildPreviewStream, replaceOutboundVideo]);

  const teardown = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    isScreenSharingRef.current = false;

    socketRef.current?.disconnect();
    socketRef.current = null;

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    setLocalStream(null);
    setRemotePeers([]);
    setIsScreenSharing(false);
    setPresentingPeerId(null);
  }, []);

  const toggleMic = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMicOn(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    if (isScreenSharingRef.current) return;
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsCameraOn(track.enabled);
  }, []);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }

      screenStreamRef.current = screenStream;
      isScreenSharingRef.current = true;
      setIsScreenSharing(true);
      setPresentingPeerId(LOCAL_PRESENTER_ID);

      await replaceOutboundVideo(screenTrack);
      setLocalStream(buildPreviewStream(screenTrack));

      socketRef.current?.emit(SOCKET_EVENTS.START_SCREEN_SHARE);

      screenTrack.onended = () => {
        void stopScreenShareInternal();
      };
    } catch (err) {
      // User cancelled the picker — not an error to surface loudly.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return;
      }
      console.error("[useWebRTC] screen share failed", err);
      setMediaError(
        err instanceof Error ? err.message : "Screen share failed."
      );
    }
  }, [buildPreviewStream, replaceOutboundVideo, stopScreenShareInternal]);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharingRef.current) return;
    await stopScreenShareInternal();
  }, [stopScreenShareInternal]);

  const leave = useCallback(() => {
    teardown();
  }, [teardown]);

  useEffect(() => {
    let cancelled = false;

    const peerConnections = peerConnectionsRef.current;
    const displayNames = new Map<string, string>();
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

    function upsertRemotePeer(
      update: Partial<RemotePeer> & { socketId: string }
    ) {
      setRemotePeers((prev) => {
        const existingIndex = prev.findIndex(
          (p) => p.socketId === update.socketId
        );
        if (existingIndex === -1) {
          return [
            ...prev,
            {
              socketId: update.socketId,
              displayName: update.displayName ?? "Guest Participant",
              stream: update.stream ?? null,
            },
          ];
        }
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...update };
        return next;
      });
    }

    function removeRemotePeer(socketId: string) {
      setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
      setPresentingPeerId((prev) => (prev === socketId ? null : prev));
    }

    function currentOutboundTracks(): MediaStreamTrack[] {
      const audio = cameraStreamRef.current?.getAudioTracks() ?? [];
      const screenVideo = screenStreamRef.current?.getVideoTracks()[0];
      const cameraVideo = cameraStreamRef.current?.getVideoTracks()[0];
      const video = screenVideo ?? cameraVideo;
      return video ? [video, ...audio] : [...audio];
    }

    function getOrCreatePeerConnection(
      socketId: string,
      activeSocket: Socket
    ): RTCPeerConnection {
      const existing = peerConnections.get(socketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);

      currentOutboundTracks().forEach((track) => {
        const stream =
          screenStreamRef.current && track.kind === "video"
            ? screenStreamRef.current
            : cameraStreamRef.current;
        if (stream) pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          activeSocket.emit(SOCKET_EVENTS.SEND_ICE_CANDIDATE, {
            to: socketId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        upsertRemotePeer({
          socketId,
          displayName: displayNames.get(socketId),
          stream: event.streams[0] ?? null,
        });
      };

      peerConnections.set(socketId, pc);
      return pc;
    }

    async function flushPendingCandidates(
      socketId: string,
      pc: RTCPeerConnection
    ) {
      const queued = pendingCandidates.get(socketId);
      if (!queued || queued.length === 0) return;
      pendingCandidates.delete(socketId);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.error("[useWebRTC] failed to add queued ICE candidate", err);
        }
      }
    }

    async function acquireLocalMedia(): Promise<MediaStream | null> {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch {
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          setMediaError(
            err instanceof Error
              ? err.message
              : "Camera/microphone access was denied."
          );
          return null;
        }
      }
    }

    async function setup() {
      const stream = await acquireLocalMedia();
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStreamRef.current = stream;
      setLocalStream(stream);
      setIsMicOn(Boolean(stream?.getAudioTracks().some((t) => t.enabled)));
      setIsCameraOn(Boolean(stream?.getVideoTracks().some((t) => t.enabled)));

      const socket = io({ path: "/socket.io" });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId, displayName });
      });

      socket.on(
        SOCKET_EVENTS.EXISTING_PEERS,
        ({ peers, presentingSocketId }: ExistingPeersPayload) => {
          peers.forEach((peer) => {
            displayNames.set(peer.socketId, peer.displayName);
            upsertRemotePeer({
              socketId: peer.socketId,
              displayName: peer.displayName,
            });
          });
          if (presentingSocketId) {
            setPresentingPeerId(presentingSocketId);
          }
        }
      );

      socket.on(
        SOCKET_EVENTS.USER_JOINED,
        async ({ socketId, displayName: peerName }: RoomParticipant) => {
          displayNames.set(socketId, peerName);
          upsertRemotePeer({ socketId, displayName: peerName });

          const pc = getOrCreatePeerConnection(socketId, socket);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit(SOCKET_EVENTS.SEND_OFFER, {
              to: socketId,
              sdp: offer,
            });
          } catch (err) {
            console.error("[useWebRTC] failed to create/send offer", err);
          }
        }
      );

      socket.on(
        SOCKET_EVENTS.RECEIVE_OFFER,
        async ({ from, sdp }: ReceiveOfferPayload) => {
          const pc = getOrCreatePeerConnection(from, socket);
          try {
            await pc.setRemoteDescription(sdp);
            await flushPendingCandidates(from, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit(SOCKET_EVENTS.SEND_ANSWER, {
              to: from,
              sdp: answer,
            });
          } catch (err) {
            console.error("[useWebRTC] failed to handle offer", err);
          }
        }
      );

      socket.on(
        SOCKET_EVENTS.RECEIVE_ANSWER,
        async ({ from, sdp }: ReceiveAnswerPayload) => {
          const pc = peerConnections.get(from);
          if (!pc) return;
          try {
            await pc.setRemoteDescription(sdp);
            await flushPendingCandidates(from, pc);
          } catch (err) {
            console.error("[useWebRTC] failed to handle answer", err);
          }
        }
      );

      socket.on(
        SOCKET_EVENTS.RECEIVE_ICE_CANDIDATE,
        async ({ from, candidate }: ReceiveIceCandidatePayload) => {
          const pc = peerConnections.get(from);
          if (!pc || !pc.remoteDescription) {
            const queue = pendingCandidates.get(from) ?? [];
            queue.push(candidate);
            pendingCandidates.set(from, queue);
            return;
          }
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error("[useWebRTC] failed to add ICE candidate", err);
          }
        }
      );

      socket.on(
        SOCKET_EVENTS.START_SCREEN_SHARE,
        ({ socketId }: ScreenSharePayload) => {
          setPresentingPeerId(socketId);
        }
      );

      socket.on(
        SOCKET_EVENTS.STOP_SCREEN_SHARE,
        ({ socketId }: ScreenSharePayload) => {
          setPresentingPeerId((prev) => (prev === socketId ? null : prev));
        }
      );

      socket.on(
        SOCKET_EVENTS.USER_LEFT,
        ({ socketId }: UserLeftPayload) => {
          const pc = peerConnections.get(socketId);
          pc?.close();
          peerConnections.delete(socketId);
          pendingCandidates.delete(socketId);
          displayNames.delete(socketId);
          removeRemotePeer(socketId);
        }
      );
    }

    setup();

    return () => {
      cancelled = true;
      teardown();
      pendingCandidates.clear();
      displayNames.clear();
    };
  }, [roomId, displayName, teardown]);

  return {
    localStream,
    remotePeers,
    mediaError,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    presentingPeerId,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    leave,
  };
}
