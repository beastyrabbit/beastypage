import type { Metadata } from "next";
import { ClassicWheelClient } from "@/components/wheel/ClassicWheelClient";

export const metadata: Metadata = {
  title: "Prize Wheel",
  description: "Spin the BeastyRabbit prize wheel and track outcomes.",
};

export default function WheelPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090b13] text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_45%_at_20%_0%,rgba(253,230,138,0.18),transparent),radial-gradient(50%_60%_at_80%_-10%,rgba(59,130,246,0.12),transparent),radial-gradient(60%_60%_at_50%_110%,rgba(253,230,138,0.14),transparent)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-20 mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' opacity=\'0.12\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>')" }} />

      <ClassicWheelClient />
    </main>
  );
}
