export type NavAccent = "hub" | "gatcha" | "stream" | "collection" | "personal";

export type NavItem = {
  key: NavAccent;
  label: string;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "hub", label: "Hub", href: "/" },
  { key: "gatcha", label: "Gacha", href: "/gatcha" },
  { key: "stream", label: "Stream Tools", href: "/stream" },
  { key: "collection", label: "Collection", href: "/collection" },
  { key: "personal", label: "Personal", href: "/personal" },
];
