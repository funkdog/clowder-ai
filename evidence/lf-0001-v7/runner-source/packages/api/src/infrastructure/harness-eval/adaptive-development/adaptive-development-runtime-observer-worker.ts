import { parentPort, workerData } from 'node:worker_threads';
import { LocalAdaptiveDevelopmentGitFactResolver } from './adaptive-development-git-facts.js';
import { AdaptiveDevelopmentRuntimeObserver } from './adaptive-development-runtime-observer.js';
import { AdaptiveDevelopmentTrialStore } from './adaptive-development-trial-store.js';

interface ObserverWorkerData {
  dbPath: string;
  harnessVersion?: string;
  modelIds: Record<string, string>;
}

const data = workerData as ObserverWorkerData;
const store = new AdaptiveDevelopmentTrialStore(data.dbPath);
const observer = new AdaptiveDevelopmentRuntimeObserver({
  store,
  gitResolver: new LocalAdaptiveDevelopmentGitFactResolver(),
  ...(data.harnessVersion ? { harnessVersion: data.harnessVersion } : {}),
  getModelId: (catId) => data.modelIds[catId],
});

let observationQueue = Promise.resolve();
parentPort?.on('message', (message: Record<string, unknown>) => {
  observationQueue = observationQueue.then(() => dispatch(message)).catch(() => undefined);
});

async function dispatch(message: Record<string, unknown>): Promise<void> {
  try {
    if (message.type === 'begin') {
      observer.recordUserOptIn(message.input as Parameters<typeof observer.recordUserOptIn>[0]);
      return;
    }
    if (message.type === 'message') {
      observer.observeAgentMessage(message.input as Parameters<typeof observer.observeAgentMessage>[0]);
      return;
    }
    if (message.type === 'failure') {
      observer.observeRouteFailure(message.input as Parameters<typeof observer.observeRouteFailure>[0]);
      return;
    }
    if (message.type === 'receipt') {
      await observer.recordManagedCommandReceipt(
        message.userMessageId as string,
        message.ownerUserId as string,
        message.receipt as Parameters<typeof observer.recordManagedCommandReceipt>[2],
        message.observedAtMs as number,
      );
      return;
    }
    if (message.type === 'finish') {
      await observer.finishInvocation(message.input as Parameters<typeof observer.finishInvocation>[0]);
      parentPort?.postMessage({ type: 'ack', requestId: message.requestId });
    }
  } catch (error) {
    if (message.type === 'finish') {
      parentPort?.postMessage({ type: 'ack', requestId: message.requestId, error: String(error) });
    }
  }
}
