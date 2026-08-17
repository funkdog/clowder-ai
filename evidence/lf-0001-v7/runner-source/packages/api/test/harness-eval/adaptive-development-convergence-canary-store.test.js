import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
  buildAdaptiveDevelopmentConvergenceCanaryScope,
  buildAdaptiveDevelopmentOracleCalibrationCertificate,
  deriveAdaptiveDevelopmentConvergenceCandidateEvaluation,
  runAdaptiveDevelopmentConvergenceCanary,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js';
import { adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture } from './helpers/adaptive-development-convergence-review-boundary-fixture.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION,
  adaptiveDevelopmentConvergenceCanaryExecutionKey,
  RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary-store.js';

class FakeRedis {
  values = new Map();

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async eval(_script, keyCount, ...args) {
    const keys = args.slice(0, keyCount);
    const argv = args.slice(keyCount);
    if (keyCount === 2) {
      if (this.values.has(keys[0])) return -1;
      if (this.values.has(keys[1])) return -2;
      this.values.set(keys[0], argv[0]);
      this.values.set(keys[1], argv[1]);
      return 1;
    }
    if (this.values.get(keys[0]) !== argv[0]) return 0;
    this.values.set(keys[0], argv[1]);
    return 1;
  }
}

function fixture() {
  const behaviorIds = ['behavior'];
  const oracle = (candidateSha, passed) => ({
    candidateSha,
    passed,
    checks: [{ id: behaviorIds[0], passed }],
  });
  const calibrationCertificate = buildAdaptiveDevelopmentOracleCalibrationCertificate({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    oracleToolchainSha256: '4'.repeat(64),
    oracleSpecificitySha256: '5'.repeat(64),
    canaryId: 'real-agent-sop-outcome-v3',
    taskId: 'long-disposable-checkout-writes',
    calibration: {
      expectedBehaviorIds: behaviorIds,
      baseline: oracle('6'.repeat(40), false),
      goldProjection: oracle('7'.repeat(40), true),
      behaviorEquivalentAlternate: oracle('8'.repeat(40), true),
      singleFaultMutations: [
        { id: 'break-behavior', targetBehaviorIds: behaviorIds, oracle: oracle('9'.repeat(40), false) },
      ],
    },
  });
  const judge = adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    modelId: 'gpt-5.6-sol',
  });
  const scope = buildAdaptiveDevelopmentConvergenceCanaryScope({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    canaryId: 'real-agent-sop-outcome-v3',
    taskId: 'long-disposable-checkout-writes',
    armId: 'treatment_new_sop',
    modelId: 'gpt-5.6-sol',
    behaviorIds,
    maximumRepairRounds: 0,
    candidateWallTimeMsCap: 2_700_000,
    adjudicationWallTimeMsCap: 2_700_000,
    calibrationCertificate,
    ...judge,
  });
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  const plan = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
    canaryScopeSha256,
    scope,
    authorization: {
      kind: 'operator_approval',
      approvalRef: 'cat-cafe://message/approval-message',
      approvalMessageSha256: '4'.repeat(64),
      approvedConvergenceCanaryScopeSha256: canaryScopeSha256,
      approvedAt: '2026-08-07T07:00:00.000Z',
    },
  };
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  const result = {
    schemaVersion: 'lf-0001.development-convergence-canary-result.v4',
    status: 'diagnostic_complete',
    nonScoring: true,
    effectClaimEligible: false,
    episode: {
      candidate: {
        round: 1,
        candidateSha: '5'.repeat(40),
        candidatePatchSha256: '6'.repeat(64),
        candidateDiffRef: `${'4'.repeat(40)}..${'5'.repeat(40)}`,
        executorRoleKey: 'convergence:executor',
        executorSessionId: 'executor-session',
        executorEpisode: {
          mode: 'natural_agent_graph',
          rootSessionId: 'executor-session',
          childSessionIds: ['child-session'],
          collaborationToolCalls: 1,
        },
        executorCheckpoint: {
          claimed: 'achieved',
          summary: 'Completed the candidate task and proportional verification.',
          verificationCommands: ['pnpm test'],
          reviewIntent: 'local_result',
          reviewState: 'pending',
          reviewUnit: 'candidate SHA',
        },
        executorPrincipalId: 'executor-principal',
        hardInvariantMisses: [],
      },
      oracle: {
        candidateSha: '5'.repeat(40),
        passed: false,
        checks: [{ id: 'behavior', passed: false }],
      },
      judge: {
        candidateSha: '5'.repeat(40),
        judgeSessionId: 'judge-session',
        judgePrincipalId: 'judge-principal',
        judgeRoleKey: 'convergence:judge',
        verdict: 'review_boundary_compliant',
        reviewDemand: 'not_required',
        observedReviewState: 'pending',
        findings: [],
      },
    },
    finalAdjudication: {
      taskCorrectnessPassed: false,
      hardBoundariesPassed: true,
      singleCandidateExecutionPassed: true,
      candidateFrozenBeforeMeasurement: true,
      postHocFeedbackAbsent: true,
      repairRounds: 0,
      reviewBoundaryPassed: true,
      outcomeCheckpointOracleConsistent: false,
      structuralMeasurementValid: true,
      calibrationCoverage: 'review_boundary_only',
      overallSopCalibrationComplete: false,
    },
  };
  const receipt = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
    status: 'diagnostic_complete',
    zeroModelProvider: false,
    runnerCommit: scope.runnerCommit,
    environmentSha256: scope.environmentSha256,
    manifestSha256: scope.manifestSha256,
    modelId: scope.modelId,
    canaryId: scope.canaryId,
    taskId: scope.taskId,
    armId: scope.armId,
    behaviorIds,
    reviewBoundaryRubricSha256: scope.reviewBoundaryRubricSha256,
    reviewBoundaryCalibrationCertificateSha256: scope.reviewBoundaryCalibrationCertificateSha256,
    calibrationCoverage: 'review_boundary_only',
    overallSopCalibrationComplete: false,
    canaryScopeSha256,
    canaryPlanSha256,
    tokenPolicy: 'unbounded',
    nonScoring: true,
    effectClaimEligible: false,
    completedAt: '2026-08-07T07:04:00.000Z',
    result,
    usage: [
      {
        role: 'executor',
        sessionId: 'executor-session',
        accountedSessionIds: ['executor-session', 'child-session'],
        inputTokens: 10,
        cachedInputTokens: 1,
        outputTokens: 2,
        toolCalls: 3,
        failedToolCalls: 0,
        usageObserved: true,
      },
      {
        role: 'judge',
        sessionId: 'judge-session',
        accountedSessionIds: ['judge-session'],
        inputTokens: 4,
        cachedInputTokens: 0,
        outputTokens: 1,
        toolCalls: 1,
        failedToolCalls: 0,
        usageObserved: true,
      },
    ],
    timing: { candidateElapsedMs: 10, adjudicationElapsedMs: 20, totalMeasuredElapsedMs: 30 },
  };
  return { behaviorIds, scope, plan, canaryPlanSha256, result, receipt };
}

