import type { ToolWidgetMeta } from "@/lib/dash/types";

const widget: ToolWidgetMeta = {
  id: "single-cat-plus",
  title: "Single Cat Plus",
  description: "Generate, spin, and export pixel cats with layered accessories and tortie coats.",
  icon: "\uD83D\uDCAB",
  href: "/single-cat-plus",
  category: "gacha",
};

export default widget;

// Preset variants of Single Cat Plus
export const extras: ToolWidgetMeta[] = [
  {
    id: "single-cat-generator",
    title: "Single Cat Generator",
    description: "Airport flip-board chaos with rapid spins before the final reveal.",
    icon: "✨",
    href: "/single-cat-plus?mode=flashy&accessories=1-1&scars=1-1&torties=1-1&afterlife=off",
    category: "gacha",
  },
  {
    id: "single-cat-calm",
    title: "Single Cat (Less Spin)",
    description: "Calm typewriter-style reveal where traits appear one by one.",
    icon: "🎯",
    href: "/single-cat-plus?mode=calm",
    category: "gacha",
  },
];
