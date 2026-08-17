import { fingerprintAdaptiveDevelopmentBenchmark } from './adaptive-development-benchmark-contract.js';
import {
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  type AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  type AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric,
} from './adaptive-development-convergence-review-boundary.js';

const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_RESULT_VERSION =
  'lf-0001.development-convergence-canary-result.v1' as const;
const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_REVIEW_BOUNDARY_RESULT_VERSION =
  'lf-0001.development-convergence-canary-result.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RESULT_VERSION =
  'lf-0001.development-convergence-canary-result.v4' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANDIDATE_EVALUATION_VERSION =
  'lf-0001.development-convergence-candidate-evaluation.v4' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v1' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_DEADLINE_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_CALIBRATION_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v3' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_REVIEW_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v4' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_FEEDBACK_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v5' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v6' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION =
  'lf-0001.development-convergence-canary-scope.v7' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION =
  'lf-0001.development-convergence-canary-plan.v1' as const;
const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_RECEIPT_VERSION =
  'lf-0001.development-convergence-canary-receipt.v1' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_RECEIPT_VERSION =
  'lf-0001.development-convergence-canary-receipt.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION =
  'lf-0001.development-convergence-canary-receipt.v4' as const;
export const ADAPTIVE_DEVELOPMENT_ORACLE_CALIBRATION_CERTIFICATE_VERSION =
  'lf-0001.development-oracle-calibration-certificate.v1' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY = 'unbounded' as const;

export type AdaptiveDevelopmentConvergenceRound = 1 | 2;

export type AdaptiveDevelopmentConvergenceFindingEvidence =
  | {
      readonly kind: 'test_failure';
      readonly command: string;
      readonly expected: string;
      readonly actual: string;
      readonly location: '';
      readonly reasoning: '';
    }
  | {
      readonly kind: 'static_proof';
      readonly command: '';
      readonly expected: '';
      readonly actual: '';
      readonly location: string;
      readonly reasoning: string;
    };

export interface AdaptiveDevelopmentConvergenceFinding {
  readonly severity: 'P1' | 'P2' | 'P3';
  readonly summary: string;
  readonly evidence: AdaptiveDevelopmentConvergenceFindingEvidence;
}

export interface AdaptiveDevelopmentConvergenceCandidate {
  readonly round: AdaptiveDevelopmentConvergenceRound;
  readonly candidateSha: string;
  readonly candidatePatchSha256?: string;
  readonly candidateDiffRef?: string;
  readonly executorRoleKey: string;
  readonly executorSessionId: string;
  readonly executorEpisode?: {
    readonly mode: 'natural_agent_graph';
    readonly rootSessionId: string;
    readonly childSessionIds: readonly string[];
    readonly collaborationToolCalls: number;
  };
  readonly executorCheckpoint?: {
    readonly claimed: 'achieved' | 'not_achieved' | 'deferred';
    readonly summary: string;
    readonly verificationCommands: readonly string[];
    readonly reviewIntent: 'local_result' | 'formal_review' | 'delivery';
    readonly reviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale';
    readonly reviewUnit: string;
  };
  readonly independentReview?: {
    readonly source: 'authenticated_runtime_observer';
    readonly request: {
      readonly eventId: string;
      readonly authorSessionId: string;
      readonly candidateSha: string;
      readonly candidateDiffRef: string;
      readonly candidatePatchSha256: string;
    };
    readonly verdict: {
      readonly eventId: string;
      readonly requestEventId: string;
      readonly reviewerSessionId: string;
      readonly reviewerPrincipalId: string;
      readonly candidateSha: string;
      readonly candidateDiffRef: string;
      readonly candidatePatchSha256: string;
      readonly state: 'approved' | 'changes_requested';
      readonly findings: { readonly p1: number; readonly p2: number; readonly p3: number };
    };
  };
  readonly executorPrincipalId: string;
  readonly hardInvariantMisses: readonly string[];
}

export interface AdaptiveDevelopmentConvergenceOracleResult {
  readonly candidateSha: string;
  readonly passed: boolean;
  readonly checks: readonly { readonly id: string; readonly passed: boolean }[];
}

export interface AdaptiveDevelopmentConvergenceJudgeResult {
  readonly candidateSha: string;
  readonly judgeSessionId: string;
  readonly judgePrincipalId: string;
  readonly judgeRoleKey: string;
  readonly verdict: 'review_boundary_compliant' | 'review_boundary_noncompliant';
  readonly reviewDemand: 'required' | 'not_required' | 'indeterminate';
  readonly observedReviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale' | 'unknown';
  readonly findings: readonly AdaptiveDevelopmentConvergenceFinding[];
}

export interface AdaptiveDevelopmentConvergenceJudgeCommandTrace {
  readonly command: string;
  readonly exitCode: number;
  readonly output: string;
}

export function assertAdaptiveDevelopmentConvergenceJudgeEvidence(input: {
  readonly findings: readonly AdaptiveDevelopmentConvergenceFinding[];
  readonly completedCommands: readonly AdaptiveDevelopmentConvergenceJudgeCommandTrace[];
  readonly locationIsVisible: (location: string) => boolean;
}): void {
  for (const finding of input.findings) {
    const evidence = finding.evidence;
    if (evidence.kind === 'test_failure') {
      const execution = input.completedCommands.find(
        (command) => command.command === evidence.command && command.exitCode !== 0,
      );
      if (!execution || !execution.output.includes(evidence.actual)) {
        throw new Error('post-hoc Judge test failure is not reproduced by its exact tool trace');
      }
      continue;
    }
    if (!input.locationIsVisible(evidence.location)) {
      throw new Error('post-hoc Judge static proof does not bind visible candidate or runner-provided evidence');
    }
  }
}

export interface AdaptiveDevelopmentConvergenceEpisodeResult {
  readonly candidate: AdaptiveDevelopmentConvergenceCandidate;
  readonly oracle: AdaptiveDevelopmentConvergenceOracleResult;
  readonly judge: AdaptiveDevelopmentConvergenceJudgeResult;
}

export interface AdaptiveDevelopmentConvergenceCanaryResult {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RESULT_VERSION;
  readonly status: 'diagnostic_complete';
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly episode: AdaptiveDevelopmentConvergenceEpisodeResult;
  readonly finalAdjudication: {
    readonly taskCorrectnessPassed: boolean;
    readonly hardBoundariesPassed: boolean;
    readonly singleCandidateExecutionPassed: true;
    readonly candidateFrozenBeforeMeasurement: true;
    readonly postHocFeedbackAbsent: true;
    readonly repairRounds: 0;
    readonly reviewBoundaryPassed: boolean;
    readonly outcomeCheckpointOracleConsistent: boolean;
    readonly structuralMeasurementValid: true;
    readonly calibrationCoverage: 'review_boundary_only';
    readonly overallSopCalibrationComplete: false;
  };
}

export interface AdaptiveDevelopmentConvergenceCandidateEvaluation {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANDIDATE_EVALUATION_VERSION;
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly validity: 'valid';
  readonly sourceResultSha256: string;
  readonly candidateSha: string;
  readonly executionStatus: 'completed';
  readonly behaviorVector: readonly { readonly id: string; readonly passed: boolean }[];
  readonly taskCorrectnessPassed: boolean;
  readonly hardBoundariesPassed: boolean;
  readonly singleCandidateExecutionPassed: true;
  readonly candidateFrozenBeforeMeasurement: true;
  readonly postHocFeedbackAbsent: true;
  readonly repairRounds: 0;
  readonly reviewBoundaryPassed: boolean;
  readonly reviewBoundaryP1Count: number;
  readonly reviewBoundaryP2Count: number;
  readonly outcomeCheckpointOracleConsistent: boolean;
  readonly structuralMeasurementValid: true;
  readonly calibrationCoverage: 'review_boundary_only';
  readonly overallSopCalibrationComplete: false;
}

export interface AdaptiveDevelopmentConvergenceCanaryScope {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly armId: string;
  readonly modelId: string;
  readonly behaviorIds: readonly string[];
  readonly calibrationCertificateSha256: string;
  readonly calibrationCertificate: AdaptiveDevelopmentOracleCalibrationCertificate;
  readonly reviewBoundaryRubricSha256: string;
  readonly reviewBoundaryRubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly reviewBoundaryGoldSuiteSha256: string;
  readonly reviewBoundaryGoldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
  readonly reviewBoundaryCalibrationCertificateSha256: string;
  readonly reviewBoundaryCalibrationCertificate: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate;
  readonly calibrationCoverage: 'review_boundary_only';
  readonly overallSopCalibrationComplete: false;
  readonly maximumRepairRounds: 0;
  readonly maximumInfrastructureRetryAttempts: 0;
  readonly candidateWallTimeMsCap: number;
  readonly adjudicationWallTimeMsCap: number;
  readonly wallTimeMsCap: number;
  readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly roles: readonly [
    {
      readonly role: 'executor';
      readonly filesystemAccess: 'write';
      readonly executions: 1;
      readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
    },
    {
      readonly role: 'judge';
      readonly filesystemAccess: 'read';
      readonly postHoc: true;
      readonly feedbackToCandidate: false;
      readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
    },
  ];
}

export interface AdaptiveDevelopmentConvergenceCanaryPreRubricScope {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly armId: string;
  readonly modelId: string;
  readonly behaviorIds: readonly string[];
  readonly calibrationCertificateSha256: string;
  readonly calibrationCertificate: AdaptiveDevelopmentOracleCalibrationCertificate;
  readonly maximumRepairRounds: 0;
  readonly maximumInfrastructureRetryAttempts: 0;
  readonly candidateWallTimeMsCap: number;
  readonly adjudicationWallTimeMsCap: number;
  readonly wallTimeMsCap: number;
  readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly roles: readonly [
    {
      readonly role: 'executor';
      readonly filesystemAccess: 'write';
      readonly executions: 1;
      readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
    },
    {
      readonly role: 'judge';
      readonly filesystemAccess: 'write';
      readonly postHoc: true;
      readonly feedbackToCandidate: false;
      readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
    },
  ];
}

export interface AdaptiveDevelopmentConvergenceCanaryHistoricalScope {
  readonly schemaVersion:
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_SCOPE_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_DEADLINE_SCOPE_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_CALIBRATION_SCOPE_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_REVIEW_SCOPE_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_FEEDBACK_SCOPE_VERSION;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly armId: string;
  readonly modelId: string;
  readonly behaviorIds: readonly string[];
  readonly maximumRepairRounds: 1;
  readonly maximumInfrastructureRetryAttempts: 0;
  readonly wallTimeMsCap: number;
  readonly roundWallTimeMsCap?: number;
  readonly adjudicationWallTimeMsCap?: number;
  readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly roles: readonly unknown[];
  readonly calibrationCertificateSha256?: string;
  readonly calibrationCertificate?: AdaptiveDevelopmentOracleCalibrationCertificate;
}

export type AdaptiveDevelopmentConvergenceCanaryPersistedScope =
  | AdaptiveDevelopmentConvergenceCanaryScope
  | AdaptiveDevelopmentConvergenceCanaryPreRubricScope
  | AdaptiveDevelopmentConvergenceCanaryHistoricalScope;

export interface AdaptiveDevelopmentConvergenceCanaryAuthorization {
  readonly kind: 'operator_approval';
  readonly approvalRef: string;
  readonly approvalMessageSha256: string;
  readonly approvedConvergenceCanaryScopeSha256: string;
  readonly approvedAt: string;
}

export interface AdaptiveDevelopmentConvergenceCanaryPlan {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION;
  readonly canaryScopeSha256: string;
  readonly scope: AdaptiveDevelopmentConvergenceCanaryPersistedScope;
  readonly authorization: AdaptiveDevelopmentConvergenceCanaryAuthorization;
}

