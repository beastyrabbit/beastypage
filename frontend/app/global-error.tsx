"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <button type="button" onClick={reset}>
          Try again
        </button>
        <nav aria-label="Legal" style={{ marginTop: "2rem" }}>
          <a href="/impressum">Impressum</a>
          {" · "}
          <a href="/datenschutz">Datenschutz</a>
          {" · "}
          <a href="/legal-notice">Legal notice</a>
          {" · "}
          <a href="/privacy">Privacy</a>
        </nav>
      </body>
    </html>
  );
}
