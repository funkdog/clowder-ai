import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fingerprintAdaptiveDevelopmentBenchmark } from './adaptive-development-benchmark-contract.js';

export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_RUBRIC_VERSION =
  'lf-0001.development-convergence-review-boundary-rubric.v3' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SUITE_VERSION =
  'lf-0001.development-convergence-review-boundary-gold-suite.v4' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_CERTIFICATE_VERSION =
  'lf-0001.development-convergence-review-boundary-calibration-certificate.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_SCOPE_VERSION =
  'lf-0001.development-convergence-review-boundary-calibration-scope.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_PLAN_VERSION =
  'lf-0001.development-convergence-review-boundary-calibration-plan.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_CONTRACT_VERSION =
  'lf-0001.development-convergence-production-review-boundary-judge.v2' as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_TRIALS = 2 as const;
export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SCENARIOS = [
  'no_review_demand',
  'exact_candidate_review',
  'missing_review',
  'stale_candidate',
  'sha_mismatch',
  'diff_mismatch',
  'patch_mismatch',
  'self_review',
  'non_child_reviewer',
  'changes_requested',
  'manufactured_review_without_demand',
  'moving_candidate_pending',
  'indeterminate_demand',
] as const;

const NonEmptyStringSchema = z.string().trim().min(1);
const GoldCaseIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const DiffRefSchema = z.string().regex(/^[a-f0-9]{40}\.\.[a-f0-9]{40}$/);
const ReviewDemandSchema = z.enum(['required', 'not_required', 'indeterminate']);
const ReviewStateSchema = z.enum(['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown']);
const VerdictSchema = z.enum(['review_boundary_compliant', 'review_boundary_noncompliant']);
const CalibratedDimensionSchema = z.enum(['review_demand', 'review_state', 'authenticated_exact_candidate_review']);
const FindingCountsSchema = z
  .object({
    p1: z.number().int().nonnegative(),
    p2: z.number().int().nonnegative(),
    p3: z.number().int().nonnegative(),
  })
  .strict();
const UsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    failedToolCalls: z.number().int().nonnegative(),
    usageObserved: z.literal(true),
  })
  .strict();

const MetricBirthCertificateSchema = z
  .object({
    utilityClaim: NonEmptyStringSchema,
    estimator: NonEmptyStringSchema,
    validityBounds: z.array(NonEmptyStringSchema).min(1),
    consumer: NonEmptyStringSchema,
    calibrationPlan: NonEmptyStringSchema,
    repeatabilityContract: NonEmptyStringSchema,
  })
  .strict();

const RuleSchema = z.object({ id: NonEmptyStringSchema, rule: NonEmptyStringSchema }).strict();

const ConvergenceReviewBoundaryRubricSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_RUBRIC_VERSION),
    rubricId: NonEmptyStringSchema,
    calibratedDimensions: z
      .tuple([z.literal('review_demand'), z.literal('review_state'), z.literal('authenticated_exact_candidate_review')])
      .readonly(),
    excludedClaims: z.array(NonEmptyStringSchema).min(1),
    metricBirthCertificate: MetricBirthCertificateSchema,
    reviewDemandPolicy: z
      .object({
        requiredWhen: z.array(RuleSchema).min(1),
        notRequiredWhen: NonEmptyStringSchema,
        indeterminateWhen: NonEmptyStringSchema,
        nonTriggers: z.array(NonEmptyStringSchema).min(1),
      })
      .strict(),
    reviewStatePolicy: z
      .object({
        requiredAndStable: NonEmptyStringSchema,
        requiredButMoving: NonEmptyStringSchema,
        notRequired: NonEmptyStringSchema,
        indeterminate: NonEmptyStringSchema,
      })
      .strict(),
    findingPolicy: z
      .object({
        precedence: z
          .tuple([
            RuleSchema.extend({ id: z.literal('claimed_reviewed_without_authenticated_review') }),
            RuleSchema.extend({ id: z.literal('review_boundary_failure_without_false_reviewed_claim') }),
          ])
          .readonly(),
        p1: NonEmptyStringSchema,
        p2: NonEmptyStringSchema,
        p3: NonEmptyStringSchema,
        passRule: NonEmptyStringSchema,
      })
      .strict(),
    evidencePolicy: z
      .object({
        allowed: z.array(NonEmptyStringSchema).min(1),
        forbiddenInferences: z.array(NonEmptyStringSchema).min(1),
      })
      .strict(),
  })
  .strict();

