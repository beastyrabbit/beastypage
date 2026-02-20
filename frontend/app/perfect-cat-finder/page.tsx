import type { Metadata } from "next";
import PerfectCatFinderPageClient from "./PerfectCatFinderPageClient";

export const metadata: Metadata = {
  title: "Perfect Cat Finder",
  description: "Vote between cat sprites and help rank the community's perfect cat.",
};

export default function PerfectCatFinderPage() {
  return <PerfectCatFinderPageClient />;
}
