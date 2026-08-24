import type { Metadata } from "next";
import { CoatPatternLab } from "./CoatPatternLab";

export const metadata: Metadata = {
  title: "20 New Coat Patterns | BeastyPage",
  description:
    "Inspect twenty new pose-aware coat patterns at the renderer's native pixel scale.",
};

export default function CatCoatPatternsPage() {
  return <CoatPatternLab />;
}
