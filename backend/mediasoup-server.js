// mediasoup SFU bootstrap — one Worker shared across rooms; one Router per room.
// See docs/decision-ledger.md ADR-003. Media is forwarded in RTP only (INV-003:
// never written to disk). Capacity target: 100+ classroom/webinar participants.

const os = require("os");
const mediasoup = require("mediasoup");

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

/** @type {import("mediasoup").types.Worker | null} */
let worker = null;

/**
 * Pick a LAN IPv4 for ICE announcedIp so phones/other PCs on the same network
 * can reach the SFU. Override with MEDIASOUP_ANNOUNCED_IP.
 */
function detectAnnouncedIp() {
  if (process.env.MEDIASOUP_ANNOUNCED_IP) {
    return process.env.MEDIASOUP_ANNOUNCED_IP;
  }
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

async function getWorker() {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
  });

  worker.on("died", () => {
    console.error("[mediasoup] worker died — exiting");
    process.exit(1);
  });

  console.log(
    `[mediasoup] worker pid=${worker.pid} announcedIp=${detectAnnouncedIp()}`
  );
  return worker;
}

async function createRouter() {
  const w = await getWorker();
  return w.createRouter({ mediaCodecs });
}

function getWebRtcTransportListenInfos() {
  const announcedIp = detectAnnouncedIp();
  return [
    {
      protocol: "udp",
      ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
      announcedAddress: announcedIp,
    },
    {
      protocol: "tcp",
      ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
      announcedAddress: announcedIp,
    },
  ];
}

async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenInfos: getWebRtcTransportListenInfos(),
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });

  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
}

module.exports = {
  getWorker,
  createRouter,
  createWebRtcTransport,
  mediaCodecs,
  detectAnnouncedIp,
};
