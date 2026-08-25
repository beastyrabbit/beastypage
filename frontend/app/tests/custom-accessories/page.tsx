import type { Metadata } from "next";
import { CustomAccessoryLab } from "./CustomAccessoryLab";

export const metadata: Metadata = {
  title: "Custom Accessory Fit Check | BeastyPage",
  description:
    "Inspect three original BeastyPage pixel accessories across every named cat pose.",
};

export default function CustomAccessoriesPage() {
  return <CustomAccessoryLab />;
}
