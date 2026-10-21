import type { Metadata } from "next";
import {
  ImpressumContent,
  impressumCopy,
} from "@/components/legal/impressum-content";

export const metadata: Metadata = {
  title: "Impressum | BeastyPage",
  robots: { index: false, follow: true },
};

export default function LegalNoticePage() {
  return <ImpressumContent lang="de" copy={impressumCopy.de} />;
}
