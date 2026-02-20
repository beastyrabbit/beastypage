import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coin Flip Arena",
  description: "Flip coins, compete on streaks, and track coinflip leaderboard scores.",
};

export default function CoinflipLayout({ children }: { children: React.ReactNode }) {
  return children;
}
