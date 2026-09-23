// Socket.io signaling + mediasoup SFU control plane.
// See docs/decision-ledger.md ADR-003 and docs/sdd.md.
// INV-003: media is RTP-forwarded only; chat/membership are in-memory, never on disk.

const { Server } = require("socket.io");
const { SOCKET_EVENTS } = require("../shared/socket-events");
const {
  createRouter,
  createWebRtcTransport,
} = require("./mediasoup-server");

/**
 * @typedef {{
 *   displayName: string,
 *   isPresenting: boolean,
 *   sendTransport: import("mediasoup").types.WebRtcTransport | null,
 *   recvTransport: import("mediasoup").types.WebRtcTransport | null,
 *   producers: Map<string, import("mediasoup").types.Producer>,
 *   consumers: Map<string, import("mediasoup").types.Consumer>,
 * }} PeerState
 *
 * @typedef {{
 *   router: import("mediasoup").types.Router,
 *   peers: Map<string, PeerState>,
 * }} RoomState
 */

/** @type {Map<string, RoomState>} */
const rooms = new Map();

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;
  const router = await createRouter();
  room = { router, peers: new Map() };
  rooms.set(roomId, room);
  return room;
}

function findPresentingSocketId(room) {
  for (const [socketId, peer] of room.peers.entries()) {
    if (peer.isPresenting) return socketId;
  }
  return null;
}

function listRoomProducers(room) {
  /** @type {Array<{ producerId: string, socketId: string, displayName: string, kind: string, source: string }>} */
  const list = [];
  for (const [socketId, peer] of room.peers.entries()) {
    for (const producer of peer.producers.values()) {
      list.push({
        producerId: producer.id,
        socketId,
        displayName: peer.displayName,
        kind: producer.kind,
        source: producer.appData?.source || (producer.kind === "audio" ? "microphone" : "camera"),
      });
    }
  }
  return list;
}

function cleanupPeer(roomId, socketId, io) {
  const room = rooms.get(roomId);
  if (!room) return;

  const peer = room.peers.get(socketId);
  if (!peer) return;

  const wasPresenting = peer.isPresenting;

  for (const consumer of peer.consumers.values()) {
    try {
      consumer.close();
    } catch {
      /* ignore */
    }
  }
  for (const producer of peer.producers.values()) {
    const producerId = producer.id;
    try {
      producer.close();
    } catch {
      /* ignore */
    }
    io.to(roomId).emit(SOCKET_EVENTS.PRODUCER_CLOSED, {
      producerId,
      socketId,
    });
  }
  try {
    peer.sendTransport?.close();
  } catch {
    /* ignore */
  }
  try {
    peer.recvTransport?.close();
  } catch {
    /* ignore */
  }

  room.peers.delete(socketId);

  if (wasPresenting) {
    io.to(roomId).emit(SOCKET_EVENTS.STOP_SCREEN_SHARE, { socketId });
  }

  io.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, { socketId });

  if (room.peers.size === 0) {
    try {
      room.router.close();
    } catch {
      /* ignore */
    }
    rooms.delete(roomId);
  }
}

/**
 * @param {import("http").Server} httpServer
 */
