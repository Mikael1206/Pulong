# Pulong

Free, open-source, browser-based video meetings — no accounts, no time limits, no cost.

Pulong exists because free tiers of Zoom, Google Meet, and Microsoft Teams cut group calls
off after 40–60 minutes, interrupting classes and study sessions right when they matter most.
Pulong removes that artificial wall entirely: create a room, share the link, and talk for as
long as you need.

## Features

- **Instant rooms** — no sign-up, no login, no email required to host or join.
- **Peer-to-peer video & audio** — direct browser-to-browser WebRTC, unlimited duration.
- **Screen sharing** — swap your camera feed for a shared tab/window/screen mid-call.
- **In-call text chat** — share links and ask questions without interrupting the speaker.
- **Zero cost** — runs on free-tier infra or entirely on your own machine.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router, TypeScript, Tailwind CSS)
- [Socket.io](https://socket.io/) for WebRTC signaling (room join, SDP offer/answer, ICE)
- Native browser [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) for
  peer-to-peer media (audio, video, screen share) — no third-party call SDK, no vendor lock-in

## Getting started

Requires Node.js 18.18+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — that's it, no environment variables or
external accounts needed to run locally.

## How it works

The Next.js app and the Socket.io signaling server share a single Node.js HTTP process
(`server.js`). The signaling server only ever relays connection metadata (who's in a room,
SDP offers/answers, ICE candidates) — actual audio, video, and screen-share media travel
directly between browsers and are never stored or routed through the server.

## Status

Actively being built. See open items and progress in this repository's issue tracker.

## License

MIT
