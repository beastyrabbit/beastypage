"use client";

import { useQuery } from "convex/react";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

interface UserEntry {
  userId: string;
  username: string;
}

interface UserMultiSelectProps {
  /** Currently selected Clerk user IDs. */
  value: string[];
  /** Called when selection changes — receives Clerk user IDs. */
  onChange: (userIds: string[]) => void;
}

export function UserMultiSelect({ value, onChange }: UserMultiSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search users by prefix
  const results = useQuery(
    api.users.searchByUsername,
    search.trim().length > 0 ? { prefix: search.trim() } : "skip",
  );

  // Resolve current value to usernames for display
  const resolved = useQuery(
    api.users.resolveUsernames,
    value.length > 0 ? { userIds: value } : "skip",
  );

  const selectedMap = new Map<string, string>();
  if (resolved) {
    for (const r of resolved) {
      selectedMap.set(r.userId, r.username);
    }
  }

  const handleSelect = useCallback(
    (entry: UserEntry) => {
      if (!value.includes(entry.userId)) {
        onChange([...value, entry.userId]);
      }
      setSearch("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (userId: string) => {
      onChange(value.filter((id) => id !== userId));
    },
    [value, onChange],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter out already-selected users from results
  const filtered = results?.filter((r) => !value.includes(r.userId)) ?? [];

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-lg border border-border/50",
          "bg-background px-2 py-1.5 text-sm",
          "focus-within:ring-1 focus-within:ring-foreground/20",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((userId) => (
          <span
            key={userId}
            className="inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-0.5 text-xs font-medium"
          >
            {selectedMap.get(userId) ?? userId}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(userId);
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/20"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-0 size-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (search.trim().length > 0) setOpen(true);
            }}
            placeholder={value.length === 0 ? "Search by username…" : ""}
            className="w-full min-w-[120px] bg-transparent py-1 pl-5 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && search.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border/50 bg-background shadow-lg">
          {results === undefined ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Searching…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No users found
            </div>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.map((entry) => (
                <li key={entry.userId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(entry)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-foreground/5"
                  >
                    <span className="font-medium">{entry.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.userId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
