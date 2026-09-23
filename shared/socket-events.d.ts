// Type declarations for shared/socket-events.js

export interface RoomParticipant {
  socketId: string;
  displayName: string;
}

export interface JoinRoomPayload {
  roomId: string;
  displayName: string;
}

export interface UserLeftPayload {
  socketId: string;
}

export interface ScreenSharePayload {
  socketId: string;
  displayName?: string;
}

export interface ExistingPeersPayload {
  peers: RoomParticipant[];
  presentingSocketId: string | null;
  /** Existing mediasoup producers in the room (for late joiners). */
  producers: ProducerInfo[];
}

export interface ProducerInfo {
  producerId: string;
  socketId: string;
  displayName: string;
  kind: "audio" | "video";
  source: "camera" | "microphone" | "screen";
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SendChatPayload {
  text: string;
}

export declare const SOCKET_EVENTS: {
  readonly JOIN_ROOM: "join-room";
  readonly EXISTING_PEERS: "existing-peers";
  readonly USER_JOINED: "user-joined";
  readonly USER_LEFT: "user-left";
  readonly GET_ROUTER_RTP_CAPABILITIES: "get-router-rtp-capabilities";
  readonly CREATE_WEBRTC_TRANSPORT: "create-webrtc-transport";
  readonly CONNECT_WEBRTC_TRANSPORT: "connect-webrtc-transport";
  readonly PRODUCE: "produce";
  readonly CONSUME: "consume";
  readonly RESUME_CONSUMER: "resume-consumer";
  readonly NEW_PRODUCER: "new-producer";
  readonly PRODUCER_CLOSED: "producer-closed";
  readonly START_SCREEN_SHARE: "start-screen-share";
  readonly STOP_SCREEN_SHARE: "stop-screen-share";
  readonly CHAT_MESSAGE: "chat-message";
};

export type SocketEventName =
  (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
