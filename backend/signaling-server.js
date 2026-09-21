// Socket.io signaling server logic — kept separate from the Next.js frontend.
// See docs/sdd.md §1-§4 for the architecture/data flow and docs/prd.md
// F-001/F-002 for the features this serves.
//
// The server only ever relays opaque signaling payloads (SDP offers/answers,
// ICE candidates) between two socket IDs — it never inspects or persists
// them (INV-003). Room membership lives in memory only and disappears when
// the process restarts, by design.

const { Server } = require("socket.io");
const { SOCKET_EVENTS } = require("../shared/socket-events");

/**
 * In-memory room membership: Map<roomId, Map<socketId, { displayName }>>.
 * Never written to disk or a database (INV-003) — see docs/sdd.md §4.
 * @type {Map<string, Map<string, { displayName: string }>>}
 */
const activeRooms = new Map();

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

      // Tell the joiner who's already here — the joiner does NOT initiate
      // offers to these peers (see docs/sdd.md §3): each existing peer
      // initiates its own offer once it hears USER_JOINED below.
      const existingPeers = Array.from(room.entries()).map(
        ([socketId, participant]) => ({
          socketId,
          displayName: participant.displayName,
        })
      );
      socket.emit(SOCKET_EVENTS.EXISTING_PEERS, existingPeers);

      room.set(socket.id, { displayName });

      socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
        socketId: socket.id,
        displayName,
      });

      console.log(
        `[socket.io] ${socket.id} (${displayName}) joined room ${roomId} (${room.size} total)`
      );
    });

    // Signaling relay — payloads pass through opaque, server never inspects
    // SDP or ICE candidate contents.
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

    socket.on("disconnect", () => {
      console.log(`[socket.io] client disconnected: ${socket.id}`);

      const { roomId } = socket.data;
      if (!roomId || !activeRooms.has(roomId)) return;

      const room = activeRooms.get(roomId);
      room.delete(socket.id);
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
