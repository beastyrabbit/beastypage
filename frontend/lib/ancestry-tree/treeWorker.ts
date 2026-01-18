/**
 * Web Worker for tree generation.
 * Runs tree generation off the main thread to prevent browser freezing.
 */

import type { MutationPool } from './treeManager';
import type {
  FoundingCoupleInput,
  SerializedAncestryTree,
  TreeGenerationConfig,
} from './types';

// Re-import tree manager here - workers have their own context
import { AncestryTreeManager } from './treeManager';

export interface TreeWorkerRequest {
  config: TreeGenerationConfig;
  foundingCouple: FoundingCoupleInput;
  mutationPool: MutationPool;
}

export interface TreeProgressMessage {
  type: 'progress';
  generation: number;
  total: number;
  catCount: number;
}

export interface TreeCompleteMessage {
  type: 'complete';
  tree: SerializedAncestryTree;
}

export interface TreeErrorMessage {
  type: 'error';
  error: string;
}

export type TreeWorkerResponse = TreeProgressMessage | TreeCompleteMessage | TreeErrorMessage;

// Worker entry point
self.onmessage = (event: MessageEvent<TreeWorkerRequest>) => {
  const { config, foundingCouple, mutationPool } = event.data;

  try {
    // Create manager with mutation pool
    const manager = new AncestryTreeManager(mutationPool);
    manager.setConfig(config);
    manager.setName('Unnamed Tree');

    // Initialize founding couple
    manager.initializeFoundingCouple(foundingCouple);

    // Prepare for incremental generation
    manager.prepareForFullTree();

    // Generate each generation with progress reporting
    for (let gen = 1; gen <= config.depth; gen++) {
      manager.generateGeneration(gen);

      // Report progress
      const progressMessage: TreeProgressMessage = {
        type: 'progress',
        generation: gen,
        total: config.depth,
        catCount: manager.getAllCats().length,
      };
      self.postMessage(progressMessage);
    }

    // Return completed tree
    const completeMessage: TreeCompleteMessage = {
      type: 'complete',
      tree: manager.serialize(),
    };
    self.postMessage(completeMessage);
  } catch (error) {
    const errorMessage: TreeErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error during tree generation',
    };
    self.postMessage(errorMessage);
  }
};

// TypeScript needs this for the worker context
export {};
