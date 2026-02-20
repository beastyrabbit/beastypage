import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Palette Spinner",
  description: "Redirecting to the palette generator experience.",
};

export default function PaletteSpinnerPage() {
  redirect("/palette-generator");
}
