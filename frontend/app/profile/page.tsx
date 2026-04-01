"use client";

import { useState, useEffect } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useSignIn } from "@/lib/shooAuth";
import { PageHero } from "@/components/common/PageHero";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const updateProfile = useMutation(api.users.updateProfile);
  const handleSignIn = useSignIn();

  const [displayName, setDisplayName] = useState("");
  const [showProfilePic, setShowProfilePic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Seed form fields from viewer data
  useEffect(() => {
    if (viewer && !initialized) {
      setDisplayName(viewer.displayName ?? "");
      setShowProfilePic(viewer.showProfilePic ?? true);
      setInitialized(true);
    }
  }, [viewer, initialized]);

  // Reset form state on sign-out
  useEffect(() => {
    if (!isAuthenticated) {
      setInitialized(false);
      setDisplayName("");
      setShowProfilePic(true);
    }
  }, [isAuthenticated]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName, showProfilePic });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        <PageHero
          eyebrow="Profile"
          title="Sign in to continue"
          description="You need to be signed in to view and edit your profile."
        />
        <div className="flex justify-center">
          <button
            onClick={handleSignIn}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50",
              "px-5 py-2.5 text-sm font-semibold text-muted-foreground",
              "transition hover:bg-foreground hover:text-background"
            )}
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  const isLoading = viewer === undefined;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <PageHero
        eyebrow="Profile"
        title="Your Profile"
        description="Manage your display name and profile picture settings."
      />

      {isLoading || !viewer ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
          <div className="space-y-6">
            {/* Profile Picture Preview */}
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex size-16 items-center justify-center overflow-hidden rounded-full",
                  "border border-border/50 bg-primary/15"
                )}
              >
                {showProfilePic && viewer.profilePicUrl ? (
                  <img
                    src={viewer.profilePicUrl}
                    alt="Profile"
                    className="size-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="size-8 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {viewer.displayName ?? "Anonymous"}
                </p>
                {viewer.email && (
                  <p className="text-xs text-muted-foreground">{viewer.email}</p>
                )}
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-foreground"
              >
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className={cn(
                  "w-full rounded-lg border border-border/50 bg-background px-3 py-2",
                  "text-sm text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
                placeholder="Enter your display name"
              />
              <p className="text-xs text-muted-foreground">
                {displayName.length}/50 characters
              </p>
            </div>

            {/* Show Profile Picture Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Show Profile Picture
                </p>
                <p className="text-xs text-muted-foreground">
                  When enabled, your Google profile picture will be visible.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showProfilePic}
                onClick={() => setShowProfilePic((prev) => !prev)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
                  "border-2 border-transparent transition-colors",
                  showProfilePic ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-5 rounded-full bg-white shadow-lg",
                    "transition-transform",
                    showProfilePic ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2",
                  "text-sm font-medium text-white transition-colors",
                  "hover:bg-amber-700 disabled:opacity-50"
                )}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