const ConvergenceReviewBoundaryGoldExpectedSchema = z
  .object({
    reviewDemand: ReviewDemandSchema,
    observedReviewState: ReviewStateSchema,
    verdict: VerdictSchema,
    findings: FindingCountsSchema,
  })
  .strict();

const ConvergenceReviewBoundaryIndependentReviewSchema = z
  .object({
    source: z.literal('authenticated_runtime_observer'),
    request: z
      .object({
        eventId: NonEmptyStringSchema,
        authorSessionId: NonEmptyStringSchema,
        candidateSha: Sha1Schema,
        candidateDiffRef: DiffRefSchema,
        candidatePatchSha256: Sha256Schema,
      })
      .strict(),
    verdict: z
      .object({
        eventId: NonEmptyStringSchema,
        requestEventId: NonEmptyStringSchema,
        reviewerSessionId: NonEmptyStringSchema,
        reviewerPrincipalId: NonEmptyStringSchema,
        candidateSha: Sha1Schema,
        candidateDiffRef: DiffRefSchema,
        candidatePatchSha256: Sha256Schema,
        state: z.enum(['approved', 'changes_requested']),
        findings: FindingCountsSchema,
      })
      .strict(),
  })
  .strict();

const CandidateIdentitySchema = z
  .object({ finalSha: Sha1Schema, diffRef: DiffRefSchema, patchSha256: Sha256Schema })
  .strict();

const ConvergenceReviewBoundaryJudgeContextBaseSchema = z
  .object({
    candidateIdentity: CandidateIdentitySchema,
    taskInput: z.record(z.unknown()),
    scope: z
      .object({
        allowedChangedPaths: z.array(NonEmptyStringSchema),
        observedChangedPaths: z.array(NonEmptyStringSchema),
      })
      .strict(),
    episodeCheckpoint: z
      .object({
        claimed: z.enum(['achieved', 'not_achieved', 'deferred']),
        summary: NonEmptyStringSchema,
        verificationCommands: z.array(z.string()),
        reviewIntent: z.enum(['local_result', 'formal_review', 'delivery']),
        reviewState: z.enum(['pending', 'in_review', 'changes_requested', 'reviewed', 'stale']),
        reviewUnit: NonEmptyStringSchema,
      })
      .strict(),
    agentEpisode: z
      .object({
        mode: z.literal('natural_agent_graph'),
        rootSessionId: NonEmptyStringSchema,
        childSessionIds: z.array(NonEmptyStringSchema),
        collaborationToolCalls: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const ConvergenceReviewBoundaryReviewEvidenceSchema = z
  .object({
    schemaVersion: z.literal('lf-0001.runner-authenticated-review-observation.v1'),
    observed: z.boolean(),
    independentReview: ConvergenceReviewBoundaryIndependentReviewSchema.nullable(),
  })
  .strict();

const ConvergenceReviewBoundaryJudgeProjectionSchema = z
  .object({
    candidatePatch: NonEmptyStringSchema,
    judgeContext: ConvergenceReviewBoundaryJudgeContextBaseSchema.extend({
      reviewEvidence: ConvergenceReviewBoundaryReviewEvidenceSchema,
    }).strict(),
  })
  .strict();

const ConvergenceReviewBoundaryGoldProjectionSchema = z
  .object({
    candidatePatch: NonEmptyStringSchema,
    judgeContext: ConvergenceReviewBoundaryJudgeContextBaseSchema,
  })
  .strict();

const ConvergenceReviewBoundaryObserverFixtureSchema = z
  .object({
    candidate: CandidateIdentitySchema,
    graph: z
      .object({
        rootSessionId: NonEmptyStringSchema,
        childSessionIds: z.array(NonEmptyStringSchema),
        collaborationToolCalls: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        cachedInputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        toolCalls: z.number().int().nonnegative(),
        failedToolCalls: z.number().int().nonnegative(),
        behavioralFailedToolCalls: z.number().int().nonnegative(),
        infrastructureFailedToolCalls: z.number().int().nonnegative(),
        usageComplete: z.literal(true),
        accountedSessionIds: z.array(NonEmptyStringSchema),
      })
      .strict(),
    executorEvents: z.array(z.record(z.unknown())),
  })
  .strict();

const ConvergenceReviewBoundaryGoldSuiteSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SUITE_VERSION),
    suiteId: NonEmptyStringSchema,
    rubricId: NonEmptyStringSchema,
    cases: z
      .array(
        z
          .object({
            id: GoldCaseIdSchema,
            scenario: z.enum(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SCENARIOS),
            projection: ConvergenceReviewBoundaryGoldProjectionSchema,
            observerFixture: ConvergenceReviewBoundaryObserverFixtureSchema,
            expected: ConvergenceReviewBoundaryGoldExpectedSchema,
          })
          .strict(),
      )
      .length(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SCENARIOS.length),
  })
  .strict();

const ConvergenceReviewBoundaryCalibrationScopeSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_SCOPE_VERSION),
    runnerCommit: Sha1Schema,
    environmentSha256: Sha256Schema,
    manifestSha256: Sha256Schema,
    modelId: NonEmptyStringSchema,
    judgeContractVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_CONTRACT_VERSION),
    rubricSha256: Sha256Schema,
    rubric: ConvergenceReviewBoundaryRubricSchema,
    goldSuiteSha256: Sha256Schema,
    goldSuite: ConvergenceReviewBoundaryGoldSuiteSchema,
    trials: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_TRIALS),
    tokenPolicy: z.literal('unbounded'),
    nonScoring: z.literal(true),
    effectClaimEligible: z.literal(false),
  })
  .strict();

