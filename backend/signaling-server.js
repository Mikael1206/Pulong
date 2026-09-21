// Socket.io signaling server logic — kept separate from the Next.js frontend.
// See docs/sdd.md §1-§2 for the architecture and docs/prd.md F-001/F-002 for
// the features this serves.
//
// Room/peer signaling event handling (join-room, offer/answer/ICE relay,
// chat) lands in TASK-003 onward — this module currently only wires up
// connection/disconnection logging as a placeholder.

const { Server } = require("socket.io");

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

    socket.on("disconnect", () => {
      console.log(`[socket.io] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { attachSignalingServer };
