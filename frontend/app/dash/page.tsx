import type { Metadata } from "next";
import { Suspense } from "react";
import { DashClient } from "@/components/dash/DashClient";

export const metadata: Metadata = {
  title: "Dash | BeastyPage",
  description: "Your customizable dashboard — pin your favourite tools and stay up to date.",
};

export const dynamic = "force-dynamic";

export default function DashPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading dashboard...</div>}>
        <DashClient />
      </Suspense>
    </main>
  );
}
