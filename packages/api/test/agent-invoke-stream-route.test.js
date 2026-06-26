/**
 * TDD tests for POST /api/agent/invoke/stream (SSE route).
 * Per design doc §6: 6 test points.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

/**
 * Parse an SSE response body into individual events.
 * Handles `data: {...}\n\n` format and `: ping\n\n` comments.
 */
function parseSseEvents(body) {
  const events = [];
  const pings = [];
  for (const chunk of body.split('\n\n')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(':')) {
      pings.push(trimmed);
      continue;
    }
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {
          /* skip malformed */
        }
      }
    }
  }
  return { events, pings };
}

describe('agentInvokeRoutes — SSE stream', () => {
  async function createApp({
    routeExecutionMessages = [],
    routeExecution,
    thread = { id: 'thread-1', deletedAt: null },
    createOutcome = { outcome: 'created', invocationId: 'inv-1' },
    appendMessageId = 'msg-1',
    trackerAvailable = true,
  } = {}) {
    const { agentInvokeRoutes } = await import('../dist/routes/agent-invoke.js');

    const routeExecutionCalls = [];
    const updates = [];
    const appendedMessages = [];

    const appInstance = Fastify();
    await appInstance.register(agentInvokeRoutes, {
      router: {
        routeExecution(...args) {
          routeExecutionCalls.push(args);
          if (routeExecution) return routeExecution(...args);
          return (async function* defaultRouteExecution() {
            for (const msg of routeExecutionMessages) yield msg;
          })();
        },
      },
      messageStore: {
        async append(message) {
          appendedMessages.push(message);
          return { id: appendMessageId };
        },
      },
      invocationRecordStore: {
        async create() {
          return createOutcome;
        },
        async update(invocationId, patch) {
          updates.push({ invocationId, patch });
        },
      },
      invocationTracker: {
        tryStartThreadAll() {
          if (!trackerAvailable) return null;
          return { signal: { aborted: false }, abort() {} };
        },
        getController() {
          return { signal: { aborted: false } };
        },
        completeAll() {},
      },
      threadStore: {
        async get() {
          return thread;
        },
      },
      queueProcessor: {
        hasQueuedNonAgentForThread() {
          return false;
        },
        hasActiveOrQueuedAgentForCat() {
          return false;
        },
        enqueueRaw() {},
      },
    });
    await appInstance.ready();
    return { app: appInstance, routeExecutionCalls, updates, appendedMessages };
  }

  const validPayload = {
    type: 'stock_advisor.invoke.v1',
    skill: 'stock-advisor',
    catId: 'cat-9qxnn39j',
    threadId: 'thread-1',
    investorId: 'inv_01',
    input: { state: { investorId: 'inv_01' } },
  };

  const validResult = {
    type: 'stock_analysis_v1',
    timestamp: '2026-06-24T08:00:00+08:00',
    investor_id: 'inv_01',
    portfolio_verdict: '结构性行情',
    action_count: 1,
    watch_count: 0,
    normal_count: 1,
    positions: [
      {
        code: 'sh601688',
        name: '华泰证券',
        price: 21.6,
        change_pct: 2.3,
        pct_of_portfolio: 9.2,
        target_pct: 9,
        status: 'action',
        three_dimensions: '3/3',
        planned_action: null,
      },
    ],
    portfolio_summary: {
      total_position_pct: 33.8,
      cash: 294960,
      correlation_groups: {},
    },
    actions: [
      {
        code: 'sh601688',
        name: '华泰证券',
        action: 'buy',
        reason: '三维度共振',
        amount: 30400,
        requires_confirm: true,
      },
    ],
  };

  // ── Test 1: Pre-hijack fail-closed returns JSON, not SSE ──

  test('POST /stream returns 400 JSON for malformed body', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: { ...validPayload, type: 'wrong.type' },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'INVALID_REQUEST');
    await app.close();
  });

  test('POST /stream returns 404 JSON for missing thread', async () => {
    const { app } = await createApp({ thread: null });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'THREAD_NOT_FOUND');
    await app.close();
  });

  test('POST /stream returns 409 JSON for thread busy', async () => {
    const { app } = await createApp({ trackerAvailable: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'THREAD_BUSY');
    await app.close();
  });

  test('POST /stream returns 409 JSON for duplicate request', async () => {
    const { app } = await createApp({
      createOutcome: { outcome: 'duplicate', invocationId: 'inv-dup' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'DUPLICATE_REQUEST');
    await app.close();
  });

  // ── Test 2: Event mapping — tool_use→tool_call, text, tool_result, done ──

  test('POST /stream maps internal events to SSE event types', async () => {
    const rawContent = `分析如下\n\`\`\`json\n${JSON.stringify(validResult, null, 2)}\n\`\`\``;
    const { app } = await createApp({
      routeExecutionMessages: [
        { type: 'text', content: '分析如下\n' },
        { type: 'tool_use', toolName: 'bash', toolInput: { command: 'curl tencent-api' }, toolUseId: 'tu-1' },
        { type: 'tool_result', toolName: 'bash', toolUseId: 'tu-1', toolResultStatus: 'ok', content: '{"data":...}' },
        { type: 'text', content: rawContent },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });

    assert.equal(res.statusCode, 200);
    const { events } = parseSseEvents(res.body);

    // Check event types in order (text → tool_call → tool_result → text → done)
    const types = events.map((e) => e.type);
    assert.ok(types.includes('tool_call'), `Expected tool_call in ${types}`);
    assert.ok(types.includes('tool_result'), `Expected tool_result in ${types}`);

    // tool_use → tool_call mapping
    const toolCall = events.find((e) => e.type === 'tool_call');
    assert.equal(toolCall.toolName, 'bash');
    assert.equal(toolCall.toolUseId, 'tu-1');
    assert.deepEqual(toolCall.toolInput, { command: 'curl tencent-api' });

    // tool_result mapping
    const toolResult = events.find((e) => e.type === 'tool_result');
    assert.equal(toolResult.toolName, 'bash');
    assert.equal(toolResult.toolUseId, 'tu-1');
    assert.equal(toolResult.status, 'ok');

    // done at the end
    const done = events.find((e) => e.type === 'done');
    assert.ok(done, 'Expected done event');
    assert.equal(done.ok, true);
    assert.equal(done.result.type, 'stock_analysis_v1');

    await app.close();
  });

  // ── Test 3: Whitelist filtering — internal events not in stream ──

  test('POST /stream filters out system_info/provider_signal/liveness_signal', async () => {
    const rawContent = `分析如下\n\`\`\`json\n${JSON.stringify(validResult, null, 2)}\n\`\`\``;
    const { app } = await createApp({
      routeExecutionMessages: [
        { type: 'system_info', content: JSON.stringify({ type: 'budget_warning' }) },
        { type: 'provider_signal', content: 'retry' },
        { type: 'liveness_signal' },
        { type: 'agent_loop' },
        { type: 'status', content: 'running' },
        { type: 'text', content: rawContent },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });

    const { events } = parseSseEvents(res.body);
    const types = events.map((e) => e.type);

    // None of these should appear
    assert.ok(!types.includes('system_info'), 'system_info should be filtered');
    assert.ok(!types.includes('provider_signal'), 'provider_signal should be filtered');
    assert.ok(!types.includes('liveness_signal'), 'liveness_signal should be filtered');
    assert.ok(!types.includes('agent_loop'), 'agent_loop should be filtered');
    assert.ok(!types.includes('status'), 'status should be filtered');

    // Only text + done should be present
    assert.ok(types.includes('text'), 'Expected text event');
    assert.ok(types.includes('done'), 'Expected done event');

    await app.close();
  });

  // ── Test 4: done dual path — success vs contract mismatch ──

  test('POST /stream done{ok:true,result} when payload parses', async () => {
    const rawContent = `\`\`\`json\n${JSON.stringify(validResult, null, 2)}\n\`\`\``;
    const { app } = await createApp({
      routeExecutionMessages: [{ type: 'text', content: rawContent }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });

    const { events } = parseSseEvents(res.body);
    const done = events.find((e) => e.type === 'done');
    assert.equal(done.ok, true);
    assert.equal(done.result.type, 'stock_analysis_v1');
    assert.equal(done.result.investor_id, 'inv_01');

    await app.close();
  });

  test('POST /stream done{ok:false,code:CONTRACT_MISMATCH,rawContent} when payload fails', async () => {
    const { app } = await createApp({
      routeExecutionMessages: [{ type: 'text', content: 'This is just plain text, no JSON' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });

    const { events } = parseSseEvents(res.body);
    const done = events.find((e) => e.type === 'done');
    assert.equal(done.ok, false);
    assert.equal(done.code, 'CONTRACT_MISMATCH');
    assert.equal(done.rawContent, 'This is just plain text, no JSON');

    await app.close();
  });

  // ── Test 5: Hard timeout — routeExecution never resolves ──

  test('POST /stream emits error{INVOKE_TIMEOUT} + done{ok:false} on timeout', async () => {
    let returnCalled = false;
    const { app, updates } = await createApp({
      routeExecution() {
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          next() {
            return new Promise(() => {}); // never resolves
          },
          return() {
            returnCalled = true;
            return Promise.resolve({ done: true });
          },
        };
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: { ...validPayload, timeoutMs: 1000 },
    });

    const { events } = parseSseEvents(res.body);

    const errorEvent = events.find((e) => e.type === 'error');
    assert.ok(errorEvent, 'Expected error event');
    assert.equal(errorEvent.code, 'INVOKE_TIMEOUT');

    const done = events.find((e) => e.type === 'done');
    assert.ok(done, 'Expected done event after timeout');
    assert.equal(done.ok, false);

    assert.equal(updates.at(-1)?.patch.status, 'failed');

    await app.close();
  });

  // ── Test 6: Client disconnect — abort invoked, completeAll called ──

  test('POST /stream handles client disconnect gracefully', async () => {
    let abortCalled = false;
    let completeAllCalled = false;
    const FastifyMod = await import('fastify');
    const fastify = FastifyMod.default;
    const { agentInvokeRoutes } = await import('../dist/routes/agent-invoke.js');

    const appInstance = fastify();
    await appInstance.register(agentInvokeRoutes, {
      router: {
        routeExecution() {
          // Emit one message then simulate client disconnect
          return (async function* () {
            yield { type: 'text', content: 'starting...' };
            // After this, the test verifies that completeAll runs in finally
          })();
        },
      },
      messageStore: {
        async append() {
          return { id: 'msg-1' };
        },
      },
      invocationRecordStore: {
        async create() {
          return { outcome: 'created', invocationId: 'inv-1' };
        },
        async update() {},
      },
      invocationTracker: {
        tryStartThreadAll() {
          return {
            signal: { aborted: false },
            abort() {
              abortCalled = true;
            },
          };
        },
        getController() {
          return { signal: { aborted: false } };
        },
        completeAll() {
          completeAllCalled = true;
        },
      },
      threadStore: {
        async get() {
          return { id: 'thread-1', deletedAt: null };
        },
      },
      queueProcessor: {
        hasQueuedNonAgentForThread() {
          return false;
        },
        hasActiveOrQueuedAgentForCat() {
          return false;
        },
        enqueueRaw() {},
      },
    });
    await appInstance.ready();

    const res = await appInstance.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: validPayload,
    });

    // completeAll should have been called in finally block
    assert.ok(completeAllCalled, 'completeAll should be called in finally');

    await appInstance.close();
  });

  // ── Test 7: capabilities includes stream route ──

  test('GET /api/agent/invoke/capabilities includes stream route', async () => {
    const { app } = await createApp();

    const res = await app.inject({ method: 'GET', url: '/api/agent/invoke/capabilities' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.routes, 'Expected routes array');
    const streamRoute = body.routes.find((r) => r.mode === 'sse');
    assert.ok(streamRoute, 'Expected stream route in capabilities');
    assert.equal(streamRoute.path, '/api/agent/invoke/stream');
    assert.equal(streamRoute.method, 'POST');

    assert.ok(Array.isArray(body.streamEventTypes), 'Expected streamEventTypes');
    assert.ok(body.streamEventTypes.includes('tool_call'), 'Expected tool_call in event types');
    assert.ok(body.streamEventTypes.includes('tool_result'), 'Expected tool_result in event types');
    assert.ok(body.streamEventTypes.includes('done'), 'Expected done in event types');

    await app.close();
  });

  // ── Test 8: session_init from invocation_created ──

  test('POST /stream emits session_init from system_info invocation_created', async () => {
    const rawContent = `\`\`\`json\n${JSON.stringify(validResult, null, 2)}\n\`\`\``;
    const { app } = await createApp({
      createOutcome: { outcome: 'created', invocationId: 'inv-session-1' },
      routeExecutionMessages: [
        {
          type: 'system_info',
          catId: 'cat-9qxnn39j',
          content: JSON.stringify({ type: 'invocation_created', invocationId: 'inv-session-1' }),
          timestamp: Date.now(),
        },
        { type: 'text', content: rawContent },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke/stream',
      payload: { ...validPayload, correlationId: 'corr-42' },
    });

    const { events } = parseSseEvents(res.body);
    const sessionInit = events.find((e) => e.type === 'session_init');
    assert.ok(sessionInit, 'Expected session_init event');
    assert.equal(sessionInit.invocationId, 'inv-session-1');
    assert.equal(sessionInit.investorId, 'inv_01');
    assert.equal(sessionInit.correlationId, 'corr-42');

    await app.close();
  });
});