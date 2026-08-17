import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION,
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
  assertAdaptiveDevelopmentOperationalCanaryReceipt,
  assertAdaptiveDevelopmentOperationalCanaryReviewerObservation,
  buildAdaptiveDevelopmentOperationalCanaryDirective,
  buildAdaptiveDevelopmentOperationalCanaryScope,
  parseAdaptiveDevelopmentOperationalCanaryPlan,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary.js';

const authority = {
  operatorUserId: 'default-user',
  threadId: 'thread_mrsvt7x42vkz9ua5',
  messageStoreIdentitySha256: 'a'.repeat(64),
  runtimeInstanceIdentitySha256: 'b'.repeat(64),
};

function scopeFixture() {
  return buildAdaptiveDevelopmentOperationalCanaryScope({
    runnerCommit: 'c'.repeat(40),
    environmentSha256: 'd'.repeat(64),
    modelId: 'gpt-5.6-sol',
  });
}

describe('Adaptive Development operational canary contract', () => {
  it('pins a separate two-role unbounded scope and exact action-level directive', () => {
    const scope = scopeFixture();
    const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
    assert.deepEqual(scope.roles, [
      { role: 'executor', filesystemAccess: 'write', tokenPolicy: 'unbounded' },
      { role: 'reviewer', filesystemAccess: 'read', tokenPolicy: 'unbounded' },
    ]);
    assert.equal(scope.tokenPolicy, 'unbounded');
    assert.equal(
      buildAdaptiveDevelopmentOperationalCanaryDirective(scopeSha256, authority),
      `APPROVE_ADAPTIVE_S0_CANARY scope_sha256=${scopeSha256} operator_user_id=default-user thread_id=thread_mrsvt7x42vkz9ua5 message_store_identity_sha256=${'a'.repeat(64)} runtime_instance_identity_sha256=${'b'.repeat(64)} token_policy=unbounded`,
    );
  });

  it('rejects a canary plan whose approval is reused for another scope', () => {
    const scope = scopeFixture();
    const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
    const plan = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION,
      canaryScopeSha256: scopeSha256,
      scope,
      authorization: {
        kind: 'operator_approval',
        approvalRef: 'cat-cafe://message/message-1',
        approvalMessageSha256: 'e'.repeat(64),
        approvedOperationalCanaryScopeSha256: scopeSha256,
        approvedAt: '2026-08-03T00:00:00.000Z',
      },
    };
    assert.deepEqual(parseAdaptiveDevelopmentOperationalCanaryPlan(plan), plan);
    assert.throws(
      () =>
        parseAdaptiveDevelopmentOperationalCanaryPlan({
          ...plan,
          authorization: {
            ...plan.authorization,
            approvedOperationalCanaryScopeSha256: 'f'.repeat(64),
          },
        }),
      /one exact approved scope/,
    );
  });

  it('rejects historical capped scopes as current unbounded authorization inputs', () => {
    const currentScope = scopeFixture();
    const legacyScope = {
      ...currentScope,
      schemaVersion: 'lf-0001.adaptive-operational-canary-scope.v1',
      roles: [
        { role: 'executor', filesystemAccess: 'write', tokenCap: 5_000 },
        { role: 'reviewer', filesystemAccess: 'read', tokenCap: 5_000 },
      ],
      totalTokenCap: 10_000,
    };
    delete legacyScope.tokenPolicy;
    const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(legacyScope);
    assert.throws(
      () =>
        parseAdaptiveDevelopmentOperationalCanaryPlan({
          schemaVersion: 'lf-0001.adaptive-operational-canary-plan.v1',
          canaryScopeSha256,
          scope: legacyScope,
          authorization: {
            kind: 'operator_approval',
            approvalRef: 'cat-cafe://message/consumed-legacy-message',
            approvalMessageSha256: 'e'.repeat(64),
            approvedOperationalCanaryScopeSha256: canaryScopeSha256,
            approvedAt: '2026-08-03T00:00:00.000Z',
          },
        }),
      /scope contains an unexpected field/,
    );
  });

  it('requires receipt-bound usage, tool execution, and the same frozen marker for both roles', () => {
    const scope = scopeFixture();
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
    const receipt = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
      status: 'passed',
      zeroModelProvider: false,
      runnerCommit: scope.runnerCommit,
      environmentSha256: scope.environmentSha256,
      modelId: scope.modelId,
      canaryScopeSha256: fingerprintAdaptiveDevelopmentBenchmark(scope),
      canaryPlanSha256: '1'.repeat(64),
      tokenPolicy: 'unbounded',
      completedAt: '2026-08-03T00:01:00.000Z',
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
    assert.doesNotThrow(() => assertAdaptiveDevelopmentOperationalCanaryReceipt(receipt));
    assert.throws(
      () =>
        assertAdaptiveDevelopmentOperationalCanaryReceipt({
          ...receipt,
          roles: {
            ...receipt.roles,
            reviewer: { ...receipt.roles.reviewer, observedMarkerSha256: '4'.repeat(64) },
          },
        }),
      /did not observe/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentOperationalCanaryReceipt({
          ...receipt,
          roles: { ...receipt.roles, executor: { ...receipt.roles.executor, toolCalls: 0 } },
        }),
      /write real-provider role/,
    );
    assert.throws(
      () => assertAdaptiveDevelopmentOperationalCanaryReceipt({ ...receipt, selfReportedPassing: true }),
      /unexpected field/,
    );
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentOperationalCanaryReceipt({
        ...receipt,
        roles: {
          ...receipt.roles,
          executor: { ...receipt.roles.executor, inputTokens: 40_000, outputTokens: 10_000 },
        },
      }),
    );
  });

  it('binds reviewer observation to the exact successful shasum command output, not a self-reported hash', () => {
    const markerSha256 = 'a'.repeat(64);
    const exactCommand = '/usr/bin/shasum -a 256 .adaptive-operational-canary';
    const event = (command, aggregatedOutput) =>
      `${JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item-review',
          type: 'command_execution',
          command,
          aggregated_output: aggregatedOutput,
          exit_code: 0,
          status: 'completed',
        },
      })}\n`;
    const wrappedCommand = `/bin/zsh -lc ${JSON.stringify(exactCommand)}`;
    assert.deepEqual(
      assertAdaptiveDevelopmentOperationalCanaryReviewerObservation(
        event(wrappedCommand, `${markerSha256}  .adaptive-operational-canary\n`),
        markerSha256,
      ),
      {
        command: wrappedCommand,
        aggregatedOutput: `${markerSha256}  .adaptive-operational-canary\n`,
        exitCode: 0,
      },
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentOperationalCanaryReviewerObservation(
          event('/bin/zsh -lc "true"', `${markerSha256}  .adaptive-operational-canary\n`),
          markerSha256,
        ),
      /did not bind the marker hash to the required read command/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentOperationalCanaryReviewerObservation(
          event(wrappedCommand, `${'b'.repeat(64)}  .adaptive-operational-canary\n`),
          markerSha256,
        ),
      /did not bind the marker hash to the required read command/,
    );
  });
});
