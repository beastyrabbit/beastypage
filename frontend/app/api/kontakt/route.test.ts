// @vitest-environment node

import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_SOURCE_SLUGS } from "@/app/kontakt/source";

const fetchMock = vi.fn<typeof fetch>();
const valid = {
  name: "Erika Muster",
  email: "erika@example.org",
  message: "Ich habe eine Frage zur Webseite.",
  website: "",
};
let POST: typeof import("./route").POST;

function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new Request("https://beastyrabbit.com/api/kontakt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": "192.0.2.5",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function sentMail() {
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

function expectedMail(source?: string) {
  return {
    from: "BeastyPage Kontaktformular <kontakt-formular@heerlab.com>",
    to: ["kontakt@heerlab.com"],
    reply_to: valid.email,
    subject: `${source ? `[${source}] ` : ""}Kontaktformular: ${valid.name}`,
    text: `Name: ${valid.name}\nE-Mail: ${valid.email}\n${source ? `Quelle: ${source}\n` : ""}Zeitpunkt: 2026-10-21T12:00:00.000Z\n\nNachricht:\n${valid.message}`,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  vi.stubEnv("CONTACT_RESEND_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: "fixture" }));
  ({ POST } = await import("./route"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/kontakt", () => {
  it("sends one plain-text mail through Resend with trimmed input and no request metadata", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const response = await POST(
      request(
        {
          ...valid,
          name: `  ${valid.name}  `,
          email: ` ${valid.email} `,
          message: `\n${valid.message}\n`,
        },
        { "User-Agent": "private-test-agent" },
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        signal: expect.any(AbortSignal),
        body: JSON.stringify(expectedMail()),
      },
    );
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(sentMail()).toEqual(expectedMail());
    expect(sentMail()).not.toHaveProperty("html");
    expect(sentMail().text).not.toContain("192.0.2.5");
    expect(sentMail().text).not.toContain("private-test-agent");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(CONTACT_SOURCE_SLUGS)(
    "includes the allowlisted source %s in the mail",
    async (source) => {
      expect((await POST(request({ ...valid, source }))).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(sentMail()).toEqual(expectedMail(source));
    },
  );

  it.each([
    undefined,
    "moddrop\r\nBcc: x",
    "evil",
    "MODDROP",
    ["moddrop"],
    " moddrop ",
    null,
    42,
    { site: "moddrop" },
  ])("silently drops an invalid or missing source: %j", async (source) => {
    const response = await POST(request({ ...valid, source }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentMail()).toEqual(expectedMail());
  });

  it.each([
    ["name missing", { name: undefined }],
    ["empty name", { name: "  " }],
    ["long name", { name: "a".repeat(101) }],
    ["non-string name", { name: 42 }],
    ["email missing", { email: undefined }],
    ["empty email", { email: " " }],
    ["invalid email", { email: "not-an-email" }],
    ["email with display name", { email: "Someone <someone@example.org>" }],
    [
      "long email",
      {
        email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(59)}.org`,
      },
    ],
    ["non-string email", { email: false }],
    ["message missing", { message: undefined }],
    ["empty message", { message: " " }],
    ["short message", { message: "123456789" }],
    ["short after trim", { message: " 123456789 " }],
    ["long message", { message: "a".repeat(5001) }],
    ["non-string message", { message: [] }],
    ["non-string honeypot", { website: 1 }],
    ["name CR injection", { name: "Erika\rBcc: hidden@example.org" }],
    ["name LF injection", { name: "Erika\nBcc: hidden@example.org" }],
    [
      "email CRLF injection",
      { email: "erika@example.org\r\nBcc: hidden@example.org" },
    ],
    ["name trailing CRLF", { name: "Erika\r\n" }],
    ["email leading LF", { email: "\nerika@example.org" }],
  ])("rejects %s", async (_label, fields) => {
    const response = await POST(request({ ...valid, ...fields }));
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error).toContain("Bitte prüfen Sie Ihre Angaben");
    expect(error).toContain("Please check your details");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, [], "message"])(
    "rejects a non-object body: %j",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("accepts the name and message length boundaries", async () => {
    expect(
      (await POST(request({ ...valid, name: "A", message: "a".repeat(10) })))
        .status,
    ).toBe(200);
    expect(
      (
        await POST(
          request(
            {
              ...valid,
              name: "A".repeat(100),
              message: "a".repeat(5000),
            },
            { "X-Real-IP": "192.0.2.6" },
          ),
        )
      ).status,
    ).toBe(200);
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
    "rejects content type %s",
    async (contentType) => {
      expect(
        (await POST(request(valid, { "Content-Type": contentType }))).status,
      ).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/kontakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the declared and actual body size, including multibyte text", async () => {
    expect(
      (await POST(request(valid, { "Content-Length": "16385" }))).status,
    ).toBe(413);
    expect(
      (await POST(request({ ...valid, ignored: "a".repeat(16_384) }))).status,
    ).toBe(413);
    expect(
      (
        await POST(
          request(
            { ...valid, ignored: "ä".repeat(9000) },
            { "Content-Length": "1" },
          ),
        )
      ).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the same success for a honeypot without sending or using a quota", async () => {
    const real = await POST(request());
    for (let i = 0; i < 4; i++) {
      const honey = await POST(
        request({ ...valid, website: "https://spam.invalid" }),
      );
      expect(honey.status).toBe(real.status);
      await expect(honey.json()).resolves.toEqual({ success: true });
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.stubEnv("CONTACT_RESEND_API_KEY", undefined);
    expect((await POST(request({ ...valid, website: "filled" }))).status).toBe(
      200,
    );
  });

  it("rejects the second concurrent submission from one IP and allows another IP", async () => {
    const responses = await Promise.all(
      Array.from({ length: 2 }, () => POST(request())),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 429]);
    expect(responses[1].headers.get("retry-after")).toBe("600");
    await expect(responses[1].json()).resolves.toEqual({
      error:
        "Zu viele Anfragen. Bitte versuchen Sie es in 10 Minuten erneut.\nToo many requests. Please try again in 10 minutes.",
    });
    expect(
      (await POST(request(valid, { "X-Real-IP": "192.0.2.6" }))).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps global mail volume at 10 per pod and expires all entries without further traffic", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await POST(request(valid, { "X-Real-IP": `192.0.2.${i + 1}` })))
          .status,
      ).toBe(200);
    expect(
      (await POST(request(valid, { "X-Real-IP": "192.0.2.99" }))).status,
    ).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
    expect((await POST(request())).status).toBe(200);
  });

  it("uses a rolling window for staggered submissions", async () => {
    await POST(request());
    await vi.advanceTimersByTimeAsync(60_000);
    const otherClient = () => request(valid, { "X-Real-IP": "192.0.2.6" });
    expect((await POST(otherClient())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect((await POST(otherClient())).status).toBe(429);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect((await POST(otherClient())).status).toBe(429);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await POST(otherClient())).status).toBe(200);
  });

  it("does not spend a quota on validation failures", async () => {
    for (let i = 0; i < 4; i++)
      await POST(request({ ...valid, message: "short" }));
    expect((await POST(request())).status).toBe(200);
  });

  it.each([undefined, ""])(
    "returns 503 when the Resend API key is missing or empty: %j",
    async (key) => {
      vi.stubEnv("CONTACT_RESEND_API_KEY", key);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await POST(request());
      expect(response.status).toBe(503);
      const result = await response.json();
      expect(result.error).toContain("impressum-beastyrabbit@heerlab.com");
      expect(result.error).toContain("Your message could not be sent.");
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "Contact mail unavailable (configuration)",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 403, 429, 500, 503])(
    "returns a generic error for Resend HTTP %i without leaking provider response data",
    async (status) => {
      const providerResponse = new Response(
        JSON.stringify({ ...valid, key: "test-key", ip: "192.0.2.5" }),
        { status },
      );
      const readText = vi.spyOn(providerResponse, "text");
      const readJson = vi.spyOn(providerResponse, "json");
      fetchMock.mockResolvedValue(providerResponse);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const info = vi.spyOn(console, "log").mockImplementation(() => {});
      const response = await POST(request());
      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result.error).toContain("impressum-beastyrabbit@heerlab.com");
      expect(result.error).toContain("Your message could not be sent.");
      expect(log).toHaveBeenCalledExactlyOnceWith(
        `Contact mail failed (resend_${status})`,
      );
      expect(warn).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(readText).not.toHaveBeenCalled();
      expect(readJson).not.toHaveBeenCalled();
      const output = JSON.stringify({ result, logs: log.mock.calls });
      for (const value of [
        valid.name,
        valid.email,
        valid.message,
        "192.0.2.5",
        "test-key",
      ])
        expect(output).not.toContain(value);
    },
  );

  it.each(["network", "timeout"])(
    "returns a generic error after a %s failure without logging input",
    async (failure) => {
      const details = JSON.stringify({
        ...valid,
        key: "test-key",
        ip: "192.0.2.5",
      });
      fetchMock.mockRejectedValue(
        failure === "timeout"
          ? new DOMException(details, "TimeoutError")
          : new Error(details),
      );
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await POST(request());
      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result.error).toContain("impressum-beastyrabbit@heerlab.com");
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "Contact mail failed (resend_error)",
      );
      const output = JSON.stringify({ result, logs: log.mock.calls });
      for (const value of [
        valid.name,
        valid.email,
        valid.message,
        "192.0.2.5",
        "test-key",
      ])
        expect(output).not.toContain(value);
    },
  );

  it("resolves the trusted ingress header, falls back to rightmost XFF, and canonicalizes IPs", async () => {
    const { contactClientIp } = await import(
      "@/server/services/contact/rate-limit"
    );
    expect(
      contactClientIp(
        new Headers({
          "X-Real-IP": "192.0.2.7",
          "X-Forwarded-For": "198.51.100.2, 192.0.2.8",
        }),
      ),
    ).toBe("192.0.2.7");
    expect(
      contactClientIp(new Headers({ "X-Forwarded-For": "spoofed, 192.0.2.8" })),
    ).toBe("192.0.2.8");
    expect(
      contactClientIp(new Headers({ "X-Real-IP": "::ffff:192.0.2.7" })),
    ).toBe("192.0.2.7");
    expect(
      contactClientIp(new Headers({ "X-Real-IP": "2001:0db8:0:0::1" })),
    ).toBe("2001:db8::1");
    expect(contactClientIp(new Headers({ "X-Real-IP": "invalid" }))).toBe(
      "unknown",
    );
    expect(contactClientIp(new Headers())).toBe("unknown");
  });

  it("keeps the main-domain contact page and API public during maintenance", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "1");
    const { routeRequest, proxy } = await import("@/proxy");
    for (const path of ["/kontakt", "/api/kontakt", "/api/kontakt/"]) {
      const response = routeRequest(
        new NextRequest(`https://beastyrabbit.com${path}`, {
          method: path === "/kontakt" ? "GET" : "POST",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
    for (const path of ["/api/kontakt", "/api/kontakt/"]) {
      const response = await proxy(
        new NextRequest(`https://beastyrabbit.com${path}`, { method: "POST" }),
        {} as NextFetchEvent,
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    }
    expect(
      routeRequest(
        new NextRequest("https://beastyrabbit.com/api/cats/profile", {
          method: "POST",
        }),
      ).status,
    ).toBe(503);
    expect((await POST(request())).status).toBe(200);
  });
});
