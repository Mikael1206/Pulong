// Socket.io signaling server logic — kept separate from the Next.js frontend.
// See docs/sdd.md §1-§4 for the architecture/data flow and docs/prd.md
// F-001/F-002/F-004 for the features this serves.
//
// The server only ever relays opaque signaling payloads (SDP offers/answers,
// ICE candidates) between two socket IDs — it never inspects or persists
// them (INV-003). Room membership lives in memory only and disappears when
// the process restarts, by design.

const { Server } = require("socket.io");
const { SOCKET_EVENTS } = require("../shared/socket-events");

/**
 * In-memory room membership:
 * Map<roomId, Map<socketId, { displayName, isPresenting }>>
 * @type {Map<string, Map<string, { displayName: string, isPresenting: boolean }>>}
 */
const activeRooms = new Map();

function findPresentingSocketId(room) {
  for (const [socketId, participant] of room.entries()) {
    if (participant.isPresenting) return socketId;
  }
  return null;
}

/**
 * Attaches a Socket.io signaling server to an existing HTTP server.
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
 */
function attachSignalingServer(httpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[socket.io] client connected: ${socket.id}`);

    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId, displayName }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.displayName = displayName;

      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, new Map());
      }
      const room = activeRooms.get(roomId);

      const peers = Array.from(room.entries()).map(
        ([socketId, participant]) => ({
          socketId,
          displayName: participant.displayName,
        })
      );
      socket.emit(SOCKET_EVENTS.EXISTING_PEERS, {
        peers,
        presentingSocketId: findPresentingSocketId(room),
      });

      room.set(socket.id, { displayName, isPresenting: false });

      socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
        socketId: socket.id,
        displayName,
      });

      console.log(
        `[socket.io] ${socket.id} (${displayName}) joined room ${roomId} (${room.size} total)`
      );
    });

    socket.on(SOCKET_EVENTS.SEND_OFFER, ({ to, sdp }) => {
      io.to(to).emit(SOCKET_EVENTS.RECEIVE_OFFER, { from: socket.id, sdp });
    });

    socket.on(SOCKET_EVENTS.SEND_ANSWER, ({ to, sdp }) => {
      io.to(to).emit(SOCKET_EVENTS.RECEIVE_ANSWER, { from: socket.id, sdp });
    });

    socket.on(SOCKET_EVENTS.SEND_ICE_CANDIDATE, ({ to, candidate }) => {
      io.to(to).emit(SOCKET_EVENTS.RECEIVE_ICE_CANDIDATE, {
        from: socket.id,
        candidate,
      });
    });

    socket.on(SOCKET_EVENTS.START_SCREEN_SHARE, () => {
      const { roomId, displayName } = socket.data;
      if (!roomId || !activeRooms.has(roomId)) return;
      const room = activeRooms.get(roomId);

      // Only one presenter at a time — clear any previous flag.
      for (const participant of room.values()) {
        participant.isPresenting = false;
      }
      const self = room.get(socket.id);
      if (self) self.isPresenting = true;

      socket.to(roomId).emit(SOCKET_EVENTS.START_SCREEN_SHARE, {
        socketId: socket.id,
        displayName,
      });
    });

    socket.on(SOCKET_EVENTS.STOP_SCREEN_SHARE, () => {
      const { roomId } = socket.data;
      if (!roomId || !activeRooms.has(roomId)) return;
      const room = activeRooms.get(roomId);
      const self = room.get(socket.id);
      if (self) self.isPresenting = false;

      socket.to(roomId).emit(SOCKET_EVENTS.STOP_SCREEN_SHARE, {
        socketId: socket.id,
      });
    });

    // Chat is relayed only — never written to disk or a database (INV-003).
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, ({ text }) => {
      const { roomId, displayName } = socket.data;
      if (!roomId || !activeRooms.has(roomId)) return;

      const trimmed = typeof text === "string" ? text.trim() : "";
      if (!trimmed) return;

      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        senderId: socket.id,
        senderName: displayName || "Guest Participant",
        text: trimmed.slice(0, 2000),
        timestamp: Date.now(),
      };

      // Include the sender so every client shares one message id.
      io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
    });

    socket.on("disconnect", () => {
      console.log(`[socket.io] client disconnected: ${socket.id}`);

      const { roomId } = socket.data;
      if (!roomId || !activeRooms.has(roomId)) return;

      const room = activeRooms.get(roomId);
      const wasPresenting = room.get(socket.id)?.isPresenting;
      room.delete(socket.id);

      if (wasPresenting) {
        socket.to(roomId).emit(SOCKET_EVENTS.STOP_SCREEN_SHARE, {
          socketId: socket.id,
        });
      }

      socket.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        socketId: socket.id,
      });

      if (room.size === 0) {
        activeRooms.delete(roomId);
      }
    });
  });

  return io;
}

module.exports = { attachSignalingServer };
