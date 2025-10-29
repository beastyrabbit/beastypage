import type { Metadata } from 'next';

import { CatRendererComparison } from '@/components/dev/CatRendererComparison';

export const metadata: Metadata = {
  title: 'Cat Generator V3 Lab',
  description: 'Run parity tests between catGeneratorV2 and the new backend renderer.',
};

export default function CatGeneratorV3Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <CatRendererComparison />
    </main>
  );
}
