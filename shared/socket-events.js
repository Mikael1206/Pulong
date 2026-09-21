// Shared Socket.io event name constants — single source of truth for both
// the frontend (imported via TS, typed by the adjacent socket-events.d.ts)
// and the backend (required directly, plain CommonJS, zero build step).
// See docs/sdd.md §2-§4 for the full signaling data flow and payload shapes,
// and docs/decision-ledger.md ADR-002 for why this lives outside frontend/
// and backend/ as a plain .js + .d.ts pair rather than a single .ts file.

const SOCKET_EVENTS = Object.freeze({
  // Client -> Server
  JOIN_ROOM: "join-room",
  SEND_OFFER: "send-offer",
  SEND_ANSWER: "send-answer",
  SEND_ICE_CANDIDATE: "send-ice-candidate",
  START_SCREEN_SHARE: "start-screen-share",
  STOP_SCREEN_SHARE: "stop-screen-share",

  // Server -> Client
  EXISTING_PEERS: "existing-peers",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",
  RECEIVE_OFFER: "receive-offer",
  RECEIVE_ANSWER: "receive-answer",
  RECEIVE_ICE_CANDIDATE: "receive-ice-candidate",
  // START_SCREEN_SHARE / STOP_SCREEN_SHARE are also broadcast server -> client
});

module.exports = { SOCKET_EVENTS };
