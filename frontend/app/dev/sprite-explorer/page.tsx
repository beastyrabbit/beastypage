import type { Metadata } from 'next';

import { SpriteAssetExplorer } from '@/components/dev/SpriteAssetExplorer';

export const metadata: Metadata = {
  title: 'Sprite Asset Explorer',
  description: 'Inspect sprite sheets and frames bundled with the V3 renderer.',
};

export default function SpriteExplorerPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <SpriteAssetExplorer />
    </main>
  );
}
