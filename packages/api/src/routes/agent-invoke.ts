import { randomUUID } from 'node:crypto';
import type { CatId } from '@cat-cafe/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { InvocationTracker } from '../domains/cats/services/agents/invocation/InvocationTracker.js';
import type { QueueProcessor } from '../domains/cats/services/agents/invocation/QueueProcessor.js';
import type { AgentRouter } from '../domains/cats/services/agents/routing/AgentRouter.js';
import type { PersistenceContext } from '../domains/cats/services/agents/routing/route-helpers.js';
import { parseIntent } from '../domains/cats/services/context/IntentParser.js';
import type { IInvocationRecordStore } from '../domains/cats/services/stores/ports/InvocationRecordStore.js';
import type { IMessageStore } from '../domains/cats/services/stores/ports/MessageStore.js';
import type { IThreadStore } from '../domains/cats/services/stores/ports/ThreadStore.js';

const STOCK_ANALYSIS_RESPONSE_CODES = [
  'INVALID_REQUEST',
  'THREAD_NOT_FOUND',
  'THREAD_BUSY',
  'DUPLICATE_REQUEST',
  'AGENT_EXECUTION_FAILED',
  'PERSISTENCE_FAILED',
  'CONTRACT_MISMATCH',
  'INVOKE_TIMEOUT',
  'INVOKE_FAILED',
] as const;

const invokeSchema = z.object({
  type: z.literal('stock_advisor.invoke.v1'),
  skill: z.literal('stock-advisor'),
  catId: z.string().min(1),
  threadId: z.string().min(1),
  investorId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  idempotencyKey: z.string().uuid().optional(),
  timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
  input: z.object({
    state: z.unknown(),
    request: z.record(z.unknown()).optional(),
  }),
});

