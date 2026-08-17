import type { BallCustodyEvent, CatId } from '@cat-cafe/shared';
import type { InvocationRecord } from '../cats/services/agents/invocation/InvocationRegistry.js';
import type { IMessageStore } from '../cats/services/stores/ports/MessageStore.js';
import type { IBallCustodyEventLog } from './BallCustodyEventLog.js';
import type { IBallCustodyFencedIngest } from './BallCustodyIngest.js';
import type { IBallCustodyProjectionStore } from './BallCustodyProjectionStore.js';
import {
  buildHoldDispositionEvent,
  handedEventSourceId,
  holdDispositionEventSourceId,
  type ManagedHoldDisposition,
  type ManagedHoldDispositionTerminalReason,
} from './ball-custody-events.js';
import { ManagedHoldReceiptError, type ManagedHoldReceiptService } from './ManagedHoldReceiptService.js';
import type { ManagedCommandWakeDynamicTaskStore } from './managed-command-wake-lifecycle.js';
import { readManagedCommandWakeProjection } from './managed-command-wake-lifecycle.js';

export interface ManagedHoldDispositionResult {
  readonly outcome: 'applied' | 'replayed' | ManagedHoldDispositionTerminalReason;
  readonly disposition: ManagedHoldDisposition;
  readonly invocationId: string;
  readonly sourceMessageId: string;
  readonly taskId: string;
}

export class ManagedHoldDispositionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ManagedHoldDispositionError';
  }
}

interface ManagedHoldDispositionDeps {
  readonly registry: { isLatest(invocationId: string): Promise<boolean> };
  readonly dynamicTaskStore: Pick<ManagedCommandWakeDynamicTaskStore, 'getById'>;
  readonly messageStore: Pick<IMessageStore, 'getById'>;
  readonly ballCustodyEventLog: Pick<IBallCustodyEventLog, 'read'>;
  readonly ballCustodyProjectionStore: Pick<IBallCustodyProjectionStore, 'get'>;
  readonly ballCustody: IBallCustodyFencedIngest;
  readonly receiptService: Pick<ManagedHoldReceiptService, 'complete'>;
  readonly repairProjection?: (subjectKey: string) => Promise<void>;
  readonly now?: () => number;
}

type ManagedHoldDispositionAuth = Pick<
  InvocationRecord,
  'invocationId' | 'userId' | 'catId' | 'threadId' | 'originTriggerMessageId'
>;

type ManagedHoldTaskState = 'live' | 'terminal' | 'missing';

const MAX_SNAPSHOT_ATTEMPTS = 2;

