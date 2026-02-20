import type { Metadata } from "next";
import CollectionPageClient from "./CollectionPageClient";

export const metadata: Metadata = {
  title: "Art Collection",
  description: "Explore community artwork and artist links from the BeastyRabbit collection.",
};

export default function CollectionPage() {
  return <CollectionPageClient />;
}
