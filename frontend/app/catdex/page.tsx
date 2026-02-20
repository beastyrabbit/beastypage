import type { Metadata } from "next";
import CatdexPageClient from "./CatdexPageClient";

export const metadata: Metadata = {
  title: "CatDex",
  description: "Browse, filter, and submit BeastyRabbit cat cards.",
};

export default function CatdexPage() {
  return <CatdexPageClient />;
}
