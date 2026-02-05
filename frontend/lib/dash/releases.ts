import type { ReleaseNote } from "./types";

export async function fetchReleases(): Promise<ReleaseNote[]> {
  const res = await fetch("/api/releases");
  if (!res.ok) {
    throw new Error(`Releases API returned ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    console.error("[fetchReleases] Expected array, got:", typeof data);
    return [];
  }
  return data as ReleaseNote[];
}