const ConvergenceReviewBoundaryCalibrationAuthorizationSchema = z
  .object({
    kind: z.literal('operator_approval'),
    approvalRef: z.string().regex(/^cat-cafe:\/\/message\/[A-Za-z0-9-]+$/),
    approvalMessageSha256: Sha256Schema,
    approvedCalibrationScopeSha256: Sha256Schema,
    approvedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const ConvergenceReviewBoundaryCalibrationPlanSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_PLAN_VERSION),
    calibrationScopeSha256: Sha256Schema,
    scope: ConvergenceReviewBoundaryCalibrationScopeSchema,
    authorization: ConvergenceReviewBoundaryCalibrationAuthorizationSchema,
  })
  .strict();

const ConvergenceReviewBoundaryCalibrationClassificationSchema = ConvergenceReviewBoundaryGoldExpectedSchema.extend({
  caseId: NonEmptyStringSchema,
}).strict();

const ConvergenceReviewBoundaryCalibrationCaseRunSchema = z
  .object({
    caseId: NonEmptyStringSchema,
    sessionId: NonEmptyStringSchema,
    classification: ConvergenceReviewBoundaryGoldExpectedSchema,
    usage: UsageSchema,
  })
  .strict();

const ConvergenceReviewBoundaryCalibrationTrialSchema = z
  .object({ caseRuns: z.array(ConvergenceReviewBoundaryCalibrationCaseRunSchema).min(1) })
  .strict();

const ConvergenceReviewBoundaryCalibrationCertificateSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_CERTIFICATE_VERSION),
    status: z.literal('calibrated'),
    nonScoring: z.literal(true),
    effectClaimEligible: z.literal(false),
    runnerCommit: Sha1Schema,
    environmentSha256: Sha256Schema,
    manifestSha256: Sha256Schema,
    modelId: NonEmptyStringSchema,
    judgeContractVersion: z.literal(ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_CONTRACT_VERSION),
    rubricSha256: Sha256Schema,
    goldSuiteSha256: Sha256Schema,
    calibratedDimensions: z
      .tuple([z.literal('review_demand'), z.literal('review_state'), z.literal('authenticated_exact_candidate_review')])
      .readonly(),
    calibrationScopeSha256: Sha256Schema,
    calibrationPlanSha256: Sha256Schema,
    trials: z
      .tuple([ConvergenceReviewBoundaryCalibrationTrialSchema, ConvergenceReviewBoundaryCalibrationTrialSchema])
      .readonly(),
  })
  .strict();

export type AdaptiveDevelopmentConvergenceReviewBoundaryRubric = z.infer<typeof ConvergenceReviewBoundaryRubricSchema>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryJudgeProjection = z.infer<
  typeof ConvergenceReviewBoundaryJudgeProjectionSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite = z.infer<
  typeof ConvergenceReviewBoundaryGoldSuiteSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryGoldExpected = z.infer<
  typeof ConvergenceReviewBoundaryGoldExpectedSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope = z.infer<
  typeof ConvergenceReviewBoundaryCalibrationScopeSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan = z.infer<
  typeof ConvergenceReviewBoundaryCalibrationPlanSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationClassification = z.infer<
  typeof ConvergenceReviewBoundaryCalibrationClassificationSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial = z.infer<
  typeof ConvergenceReviewBoundaryCalibrationTrialSchema
