export type NavAccent = "dash" | "projects" | "stream" | "collection" | "personal";

export type NavItem = {
  key: NavAccent;
  label: string;
  href: string;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dash", label: "Dash", href: "/dash" },
  { key: "projects", label: "Projects", href: "/projects" },
  { key: "stream", label: "Stream Tools", href: "/stream" },
  { key: "collection", label: "Collection", href: "/collection" },
  { key: "personal", label: "Personal", href: "/" },
];

// Projects sub-navigation categories
export type ProjectCategory = "warrior-cats" | "gacha" | "artist" | "games";

export type ProjectCategoryConfig = {
  key: ProjectCategory;
  label: string;
  href: string;
  description: string;
  icon: string;
};

export const PROJECT_CATEGORIES: ProjectCategoryConfig[] = [
  {
    key: "warrior-cats",
    label: "Warrior Cats",
    href: "/projects/warrior-cats",
    description: "Visual builders, guided creation, and ClanGen-inspired tools",
    icon: "paw",
  },
  {
    key: "gacha",
    label: "Gacha",
    href: "/projects/gacha",
    description: "Wheels, generators, and chance-based cat creation",
    icon: "sparkles",
  },
  {
    key: "artist",
    label: "Artist",
    href: "/projects/artist",
    description: "Palettes, mood boards, and creative inspiration tools",
    icon: "palette",
  },
  {
    key: "games",
    label: "Games",
    href: "/projects/games",
    description: "Interactive challenges and playful experiments",
    icon: "gamepad",
  },
];
