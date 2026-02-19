"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { Loader2, ShieldQuestion } from "lucide-react";
import FilledCheckedIcon from "@/components/ui/filled-checked-icon";
import RefreshIcon from "@/components/ui/refresh-icon";
import XIcon from "@/components/ui/x-icon";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

type InviteStatus = "idle" | "loadingChallenge" | "ready" | "submitting" | "success" | "error";

interface ChallengePayload {
  token: string;
  prompt: string;
  expiresAt: number;
}

function sumFromPrompt(prompt: string) {
  const [leftRaw, rightRaw] = prompt.split("+");
  const left = Number.parseInt((leftRaw ?? "").trim(), 10);
  const right = Number.parseInt((rightRaw ?? "").trim(), 10);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }
  return left + right;
}

function getCooldownDuration(attempt: number): number {
  const schedule = [60, 180, 600];
  if (attempt <= schedule.length) {
    return schedule[attempt - 1];
  }
  const extra = attempt - schedule.length;
  const base = schedule[schedule.length - 1];
  return base * Math.pow(2, extra);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    const minutePart = minutes > 0 ? ` ${minutes}m` : "";
    return `${hours}h${minutePart}`;
  }
  if (minutes > 0) {
    const secondPart = seconds > 0 ? ` ${seconds}s` : "";
    return `${minutes}m${secondPart}`;
  }
  return `${seconds}s`;
}

