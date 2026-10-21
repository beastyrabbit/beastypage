"use client";

export default function GlobalError({
  retry,
}: Readonly<{ error: unknown; retry: () => void }>) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: "2rem",
          lineHeight: 1.6,
        }}
      >
        <h1>Something went wrong</h1>
        <p>Please try loading this page again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
        <nav aria-label="Legal" style={{ marginTop: "2rem" }}>
          <a href="/impressum" lang="de">
            Impressum
          </a>
          {" · "}
          <a href="/datenschutz" lang="de">
            Datenschutz
          </a>
          {" · "}
          <a href="/legal-notice">Legal notice</a>
          {" · "}
          <a href="/privacy">Privacy</a>
        </nav>
      </body>
    </html>
  );
}
