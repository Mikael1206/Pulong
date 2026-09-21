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

  const canProceed = name.trim().length > 0;

  function handleNewMeeting() {
    if (!canProceed) return;
    setDisplayName(name);
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  }

  function handleJoin() {
    if (!canProceed || joinInput.trim().length === 0) return;
    setDisplayName(name);
    const roomId = extractRoomId(joinInput);
    router.push(`/room/${roomId}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-8 text-center">
      <div className="flex items-center gap-3">
        <Video className="w-10 h-10" />
        <h1 className="text-4xl font-bold">Pulong</h1>
      </div>
      <p className="max-w-md text-sm text-foreground/70">
        Free, open-source, unlimited-duration video meetings. No accounts, no
        time limits, no cost.
      </p>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground/50"
          maxLength={40}
        />

        <button
          type="button"
          onClick={handleNewMeeting}
          disabled={!canProceed}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          New Meeting
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-foreground/15" />
          <span className="text-xs text-foreground/50">or</span>
          <div className="h-px flex-1 bg-foreground/15" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Paste a meeting link or code"
            className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground/50"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={!canProceed || joinInput.trim().length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-foreground/20 px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/5"
          >
            <LogIn className="w-4 h-4" />
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
