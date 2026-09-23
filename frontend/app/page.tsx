"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, ArrowRight, LogIn } from "lucide-react";
import { generateRoomId, extractRoomId } from "@/lib/room-id";
import { setDisplayName } from "@/lib/display-name";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canProceed = name.trim().length > 0;

  function handleNewMeeting() {
    if (!canProceed || busy) return;
    try {
      setError(null);
      setBusy(true);
      setDisplayName(name);
      const roomId = generateRoomId();
      router.push(`/room/${roomId}`);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "Could not start a meeting. Try again."
      );
    }
  }

  function handleJoin() {
    if (!canProceed || joinInput.trim().length === 0 || busy) return;
    try {
      setError(null);
      const roomId = extractRoomId(joinInput);
      if (!roomId.trim()) {
        setError("Enter a valid meeting link or room code.");
        return;
      }
      setBusy(true);
      setDisplayName(name);
      router.push(`/room/${roomId}`);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "Could not join that meeting. Check the link and try again."
      );
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8 text-center">
      {/* Warm paper-grain plane — Pulong-specific, not generic dark void */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1a1510_0%,_#0a0a0a_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <Video className="h-10 w-10 text-emerald-400" aria-hidden />
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              Pulong
            </h1>
          </div>
          <p className="max-w-md text-sm text-[var(--muted)]">
            Free class calls that do not cut off mid-lecture. No accounts, no
            40-minute timer, no Pro plan — for PH students and instructors.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4 text-left">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="display-name" className="text-xs font-medium text-[var(--muted)]">
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Mikael"
              className="focus-ring w-full rounded-lg border border-foreground/20 bg-background/80 px-4 py-2.5 text-sm"
              maxLength={40}
              autoComplete="nickname"
            />
          </div>

          <button
            type="button"
            onClick={handleNewMeeting}
            disabled={!canProceed || busy}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            {busy ? "Opening room…" : "New Meeting"}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-foreground/15" />
            <span className="text-xs text-[var(--muted)]">or join with a link</span>
            <div className="h-px flex-1 bg-foreground/15" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="join-input" className="text-xs font-medium text-[var(--muted)]">
              Meeting link or room code
            </label>
            <div className="flex gap-2">
              <input
                id="join-input"
                type="text"
                value={joinInput}
                onChange={(e) => {
                  setJoinInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Paste link or code"
                className="focus-ring flex-1 rounded-lg border border-foreground/20 bg-background/80 px-4 py-2.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={!canProceed || joinInput.trim().length === 0 || busy}
                className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-foreground/20 px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-foreground/5"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Join
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
