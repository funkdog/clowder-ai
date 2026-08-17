import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION,
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
  buildAdaptiveDevelopmentOperationalCanaryScope,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary.js';
import {
  adaptiveDevelopmentOperationalCanaryExecutionKey,
  RedisAdaptiveDevelopmentOperationalCanaryExecutionStore,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary-store.js';

class FakeRedis {
  values = new Map();

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async eval(_script, keyCount, ...args) {
    if (keyCount === 2) {
      const [recordKey, approvalKey, recordRaw, canaryPlanSha256] = args;
      if (this.values.has(recordKey)) return -1;
      if (this.values.has(approvalKey)) return -2;
      this.values.set(recordKey, recordRaw);
      this.values.set(approvalKey, canaryPlanSha256);
      return 1;
    }
    if (keyCount === 1) {
      const [recordKey, expectedRaw, nextRaw] = args;
      if (this.values.get(recordKey) !== expectedRaw) return 0;
      this.values.set(recordKey, nextRaw);
      return 1;
    }
    throw new Error(`unsupported fake Redis key count: ${keyCount}`);
  }
}

const authority = {
  operatorUserId: 'default-user',
  threadId: 'thread_mrsvt7x42vkz9ua5',
  messageStoreIdentitySha256: 'a'.repeat(64),
  runtimeInstanceIdentitySha256: 'b'.repeat(64),
};

function planFixture({ runnerCommit = 'c'.repeat(40), messageId = 'message-1' } = {}) {
  const scope = buildAdaptiveDevelopmentOperationalCanaryScope({
    runnerCommit,
    environmentSha256: 'd'.repeat(64),
    modelId: 'gpt-5.6-sol',
  });
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION,
    canaryScopeSha256,
    scope,
    authorization: {
      kind: 'operator_approval',
      approvalRef: `cat-cafe://message/${messageId}`,
      approvalMessageSha256: 'e'.repeat(64),
      approvedOperationalCanaryScopeSha256: canaryScopeSha256,
      approvedAt: '2026-08-03T00:00:00.000Z',
    },
  };
}

function receiptFixture(plan) {
  const role = (filesystemAccess) => ({
    filesystemAccess,
    tokenPolicy: 'unbounded',
    credentialMounted: true,
    credentialRemoved: true,
    completed: true,
    usageObserved: true,
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 50,
    toolCalls: 1,
    failedToolCalls: 0,
  });
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
    status: 'passed',
    zeroModelProvider: false,
    runnerCommit: plan.scope.runnerCommit,
    environmentSha256: plan.scope.environmentSha256,
    modelId: plan.scope.modelId,
    canaryScopeSha256: plan.canaryScopeSha256,
    canaryPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(plan),
    tokenPolicy: 'unbounded',
    completedAt: '2026-08-03T00:04:00.000Z',
    roles: {
      executor: {
        ...role('write'),
        markerSha256: '2'.repeat(64),
        postModelCommit: '3'.repeat(40),
      },
      reviewer: {
        ...role('read'),
        observedMarkerSha256: '2'.repeat(64),
        observationCommandSha256: '4'.repeat(64),
      },
    },
  };
}

describe('Adaptive Development operational canary execution store', () => {
  it('atomically consumes one plan across output roots and persists a trusted passing receipt', async () => {
    const redis = new FakeRedis();
    const plan = planFixture();
    const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    const first = new RedisAdaptiveDevelopmentOperationalCanaryExecutionStore(redis);
    await first.authorize({ plan, authority, authorizedAt: '2026-08-03T00:01:00.000Z' });

    const restarted = new RedisAdaptiveDevelopmentOperationalCanaryExecutionStore(redis);
    await assert.rejects(
      restarted.authorize({ plan, authority, authorizedAt: '2026-08-03T00:01:01.000Z' }),
      /already been consumed/,
    );
    await restarted.reserve(canaryPlanSha256, '2026-08-03T00:02:00.000Z');
    const running = await restarted.start(canaryPlanSha256, '2026-08-03T00:03:00.000Z');
    assert.deepEqual(running.reservation, {
      reservedAt: '2026-08-03T00:02:00.000Z',
      tokenPolicy: 'unbounded',
      roles: [
        { role: 'executor', tokenPolicy: 'unbounded' },
        { role: 'reviewer', tokenPolicy: 'unbounded' },
      ],
    });
    const receipt = receiptFixture(plan);
    const passed = await restarted.pass(canaryPlanSha256, {
      completedAt: receipt.completedAt,
      receipt,
      receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
      receiptArtifactSha256: '4'.repeat(64),
    });

    assert.equal(passed.state, 'passed');
    assert.equal(passed.receiptSha256, fingerprintAdaptiveDevelopmentBenchmark(receipt));
    assert.equal(
      await redis.get(adaptiveDevelopmentOperationalCanaryExecutionKey(canaryPlanSha256)),
      JSON.stringify(passed),
    );
  });

  it('consumes failures and claims one durable approval message for only one plan', async () => {
    const redis = new FakeRedis();
    const store = new RedisAdaptiveDevelopmentOperationalCanaryExecutionStore(redis);
    const firstPlan = planFixture();
    const firstPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(firstPlan);
    await store.authorize({ plan: firstPlan, authority, authorizedAt: '2026-08-03T00:01:00.000Z' });
    await store.reserve(firstPlanSha256, '2026-08-03T00:01:10.000Z');
    await store.start(firstPlanSha256, '2026-08-03T00:01:20.000Z');
    const failed = await store.fail(firstPlanSha256, {
      failedAt: '2026-08-03T00:01:30.000Z',
      failureSha256: '5'.repeat(64),
    });
    assert.equal(failed.state, 'failed');
    await assert.rejects(
      store.authorize({ plan: firstPlan, authority, authorizedAt: '2026-08-03T00:02:00.000Z' }),
      /already been consumed/,
    );
    const forgedReceipt = receiptFixture(firstPlan);
    await assert.rejects(
      store.pass(firstPlanSha256, {
        completedAt: '2026-08-03T00:02:00.000Z',
        receipt: forgedReceipt,
        receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(forgedReceipt),
        receiptArtifactSha256: '6'.repeat(64),
      }),
      /cannot transition from failed/,
    );

    const sameApprovalDifferentPlan = planFixture({ runnerCommit: 'f'.repeat(40) });
    await assert.rejects(
      store.authorize({
        plan: sameApprovalDifferentPlan,
        authority,
        authorizedAt: '2026-08-03T00:02:00.000Z',
      }),
      /approval message has already been consumed/,
    );
  });
});
