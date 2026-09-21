"use client";

import { useEffect, useState } from "react";
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

interface UseWebRTCResult {
  localStream: MediaStream | null;
  remotePeers: RemotePeer[];
  mediaError: string | null;
}

/**
 * Establishes a full-mesh WebRTC connection with every other peer in
 * `roomId`, signaling over Socket.io. See docs/sdd.md §2-§4 for the
 * architecture and negotiation flow this implements, and
 * handoff/TASK-003.md for the spec this was built against.
 *
 * All mutable state below (peer connections, pending ICE candidate queue,
 * display names) is scoped to a single effect run — it's created in
 * `setup()` and torn down in the cleanup function, so plain closure
 * variables are used instead of refs (nothing needs to survive re-renders).
 */
export function useWebRTC(
  roomId: string,
  displayName: string
): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    let socket: Socket | null = null;
    let localMediaStream: MediaStream | null = null;
    const peerConnections = new Map<string, RTCPeerConnection>();
    const displayNames = new Map<string, string>();
    // ICE candidates that arrive before setRemoteDescription has resolved
    // must be buffered and flushed afterward (trickle-ICE race).
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

      // Send our local tracks so the remote side has something to render.
      localMediaStream?.getTracks().forEach((track) => {
        pc.addTrack(track, localMediaStream as MediaStream);
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
      if (cancelled) return;

      localMediaStream = stream;
      setLocalStream(stream);

      socket = io({ path: "/socket.io" });
      const activeSocket = socket;

      activeSocket.on("connect", () => {
        activeSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId, displayName });
      });

      // We just joined — note who's already here. Per docs/sdd.md §3, we do
      // NOT initiate offers to them; each existing peer initiates its own
      // offer to us once it receives USER_JOINED below.
      activeSocket.on(
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

      // A new peer joined after us — we initiate the offer to them.
      activeSocket.on(
        SOCKET_EVENTS.USER_JOINED,
        async ({ socketId, displayName: peerName }: RoomParticipant) => {
          displayNames.set(socketId, peerName);
          upsertRemotePeer({ socketId, displayName: peerName });

          const pc = getOrCreatePeerConnection(socketId, activeSocket);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            activeSocket.emit(SOCKET_EVENTS.SEND_OFFER, {
              to: socketId,
              sdp: offer,
            });
          } catch (err) {
            console.error("[useWebRTC] failed to create/send offer", err);
          }
        }
      );

      activeSocket.on(
        SOCKET_EVENTS.RECEIVE_OFFER,
        async ({ from, sdp }: ReceiveOfferPayload) => {
          const pc = getOrCreatePeerConnection(from, activeSocket);
          try {
            await pc.setRemoteDescription(sdp);
            await flushPendingCandidates(from, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            activeSocket.emit(SOCKET_EVENTS.SEND_ANSWER, {
              to: from,
              sdp: answer,
            });
          } catch (err) {
            console.error("[useWebRTC] failed to handle offer", err);
          }
        }
      );

      activeSocket.on(
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

      activeSocket.on(
        SOCKET_EVENTS.RECEIVE_ICE_CANDIDATE,
        async ({ from, candidate }: ReceiveIceCandidatePayload) => {
          const pc = peerConnections.get(from);
          if (!pc || !pc.remoteDescription) {
            // Remote description isn't set yet — buffer for later.
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

      activeSocket.on(
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

      socket?.disconnect();
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
      pendingCandidates.clear();
      displayNames.clear();

      localMediaStream?.getTracks().forEach((track) => track.stop());
    };
  }, [roomId, displayName]);

  return { localStream, remotePeers, mediaError };
}
