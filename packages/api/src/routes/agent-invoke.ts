/**
 * Agent invoke routes — sync (POST /invoke) + SSE stream (POST /invoke/stream).
 * Shared helpers in agent-invoke-helpers.ts.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { PersistenceContext } from '../domains/cats/services/agents/routing/route-helpers.js';
import {
  type AgentInvokeRouteMessage,
  buildStockAdvisorPrompt,
  buildStreamingStockAdvisorPrompt,
  consumeRouteExecutionWithHardTimeout,
  DEFAULT_INVOKE_TIMEOUT_MS,
  extractStockAnalysisPayload,
  failClosed,
  InvokeTimeoutError,
  mapToStreamEvent,
  SSE_HEARTBEAT_INTERVAL_MS,
  STOCK_ANALYSIS_RESPONSE_CODES,
  STREAM_INVOKE_TIMEOUT_MS,
} from './agent-invoke-helpers.js';
import { type AgentInvokeRoutesOptions, buildRouteExecOpts, prepareInvocation } from './agent-invoke-prepare.js';

export type { AgentInvokeRoutesOptions } from './agent-invoke-prepare.js';

export const agentInvokeRoutes: FastifyPluginAsync<AgentInvokeRoutesOptions> = async (app, opts) => {
  app.get('/api/agent/invoke/capabilities', async () => ({
    ok: true,
    available: true,
    skill: 'stock-advisor',
    routes: [
      { path: '/api/agent/invoke', method: 'POST', mode: 'sync' },
      { path: '/api/agent/invoke/stream', method: 'POST', mode: 'sse' },
    ],
    route: '/api/agent/invoke',
    methods: ['POST'],
    maxTimeoutMs: 300_000,
    streamEventTypes: ['session_init', 'text', 'tool_call', 'tool_result', 'error', 'done'],
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
    errors: [...(STOCK_ANALYSIS_RESPONSE_CODES as readonly string[])],
  }));

  // ── Sync POST ────────────────────────────────────────────────
  app.post('/api/agent/invoke', async (request, reply) => {
    const prep = await prepareInvocation(
      request.body,
      request.headers as Record<string, string | string[] | undefined>,
      reply,
      opts,
      buildStockAdvisorPrompt,
    );
    if (prep.error) return prep.error;
    const { body: b, targetCats, prompt, intent, controller, invocationId } = prep;
    const timeoutMs = b.timeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS;
    try {
      const cursorBoundaries = new Map<string, string>();
      const persistenceContext: PersistenceContext = { failed: false, errors: [] };
      let rawContent = '';
      let errorText: string | null = null;
      await consumeRouteExecutionWithHardTimeout(
        opts.router.routeExecution(
          prep.userId,
          prompt,
          b.threadId,
          prep.userMessageId,
          targetCats,
          intent,
          buildRouteExecOpts(
            opts,
            invocationId,
            b,
            controller,
            prep.userMessageId,
            targetCats,
            cursorBoundaries,
            persistenceContext,
          ),
        ) as AsyncIterable<AgentInvokeRouteMessage>,
        timeoutMs,
        (e) => controller.abort(e),
        (msg) => {
          if (msg.type === 'text' && typeof msg.content === 'string')
            rawContent = msg.textMode === 'replace' ? msg.content : `${rawContent}${msg.content}`;
          else if (msg.type === 'error')
            errorText = typeof msg.error === 'string' ? msg.error : 'Agent invocation failed';
        },
      );
      if (errorText) {
        await opts.invocationRecordStore.update(invocationId, { status: 'failed', error: errorText });
        return failClosed(reply, 502, 'AGENT_EXECUTION_FAILED', errorText, { invocationId });
      }
      if (persistenceContext.failed) {
        const d = persistenceContext.errors.map((e) => `${e.catId}: ${e.error}`).join('; ');
        await opts.invocationRecordStore.update(invocationId, {
          status: 'failed',
          error: `Message persistence failed: ${d}`,
        });
        return failClosed(reply, 502, 'PERSISTENCE_FAILED', `Message persistence failed: ${d}`, { invocationId });
      }
      const result = extractStockAnalysisPayload(rawContent, b.investorId);
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
        correlationId: b.correlationId ?? null,
        investorId: b.investorId,
        rawContent,
        result: result.payload,
      };
    } catch (err) {
      const timedOut = err instanceof InvokeTimeoutError;
      const error = timedOut ? err.message : err instanceof Error ? err.message : String(err);
      if (invocationId) await opts.invocationRecordStore.update(invocationId, { status: 'failed', error });
      return failClosed(
        reply,
        timedOut || controller.signal.aborted ? 504 : 500,
        timedOut || controller.signal.aborted ? 'INVOKE_TIMEOUT' : 'INVOKE_FAILED',
        error,
        { invocationId, ...(timedOut ? { timeoutMs: err.timeoutMs } : {}) },
      );
    } finally {
      opts.invocationTracker.completeAll(b.threadId, targetCats, controller);
    }
  });

  // ── SSE Stream POST ──────────────────────────────────────────
  app.post('/api/agent/invoke/stream', async (request, reply) => {
    const prep = await prepareInvocation(
      request.body,
      request.headers as Record<string, unknown>,
      reply,
      opts,
      buildStreamingStockAdvisorPrompt,
    );
    if (prep.error) return prep.error;
    const { body: b, targetCats, prompt, intent, controller, invocationId } = prep;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const sendEvent = (e: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(': ping\n\n');
    }, SSE_HEARTBEAT_INTERVAL_MS);
    const timeoutMs = b.timeoutMs ?? STREAM_INVOKE_TIMEOUT_MS;
    let rawContent = '';
    let hadError = false;
    let abortReason: string | null = null;
    const cursorBoundaries = new Map<string, string>();
    const persistenceContext: PersistenceContext = { failed: false, errors: [] };
    try {
      await consumeRouteExecutionWithHardTimeout(
        opts.router.routeExecution(
          prep.userId,
          prompt,
          b.threadId,
          prep.userMessageId,
          targetCats,
          intent,
          buildRouteExecOpts(
            opts,
            invocationId,
            b,
            controller,
            prep.userMessageId,
            targetCats,
            cursorBoundaries,
            persistenceContext,
          ),
        ) as AsyncIterable<AgentInvokeRouteMessage>,
        timeoutMs,
        () => {
          abortReason = 'timeout';
          controller.abort(new InvokeTimeoutError(timeoutMs));
        },
        (msg) => {
          if (reply.raw.destroyed || reply.raw.writableEnded) {
            controller.abort(new Error('Client disconnected'));
            return;
          }
          if (msg.type === 'text' && typeof msg.content === 'string')
            rawContent = msg.textMode === 'replace' ? msg.content : `${rawContent}${msg.content}`;
          else if (msg.type === 'error') hadError = true;
          const streamEvent = mapToStreamEvent(msg, invocationId, b.threadId, b.investorId, b.correlationId ?? null);
          if (streamEvent) sendEvent(streamEvent);
        },
      );
    } catch (err) {
      const timedOut = err instanceof InvokeTimeoutError;
      if (timedOut || abortReason === 'timeout')
        sendEvent({
          type: 'error',
          error: `Agent invoke timed out after ${timeoutMs}ms`,
          code: 'INVOKE_TIMEOUT',
          invocationId,
        });
      else if (!reply.raw.destroyed)
        sendEvent({
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
          code: 'INVOKE_FAILED',
          invocationId,
        });
    }
    // ── 收尾: done event ──
    clearInterval(heartbeat);
    let doneOk = false;
    let doneResult: unknown;
    let doneCode: string | undefined;
    if (hadError && !rawContent) {
      doneOk = false;
      doneCode = 'AGENT_EXECUTION_FAILED';
    } else if (persistenceContext.failed) {
      doneOk = false;
      doneCode = 'PERSISTENCE_FAILED';
    } else {
      const extracted = extractStockAnalysisPayload(rawContent, b.investorId);
      if (extracted.ok) {
        doneOk = true;
        doneResult = extracted.payload;
      } else {
        doneOk = false;
        doneCode = 'CONTRACT_MISMATCH';
      }
    }
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      sendEvent({
        type: 'done',
        ok: doneOk,
        invocationId,
        ...(doneOk ? { result: doneResult } : {}),
        ...(!doneOk && doneCode ? { code: doneCode } : {}),
        ...(!doneOk && rawContent ? { rawContent } : {}),
      } as Record<string, unknown>);
      reply.raw.end();
    }
    if (invocationId)
      await opts.invocationRecordStore.update(invocationId, {
        status: doneOk ? 'succeeded' : 'failed',
        ...(doneOk ? {} : { error: doneCode ?? 'unknown' }),
      });
    opts.invocationTracker.completeAll(b.threadId, targetCats, controller);
  });
};