function stringMeta(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Invocation-bound terminal producer for an exact managed hold wake. */
export class ManagedHoldDispositionService {
  private readonly now: () => number;

  constructor(private readonly deps: ManagedHoldDispositionDeps) {
    this.now = deps.now ?? Date.now;
  }

  async complete(
    auth: ManagedHoldDispositionAuth,
    disposition: ManagedHoldDisposition,
  ): Promise<ManagedHoldDispositionResult> {
    const { sourceMessageId, taskId } = await this.resolveSource(auth);
    const subjectKey = `ball:thread:${auth.threadId}`;
    const replay = await this.replayExistingDisposition(auth, disposition, subjectKey, sourceMessageId, taskId);
    if (replay) return replay;
    await this.assertLatestInvocation(auth.invocationId);

    for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
      try {
        return await this.completeAgainstSnapshot(auth, disposition, subjectKey, sourceMessageId, taskId);
      } catch (error) {
        if (
          !(error instanceof ManagedHoldDispositionError) ||
          error.code !== 'managed_hold_disposition_fence_conflict' ||
          attempt === MAX_SNAPSHOT_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }
    throw new ManagedHoldDispositionError('managed_hold_disposition_fence_conflict');
  }

  private async replayExistingDisposition(
    auth: ManagedHoldDispositionAuth,
    disposition: ManagedHoldDisposition,
    subjectKey: string,
    sourceMessageId: string,
    taskId: string,
  ): Promise<ManagedHoldDispositionResult | undefined> {
    const events = await this.deps.ballCustodyEventLog.read(subjectKey);
    const eventSourceId = holdDispositionEventSourceId({
      invocationId: auth.invocationId,
      sourceMessageId,
      taskId,
    });
    const prior = events.find((event) => event.sourceEventId === eventSourceId);
    if (!prior) return undefined;
    const terminalReason = this.assertMatchingDispositionEvent(prior, auth, sourceMessageId, taskId, disposition);
    if (!terminalReason) await this.repairProjectionIfNeeded(subjectKey, events, prior);
    await this.completeReceipt(auth, sourceMessageId, taskId);
    return {
      outcome: terminalReason ?? 'replayed',
      disposition,
      invocationId: auth.invocationId,
      sourceMessageId,
      taskId,
    };
  }

  private async completeAgainstSnapshot(
    auth: ManagedHoldDispositionAuth,
    disposition: ManagedHoldDisposition,
    subjectKey: string,
    sourceMessageId: string,
    taskId: string,
  ): Promise<ManagedHoldDispositionResult> {
    const events = await this.deps.ballCustodyEventLog.read(subjectKey);
    const eventSourceId = holdDispositionEventSourceId({
      invocationId: auth.invocationId,
      sourceMessageId,
      taskId,
    });
    const prior = events.find((event) => event.sourceEventId === eventSourceId);
    if (prior) {
      const terminalReason = this.assertMatchingDispositionEvent(prior, auth, sourceMessageId, taskId, disposition);
      if (!terminalReason) await this.repairProjectionIfNeeded(subjectKey, events, prior);
      await this.completeReceipt(auth, sourceMessageId, taskId);
      return {
        outcome: terminalReason ?? 'replayed',
        disposition,
        invocationId: auth.invocationId,
        sourceMessageId,
        taskId,
      };
    }

    const taskState = this.classifyTask(auth, sourceMessageId, taskId);
    const terminalReason = await this.classifyTerminalReason(
      events,
      subjectKey,
      auth.catId,
      sourceMessageId,
      taskId,
      taskState,
    );

    await this.recordDisposition(
      auth,
      sourceMessageId,
      taskId,
      disposition,
      terminalReason,
      subjectKey,
      eventSourceId,
      events.length,
    );
    const committed = (await this.deps.ballCustodyEventLog.read(subjectKey)).find(
      (event) => event.sourceEventId === eventSourceId,
    );
    const committedTerminalReason = this.assertMatchingDispositionEvent(
      committed,
      auth,
      sourceMessageId,
      taskId,
      disposition,
    );
    // Consume F264 only after the append-only custody truth is durable. If the
    // receipt write fails, replay repairs it from the exact event; the inverse
    // ordering could delete the only Queue carrier before any terminal event exists.
    await this.completeReceipt(auth, sourceMessageId, taskId);
    return {
      outcome: committedTerminalReason ?? 'applied',
      disposition,
      invocationId: auth.invocationId,
      sourceMessageId,
      taskId,
    };
  }

  private async assertLatestInvocation(invocationId: string): Promise<void> {
    if (!(await this.deps.registry.isLatest(invocationId))) {
      throw new ManagedHoldDispositionError('managed_hold_disposition_stale_invocation');
    }
  }

  private async resolveSource(auth: ManagedHoldDispositionAuth): Promise<{ sourceMessageId: string; taskId: string }> {
    const sourceMessageId = auth.originTriggerMessageId;
    if (!sourceMessageId) throw new ManagedHoldDispositionError('managed_hold_disposition_source_missing');

    const source = await this.deps.messageStore.getById(sourceMessageId);
    const meta = source?.source?.meta;
    const taskId = stringMeta(meta?.taskId);
    if (
      !source ||
      source.source?.connector !== 'hold-ball' ||
      meta?.wakeWhen !== true ||
      !taskId ||
      source.threadId !== auth.threadId ||
      meta?.threadId !== auth.threadId ||
      meta?.catId !== auth.catId
    ) {
      throw new ManagedHoldDispositionError('managed_hold_disposition_source_mismatch');
    }
    return { sourceMessageId, taskId };
  }

  private classifyTask(
    auth: ManagedHoldDispositionAuth,
    sourceMessageId: string,
    taskId: string,
  ): ManagedHoldTaskState {
    const task = this.deps.dynamicTaskStore.getById(taskId);
    if (!task) return 'missing';
    const command = readManagedCommandWakeProjection(task);
    const lifecycle = task.params.holdLifecycle;
    if (
      !command ||
      !isPlainRecord(lifecycle) ||
      task.id !== taskId ||
      task.deliveryThreadId !== auth.threadId ||
      task.createdBy !== `hold-ball:${auth.catId}` ||
      task.params.triggerUserId !== auth.userId ||
      command.messageId !== sourceMessageId
    ) {
      throw new ManagedHoldDispositionError('managed_hold_disposition_task_mismatch');
    }
    if (
      task.enabled &&
      lifecycle.status === 'active' &&
      (command.state === 'enqueued' || command.state === 'dispatched')
    ) {
      return 'live';
    }
    return 'terminal';
  }

  private async assertCurrentHolder(subjectKey: string, catId: string): Promise<void> {
    const projection = await this.deps.ballCustodyProjectionStore.get(subjectKey);
    if ((projection?.state !== 'active' && projection?.state !== 'blocked') || projection.holder !== catId) {
      throw new ManagedHoldDispositionError('managed_hold_disposition_holder_mismatch');
    }
  }

  private async classifyTerminalReason(
    events: readonly BallCustodyEvent[],
    subjectKey: string,
    catId: string,
    sourceMessageId: string,
    taskId: string,
    taskState: ManagedHoldTaskState,
  ): Promise<ManagedHoldDispositionTerminalReason | undefined> {
    const exactWakeIndex = events.findIndex(
      (event) =>
        event.kind === 'ball.wake_condition_met' && event.payload.taskId === taskId && event.payload.catId === catId,
    );
    if (exactWakeIndex === -1) throw new ManagedHoldDispositionError('managed_hold_disposition_wake_missing');

    const ownReceiverHandoffSourceId = handedEventSourceId(sourceMessageId, catId);
    const wasReplaced = events
      .slice(exactWakeIndex + 1)
      .some(
        (event) =>
          (event.kind === 'ball.held' && event.payload.catId === catId) ||
          (event.kind === 'ball.handed' &&
            event.sourceEventId !== ownReceiverHandoffSourceId &&
            (event.payload.fromCatId === catId || event.payload.toCatId === catId)) ||
          (event.kind === 'ball.handed_cvo' && event.payload.fromCatId === catId),
      );
    if (wasReplaced) return 'replaced';
    try {
      await this.assertCurrentHolder(subjectKey, catId);
      return undefined;
    } catch (error) {
      if (taskState !== 'live' && error instanceof ManagedHoldDispositionError) return 'stale';
      throw error;
    }
  }

  private assertMatchingDispositionEvent(
    event: BallCustodyEvent | undefined,
    auth: ManagedHoldDispositionAuth,
    sourceMessageId: string,
    taskId: string,
    disposition: ManagedHoldDisposition,
  ): ManagedHoldDispositionTerminalReason | undefined {
    if (
      !event ||
      event.kind !== 'ball.hold_dispositioned' ||
      event.payload.catId !== auth.catId ||
      event.payload.disposition !== disposition ||
      event.payload.sourceMessageId !== sourceMessageId ||
      event.payload.taskId !== taskId
    ) {
      throw new ManagedHoldDispositionError('managed_hold_disposition_replay_mismatch');
    }
    const terminalReason = event.payload.terminalReason;
    if (terminalReason === undefined) return undefined;
    if (terminalReason === 'replaced' || terminalReason === 'stale') return terminalReason;
    throw new ManagedHoldDispositionError('managed_hold_disposition_replay_mismatch');
  }

  private async recordDisposition(
    auth: ManagedHoldDispositionAuth,
    sourceMessageId: string,
    taskId: string,
    disposition: ManagedHoldDisposition,
    terminalReason: ManagedHoldDispositionTerminalReason | undefined,
    subjectKey: string,
    eventSourceId: string,
    expectedSequence: number,
  ): Promise<void> {
    try {
      const result = await this.deps.ballCustody.recordFenced(
        buildHoldDispositionEvent({
          threadId: auth.threadId,
          catId: auth.catId,
          invocationId: auth.invocationId,
          sourceMessageId,
          taskId,
          disposition,
          ...(terminalReason ? { terminalReason } : {}),
          at: this.now(),
        }),
        expectedSequence,
      );
      if (result.outcome === 'conflict') {
        throw new ManagedHoldDispositionError('managed_hold_disposition_fence_conflict');
      }
    } catch (error) {
      const appended = (await this.deps.ballCustodyEventLog.read(subjectKey)).find(
        (event) => event.sourceEventId === eventSourceId,
      );
      if (!appended || !this.deps.repairProjection) throw error;
      await this.deps.repairProjection(subjectKey);
    }
  }

  private async repairProjectionIfNeeded(
    subjectKey: string,
    events: readonly BallCustodyEvent[],
    dispositionEvent: BallCustodyEvent,
  ): Promise<void> {
    if (!this.deps.repairProjection) return;
    const dispositionIndex = events.findIndex((event) => event.sourceEventId === dispositionEvent.sourceEventId);
    const reopenedAfterDisposition = events
      .slice(dispositionIndex + 1)
      .some((event) => event.kind === 'ball.handed' || event.kind === 'ball.held');
    const projection = await this.deps.ballCustodyProjectionStore.get(subjectKey);
    if (!reopenedAfterDisposition && projection?.state !== 'resolved') {
      await this.deps.repairProjection(subjectKey);
    }
  }

  private async completeReceipt(
    auth: Pick<InvocationRecord, 'invocationId' | 'userId' | 'catId' | 'threadId'>,
    sourceMessageId: string,
    taskId: string,
  ): Promise<void> {
    try {
      await this.deps.receiptService.complete({
        threadId: auth.threadId,
        userId: auth.userId,
        catId: auth.catId as CatId,
        invocationId: auth.invocationId,
        sourceMessageId,
        taskId,
        handledAt: this.now(),
      });
    } catch (error) {
      if (error instanceof ManagedHoldReceiptError) {
        throw new ManagedHoldDispositionError(error.code);
      }
      throw error;
    }
  }
}
