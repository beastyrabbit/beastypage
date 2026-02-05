export type ToolCategory = "warrior-cats" | "gacha" | "artist" | "games";

export interface ToolWidgetMeta {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  category: ToolCategory;
}

export interface DashSettings {
  v: 1;
  widgets: string[];
  lastSeenVersion: string | null;
}

export interface ReleaseNote {
  tag: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
}
