import { AdoptionGeneratorClient } from "@/components/adoption/AdoptionGeneratorClient";

export const metadata = {
  title: "Adoption Generator",
};

export default function AdoptionGeneratorPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-foreground">
      <AdoptionGeneratorClient />
    </div>
  );
}
