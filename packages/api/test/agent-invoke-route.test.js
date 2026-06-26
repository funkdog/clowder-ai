import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

describe('agentInvokeRoutes', () => {
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

    const app = Fastify();
    await app.register(agentInvokeRoutes, {
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
    await app.ready();
    return { app, routeExecutionCalls, updates, appendedMessages };
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

  test('GET /api/agent/invoke/capabilities returns machine-readable capability contract', async () => {
    const { app } = await createApp();

    const res = await app.inject({ method: 'GET', url: '/api/agent/invoke/capabilities' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.available, true);
    assert.equal(body.request.type, 'stock_advisor.invoke.v1');
    assert.equal(body.response.type, 'stock_analysis_v1');
    assert.equal(body.response.mode, 'fail_closed');
    assert.ok(body.errors.includes('CONTRACT_MISMATCH'));

    await app.close();
  });

  test('POST /api/agent/invoke returns rawContent plus parsed stock_analysis_v1 payload', async () => {
    const rawContent = `分析如下\n\`\`\`json\n${JSON.stringify(validResult, null, 2)}\n\`\`\``;
    const { app, updates, routeExecutionCalls, appendedMessages } = await createApp({
      routeExecutionMessages: [{ type: 'text', content: rawContent }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke',
      payload: validPayload,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.result.type, 'stock_analysis_v1');
    assert.equal(body.result.investor_id, 'inv_01');
    assert.equal(body.rawContent, rawContent);
    assert.equal(routeExecutionCalls.length, 1);
    assert.equal(appendedMessages.length, 1);
    assert.equal(updates.at(-1)?.patch.status, 'succeeded');

    await app.close();
  });

  test('POST /api/agent/invoke fail-closes when investor_id mismatches requested investor', async () => {
    const wrongInvestor = { ...validResult, investor_id: 'inv_02' };
    const { app, updates } = await createApp({
      routeExecutionMessages: [{ type: 'text', content: JSON.stringify(wrongInvestor) }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke',
      payload: validPayload,
    });

    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'CONTRACT_MISMATCH');
    assert.match(body.error, /stock_analysis_v1 contract/);
    assert.ok(Array.isArray(body.details));
    assert.equal(updates.at(-1)?.patch.status, 'failed');

    await app.close();
  });

  test('POST /api/agent/invoke fail-closes malformed request body', async () => {
    const { app } = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke',
      payload: { ...validPayload, type: 'wrong.type' },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'INVALID_REQUEST');
    assert.ok(Array.isArray(body.details));

    await app.close();
  });

  test('POST /api/agent/invoke returns 504 when routeExecution next() does not settle', async () => {
    let returnCalled = false;
    const { app, updates } = await createApp({
      routeExecution() {
        returnCalled = false;
        const never = new Promise(() => {});
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          next() {
            return never;
          },
          return() {
            returnCalled = true;
            return Promise.resolve({ done: true });
          },
        };
      },
      trackerAvailable: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke',
      payload: { ...validPayload, timeoutMs: 1000 },
    });

    assert.equal(res.statusCode, 504);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'INVOKE_TIMEOUT');
    assert.equal(body.timeoutMs, 1000);
    assert.equal(updates.at(-1)?.patch.status, 'failed');
    assert.match(updates.at(-1)?.patch.error, /timed out after 1000ms/);
    assert.equal(returnCalled, true);

    await app.close();
  });

  test('POST /api/agent/invoke fail-closes when thread is missing', async () => {
    const { app } = await createApp({ thread: null });

    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/invoke',
      payload: validPayload,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'THREAD_NOT_FOUND');

    await app.close();
  });
});
