"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ContactSource } from "./source";

type FormState = "idle" | "sending" | "success" | "error";

const FALLBACK_ERROR =
  "Ihre Nachricht konnte nicht gesendet werden. Bitte schreiben Sie stattdessen an impressum-beastyrabbit@heerlab.com.\nYour message could not be sent. Please email impressum-beastyrabbit@heerlab.com instead.";
const INPUT_CLASS =
  "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

export function ContactForm({ source }: { source?: ContactSource }) {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || inFlight.current) return;
    inFlight.current = true;
    const fields = new FormData(event.currentTarget);
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/kontakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          email: fields.get("email"),
          message: fields.get("message"),
          website: fields.get("website"),
          ...(source ? { source } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        setError(
          typeof result.error === "string" ? result.error : FALLBACK_ERROR,
        );
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setError(FALLBACK_ERROR);
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }

  if (state === "success") {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-100"
      >
        <p>
          Danke, Ihre Nachricht wurde gesendet. Ihre Anfrage wird per E-Mail
          beantwortet.
        </p>
        <p lang="en" className="mt-2 text-sm">
          Thank you, your message has been sent. You will get a reply by email.
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      className="ph-no-capture ph-mask space-y-5"
      aria-label="Kontaktformular"
      aria-busy={state === "sending"}
    >
      <div>
        <label htmlFor="contact-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="text-sm font-medium">
          E-Mail / <span lang="en">Email</span>
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="text-sm font-medium">
          Nachricht / <span lang="en">Message</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          className={`${INPUT_CLASS} resize-y`}
        />
      </div>
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {state === "error" ? (
        <p role="alert" className="whitespace-pre-line text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!hydrated || state === "sending"}
        className="min-h-11 w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {state === "sending"
          ? "Wird gesendet … / Sending …"
          : "Nachricht senden / Send message"}
      </button>
    </form>
  );
}
