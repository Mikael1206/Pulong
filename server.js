// Custom Node.js server that boots Next.js and a Socket.io signaling server
// on the SAME HTTP server/port. See docs/sdd.md §1-§2 for the architecture this
// implements, and docs/prd.md F-001/F-002 for the features it serves.
//
// Room/peer signaling logic (join-room, offer/answer/ICE relay, chat) is added
// in TASK-003 onward — this task only wires up the shared HTTP server.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    // Placeholder connection log only — room/signaling events land in TASK-003.
    console.log(`[socket.io] client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[socket.io] client disconnected: ${socket.id}`);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Pulong ready on http://${hostname}:${port}`);
    });
});
