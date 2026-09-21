// Display-name storage — see handoff/TASK-002.md. Backed by sessionStorage
// only: ephemeral, cleared when the tab closes, no account/DB (INV-001,
// INV-003).

const STORAGE_KEY = "pulong:display-name";

export function getDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, name.trim());
}