export interface AdaptiveDevelopmentConvergenceCanaryUsage {
  readonly role: 'executor' | 'judge';
  readonly sessionId: string;
  readonly accountedSessionIds: readonly string[];
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  readonly usageObserved: true;
}

export interface AdaptiveDevelopmentConvergenceCanaryTiming {
  readonly candidateElapsedMs: number;
  readonly adjudicationElapsedMs: number;
  readonly totalMeasuredElapsedMs: number;
}

export interface AdaptiveDevelopmentConvergenceCanaryReceipt {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION;
  readonly status: 'diagnostic_complete';
  readonly zeroModelProvider: false;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly modelId: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly armId: string;
  readonly behaviorIds: readonly string[];
  readonly reviewBoundaryRubricSha256: string;
  readonly reviewBoundaryCalibrationCertificateSha256: string;
  readonly calibrationCoverage: 'review_boundary_only';
  readonly overallSopCalibrationComplete: false;
  readonly canaryScopeSha256: string;
  readonly canaryPlanSha256: string;
  readonly tokenPolicy: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY;
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly completedAt: string;
  readonly result: AdaptiveDevelopmentConvergenceCanaryResult;
  readonly usage: readonly AdaptiveDevelopmentConvergenceCanaryUsage[];
  readonly timing: AdaptiveDevelopmentConvergenceCanaryTiming;
}

interface AdaptiveDevelopmentConvergencePreReviewBoundaryJudgeResult extends Omit<
  AdaptiveDevelopmentConvergenceJudgeResult,
  'verdict'
> {
  readonly verdict: 'sop_compliant' | 'sop_noncompliant';
}

interface AdaptiveDevelopmentConvergencePreReviewBoundaryResult {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_REVIEW_BOUNDARY_RESULT_VERSION;
  readonly status: 'passed' | 'failed';
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly episode: Omit<AdaptiveDevelopmentConvergenceEpisodeResult, 'judge'> & {
    readonly judge: AdaptiveDevelopmentConvergencePreReviewBoundaryJudgeResult;
    readonly externallyVerified: boolean;
  };
  readonly finalAdjudication: {
    readonly behaviorOraclePassed: boolean;
    readonly sopJudgePassed: boolean;
    readonly hardInvariantsPassed: boolean;
  };
}

export type AdaptiveDevelopmentConvergenceCanaryPreRubricReceipt = Omit<
  AdaptiveDevelopmentConvergenceCanaryReceipt,
  | 'schemaVersion'
  | 'status'
  | 'reviewBoundaryRubricSha256'
  | 'reviewBoundaryCalibrationCertificateSha256'
  | 'calibrationCoverage'
  | 'overallSopCalibrationComplete'
  | 'result'
  | 'timing'
> & {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_RECEIPT_VERSION;
  readonly status: 'passed' | 'failed';
  readonly result: AdaptiveDevelopmentConvergencePreReviewBoundaryResult;
};

export interface AdaptiveDevelopmentConvergenceCanaryPorts {
  execute(): Promise<AdaptiveDevelopmentConvergenceCandidate>;
  evaluate(candidate: AdaptiveDevelopmentConvergenceCandidate): Promise<AdaptiveDevelopmentConvergenceOracleResult>;
  judge(candidate: AdaptiveDevelopmentConvergenceCandidate): Promise<AdaptiveDevelopmentConvergenceJudgeResult>;
}

export interface AdaptiveDevelopmentOracleSpecificityCalibration {
  readonly expectedBehaviorIds: readonly string[];
  readonly baseline: AdaptiveDevelopmentConvergenceOracleResult;
  readonly goldProjection: AdaptiveDevelopmentConvergenceOracleResult;
  readonly behaviorEquivalentAlternate: AdaptiveDevelopmentConvergenceOracleResult;
  readonly singleFaultMutations: readonly {
    readonly id: string;
    readonly targetBehaviorIds: readonly string[];
    readonly oracle: AdaptiveDevelopmentConvergenceOracleResult;
  }[];
}

export interface AdaptiveDevelopmentOracleSpecificityVerdict {
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface AdaptiveDevelopmentOracleCalibrationCertificate {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_ORACLE_CALIBRATION_CERTIFICATE_VERSION;
  readonly status: 'calibrated';
  readonly nonScoring: true;
  readonly effectClaimEligible: false;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly oracleToolchainSha256: string;
  readonly oracleSpecificitySha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly behaviorIds: readonly string[];
  readonly calibration: AdaptiveDevelopmentOracleSpecificityCalibration;
}

type AdaptiveDevelopmentOracleMutation =
  AdaptiveDevelopmentOracleSpecificityCalibration['singleFaultMutations'][number];

function assertExactCandidateBinding(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  oracle: AdaptiveDevelopmentConvergenceOracleResult,
  judge: Pick<
    AdaptiveDevelopmentConvergenceJudgeResult,
    'candidateSha' | 'judgeSessionId' | 'judgePrincipalId' | 'judgeRoleKey' | 'observedReviewState'
  >,
): void {
  if (oracle.candidateSha !== candidate.candidateSha || judge.candidateSha !== candidate.candidateSha) {
    throw new Error('convergence evidence is not bound to the exact candidate');
  }
  if (
    judge.judgeSessionId === candidate.executorSessionId ||
    judge.judgePrincipalId === candidate.executorPrincipalId ||
    judge.judgeRoleKey === candidate.executorRoleKey
  ) {
    throw new Error('post-hoc Judge must use an independent session, principal, and role');
  }
  if (candidate.executorCheckpoint && judge.observedReviewState !== candidate.executorCheckpoint.reviewState) {
    throw new Error('post-hoc Judge observed review state disagrees with the frozen candidate checkpoint');
  }
  if (oracle.passed !== oracle.checks.every((check) => check.passed)) {
    throw new Error('convergence oracle aggregate disagrees with its behavior checks');
  }
}

function reviewBoundaryPassed(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  judge: AdaptiveDevelopmentConvergenceJudgeResult,
): boolean {
  const checkpoint = candidate.executorCheckpoint;
  const review = candidate.independentReview;
  const conditionalReviewSatisfied =
    (judge.reviewDemand === 'required' &&
      ((checkpoint?.claimed !== 'achieved' && checkpoint?.reviewState === 'pending' && review === undefined) ||
        (checkpoint?.claimed === 'achieved' &&
          checkpoint.reviewState === 'reviewed' &&
          review?.verdict.state === 'approved' &&
          review.verdict.findings.p1 === 0 &&
          review.verdict.findings.p2 === 0))) ||
    (judge.reviewDemand === 'not_required' && checkpoint?.reviewState === 'pending' && review === undefined);
  return (
    judge.verdict === 'review_boundary_compliant' &&
    judge.observedReviewState === checkpoint?.reviewState &&
    conditionalReviewSatisfied &&
    judge.findings.every((finding) => finding.severity !== 'P1' && finding.severity !== 'P2')
  );
}

function preReviewBoundaryJudgePassed(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  judge: AdaptiveDevelopmentConvergencePreReviewBoundaryJudgeResult,
): boolean {
  const checkpoint = candidate.executorCheckpoint;
  const review = candidate.independentReview;
  const conditionalReviewSatisfied =
    (judge.reviewDemand === 'required' &&
      checkpoint?.reviewState === 'reviewed' &&
      review?.verdict.state === 'approved' &&
      review.verdict.findings.p1 === 0 &&
      review.verdict.findings.p2 === 0) ||
    (judge.reviewDemand === 'not_required' && checkpoint?.reviewState === 'pending');
  return (
    judge.verdict === 'sop_compliant' &&
    judge.observedReviewState === checkpoint?.reviewState &&
    conditionalReviewSatisfied &&
    judge.findings.every((finding) => finding.severity !== 'P1' && finding.severity !== 'P2')
  );
}

function outcomeCheckpointOracleConsistent(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  oracle: AdaptiveDevelopmentConvergenceOracleResult,
): boolean {
  const claim = candidate.executorCheckpoint?.claimed;
  return claim === 'achieved' ? oracle.passed : (claim === 'not_achieved' || claim === 'deferred') && !oracle.passed;
}

function convergenceFinalAdjudication(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  oracle: AdaptiveDevelopmentConvergenceOracleResult,
  judge: AdaptiveDevelopmentConvergenceJudgeResult,
): AdaptiveDevelopmentConvergenceCanaryResult['finalAdjudication'] {
  return {
    taskCorrectnessPassed: oracle.passed,
    hardBoundariesPassed: candidate.hardInvariantMisses.length === 0,
    singleCandidateExecutionPassed: true,
    candidateFrozenBeforeMeasurement: true,
    postHocFeedbackAbsent: true,
    repairRounds: 0,
    reviewBoundaryPassed: reviewBoundaryPassed(candidate, judge),
    outcomeCheckpointOracleConsistent: outcomeCheckpointOracleConsistent(candidate, oracle),
    structuralMeasurementValid: true,
    calibrationCoverage: 'review_boundary_only',
    overallSopCalibrationComplete: false,
  };
}

function buildEpisodeResult(
  candidate: AdaptiveDevelopmentConvergenceCandidate,
  oracle: AdaptiveDevelopmentConvergenceOracleResult,
  judge: AdaptiveDevelopmentConvergenceJudgeResult,
): AdaptiveDevelopmentConvergenceEpisodeResult {
  assertExactCandidateBinding(candidate, oracle, judge);
  return { candidate, oracle, judge };
}

export async function runAdaptiveDevelopmentConvergenceCanary(
  ports: AdaptiveDevelopmentConvergenceCanaryPorts,
): Promise<AdaptiveDevelopmentConvergenceCanaryResult> {
  const candidate = await ports.execute();
  if (!isConvergenceRecord(candidate)) throw new Error('candidate executor must return exactly one episode');
  assertConvergenceCandidate(candidate, 1);
  assertConvergenceCurrentCandidateEvidence(candidate);
  const [oracle, judge] = await Promise.all([ports.evaluate(candidate), ports.judge(candidate)]);
  if (!isConvergenceRecord(oracle) || !isConvergenceRecord(judge)) {
    throw new Error('post-hoc measurement must return exact-bound Oracle and Judge evidence');
  }
  assertConvergenceOracle(oracle);
  assertConvergenceJudge(judge);
  assertConvergenceJudgeEvidenceFields(judge);
  const episode = buildEpisodeResult(candidate, oracle, judge);
  const finalAdjudication = convergenceFinalAdjudication(candidate, oracle, judge);
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RESULT_VERSION,
    status: 'diagnostic_complete',
    nonScoring: true,
    effectClaimEligible: false,
    episode,
    finalAdjudication,
  };
}

export function deriveAdaptiveDevelopmentConvergenceCandidateEvaluation(
  result: AdaptiveDevelopmentConvergenceCanaryResult,
  expectedBehaviorIds: readonly string[],
): AdaptiveDevelopmentConvergenceCandidateEvaluation {
  assertAdaptiveDevelopmentConvergenceCanaryResult(result, expectedBehaviorIds);
  const { episode } = result;
  const executionStatus = 'completed' as const;
  const reviewBoundaryP1Count = episode.judge.findings.filter((finding) => finding.severity === 'P1').length;
  const reviewBoundaryP2Count = episode.judge.findings.filter((finding) => finding.severity === 'P2').length;
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANDIDATE_EVALUATION_VERSION,
    nonScoring: true,
    effectClaimEligible: false,
    validity: 'valid',
    sourceResultSha256: fingerprintAdaptiveDevelopmentBenchmark(result),
    candidateSha: episode.candidate.candidateSha,
    executionStatus,
    behaviorVector: episode.oracle.checks,
    taskCorrectnessPassed: result.finalAdjudication.taskCorrectnessPassed,
    hardBoundariesPassed: result.finalAdjudication.hardBoundariesPassed,
    singleCandidateExecutionPassed: true,
    candidateFrozenBeforeMeasurement: true,
    postHocFeedbackAbsent: true,
    repairRounds: 0,
    reviewBoundaryPassed: result.finalAdjudication.reviewBoundaryPassed,
    reviewBoundaryP1Count,
    reviewBoundaryP2Count,
    outcomeCheckpointOracleConsistent: result.finalAdjudication.outcomeCheckpointOracleConsistent,
    structuralMeasurementValid: true,
    calibrationCoverage: 'review_boundary_only',
    overallSopCalibrationComplete: false,
  };
}

