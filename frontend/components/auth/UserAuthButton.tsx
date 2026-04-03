"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Loader2, LogIn, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { signIn, signOut } from "@/lib/shooAuth";
import { cn } from "@/lib/utils";

/**
 * Module-level flag to suppress getOrCreateUser after account deletion.
 * Set by the profile page before calling deleteAccount, cleared on sign-out.
 */
let _accountDeleting = false;
export function setAccountDeleting(v: boolean) {
  _accountDeleting = v;
}

export function UserAuthButton() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const viewer = useQuery(api.users.viewer);
  const hasCreatedRef = useRef(false);

  // Ensure user doc exists in Convex after login
  useEffect(() => {
    if (isAuthenticated && !hasCreatedRef.current && !_accountDeleting) {
      hasCreatedRef.current = true;
      getOrCreateUser().catch((err) => {
        console.error("[UserAuthButton] getOrCreateUser failed:", err);
        hasCreatedRef.current = false;
      });
    }
    if (!isAuthenticated) {
      hasCreatedRef.current = false;
      _accountDeleting = false;
    }
  }, [isAuthenticated, getOrCreateUser]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dropdownOpen]);

  if (isLoading) {
    return (
      <div className="flex size-8 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => signIn()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border/50",
          "px-3 py-1.5 text-xs font-semibold text-muted-foreground",
          "transition hover:bg-foreground hover:text-background",
        )}
      >
        <LogIn className="size-3.5" />
        Sign in
      </button>
    );
  }

  const initial = viewer?.username?.[0]?.toUpperCase();

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          "border border-border/50 overflow-hidden",
          "transition hover:ring-2 hover:ring-primary/30",
        )}
        aria-label="User menu"
      >
        <div className="flex size-full items-center justify-center bg-primary/15 text-primary">
          {initial ? (
            <span className="text-xs font-bold">{initial}</span>
          ) : (
            <User className="size-4" />
          )}
        </div>
      </button>

      {dropdownOpen && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-40",
            "rounded-lg border border-border/40 bg-background/95 backdrop-blur",
            "shadow-lg",
          )}
        >
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            className={cn(
              "flex w-full items-center gap-2 rounded-t-lg px-3 py-2",
              "text-sm text-foreground transition hover:bg-foreground/10",
            )}
          >
            <Settings className="size-3.5" />
            Profile
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              signOut();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-b-lg px-3 py-2",
              "text-sm text-muted-foreground transition hover:bg-foreground/10",
            )}
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