const stockAnalysisPayloadSchema = z
  .object({
    type: z.literal('stock_analysis_v1'),
    timestamp: z.string().min(1),
    investor_id: z.string().min(1),
    portfolio_verdict: z.string().min(1),
    action_count: z.number().int().nonnegative(),
    watch_count: z.number().int().nonnegative(),
    normal_count: z.number().int().nonnegative(),
    positions: z.array(
      z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          price: z.number(),
          change_pct: z.number(),
          pct_of_portfolio: z.number(),
          target_pct: z.number().nullable().optional(),
          status: z.string().min(1),
          three_dimensions: z.string().nullable().optional(),
          planned_action: z.unknown().nullable().optional(),
        })
        .passthrough(),
    ),
    portfolio_summary: z
      .object({
        total_position_pct: z.number(),
        cash: z.number(),
        correlation_groups: z.record(z.unknown()).optional(),
      })
      .passthrough(),
    actions: z.array(
      z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          action: z.string().min(1),
          reason: z.string().min(1),
          shares: z.number().optional(),
          price_range: z.tuple([z.number(), z.number()]).optional(),
          amount: z.number().optional(),
          requires_confirm: z.boolean().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type StockAnalysisPayload = z.infer<typeof stockAnalysisPayloadSchema>;
type AgentInvokeRouteMessage = {
  type: string;
  content?: unknown;
  error?: unknown;
  textMode?: 'append' | 'replace';
  [key: string]: unknown;
};

const DEFAULT_INVOKE_TIMEOUT_MS = 120_000;

export interface AgentInvokeRoutesOptions {
  router: AgentRouter;
  messageStore: IMessageStore;
  invocationRecordStore: IInvocationRecordStore;
  invocationTracker: InvocationTracker;
  threadStore?: IThreadStore;
  queueProcessor?: QueueProcessor;
}

export const agentInvokeRoutes: FastifyPluginAsync<AgentInvokeRoutesOptions> = async (app, opts) => {
  app.get('/api/agent/invoke/capabilities', async () => ({
    ok: true,
    available: true,
    skill: 'stock-advisor',
    route: '/api/agent/invoke',
    methods: ['POST'],
    maxTimeoutMs: 300_000,
    request: {
      type: 'stock_advisor.invoke.v1',
      skill: 'stock-advisor',
      requiredFields: ['type', 'skill', 'catId', 'threadId', 'investorId', 'input.state'],
    },
    response: {
      type: 'stock_analysis_v1',
      includes: ['rawContent', 'result'],
      investorKey: 'investor_id',
      mode: 'fail_closed',
    },
    errors: [...STOCK_ANALYSIS_RESPONSE_CODES],
  }));

  app.post('/api/agent/invoke', async (request, reply) => {
    const parsed = invokeSchema.safeParse(request.body);
    if (!parsed.success) {
      return failClosed(reply, 400, 'INVALID_REQUEST', 'Invalid request body', {
        details: parsed.error.issues,
      });
    }

    const body = parsed.data;
    const userId = readUserId(request.headers['x-cat-cafe-user']) ?? 'investment-dashboard';
    const catId = body.catId as CatId;
    const targetCats = [catId];
    const thread = opts.threadStore ? await opts.threadStore.get(body.threadId) : null;
    if (opts.threadStore && (!thread || thread.deletedAt)) {
      return failClosed(reply, 404, 'THREAD_NOT_FOUND', 'Thread not found');
    }

    const prompt = buildStockAdvisorPrompt(body);
    const intent = parseIntent(prompt, targetCats.length);
    const idempotencyKey = body.idempotencyKey ?? randomUUID();
    const controller = opts.invocationTracker.tryStartThreadAll(body.threadId, targetCats, userId);
    if (!controller) {
      return failClosed(reply, 409, 'THREAD_BUSY', 'Agent thread is busy');
    }

    const timeoutMs = body.timeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS;
    let invocationId: string | null = null;
    try {
      const createResult = await opts.invocationRecordStore.create({
        threadId: body.threadId,
        userId,
        targetCats,
        intent: intent.intent,
        idempotencyKey,
      });
      invocationId = createResult.invocationId;
      if (createResult.outcome === 'duplicate') {
        return failClosed(reply, 409, 'DUPLICATE_REQUEST', 'Duplicate invoke request is already tracked', {
          invocationId,
        });
      }

      const userMessage = await opts.messageStore.append({
        userId,
        catId: null,
        content: prompt,
        mentions: targetCats,
        timestamp: Date.now(),
        threadId: body.threadId,
        idempotencyKey,
      });
      await opts.invocationRecordStore.update(invocationId, { userMessageId: userMessage.id });

      const cursorBoundaries = new Map<string, string>();
      const persistenceContext: PersistenceContext = { failed: false, errors: [] };
      let rawContent = '';
      let errorText: string | null = null;

      await consumeRouteExecutionWithHardTimeout(
        opts.router.routeExecution(
          userId,
          prompt,
          body.threadId,
          userMessage.id,
          targetCats,
          intent,
          {
            signal: controller.signal,
            signalForCat: (id: string) => opts.invocationTracker.getController?.(body.threadId, id)?.signal,
            ...(opts.queueProcessor
              ? {
                  queueHasQueuedMessages: (threadId: string) =>
                    opts.queueProcessor?.hasQueuedNonAgentForThread(threadId) ?? false,
                  hasQueuedOrActiveAgentForCat: (threadId: string, id: string) =>
                    opts.queueProcessor?.hasActiveOrQueuedAgentForCat(threadId, id) ?? false,
                  deferA2AEnqueue: (entry: any) => opts.queueProcessor?.enqueueRaw(entry),
                }
              : {}),
            cursorBoundaries,
            persistenceContext,
            parentInvocationId: invocationId,
            frustrationAutoIssueEligible: false,
            verdictPassWarningEnabled: false,
          },
        ) as AsyncIterable<AgentInvokeRouteMessage>,
        timeoutMs,
        (timeoutError) => controller.abort(timeoutError),
        (msg) => {
          if (msg.type === 'text' && typeof msg.content === 'string') {
            rawContent = msg.textMode === 'replace' ? msg.content : `${rawContent}${msg.content}`;
          } else if (msg.type === 'error') {
            errorText = typeof msg.error === 'string' ? msg.error : 'Agent invocation failed';
          }
        },
      );

      if (errorText) {
        await opts.invocationRecordStore.update(invocationId, { status: 'failed', error: errorText });
        return failClosed(reply, 502, 'AGENT_EXECUTION_FAILED', errorText, { invocationId });
      }
      if (persistenceContext.failed) {
        const detail = persistenceContext.errors.map((e) => `${e.catId}: ${e.error}`).join('; ');
        await opts.invocationRecordStore.update(invocationId, {
          status: 'failed',
          error: `Message persistence failed: ${detail}`,
        });
        return failClosed(reply, 502, 'PERSISTENCE_FAILED', `Message persistence failed: ${detail}`, {
          invocationId,
        });
      }

      const result = extractStockAnalysisPayload(rawContent, body.investorId);
      if (!result.ok) {
        await opts.invocationRecordStore.update(invocationId, { status: 'failed', error: result.error });
        return failClosed(reply, 502, 'CONTRACT_MISMATCH', result.error, {
          invocationId,
          rawContent,
          details: result.details,
        });
      }

      await opts.invocationRecordStore.update(invocationId, { status: 'succeeded' });
      return {
        ok: true,
        invocationId,
        correlationId: body.correlationId ?? null,
        investorId: body.investorId,
        rawContent,
        result: result.payload,
      };
    } catch (err) {
      const timedOut = err instanceof InvokeTimeoutError;
      const error = timedOut ? err.message : err instanceof Error ? err.message : String(err);
      if (invocationId) {
        await opts.invocationRecordStore.update(invocationId, {
          status: 'failed',
          error,
        });
      }
      return failClosed(
        reply,
        timedOut || controller.signal.aborted ? 504 : 500,
        timedOut || controller.signal.aborted ? 'INVOKE_TIMEOUT' : 'INVOKE_FAILED',
        error,
        { invocationId, ...(timedOut ? { timeoutMs: err.timeoutMs } : {}) },
      );
    } finally {
      opts.invocationTracker.completeAll(body.threadId, targetCats, controller);
    }
  });
};

function failClosed(
  reply: { status(code: number): unknown },
  statusCode: number,
  code: (typeof STOCK_ANALYSIS_RESPONSE_CODES)[number],
  error: string,
  extras: Record<string, unknown> = {},
) {
  reply.status(statusCode);
  return { ok: false, code, error, ...extras };
}

function readUserId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

class InvokeTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Agent invoke timed out after ${timeoutMs}ms`);
    this.name = 'InvokeTimeoutError';
  }
}

async function consumeRouteExecutionWithHardTimeout(
  iterable: AsyncIterable<AgentInvokeRouteMessage>,
  timeoutMs: number,
  onTimeout: (error: InvokeTimeoutError) => void,
  onMessage: (msg: AgentInvokeRouteMessage) => void,
): Promise<void> {
  const iterator = iterable[Symbol.asyncIterator]();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new InvokeTimeoutError(timeoutMs);
      onTimeout(error);
      reject(error);
    }, timeoutMs);
    timeout.unref?.();
  });

  try {
    while (true) {
      const next = await Promise.race([iterator.next(), timeoutPromise]);
      if (next.done) return;
      onMessage(next.value);
    }
  } catch (err) {
    if (err instanceof InvokeTimeoutError) {
      void Promise.resolve(iterator.return?.()).catch(() => {});
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildStockAdvisorPrompt(body: z.infer<typeof invokeSchema>): string {
  return [
    '# Structured Stock Advisor Invoke — STRICT-FAST CONTRACT',
    '',
    `correlationId: ${body.correlationId ?? 'none'}`,
    `investorId: ${body.investorId}`,
    '',
    '⚠️ SYNCHRONOUS STRICT-FAST MODE — 你必须在回复中直接输出一个 stock_analysis_v1 JSON payload。',
    '',
    '硬约束：',
    '- 不要拉实时行情、不要拉 K 线、不要跑 SKILL V3 完整投研流程',
    '- 不要调用任何 Bash/curl 命令',
    '- 只基于传入的 input.state 做纯计算分析',
    '- 回复的第一段必须是 ```json 包裹的 stock_analysis_v1 JSON',
    '- 如果 state 数据不足以产出完整分析，用 partial 结果填充，缺失字段标 null',
    '- 不管分析结果如何，必须产出 stock_analysis_v1 JSON，不要用纯文本代替',
    '',
    '```json',
    JSON.stringify({ state: body.input.state, request: body.input.request ?? {} }, null, 2),
    '```',
  ].join('\n');
}

