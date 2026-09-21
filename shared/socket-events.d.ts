// Type declarations for shared/socket-events.js — see that file and
// docs/sdd.md §2-§4 for the full signaling data flow and payload shapes.

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

export interface OfferPayload {
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface AnswerPayload {
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface ReceiveOfferPayload {
  from: string;
  sdp: RTCSessionDescriptionInit;
}

export interface ReceiveAnswerPayload {
  from: string;
  sdp: RTCSessionDescriptionInit;
}

export interface ReceiveIceCandidatePayload {
  from: string;
  candidate: RTCIceCandidateInit;
}

export interface ScreenSharePayload {
  socketId: string;
  displayName?: string;
}

export interface ExistingPeersPayload {
  peers: RoomParticipant[];
  presentingSocketId: string | null;
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
  readonly SEND_OFFER: "send-offer";
  readonly SEND_ANSWER: "send-answer";
  readonly SEND_ICE_CANDIDATE: "send-ice-candidate";
  readonly START_SCREEN_SHARE: "start-screen-share";
  readonly STOP_SCREEN_SHARE: "stop-screen-share";
  readonly CHAT_MESSAGE: "chat-message";
  readonly EXISTING_PEERS: "existing-peers";
  readonly USER_JOINED: "user-joined";
  readonly USER_LEFT: "user-left";
  readonly RECEIVE_OFFER: "receive-offer";
  readonly RECEIVE_ANSWER: "receive-answer";
  readonly RECEIVE_ICE_CANDIDATE: "receive-ice-candidate";
};

export type SocketEventName =
  (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
