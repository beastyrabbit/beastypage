"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import * as CookieConsent from "vanilla-cookieconsent";
import { track } from "@/lib/analytics";
import { telemetryConfig, telemetryEnabled } from "@/lib/telemetry/config";
import { outboundHost } from "@/lib/telemetry/outbound";
import { isOverlayRoute } from "@/lib/telemetry/overlay";
import { STORAGE_INVENTORY } from "@/lib/telemetry/storage-inventory";
import { createUmamiLoader } from "@/lib/telemetry/umami";
import "vanilla-cookieconsent/dist/cookieconsent.css";
import "./telemetry.css";

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const overlay = isOverlayRoute(usePathname());
  const { isLoaded, isSignedIn, user } = useUser();
  const previousAuth = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const previous = previousAuth.current;
    previousAuth.current = Boolean(isSignedIn);
    // Initial hydration is not a sign-in. Report only observed state transitions.
    if (previous === undefined || previous === Boolean(isSignedIn)) return;
    if (!isSignedIn) track("auth_signed_out", {});
    else {
      const justCreated =
        user?.createdAt && Date.now() - user.createdAt.getTime() < 60_000;
      track(justCreated ? "auth_signed_up" : "auth_signed_in", {});
    }
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    if (overlay) return;
    let active = true;
    const updateConsent = createUmamiLoader({
      enabled: telemetryEnabled,
      host: telemetryConfig.umamiHost,
      websiteId: telemetryConfig.websiteId,
      domains: telemetryConfig.domains,
    });
    const sync = () => {
      if (active) updateConsent(CookieConsent.acceptedCategory("analytics"));
    };
    void CookieConsent.run({
      root: "body",
      autoShow: true,
      hideFromBots: false,
      disablePageInteraction: false,
      cookie: { name: "cc_cookie", expiresAfterDays: 182 },
      guiOptions: {
        consentModal: {
          layout: "box",
          position: "bottom left",
          equalWeightButtons: true,
        },
        preferencesModal: { layout: "box", equalWeightButtons: true },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {
          enabled: false,
          autoClear: { cookies: [{ name: /^umami[._]/ }] },
        },
      },
      onConsent: sync,
      onChange: sync,
      language: {
        default: "en",
        translations: {
          en: {
            consentModal: {
              title: "Your privacy, your choice",
              description:
                'We use necessary storage for sign-in and the tools you use. With your permission, self-hosted Umami also measures visits and interactions, including masked session replay and heatmaps. Error tracking runs without cookies or device storage. <a href="/privacy">Read our privacy policy</a>.',
              acceptAllBtn: "Accept analytics",
              acceptNecessaryBtn: "Necessary only",
              showPreferencesBtn: "Choose settings",
            },
            preferencesModal: {
              title: "Cookie and storage settings",
              acceptAllBtn: "Accept analytics",
              acceptNecessaryBtn: "Necessary only",
              savePreferencesBtn: "Save settings",
              closeIconLabel: "Close settings",
              sections: [
                {
                  title: "Your choice",
                  description:
                    'Analytics is optional and off until you accept. You can change your choice from the footer at any time. Withdrawing analytics reloads this page to stop recording. <a href="/privacy">Privacy policy</a>.',
                },
                ...(["necessary", "analytics"] as const).map((category) => ({
                  title:
                    category === "necessary"
                      ? "Necessary storage"
                      : "Optional analytics",
                  description:
                    category === "necessary"
                      ? "Sign-in security, consent, and storage needed for features you request. GlitchTip reports technical errors without cookies, device storage, or user identity."
                      : "Umami is self-hosted in Germany. It records pageviews, product events, performance, masked replay and heatmaps after consent. It sets no cookies and does not write local or session storage.",
                  linkedCategory: category,
                  cookieTable: {
                    headers: {
                      name: "Name",
                      storage: "Storage",
                      description: "Purpose",
                      duration: "Duration",
                    },
                    body: STORAGE_INVENTORY.filter(
                      (item) => item.category === category,
                    ).map((item) => ({
                      name: item.name,
                      storage: item.storage,
                      description: item.purpose,
                      duration: item.duration,
                    })),
                  },
                })),
              ],
            },
          },
        },
      },
    }).then(sync);
    const click = (event: MouseEvent) => {
      const host = outboundHost(event.target, window.location.origin);
      if (host) track("outbound_link_clicked", { host });
    };
    document.addEventListener("click", click, true);
    return () => {
      active = false;
      document.removeEventListener("click", click, true);
      CookieConsent.reset(false);
      // Entering a browser source removes the recorder with a reload if loaded.
      // The URL guard already blocks sends before this effect runs.
      updateConsent(false);
    };
  }, [overlay]);

  // Block signed-in content entirely; mask text in anonymous tools too.
  return <div className={isSignedIn ? "rr-block" : "rr-mask"}>{children}</div>;
}
