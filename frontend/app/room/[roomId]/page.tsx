"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { getDisplayName } from "@/lib/display-name";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [name, setName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedName = getDisplayName();
    if (!storedName) {
      // No display name in this session (e.g. the room URL was opened
      // directly) — send them back to the lobby instead of crashing.
      router.replace("/");
      return;
    }
    setName(storedName);
  }, [router]);

  async function handleCopyLink() {
    const url = `${window.location.origin}/room/${roomId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!name) {
    // Redirect is in-flight — render nothing rather than a flash of content.
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 text-center">
      <h1 className="text-2xl font-semibold">
        You&apos;re in room <span className="font-mono">{roomId}</span> as{" "}
        {name}
      </h1>
      <p className="max-w-md text-sm text-foreground/70">
        Video, audio, screen sharing, and chat land in the next build steps.
      </p>
      <button
        type="button"
        onClick={handleCopyLink}
        className="flex items-center gap-2 rounded-lg border border-foreground/20 px-4 py-2.5 text-sm font-medium hover:bg-foreground/5"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy Link
          </>
        )}
      </button>
    </div>
  );
}
