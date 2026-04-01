"use client";

import { useState, useEffect } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Loader2, Save, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useSignIn, useSignOut, useProfilePic } from "@/lib/shooAuth";
import { setAccountDeleting } from "@/components/auth/UserAuthButton";
import { PageHero } from "@/components/common/PageHero";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const handleSignIn = useSignIn();
  const handleSignOut = useSignOut();
  const profilePic = useProfilePic();

  const [username, setUsername] = useState("");
  const [showProfilePic, setShowProfilePic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Seed form fields from viewer data
  useEffect(() => {
    if (viewer && !initialized) {
      setUsername(viewer.username ?? "");
      setShowProfilePic(viewer.showProfilePic ?? true);
      setInitialized(true);
    }
  }, [viewer, initialized]);

  // Reset form state on sign-out
  useEffect(() => {
    if (!isAuthenticated) {
      setInitialized(false);
      setUsername("");
      setShowProfilePic(true);
    }
  }, [isAuthenticated]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    setAccountDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted");
    } catch (err) {
      setAccountDeleting(false);
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
      return;
    }
    handleSignOut();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ username: username.trim() || undefined, showProfilePic });
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
            Sign in
          </button>
        </div>
      </main>
    );
  }

  const isLoading = viewer === undefined;
  const initial = viewer?.username?.[0]?.toUpperCase();

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <PageHero
        eyebrow="Profile"
        title={viewer?.username ? `Hello ${viewer.username}` : "Hii You?"}
      />

      {isLoading || !viewer ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
        <section className="rounded-2xl border border-border/40 bg-background/80 p-6 backdrop-blur">
          <div className="space-y-6">
            {/* Avatar + Username Preview */}
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex size-16 items-center justify-center overflow-hidden rounded-full",
                  "border border-border/50 bg-primary/15"
                )}
              >
                {showProfilePic && profilePic ? (
                  <img
                    src={profilePic}
                    alt="Profile"
                    className="size-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : initial ? (
                  <span className="text-xl font-bold text-primary">{initial}</span>
                ) : (
                  <User className="size-8 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {viewer.username ?? "No username set"}
                </p>
              </div>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-foreground"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                className={cn(
                  "w-full rounded-lg border border-border/50 bg-background px-3 py-2",
                  "text-sm text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
                placeholder="Choose a username"
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, hyphens, and underscores only. {username.length}/30
              </p>
            </div>

            {/* Show Profile Picture Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Show Profile Picture
                </p>
                <p className="text-xs text-muted-foreground">
                  When disabled, a generic icon will be shown instead.
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

        {/* Danger Zone */}
        <section className="rounded-2xl border border-red-500/30 bg-background/80 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-400">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <button
              onClick={handleDelete}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-red-500/50 px-4 py-2",
                "text-sm font-medium text-red-400 transition-colors",
                "hover:bg-red-500/10"
              )}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </section>
        </>
      )}
    </main>
  );
}
