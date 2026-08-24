import type { Metadata } from "next";
import { LifeGenAccessoryLab } from "./LifeGenAccessoryLab";

export const metadata: Metadata = {
  title: "LifeGen Accessory Check | BeastyPage",
  description:
    "Compare the 22 adapted or renamed accessories and ten current LifeGen examples across the three new ClanGen poses.",
};

export default function LifeGenAccessoriesPage() {
  return <LifeGenAccessoryLab />;
}
