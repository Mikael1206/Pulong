// Root entrypoint: boots the Next.js frontend (frontend/) and the Socket.io
// signaling backend (backend/) on the SAME HTTP server/port. See
// docs/sdd.md §1-§2 for the architecture this implements, and docs/prd.md
// F-001/F-002 for the features it serves.
//
// Kept as a single process/port on purpose (docs/stack-decision.md,
// docs/decision-ledger.md ADR-001) — fewer moving parts to fail on a live
// demo, zero extra infra to deploy for a $0, 1-night build.

const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { attachSignalingServer } = require("./backend/signaling-server");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, dir: path.join(__dirname, "frontend"), hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  attachSignalingServer(httpServer);

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Pulong ready on http://${hostname}:${port}`);
    });
});
