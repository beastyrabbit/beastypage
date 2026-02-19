import { injectRuntimeConfig } from "@/lib/runtimeEnv";

export function getRuntimeEnvScript() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
  if (!convexUrl) {
    return null;
  }
  return injectRuntimeConfig({ convexUrl });
}
