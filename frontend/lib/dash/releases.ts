import type { ReleaseNote } from "./types";

export async function fetchReleases(): Promise<ReleaseNote[]> {
  const res = await fetch("/api/releases");
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as ReleaseNote[]) : [];
}
