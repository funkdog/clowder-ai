import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
  assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt,
  assertAdaptiveDevelopmentConvergenceCanaryPreRubricReceipt,
  assertAdaptiveDevelopmentConvergenceCanaryReceipt,
  buildAdaptiveDevelopmentConvergenceCanaryDirective,
  buildAdaptiveDevelopmentConvergenceCanaryScope,
  buildAdaptiveDevelopmentOracleCalibrationCertificate,
  deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs,
  deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs,
  parseAdaptiveDevelopmentConvergenceCanaryPlan,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js';
import { adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture } from './helpers/adaptive-development-convergence-review-boundary-fixture.js';

const authority = {
  operatorUserId: 'default-user',
  threadId: 'thread_mrsvt7x42vkz9ua5',
  messageStoreIdentitySha256: 'a'.repeat(64),
  runtimeInstanceIdentitySha256: 'b'.repeat(64),
};

function scope() {
  const behaviorIds = ['runtime-root-and-descendant-remap'];
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
        {
          id: 'break-remap',
          targetBehaviorIds: behaviorIds,
          oracle: oracle('9'.repeat(40), false),
        },
      ],
    },
  });
  const judge = adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    modelId: 'gpt-5.6-sol',
  });
  return buildAdaptiveDevelopmentConvergenceCanaryScope({
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
}

describe('Adaptive Development provider-backed convergence canary', () => {
  it('binds one candidate episode and post-hoc measurement into one exact scope', () => {
    const value = scope();
    assert.deepEqual(value, {
      schemaVersion: 'lf-0001.development-convergence-canary-scope.v7',
      runnerCommit: '1'.repeat(40),
      environmentSha256: '2'.repeat(64),
      manifestSha256: '3'.repeat(64),
      canaryId: 'real-agent-sop-outcome-v3',
      taskId: 'long-disposable-checkout-writes',
      armId: 'treatment_new_sop',
      modelId: 'gpt-5.6-sol',
      behaviorIds: ['runtime-root-and-descendant-remap'],
      calibrationCertificateSha256: value.calibrationCertificateSha256,
      calibrationCertificate: value.calibrationCertificate,
      reviewBoundaryRubricSha256: value.reviewBoundaryRubricSha256,
      reviewBoundaryRubric: value.reviewBoundaryRubric,
      reviewBoundaryGoldSuiteSha256: value.reviewBoundaryGoldSuiteSha256,
      reviewBoundaryGoldSuite: value.reviewBoundaryGoldSuite,
      reviewBoundaryCalibrationCertificateSha256: value.reviewBoundaryCalibrationCertificateSha256,
      reviewBoundaryCalibrationCertificate: value.reviewBoundaryCalibrationCertificate,
      calibrationCoverage: 'review_boundary_only',
      overallSopCalibrationComplete: false,
      maximumRepairRounds: 0,
      maximumInfrastructureRetryAttempts: 0,
      candidateWallTimeMsCap: 2_700_000,
      adjudicationWallTimeMsCap: 2_700_000,
      wallTimeMsCap: 5_400_000,
      tokenPolicy: 'unbounded',
      nonScoring: true,
      effectClaimEligible: false,
      roles: [
        {
          role: 'executor',
          filesystemAccess: 'write',
          executions: 1,
          tokenPolicy: 'unbounded',
        },
        {
          role: 'judge',
          filesystemAccess: 'read',
          postHoc: true,
          feedbackToCandidate: false,
          tokenPolicy: 'unbounded',
        },
      ],
    });
  });

  it('gives candidate execution and post-hoc adjudication independent bounded windows', () => {
    const lifecycleStartedAtEpochMs = 1_000_000;
    assert.equal(
      deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        candidateStartedAtEpochMs: lifecycleStartedAtEpochMs,
        candidateWallTimeMsCap: 2_700_000,
        wallTimeMsCap: 5_400_000,
      }),
      3_700_000,
    );
    assert.equal(
      deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        candidateStartedAtEpochMs: 4_000_000,
        candidateWallTimeMsCap: 2_700_000,
        wallTimeMsCap: 5_400_000,
      }),
      6_400_000,
    );
    assert.equal(
      deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        adjudicationStartedAtEpochMs: 6_500_000,
        adjudicationWallTimeMsCap: 2_700_000,
        wallTimeMsCap: 5_400_000,
      }),
      6_400_000,
    );
    assert.equal(
      deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        adjudicationStartedAtEpochMs: 11_000_000,
        adjudicationWallTimeMsCap: 2_700_000,
        wallTimeMsCap: 5_400_000,
      }),
      6_400_000,
    );
  });

  it('requires a durable exact-scope approval plan and rejects scope drift', () => {
    const exactScope = scope();
    const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(exactScope);
    assert.equal(
      buildAdaptiveDevelopmentConvergenceCanaryDirective(exactScope, authority),
      `APPROVE_ADAPTIVE_CONVERGENCE_CANARY scope_sha256=${scopeSha256} operator_user_id=default-user thread_id=thread_mrsvt7x42vkz9ua5 message_store_identity_sha256=${'a'.repeat(64)} runtime_instance_identity_sha256=${'b'.repeat(64)} calibration_certificate_sha256=${exactScope.calibrationCertificateSha256} review_boundary_rubric_sha256=${exactScope.reviewBoundaryRubricSha256} review_boundary_gold_suite_sha256=${exactScope.reviewBoundaryGoldSuiteSha256} review_boundary_calibration_certificate_sha256=${exactScope.reviewBoundaryCalibrationCertificateSha256} token_policy=unbounded maximum_repair_rounds=0 maximum_infrastructure_retry_attempts=0 candidate_wall_time_ms_cap=2700000 adjudication_wall_time_ms_cap=2700000 lifecycle_wall_time_ms_cap=5400000`,
    );
    const plan = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
      canaryScopeSha256: scopeSha256,
      scope: exactScope,
      authorization: {
        kind: 'operator_approval',
        approvalRef: 'cat-cafe://message/message-real',
        approvalMessageSha256: '4'.repeat(64),
        approvedConvergenceCanaryScopeSha256: scopeSha256,
        approvedAt: '2026-08-07T07:00:00.000Z',
      },
    };
    assert.deepEqual(parseAdaptiveDevelopmentConvergenceCanaryPlan(plan), plan);
    assert.throws(
      () =>
        parseAdaptiveDevelopmentConvergenceCanaryPlan({
          ...plan,
          scope: { ...exactScope, taskId: 'another-task' },
        }),
      /exact approved scope|calibration certificate does not match/,
    );
    const inconsistentScope = { ...exactScope, wallTimeMsCap: 5_399_999 };
    const inconsistentScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(inconsistentScope);
    assert.throws(
      () =>
        parseAdaptiveDevelopmentConvergenceCanaryPlan({
          ...plan,
          canaryScopeSha256: inconsistentScopeSha256,
          scope: inconsistentScope,
          authorization: {
            ...plan.authorization,
            approvedConvergenceCanaryScopeSha256: inconsistentScopeSha256,
          },
        }),
      /fixed non-scoring execution policy/,
    );
  });

  it('keeps consumed v1 through v6 plans readable without treating them as current scope output', () => {
    const currentScope = scope();
    const historical = (version) => {
      const value = structuredClone(currentScope);
      value.schemaVersion = `lf-0001.development-convergence-canary-scope.v${version}`;
      delete value.reviewBoundaryRubricSha256;
      delete value.reviewBoundaryRubric;
      delete value.reviewBoundaryGoldSuiteSha256;
      delete value.reviewBoundaryGoldSuite;
      delete value.reviewBoundaryCalibrationCertificateSha256;
      delete value.reviewBoundaryCalibrationCertificate;
      delete value.calibrationCoverage;
      delete value.overallSopCalibrationComplete;
      if (version === 6) {
        value.roles[1].filesystemAccess = 'write';
        return value;
      }
      value.maximumRepairRounds = 1;
      value.roundWallTimeMsCap = value.candidateWallTimeMsCap;
      delete value.candidateWallTimeMsCap;
      value.roles = [
        {
          role: 'executor',
          filesystemAccess: 'write',
          rounds: [1, 2],
          sameRoleAcrossRounds: true,
          tokenPolicy: 'unbounded',
        },
        {
          role: 'reviewer',
          filesystemAccess: version >= 4 ? 'write' : 'read',
          rounds: [1, 2],
          freshIdentityPerRound: true,
          tokenPolicy: 'unbounded',
        },
      ];
      if (version < 5) {
        delete value.adjudicationWallTimeMsCap;
        value.wallTimeMsCap = value.roundWallTimeMsCap * 2;
      } else value.wallTimeMsCap = (value.roundWallTimeMsCap + value.adjudicationWallTimeMsCap) * 2;
      if (version < 3) {
        delete value.calibrationCertificateSha256;
        delete value.calibrationCertificate;
      }
      if (version === 1) {
        value.wallTimeMsCap = value.roundWallTimeMsCap;
        delete value.roundWallTimeMsCap;
      }
      return value;
    };
    for (const version of [1, 2, 3, 4, 5, 6]) {
      const historicalScope = historical(version);
      const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(historicalScope);
      const plan = {
        schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
        canaryScopeSha256,
        scope: historicalScope,
        authorization: {
          kind: 'operator_approval',
          approvalRef: `cat-cafe://message/spent-v${version}`,
          approvalMessageSha256: String(version).repeat(64),
          approvedConvergenceCanaryScopeSha256: canaryScopeSha256,
          approvedAt: '2026-08-11T05:00:00.000Z',
        },
      };
      assert.deepEqual(parseAdaptiveDevelopmentConvergenceCanaryPlan(plan), plan);
    }
  });

  it('accepts only a non-scoring exact-bound terminal result receipt', () => {
    const exactScope = scope();
    const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(exactScope);
    const plan = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION,
      canaryScopeSha256,
      scope: exactScope,
      authorization: {
        kind: 'operator_approval',
        approvalRef: 'cat-cafe://message/message-real',
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
          executorRoleKey: 'canary:executor',
          executorSessionId: 'executor-session-1',
          executorEpisode: {
            mode: 'natural_agent_graph',
            rootSessionId: 'executor-session-1',
            childSessionIds: [],
            collaborationToolCalls: 0,
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
          passed: true,
          checks: [{ id: 'runtime-root-and-descendant-remap', passed: true }],
        },
        judge: {
          candidateSha: '5'.repeat(40),
          judgeSessionId: 'judge-session-1',
          judgePrincipalId: 'judge-principal-1',
          judgeRoleKey: 'canary:judge',
          verdict: 'review_boundary_compliant',
          reviewDemand: 'not_required',
          observedReviewState: 'pending',
          findings: [],
        },
      },
      finalAdjudication: {
        taskCorrectnessPassed: true,
        hardBoundariesPassed: true,
        singleCandidateExecutionPassed: true,
        candidateFrozenBeforeMeasurement: true,
        postHocFeedbackAbsent: true,
        repairRounds: 0,
        reviewBoundaryPassed: true,
        outcomeCheckpointOracleConsistent: true,
        structuralMeasurementValid: true,
        calibrationCoverage: 'review_boundary_only',
        overallSopCalibrationComplete: false,
      },
    };
    const receipt = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
      status: 'diagnostic_complete',
      zeroModelProvider: false,
      runnerCommit: exactScope.runnerCommit,
      environmentSha256: exactScope.environmentSha256,
      manifestSha256: exactScope.manifestSha256,
      modelId: exactScope.modelId,
      canaryId: exactScope.canaryId,
      taskId: exactScope.taskId,
      armId: exactScope.armId,
      behaviorIds: exactScope.behaviorIds,
      reviewBoundaryRubricSha256: exactScope.reviewBoundaryRubricSha256,
      reviewBoundaryCalibrationCertificateSha256: exactScope.reviewBoundaryCalibrationCertificateSha256,
      calibrationCoverage: 'review_boundary_only',
      overallSopCalibrationComplete: false,
      canaryScopeSha256,
      canaryPlanSha256,
      tokenPolicy: 'unbounded',
      nonScoring: true,
      effectClaimEligible: false,
      completedAt: '2026-08-07T07:10:00.000Z',
      result,
      usage: [
        {
          role: 'executor',
          sessionId: 'executor-session-1',
          accountedSessionIds: ['executor-session-1'],
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 20,
          toolCalls: 2,
          failedToolCalls: 0,
          usageObserved: true,
        },
        {
          role: 'judge',
          sessionId: 'judge-session-1',
          accountedSessionIds: ['judge-session-1'],
          inputTokens: 50,
          cachedInputTokens: 5,
          outputTokens: 10,
          toolCalls: 1,
          failedToolCalls: 0,
          usageObserved: true,
        },
      ],
      timing: { candidateElapsedMs: 100, adjudicationElapsedMs: 200, totalMeasuredElapsedMs: 300 },
    };
    assert.doesNotThrow(() => assertAdaptiveDevelopmentConvergenceCanaryReceipt(receipt));
    assert.doesNotThrow(() => assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(receipt));
    const overstatedCoverage = structuredClone(receipt);
    overstatedCoverage.overallSopCalibrationComplete = true;
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceCanaryReceipt(overstatedCoverage),
      /overstates its Review-boundary-only calibration coverage/,
    );
    const invalidTiming = structuredClone(receipt);
    invalidTiming.timing.totalMeasuredElapsedMs += 1;
    assert.throws(() => assertAdaptiveDevelopmentConvergenceCanaryReceipt(invalidTiming), /receipt timing is invalid/);
    const preRubricReceipt = structuredClone(receipt);
    preRubricReceipt.schemaVersion = 'lf-0001.development-convergence-canary-receipt.v2';
    preRubricReceipt.status = 'passed';
    preRubricReceipt.result.schemaVersion = 'lf-0001.development-convergence-canary-result.v2';
    preRubricReceipt.result.status = 'passed';
    preRubricReceipt.result.episode.externallyVerified = true;
    preRubricReceipt.result.episode.judge.verdict = 'sop_compliant';
    preRubricReceipt.result.finalAdjudication = {
      behaviorOraclePassed: true,
      sopJudgePassed: true,
      hardInvariantsPassed: true,
    };
    delete preRubricReceipt.reviewBoundaryRubricSha256;
    delete preRubricReceipt.reviewBoundaryCalibrationCertificateSha256;
    delete preRubricReceipt.calibrationCoverage;
    delete preRubricReceipt.overallSopCalibrationComplete;
    delete preRubricReceipt.timing;
    assert.doesNotThrow(() => assertAdaptiveDevelopmentConvergenceCanaryPreRubricReceipt(preRubricReceipt));
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(preRubricReceipt),
      /convergence canary receipt/,
    );
    const missingAgentEpisode = structuredClone(receipt);
    delete missingAgentEpisode.result.episode.candidate.executorEpisode;
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(missingAgentEpisode),
      /must bind its natural agent episode/,
    );
    const missingCheckpoint = structuredClone(receipt);
    delete missingCheckpoint.result.episode.candidate.executorCheckpoint;
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(missingCheckpoint),
      /must bind its frozen Outcome Checkpoint/,
    );
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceCanaryReceipt({ ...receipt, effectClaimEligible: true }),
      /non-scoring real-provider result/,
    );
  });
});
