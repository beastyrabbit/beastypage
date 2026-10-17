import type { Metadata } from "next";

import { NineLivesClient } from "@/components/nine-lives/NineLivesClient";

export const metadata: Metadata = {
  title: "Nine Lives | Games | BeastyRabbit",
  description:
    "Play the first alpha of Nine Lives, a cat monster-collecting RPG built with Phaser.",
  openGraph: {
    title: "Nine Lives | BeastyRabbit",
    description:
      "A pocket-sized world of curious cats. Play the first Nine Lives alpha.",
  },
};

export default function NineLivesPage() {
  return <NineLivesClient />;
}