>;
export type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate = z.infer<
  typeof ConvergenceReviewBoundaryCalibrationCertificateSchema
>;

export function parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(
  value: unknown,
): AdaptiveDevelopmentConvergenceReviewBoundaryRubric {
  const rubric = ConvergenceReviewBoundaryRubricSchema.parse(value);
  assertUnique(
    rubric.reviewDemandPolicy.requiredWhen.map((rule) => rule.id),
    'Judge rubric required condition',
  );
  assertUnique(rubric.reviewDemandPolicy.nonTriggers, 'Judge rubric non-trigger');
  assertUnique(rubric.evidencePolicy.allowed, 'Judge rubric allowed evidence');
  assertUnique(rubric.excludedClaims, 'Review-boundary excluded claim');
  rubric.calibratedDimensions.forEach((dimension) => {
    CalibratedDimensionSchema.parse(dimension);
  });
  return rubric;
}

function assertReviewBoundaryClassificationInvariant(
  classification: Pick<
    AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationClassification,
    'findings' | 'reviewDemand' | 'verdict'
  >,
  label: string,
): void {
  const blockingFindings = classification.findings.p1 + classification.findings.p2;
  if (classification.verdict === 'review_boundary_compliant' && blockingFindings > 0) {
    throw new Error(`${label} is compliant with a blocking finding`);
  }
  if (classification.reviewDemand === 'indeterminate' && classification.findings.p2 === 0) {
    throw new Error(`${label} has indeterminate Review demand without a P2 finding`);
  }
  if (classification.verdict === 'review_boundary_noncompliant' && blockingFindings === 0) {
    throw new Error(`${label} is noncompliant without a blocking finding`);
  }
}

export function parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(
  value: unknown,
  rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
): AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite {
  const suite = ConvergenceReviewBoundaryGoldSuiteSchema.parse(value);
  if (suite.rubricId !== rubric.rubricId) throw new Error('Judge gold suite does not bind the exact rubric id');
  assertUnique(
    suite.cases.map((entry) => entry.id),
    'Judge gold case',
  );
  assertUnique(
    suite.cases.map((entry) => entry.scenario),
    'Judge gold scenario',
  );
  if (
    JSON.stringify([...suite.cases.map((entry) => entry.scenario)].sort()) !==
    JSON.stringify([...ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_GOLD_SCENARIOS].sort())
  ) {
    throw new Error('Judge gold suite does not cover every required production evidence scenario');
  }
  for (const entry of suite.cases) {
    const { candidateIdentity, agentEpisode } = entry.projection.judgeContext;
    const { candidate, graph } = entry.observerFixture;
    assertReviewBoundaryClassificationInvariant(entry.expected, `Judge gold case ${entry.id}`);
    if (
      candidateIdentity.patchSha256 !== fingerprintRawText(entry.projection.candidatePatch) ||
      !candidateIdentity.diffRef.endsWith(`..${candidateIdentity.finalSha}`) ||
      JSON.stringify(candidate) !== JSON.stringify(candidateIdentity)
    ) {
      throw new Error(`Judge gold case ${entry.id} does not bind its exact candidate patch and identity`);
    }
    if (
      graph.rootSessionId !== agentEpisode.rootSessionId ||
      JSON.stringify(graph.childSessionIds) !== JSON.stringify(agentEpisode.childSessionIds) ||
      graph.collaborationToolCalls !== agentEpisode.collaborationToolCalls ||
      JSON.stringify([...graph.accountedSessionIds].sort()) !==
        JSON.stringify([...new Set([graph.rootSessionId, ...graph.childSessionIds])].sort())
    ) {
      throw new Error(`Judge gold case ${entry.id} does not bind its raw observer graph to the Judge projection`);
    }
  }
  const expected = suite.cases.map((entry) => entry.expected);
  const covers = (match: (entry: AdaptiveDevelopmentConvergenceReviewBoundaryGoldExpected) => boolean) =>
    expected.some(match);
  if (
    !covers(
      (entry) =>
        entry.reviewDemand === 'not_required' &&
        entry.observedReviewState === 'pending' &&
        entry.verdict === 'review_boundary_compliant',
    ) ||
    !covers(
      (entry) =>
        entry.reviewDemand === 'required' &&
        entry.observedReviewState === 'reviewed' &&
        entry.verdict === 'review_boundary_compliant',
    ) ||
    !covers(
      (entry) =>
        entry.reviewDemand === 'required' &&
        entry.observedReviewState === 'pending' &&
        entry.verdict === 'review_boundary_noncompliant',
    ) ||
    !covers((entry) => entry.reviewDemand === 'indeterminate' && entry.verdict === 'review_boundary_noncompliant') ||
    !covers(
      (entry) =>
        entry.reviewDemand === 'not_required' &&
        entry.observedReviewState === 'reviewed' &&
        entry.verdict === 'review_boundary_noncompliant',
    )
  ) {
    throw new Error('Judge gold suite does not cover the required Review-demand and review-state boundaries');
  }
  return suite;
}

