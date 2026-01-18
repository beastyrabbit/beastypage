"use client";

import { useCallback, useRef, useState } from 'react';
import type { MutationPool } from './treeManager';
import type {
  FoundingCoupleInput,
  SerializedAncestryTree,
  TreeGenerationConfig,
} from './types';
import type {
  TreeWorkerRequest,
  TreeWorkerResponse,
  TreeProgressMessage,
} from './treeWorker';

export interface TreeProgress {
  generation: number;
  total: number;
  catCount: number;
}

interface UseTreeWorkerReturn {
  generateTree: (
    config: TreeGenerationConfig,
    foundingCouple: FoundingCoupleInput,
    mutationPool: MutationPool
  ) => Promise<SerializedAncestryTree>;
  progress: TreeProgress | null;
  isGenerating: boolean;
  cancel: () => void;
}

export function useTreeWorker(): UseTreeWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<TreeProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setProgress(null);
    setIsGenerating(false);
  }, []);

  const generateTree = useCallback(
    (
      config: TreeGenerationConfig,
      foundingCouple: FoundingCoupleInput,
      mutationPool: MutationPool
    ): Promise<SerializedAncestryTree> => {
      return new Promise((resolve, reject) => {
        // Cancel any existing worker
        if (workerRef.current) {
          workerRef.current.terminate();
        }

        setIsGenerating(true);
        setProgress(null);

        // Create new worker
        const worker = new Worker(
          new URL('./treeWorker.ts', import.meta.url),
          { type: 'module' }
        );

        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<TreeWorkerResponse>) => {
          const data = event.data;

          if (data.type === 'progress') {
            const progressData = data as TreeProgressMessage;
            setProgress({
              generation: progressData.generation,
              total: progressData.total,
              catCount: progressData.catCount,
            });
          } else if (data.type === 'complete') {
            setIsGenerating(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
            resolve(data.tree);
          } else if (data.type === 'error') {
            setIsGenerating(false);
            setProgress(null);
            worker.terminate();
            workerRef.current = null;
            reject(new Error(data.error));
          }
        };

        worker.onerror = (error) => {
          setIsGenerating(false);
          setProgress(null);
          worker.terminate();
          workerRef.current = null;
          reject(new Error(`Worker error: ${error.message}`));
        };

        // Send generation request
        const request: TreeWorkerRequest = {
          config,
          foundingCouple,
          mutationPool,
        };
        worker.postMessage(request);
      });
    },
    []
  );

  return { generateTree, progress, isGenerating, cancel };
}
