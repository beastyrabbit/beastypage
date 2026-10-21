"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main lang="en" className="mx-auto max-w-3xl space-y-5 px-6 py-16">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p>Please try loading this page again.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-4 py-2"
      >
        Try again
      </button>
    </main>
  );
}