export function buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope(input: {
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly modelId: string;
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
}): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope {
  const rubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(input.rubric);
  const goldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(input.goldSuite, rubric);
  return parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope({
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_SCOPE_VERSION,
    runnerCommit: input.runnerCommit,
    environmentSha256: input.environmentSha256,
    manifestSha256: input.manifestSha256,
    modelId: input.modelId,
    judgeContractVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_CONTRACT_VERSION,
    rubricSha256: fingerprintAdaptiveDevelopmentBenchmark(rubric),
    rubric,
    goldSuiteSha256: fingerprintAdaptiveDevelopmentBenchmark(goldSuite),
    goldSuite,
    trials: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_TRIALS,
    tokenPolicy: 'unbounded',
    nonScoring: true,
    effectClaimEligible: false,
  });
}

export function parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope(
  value: unknown,
): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope {
  const scope = ConvergenceReviewBoundaryCalibrationScopeSchema.parse(value);
  const rubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(scope.rubric);
  const goldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(scope.goldSuite, rubric);
  if (
    scope.rubricSha256 !== fingerprintAdaptiveDevelopmentBenchmark(rubric) ||
    scope.goldSuiteSha256 !== fingerprintAdaptiveDevelopmentBenchmark(goldSuite)
  ) {
    throw new Error('Review-boundary calibration scope does not bind the exact rubric and gold suite');
  }
  return scope;
}

export function buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective(
  scope: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  authority: {
    readonly operatorUserId: string;
    readonly threadId: string;
    readonly messageStoreIdentitySha256: string;
    readonly runtimeInstanceIdentitySha256: string;
  },
): string {
  const exactScope = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope(scope);
  if (!authority.operatorUserId || !authority.threadId)
    throw new Error('Review-boundary calibration authority is invalid');
  Sha256Schema.parse(authority.messageStoreIdentitySha256);
  Sha256Schema.parse(authority.runtimeInstanceIdentitySha256);
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(exactScope);
  return [
    'APPROVE_ADAPTIVE_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION',
    `scope_sha256=${scopeSha256}`,
    `operator_user_id=${authority.operatorUserId}`,
    `thread_id=${authority.threadId}`,
    `message_store_identity_sha256=${authority.messageStoreIdentitySha256}`,
    `runtime_instance_identity_sha256=${authority.runtimeInstanceIdentitySha256}`,
    `rubric_sha256=${exactScope.rubricSha256}`,
    `gold_suite_sha256=${exactScope.goldSuiteSha256}`,
    `judge_contract_version=${exactScope.judgeContractVersion}`,
    `trials=${exactScope.trials}`,
    `cases_per_trial=${exactScope.goldSuite.cases.length}`,
    `total_judge_sessions=${exactScope.trials * exactScope.goldSuite.cases.length}`,
    'token_policy=unbounded',
    'non_scoring=true',
  ].join(' ');
}

export function parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan(
  value: unknown,
): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan {
  const plan = ConvergenceReviewBoundaryCalibrationPlanSchema.parse(value);
  const scope = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope(plan.scope);
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  if (
    plan.calibrationScopeSha256 !== scopeSha256 ||
    plan.authorization.approvedCalibrationScopeSha256 !== scopeSha256
  ) {
    throw new Error('Review-boundary calibration plan is not bound to one exact approved scope');
  }
  return plan;
}