const authority = {
  operatorUserId: 'default-user',
  threadId: 'thread',
  messageStoreIdentitySha256: 'a'.repeat(64),
  runtimeInstanceIdentitySha256: 'b'.repeat(64),
};

async function advanceToRunning(store, plan, canaryPlanSha256) {
  await store.authorize({ plan, authority, authorizedAt: '2026-08-07T07:01:00.000Z' });
  const reserved = await store.reserve(canaryPlanSha256, '2026-08-07T07:02:00.000Z');
  assert.deepEqual(reserved.reservation.roles, [
    { role: 'executor', executions: 1, tokenPolicy: 'unbounded' },
    { role: 'judge', postHoc: true, feedbackToCandidate: false, tokenPolicy: 'unbounded' },
  ]);
  await store.start(canaryPlanSha256, '2026-08-07T07:03:00.000Z');
}

function historicalV5Record(current) {
  const scope = structuredClone(current.scope);
  scope.schemaVersion = 'lf-0001.development-convergence-canary-scope.v5';
  delete scope.reviewBoundaryRubricSha256;
  delete scope.reviewBoundaryRubric;
  delete scope.reviewBoundaryGoldSuiteSha256;
  delete scope.reviewBoundaryGoldSuite;
  delete scope.reviewBoundaryCalibrationCertificateSha256;
  delete scope.reviewBoundaryCalibrationCertificate;
  delete scope.calibrationCoverage;
  delete scope.overallSopCalibrationComplete;
  scope.roles[1].filesystemAccess = 'write';
  scope.maximumRepairRounds = 1;
  scope.roundWallTimeMsCap = scope.candidateWallTimeMsCap;
  delete scope.candidateWallTimeMsCap;
  scope.wallTimeMsCap = (scope.roundWallTimeMsCap + scope.adjudicationWallTimeMsCap) * 2;
  scope.roles = [
    {
      role: 'executor',
      filesystemAccess: 'write',
      rounds: [1, 2],
      sameRoleAcrossRounds: true,
      tokenPolicy: 'unbounded',
    },
    {
      role: 'reviewer',
      filesystemAccess: 'write',
      rounds: [1, 2],
      freshIdentityPerRound: true,
      tokenPolicy: 'unbounded',
    },
  ];
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  const plan = {
    ...structuredClone(current.plan),
    canaryScopeSha256,
    scope,
    authorization: {
      ...current.plan.authorization,
      approvalRef: 'cat-cafe://message/historical-v5',
      approvedConvergenceCanaryScopeSha256: canaryScopeSha256,
    },
  };
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  const candidate = structuredClone(current.result.episode.candidate);
  const result = {
    schemaVersion: 'lf-0001.development-convergence-canary-result.v1',
    status: 'failed',
    nonScoring: true,
    effectClaimEligible: false,
    firstPass: { role: 'diagnostic_only', converged: false },
    rounds: [
      {
        candidate,
        oracle: structuredClone(current.result.episode.oracle),
        review: {
          candidateSha: candidate.candidateSha,
          reviewerSessionId: 'historical-reviewer-session',
          reviewerPrincipalId: 'historical-reviewer-principal',
          reviewerRoleKey: 'historical-reviewer-role',
          state: 'approved',
          findings: [],
        },
        converged: false,
      },
    ],
    finalAdjudication: {
      round: 1,
      behaviorOraclePassed: false,
      independentReviewApproved: true,
      hardInvariantsPassed: true,
    },
  };
  const completedAt = '2026-08-07T07:04:00.000Z';
  const receipt = {
    ...structuredClone(current.receipt),
    schemaVersion: 'lf-0001.development-convergence-canary-receipt.v1',
    status: 'failed',
    canaryScopeSha256,
    canaryPlanSha256,
    completedAt,
    result,
    usage: [
      { ...current.receipt.usage[0], round: 1 },
      {
        ...current.receipt.usage[1],
        round: 1,
        role: 'reviewer',
        sessionId: 'historical-reviewer-session',
      },
    ],
  };
  for (const usage of receipt.usage) delete usage.accountedSessionIds;
  delete receipt.reviewBoundaryRubricSha256;
  delete receipt.reviewBoundaryCalibrationCertificateSha256;
  delete receipt.calibrationCoverage;
  delete receipt.overallSopCalibrationComplete;
  delete receipt.timing;
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION,
    state: 'completed',
    canaryPlanSha256,
    plan,
    authority,
    authorizedAt: '2026-08-07T07:01:00.000Z',
    reservation: {
      reservedAt: '2026-08-07T07:02:00.000Z',
      tokenPolicy: 'unbounded',
      roles: [
        { role: 'executor', rounds: [1, 2], tokenPolicy: 'unbounded' },
        { role: 'reviewer', rounds: [1, 2], tokenPolicy: 'unbounded' },
      ],
    },
    startedAt: '2026-08-07T07:03:00.000Z',
    completedAt,
    receipt,
    receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
    receiptArtifactSha256: 'e'.repeat(64),
  };
}