function attachSignalingServer(httpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[socket.io] client connected: ${socket.id}`);

    socket.on(SOCKET_EVENTS.JOIN_ROOM, async ({ roomId, displayName }, callback) => {
      try {
        const room = await getOrCreateRoom(roomId);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.displayName = displayName;

        const peers = Array.from(room.peers.entries()).map(([id, p]) => ({
          socketId: id,
          displayName: p.displayName,
        }));

        room.peers.set(socket.id, {
          displayName: displayName || "Guest Participant",
          isPresenting: false,
          sendTransport: null,
          recvTransport: null,
          producers: new Map(),
          consumers: new Map(),
        });

        const payload = {
          peers,
          presentingSocketId: findPresentingSocketId(room),
          producers: listRoomProducers(room),
          routerRtpCapabilities: room.router.rtpCapabilities,
        };

        if (typeof callback === "function") {
          callback({ ok: true, ...payload });
        } else {
          socket.emit(SOCKET_EVENTS.EXISTING_PEERS, payload);
        }

        socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
          socketId: socket.id,
          displayName: displayName || "Guest Participant",
        });

        console.log(
          `[socket.io] ${socket.id} (${displayName}) joined ${roomId} (${room.peers.size} peers)`
        );
      } catch (err) {
        console.error("[join-room]", err);
        if (typeof callback === "function") {
          callback({ ok: false, error: String(err) });
        }
      }
    });

    socket.on(SOCKET_EVENTS.GET_ROUTER_RTP_CAPABILITIES, async ({ roomId }, callback) => {
      try {
        const room = await getOrCreateRoom(roomId);
        callback?.({ ok: true, rtpCapabilities: room.router.rtpCapabilities });
      } catch (err) {
        callback?.({ ok: false, error: String(err) });
      }
    });

    socket.on(
      SOCKET_EVENTS.CREATE_WEBRTC_TRANSPORT,
      async ({ roomId, direction }, callback) => {
        try {
          const room = rooms.get(roomId);
          const peer = room?.peers.get(socket.id);
          if (!room || !peer) {
            callback?.({ ok: false, error: "Not in room" });
            return;
          }

          const { transport, params } = await createWebRtcTransport(room.router);
          if (direction === "send") {
            peer.sendTransport = transport;
          } else {
            peer.recvTransport = transport;
          }

          transport.on("dtlsstatechange", (state) => {
            if (state === "closed") transport.close();
          });

          callback?.({ ok: true, ...params });
        } catch (err) {
          console.error("[create-webrtc-transport]", err);
          callback?.({ ok: false, error: String(err) });
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.CONNECT_WEBRTC_TRANSPORT,
      async ({ roomId, transportId, dtlsParameters }, callback) => {
        try {
          const peer = rooms.get(roomId)?.peers.get(socket.id);
          if (!peer) {
            callback?.({ ok: false, error: "Not in room" });
            return;
          }
          const transport =
            peer.sendTransport?.id === transportId
              ? peer.sendTransport
              : peer.recvTransport?.id === transportId
                ? peer.recvTransport
                : null;
          if (!transport) {
            callback?.({ ok: false, error: "Transport not found" });
            return;
          }
          await transport.connect({ dtlsParameters });
          callback?.({ ok: true });
        } catch (err) {
          console.error("[connect-webrtc-transport]", err);
          callback?.({ ok: false, error: String(err) });
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.PRODUCE,
      async ({ roomId, transportId, kind, rtpParameters, appData }, callback) => {
        try {
          const room = rooms.get(roomId);
          const peer = room?.peers.get(socket.id);
          if (!room || !peer || peer.sendTransport?.id !== transportId) {
            callback?.({ ok: false, error: "Send transport not found" });
            return;
          }

          const producer = await peer.sendTransport.produce({
            kind,
            rtpParameters,
            appData: appData || {},
          });
          peer.producers.set(producer.id, producer);

          producer.on("transportclose", () => {
            peer.producers.delete(producer.id);
          });

          socket.to(roomId).emit(SOCKET_EVENTS.NEW_PRODUCER, {
            producerId: producer.id,
            socketId: socket.id,
            displayName: peer.displayName,
            kind: producer.kind,
            source:
              producer.appData?.source ||
              (producer.kind === "audio" ? "microphone" : "camera"),
          });

          callback?.({ ok: true, id: producer.id });
        } catch (err) {
          console.error("[produce]", err);
          callback?.({ ok: false, error: String(err) });
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.CONSUME,
      async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
        try {
          const room = rooms.get(roomId);
          const peer = room?.peers.get(socket.id);
          if (!room || !peer || peer.recvTransport?.id !== transportId) {
            callback?.({ ok: false, error: "Recv transport not found" });
            return;
          }

          if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            callback?.({ ok: false, error: "Cannot consume" });
            return;
          }

          const consumer = await peer.recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
          });
          peer.consumers.set(consumer.id, consumer);

          consumer.on("transportclose", () => {
            peer.consumers.delete(consumer.id);
          });
          consumer.on("producerclose", () => {
            peer.consumers.delete(consumer.id);
            socket.emit(SOCKET_EVENTS.PRODUCER_CLOSED, {
              producerId,
              socketId: null,
            });
          });

          // Find owner for UI labeling
          let ownerSocketId = null;
          let ownerName = "Guest";
          let source = consumer.kind === "audio" ? "microphone" : "camera";
          for (const [id, p] of room.peers.entries()) {
            if (p.producers.has(producerId)) {
              ownerSocketId = id;
              ownerName = p.displayName;
              source =
                p.producers.get(producerId).appData?.source || source;
              break;
            }
          }

          callback?.({
            ok: true,
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            socketId: ownerSocketId,
            displayName: ownerName,
            source,
          });
        } catch (err) {
          console.error("[consume]", err);
          callback?.({ ok: false, error: String(err) });
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.RESUME_CONSUMER,
      async ({ roomId, consumerId }, callback) => {
        try {
          const peer = rooms.get(roomId)?.peers.get(socket.id);
          const consumer = peer?.consumers.get(consumerId);
          if (!consumer) {
            callback?.({ ok: false, error: "Consumer not found" });
            return;
          }
          await consumer.resume();
          callback?.({ ok: true });
        } catch (err) {
          callback?.({ ok: false, error: String(err) });
        }
      }
    );

    socket.on(SOCKET_EVENTS.START_SCREEN_SHARE, () => {
      const { roomId } = socket.data;
      const room = rooms.get(roomId);
      const peer = room?.peers.get(socket.id);
      if (!room || !peer) return;

      for (const p of room.peers.values()) {
        p.isPresenting = false;
      }
      peer.isPresenting = true;

      socket.to(roomId).emit(SOCKET_EVENTS.START_SCREEN_SHARE, {
        socketId: socket.id,
        displayName: peer.displayName,
      });
    });

    socket.on(SOCKET_EVENTS.STOP_SCREEN_SHARE, () => {
      const { roomId } = socket.data;
      const room = rooms.get(roomId);
      const peer = room?.peers.get(socket.id);
      if (!room || !peer) return;
      peer.isPresenting = false;

      // Close any screen producers owned by this peer
      for (const [id, producer] of [...peer.producers.entries()]) {
        if (producer.appData?.source === "screen") {
          producer.close();
          peer.producers.delete(id);
          io.to(roomId).emit(SOCKET_EVENTS.PRODUCER_CLOSED, {
            producerId: id,
            socketId: socket.id,
          });
        }
      }

      socket.to(roomId).emit(SOCKET_EVENTS.STOP_SCREEN_SHARE, {
        socketId: socket.id,
      });
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, ({ text }) => {
      const { roomId, displayName } = socket.data;
      if (!roomId || !rooms.has(roomId)) return;
      const trimmed = typeof text === "string" ? text.trim() : "";
      if (!trimmed) return;

      io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        senderId: socket.id,
        senderName: displayName || "Guest Participant",
        text: trimmed.slice(0, 2000),
        timestamp: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      console.log(`[socket.io] client disconnected: ${socket.id}`);
      const { roomId } = socket.data;
      if (roomId) cleanupPeer(roomId, socket.id, io);
    });
  });

  return io;
}

module.exports = { attachSignalingServer };
