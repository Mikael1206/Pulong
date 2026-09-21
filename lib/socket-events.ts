// Shared Socket.io event name constants + types.
// Room join/leave payload handling lands in TASK-003 (docs/sdd.md §2-§3).
// This file only defines the event name contract so client and server stay in sync.

export const SOCKET_EVENTS = {
  JOIN_ROOM: "join-room",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",
  EXISTING_PEERS: "existing-peers",
} as const;

export type SocketEventName =
  (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