export function DiscordInviteButton({ className }: { className?: string }) {
  const issueChallenge = useMutation(api.discord.issueChallenge);
  const redeemChallenge = useMutation(api.discord.redeemChallenge);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<InviteStatus>("idle");
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const resetState = useCallback(() => {
    setStatus("idle");
    setChallenge(null);
    setAnswer("");
    setError(null);
    setInviteUrl(null);
    setCopied(false);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    resetState();
  }, [resetState]);

  const requestChallenge = useCallback(
    async (options?: { message?: string; avoidAnswer?: number }) => {
      const now = Date.now();
      if (cooldownUntil && now < cooldownUntil) {
        setStatus("error");
        setInviteUrl(null);
        setChallenge(null);
        setAnswer("");
        setCopied(false);
        setError(`Please wait ${formatDuration(cooldownUntil - now)} before trying again.`);
        return;
      }

      setStatus("loadingChallenge");
      setError(null);
      setInviteUrl(null);
      setAnswer("");
      setCopied(false);

      try {
        let payload = await issueChallenge();
        if (typeof options?.avoidAnswer === "number") {
          let attempts = 0;
          while (sumFromPrompt(payload.prompt) === options.avoidAnswer && attempts < 5) {
            payload = await issueChallenge();
            attempts += 1;
          }
        }
        setChallenge(payload);
        setStatus("ready");
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
        if (options?.message) {
          setError(options.message);
        }
      } catch (err) {
        setStatus("error");
        setInviteUrl(null);
        setChallenge(null);
        setError(err instanceof Error ? err.message : "Unable to start challenge.");
      }
    },
    [cooldownUntil, issueChallenge]
  );

  const submitAnswer = useCallback(async () => {
    if (!challenge || !answer.trim()) {
      return;
    }
    setStatus("submitting");
    setError(null);

    const previousAnswer = Number.parseInt(answer, 10);

    try {
      const result = await redeemChallenge({
        token: challenge.token,
        answer
      });

      if (result && typeof result === "object") {
        if ("status" in result) {
          if (result.status === "success") {
            setInviteUrl(result.inviteUrl);
            setStatus("success");
            setChallenge(null);
            setAnswer("");
            setAttemptCount(0);
            setCooldownUntil(null);
            return;
          }

          if (result.status === "retry") {
            const nextAttempt = attemptCount + 1;
            setAttemptCount(nextAttempt);
            const waitSeconds = getCooldownDuration(nextAttempt);
            const now = Date.now();
            setCooldownUntil(() => now + waitSeconds * 1000);
            setNowMs(now);
            setStatus("error");
            setInviteUrl(null);
            setChallenge(null);
            setAnswer("");
            setError(`${result.message ?? "Incorrect answer."} Try again in ${formatDuration(waitSeconds * 1000)}.`);
            return;
          }

          setStatus("error");
          setInviteUrl(null);
          setChallenge(null);
          setError(result.message);
          return;
        }

      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (/incorrect answer/i.test(message) || /answer must be a number/i.test(message) || /challenge (expired|timed out)/i.test(message)) {
        const nextAttempt = attemptCount + 1;
        setAttemptCount(nextAttempt);
        const waitSeconds = getCooldownDuration(nextAttempt);
        const now = Date.now();
        setCooldownUntil(() => now + waitSeconds * 1000);
        setNowMs(now);
        setStatus("error");
        setInviteUrl(null);
        setChallenge(null);
        setAnswer("");
        setError(`Not quite! Try again in ${formatDuration(waitSeconds * 1000)}.`);
        return;
      }

      setStatus("error");
      setInviteUrl(null);
      setChallenge(null);
      setError(message);
    }
  }, [redeemChallenge, challenge, answer, attemptCount]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      void requestChallenge();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, requestChallenge]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeDialog]);

  useEffect(() => {
    if ((status === "ready" || status === "submitting") && challenge && inputRef.current) {
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch {
        // Safari <15 and some browsers don't support preventScroll
        inputRef.current.focus();
      }
    }
  }, [status, challenge]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNowMs(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!cooldownUntil && !challenge) {
      return;
    }
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil, challenge]);

  const expiresLabel = useMemo(() => {
    if (!challenge) {
      return null;
    }
    const remainingMs = challenge.expiresAt - nowMs;
    if (remainingMs <= 0) {
      return "Challenge expired";
    }
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
    return remainingMinutes > 1
      ? `Expires in about ${remainingMinutes} minutes`
      : "Expires in under a minute";
  }, [challenge, nowMs]);

  const cooldownActive = useMemo(() => {
    if (!cooldownUntil) return false;
    return nowMs < cooldownUntil;
  }, [cooldownUntil, nowMs]);

  const cooldownLabel = useMemo(() => {
    if (!cooldownActive || !cooldownUntil) return null;
    return formatDuration(cooldownUntil - nowMs);
  }, [cooldownActive, cooldownUntil, nowMs]);

  async function handleCopy() {
    if (!inviteUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy invite.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitAnswer();
  }

  function handleOpen() {
    setOpen(true);
  }

  const overlay = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur" aria-hidden onClick={closeDialog} />
      <div className="relative z-[81] flex w-full max-w-xl justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discord-invite-title"
          className="relative w-full max-w-md transform overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-background via-background/95 to-background shadow-[0_40px_120px_-30px_rgba(15,15,45,0.65)] ring-1 ring-border/40 transition-all duration-200 ease-out"
        >
          <div ref={contentRef} className="max-h-[85dvh] overflow-auto px-6 pb-7 pt-8 sm:px-9 sm:pb-9">
            <button
              type="button"
              onClick={closeDialog}
              className="absolute right-5 top-5 rounded-full bg-muted/60 p-1 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
              aria-label="Close dialog"
            >
              <XIcon size={16} />
            </button>

            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary shadow-inner">
                  <ShieldQuestion className="h-6 w-6" />
                </span>
                <div>
                  <h2 id="discord-invite-title" className="text-lg font-semibold leading-tight">
                    Unlock the Discord invite
                  </h2>
                  <p className="text-xs text-muted-foreground">Solve a quick challenge so bots stay out.</p>
                </div>
              </div>

              <div className="space-y-4 text-sm">
                {status === "loadingChallenge" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/40 px-4 py-3 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading your challenge…</span>
                  </div>
                ) : null}

                {status === "error" ? (
                  <div className="space-y-4">
                    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error ?? "Something went wrong."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void requestChallenge()}
                      disabled={cooldownActive}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshIcon size={14} />
                      {cooldownActive && cooldownLabel ? `Try again in ${cooldownLabel}` : "Try another challenge"}
                    </button>
                  </div>
                ) : null}

                {(status === "ready" || status === "submitting") && challenge ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <p>
                      What is <span className="font-semibold">{challenge.prompt}</span>? Enter the answer to reveal the invite.
                    </p>
                    {expiresLabel ? <p className="text-xs text-muted-foreground">{expiresLabel}</p> : null}
                    <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground">
                      Your answer
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        ref={inputRef}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        required
                        aria-describedby={error ? "discord-invite-error" : undefined}
                      />
                    </label>
                    {error && status === "ready" ? (
                      <p id="discord-invite-error" className="text-xs text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="submit"
                        disabled={status === "submitting"}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Reveal invite
                      </button>
                      <button
                        type="button"
                        onClick={() => void requestChallenge()}
                        disabled={cooldownActive}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshIcon size={14} />
                        {cooldownActive && cooldownLabel ? `Wait ${cooldownLabel}` : "New challenge"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {status === "success" && inviteUrl ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/12 px-4 py-3 text-sm text-foreground shadow-inner">
                      <FilledCheckedIcon size={16} className="text-primary" />
                      <div>
                        <p className="font-semibold">Invite unlocked</p>
                        <p className="text-xs text-muted-foreground">Open the invite in a new tab or copy it for later.</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => window.open(inviteUrl, "_blank", "noopener,noreferrer")}
                        className="inline-flex flex-1 items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                      >
                        Open Discord
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="inline-flex flex-1 items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        {copied ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background transition hover:opacity-90",
          className
        )}
      >
        Join the Discord
      </button>

      {typeof document !== "undefined" && open ? createPortal(overlay, document.body) : null}
    </>
  );
}