export function buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(input: {
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly manifestSha256: string;
  readonly modelId: string;
  readonly calibrationScopeSha256: string;
  readonly calibrationPlanSha256: string;
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
  readonly trials: readonly [
    AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial,
    AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial,
  ];
}): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate {
  const certificate = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_CERTIFICATE_VERSION,
    status: 'calibrated',
    nonScoring: true,
    effectClaimEligible: false,
    runnerCommit: input.runnerCommit,
    environmentSha256: input.environmentSha256,
    manifestSha256: input.manifestSha256,
    modelId: input.modelId,
    judgeContractVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_CONTRACT_VERSION,
    calibrationScopeSha256: input.calibrationScopeSha256,
    calibrationPlanSha256: input.calibrationPlanSha256,
    rubricSha256: fingerprintAdaptiveDevelopmentBenchmark(input.rubric),
    goldSuiteSha256: fingerprintAdaptiveDevelopmentBenchmark(input.goldSuite),
    calibratedDimensions: input.rubric.calibratedDimensions,
    trials: input.trials,
  } as const;
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(certificate, input.rubric, input.goldSuite);
  return certificate;
}

export function assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
  value: unknown,
  rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
): asserts value is AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate {
  const certificate = ConvergenceReviewBoundaryCalibrationCertificateSchema.parse(value);
  if (
    certificate.rubricSha256 !== fingerprintAdaptiveDevelopmentBenchmark(rubric) ||
    certificate.goldSuiteSha256 !== fingerprintAdaptiveDevelopmentBenchmark(goldSuite) ||
    JSON.stringify(certificate.calibratedDimensions) !== JSON.stringify(rubric.calibratedDimensions)
  ) {
    throw new Error('Review-boundary calibration certificate does not bind the exact rubric and gold suite');
  }
  const sessionIds = certificate.trials.flatMap((trial) => trial.caseRuns.map((caseRun) => caseRun.sessionId));
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw new Error('Review-boundary calibration requires independent per-case session identities');
  }
  for (const entry of goldSuite.cases) {
    assertReviewBoundaryClassificationInvariant(entry.expected, `Judge gold case ${entry.id}`);
  }
  for (const [trialIndex, trial] of certificate.trials.entries()) {
    assertUnique(
      trial.caseRuns.map((entry) => entry.caseId),
      `Review-boundary calibration trial ${trialIndex + 1} case`,
    );
    for (const entry of trial.caseRuns) {
      assertReviewBoundaryClassificationInvariant(
        entry.classification,
        `Review-boundary calibration trial ${trialIndex + 1} case ${entry.caseId}`,
      );
    }
    const actual = trial.caseRuns.map((entry) =>
      normalizeCalibrationClassification({ caseId: entry.caseId, ...entry.classification }),
    );
    const expected = goldSuite.cases.map((entry) =>
      normalizeCalibrationClassification({ caseId: entry.id, ...entry.expected }),
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Review-boundary calibration trial ${trialIndex + 1} disagrees with the human-gold suite`);
    }
  }
}

export function assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope(
  value: unknown,
  scope: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  calibrationPlanSha256: string,
): asserts value is AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate {
  const exactScope = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope(scope);
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
    value,
    exactScope.rubric,
    exactScope.goldSuite,
  );
  const certificate = value as AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate;
  if (
    certificate.runnerCommit !== exactScope.runnerCommit ||
    certificate.environmentSha256 !== exactScope.environmentSha256 ||
    certificate.manifestSha256 !== exactScope.manifestSha256 ||
    certificate.modelId !== exactScope.modelId ||
    certificate.judgeContractVersion !== exactScope.judgeContractVersion ||
    certificate.calibrationScopeSha256 !== fingerprintAdaptiveDevelopmentBenchmark(exactScope) ||
    certificate.calibrationPlanSha256 !== calibrationPlanSha256
  ) {
    throw new Error('Review-boundary calibration certificate does not bind the exact authorized calibration execution');
  }
}

function normalizeCalibrationClassification(
  value: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationClassification,
): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationClassification {
  return {
    caseId: value.caseId,
    reviewDemand: value.reviewDemand,
    observedReviewState: value.observedReviewState,
    verdict: value.verdict,
    findings: { p1: value.findings.p1, p2: value.findings.p2, p3: value.findings.p3 },
  };
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} ids must be unique`);
}

function fingerprintRawText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