function preRubricV6Record(current) {
  const scope = structuredClone(current.scope);
  scope.schemaVersion = 'lf-0001.development-convergence-canary-scope.v6';
  delete scope.reviewBoundaryRubricSha256;
  delete scope.reviewBoundaryRubric;
  delete scope.reviewBoundaryGoldSuiteSha256;
  delete scope.reviewBoundaryGoldSuite;
  delete scope.reviewBoundaryCalibrationCertificateSha256;
  delete scope.reviewBoundaryCalibrationCertificate;
  delete scope.calibrationCoverage;
  delete scope.overallSopCalibrationComplete;
  scope.roles[1].filesystemAccess = 'write';
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  const plan = {
    ...structuredClone(current.plan),
    canaryScopeSha256,
    scope,
    authorization: {
      ...current.plan.authorization,
      approvalRef: 'cat-cafe://message/pre-rubric-v6',
      approvedConvergenceCanaryScopeSha256: canaryScopeSha256,
    },
  };
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  const completedAt = '2026-08-07T07:04:00.000Z';
  const receipt = {
    ...structuredClone(current.receipt),
    schemaVersion: 'lf-0001.development-convergence-canary-receipt.v2',
    canaryScopeSha256,
    canaryPlanSha256,
    completedAt,
  };
  receipt.result.schemaVersion = 'lf-0001.development-convergence-canary-result.v2';
  receipt.status = 'failed';
  receipt.result.status = 'failed';
  receipt.result.episode.externallyVerified = false;
  receipt.result.episode.judge.verdict = 'sop_compliant';
  receipt.result.finalAdjudication = {
    behaviorOraclePassed: false,
    sopJudgePassed: true,
    hardInvariantsPassed: true,
  };
  delete receipt.reviewBoundaryRubricSha256;
  delete receipt.reviewBoundaryCalibrationCertificateSha256;
  delete receipt.calibrationCoverage;
  delete receipt.overallSopCalibrationComplete;
  delete receipt.timing;
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION,
    state: 'completed',
    canaryPlanSha256,
    plan,
    authority,
    authorizedAt: '2026-08-07T07:01:00.000Z',
    reservation: {
      reservedAt: '2026-08-07T07:02:00.000Z',
      tokenPolicy: 'unbounded',
      roles: [
        { role: 'executor', executions: 1, tokenPolicy: 'unbounded' },
        { role: 'judge', postHoc: true, feedbackToCandidate: false, tokenPolicy: 'unbounded' },
      ],
    },
    startedAt: '2026-08-07T07:03:00.000Z',
    completedAt,
    receipt,
    receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
    receiptArtifactSha256: 'd'.repeat(64),
  };
}