function extractStockAnalysisPayload(
  rawContent: string,
  expectedInvestorId: string,
): { ok: true; payload: StockAnalysisPayload } | { ok: false; error: string; details?: unknown[] } {
  const fenced = rawContent.match(/```json\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], rawContent].filter((value): value is string => Boolean(value));
  const details: unknown[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const payload = parsed?.type === 'stock_analysis_v1' ? parsed : parsed?.result?.type === 'stock_analysis_v1' ? parsed.result : null;
      if (!payload) {
        details.push({ kind: 'wrong_type', message: 'JSON parsed but no stock_analysis_v1 payload found' });
        continue;
      }

      const validated = stockAnalysisPayloadSchema.safeParse(payload);
      if (!validated.success) {
        details.push({ kind: 'schema', issues: validated.error.issues });
        continue;
      }
      if (validated.data.investor_id !== expectedInvestorId) {
        details.push({
          kind: 'investor_id_mismatch',
          expected: expectedInvestorId,
          actual: validated.data.investor_id,
        });
        continue;
      }
      return { ok: true, payload: validated.data };
    } catch {
      details.push({ kind: 'json_parse', message: 'Candidate was not valid JSON' });
    }
  }
  return {
    ok: false,
    error: 'Agent response did not satisfy stock_analysis_v1 contract',
    ...(details.length > 0 ? { details } : {}),
  };
}
