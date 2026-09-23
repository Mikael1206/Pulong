// Shared Socket.io event names — frontend (TS via .d.ts) + backend (require).
// Media path uses mediasoup SFU (ADR-003); Socket.io is signaling + chat only.

const SOCKET_EVENTS = Object.freeze({
  // Room / presence
  JOIN_ROOM: "join-room",
  EXISTING_PEERS: "existing-peers",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",

  // mediasoup SFU signaling
  GET_ROUTER_RTP_CAPABILITIES: "get-router-rtp-capabilities",
  CREATE_WEBRTC_TRANSPORT: "create-webrtc-transport",
  CONNECT_WEBRTC_TRANSPORT: "connect-webrtc-transport",
  PRODUCE: "produce",
  CONSUME: "consume",
  RESUME_CONSUMER: "resume-consumer",
  NEW_PRODUCER: "new-producer",
  PRODUCER_CLOSED: "producer-closed",

  // Screen-share presence (UI stage); media is a video producer with appData.source=screen
  START_SCREEN_SHARE: "start-screen-share",
  STOP_SCREEN_SHARE: "stop-screen-share",

  // Chat (ephemeral relay only — INV-003)
  CHAT_MESSAGE: "chat-message",
});

module.exports = { SOCKET_EVENTS };
