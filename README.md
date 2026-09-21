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
| Video & audio | Peer-to-peer WebRTC (mesh), works in the browser |
| Screen sharing | Share a window/tab/screen for slides and demos |
| In-call chat | Ephemeral text chat with unread badge |
| Privacy by design | Media stays peer-to-peer; signaling & chat are not saved to disk |

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

## How to use

### Host a meeting

1. Enter a display name on the lobby.
2. Click **New Meeting**.
3. Allow camera/microphone when the browser asks.
4. Click **Copy Link** and send it to classmates (Messenger, Discord, email, etc.).

### Join a meeting

1. Open the shared link **or** go to the lobby, paste the link/code into **Join**, and enter your name.
2. Do **not** click **New Meeting** again — that creates a *different* room.

### In the call

- **Mic / Camera** — mute or turn video off (initials show when camera is off).
- **Share screen** — best on **Chrome / Chromium / Edge**. Some Firefox + Linux setups return “Not supported” unless screen-capture portals (PipeWire / xdg-desktop-portal) are working.
- **Chat** — open the chat panel; a red badge appears for unread messages while it is closed.
- **Leave** — red hang-up button returns to the lobby and releases camera/mic.

## Project layout

```
Pulong/
├── server.js              # Single process: Next.js + Socket.io on one port
├── frontend/              # Next.js App Router UI (lobby, room, WebRTC client)
├── backend/               # Socket.io signaling (rooms, SDP/ICE relay, chat)
├── shared/                # Event name contracts used by frontend + backend
├── package.json           # npm scripts: dev / build / start / lint
└── LICENSE                # MIT
```

## How it works (short)

1. **Signaling** (Socket.io on the same HTTP server as the UI) exchanges room membership,
   WebRTC offers/answers, ICE candidates, screen-share signals, and chat text.
2. **Media** (camera, mic, screen) travels **directly between browsers** via WebRTC.
   Streams are not uploaded to or stored on the Pulong server.
3. **NAT** uses free public STUN servers (Google / Cloudflare). There is **no TURN** relay
   in this MVP — some strict networks may fail to connect.

## Known limits (MVP)

- Recommended for about **2–8 participants** (full mesh; bandwidth grows with group size).
- No cloud recording, waiting rooms, or large webinars.
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
