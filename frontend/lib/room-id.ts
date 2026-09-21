// Room ID generation — see handoff/TASK-002.md. No accounts or server-side
// room registry (INV-001), so a client-generated random ID is sufficient.

/**
 * Generates a short, URL-safe, unique room ID.
 * Uses the first segment of a crypto UUID — collision odds are negligible
 * for a single-night, small-group use case (docs/prd.md BR-002: ~8 users/room).
 */
export function generateRoomId(): string {
  return crypto.randomUUID().split("-")[0];
}

/**
 * Extracts a room ID from either a bare ID or a full pasted meeting URL
 * (e.g. "http://localhost:3000/room/abc123" -> "abc123").
 */
export function extractRoomId(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const roomIndex = segments.indexOf("room");
    if (roomIndex !== -1 && segments[roomIndex + 1]) {
      return segments[roomIndex + 1];
    }
    // No "/room/{id}" segment found in the URL — fall back to the raw input.
    return trimmed;
  } catch {
    // Not a valid URL, treat it as a bare room ID.
    return trimmed;
  }
}
