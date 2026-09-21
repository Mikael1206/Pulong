"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@shared/socket-events";
import type {
  ReceiveAnswerPayload,
  ReceiveIceCandidatePayload,
  ReceiveOfferPayload,
  RoomParticipant,
  UserLeftPayload,
} from "@shared/socket-events";

// Public STUN servers for NAT traversal — no TURN relay (docs/stack-decision.md
// §5, accepted risk for a single-night, small-group build; symmetric NATs may
// fail to connect).
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

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
  toggleMic: () => void;
  toggleCamera: () => void;
  /** Stops tracks, closes peer connections, disconnects signaling. Caller navigates home. */
  leave: () => void;
}

/**
 * Establishes a full-mesh WebRTC connection with every other peer in
 * `roomId`, signaling over Socket.io. See docs/sdd.md §2-§4 for the
 * architecture and negotiation flow this implements.
 */
export function useWebRTC(
  roomId: string,
  displayName: string
): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Session handles shared between the effect and leave()/toggles.
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const teardown = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemotePeers([]);
  }, []);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMicOn(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsCameraOn(track.enabled);
  }, []);

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
    }

    function getOrCreatePeerConnection(
      socketId: string,
      activeSocket: Socket
    ): RTCPeerConnection {
      const existing = peerConnections.get(socketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
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

      localStreamRef.current = stream;
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
        (peers: RoomParticipant[]) => {
          peers.forEach((peer) => {
            displayNames.set(peer.socketId, peer.displayName);
            upsertRemotePeer({
              socketId: peer.socketId,
              displayName: peer.displayName,
            });
          });
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
    toggleMic,
    toggleCamera,
    leave,
  };
}
