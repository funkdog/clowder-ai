/**
 * Shared helpers for agent-invoke routes (sync + SSE stream).
 * Extracted from agent-invoke.ts to keep route handlers under 350-line limit.
 */
import type { CatId } from '@cat-cafe/shared';
import { z } from 'zod';

// ── Response codes ──────────────────────────────────────────────

export const STOCK_ANALYSIS_RESPONSE_CODES = [
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

// ── Schemas ─────────────────────────────────────────────────────

export const invokeSchema = z.object({
  type: z.literal('stock_advisor.invoke.v1'),
  skill: z.literal('stock-advisor'),
  catId: z.string().min(1),
  threadId: z.string().min(1),
  investorId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  idempotencyKey: z.string().uuid().optional(),
  timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
  input: z.object({ state: z.unknown(), request: z.record(z.unknown()).optional() }),
});

const positionSchema = z
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
  .passthrough();

const actionSchema = z
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
  .passthrough();

export const stockAnalysisPayloadSchema = z
  .object({
    type: z.literal('stock_analysis_v1'),
    timestamp: z.string().min(1),
    investor_id: z.string().min(1),
    portfolio_verdict: z.string().min(1),
    action_count: z.number().int().nonnegative(),
    watch_count: z.number().int().nonnegative(),
    normal_count: z.number().int().nonnegative(),
    positions: z.array(positionSchema),
    portfolio_summary: z
      .object({
        total_position_pct: z.number(),
        cash: z.number(),
        correlation_groups: z.record(z.unknown()).optional(),
      })
      .passthrough(),
    actions: z.array(actionSchema),
  })
  .passthrough();

export type StockAnalysisPayload = z.infer<typeof stockAnalysisPayloadSchema>;

/** Type for prompt builder functions used by both sync and stream routes */
export type PromptBuilderFn = (body: z.infer<typeof invokeSchema>) => string;

// ── Route message type ─────────────────────────────────────────

export type AgentInvokeRouteMessage = {
  type: string;
  content?: unknown;
  error?: unknown;
  textMode?: 'append' | 'replace';
  catId?: CatId;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  toolResultStatus?: 'ok' | 'error' | 'unknown';
  isFinal?: boolean;
  sessionId?: string;
  [key: string]: unknown;
};

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_INVOKE_TIMEOUT_MS = 120_000;
export const STREAM_INVOKE_TIMEOUT_MS = 300_000;
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
export const TOOL_RESULT_CONTENT_MAX_BYTES = 8192;

// ── Error helpers ───────────────────────────────────────────────

export function failClosed(
  reply: { status(code: number): unknown },
  statusCode: number,
  code: (typeof STOCK_ANALYSIS_RESPONSE_CODES)[number],
  error: string,
  extras: Record<string, unknown> = {},
) {
  reply.status(statusCode);
  return { ok: false, code, error, ...extras };
}

export function readUserId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── Timeout ─────────────────────────────────────────────────────

export class InvokeTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Agent invoke timed out after ${timeoutMs}ms`);
    this.name = 'InvokeTimeoutError';
  }
}

export async function consumeRouteExecutionWithHardTimeout(
  iterable: AsyncIterable<AgentInvokeRouteMessage>,
  timeoutMs: number,
  onTimeout: (error: InvokeTimeoutError) => void,
  onMessage: (msg: AgentInvokeRouteMessage) => void,
): Promise<void> {
  const iterator = iterable[Symbol.asyncIterator]();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const e = new InvokeTimeoutError(timeoutMs);
      onTimeout(e);
      reject(e);
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
    if (err instanceof InvokeTimeoutError) void Promise.resolve(iterator.return?.()).catch(() => {});
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// ── Prompt builders ─────────────────────────────────────────────

export function buildStockAdvisorPrompt(body: z.infer<typeof invokeSchema>): string {
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

export function buildStreamingStockAdvisorPrompt(body: z.infer<typeof invokeSchema>): string {
  return [
    '# Structured Stock Advisor Invoke — STREAMING FULL-RESEARCH CONTRACT',
    '',
    `correlationId: ${body.correlationId ?? 'none'}`,
    `investorId: ${body.investorId}`,
    '',
    '🔔 STREAMING FULL-RESEARCH MODE — 你必须按 stock-advisor SKILL 完整流程跑一遍：',
    '',
    '1. 拉取腾讯实时行情（curl tencent API）',
    '2. 拉取 20 日 K 线数据',
    '3. 计算 MA、量比、MACD 等技术指标',
    '4. 做 boundary 自检（个股/组合/资金边界）',
    '5. 输出 stock_analysis_v1 JSON（格式同 strict-fast）',
    '',
    '硬约束：',
    '- 你 **必须** 调用工具（Bash/curl）拉行情和 K 线——这正是流式暴露的 tool_call/tool_result',
    '- 过程中的每一步工具调用都会被实时流式推送给消费端',
    '- 最终输出必须是 ```json 包裹的 stock_analysis_v1 JSON',
    '- 如果某步无法完成（API 异常等），在 tool_result 标注错误，但仍需产出 stock_analysis_v1',
    '- 不管分析结果如何，必须产出 stock_analysis_v1 JSON，不要用纯文本代替',
    '',
    '```json',
    JSON.stringify({ state: body.input.state, request: body.input.request ?? {} }, null, 2),
    '```',
  ].join('\n');
}