describe('Adaptive Development convergence canary execution store', () => {
  it('persists the diagnostic vector without projecting Y when the Judge passes but the sealed Oracle fails', async () => {
    const { behaviorIds, plan, canaryPlanSha256, result, receipt } = fixture();
    const evaluation = deriveAdaptiveDevelopmentConvergenceCandidateEvaluation(result, behaviorIds);
    assert.equal(evaluation.reviewBoundaryPassed, true);
    assert.equal(evaluation.taskCorrectnessPassed, false);
    assert.equal('conjunctiveCanaryPassed' in evaluation, false);
    assert.equal('y' in evaluation, false);

    const redis = new FakeRedis();
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(redis);
    await advanceToRunning(store, plan, canaryPlanSha256);
    const completed = await store.complete(canaryPlanSha256, {
      completedAt: receipt.completedAt,
      receipt,
      receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
      receiptArtifactSha256: 'f'.repeat(64),
    });
    assert.equal(completed.state, 'completed');
    assert.deepEqual(await store.get(canaryPlanSha256), completed);
  });

  it('executes exactly once even when both post-hoc measurements fail', async () => {
    let executions = 0;
    const result = await runAdaptiveDevelopmentConvergenceCanary({
      execute: async () => {
        executions += 1;
        return fixture().result.episode.candidate;
      },
      evaluate: async () => fixture().result.episode.oracle,
      judge: async (candidate) => ({
        ...fixture().result.episode.judge,
        candidateSha: candidate.candidateSha,
        verdict: 'review_boundary_noncompliant',
        reviewDemand: 'required',
      }),
    });
    assert.equal(executions, 1);
    assert.equal(result.status, 'diagnostic_complete');
    assert.equal('rounds' in result, false);
  });

  it('atomically consumes one exact approval', async () => {
    const { plan } = fixture();
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(new FakeRedis());
    await store.authorize({ plan, authority, authorizedAt: '2026-08-07T07:01:00.000Z' });
    await assert.rejects(
      store.authorize({ plan, authority, authorizedAt: '2026-08-07T07:01:01.000Z' }),
      /already been consumed/,
    );
  });

  it('rejects evidence-free current Judge findings and recomputed contradictory receipts', async () => {
    for (const mutate of [
      (receipt) => {
        receipt.result.episode.judge.findings = [{ severity: 'P2', summary: 'missing evidence' }];
        receipt.result.episode.judge.verdict = 'review_boundary_noncompliant';
        receipt.result.finalAdjudication.reviewBoundaryPassed = false;
      },
      (receipt) => {
        receipt.result.episode.oracle.passed = true;
      },
      (receipt) => {
        receipt.usage[1].sessionId = receipt.usage[0].sessionId;
      },
    ]) {
      const { plan, canaryPlanSha256, receipt: original } = fixture();
      const receipt = structuredClone(original);
      mutate(receipt);
      const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(new FakeRedis());
      await advanceToRunning(store, plan, canaryPlanSha256);
      await assert.rejects(
        store.complete(canaryPlanSha256, {
          completedAt: receipt.completedAt,
          receipt,
          receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
          receiptArtifactSha256: 'f'.repeat(64),
        }),
      );
    }
  });

  it('reads a consumed v5 ledger but refuses to authorize it as current execution', async () => {
    const current = fixture();
    const historical = historicalV5Record(current);
    const redis = new FakeRedis();
    redis.values.set(
      adaptiveDevelopmentConvergenceCanaryExecutionKey(historical.canaryPlanSha256),
      JSON.stringify(historical),
    );
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(redis);
    assert.deepEqual(await store.get(historical.canaryPlanSha256), historical);
    await assert.rejects(
      store.authorize({
        plan: historical.plan,
        authority,
        authorizedAt: '2026-08-07T07:05:00.000Z',
      }),
      /current rubric-calibrated scope/,
    );
  });

  it('reads the consumed v6 natural-Agent ledger without treating it as rubric-calibrated', async () => {
    const historical = preRubricV6Record(fixture());
    const redis = new FakeRedis();
    redis.values.set(
      adaptiveDevelopmentConvergenceCanaryExecutionKey(historical.canaryPlanSha256),
      JSON.stringify(historical),
    );
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(redis);
    assert.deepEqual(await store.get(historical.canaryPlanSha256), historical);
    await assert.rejects(
      store.authorize({
        plan: historical.plan,
        authority,
        authorizedAt: '2026-08-07T07:05:00.000Z',
      }),
      /current rubric-calibrated scope/,
    );
  });

  it('rejects a current authorization with a forged embedded calibration', async () => {
    const { plan } = fixture();
    const forged = structuredClone(plan);
    forged.scope.calibrationCertificate.calibration.baseline.passed = true;
    forged.scope.calibrationCertificateSha256 = fingerprintAdaptiveDevelopmentBenchmark(
      forged.scope.calibrationCertificate,
    );
    forged.canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(forged.scope);
    forged.authorization.approvedConvergenceCanaryScopeSha256 = forged.canaryScopeSha256;
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(new FakeRedis());
    await assert.rejects(
      store.authorize({ plan: forged, authority, authorizedAt: '2026-08-07T07:01:00.000Z' }),
      /calibration certificate/,
    );
  });
});
