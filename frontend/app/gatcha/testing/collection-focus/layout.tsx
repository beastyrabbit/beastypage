import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collection Focus Test",
  description: "Internal testing route for collection focus behavior in gatcha.",
};

export default function CollectionFocusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
