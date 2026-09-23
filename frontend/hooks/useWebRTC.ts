"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Device, types as MsTypes } from "mediasoup-client";
import { SOCKET_EVENTS } from "@shared/socket-events";
import type {
  ChatMessage,
  ProducerInfo,
  RoomParticipant,
  ScreenSharePayload,
  UserLeftPayload,
} from "@shared/socket-events";

export type { ChatMessage };

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
  screenShareError: string | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  presentingPeerId: string | null;
  localSocketId: string | null;
  messages: ChatMessage[];
  sendChatMessage: (text: string) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  leave: () => void;
}

type Ack<T> = T & { ok: boolean; error?: string };

type ConsumerMeta = {
  consumer: MsTypes.Consumer;
  socketId: string;
  source: string;
  kind: "audio" | "video";
};

/**
 * mediasoup SFU client (ADR-003). Each peer publishes to / consumes from the
 * server — scales to 100+ classroom participants unlike mesh WebRTC.
 */
export function useWebRTC(
  roomId: string,
  displayName: string
): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [presentingPeerId, setPresentingPeerId] = useState<string | null>(null);
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<MsTypes.Transport | null>(null);
  const recvTransportRef = useRef<MsTypes.Transport | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<MsTypes.Producer | null>(null);
  const cameraProducerRef = useRef<MsTypes.Producer | null>(null);
  const screenProducerRef = useRef<MsTypes.Producer | null>(null);
  const consumersRef = useRef<Map<string, ConsumerMeta>>(new Map());
  const remoteStreamsRef = useRef<
    Map<string, { displayName: string; stream: MediaStream }>
  >(new Map());
  const isScreenSharingRef = useRef(false);
  const isCameraOnRef = useRef(true);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const publishRemotePeers = useCallback(() => {
    const list: RemotePeer[] = [];
    remoteStreamsRef.current.forEach((value, socketId) => {
      list.push({
        socketId,
        displayName: value.displayName,
        stream: value.stream,
      });
    });
    setRemotePeers(list);
  }, []);

  const rebuildPeerStream = useCallback(
    (socketId: string, displayNameHint?: string) => {
      let entry = remoteStreamsRef.current.get(socketId);
      if (!entry) {
        entry = {
          displayName: displayNameHint || "Guest",
          stream: new MediaStream(),
        };
        remoteStreamsRef.current.set(socketId, entry);
      } else if (displayNameHint) {
        entry.displayName = displayNameHint;
      }

      const tracks: MediaStreamTrack[] = [];
      let screenTrack: MediaStreamTrack | null = null;
      let cameraTrack: MediaStreamTrack | null = null;

      for (const meta of consumersRef.current.values()) {
        if (meta.socketId !== socketId) continue;
        if (meta.kind === "audio") {
          tracks.push(meta.consumer.track);
        } else if (meta.source === "screen") {
          screenTrack = meta.consumer.track;
        } else {
          cameraTrack = meta.consumer.track;
        }
      }

      // Prefer screen share over camera for the single video element.
      if (screenTrack) tracks.push(screenTrack);
      else if (cameraTrack) tracks.push(cameraTrack);

      entry.stream = new MediaStream(tracks);
      publishRemotePeers();
    },
    [publishRemotePeers]
  );

  const ensureRemotePeer = useCallback(
    (socketId: string, name: string) => {
      if (!remoteStreamsRef.current.has(socketId)) {
        remoteStreamsRef.current.set(socketId, {
          displayName: name,
          stream: new MediaStream(),
        });
        publishRemotePeers();
      } else if (name) {
        const entry = remoteStreamsRef.current.get(socketId)!;
        entry.displayName = name;
        publishRemotePeers();
      }
    },
    [publishRemotePeers]
  );

  const teardown = useCallback(() => {
    consumersRef.current.forEach(({ consumer }) => {
      try {
        consumer.close();
      } catch {
        /* ignore */
      }
    });
    consumersRef.current.clear();

    for (const producer of [
      audioProducerRef.current,
      cameraProducerRef.current,
      screenProducerRef.current,
    ]) {
      try {
        producer?.close();
      } catch {
        /* ignore */
      }
    }
    audioProducerRef.current = null;
    cameraProducerRef.current = null;
    screenProducerRef.current = null;

    try {
      sendTransportRef.current?.close();
    } catch {
      /* ignore */
    }
    try {
      recvTransportRef.current?.close();
    } catch {
      /* ignore */
    }
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    isScreenSharingRef.current = false;

    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;

    socketRef.current?.disconnect();
    socketRef.current = null;

    remoteStreamsRef.current.clear();
    setLocalStream(null);
    setRemotePeers([]);
    setIsScreenSharing(false);
    setPresentingPeerId(null);
    setLocalSocketId(null);
    setMessages([]);
  }, []);

  const request = useCallback(
    <T,>(event: string, data: unknown): Promise<Ack<T>> => {
      const socket = socketRef.current;
      if (!socket) return Promise.reject(new Error("No socket"));
      return new Promise((resolve, reject) => {
        socket
          .timeout(15000)
          .emit(event, data, (err: Error | null, res: Ack<T>) => {
            if (err) reject(err);
            else resolve(res);
          });
      });
    },
    []
  );

  const consumeProducer = useCallback(
    async (info: ProducerInfo) => {
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      const socket = socketRef.current;
      if (!device || !recvTransport || !socket) return;
      if (info.socketId === socket.id) return;

      // Skip duplicate consume of same producer
      for (const meta of consumersRef.current.values()) {
        if (meta.consumer.producerId === info.producerId) return;
      }

      const res = await request<{
        id: string;
        producerId: string;
        kind: "audio" | "video";
        rtpParameters: MsTypes.RtpParameters;
        socketId: string;
        displayName: string;
        source: string;
      }>(SOCKET_EVENTS.CONSUME, {
        roomId: roomIdRef.current,
        transportId: recvTransport.id,
        producerId: info.producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      if (!res.ok) {
        console.error("[consume]", res.error);
        return;
      }

      const consumer = await recvTransport.consume({
        id: res.id,
        producerId: res.producerId,
        kind: res.kind,
        rtpParameters: res.rtpParameters,
      });

      const ownerId = res.socketId || info.socketId;
      consumersRef.current.set(consumer.id, {
        consumer,
        socketId: ownerId,
        source: res.source || info.source,
        kind: res.kind,
      });

      rebuildPeerStream(ownerId, res.displayName || info.displayName);

      await request(SOCKET_EVENTS.RESUME_CONSUMER, {
        roomId: roomIdRef.current,
        consumerId: consumer.id,
      });
    },
    [rebuildPeerStream, request]
  );

  const toggleMic = useCallback(() => {
    const producer = audioProducerRef.current;
    const track = cameraStreamRef.current?.getAudioTracks()[0];
    if (producer) {
      if (producer.paused) {
        void producer.resume();
        if (track) track.enabled = true;
        setIsMicOn(true);
      } else {
        void producer.pause();
        if (track) track.enabled = false;
        setIsMicOn(false);
      }
      return;
    }
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMicOn(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    if (isScreenSharingRef.current) return;
    const producer = cameraProducerRef.current;
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (producer) {
      if (producer.paused) {
        void producer.resume();
        if (track) track.enabled = true;
        isCameraOnRef.current = true;
        setIsCameraOn(true);
      } else {
        void producer.pause();
        if (track) track.enabled = false;
        isCameraOnRef.current = false;
        setIsCameraOn(false);
      }
      return;
    }
    if (!track) return;
    track.enabled = !track.enabled;
    isCameraOnRef.current = track.enabled;
    setIsCameraOn(track.enabled);
  }, []);

  const stopScreenShareInternal = useCallback(async () => {
    const producer = screenProducerRef.current;
    screenProducerRef.current = null;
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    if (producer) {
      try {
        producer.close();
      } catch {
        /* ignore */
      }
    }

    socketRef.current?.emit(SOCKET_EVENTS.STOP_SCREEN_SHARE);

    const cam = cameraStreamRef.current;
    setLocalStream(cam);
    setPresentingPeerId((prev) =>
      prev === LOCAL_PRESENTER_ID ? null : prev
    );
  }, []);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setScreenShareError(
        "Screen sharing is not available in this browser. Try Chrome or Edge."
      );
      return;
    }

    let screenStream: MediaStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") return;
      if (name === "NotSupportedError") {
        setScreenShareError(
          "Screen sharing is not supported here (common on some Firefox/Linux setups). Try Google Chrome."
        );
        return;
      }
      setScreenShareError(
        err instanceof Error ? err.message : "Screen share failed."
      );
      return;
    }

    try {
      setScreenShareError(null);
      const track = screenStream.getVideoTracks()[0];
      if (!track) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }
      screenStream.getAudioTracks().forEach((t) => {
        t.stop();
        screenStream.removeTrack(t);
      });

      const sendTransport = sendTransportRef.current;
      if (!sendTransport) {
        screenStream.getTracks().forEach((t) => t.stop());
        setScreenShareError("Not connected to media server yet.");
        return;
      }

      if (cameraProducerRef.current && !cameraProducerRef.current.paused) {
        await cameraProducerRef.current.pause();
      }

      const producer = await sendTransport.produce({
        track,
        appData: { source: "screen" },
      });
      screenProducerRef.current = producer;
      screenStreamRef.current = screenStream;
      isScreenSharingRef.current = true;
      setIsScreenSharing(true);
      setPresentingPeerId(LOCAL_PRESENTER_ID);
      setLocalStream(
        new MediaStream([
          track,
          ...(cameraStreamRef.current?.getAudioTracks() ?? []),
        ])
      );

      socketRef.current?.emit(SOCKET_EVENTS.START_SCREEN_SHARE);

      track.onended = () => {
        void stopScreenShareInternal().then(async () => {
          if (cameraProducerRef.current?.paused && isCameraOnRef.current) {
            await cameraProducerRef.current.resume();
          }
        });
      };

      producer.on("transportclose", () => {
        screenProducerRef.current = null;
      });
    } catch (err) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenShareError(
        err instanceof Error ? err.message : "Screen share failed."
      );
    }
  }, [stopScreenShareInternal]);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharingRef.current) return;
    await stopScreenShareInternal();
    if (cameraProducerRef.current?.paused && isCameraOnRef.current) {
      await cameraProducerRef.current.resume();
    }
  }, [stopScreenShareInternal]);

  const leave = useCallback(() => {
    teardown();
  }, [teardown]);

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current?.connected) return;
    socketRef.current.emit(SOCKET_EVENTS.CHAT_MESSAGE, {
      text: trimmed.slice(0, 2000),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      let media: MediaStream | null = null;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch {
        try {
          media = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          setMediaError(
            err instanceof Error
              ? err.message
              : "Camera/microphone access was denied."
          );
        }
      }
      if (cancelled) {
        media?.getTracks().forEach((t) => t.stop());
        return;
      }

      cameraStreamRef.current = media;
      setLocalStream(media);
      const micOn = Boolean(media?.getAudioTracks().some((t) => t.enabled));
      const camOn = Boolean(media?.getVideoTracks().some((t) => t.enabled));
      setIsMicOn(micOn);
      setIsCameraOn(camOn);
      isCameraOnRef.current = camOn;

      const socket = io({ path: "/socket.io" });
      socketRef.current = socket;

      socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (message: ChatMessage) => {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message]
        );
      });

      socket.on(
        SOCKET_EVENTS.USER_JOINED,
        ({ socketId, displayName: name }: RoomParticipant) => {
          ensureRemotePeer(socketId, name);
        }
      );

      socket.on(SOCKET_EVENTS.USER_LEFT, ({ socketId }: UserLeftPayload) => {
        for (const [id, meta] of [...consumersRef.current.entries()]) {
          if (meta.socketId === socketId) {
            try {
              meta.consumer.close();
            } catch {
              /* ignore */
            }
            consumersRef.current.delete(id);
          }
        }
        remoteStreamsRef.current.delete(socketId);
        publishRemotePeers();
        setPresentingPeerId((prev) => (prev === socketId ? null : prev));
      });

      socket.on(SOCKET_EVENTS.NEW_PRODUCER, (info: ProducerInfo) => {
        void consumeProducer(info);
      });

      socket.on(
        SOCKET_EVENTS.PRODUCER_CLOSED,
        ({
          producerId,
          socketId,
        }: {
          producerId: string;
          socketId: string | null;
        }) => {
          let ownerId = socketId;
          for (const [id, meta] of [...consumersRef.current.entries()]) {
            if (meta.consumer.producerId === producerId) {
              ownerId = ownerId || meta.socketId;
              try {
                meta.consumer.close();
              } catch {
                /* ignore */
              }
              consumersRef.current.delete(id);
            }
          }
          if (ownerId) rebuildPeerStream(ownerId);
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

      await new Promise<void>((resolve, reject) => {
        if (socket.connected) {
          resolve();
          return;
        }
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
      if (cancelled) return;

      setLocalSocketId(socket.id ?? null);

      type JoinAck = Ack<{
        routerRtpCapabilities: MsTypes.RtpCapabilities;
        peers: RoomParticipant[];
        presentingSocketId: string | null;
        producers: ProducerInfo[];
      }>;

      const join = await new Promise<JoinAck>((resolve, reject) => {
        socket.timeout(15000).emit(
          SOCKET_EVENTS.JOIN_ROOM,
          { roomId, displayName },
          (err: Error | null, res: JoinAck) => {
            if (err) reject(err);
            else resolve(res);
          }
        );
      });

      if (!join.ok || cancelled) {
        setMediaError(join.error || "Failed to join room");
        return;
      }

      join.peers.forEach((p) => ensureRemotePeer(p.socketId, p.displayName));
      if (join.presentingSocketId) {
        setPresentingPeerId(join.presentingSocketId);
      }

      const device = new Device();
      await device.load({ routerRtpCapabilities: join.routerRtpCapabilities });
      if (cancelled) return;
      deviceRef.current = device;

      const sendParams = await request<{
        id: string;
        iceParameters: MsTypes.IceParameters;
        iceCandidates: MsTypes.IceCandidate[];
        dtlsParameters: MsTypes.DtlsParameters;
      }>(SOCKET_EVENTS.CREATE_WEBRTC_TRANSPORT, {
        roomId,
        direction: "send",
      });
      if (!sendParams.ok) throw new Error(sendParams.error || "send transport");

      const sendTransport = device.createSendTransport({
        id: sendParams.id,
        iceParameters: sendParams.iceParameters,
        iceCandidates: sendParams.iceCandidates,
        dtlsParameters: sendParams.dtlsParameters,
      });
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
        request(SOCKET_EVENTS.CONNECT_WEBRTC_TRANSPORT, {
          roomId: roomIdRef.current,
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      sendTransport.on(
        "produce",
        ({ kind, rtpParameters, appData }, callback, errback) => {
          request<{ id: string }>(SOCKET_EVENTS.PRODUCE, {
            roomId: roomIdRef.current,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          })
            .then((res) => {
              if (!res.ok) throw new Error(res.error);
              callback({ id: res.id });
            })
            .catch(errback);
        }
      );

      const recvParams = await request<{
        id: string;
        iceParameters: MsTypes.IceParameters;
        iceCandidates: MsTypes.IceCandidate[];
        dtlsParameters: MsTypes.DtlsParameters;
      }>(SOCKET_EVENTS.CREATE_WEBRTC_TRANSPORT, {
        roomId,
        direction: "recv",
      });
      if (!recvParams.ok) throw new Error(recvParams.error || "recv transport");

      const recvTransport = device.createRecvTransport({
        id: recvParams.id,
        iceParameters: recvParams.iceParameters,
        iceCandidates: recvParams.iceCandidates,
        dtlsParameters: recvParams.dtlsParameters,
      });
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
        request(SOCKET_EVENTS.CONNECT_WEBRTC_TRANSPORT, {
          roomId: roomIdRef.current,
          transportId: recvTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      if (cancelled) return;

      if (media) {
        const audioTrack = media.getAudioTracks()[0];
        const videoTrack = media.getVideoTracks()[0];
        if (audioTrack) {
          audioProducerRef.current = await sendTransport.produce({
            track: audioTrack,
            appData: { source: "microphone" },
          });
        }
        if (videoTrack) {
          cameraProducerRef.current = await sendTransport.produce({
            track: videoTrack,
            appData: { source: "camera" },
          });
        }
      }

      for (const producer of join.producers || []) {
        if (cancelled) break;
        await consumeProducer(producer);
      }
    }

    setup().catch((err) => {
      console.error("[useWebRTC] setup failed", err);
      setMediaError(err instanceof Error ? err.message : "Media setup failed");
    });

    return () => {
      cancelled = true;
      teardown();
    };
    // Intentionally only re-join when room or display name changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName]);

  return {
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
  };
}
