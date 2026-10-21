"use client";

import { showPreferences } from "vanilla-cookieconsent";

export function CookieSettings() {
  return (
    <button
      type="button"
      onClick={() => showPreferences()}
      className="link-underline hover:text-foreground"
    >
      Cookie settings
    </button>
  );
}