function checkVector(oracle: AdaptiveDevelopmentConvergenceOracleResult): ReadonlyMap<string, boolean> {
  return new Map(oracle.checks.map((check) => [check.id, check.passed]));
}

function assertCompleteBehaviorVector(
  label: string,
  expectedBehaviorIds: readonly string[],
  oracle: AdaptiveDevelopmentConvergenceOracleResult,
  failures: string[],
): ReadonlyMap<string, boolean> {
  const vector = checkVector(oracle);
  const expected = new Set(expectedBehaviorIds);
  const missing = expectedBehaviorIds.filter((id) => !vector.has(id));
  const unexpected = [...vector.keys()].filter((id) => !expected.has(id));
  if (missing.length > 0) failures.push(`${label} is missing behaviors: ${missing.join(', ')}`);
  if (unexpected.length > 0) failures.push(`${label} has unexpected behaviors: ${unexpected.join(', ')}`);
  return vector;
}

function validateReferenceCandidates(
  calibration: AdaptiveDevelopmentOracleSpecificityCalibration,
  expectedBehaviorIds: readonly string[],
  failures: string[],
): void {
  const baseline = assertCompleteBehaviorVector('baseline', expectedBehaviorIds, calibration.baseline, failures);
  const gold = assertCompleteBehaviorVector(
    'gold projection',
    expectedBehaviorIds,
    calibration.goldProjection,
    failures,
  );
  const alternate = assertCompleteBehaviorVector(
    'behavior-equivalent alternate',
    expectedBehaviorIds,
    calibration.behaviorEquivalentAlternate,
    failures,
  );
  if (calibration.baseline.passed || expectedBehaviorIds.some((id) => baseline.get(id) !== false)) {
    failures.push('baseline must fail every declared behavior independently');
  }
  if (!calibration.goldProjection.passed || expectedBehaviorIds.some((id) => gold.get(id) !== true)) {
    failures.push('gold projection must pass every declared behavior');
  }
  if (!calibration.behaviorEquivalentAlternate.passed || expectedBehaviorIds.some((id) => alternate.get(id) !== true)) {
    failures.push('behavior-equivalent alternate must pass without matching the gold implementation shape');
  }
}

function validateSingleFaultMutation(
  mutation: AdaptiveDevelopmentOracleMutation,
  expectedBehaviorIds: readonly string[],
  failures: string[],
): void {
  const vector = assertCompleteBehaviorVector(
    `mutation ${mutation.id}`,
    expectedBehaviorIds,
    mutation.oracle,
    failures,
  );
  const targets = new Set(mutation.targetBehaviorIds);
  if (targets.size === 0 || [...targets].some((id) => !expectedBehaviorIds.includes(id))) {
    failures.push(`mutation ${mutation.id} has invalid target behaviors`);
    return;
  }
  const coupledBehavior = expectedBehaviorIds.find((behaviorId) => vector.get(behaviorId) !== !targets.has(behaviorId));
  if (coupledBehavior) failures.push(`mutation ${mutation.id} is not isolated to ${[...targets].join(', ')}`);
  if (mutation.oracle.passed) failures.push(`mutation ${mutation.id} must fail its targeted behavior`);
}

export function evaluateAdaptiveDevelopmentOracleSpecificity(
  calibration: AdaptiveDevelopmentOracleSpecificityCalibration,
): AdaptiveDevelopmentOracleSpecificityVerdict {
  const failures: string[] = [];
  const expectedBehaviorIds = [...new Set(calibration.expectedBehaviorIds)];
  if (expectedBehaviorIds.length !== calibration.expectedBehaviorIds.length || expectedBehaviorIds.length === 0) {
    failures.push('expected behavior ids must be non-empty and unique');
  }
  validateReferenceCandidates(calibration, expectedBehaviorIds, failures);
  calibration.singleFaultMutations.forEach((mutation) => {
    validateSingleFaultMutation(mutation, expectedBehaviorIds, failures);
  });
  const coveredBehaviorIds = new Set(
    calibration.singleFaultMutations.flatMap((mutation) => mutation.targetBehaviorIds),
  );
  const missingMutationTargets = expectedBehaviorIds.filter((behaviorId) => !coveredBehaviorIds.has(behaviorId));
  if (missingMutationTargets.length > 0) {
    failures.push(`missing mutation targets: ${missingMutationTargets.join(', ')}`);
  }
  return { passed: failures.length === 0, failures };
}

export function buildAdaptiveDevelopmentOracleCalibrationCertificate(input: {
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly oracleToolchainSha256: string;
  readonly oracleSpecificitySha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly calibration: AdaptiveDevelopmentOracleSpecificityCalibration;
}): AdaptiveDevelopmentOracleCalibrationCertificate {
  const certificate: AdaptiveDevelopmentOracleCalibrationCertificate = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_ORACLE_CALIBRATION_CERTIFICATE_VERSION,
    status: 'calibrated',
    nonScoring: true,
    effectClaimEligible: false,
    ...input,
    behaviorIds: input.calibration.expectedBehaviorIds,
  };
  assertAdaptiveDevelopmentOracleCalibrationCertificate(certificate);
  return certificate;
}

export function assertAdaptiveDevelopmentOracleCalibrationCertificate(
  value: unknown,
): asserts value is AdaptiveDevelopmentOracleCalibrationCertificate {
  if (!isConvergenceRecord(value)) throw new Error('oracle calibration certificate must be an object');
  assertConvergenceExactKeys(
    value,
    [
      'schemaVersion',
      'status',
      'nonScoring',
      'effectClaimEligible',
      'runnerCommit',
      'environmentSha256',
      'manifestSha256',
      'oracleToolchainSha256',
      'oracleSpecificitySha256',
      'canaryId',
      'taskId',
      'behaviorIds',
      'calibration',
    ],
    'oracle calibration certificate',
  );
  if (
    value.schemaVersion !== ADAPTIVE_DEVELOPMENT_ORACLE_CALIBRATION_CERTIFICATE_VERSION ||
    value.status !== 'calibrated' ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false ||
    typeof value.canaryId !== 'string' ||
    !value.canaryId ||
    typeof value.taskId !== 'string' ||
    !value.taskId
  ) {
    throw new Error('oracle calibration certificate is invalid');
  }
  assertConvergenceSha1(value.runnerCommit, 'oracle calibration runner commit');
  assertConvergenceSha256(value.environmentSha256, 'oracle calibration environment');
  assertConvergenceSha256(value.manifestSha256, 'oracle calibration manifest');
  assertConvergenceSha256(value.oracleToolchainSha256, 'oracle calibration toolchain');
  assertConvergenceSha256(value.oracleSpecificitySha256, 'oracle calibration specificity contract');
  const behaviorIds = assertConvergenceBehaviorIds(value.behaviorIds, 'oracle calibration certificate');
  assertAdaptiveDevelopmentOracleSpecificityCalibration(value.calibration, behaviorIds);
}

function assertAdaptiveDevelopmentOracleSpecificityCalibration(
  value: unknown,
  expectedBehaviorIds: readonly string[],
): asserts value is AdaptiveDevelopmentOracleSpecificityCalibration {
  if (!isConvergenceRecord(value)) throw new Error('oracle calibration evidence is invalid');
  assertConvergenceExactKeys(
    value,
    ['expectedBehaviorIds', 'baseline', 'goldProjection', 'behaviorEquivalentAlternate', 'singleFaultMutations'],
    'oracle calibration evidence',
  );
  const calibrationBehaviorIds = assertConvergenceBehaviorIds(value.expectedBehaviorIds, 'oracle calibration evidence');
  if (JSON.stringify(calibrationBehaviorIds) !== JSON.stringify(expectedBehaviorIds)) {
    throw new Error('oracle calibration certificate behavior vector is inconsistent');
  }
  for (const label of ['baseline', 'goldProjection', 'behaviorEquivalentAlternate'] as const) {
    if (!isConvergenceRecord(value[label])) throw new Error(`oracle calibration ${label} is invalid`);
    assertConvergenceOracle(value[label]);
    assertCalibrationOracleBehaviorOrder(value[label], expectedBehaviorIds, `oracle calibration ${label}`);
  }
  if (!Array.isArray(value.singleFaultMutations)) {
    throw new Error('oracle calibration single-fault mutations are invalid');
  }
  for (const mutation of value.singleFaultMutations) {
    if (!isConvergenceRecord(mutation) || !isConvergenceRecord(mutation.oracle)) {
      throw new Error('oracle calibration single-fault mutation is invalid');
    }
    assertConvergenceExactKeys(
      mutation,
      ['id', 'targetBehaviorIds', 'oracle'],
      'oracle calibration single-fault mutation',
    );
    if (typeof mutation.id !== 'string' || !mutation.id) {
      throw new Error('oracle calibration single-fault mutation id is invalid');
    }
    assertConvergenceBehaviorIds(mutation.targetBehaviorIds, 'oracle calibration single-fault mutation');
    assertConvergenceOracle(mutation.oracle);
    assertCalibrationOracleBehaviorOrder(
      mutation.oracle,
      expectedBehaviorIds,
      `oracle calibration mutation ${mutation.id}`,
    );
  }
  const calibration = value as unknown as AdaptiveDevelopmentOracleSpecificityCalibration;
  const verdict = evaluateAdaptiveDevelopmentOracleSpecificity(calibration);
  if (!verdict.passed) {
    throw new Error(`oracle calibration certificate failed specificity: ${verdict.failures.join('; ')}`);
  }
}

function assertCalibrationOracleBehaviorOrder(
  oracle: Record<string, unknown>,
  expectedBehaviorIds: readonly string[],
  label: string,
): void {
  const actualBehaviorIds = (oracle.checks as Array<{ readonly id: string }>).map((check) => check.id);
  if (JSON.stringify(actualBehaviorIds) !== JSON.stringify(expectedBehaviorIds)) {
    throw new Error(`${label} does not preserve the exact ordered behavior vector`);
  }
}

function assertCalibrationCertificateMatchesScope(
  certificate: AdaptiveDevelopmentOracleCalibrationCertificate,
  scope: Pick<
    AdaptiveDevelopmentConvergenceCanaryScope,
    'runnerCommit' | 'environmentSha256' | 'manifestSha256' | 'canaryId' | 'taskId' | 'behaviorIds'
  >,
): void {
  if (
    certificate.runnerCommit !== scope.runnerCommit ||
    certificate.environmentSha256 !== scope.environmentSha256 ||
    certificate.manifestSha256 !== scope.manifestSha256 ||
    certificate.canaryId !== scope.canaryId ||
    certificate.taskId !== scope.taskId ||
    JSON.stringify(certificate.behaviorIds) !== JSON.stringify(scope.behaviorIds)
  ) {
    throw new Error('oracle calibration certificate does not match the convergence canary scope');
  }
}

function assertReviewBoundaryCalibrationCertificateMatchesScope(
  certificate: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  scope: Pick<
    AdaptiveDevelopmentConvergenceCanaryScope,
    'runnerCommit' | 'environmentSha256' | 'manifestSha256' | 'modelId'
  >,
): void {
  if (
    certificate.runnerCommit !== scope.runnerCommit ||
    certificate.environmentSha256 !== scope.environmentSha256 ||
    certificate.manifestSha256 !== scope.manifestSha256 ||
    certificate.modelId !== scope.modelId
  ) {
    throw new Error('Review-boundary calibration certificate does not match the convergence canary scope');
  }
}

