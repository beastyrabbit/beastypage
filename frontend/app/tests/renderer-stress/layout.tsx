import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Renderer Stress Test",
  description: "Stress-test the renderer API and inspect retry/circuit-breaker behavior.",
};

export default function RendererStressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
