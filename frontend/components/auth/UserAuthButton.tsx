"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation } from "convex/react";
import { Loader2, LogIn, User, LogOut } from "lucide-react";
import { useSignIn, useSignOut } from "@/lib/shooAuth";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

export function UserAuthButton() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const hasCreatedRef = useRef(false);
  const handleSignIn = useSignIn();
  const handleSignOut = useSignOut();

  // Ensure user doc exists in Convex after login
  useEffect(() => {
    if (isAuthenticated && !hasCreatedRef.current) {
      hasCreatedRef.current = true;
      getOrCreateUser().catch(() => {
        // Silently ignore -- user doc may already exist or identity may not be ready yet
        hasCreatedRef.current = false;
      });
    }
    if (!isAuthenticated) {
      hasCreatedRef.current = false;
    }
  }, [isAuthenticated, getOrCreateUser]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    if (dropdownOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
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
        onClick={handleSignIn}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border/50",
          "px-3 py-1.5 text-xs font-semibold text-muted-foreground",
          "transition hover:bg-foreground hover:text-background"
        )}
      >
        <LogIn className="size-3.5" />
        Sign in
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          "border border-border/50 bg-primary/15 text-primary",
          "transition hover:bg-primary/25"
        )}
        aria-label="User menu"
      >
        <User className="size-4" />
      </button>

      {dropdownOpen && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-40",
            "rounded-lg border border-border/40 bg-background/95 backdrop-blur",
            "shadow-lg"
          )}
        >
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            className={cn(
              "flex w-full items-center gap-2 rounded-t-lg px-3 py-2",
              "text-sm text-foreground transition hover:bg-foreground/10"
            )}
          >
            <User className="size-3.5" />
            Profile
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              handleSignOut();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-b-lg px-3 py-2",
              "text-sm text-muted-foreground transition hover:bg-foreground/10"
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