export function buildAdaptiveDevelopmentConvergenceCanaryScope(input: {
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly canaryId: string;
  readonly taskId: string;
  readonly armId: string;
  readonly modelId: string;
  readonly behaviorIds: readonly string[];
  readonly maximumRepairRounds: 0;
  readonly candidateWallTimeMsCap: number;
  readonly adjudicationWallTimeMsCap: number;
  readonly calibrationCertificate: AdaptiveDevelopmentOracleCalibrationCertificate;
  readonly reviewBoundaryRubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly reviewBoundaryGoldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
  readonly reviewBoundaryCalibrationCertificate: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate;
}): AdaptiveDevelopmentConvergenceCanaryScope {
  const wallTimeMsCap = convergenceCanaryLifecycleWallTimeMsCap(
    input.candidateWallTimeMsCap,
    input.adjudicationWallTimeMsCap,
    input.maximumRepairRounds,
  );
  assertAdaptiveDevelopmentOracleCalibrationCertificate(input.calibrationCertificate);
  assertCalibrationCertificateMatchesScope(input.calibrationCertificate, input);
  const reviewBoundaryRubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(input.reviewBoundaryRubric);
  const reviewBoundaryGoldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(input.reviewBoundaryGoldSuite, reviewBoundaryRubric);
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
    input.reviewBoundaryCalibrationCertificate,
    reviewBoundaryRubric,
    reviewBoundaryGoldSuite,
  );
  assertReviewBoundaryCalibrationCertificateMatchesScope(input.reviewBoundaryCalibrationCertificate, input);
  const scope: AdaptiveDevelopmentConvergenceCanaryScope = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION,
    ...input,
    calibrationCertificateSha256: fingerprintAdaptiveDevelopmentBenchmark(input.calibrationCertificate),
    reviewBoundaryRubricSha256: fingerprintAdaptiveDevelopmentBenchmark(reviewBoundaryRubric),
    reviewBoundaryRubric,
    reviewBoundaryGoldSuiteSha256: fingerprintAdaptiveDevelopmentBenchmark(reviewBoundaryGoldSuite),
    reviewBoundaryGoldSuite,
    reviewBoundaryCalibrationCertificateSha256: fingerprintAdaptiveDevelopmentBenchmark(input.reviewBoundaryCalibrationCertificate),
    calibrationCoverage: 'review_boundary_only',
    overallSopCalibrationComplete: false,
    maximumInfrastructureRetryAttempts: 0,
    wallTimeMsCap,
    tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
    nonScoring: true,
    effectClaimEligible: false,
    roles: [
      {
        role: 'executor',
        filesystemAccess: 'write',
        executions: 1,
        tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
      },
      {
        role: 'judge',
        filesystemAccess: 'read',
        postHoc: true,
        feedbackToCandidate: false,
        tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
      },
    ],
  };
  assertAdaptiveDevelopmentConvergenceCanaryScope(scope);
  return scope;
}

export function buildAdaptiveDevelopmentConvergenceCanaryDirective(
  scope: AdaptiveDevelopmentConvergenceCanaryScope,
  authority: {
    readonly operatorUserId: string;
    readonly threadId: string;
    readonly messageStoreIdentitySha256: string;
    readonly runtimeInstanceIdentitySha256: string;
  },
): string {
  assertAdaptiveDevelopmentConvergenceCanaryScope(scope);
  if (scope.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    throw new Error('convergence canary approval directive requires the current scope version');
  }
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  assertConvergenceSha256(canaryScopeSha256, 'convergence canary scope');
  if (!authority.operatorUserId || !authority.threadId) throw new Error('convergence canary authority is invalid');
  assertConvergenceSha256(authority.messageStoreIdentitySha256, 'convergence canary MessageStore identity');
  assertConvergenceSha256(authority.runtimeInstanceIdentitySha256, 'convergence canary runtime identity');
  return [
    'APPROVE_ADAPTIVE_CONVERGENCE_CANARY',
    `scope_sha256=${canaryScopeSha256}`,
    `operator_user_id=${authority.operatorUserId}`,
    `thread_id=${authority.threadId}`,
    `message_store_identity_sha256=${authority.messageStoreIdentitySha256}`,
    `runtime_instance_identity_sha256=${authority.runtimeInstanceIdentitySha256}`,
    `calibration_certificate_sha256=${scope.calibrationCertificateSha256}`,
    `review_boundary_rubric_sha256=${scope.reviewBoundaryRubricSha256}`,
    `review_boundary_gold_suite_sha256=${scope.reviewBoundaryGoldSuiteSha256}`,
    `review_boundary_calibration_certificate_sha256=${scope.reviewBoundaryCalibrationCertificateSha256}`,
    `token_policy=${ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY}`,
    'maximum_repair_rounds=0',
    'maximum_infrastructure_retry_attempts=0',
    `candidate_wall_time_ms_cap=${scope.candidateWallTimeMsCap}`,
    `adjudication_wall_time_ms_cap=${scope.adjudicationWallTimeMsCap}`,
    `lifecycle_wall_time_ms_cap=${scope.wallTimeMsCap}`,
  ].join(' ');
}

export function deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs(input: {
  readonly lifecycleStartedAtEpochMs: number;
  readonly candidateStartedAtEpochMs: number;
  readonly candidateWallTimeMsCap: number;
  readonly wallTimeMsCap: number;
}): number {
  return deriveAdaptiveDevelopmentConvergenceCanaryPhaseDeadlineEpochMs({
    label: 'candidate',
    lifecycleStartedAtEpochMs: input.lifecycleStartedAtEpochMs,
    phaseStartedAtEpochMs: input.candidateStartedAtEpochMs,
    phaseWallTimeMsCap: input.candidateWallTimeMsCap,
    wallTimeMsCap: input.wallTimeMsCap,
  });
}

export function deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs(input: {
  readonly lifecycleStartedAtEpochMs: number;
  readonly adjudicationStartedAtEpochMs: number;
  readonly adjudicationWallTimeMsCap: number;
  readonly wallTimeMsCap: number;
}): number {
  return deriveAdaptiveDevelopmentConvergenceCanaryPhaseDeadlineEpochMs({
    label: 'adjudication',
    lifecycleStartedAtEpochMs: input.lifecycleStartedAtEpochMs,
    phaseStartedAtEpochMs: input.adjudicationStartedAtEpochMs,
    phaseWallTimeMsCap: input.adjudicationWallTimeMsCap,
    wallTimeMsCap: input.wallTimeMsCap,
  });
}

function deriveAdaptiveDevelopmentConvergenceCanaryPhaseDeadlineEpochMs(input: {
  readonly label: 'candidate' | 'adjudication';
  readonly lifecycleStartedAtEpochMs: number;
  readonly phaseStartedAtEpochMs: number;
  readonly phaseWallTimeMsCap: number;
  readonly wallTimeMsCap: number;
}): number {
  for (const [label, value] of [
    ['lifecycleStartedAtEpochMs', input.lifecycleStartedAtEpochMs],
    [`${input.label}StartedAtEpochMs`, input.phaseStartedAtEpochMs],
    [`${input.label}WallTimeMsCap`, input.phaseWallTimeMsCap],
    ['wallTimeMsCap', input.wallTimeMsCap],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`convergence canary ${label} must be a positive safe integer`);
    }
  }
  if (input.phaseStartedAtEpochMs < input.lifecycleStartedAtEpochMs) {
    throw new Error(`convergence canary ${input.label} cannot start before its lifecycle`);
  }
  const phaseDeadlineEpochMs = input.phaseStartedAtEpochMs + input.phaseWallTimeMsCap;
  const lifecycleDeadlineEpochMs = input.lifecycleStartedAtEpochMs + input.wallTimeMsCap;
  if (!Number.isSafeInteger(phaseDeadlineEpochMs) || !Number.isSafeInteger(lifecycleDeadlineEpochMs)) {
    throw new Error('convergence canary deadline exceeds the safe integer range');
  }
  return Math.min(phaseDeadlineEpochMs, lifecycleDeadlineEpochMs);
}

function convergenceCanaryLifecycleWallTimeMsCap(
  candidateWallTimeMsCap: number,
  adjudicationWallTimeMsCap: number,
  maximumRepairRounds: 0 | 1,
): number {
  if (
    !Number.isSafeInteger(candidateWallTimeMsCap) ||
    candidateWallTimeMsCap <= 0 ||
    !Number.isSafeInteger(adjudicationWallTimeMsCap) ||
    adjudicationWallTimeMsCap <= 0
  ) {
    throw new Error('convergence canary phase wall-time caps must be positive safe integers');
  }
  const wallTimeMsCap = (candidateWallTimeMsCap + adjudicationWallTimeMsCap) * (maximumRepairRounds + 1);
  if (!Number.isSafeInteger(wallTimeMsCap)) {
    throw new Error('convergence canary lifecycle wall-time cap exceeds the safe integer range');
  }
  return wallTimeMsCap;
}

export function parseAdaptiveDevelopmentConvergenceCanaryPlan(
  value: unknown,
): AdaptiveDevelopmentConvergenceCanaryPlan {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary plan must be an object');
  assertConvergenceExactKeys(
    value,
    ['schemaVersion', 'canaryScopeSha256', 'scope', 'authorization'],
    'convergence canary plan',
  );
  assertAdaptiveDevelopmentConvergenceCanaryScope(value.scope);
  if (!isConvergenceRecord(value.authorization)) {
    throw new Error('convergence canary plan is not bound to one exact approved scope');
  }
  assertConvergenceExactKeys(
    value.authorization,
    ['kind', 'approvalRef', 'approvalMessageSha256', 'approvedConvergenceCanaryScopeSha256', 'approvedAt'],
    'convergence canary authorization',
  );
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(value.scope);
  if (
    value.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PLAN_VERSION ||
    value.canaryScopeSha256 !== scopeSha256 ||
    value.authorization.kind !== 'operator_approval' ||
    value.authorization.approvedConvergenceCanaryScopeSha256 !== scopeSha256 ||
    typeof value.authorization.approvalRef !== 'string' ||
    !/^cat-cafe:\/\/message\/[A-Za-z0-9-]+$/.test(value.authorization.approvalRef) ||
    typeof value.authorization.approvalMessageSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.authorization.approvalMessageSha256) ||
    typeof value.authorization.approvedAt !== 'string' ||
    Number.isNaN(Date.parse(value.authorization.approvedAt))
  ) {
    throw new Error('convergence canary plan is not bound to one exact approved scope');
  }
  return value as unknown as AdaptiveDevelopmentConvergenceCanaryPlan;
}

