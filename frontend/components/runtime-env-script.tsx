import { injectRuntimeConfig } from "@/lib/runtimeEnv";

export function RuntimeEnvScript() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
  if (!convexUrl) {
    return null;
  }
  const script = injectRuntimeConfig({ convexUrl });
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: script }} />;
}
