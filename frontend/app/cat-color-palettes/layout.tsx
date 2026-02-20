import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cat Color Palettes",
  description: "Generate and compare cat color palettes from uploaded images.",
};

export default function CatColorPalettesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
