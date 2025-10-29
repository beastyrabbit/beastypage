import type { Metadata } from 'next';

import { RandomDistributionLab } from '@/components/dev/RandomDistributionLab';

export const metadata: Metadata = {
  title: 'Random Distribution Lab',
  description: 'Compare the V2 and V3 random generators across large sample sizes.',
};

export default function RandomDistributionPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <RandomDistributionLab />
    </main>
  );
}
