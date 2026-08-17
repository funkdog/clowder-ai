import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildAdaptiveDevelopmentBenchmarkLaunchPlan,
  buildAdaptiveDevelopmentBenchmarkLaunchScope,
  fingerprintAdaptiveDevelopmentBenchmark,
  parseAdaptiveDevelopmentBenchmarkManifest,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import { RedisAdaptiveDevelopmentBenchmarkExecutionStore } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-execution-store.js';

class FakeRedis {
  values = new Map();

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async eval(_script, keyCount, ...args) {
    if (keyCount === 2) {
      const [recordKey, approvalKey, recordRaw, planSha256] = args;
      if (this.values.has(recordKey)) return -1;
      if (this.values.has(approvalKey)) return -2;
      this.values.set(recordKey, recordRaw);
      this.values.set(approvalKey, planSha256);
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

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const manifest = parseAdaptiveDevelopmentBenchmarkManifest(
  JSON.parse(
    readFileSync(
      join(repositoryRoot, 'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json'),
      'utf8',
    ),
  ),
);
const stageId = 's0-measurement-smoke';
const authority = {
  operatorUserId: 'default-user',
  threadId: 'thread_mrsvt7x42vkz9ua5',
  messageStoreIdentitySha256: 'a'.repeat(64),
  runtimeInstanceIdentitySha256: 'b'.repeat(64),
};

function planFixture({ environmentSha256 = 'c'.repeat(64) } = {}) {
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  assert.ok(stage);
  const scope = buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, stageId, {
    executionMode: 'live',
    environmentSha256,
    budgetByTask: Object.fromEntries(
      stage.taskIds.map((taskId) => [taskId, { tokenPolicy: 'unbounded', wallTimeMsCap: 600_000 }]),
    ),
    stageBudget: { tokenPolicy: 'unbounded', maximumInfrastructureRetryAttempts: 1 },
  });
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  return buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, stageId, {
    scope,
    authorization: {
      kind: 'operator_approval',
      authorizedBy: 'co-creator',
      approvalRef: 'cat-cafe://message/message-s0',
      approvalMessageSha256: 'd'.repeat(64),
      approvedLaunchScopeSha256: scopeSha256,
      approvedAt: '2026-08-04T00:00:00.000Z',
    },
  });
}

function initialAttemptBindings(plan) {
  const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  return plan.runs.map((run) => ({
    runKey: run.runKey,
    attempt: 1,
    reservationSha256: fingerprintAdaptiveDevelopmentBenchmark({ launchPlanSha256, runKey: run.runKey, attempt: 1 }),
  }));
}

describe('Adaptive Development benchmark execution store', () => {
  it('atomically consumes one exact plan and one approval independently of outputRoot', async () => {
    const redis = new FakeRedis();
    const store = new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis);
    const plan = planFixture();
    await store.authorize({ plan, authority, authorizedAt: '2026-08-04T00:00:01.000Z' });

    await assert.rejects(
      new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis).authorize({
        plan,
        authority,
        authorizedAt: '2026-08-04T00:00:02.000Z',
      }),
      /plan has already been consumed/,
    );
    await assert.rejects(
      store.authorize({
        plan: planFixture({ environmentSha256: 'e'.repeat(64) }),
        authority,
        authorizedAt: '2026-08-04T00:00:02.000Z',
      }),
      /approval message has already been consumed/,
    );
  });

  it('persists reserved, running, and terminal attempts and refuses crash replay', async () => {
    const redis = new FakeRedis();
    const store = new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis);
    const plan = planFixture();
    const planSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    await store.authorize({ plan, authority, authorizedAt: '2026-08-04T00:00:01.000Z' });
    const initialAttempts = initialAttemptBindings(plan);
    const reserved = await store.reserveInitialAttempts(planSha256, {
      attempts: initialAttempts,
      reservedAt: '2026-08-04T00:00:02.000Z',
    });
    assert.ok(reserved.attempts.every((attempt) => attempt.state === 'reserved'));
    await assert.rejects(
      store.reserveInitialAttempts(planSha256, {
        attempts: initialAttempts,
        reservedAt: '2026-08-04T00:00:03.000Z',
      }),
      /cannot transition from running/,
    );

    const runKey = plan.runs[0].runKey;
    await store.startAttempt(planSha256, {
      runKey,
      attempt: 1,
      runId: 'run-one',
      startedAt: '2026-08-04T00:00:03.000Z',
    });
    await assert.rejects(
      new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis).startAttempt(planSha256, {
        runKey,
        attempt: 1,
        runId: 'run-replay',
        startedAt: '2026-08-04T00:00:04.000Z',
      }),
      /already running|not reserved/,
    );
    const terminal = await store.finishAttempt(planSha256, {
      runKey,
      attempt: 1,
      runId: 'run-one',
      completedAt: '2026-08-04T00:00:04.000Z',
      receiptSha256: 'f'.repeat(64),
      infrastructureError: true,
      stopStage: false,
    });
    assert.equal(terminal.attempts.find((attempt) => attempt.runKey === runKey)?.state, 'terminal');

    const retry = {
      runKey,
      attempt: 2,
      reservationSha256: fingerprintAdaptiveDevelopmentBenchmark({ planSha256, runKey, attempt: 2 }),
    };
    await store.reserveRetry(planSha256, { attempt: retry, reservedAt: '2026-08-04T00:00:05.000Z' });
    await store.startAttempt(planSha256, {
      runKey,
      attempt: 2,
      runId: 'run-retry',
      startedAt: '2026-08-04T00:00:06.000Z',
    });
    await store.finishAttempt(planSha256, {
      runKey,
      attempt: 2,
      runId: 'run-retry',
      completedAt: '2026-08-04T00:00:07.000Z',
      receiptSha256: '1'.repeat(64),
      infrastructureError: false,
      stopStage: false,
    });
    const persisted = await new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis).get(planSha256);
    assert.equal(persisted?.attempts.filter((attempt) => attempt.state === 'terminal').length, 2);
  });
});