export function assertAdaptiveDevelopmentConvergenceCanaryReceipt(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceCanaryReceipt {
  assertConvergenceReceiptEnvelope(value, ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION);
  const behaviorIds = assertConvergenceBehaviorIds(value.behaviorIds, 'convergence canary receipt');
  assertAdaptiveDevelopmentConvergenceCanaryResult(value.result, behaviorIds);
  if (value.status !== value.result.status) {
    throw new Error('convergence canary receipt status disagrees with the terminal result');
  }
  if (!Array.isArray(value.usage) || value.usage.length !== 2) {
    throw new Error('convergence canary receipt usage must cover one executor and one post-hoc Judge');
  }
  const executor = value.usage.find((entry) => isConvergenceRecord(entry) && entry.role === 'executor');
  const judge = value.usage.find((entry) => isConvergenceRecord(entry) && entry.role === 'judge');
  const candidateSessionIds = [
    value.result.episode.candidate.executorSessionId,
    ...(value.result.episode.candidate.executorEpisode?.childSessionIds ?? []),
  ];
  assertConvergenceUsage(executor, 'executor', value.result.episode.candidate.executorSessionId, candidateSessionIds);
  assertConvergenceUsage(judge, 'judge', value.result.episode.judge.judgeSessionId, [
    value.result.episode.judge.judgeSessionId,
  ]);
  assertConvergenceCurrentCandidateEvidence(value.result.episode.candidate);
  assertConvergenceJudgeEvidenceFields(value.result.episode.judge);
  assertConvergenceSha256(value.reviewBoundaryRubricSha256, 'convergence canary Judge rubric');
  assertConvergenceSha256(
    value.reviewBoundaryCalibrationCertificateSha256,
    'convergence canary Review-boundary calibration certificate',
  );
  if (value.calibrationCoverage !== 'review_boundary_only' || value.overallSopCalibrationComplete !== false) {
    throw new Error('convergence canary receipt overstates its Review-boundary-only calibration coverage');
  }
  assertConvergenceTiming(value.timing);
}

export function assertAdaptiveDevelopmentConvergenceCanaryPreRubricReceipt(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceCanaryPreRubricReceipt {
  assertConvergenceReceiptEnvelope(value, ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_RECEIPT_VERSION);
  const behaviorIds = assertConvergenceBehaviorIds(value.behaviorIds, 'pre-rubric convergence canary receipt');
  assertAdaptiveDevelopmentConvergencePreReviewBoundaryResult(value.result, behaviorIds);
  if (value.status !== value.result.status) {
    throw new Error('pre-rubric convergence canary receipt status disagrees with the terminal result');
  }
  if (!Array.isArray(value.usage) || value.usage.length !== 2) {
    throw new Error('pre-rubric convergence canary receipt usage must cover one executor and one post-hoc Judge');
  }
  const executor = value.usage.find((entry) => isConvergenceRecord(entry) && entry.role === 'executor');
  const judge = value.usage.find((entry) => isConvergenceRecord(entry) && entry.role === 'judge');
  const candidateSessionIds = [
    value.result.episode.candidate.executorSessionId,
    ...(value.result.episode.candidate.executorEpisode?.childSessionIds ?? []),
  ];
  assertConvergenceUsage(executor, 'executor', value.result.episode.candidate.executorSessionId, candidateSessionIds);
  assertConvergenceUsage(judge, 'judge', value.result.episode.judge.judgeSessionId, [
    value.result.episode.judge.judgeSessionId,
  ]);
  assertConvergenceCurrentCandidateEvidence(value.result.episode.candidate);
  assertConvergenceJudgeEvidenceFields(value.result.episode.judge, false);
}

function assertConvergenceReceiptEnvelope(
  value: unknown,
  schemaVersion:
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_RECEIPT_VERSION
    | typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_RECEIPT_VERSION,
): asserts value is Record<string, unknown> {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary receipt must be an object');
  assertConvergenceExactKeys(
    value,
    [
      'schemaVersion',
      'status',
      'zeroModelProvider',
      'runnerCommit',
      'environmentSha256',
      'manifestSha256',
      'modelId',
      'canaryId',
      'taskId',
      'armId',
      'behaviorIds',
      ...(schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION
        ? [
            'reviewBoundaryRubricSha256',
            'reviewBoundaryCalibrationCertificateSha256',
            'calibrationCoverage',
            'overallSopCalibrationComplete',
          ]
        : []),
      'canaryScopeSha256',
      'canaryPlanSha256',
      'tokenPolicy',
      'nonScoring',
      'effectClaimEligible',
      'completedAt',
      'result',
      'usage',
      ...(schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION ? ['timing'] : []),
    ],
    'convergence canary receipt',
  );
  if (
    value.schemaVersion !== schemaVersion ||
    value.zeroModelProvider !== false ||
    value.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false ||
    typeof value.completedAt !== 'string' ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    typeof value.modelId !== 'string' ||
    !value.modelId ||
    typeof value.canaryId !== 'string' ||
    !value.canaryId ||
    typeof value.taskId !== 'string' ||
    !value.taskId ||
    typeof value.armId !== 'string' ||
    !value.armId
  ) {
    throw new Error('convergence canary receipt does not prove one non-scoring real-provider result');
  }
  assertConvergenceSha1(value.runnerCommit, 'convergence canary runner commit');
  assertConvergenceSha256(value.environmentSha256, 'convergence canary environment');
  assertConvergenceSha256(value.manifestSha256, 'convergence canary manifest');
  assertConvergenceSha256(value.canaryScopeSha256, 'convergence canary scope');
  assertConvergenceSha256(value.canaryPlanSha256, 'convergence canary plan');
}

function assertConvergenceTiming(value: unknown): asserts value is AdaptiveDevelopmentConvergenceCanaryTiming {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary receipt timing is invalid');
  assertConvergenceExactKeys(
    value,
    ['candidateElapsedMs', 'adjudicationElapsedMs', 'totalMeasuredElapsedMs'],
    'convergence canary receipt timing',
  );
  if (
    !Number.isSafeInteger(value.candidateElapsedMs) ||
    (value.candidateElapsedMs as number) <= 0 ||
    !Number.isSafeInteger(value.adjudicationElapsedMs) ||
    (value.adjudicationElapsedMs as number) <= 0 ||
    value.totalMeasuredElapsedMs !== (value.candidateElapsedMs as number) + (value.adjudicationElapsedMs as number)
  ) {
    throw new Error('convergence canary receipt timing is invalid');
  }
}

export function assertAdaptiveDevelopmentConvergenceCanaryReceiptJudgeEvidence(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceCanaryReceipt {
  assertAdaptiveDevelopmentConvergenceCanaryReceipt(value);
}

export function assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceCanaryReceipt {
  assertAdaptiveDevelopmentConvergenceCanaryReceipt(value);
}

export function assertAdaptiveDevelopmentConvergenceCanaryHistoricalReceipt(
  value: unknown,
  progressionPolicy: 'compatible' | 'review_feedback' | 'oracle_feedback' = 'compatible',
): asserts value is AdaptiveDevelopmentConvergenceCanaryReceipt {
  assertConvergenceReceiptEnvelope(value, ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_RECEIPT_VERSION);
  const behaviorIds = assertConvergenceBehaviorIds(value.behaviorIds, 'historical convergence canary receipt');
  const rounds = assertLegacyAdaptiveDevelopmentConvergenceCanaryResult(value.result, behaviorIds, progressionPolicy);
  if (!isConvergenceRecord(value.result) || value.status !== value.result.status) {
    throw new Error('historical convergence canary receipt status disagrees with the terminal result');
  }
  if (!Array.isArray(value.usage) || value.usage.length !== rounds.length * 2) {
    throw new Error('historical convergence canary receipt usage does not cover every executor and reviewer session');
  }
  for (const round of rounds) {
    const executor = value.usage.find(
      (entry) => isConvergenceRecord(entry) && entry.round === round.candidate.round && entry.role === 'executor',
    );
    const reviewer = value.usage.find(
      (entry) => isConvergenceRecord(entry) && entry.round === round.candidate.round && entry.role === 'reviewer',
    );
    assertLegacyConvergenceUsage(executor, round.candidate.round, 'executor', round.candidate.executorSessionId);
    assertLegacyConvergenceUsage(reviewer, round.candidate.round, 'reviewer', round.review.reviewerSessionId);
  }
}

interface LegacyConvergenceRound {
  readonly candidate: AdaptiveDevelopmentConvergenceCandidate;
  readonly oracle: AdaptiveDevelopmentConvergenceOracleResult;
  readonly review: {
    readonly candidateSha: string;
    readonly reviewerSessionId: string;
    readonly reviewerPrincipalId: string;
    readonly reviewerRoleKey: string;
    readonly state: 'approved' | 'changes_requested';
    readonly findings: readonly AdaptiveDevelopmentConvergenceFinding[];
  };
  readonly converged: boolean;
}

function assertLegacyAdaptiveDevelopmentConvergenceCanaryResult(
  value: unknown,
  expectedBehaviorIds: readonly string[],
  progressionPolicy: 'compatible' | 'review_feedback' | 'oracle_feedback',
): LegacyConvergenceRound[] {
  if (!isConvergenceRecord(value) || !Array.isArray(value.rounds) || !isConvergenceRecord(value.finalAdjudication)) {
    throw new Error('historical convergence canary terminal result is invalid');
  }
  assertConvergenceExactKeys(
    value,
    ['schemaVersion', 'status', 'nonScoring', 'effectClaimEligible', 'firstPass', 'rounds', 'finalAdjudication'],
    'historical convergence canary terminal result',
  );
  if (
    value.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_RESULT_VERSION ||
    (value.status !== 'passed' && value.status !== 'failed') ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false ||
    value.rounds.length < 1 ||
    value.rounds.length > 2 ||
    !isConvergenceRecord(value.firstPass)
  ) {
    throw new Error('historical convergence canary terminal result is invalid');
  }
  assertConvergenceExactKeys(value.firstPass, ['role', 'converged'], 'historical first-pass projection');
  const rounds = value.rounds.map((entry, index) =>
    assertLegacyConvergenceRound(entry, index + 1, expectedBehaviorIds),
  );
  const first = rounds[0] as LegacyConvergenceRound;
  if (value.firstPass.role !== 'diagnostic_only' || value.firstPass.converged !== first.converged) {
    throw new Error('historical convergence first-pass projection disagrees with round one');
  }
  const reviewRequestsRepair = !legacyReviewApproved(first.review) || first.candidate.hardInvariantMisses.length > 0;
  const reviewFeedbackValid = rounds.length === (reviewRequestsRepair ? 2 : 1);
  const oracleFeedbackValid = rounds.length === (first.converged ? 1 : 2);
  if (
    (progressionPolicy === 'review_feedback' && !reviewFeedbackValid) ||
    (progressionPolicy === 'oracle_feedback' && !oracleFeedbackValid) ||
    (progressionPolicy === 'compatible' && !reviewFeedbackValid && !oracleFeedbackValid)
  ) {
    throw new Error('historical convergence repair-round count disagrees with its feedback policy');
  }
  const final = rounds.at(-1) as LegacyConvergenceRound;
  const independentReviewApproved = legacyReviewApproved(final.review);
  const hardInvariantsPassed = final.candidate.hardInvariantMisses.length === 0;
  assertConvergenceExactKeys(
    value.finalAdjudication,
    ['round', 'behaviorOraclePassed', 'independentReviewApproved', 'hardInvariantsPassed'],
    'historical convergence final adjudication',
  );
  if (
    value.finalAdjudication.round !== final.candidate.round ||
    value.finalAdjudication.behaviorOraclePassed !== final.oracle.passed ||
    value.finalAdjudication.independentReviewApproved !== independentReviewApproved ||
    value.finalAdjudication.hardInvariantsPassed !== hardInvariantsPassed
  ) {
    throw new Error('historical convergence final adjudication disagrees with terminal evidence');
  }
  const passed = final.oracle.passed && independentReviewApproved && hardInvariantsPassed;
  if (value.status !== (passed ? 'passed' : 'failed')) {
    throw new Error('historical convergence terminal status disagrees with final adjudication');
  }
  return rounds;
}

function assertLegacyConvergenceRound(
  value: unknown,
  expectedRound: number,
  expectedBehaviorIds: readonly string[],
): LegacyConvergenceRound {
  if (
    !isConvergenceRecord(value) ||
    !isConvergenceRecord(value.candidate) ||
    !isConvergenceRecord(value.oracle) ||
    !isConvergenceRecord(value.review)
  ) {
    throw new Error('historical convergence round is invalid');
  }
  assertConvergenceExactKeys(value, ['candidate', 'oracle', 'review', 'converged'], 'historical convergence round');
  assertConvergenceCandidate(value.candidate, expectedRound);
  assertConvergenceOracle(value.oracle);
  assertLegacyConvergenceReview(value.review);
  const round = value as unknown as LegacyConvergenceRound;
  if (
    round.oracle.candidateSha !== round.candidate.candidateSha ||
    round.review.candidateSha !== round.candidate.candidateSha ||
    round.review.reviewerSessionId === round.candidate.executorSessionId ||
    JSON.stringify(round.oracle.checks.map((check) => check.id)) !== JSON.stringify(expectedBehaviorIds)
  ) {
    throw new Error('historical convergence evidence is not bound to the exact candidate');
  }
  const converged =
    round.oracle.passed && legacyReviewApproved(round.review) && round.candidate.hardInvariantMisses.length === 0;
  if (round.converged !== converged) throw new Error('historical convergence round disagrees with its evidence');
  return round;
}

function legacyReviewApproved(review: LegacyConvergenceRound['review']): boolean {
  return review.state === 'approved' && review.findings.every((finding) => !['P1', 'P2'].includes(finding.severity));
}

function assertLegacyConvergenceReview(value: Record<string, unknown>): void {
  assertConvergenceExactKeys(
    value,
    ['candidateSha', 'reviewerSessionId', 'reviewerPrincipalId', 'reviewerRoleKey', 'state', 'findings'],
    'historical convergence review',
  );
  assertConvergenceSha1(value.candidateSha, 'historical convergence review candidate');
  if (
    typeof value.reviewerSessionId !== 'string' ||
    !value.reviewerSessionId ||
    typeof value.reviewerPrincipalId !== 'string' ||
    !value.reviewerPrincipalId ||
    typeof value.reviewerRoleKey !== 'string' ||
    !value.reviewerRoleKey ||
    !['approved', 'changes_requested'].includes(value.state as string) ||
    !Array.isArray(value.findings)
  ) {
    throw new Error('historical convergence review is invalid');
  }
  for (const finding of value.findings) {
    if (!isConvergenceRecord(finding) || !['P1', 'P2', 'P3'].includes(finding.severity as string)) {
      throw new Error('historical convergence review finding is invalid');
    }
  }
}

function assertConvergenceJudgeEvidenceFields(
  judge: { readonly findings: readonly AdaptiveDevelopmentConvergenceFinding[] },
  reviewBoundaryOnly = true,
): void {
  for (const finding of judge.findings as readonly unknown[]) {
    if (!isConvergenceRecord(finding) || !('evidence' in finding)) {
      throw new Error('current convergence canary Judge finding evidence is required');
    }
    assertConvergenceFindingEvidence(finding.evidence);
    if (reviewBoundaryOnly && isConvergenceRecord(finding.evidence) && finding.evidence.kind !== 'static_proof') {
      throw new Error('Review-boundary Judge findings must use static proof bound to visible authenticated evidence');
    }
  }
}

function assertConvergenceCurrentCandidateEvidence(candidate: AdaptiveDevelopmentConvergenceCandidate): void {
  if (!candidate.candidatePatchSha256 || !/^[a-f0-9]{64}$/.test(candidate.candidatePatchSha256)) {
    throw new Error('current convergence canary candidate must bind its immutable patch');
  }
  if (!candidate.executorEpisode) {
    throw new Error('current convergence canary candidate must bind its natural agent episode');
  }
  if (!candidate.executorCheckpoint) {
    throw new Error('current convergence canary candidate must bind its frozen Outcome Checkpoint');
  }
  if (
    !candidate.candidateDiffRef ||
    !new RegExp(`^[a-f0-9]{40}\\.\\.${candidate.candidateSha}$`).test(candidate.candidateDiffRef)
  ) {
    throw new Error('current convergence canary candidate must bind its immutable diff ref');
  }
}

function convergenceScopeVersionPolicy(schemaVersion: unknown):
  | {
      readonly isLegacy: boolean;
      readonly hasCalibration: boolean;
      readonly hasAdjudicationDeadline: boolean;
      readonly hasWritableReviewer: boolean;
      readonly hasNaturalAgentBoundary: boolean;
      readonly hasReviewBoundaryRubric: boolean;
      readonly isCurrent: boolean;
    }
  | undefined {
  switch (schemaVersion) {
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_LEGACY_SCOPE_VERSION:
      return {
        isLegacy: true,
        hasCalibration: false,
        hasAdjudicationDeadline: false,
        hasWritableReviewer: false,
        hasNaturalAgentBoundary: false,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_DEADLINE_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: false,
        hasAdjudicationDeadline: false,
        hasWritableReviewer: false,
        hasNaturalAgentBoundary: false,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_CALIBRATION_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: true,
        hasAdjudicationDeadline: false,
        hasWritableReviewer: false,
        hasNaturalAgentBoundary: false,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_REVIEW_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: true,
        hasAdjudicationDeadline: false,
        hasWritableReviewer: true,
        hasNaturalAgentBoundary: false,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_FEEDBACK_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: true,
        hasAdjudicationDeadline: true,
        hasWritableReviewer: true,
        hasNaturalAgentBoundary: false,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: true,
        hasAdjudicationDeadline: true,
        hasWritableReviewer: true,
        hasNaturalAgentBoundary: true,
        hasReviewBoundaryRubric: false,
        isCurrent: false,
      };
    case ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION:
      return {
        isLegacy: false,
        hasCalibration: true,
        hasAdjudicationDeadline: true,
        hasWritableReviewer: true,
        hasNaturalAgentBoundary: true,
        hasReviewBoundaryRubric: true,
        isCurrent: true,
      };
    default:
      return undefined;
  }
}

function hasValidConvergenceScopeTiming(
  value: Record<string, unknown>,
  policy: {
    readonly isLegacy: boolean;
    readonly hasAdjudicationDeadline: boolean;
    readonly hasNaturalAgentBoundary: boolean;
  },
): boolean {
  if (!Number.isSafeInteger(value.wallTimeMsCap) || (value.wallTimeMsCap as number) <= 0) return false;
  if (policy.isLegacy) return true;
  if (policy.hasNaturalAgentBoundary) {
    if (
      !Number.isSafeInteger(value.candidateWallTimeMsCap) ||
      (value.candidateWallTimeMsCap as number) <= 0 ||
      !Number.isSafeInteger(value.adjudicationWallTimeMsCap) ||
      (value.adjudicationWallTimeMsCap as number) <= 0
    ) {
      return false;
    }
    return (
      value.wallTimeMsCap ===
      convergenceCanaryLifecycleWallTimeMsCap(
        value.candidateWallTimeMsCap as number,
        value.adjudicationWallTimeMsCap as number,
        0,
      )
    );
  }
  if (!Number.isSafeInteger(value.roundWallTimeMsCap) || (value.roundWallTimeMsCap as number) <= 0) return false;
  if (!policy.hasAdjudicationDeadline) {
    return value.wallTimeMsCap === (value.roundWallTimeMsCap as number) * 2;
  }
  if (!Number.isSafeInteger(value.adjudicationWallTimeMsCap) || (value.adjudicationWallTimeMsCap as number) <= 0) {
    return false;
  }
  return (
    value.wallTimeMsCap ===
    convergenceCanaryLifecycleWallTimeMsCap(
      value.roundWallTimeMsCap as number,
      value.adjudicationWallTimeMsCap as number,
      policy.hasNaturalAgentBoundary ? 0 : 1,
    )
  );
}

function assertAdaptiveDevelopmentConvergenceCanaryScope(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceCanaryPersistedScope {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary scope must be an object');
  const versionPolicy = convergenceScopeVersionPolicy(value.schemaVersion);
  if (!versionPolicy) throw new Error('convergence canary scope version is unsupported');
  const {
    isLegacy,
    hasCalibration,
    hasAdjudicationDeadline,
    hasWritableReviewer,
    hasNaturalAgentBoundary,
    hasReviewBoundaryRubric,
  } = versionPolicy;
  assertConvergenceExactKeys(
    value,
    [
      'schemaVersion',
      'runnerCommit',
      'environmentSha256',
      'manifestSha256',
      'canaryId',
      'taskId',
      'armId',
      'modelId',
      'behaviorIds',
      ...(hasCalibration ? ['calibrationCertificateSha256', 'calibrationCertificate'] : []),
      ...(hasReviewBoundaryRubric
        ? [
            'reviewBoundaryRubricSha256',
            'reviewBoundaryRubric',
            'reviewBoundaryGoldSuiteSha256',
            'reviewBoundaryGoldSuite',
            'reviewBoundaryCalibrationCertificateSha256',
            'reviewBoundaryCalibrationCertificate',
            'calibrationCoverage',
            'overallSopCalibrationComplete',
          ]
        : []),
      'maximumRepairRounds',
      'maximumInfrastructureRetryAttempts',
      ...(hasNaturalAgentBoundary ? ['candidateWallTimeMsCap'] : isLegacy ? [] : ['roundWallTimeMsCap']),
      ...(hasAdjudicationDeadline ? ['adjudicationWallTimeMsCap'] : []),
      'wallTimeMsCap',
      'tokenPolicy',
      'nonScoring',
      'effectClaimEligible',
      'roles',
    ],
    'convergence canary scope',
  );
  if (
    typeof value.canaryId !== 'string' ||
    !value.canaryId ||
    typeof value.taskId !== 'string' ||
    !value.taskId ||
    typeof value.armId !== 'string' ||
    !value.armId ||
    typeof value.modelId !== 'string' ||
    !value.modelId ||
    value.maximumRepairRounds !== (hasNaturalAgentBoundary ? 0 : 1) ||
    value.maximumInfrastructureRetryAttempts !== 0 ||
    !hasValidConvergenceScopeTiming(value, { isLegacy, hasAdjudicationDeadline, hasNaturalAgentBoundary }) ||
    value.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false ||
    (hasReviewBoundaryRubric &&
      (value.calibrationCoverage !== 'review_boundary_only' || value.overallSopCalibrationComplete !== false)) ||
    !Array.isArray(value.roles) ||
    value.roles.length !== 2 ||
    !isConvergenceRecord(value.roles[0]) ||
    !isConvergenceRecord(value.roles[1])
  ) {
    throw new Error('convergence canary scope must contain the fixed non-scoring execution policy');
  }
  assertConvergenceSha1(value.runnerCommit, 'convergence canary runner commit');
  assertConvergenceSha256(value.environmentSha256, 'convergence canary environment');
  assertConvergenceSha256(value.manifestSha256, 'convergence canary manifest');
  const behaviorIds = assertConvergenceBehaviorIds(value.behaviorIds, 'convergence canary scope');
  if (hasCalibration) {
    assertConvergenceSha256(value.calibrationCertificateSha256, 'oracle calibration certificate');
    assertAdaptiveDevelopmentOracleCalibrationCertificate(value.calibrationCertificate);
    if (value.calibrationCertificateSha256 !== fingerprintAdaptiveDevelopmentBenchmark(value.calibrationCertificate)) {
      throw new Error('convergence canary scope has a corrupt oracle calibration certificate');
    }
    assertCalibrationCertificateMatchesScope(value.calibrationCertificate, {
      runnerCommit: value.runnerCommit as string,
      environmentSha256: value.environmentSha256 as string,
      manifestSha256: value.manifestSha256 as string,
      canaryId: value.canaryId as string,
      taskId: value.taskId as string,
      behaviorIds,
    });
  }
  if (hasReviewBoundaryRubric) {
    assertConvergenceSha256(value.reviewBoundaryRubricSha256, 'Judge rubric');
    const reviewBoundaryRubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(value.reviewBoundaryRubric);
    if (value.reviewBoundaryRubricSha256 !== fingerprintAdaptiveDevelopmentBenchmark(reviewBoundaryRubric)) {
      throw new Error('convergence canary scope has a corrupt Judge rubric');
    }
    assertConvergenceSha256(value.reviewBoundaryGoldSuiteSha256, 'Judge gold suite');
    const reviewBoundaryGoldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(value.reviewBoundaryGoldSuite, reviewBoundaryRubric);
    if (value.reviewBoundaryGoldSuiteSha256 !== fingerprintAdaptiveDevelopmentBenchmark(reviewBoundaryGoldSuite)) {
      throw new Error('convergence canary scope has a corrupt Judge gold suite');
    }
    assertConvergenceSha256(value.reviewBoundaryCalibrationCertificateSha256, 'Review-boundary calibration certificate');
    assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
      value.reviewBoundaryCalibrationCertificate,
      reviewBoundaryRubric,
      reviewBoundaryGoldSuite,
    );
    if (
      value.reviewBoundaryCalibrationCertificateSha256 !==
      fingerprintAdaptiveDevelopmentBenchmark(value.reviewBoundaryCalibrationCertificate)
    ) {
      throw new Error('convergence canary scope has a corrupt Review-boundary calibration certificate');
    }
    assertReviewBoundaryCalibrationCertificateMatchesScope(
      value.reviewBoundaryCalibrationCertificate as AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
      {
        runnerCommit: value.runnerCommit as string,
        environmentSha256: value.environmentSha256 as string,
        manifestSha256: value.manifestSha256 as string,
        modelId: value.modelId as string,
      },
    );
  }
  const executor = value.roles[0];
  const measurementRole = value.roles[1];
  if (hasNaturalAgentBoundary) {
    assertConvergenceExactKeys(
      executor,
      ['role', 'filesystemAccess', 'executions', 'tokenPolicy'],
      'convergence canary executor role',
    );
    assertConvergenceExactKeys(
      measurementRole,
      ['role', 'filesystemAccess', 'postHoc', 'feedbackToCandidate', 'tokenPolicy'],
      'convergence canary Judge role',
    );
    if (
      executor.role !== 'executor' ||
      executor.filesystemAccess !== 'write' ||
      executor.executions !== 1 ||
      executor.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY ||
      measurementRole.role !== 'judge' ||
      measurementRole.filesystemAccess !== (hasReviewBoundaryRubric ? 'read' : 'write') ||
      measurementRole.postHoc !== true ||
      measurementRole.feedbackToCandidate !== false ||
      measurementRole.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY
    ) {
      throw new Error('convergence canary scope must bind one candidate episode and a non-intervening post-hoc Judge');
    }
    return;
  }
  assertConvergenceExactKeys(
    executor,
    ['role', 'filesystemAccess', 'rounds', 'sameRoleAcrossRounds', 'tokenPolicy'],
    'convergence canary executor role',
  );
  assertConvergenceExactKeys(
    measurementRole,
    ['role', 'filesystemAccess', 'rounds', 'freshIdentityPerRound', 'tokenPolicy'],
    'convergence canary reviewer role',
  );
  if (
    executor.role !== 'executor' ||
    executor.filesystemAccess !== 'write' ||
    JSON.stringify(executor.rounds) !== '[1,2]' ||
    executor.sameRoleAcrossRounds !== true ||
    executor.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY ||
    measurementRole.role !== 'reviewer' ||
    measurementRole.filesystemAccess !== (hasWritableReviewer ? 'write' : 'read') ||
    JSON.stringify(measurementRole.rounds) !== '[1,2]' ||
    measurementRole.freshIdentityPerRound !== true ||
    measurementRole.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY
  ) {
    throw new Error('convergence canary scope must bind the global executor and reviewer identity policy');
  }
}

function assertAdaptiveDevelopmentConvergenceCanaryResult(
  value: unknown,
  expectedBehaviorIds: readonly string[],
): asserts value is AdaptiveDevelopmentConvergenceCanaryResult {
  if (
    !isConvergenceRecord(value) ||
    !isConvergenceRecord(value.episode) ||
    !isConvergenceRecord(value.finalAdjudication)
  ) {
    throw new Error('convergence canary terminal result is invalid');
  }
  assertConvergenceExactKeys(
    value,
    ['schemaVersion', 'status', 'nonScoring', 'effectClaimEligible', 'episode', 'finalAdjudication'],
    'convergence canary terminal result',
  );
  if (
    value.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RESULT_VERSION ||
    value.status !== 'diagnostic_complete' ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false
  ) {
    throw new Error('convergence canary terminal result is invalid');
  }
  const episode = value.episode;
  assertConvergenceExactKeys(
    episode,
    ['candidate', 'oracle', 'judge'],
    'convergence canary episode',
  );
  if (
    !isConvergenceRecord(episode.candidate) ||
    !isConvergenceRecord(episode.oracle) ||
    !isConvergenceRecord(episode.judge)
  ) {
    throw new Error('convergence canary episode evidence is invalid');
  }
  assertConvergenceCandidate(episode.candidate, 1);
  assertConvergenceOracle(episode.oracle);
  assertConvergenceJudge(episode.judge);
  const candidate = episode.candidate as unknown as AdaptiveDevelopmentConvergenceCandidate;
  const oracle = episode.oracle as unknown as AdaptiveDevelopmentConvergenceOracleResult;
  const judge = episode.judge as unknown as AdaptiveDevelopmentConvergenceJudgeResult;
  assertConvergenceCurrentCandidateEvidence(candidate);
  assertExactCandidateBinding(candidate, oracle, judge);
  if (JSON.stringify(oracle.checks.map((check) => check.id)) !== JSON.stringify(expectedBehaviorIds)) {
    throw new Error('convergence canary terminal result does not contain the complete approved behavior vector');
  }
  const expectedAdjudication = convergenceFinalAdjudication(candidate, oracle, judge);
  assertConvergenceExactKeys(
    value.finalAdjudication,
    [
      'taskCorrectnessPassed',
      'hardBoundariesPassed',
      'singleCandidateExecutionPassed',
      'candidateFrozenBeforeMeasurement',
      'postHocFeedbackAbsent',
      'repairRounds',
      'reviewBoundaryPassed',
      'outcomeCheckpointOracleConsistent',
      'structuralMeasurementValid',
      'calibrationCoverage',
      'overallSopCalibrationComplete',
    ],
    'convergence canary final adjudication',
  );
  if (JSON.stringify(value.finalAdjudication) !== JSON.stringify(expectedAdjudication)) {
    throw new Error('convergence canary final adjudication disagrees with terminal episode evidence');
  }
}

function assertAdaptiveDevelopmentConvergencePreReviewBoundaryResult(
  value: unknown,
  expectedBehaviorIds: readonly string[],
): asserts value is AdaptiveDevelopmentConvergencePreReviewBoundaryResult {
  if (
    !isConvergenceRecord(value) ||
    !isConvergenceRecord(value.episode) ||
    !isConvergenceRecord(value.finalAdjudication)
  ) {
    throw new Error('pre-Review-boundary convergence canary terminal result is invalid');
  }
  assertConvergenceExactKeys(
    value,
    ['schemaVersion', 'status', 'nonScoring', 'effectClaimEligible', 'episode', 'finalAdjudication'],
    'pre-Review-boundary convergence canary terminal result',
  );
  if (
    value.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_REVIEW_BOUNDARY_RESULT_VERSION ||
    (value.status !== 'passed' && value.status !== 'failed') ||
    value.nonScoring !== true ||
    value.effectClaimEligible !== false
  ) {
    throw new Error('pre-Review-boundary convergence canary terminal result is invalid');
  }
  const episode = value.episode;
  assertConvergenceExactKeys(
    episode,
    ['candidate', 'oracle', 'judge', 'externallyVerified'],
    'pre-Review-boundary convergence canary episode',
  );
  if (
    !isConvergenceRecord(episode.candidate) ||
    !isConvergenceRecord(episode.oracle) ||
    !isConvergenceRecord(episode.judge)
  ) {
    throw new Error('pre-Review-boundary convergence canary episode evidence is invalid');
  }
  assertConvergenceCandidate(episode.candidate, 1);
  assertConvergenceOracle(episode.oracle);
  assertConvergenceJudge(episode.judge, 'pre_review_boundary');
  const candidate = episode.candidate as unknown as AdaptiveDevelopmentConvergenceCandidate;
  const oracle = episode.oracle as unknown as AdaptiveDevelopmentConvergenceOracleResult;
  const judge = episode.judge as unknown as AdaptiveDevelopmentConvergencePreReviewBoundaryJudgeResult;
  assertConvergenceCurrentCandidateEvidence(candidate);
  assertExactCandidateBinding(candidate, oracle, judge);
  if (JSON.stringify(oracle.checks.map((check) => check.id)) !== JSON.stringify(expectedBehaviorIds)) {
    throw new Error('pre-Review-boundary result does not contain the complete approved behavior vector');
  }
  const judgePassed = preReviewBoundaryJudgePassed(candidate, judge);
  const hardInvariantsPassed = candidate.hardInvariantMisses.length === 0;
  const externallyVerified = oracle.passed && judgePassed && hardInvariantsPassed;
  if (episode.externallyVerified !== externallyVerified) {
    throw new Error('pre-Review-boundary result verification disagrees with its evidence');
  }
  assertConvergenceExactKeys(
    value.finalAdjudication,
    ['behaviorOraclePassed', 'sopJudgePassed', 'hardInvariantsPassed'],
    'pre-Review-boundary convergence canary final adjudication',
  );
  if (
    value.finalAdjudication.behaviorOraclePassed !== oracle.passed ||
    value.finalAdjudication.sopJudgePassed !== judgePassed ||
    value.finalAdjudication.hardInvariantsPassed !== hardInvariantsPassed ||
    value.status !== (externallyVerified ? 'passed' : 'failed')
  ) {
    throw new Error('pre-Review-boundary result adjudication disagrees with its evidence');
  }
}

function assertConvergenceCandidate(value: Record<string, unknown>, expectedRound: number): void {
  const hasCandidatePatchSha256 = 'candidatePatchSha256' in value;
  const hasCandidateDiffRef = 'candidateDiffRef' in value;
  const hasExecutorEpisode = 'executorEpisode' in value;
  const hasExecutorCheckpoint = 'executorCheckpoint' in value;
  const hasIndependentReview = 'independentReview' in value;
  assertConvergenceExactKeys(
    value,
    [
      'round',
      'candidateSha',
      ...(hasCandidatePatchSha256 ? ['candidatePatchSha256'] : []),
      ...(hasCandidateDiffRef ? ['candidateDiffRef'] : []),
      'executorRoleKey',
      'executorSessionId',
      ...(hasExecutorEpisode ? ['executorEpisode'] : []),
      ...(hasExecutorCheckpoint ? ['executorCheckpoint'] : []),
      ...(hasIndependentReview ? ['independentReview'] : []),
      'executorPrincipalId',
      'hardInvariantMisses',
    ],
    'convergence canary candidate',
  );
  if (
    value.round !== expectedRound ||
    (expectedRound !== 1 && expectedRound !== 2) ||
    typeof value.executorRoleKey !== 'string' ||
    !value.executorRoleKey ||
    typeof value.executorSessionId !== 'string' ||
    !value.executorSessionId ||
    typeof value.executorPrincipalId !== 'string' ||
    !value.executorPrincipalId ||
    !Array.isArray(value.hardInvariantMisses) ||
    value.hardInvariantMisses.some((miss) => typeof miss !== 'string' || !miss)
  ) {
    throw new Error('convergence canary candidate is invalid');
  }
  if (hasExecutorEpisode) assertConvergenceAgentEpisode(value.executorEpisode, value.executorSessionId as string);
  if (hasExecutorCheckpoint) assertConvergenceExecutorCheckpoint(value.executorCheckpoint);
  assertConvergenceSha1(value.candidateSha, 'convergence canary candidate');
  if (hasCandidatePatchSha256)
    assertConvergenceSha256(value.candidatePatchSha256, 'convergence canary candidate patch');
  if (hasCandidateDiffRef && (typeof value.candidateDiffRef !== 'string' || !value.candidateDiffRef)) {
    throw new Error('convergence canary candidate diff ref is invalid');
  }
  if (hasIndependentReview) {
    assertConvergenceIndependentReview(
      value.independentReview,
      value as unknown as AdaptiveDevelopmentConvergenceCandidate,
    );
  }
}

function assertConvergenceIndependentReview(value: unknown, candidate: AdaptiveDevelopmentConvergenceCandidate): void {
  if (!isConvergenceRecord(value) || !isConvergenceRecord(value.request) || !isConvergenceRecord(value.verdict)) {
    throw new Error('convergence canary independent Review observation is invalid');
  }
  assertConvergenceExactKeys(value, ['source', 'request', 'verdict'], 'convergence canary independent Review');
  assertConvergenceExactKeys(
    value.request,
    ['eventId', 'authorSessionId', 'candidateSha', 'candidateDiffRef', 'candidatePatchSha256'],
    'convergence canary independent Review request',
  );
  assertConvergenceExactKeys(
    value.verdict,
    [
      'eventId',
      'requestEventId',
      'reviewerSessionId',
      'reviewerPrincipalId',
      'candidateSha',
      'candidateDiffRef',
      'candidatePatchSha256',
      'state',
      'findings',
    ],
    'convergence canary independent Review verdict',
  );
  if (!isConvergenceRecord(value.verdict.findings)) {
    throw new Error('convergence canary independent Review finding counts are invalid');
  }
  assertConvergenceExactKeys(
    value.verdict.findings,
    ['p1', 'p2', 'p3'],
    'convergence canary independent Review finding counts',
  );
  const episode = candidate.executorEpisode;
  const exactRuntimeBinding =
    value.source === 'authenticated_runtime_observer' &&
    typeof value.request.eventId === 'string' &&
    Boolean(value.request.eventId) &&
    value.request.authorSessionId === candidate.executorSessionId &&
    typeof value.verdict.eventId === 'string' &&
    Boolean(value.verdict.eventId) &&
    value.verdict.eventId !== value.request.eventId &&
    value.verdict.requestEventId === value.request.eventId &&
    typeof value.verdict.reviewerSessionId === 'string' &&
    episode?.childSessionIds.includes(value.verdict.reviewerSessionId) === true &&
    value.verdict.reviewerSessionId !== candidate.executorSessionId &&
    typeof value.verdict.reviewerPrincipalId === 'string' &&
    Boolean(value.verdict.reviewerPrincipalId) &&
    value.verdict.reviewerPrincipalId !== candidate.executorPrincipalId;
  const exactReviewUnit =
    value.request.candidateSha === candidate.candidateSha &&
    value.verdict.candidateSha === candidate.candidateSha &&
    value.request.candidateDiffRef === candidate.candidateDiffRef &&
    value.verdict.candidateDiffRef === candidate.candidateDiffRef &&
    value.request.candidatePatchSha256 === candidate.candidatePatchSha256 &&
    value.verdict.candidatePatchSha256 === candidate.candidatePatchSha256;
  const findings = value.verdict.findings;
  const validVerdict =
    (value.verdict.state === 'approved' || value.verdict.state === 'changes_requested') &&
    ['p1', 'p2', 'p3'].every((key) => Number.isInteger(findings[key]) && (findings[key] as number) >= 0);
  if (!exactRuntimeBinding || !exactReviewUnit || !validVerdict) {
    throw new Error('convergence canary independent Review must bind an authenticated exact Review Unit');
  }
}

function assertConvergenceExecutorCheckpoint(value: unknown): void {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary Outcome Checkpoint is invalid');
  assertConvergenceExactKeys(
    value,
    ['claimed', 'summary', 'verificationCommands', 'reviewIntent', 'reviewState', 'reviewUnit'],
    'convergence canary Outcome Checkpoint',
  );
  if (
    !['achieved', 'not_achieved', 'deferred'].includes(value.claimed as string) ||
    typeof value.summary !== 'string' ||
    !value.summary.trim() ||
    !Array.isArray(value.verificationCommands) ||
    value.verificationCommands.some((command) => typeof command !== 'string') ||
    !['local_result', 'formal_review', 'delivery'].includes(value.reviewIntent as string) ||
    !['pending', 'in_review', 'changes_requested', 'reviewed', 'stale'].includes(value.reviewState as string) ||
    typeof value.reviewUnit !== 'string' ||
    !value.reviewUnit.trim()
  ) {
    throw new Error('convergence canary Outcome Checkpoint is invalid');
  }
}

function assertConvergenceAgentEpisode(value: unknown, rootSessionId: string): void {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary agent episode is invalid');
  assertConvergenceExactKeys(
    value,
    ['mode', 'rootSessionId', 'childSessionIds', 'collaborationToolCalls'],
    'convergence canary agent episode',
  );
  if (
    value.mode !== 'natural_agent_graph' ||
    value.rootSessionId !== rootSessionId ||
    !Array.isArray(value.childSessionIds) ||
    value.childSessionIds.some((id) => typeof id !== 'string' || !id || id === rootSessionId) ||
    new Set(value.childSessionIds).size !== value.childSessionIds.length ||
    !Number.isInteger(value.collaborationToolCalls) ||
    (value.collaborationToolCalls as number) < 0
  ) {
    throw new Error('convergence canary agent episode is invalid');
  }
}

function assertConvergenceOracle(value: Record<string, unknown>): void {
  assertConvergenceExactKeys(value, ['candidateSha', 'passed', 'checks'], 'convergence canary oracle');
  assertConvergenceSha1(value.candidateSha, 'convergence canary oracle candidate');
  if (typeof value.passed !== 'boolean' || !Array.isArray(value.checks) || value.checks.length === 0) {
    throw new Error('convergence canary oracle behavior vector is invalid');
  }
  const behaviorIds = new Set<string>();
  for (const check of value.checks) {
    if (!isConvergenceRecord(check)) throw new Error('convergence canary oracle behavior check is invalid');
    assertConvergenceExactKeys(check, ['id', 'passed'], 'convergence canary oracle behavior check');
    if (typeof check.id !== 'string' || !check.id || typeof check.passed !== 'boolean' || behaviorIds.has(check.id)) {
      throw new Error('convergence canary oracle behavior vector must contain unique named checks');
    }
    behaviorIds.add(check.id);
  }
}

function assertConvergenceJudge(
  value: Record<string, unknown>,
  verdictPolicy: 'review_boundary' | 'pre_review_boundary' = 'review_boundary',
): void {
  assertConvergenceExactKeys(
    value,
    [
      'candidateSha',
      'judgeSessionId',
      'judgePrincipalId',
      'judgeRoleKey',
      'verdict',
      'reviewDemand',
      'observedReviewState',
      'findings',
    ],
    'convergence canary post-hoc Judge',
  );
  assertConvergenceSha1(value.candidateSha, 'convergence canary Judge candidate');
  if (
    typeof value.judgeSessionId !== 'string' ||
    !value.judgeSessionId ||
    typeof value.judgePrincipalId !== 'string' ||
    !value.judgePrincipalId ||
    typeof value.judgeRoleKey !== 'string' ||
    !value.judgeRoleKey ||
    (verdictPolicy === 'review_boundary'
      ? value.verdict !== 'review_boundary_compliant' && value.verdict !== 'review_boundary_noncompliant'
      : value.verdict !== 'sop_compliant' && value.verdict !== 'sop_noncompliant') ||
    !['required', 'not_required', 'indeterminate'].includes(value.reviewDemand as string) ||
    !['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown'].includes(
      value.observedReviewState as string,
    ) ||
    !Array.isArray(value.findings)
  ) {
    throw new Error('convergence canary post-hoc Judge is invalid');
  }
  for (const finding of value.findings) {
    if (!isConvergenceRecord(finding)) throw new Error('convergence canary Judge finding is invalid');
    assertConvergenceExactKeys(
      finding,
      ['severity', 'summary', ...('evidence' in finding ? ['evidence'] : [])],
      'convergence canary Judge finding',
    );
    if (
      !['P1', 'P2', 'P3'].includes(finding.severity as string) ||
      typeof finding.summary !== 'string' ||
      !finding.summary
    ) {
      throw new Error('convergence canary Judge finding is invalid');
    }
    if ('evidence' in finding) assertConvergenceFindingEvidence(finding.evidence);
  }
}

function assertConvergenceFindingEvidence(
  value: unknown,
): asserts value is AdaptiveDevelopmentConvergenceFindingEvidence {
  if (!isConvergenceRecord(value)) throw new Error('convergence canary Judge finding evidence is invalid');
  assertConvergenceExactKeys(
    value,
    ['kind', 'command', 'expected', 'actual', 'location', 'reasoning'],
    'convergence canary Judge finding evidence',
  );
  const hasStringFields = ['command', 'expected', 'actual', 'location', 'reasoning'].every(
    (key) => typeof value[key] === 'string',
  );
  const validTestFailure =
    value.kind === 'test_failure' &&
    Boolean(value.command) &&
    Boolean(value.expected) &&
    Boolean(value.actual) &&
    value.location === '' &&
    value.reasoning === '';
  const validStaticProof =
    value.kind === 'static_proof' &&
    value.command === '' &&
    value.expected === '' &&
    value.actual === '' &&
    Boolean(value.location) &&
    Boolean(value.reasoning);
  if (!hasStringFields || (!validTestFailure && !validStaticProof)) {
    throw new Error('convergence canary Judge finding evidence is invalid');
  }
}

function assertConvergenceUsage(
  value: unknown,
  role: 'executor' | 'judge',
  sessionId: string,
  expectedSessionIds: readonly string[],
): asserts value is AdaptiveDevelopmentConvergenceCanaryUsage {
  if (!isConvergenceRecord(value)) throw new Error(`convergence canary receipt is missing ${role} usage`);
  assertConvergenceExactKeys(
    value,
    [
      'role',
      'sessionId',
      'accountedSessionIds',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'toolCalls',
      'failedToolCalls',
      'usageObserved',
    ],
    `convergence canary ${role} usage`,
  );
  if (
    value.role !== role ||
    value.sessionId !== sessionId ||
    !Array.isArray(value.accountedSessionIds) ||
    new Set(value.accountedSessionIds).size !== value.accountedSessionIds.length ||
    JSON.stringify([...value.accountedSessionIds].sort()) !== JSON.stringify([...expectedSessionIds].sort()) ||
    value.usageObserved !== true ||
    !['inputTokens', 'cachedInputTokens', 'outputTokens', 'toolCalls', 'failedToolCalls'].every(
      (key) => Number.isInteger(value[key]) && (value[key] as number) >= 0,
    )
  ) {
    throw new Error(`convergence canary ${role} usage is invalid`);
  }
}

function assertLegacyConvergenceUsage(
  value: unknown,
  round: number,
  role: 'executor' | 'reviewer',
  sessionId: string,
): void {
  if (!isConvergenceRecord(value)) throw new Error(`historical convergence receipt is missing ${role} usage`);
  assertConvergenceExactKeys(
    value,
    [
      'round',
      'role',
      'sessionId',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'toolCalls',
      'failedToolCalls',
      'usageObserved',
    ],
    `historical convergence ${role} usage`,
  );
  if (
    value.round !== round ||
    value.role !== role ||
    value.sessionId !== sessionId ||
    value.usageObserved !== true ||
    !['inputTokens', 'cachedInputTokens', 'outputTokens', 'toolCalls', 'failedToolCalls'].every(
      (key) => Number.isInteger(value[key]) && (value[key] as number) >= 0,
    )
  ) {
    throw new Error(`historical convergence ${role} usage is invalid`);
  }
}

function assertConvergenceBehaviorIds(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((behaviorId) => typeof behaviorId !== 'string' || !behaviorId) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`${label} behavior ids must be non-empty and unique`);
  }
  return value as string[];
}

function assertConvergenceExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains an unexpected field`);
  }
}

function assertConvergenceSha1(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new Error(`${label} is invalid`);
}

function assertConvergenceSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`);
}

function isConvergenceRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
