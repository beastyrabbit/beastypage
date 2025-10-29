import { Metadata } from 'next';

import { RenderLayerDebugger } from '@/components/dev/RenderLayerDebugger';

export const metadata: Metadata = {
  title: 'Render Layer Debugger',
};

export default function RenderDebugPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <RenderLayerDebugger />
    </main>
  );
}
