/**
 * Shared invocation preparation & route execution opts builder.
 * Used by both sync and SSE stream agent-invoke routes.
 */
import { randomUUID } from 'node:crypto';
import type { CatId } from '@cat-cafe/shared';
import type { InvocationTracker } from '../domains/cats/services/agents/invocation/InvocationTracker.js';
import type { QueueProcessor } from '../domains/cats/services/agents/invocation/QueueProcessor.js';
import type { AgentRouter } from '../domains/cats/services/agents/routing/AgentRouter.js';
import type { PersistenceContext } from '../domains/cats/services/agents/routing/route-helpers.js';
import { parseIntent } from '../domains/cats/services/context/IntentParser.js';
import type { IInvocationRecordStore } from '../domains/cats/services/stores/ports/InvocationRecordStore.js';
import type { IMessageStore } from '../domains/cats/services/stores/ports/MessageStore.js';
import type { IThreadStore } from '../domains/cats/services/stores/ports/ThreadStore.js';
import { failClosed, invokeSchema, type PromptBuilderFn, readUserId } from './agent-invoke-helpers.js';

// ── Route options type ─────────────────────────────────────────

export interface AgentInvokeRoutesOptions {
  router: AgentRouter;
  messageStore: IMessageStore;
  invocationRecordStore: IInvocationRecordStore;
  invocationTracker: InvocationTracker;
  threadStore?: IThreadStore;
  queueProcessor?: QueueProcessor;
}

// ── Shared invocation preparation ──────────────────────────────

/** Shared pre-flight: validate, lookup thread, create invocation, append message.
 *  Returns { error } on fail-closed, or the full prep result. */
export async function prepareInvocation(
  body: unknown,
  headers: Record<string, unknown>,
  reply: { status(c: number): unknown },
  opts: AgentInvokeRoutesOptions,
  promptBuilder: PromptBuilderFn,
) {
  const parsed = invokeSchema.safeParse(body);
  if (!parsed.success)
    return {
      error: failClosed(reply, 400, 'INVALID_REQUEST', 'Invalid request body', { details: parsed.error.issues }),
    };
  const b = parsed.data;
  const userId = readUserId(headers['x-cat-cafe-user'] as string | string[] | undefined) ?? 'investment-dashboard';
  const catId = b.catId as CatId;
  const targetCats = [catId];
  const thread = opts.threadStore ? await opts.threadStore.get(b.threadId) : null;
  if (opts.threadStore && (!thread || thread.deletedAt))
    return { error: failClosed(reply, 404, 'THREAD_NOT_FOUND', 'Thread not found') };

  const prompt = promptBuilder(b);
  const intent = parseIntent(prompt, targetCats.length);
  const idempotencyKey = b.idempotencyKey ?? randomUUID();
  const controller = opts.invocationTracker.tryStartThreadAll(b.threadId, targetCats, userId);
  if (!controller) return { error: failClosed(reply, 409, 'THREAD_BUSY', 'Agent thread is busy') };

  const createResult = await opts.invocationRecordStore.create({
    threadId: b.threadId,
    userId,
    targetCats,
    intent: intent.intent,
    idempotencyKey,
  });
  if (createResult.outcome === 'duplicate')
    return {
      error: failClosed(reply, 409, 'DUPLICATE_REQUEST', 'Duplicate invoke request is already tracked', {
        invocationId: createResult.invocationId,
      }),
    };

  const userMessage = await opts.messageStore.append({
    userId,
    catId: null,
    content: prompt,
    mentions: targetCats,
    timestamp: Date.now(),
    threadId: b.threadId,
    idempotencyKey,
  });
  await opts.invocationRecordStore.update(createResult.invocationId, { userMessageId: userMessage.id });

  return {
    body: b,
    userId,
    catId,
    targetCats,
    prompt,
    intent,
    idempotencyKey,
    controller,
    invocationId: createResult.invocationId,
    userMessageId: userMessage.id,
  };
}

// ── Route execution opts builder ───────────────────────────────

/** Build routeExecution opts (shared between sync & stream) */
export function buildRouteExecOpts(
  opts: AgentInvokeRoutesOptions,
  invocationId: string,
  body: { threadId: string },
  controller: { signal: AbortSignal },
  _userMessageId: string,
  _targetCats: CatId[],
  cursorBoundaries: Map<string, string>,
  persistenceContext: PersistenceContext,
): Record<string, unknown> {
  return {
    signal: controller.signal,
    signalForCat: (id: string) => opts.invocationTracker.getController?.(body.threadId, id)?.signal,
    ...(opts.queueProcessor
      ? {
          queueHasQueuedMessages: (tid: string) => opts.queueProcessor?.hasQueuedNonAgentForThread(tid) ?? false,
          hasQueuedOrActiveAgentForCat: (tid: string, id: string) =>
            opts.queueProcessor?.hasActiveOrQueuedAgentForCat(tid, id) ?? false,
          deferA2AEnqueue: (entry: unknown) => opts.queueProcessor?.enqueueRaw(entry),
        }
      : {}),
    cursorBoundaries,
    persistenceContext,
    parentInvocationId: invocationId,
    frustrationAutoIssueEligible: false,
    verdictPassWarningEnabled: false,
  };
}
