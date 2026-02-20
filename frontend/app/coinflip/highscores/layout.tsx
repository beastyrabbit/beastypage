import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coin Flip Highscores",
  description: "View top coinflip streaks and historical score records.",
};

export default function CoinflipHighscoresLayout({ children }: { children: React.ReactNode }) {
  return children;
}
