// Client-generated room IDs — no server registry (INV-001). The room URL is
// the capability token (INV-AS-001 waiver in docs/decision-ledger.md).

/**
 * First segment of a crypto UUID — collision odds are negligible for
 * classroom-sized rooms sharing links out-of-band.
 */
export function generateRoomId(): string {
  return crypto.randomUUID().split("-")[0];
}

/** Accept a bare room code or a full `/room/{id}` URL paste. */
export function extractRoomId(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const roomIndex = segments.indexOf("room");
    if (roomIndex !== -1 && segments[roomIndex + 1]) {
      return segments[roomIndex + 1];
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
