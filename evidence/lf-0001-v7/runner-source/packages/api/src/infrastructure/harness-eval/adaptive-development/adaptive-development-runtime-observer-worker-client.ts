import { Worker } from 'node:worker_threads';
import type { CatId } from '@cat-cafe/shared';
import type { StoredMessage } from '../../../domains/cats/services/stores/ports/MessageStore.js';
import type { Thread } from '../../../domains/cats/services/stores/ports/ThreadStore.js';
import type { AgentMessage } from '../../../domains/cats/services/types.js';
import type {
  AdaptiveDevelopmentCommandReceiptReader,
  AdaptiveDevelopmentObserverPort,
} from './adaptive-development-runtime-observer.js';

export interface AdaptiveDevelopmentRuntimeObserverWorkerDeps {
  dbPath: string;
  harnessVersion?: string;
  modelIds: Record<string, string>;
  commandReceiptReader?: AdaptiveDevelopmentCommandReceiptReader;
}

interface WorkerAck {
  type: 'ack';
  requestId: number;
  error?: string;
}

/**
 * The only adaptive-development observer mounted in AgentRouter production.
 *
 * Route-facing methods perform bounded in-memory projection + postMessage.
 * SQLite, Git resolution, receipt joins, and collection all execute inside the
 * worker, so a blocked evaluation sidecar cannot stall the API event loop.
 */
export class AdaptiveDevelopmentRuntimeObserverWorker implements AdaptiveDevelopmentObserverPort {
  private readonly worker: Worker;
  private readonly pendingReceipts = new Map<string, Promise<void>>();
  private readonly acknowledgements = new Map<number, { resolve(): void; reject(error: Error): void }>();
  private nextRequestId = 1;
  private available = true;
  private closePromise: Promise<void> | null = null;

  constructor(private readonly deps: AdaptiveDevelopmentRuntimeObserverWorkerDeps) {
    this.worker = new Worker(new URL('./adaptive-development-runtime-observer-worker.js', import.meta.url), {
      workerData: {
        dbPath: deps.dbPath,
        harnessVersion: deps.harnessVersion,
        modelIds: deps.modelIds,
      },
    });
    this.worker.unref();
    this.worker.on('message', (message: WorkerAck) => this.handleAck(message));
    this.worker.on('error', (error) => this.failOpen(error));
    this.worker.on('exit', (code) => {
      if (code !== 0) this.failOpen(new Error(`adaptive_observer_worker_exit:${code}`));
    });
  }

  recordUserOptIn(input: {
    ownerUserId?: string;
    invocationId?: string;
    message: StoredMessage;
    thread: Thread | null;
    targetCats: readonly CatId[];
  }): void {
    const ownerUserId = input.ownerUserId ?? input.message.userId;
    this.post({
      type: 'begin',
      input: {
        ownerUserId,
        ...(input.invocationId ? { invocationId: input.invocationId } : {}),
        message: projectStoredMessage(input.message),
        thread: projectThread(input.thread),
        targetCats: [...input.targetCats],
      },
    });

    const sourceEventId = managedCommandSourceEventId(input.message);
    if (!sourceEventId || !this.deps.commandReceiptReader) return;
    const pending = this.deps.commandReceiptReader
      .get(ownerUserId, sourceEventId)
      .then((receipt) => {
        if (!receipt) return;
        this.post({
          type: 'receipt',
          userMessageId: input.message.id,
          ownerUserId,
          receipt,
          observedAtMs: input.message.timestamp,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.pendingReceipts.get(input.message.id) === pending) {
          this.pendingReceipts.delete(input.message.id);
        }
      });
    this.pendingReceipts.set(input.message.id, pending);
  }

  observeAgentMessage(input: {
    ownerUserId: string;
    threadId: string;
    userMessageId: string;
    message: AgentMessage;
  }): void {
    this.post({
      type: 'message',
      input: { ...input, message: projectAgentMessage(input.message) },
    });
  }

  observeRouteFailure(input: { ownerUserId: string; threadId: string; userMessageId: string; error: unknown }): void {
    this.post({ type: 'failure', input: { ...input, error: String(input.error) } });
  }

  async finishInvocation(input: { ownerUserId: string; threadId: string; userMessageId: string }): Promise<void> {
    await this.pendingReceipts.get(input.userMessageId);
    if (!this.available) return;
    const requestId = this.nextRequestId++;
    const completion = new Promise<void>((resolve, reject) => {
      this.acknowledgements.set(requestId, { resolve, reject });
    });
    this.post({ type: 'finish', requestId, input });
    return completion;
  }

  async close(): Promise<void> {
    this.closePromise ??= this.terminateWorker();
    await this.closePromise;
  }

  private post(message: unknown): void {
    if (!this.available) return;
    try {
      this.worker.postMessage(message);
    } catch (error) {
      this.failOpen(error);
    }
  }

  private handleAck(message: WorkerAck): void {
    if (message.type !== 'ack') return;
    const acknowledgement = this.acknowledgements.get(message.requestId);
    if (!acknowledgement) return;
    this.acknowledgements.delete(message.requestId);
    if (message.error) acknowledgement.reject(new Error(message.error));
    else acknowledgement.resolve();
  }

  private failOpen(error: unknown): void {
    if (!this.available) return;
    this.available = false;
    for (const acknowledgement of this.acknowledgements.values()) {
      acknowledgement.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.acknowledgements.clear();
  }

  private resolveAll(): void {
    for (const acknowledgement of this.acknowledgements.values()) acknowledgement.resolve();
    this.acknowledgements.clear();
  }

  private async terminateWorker(): Promise<void> {
    this.available = false;
    await this.worker.terminate();
    this.resolveAll();
  }
}

function projectStoredMessage(message: StoredMessage): StoredMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    userId: message.userId,
    catId: message.catId,
    content: message.content,
    mentions: [...message.mentions],
    timestamp: message.timestamp,
    ...(message.source
      ? {
          source: {
            connector: message.source.connector,
            label: message.source.label,
            icon: message.source.icon,
            ...(message.source.meta ? { meta: { ...message.source.meta } } : {}),
          },
        }
      : {}),
  };
}

function projectThread(thread: Thread | null): Thread | null {
  if (!thread) return null;
  return {
    id: thread.id,
    title: thread.title,
    createdBy: thread.createdBy,
    participants: [...thread.participants],
    createdAt: thread.createdAt,
    lastActiveAt: thread.lastActiveAt,
    projectPath: thread.projectPath,
    ...(thread.threadMetadata
      ? {
          threadMetadata: {
            ...thread.threadMetadata,
            ...(thread.threadMetadata.worktrees ? { worktrees: [...thread.threadMetadata.worktrees] } : {}),
          },
        }
      : {}),
  };
}

function projectAgentMessage(message: AgentMessage): AgentMessage {
  return {
    type: message.type,
    catId: message.catId,
    ...(message.content !== undefined ? { content: message.content } : {}),
    ...(message.textMode ? { textMode: message.textMode } : {}),
    ...(message.toolUseId ? { toolUseId: message.toolUseId } : {}),
    ...(message.toolName ? { toolName: message.toolName } : {}),
    ...(message.toolResultStatus ? { toolResultStatus: message.toolResultStatus } : {}),
    ...(message.error ? { error: message.error } : {}),
    timestamp: message.timestamp,
  };
}

function managedCommandSourceEventId(message: StoredMessage): string | null {
  if (message.source?.connector !== 'hold-ball') return null;
  const meta = message.source.meta;
  if (!meta || meta.wakeWhen !== true || typeof meta.taskId !== 'string' || meta.taskId.length === 0) return null;
  return `managed-command:${meta.taskId}`;
}