// ── Payload extraction ──────────────────────────────────────────

export function extractStockAnalysisPayload(
  rawContent: string,
  expectedInvestorId: string,
): { ok: true; payload: StockAnalysisPayload } | { ok: false; error: string; details?: unknown[] } {
  const fenced = rawContent.match(/```json\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], rawContent].filter((v): v is string => Boolean(v));
  const details: unknown[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const payload =
        parsed?.type === 'stock_analysis_v1'
          ? parsed
          : parsed?.result?.type === 'stock_analysis_v1'
            ? parsed.result
            : null;
      if (!payload) {
        details.push({ kind: 'wrong_type', message: 'No stock_analysis_v1 payload found' });
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
      details.push({ kind: 'json_parse', message: 'Not valid JSON' });
    }
  }
  return {
    ok: false,
    error: 'Agent response did not satisfy stock_analysis_v1 contract',
    ...(details.length ? { details } : {}),
  };
}

// ── SSE stream event mapping ───────────────────────────────────

export const STREAM_EVENT_TYPES = ['session_init', 'text', 'tool_call', 'tool_result', 'error', 'done'] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

/** Internal → SSE mapping. Returns null for events that should not be emitted (whitelist filter). */
export function mapToStreamEvent(
  msg: AgentInvokeRouteMessage,
  invocationId: string,
  threadId: string,
  investorId: string,
  correlationId: string | null | undefined,
): Record<string, unknown> | null {
  switch (msg.type) {
    case 'system_info': {
      if (typeof msg.content === 'string') {
        try {
          const inner = JSON.parse(msg.content);
          if (inner.type === 'invocation_created')
            return { type: 'session_init', invocationId, threadId, investorId, correlationId };
        } catch {
          /* skip */
        }
      }
      return null;
    }
    case 'text':
      return {
        type: 'text',
        delta: typeof msg.content === 'string' ? msg.content : '',
        textMode: msg.textMode ?? 'append',
        invocationId,
      };
    case 'tool_use':
      return {
        type: 'tool_call',
        toolName: msg.toolName ?? '',
        toolInput: msg.toolInput ?? {},
        toolUseId: msg.toolUseId ?? '',
        invocationId,
      };
    case 'tool_result': {
      let content = typeof msg.content === 'string' ? msg.content : '';
      let truncated = false;
      if (Buffer.byteLength(content, 'utf-8') > TOOL_RESULT_CONTENT_MAX_BYTES) {
        content = Buffer.from(content, 'utf-8').subarray(0, TOOL_RESULT_CONTENT_MAX_BYTES).toString('utf-8');
        truncated = true;
      }
      return {
        type: 'tool_result',
        toolName: msg.toolName ?? '',
        toolUseId: msg.toolUseId ?? '',
        status: msg.toolResultStatus ?? 'unknown',
        content,
        ...(truncated ? { truncated: true } : {}),
        invocationId,
      };
    }
    case 'error':
      return {
        type: 'error',
        error: typeof msg.error === 'string' ? msg.error : 'Agent invocation failed',
        code: 'AGENT_EXECUTION_FAILED',
        invocationId,
      };
    case 'done':
      return null; // done constructed by route handler with payload
    default:
      return null; // provider_signal/liveness_signal/agent_loop/status/a2a_handoff filtered
  }
}
