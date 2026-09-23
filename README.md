# Pulong

Free, open-source, browser-based video meetings — **no accounts, no time limits, no cost.**

Commercial free tiers of Zoom, Google Meet, and Microsoft Teams cut group calls off after
40–60 minutes. That breaks long lectures and study groups for students and teachers who
cannot pay for Pro. Pulong is a lightweight alternative: create a room, share the link,
and stay connected as long as you need.

## Features

| Feature | What you get |
|---|---|
| Instant rooms | One click to create; join by link or room code — no signup |
| Unlimited duration | No 40/60-minute cutoff |
| Video & audio | WebRTC via self-hosted mediasoup SFU (target: classroom scale; host CPU/upload limited — see Known limits) |
| Screen sharing | Share a window/tab/screen for slides and demos |
| In-call chat | Ephemeral text chat with unread badge |
| Ephemeral by default | Media is RTP-forwarded only (never written to disk); chat is not saved |

## Quick start

**Requirements:** Node.js **18.18+** and npm.

```bash
git clone https://github.com/Mikael1206/Pulong.git
cd Pulong
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

No `.env` file, API keys, or cloud accounts are required for local use.

### Production-style local run

```bash
npm run build
npm start
```

Same URL: [http://localhost:3000](http://localhost:3000).

## Project layout

```
Pulong/
├── server.js              # Single process: Next.js + Socket.io + mediasoup SFU
├── frontend/              # Next.js App Router UI (lobby, room, mediasoup-client)
├── backend/               # Socket.io signaling + mediasoup worker/router
├── shared/                # Event name contracts used by frontend + backend
├── package.json           # npm scripts: dev / build / start / lint
└── LICENSE                # MIT
```

## How it works (short)

1. **Signaling** (Socket.io on the same HTTP server as the UI) handles room membership,
   mediasoup transport/produce/consume control, screen-share presence, and chat text.
2. **Media** (camera, mic, screen) goes browser → **mediasoup SFU** → browsers. The server
   forwards RTP only — it does **not** record or write media to disk.
3. **Capacity** targets **100+ participants** for block classes / webinar-style rooms
   (`[assumption A-001b]` — not load-tested yet). Host upload and CPU are the bottleneck;
   for large rooms prefer most cameras off with one presenter screen-sharing.
4. **Ports:** mediasoup uses UDP/TCP **40000–49999** by default (`MEDIASOUP_MIN_PORT` /
   `MEDIASOUP_MAX_PORT`). Set `MEDIASOUP_ANNOUNCED_IP` to your LAN/public IP when joining
   from other devices.

## Known limits (MVP)

- Designed for **classroom / webinar scale (100+)** on a self-hosted SFU — real ceiling
  depends on the host machine’s CPU and upstream bandwidth (`[assumption]` until load-tested).
- No cloud recording or waiting rooms.
- Screen share reliability varies by OS/browser (prefer Chromium for demos).
- Chat and room membership are **ephemeral** — gone when you leave or the server restarts.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (custom `server.js`) |
| `npm run build` | Production build of `frontend/` |
| `npm start` | Serve the production build via `server.js` |
| `npm run lint` | ESLint on the frontend |

**Tip:** Stop `npm run dev` before running `npm run build`. Building while the
dev server is running can leave `frontend/.next` in a broken state (HTTP 500).
After a build, start fresh with `npm run dev` or `npm start`.

## Troubleshooting

| Symptom | What to try |
|---|---|
| HTTP 500 after a build | Stop the server, delete `frontend/.next`, run `npm run build` (or just `npm run dev`), start again |
| Two people can't see each other | Confirm both opened the **same** room link (Join / Copy Link — not two separate New Meetings) |
| Screen share says “Not supported” | Use Chrome/Edge, or fix Firefox screen-capture portals on Linux |
| Camera permission denied | Allow camera/mic for `localhost` in browser site settings |

## License

[MIT](./LICENSE) — free to use, modify, and share.
