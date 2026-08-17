import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ADAPTIVE_DEVELOPMENT_BENCHMARK_MANIFEST_VERSION = 'lf-0001.development-benchmark-manifest.v5' as const;
export const ADAPTIVE_DEVELOPMENT_BENCHMARK_RECEIPT_VERSION = 'lf-0001.development-benchmark-receipt.v1' as const;
export const ADAPTIVE_DEVELOPMENT_BENCHMARK_EVIDENCE_VERSION = 'lf-0001.development-benchmark-evidence.v4' as const;
export const ADAPTIVE_DEVELOPMENT_BENCHMARK_ARTIFACT_VERSION = 'lf-0001.development-benchmark-artifact.v2' as const;
export const ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_SCOPE_VERSION =
  'lf-0001.development-benchmark-launch-scope.v3' as const;
export const ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_PLAN_VERSION =
  'lf-0001.development-benchmark-launch-plan.v4' as const;
export const ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_SCOPE_VERSION = 'lf-0001.stage-admission-scope.v4' as const;
export const ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_RESULT_VERSION = 'lf-0001.stage-admission-result.v3' as const;
export const ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_BINDING_VERSION = 'lf-0001.stage-admission-binding.v4' as const;

const ArmIdSchema = z.enum(['baseline_old_sop', 'treatment_new_sop']);
const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const NonEmptyStringSchema = z.string().trim().min(1);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();
const LaunchBudgetSchema = z
  .object({ tokenPolicy: z.literal('unbounded'), wallTimeMsCap: PositiveIntegerSchema })
  .strict();
const OutcomeCheckpointSchema = z
  .object({
    claimed: z.enum(['achieved', 'not_achieved', 'deferred']),
    summary: NonEmptyStringSchema,
    verificationCommands: z.array(z.string()),
    reviewIntent: z.enum(['local_result', 'formal_review', 'delivery']),
    reviewState: z.enum(['pending', 'in_review', 'changes_requested', 'reviewed', 'stale']),
    reviewUnit: NonEmptyStringSchema,
  })
  .strict();
const IndependentReviewSchema = z
  .object({
    source: z.literal('authenticated_runtime_observer'),
    request: z
      .object({
        eventId: NonEmptyStringSchema,
        authorSessionId: NonEmptyStringSchema,
        candidateSha: Sha1Schema,
        candidateDiffRef: NonEmptyStringSchema,
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
        candidateDiffRef: NonEmptyStringSchema,
        candidatePatchSha256: Sha256Schema,
        state: z.enum(['approved', 'changes_requested']),
        findings: z
          .object({ p1: NonNegativeIntegerSchema, p2: NonNegativeIntegerSchema, p3: NonNegativeIntegerSchema })
          .strict(),
      })
      .strict(),
  })
  .strict();
const StageBudgetSchema = z
  .object({
    tokenPolicy: z.literal('unbounded'),
    maximumInfrastructureRetryAttempts: NonNegativeIntegerSchema,
  })
  .strict();
const AttemptSchema = z.union([z.literal(1), z.literal(2)]);

const StageAdmissionScopeSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_SCOPE_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    runnerCommit: Sha1Schema,
    stageId: NonEmptyStringSchema,
    admissionRepetitions: PositiveIntegerSchema,
    materializationSkillArmId: ArmIdSchema,
    oracleToolchainSha256: Sha256Schema,
    tasks: z
      .array(
        z
          .object({
            taskId: NonEmptyStringSchema,
            baseCommit: Sha1Schema,
            goldOutcomeCommit: Sha1Schema,
            oraclePolicyId: NonEmptyStringSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const StageAdmissionOracleSchema = z
  .object({
    passed: z.boolean(),
    checks: z
      .array(
        z
          .object({
            name: NonEmptyStringSchema,
            expectedExitCode: z.number().int(),
            actualExitCode: z.number().int(),
            elapsedMs: NonNegativeIntegerSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const StageAdmissionSampleSchema = z
  .object({
    taskId: NonEmptyStringSchema,
    repetition: PositiveIntegerSchema,
    candidateKind: z.enum(['baseline', 'gold_projection']),
    candidateTreeSha: Sha1Schema.optional(),
    candidateIdentitySha256: Sha256Schema.optional(),
    appliedGoldPaths: z.array(NonEmptyStringSchema).optional(),
    oracle: StageAdmissionOracleSchema.optional(),
    error: NonEmptyStringSchema.optional(),
  })
  .strict();

const StageAdmissionResultSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_RESULT_VERSION),
    scopeSha256: Sha256Schema,
    status: z.enum(['admitted', 'rejected']),
    effectClaimEligible: z.literal(false),
    tasks: z
      .array(
        z
          .object({
            taskId: NonEmptyStringSchema,
            admitted: z.boolean(),
            baselineOracleVector: NonEmptyStringSchema.nullable(),
            goldOracleVector: NonEmptyStringSchema.nullable(),
          })
          .strict(),
      )
      .min(1),
    samples: z.array(StageAdmissionSampleSchema).min(1),
  })
  .strict();

const StageAdmissionBindingSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_BINDING_VERSION),
    resultSha256: Sha256Schema,
    scopeSha256: Sha256Schema,
    runnerCommit: Sha1Schema,
    manifestSha256: Sha256Schema,
    stageId: NonEmptyStringSchema,
    admissionRepetitions: PositiveIntegerSchema,
    oracleToolchainSha256: Sha256Schema,
  })
  .strict();

const SkillSnapshotSchema = z
  .object({
    commit: Sha1Schema,
    blobObjectId: Sha1Schema,
    path: NonEmptyStringSchema,
  })
  .strict();

const ArmSchema = z
  .object({
    id: ArmIdSchema,
    label: NonEmptyStringSchema,
    skillSnapshot: SkillSnapshotSchema,
  })
  .strict();

const OracleSetupCommandSchema = z
  .object({ kind: z.literal('pnpm'), args: z.array(NonEmptyStringSchema).min(1) })
  .strict();

const OracleWorkingDirectorySchema = NonEmptyStringSchema.refine(
  (value) =>
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !/^[a-z]:/i.test(value) &&
    !value.split(/[\\/]/).some((segment) => segment === '.' || segment === '..'),
  'oracle working directory must stay within the candidate repository',
);

const OracleCheckSchema = z.union([
  z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      workingDirectory: OracleWorkingDirectorySchema.optional(),
      nodeArgs: z.array(NonEmptyStringSchema).min(1),
    })
    .strict(),
  z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      workingDirectory: OracleWorkingDirectorySchema.optional(),
      behaviorBundle: z.union([
        z
          .object({
            packageDirectory: OracleWorkingDirectorySchema,
            tsconfigPath: OracleWorkingDirectorySchema,
            source: NonEmptyStringSchema.refine(
              (value) => value.includes('$CANDIDATE_ROOT'),
              'behavior bundle source must resolve candidate imports through $CANDIDATE_ROOT',
            ),
          })
          .strict(),
        z
          .object({
            packageDirectory: OracleWorkingDirectorySchema,
            tsconfigPath: OracleWorkingDirectorySchema,
            sourcePath: OracleWorkingDirectorySchema,
          })
          .strict(),
      ]),
    })
    .strict(),
]);

const LongHorizonDimensionSchema = z.enum([
  'diagnosis',
  'replanning',
  'cross_layer_change',
  'verification_review_convergence',
]);

const LocalHistorySourceSchema = z
  .object({
    kind: z.literal('local_history'),
    fixtureManifestPath: NonEmptyStringSchema,
    fixtureId: NonEmptyStringSchema,
    sourcePullRequest: PositiveIntegerSchema,
    baseCommit: Sha1Schema,
  })
  .strict();

const ExternalDatasetSourceSchema = z
  .object({
    kind: z.literal('external_dataset'),
    datasetId: NonEmptyStringSchema,
    datasetRevision: Sha1Schema,
    instanceId: NonEmptyStringSchema,
    repository: NonEmptyStringSchema,
    baseCommit: Sha1Schema,
    license: NonEmptyStringSchema,
    sourceUrl: z.string().url(),
  })
  .strict();

const BenchmarkTaskSchema = z
  .object({
    id: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    readiness: z.enum(['ready', 'candidate']),
    complexity: z.enum(['small', 'medium', 'large']),
    source: z.discriminatedUnion('kind', [LocalHistorySourceSchema, ExternalDatasetSourceSchema]),
    materializationMode: z.enum(['runtime_with_base_paths', 'full_base_commit']).optional(),
    executorInput: z.record(z.unknown()),
    oraclePolicy: z
      .object({
        id: NonEmptyStringSchema,
        commandOrTool: NonEmptyStringSchema,
        successExitCode: z.number().int(),
        hiddenFromExecutor: z.literal(true),
        goldOutcomeCommit: Sha1Schema.optional(),
        goldProjectionPaths: z.array(NonEmptyStringSchema).min(1).optional(),
        setupCommands: z.array(OracleSetupCommandSchema).optional(),
        checks: z.array(OracleCheckSchema).min(1).optional(),
        observableBehaviors: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]+$/),
                requirement: NonEmptyStringSchema,
                adjudication: NonEmptyStringSchema,
              })
              .strict(),
          )
          .min(1)
          .optional(),
        hiddenTestPatch: z
          .object({ commit: Sha1Schema, paths: z.array(NonEmptyStringSchema).min(1) })
          .strict()
          .optional(),
      })
      .strict(),
    allowedChangedPaths: z.array(NonEmptyStringSchema).min(1).optional(),
    horizonProfile: z
      .object({
        decisionDepth: z.literal('long'),
        requiredDimensions: z.array(LongHorizonDimensionSchema).length(4),
      })
      .strict()
      .optional(),
  })
  .strict();

const StageSchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: z.enum(['measurement_smoke', 'exploratory', 'held_out', 'confirmatory']),
    horizon: z.enum(['smoke', 'long']),
    taskIds: z.array(NonEmptyStringSchema).min(1),
    repetitionsPerArm: PositiveIntegerSchema,
    admissionRepetitions: PositiveIntegerSchema.optional(),
    maximumRuns: PositiveIntegerSchema,
    wallTimeMsCap: PositiveIntegerSchema,
    effectClaimEligible: z.boolean(),
    automaticScale: z.literal(false),
  })
  .strict();

const ConvergenceCanarySchema = z
  .object({
    id: NonEmptyStringSchema,
    taskId: NonEmptyStringSchema,
    armId: z.literal('treatment_new_sop'),
    maximumRepairRounds: z.literal(0),
    effectClaimEligible: z.literal(false),
    candidateExecution: z
      .object({
        mode: z.literal('single_real_sop_episode'),
        formalReview: z.literal('conditional_inside_episode'),
      })
      .strict(),
    postHocJudge: z
      .object({
        timing: z.literal('after_candidate_freeze'),
        purpose: z.literal('sop_compliance_measurement'),
        candidateIntervention: z.literal('none'),
        feedbackToCandidate: z.literal('none'),
        workspace: z.literal('isolated_candidate_snapshot'),
        filesystemAccess: z.literal('write'),
        acceptanceSource: z.literal('original_task'),
        armIdentity: z.literal('hidden'),
        requiredEvidence: z.tuple([z.literal('reproduced_test_failure'), z.literal('static_proof')]),
      })
      .strict(),
    oracleBehaviorRationale: z.array(NonEmptyStringSchema).min(1),
    successGate: z
      .array(z.enum(['behavior_oracle_passed', 'sop_judge_passed', 'hard_invariants_passed']))
      .length(3),
    oracleSpecificity: z
      .object({
        candidateKinds: z.array(z.enum(['baseline', 'gold_projection', 'behavior_equivalent_alternate'])).length(3),
        singleFaultMutations: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]+$/),
                targetBehaviorIds: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();

const BenchmarkManifestBaseSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_MANIFEST_VERSION),
    benchmarkId: NonEmptyStringSchema,
    causalQuestion: NonEmptyStringSchema,
    runtimeCommit: Sha1Schema,
    model: z.object({ provider: NonEmptyStringSchema, modelId: NonEmptyStringSchema }).strict(),
    randomizationSeed: NonEmptyStringSchema,
    arms: z.array(ArmSchema).length(2),
    controls: z
      .object({
        sameRuntime: z.literal(true),
        sameModel: z.literal(true),
        sameTaskInput: z.literal(true),
        sameToolPermissions: z.literal(true),
        sameHardGates: z.literal(true),
        sameDataIsolation: z.literal(true),
        sameMeasurementBoundary: z.literal(true),
        freshSessionPerRun: z.literal(true),
        blindJudge: z.literal(true),
      })
      .strict(),
    budgetPolicy: z
      .object({
        tokenPolicy: z.literal('unbounded'),
        sameTokenPolicyWithinTaskPair: z.literal(true),
        automaticScale: z.literal(false),
        nextStageRequiresOperatorDecision: z.literal(true),
        infrastructureRetryLimit: z.literal(1),
      })
      .strict(),
    convergenceCanary: ConvergenceCanarySchema,
    tasks: z.array(BenchmarkTaskSchema).min(2),
    stages: z.array(StageSchema).min(1),
  })
  .strict();

type BenchmarkManifestCandidate = z.infer<typeof BenchmarkManifestBaseSchema>;
type BenchmarkStageCandidate = BenchmarkManifestCandidate['stages'][number];
type BenchmarkTaskCandidate = BenchmarkManifestCandidate['tasks'][number];

const BenchmarkManifestSchema = BenchmarkManifestBaseSchema.superRefine(validateBenchmarkManifest);

function validateBenchmarkManifest(manifest: BenchmarkManifestCandidate, context: z.RefinementCtx): void {
  validateBenchmarkArms(manifest, context);
  validateUniqueManifestIds(manifest, context);
  validateBenchmarkStages(manifest, context);
  validateConvergenceCanary(manifest, context);
}

function validateConvergenceCanary(manifest: BenchmarkManifestCandidate, context: z.RefinementCtx): void {
  const canary = manifest.convergenceCanary;
  const task = manifest.tasks.find((candidate) => candidate.id === canary.taskId);
  if (!task) {
    addManifestIssue(context, ['convergenceCanary', 'taskId'], `unknown task ${canary.taskId}`);
    return;
  }
  if (
    task.readiness !== 'ready' ||
    task.horizonProfile?.requiredDimensions.includes('verification_review_convergence') !== true
  ) {
    addManifestIssue(
      context,
      ['convergenceCanary', 'taskId'],
      'convergence canary requires a ready task that declares verification_review_convergence',
    );
  }
  const behaviorIds = task.oraclePolicy.observableBehaviors?.map((behavior) => behavior.id) ?? [];
  if (behaviorIds.length === 0 || new Set(behaviorIds).size !== behaviorIds.length) {
    addManifestIssue(
      context,
      ['tasks', manifest.tasks.indexOf(task), 'oraclePolicy', 'observableBehaviors'],
      'convergence canary task requires unique observable behavior contracts',
    );
  }
  const checkIds = task.oraclePolicy.checks?.map((check) => check.id) ?? [];
  if (
    checkIds.length !== behaviorIds.length ||
    checkIds.some((checkId) => !behaviorIds.includes(checkId)) ||
    behaviorIds.some((behaviorId) => !checkIds.includes(behaviorId))
  ) {
    addManifestIssue(
      context,
      ['tasks', manifest.tasks.indexOf(task), 'oraclePolicy', 'checks'],
      'convergence oracle checks must match the declared observable behaviors exactly',
    );
  }
  if (new Set(canary.successGate).size !== canary.successGate.length) {
    addManifestIssue(context, ['convergenceCanary', 'successGate'], 'convergence success gates must be unique');
  }
  if (new Set(canary.oracleSpecificity.candidateKinds).size !== canary.oracleSpecificity.candidateKinds.length) {
    addManifestIssue(
      context,
      ['convergenceCanary', 'oracleSpecificity', 'candidateKinds'],
      'oracle specificity candidate kinds must be unique',
    );
  }
  for (const [index, mutation] of canary.oracleSpecificity.singleFaultMutations.entries()) {
    if (mutation.targetBehaviorIds.some((behaviorId) => !behaviorIds.includes(behaviorId))) {
      addManifestIssue(
        context,
        ['convergenceCanary', 'oracleSpecificity', 'singleFaultMutations', index, 'targetBehaviorIds'],
        'single-fault mutation targets must name declared observable behaviors',
      );
    }
  }
  const mutationBehaviorIds = new Set(
    canary.oracleSpecificity.singleFaultMutations.flatMap((mutation) => mutation.targetBehaviorIds),
  );
  if (behaviorIds.some((behaviorId) => !mutationBehaviorIds.has(behaviorId))) {
    addManifestIssue(
      context,
      ['convergenceCanary', 'oracleSpecificity', 'singleFaultMutations'],
      'mutation targets must cover every declared observable behavior',
    );
  }
}

function validateBenchmarkArms(manifest: BenchmarkManifestCandidate, context: z.RefinementCtx): void {
  const armIds = manifest.arms.map((arm) => arm.id);
  if (new Set(armIds).size !== 2 || !ArmIdSchema.options.every((id) => armIds.includes(id))) {
    addManifestIssue(context, ['arms'], 'manifest requires both A/B arms');
  }
  if (new Set(manifest.arms.map((arm) => arm.skillSnapshot.blobObjectId)).size !== 2) {
    addManifestIssue(context, ['arms'], 'A/B arms must pin different Skill blobs');
  }
}

function validateUniqueManifestIds(manifest: BenchmarkManifestCandidate, context: z.RefinementCtx): void {
  const taskIds = manifest.tasks.map((task) => task.id);
  if (new Set(taskIds).size !== taskIds.length) addManifestIssue(context, ['tasks'], 'task ids must be unique');
  const stageIds = manifest.stages.map((stage) => stage.id);
  if (new Set(stageIds).size !== stageIds.length) addManifestIssue(context, ['stages'], 'stage ids must be unique');
}

function validateBenchmarkStages(manifest: BenchmarkManifestCandidate, context: z.RefinementCtx): void {
  const taskById = new Map(manifest.tasks.map((task) => [task.id, task]));
  for (const [stageIndex, stage] of manifest.stages.entries()) {
    validateStageTasks(stage, stageIndex, taskById, context);
    validateStageRunMatrix(stage, stageIndex, manifest.arms.length, context);
  }
}

function validateStageTasks(
  stage: BenchmarkStageCandidate,
  stageIndex: number,
  taskById: ReadonlyMap<string, BenchmarkTaskCandidate>,
  context: z.RefinementCtx,
): void {
  const path = ['stages', stageIndex, 'taskIds'];
  if (new Set(stage.taskIds).size !== stage.taskIds.length) {
    addManifestIssue(context, path, 'stage task ids must be unique');
  }
  for (const taskId of stage.taskIds) {
    const task = taskById.get(taskId);
    if (!task) addManifestIssue(context, path, `unknown task ${taskId}`);
    else if (task.readiness !== 'ready') {
      addManifestIssue(context, path, `stage cannot launch candidate-only task ${taskId}`);
    } else if (stage.horizon === 'long') {
      validateLongHorizonTask(task, stageIndex, context);
    }
  }
}

function validateLongHorizonTask(task: BenchmarkTaskCandidate, stageIndex: number, context: z.RefinementCtx): void {
  const path = ['stages', stageIndex, 'taskIds'];
  if (task.complexity !== 'large' || !task.horizonProfile) {
    addManifestIssue(context, path, `long-horizon task ${task.id} requires large complexity and a horizon profile`);
  }
  if (task.horizonProfile && new Set(task.horizonProfile.requiredDimensions).size !== 4) {
    addManifestIssue(context, path, `long-horizon task ${task.id} must cover four distinct horizon dimensions`);
  }
  if (!task.oraclePolicy.checks || !task.oraclePolicy.hiddenTestPatch) {
    addManifestIssue(context, path, `long-horizon task ${task.id} requires hidden replay checks`);
  }
  if (!task.oraclePolicy.goldOutcomeCommit) {
    addManifestIssue(context, path, `long-horizon task ${task.id} requires a grader-only gold outcome commit`);
  }
  if (!task.oraclePolicy.goldProjectionPaths) {
    addManifestIssue(context, path, `long-horizon task ${task.id} requires an explicit gold projection`);
  } else if (
    new Set(task.oraclePolicy.goldProjectionPaths).size !== task.oraclePolicy.goldProjectionPaths.length ||
    !task.allowedChangedPaths ||
    task.oraclePolicy.goldProjectionPaths.some((candidate) => !task.allowedChangedPaths?.includes(candidate))
  ) {
    addManifestIssue(
      context,
      path,
      `long-horizon task ${task.id} gold projection must contain unique paths inside its allowed write surface`,
    );
  }
  if (task.materializationMode !== 'full_base_commit') {
    addManifestIssue(context, path, `long-horizon task ${task.id} requires a full historical base snapshot`);
  }
}

function validateStageRunMatrix(
  stage: BenchmarkStageCandidate,
  stageIndex: number,
  armCount: number,
  context: z.RefinementCtx,
): void {
  const expectedRuns = stage.taskIds.length * armCount * stage.repetitionsPerArm;
  if (stage.maximumRuns !== expectedRuns) {
    addManifestIssue(
      context,
      ['stages', stageIndex, 'maximumRuns'],
      `maximumRuns must equal the complete paired matrix (${expectedRuns})`,
    );
  }
  if (stage.horizon === 'long' && (stage.admissionRepetitions ?? 0) < 1) {
    addManifestIssue(
      context,
      ['stages', stageIndex, 'admissionRepetitions'],
      'long-horizon stages require at least one red/green admission calibration',
    );
  }
  if ((stage.kind === 'measurement_smoke' || stage.kind === 'exploratory') && stage.effectClaimEligible) {
    addManifestIssue(
      context,
      ['stages', stageIndex, 'effectClaimEligible'],
      `${stage.kind} data cannot support an effect claim`,
    );
  }
}

function addManifestIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

const BenchmarkReceiptSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_RECEIPT_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    runId: NonEmptyStringSchema,
    stageId: NonEmptyStringSchema,
    taskId: NonEmptyStringSchema,
    armId: ArmIdSchema,
    repetition: NonNegativeIntegerSchema,
    attempt: AttemptSchema,
    launchPlanSha256: Sha256Schema,
    supersedesReceiptSha256: Sha256Schema.optional(),
    evidence: z.object({ uri: NonEmptyStringSchema, sha256: Sha256Schema }).strict(),
  })
  .strict()
  .superRefine(validateAttemptSupersession);

const ArtifactKindSchema = z.enum([
  'launch_control',
  'execution',
  'oracle',
  'verification',
  'judge',
  'outcome_checkpoint',
  'telemetry',
  'safety',
]);

const ArtifactReferenceSchema = z
  .object({
    kind: ArtifactKindSchema,
    uri: NonEmptyStringSchema,
    sha256: Sha256Schema,
  })
  .strict();

const BenchmarkArtifactSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_ARTIFACT_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    runId: NonEmptyStringSchema,
    stageId: NonEmptyStringSchema,
    taskId: NonEmptyStringSchema,
    armId: ArmIdSchema,
    repetition: NonNegativeIntegerSchema,
    attempt: AttemptSchema,
    launchPlanSha256: Sha256Schema,
    kind: ArtifactKindSchema,
    factsSha256: Sha256Schema,
  })
  .strict();

const BenchmarkEvidenceSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_EVIDENCE_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    runId: NonEmptyStringSchema,
    stageId: NonEmptyStringSchema,
    taskId: NonEmptyStringSchema,
    armId: ArmIdSchema,
    repetition: NonNegativeIntegerSchema,
    attempt: AttemptSchema,
    launchPlanSha256: Sha256Schema,
    supersedesReceiptSha256: Sha256Schema.optional(),
    candidate: z
      .object({ finalSha: Sha1Schema, diffRef: NonEmptyStringSchema, patchSha256: Sha256Schema })
      .strict(),
    provenance: z
      .object({
        runtimeCommit: Sha1Schema,
        skillSnapshot: SkillSnapshotSchema,
        taskInputSha256: Sha256Schema,
        environmentSha256: Sha256Schema,
        attemptReservationSha256: Sha256Schema,
        model: z.object({ provider: NonEmptyStringSchema, modelId: NonEmptyStringSchema }).strict(),
      })
      .strict(),
    budget: LaunchBudgetSchema,
    execution: z
      .object({
        status: z.enum(['completed', 'timeout', 'abandoned', 'infrastructure_error']),
        startedAt: z.string().datetime({ offset: true }),
        elapsedMs: NonNegativeIntegerSchema,
        candidateReadyElapsedMs: NonNegativeIntegerSchema.optional(),
        agentEpisode: z
          .object({
            mode: z.literal('natural_agent_graph'),
            rootSessionId: NonEmptyStringSchema,
            childSessionIds: z.array(NonEmptyStringSchema).refine(
              (values) => new Set(values).size === values.length,
              'agent episode child session ids must be unique',
            ),
            collaborationToolCalls: NonNegativeIntegerSchema,
          })
          .strict()
          .superRefine((episode, context) => {
            if (episode.childSessionIds.includes(episode.rootSessionId)) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['childSessionIds'],
                message: 'agent episode root session cannot also be a child session',
              });
            }
          })
          .optional(),
        outcomeCheckpoint: OutcomeCheckpointSchema.optional(),
      })
      .strict()
      .superRefine((execution, context) => {
        if (execution.status === 'completed' && !execution.agentEpisode) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['agentEpisode'],
            message: 'completed candidate execution must bind its natural agent episode',
          });
        }
        if (execution.status === 'completed' && !execution.outcomeCheckpoint) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['outcomeCheckpoint'],
            message: 'completed candidate execution must bind its frozen Outcome Checkpoint',
          });
        }
      }),
    outcome: z
      .object({
        claimed: z.enum(['achieved', 'not_achieved', 'deferred']),
        oracle: z.enum(['passed', 'failed', 'not_run']),
        verificationExactBound: z.boolean(),
        checkpointTruthful: z.boolean(),
        judge: z
          .object({
            verdict: z.enum(['sop_compliant', 'sop_noncompliant']),
            reviewDemand: z.enum(['required', 'not_required', 'indeterminate']),
            observedReviewState: z.enum(['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown']),
            exactBinding: z.boolean(),
            blind: z.boolean(),
            candidateSessionId: NonEmptyStringSchema,
            judgeSessionId: NonEmptyStringSchema,
            findings: z
              .object({ p1: NonNegativeIntegerSchema, p2: NonNegativeIntegerSchema, p3: NonNegativeIntegerSchema })
              .strict(),
          })
          .strict()
          .refine((judge) => judge.candidateSessionId !== judge.judgeSessionId, {
            message: 'post-hoc Judge must use a session independent from the candidate episode',
          }),
        independentReview: IndependentReviewSchema.optional(),
      })
      .strict(),
    safety: z.object({ hardInvariantMisses: z.array(NonEmptyStringSchema) }).strict(),
    cost: z
      .object({
        inputTokens: NonNegativeIntegerSchema,
        cachedInputTokens: NonNegativeIntegerSchema,
        outputTokens: NonNegativeIntegerSchema,
        toolCalls: NonNegativeIntegerSchema,
        failedToolCalls: NonNegativeIntegerSchema.optional(),
        behavioralFailedToolCalls: NonNegativeIntegerSchema.optional(),
        infrastructureFailedToolCalls: NonNegativeIntegerSchema.optional(),
        usageComplete: z.boolean().optional(),
        accountedSessionIds: z
          .array(NonEmptyStringSchema)
          .refine((values) => new Set(values).size === values.length, 'usage-accounted session ids must be unique'),
      })
      .strict()
      .superRefine((cost, context) => {
        const failureCounts = [
          cost.failedToolCalls,
          cost.behavioralFailedToolCalls,
          cost.infrastructureFailedToolCalls,
        ];
        if (failureCounts.every((count) => count === undefined)) return;
        const [failedToolCalls, behavioralFailedToolCalls, infrastructureFailedToolCalls] = failureCounts;
        if (
          failedToolCalls === undefined ||
          behavioralFailedToolCalls === undefined ||
          infrastructureFailedToolCalls === undefined ||
          failedToolCalls !== behavioralFailedToolCalls + infrastructureFailedToolCalls
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'failed tool-call telemetry must be complete and internally consistent',
          });
        }
      }),
    operatorInterventions: NonNegativeIntegerSchema,
    artifacts: z.array(ArtifactReferenceSchema).min(1),
  })
  .strict()
  .superRefine(validateAttemptSupersession)
  .superRefine((evidence, context) => {
    const episode = evidence.execution.agentEpisode;
    const checkpoint = evidence.execution.outcomeCheckpoint;
    if (episode && evidence.outcome.judge.candidateSessionId !== episode.rootSessionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome', 'judge', 'candidateSessionId'],
        message: 'post-hoc Judge candidate identity must match the natural agent episode root',
      });
    }
    if (episode?.childSessionIds.includes(evidence.outcome.judge.judgeSessionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome', 'judge', 'judgeSessionId'],
        message: 'post-hoc Judge cannot reuse a candidate child session',
      });
    }
    if (evidence.execution.status === 'completed' && checkpoint) {
      if (checkpoint.claimed !== evidence.outcome.claimed) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outcome', 'claimed'],
          message: 'outcome claim must match the frozen Outcome Checkpoint',
        });
      }
      if (checkpoint.reviewState !== evidence.outcome.judge.observedReviewState) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outcome', 'judge', 'observedReviewState'],
          message: 'post-hoc Judge review state must match the frozen Outcome Checkpoint',
        });
      }
    }
    const review = evidence.outcome.independentReview;
    if (review) {
      const exactReviewUnit =
        review.request.candidateSha === evidence.candidate.finalSha &&
        review.verdict.candidateSha === evidence.candidate.finalSha &&
        review.request.candidateDiffRef === evidence.candidate.diffRef &&
        review.verdict.candidateDiffRef === evidence.candidate.diffRef &&
        review.request.candidatePatchSha256 === evidence.candidate.patchSha256 &&
        review.verdict.candidatePatchSha256 === evidence.candidate.patchSha256;
      const exactRuntimeBinding =
        Boolean(episode) &&
        review.request.authorSessionId === episode?.rootSessionId &&
        review.verdict.requestEventId === review.request.eventId &&
        review.verdict.eventId !== review.request.eventId &&
        review.verdict.reviewerSessionId !== review.request.authorSessionId &&
        episode?.childSessionIds.includes(review.verdict.reviewerSessionId);
      if (!exactReviewUnit || !exactRuntimeBinding) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outcome', 'independentReview'],
          message: 'independent Review must bind an authenticated exact Review Unit and an independent child session',
        });
      }
    }
    if (evidence.cost.usageComplete && episode) {
      const expected = [episode.rootSessionId, ...episode.childSessionIds, evidence.outcome.judge.judgeSessionId].sort();
      const accounted = [...evidence.cost.accountedSessionIds].sort();
      if (JSON.stringify(accounted) !== JSON.stringify(expected)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cost', 'accountedSessionIds'],
          message: 'usage accounting must cover every candidate and Judge session exactly once',
        });
      }
    }
  });

const OperatorLaunchAuthorizationSchema = z
  .object({
    kind: z.literal('operator_approval'),
    authorizedBy: z.literal('co-creator'),
    approvalRef: z.string().regex(/^cat-cafe:\/\/message\/[A-Za-z0-9-]+$/),
    approvalMessageSha256: Sha256Schema,
    approvedLaunchScopeSha256: Sha256Schema,
    approvedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const FixtureLaunchAuthorizationSchema = z
  .object({
    kind: z.literal('fixture'),
    fixtureId: NonEmptyStringSchema,
    approvedLaunchScopeSha256: Sha256Schema,
    approvedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const LaunchAuthorizationSchema = z.discriminatedUnion('kind', [
  OperatorLaunchAuthorizationSchema,
  FixtureLaunchAuthorizationSchema,
]);

const LaunchPlanRunSchema = z
  .object({
    runKey: NonEmptyStringSchema,
    stageId: NonEmptyStringSchema,
    taskId: NonEmptyStringSchema,
    armId: ArmIdSchema,
    repetition: NonNegativeIntegerSchema,
    runtimeCommit: Sha1Schema,
    skillSnapshot: SkillSnapshotSchema,
    model: z.object({ provider: NonEmptyStringSchema, modelId: NonEmptyStringSchema }).strict(),
    taskInputSha256: Sha256Schema,
    executorInput: z.record(z.unknown()),
    environmentSha256: Sha256Schema,
    budget: LaunchBudgetSchema,
  })
  .strict();

const BenchmarkLaunchScopeSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_SCOPE_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    stageId: NonEmptyStringSchema,
    executionMode: z.enum(['live', 'fixture']),
    stageAdmission: StageAdmissionBindingSchema.optional(),
    stageBudget: StageBudgetSchema,
    runs: z.array(LaunchPlanRunSchema).min(1),
  })
  .strict();

const BenchmarkLaunchPlanSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_PLAN_VERSION),
    benchmarkId: NonEmptyStringSchema,
    manifestSha256: Sha256Schema,
    stageId: NonEmptyStringSchema,
    executionMode: z.enum(['live', 'fixture']),
    stageAdmission: StageAdmissionBindingSchema.optional(),
    stageBudget: StageBudgetSchema,
    launchScopeSha256: Sha256Schema,
    authorization: LaunchAuthorizationSchema,
    runs: z.array(LaunchPlanRunSchema).min(1),
  })
  .strict();

const LaunchScopeInputSchema = z
  .object({
    executionMode: z.enum(['live', 'fixture']),
    environmentSha256: Sha256Schema,
    budgetByTask: z.record(LaunchBudgetSchema),
    stageAdmission: StageAdmissionBindingSchema.optional(),
    stageBudget: StageBudgetSchema,
  })
  .strict();

const LaunchPlanInputSchema = z
  .object({
    scope: BenchmarkLaunchScopeSchema,
    authorization: LaunchAuthorizationSchema,
  })
  .strict();

function validateAttemptSupersession(
  value: { attempt: 1 | 2; supersedesReceiptSha256?: string },
  context: z.RefinementCtx,
): void {
  if (value.attempt === 1 && value.supersedesReceiptSha256 !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supersedesReceiptSha256'],
      message: 'initial benchmark attempt cannot supersede another receipt',
    });
  }
  if (value.attempt === 2 && value.supersedesReceiptSha256 === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supersedesReceiptSha256'],
      message: 'retry attempt must identify the superseded receipt',
    });
  }
}

export type AdaptiveDevelopmentBenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;
export type AdaptiveDevelopmentBenchmarkReceipt = z.infer<typeof BenchmarkReceiptSchema>;
export type AdaptiveDevelopmentBenchmarkEvidence = z.infer<typeof BenchmarkEvidenceSchema>;
export type AdaptiveDevelopmentBenchmarkArtifact = z.infer<typeof BenchmarkArtifactSchema>;
export type AdaptiveDevelopmentBenchmarkArtifactReference = z.infer<typeof ArtifactReferenceSchema>;
export type AdaptiveDevelopmentBenchmarkArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type AdaptiveDevelopmentBenchmarkArmId = z.infer<typeof ArmIdSchema>;
export type AdaptiveDevelopmentBenchmarkLaunchScope = z.infer<typeof BenchmarkLaunchScopeSchema>;
export type AdaptiveDevelopmentBenchmarkLaunchPlan = z.infer<typeof BenchmarkLaunchPlanSchema>;
export type AdaptiveDevelopmentStageAdmissionScope = z.infer<typeof StageAdmissionScopeSchema>;
export type AdaptiveDevelopmentStageAdmissionResult = z.infer<typeof StageAdmissionResultSchema>;
export type AdaptiveDevelopmentStageAdmissionBinding = z.infer<typeof StageAdmissionBindingSchema>;

export interface AdaptiveDevelopmentBenchmarkRunSpec {
  readonly runKey: string;
  readonly stageId: string;
  readonly taskId: string;
  readonly armId: AdaptiveDevelopmentBenchmarkArmId;
  readonly repetition: number;
  readonly runtimeCommit: string;
  readonly skillSnapshot: AdaptiveDevelopmentBenchmarkManifest['arms'][number]['skillSnapshot'];
  readonly model: AdaptiveDevelopmentBenchmarkManifest['model'];
  readonly taskInputSha256: string;
  readonly executorInput: Readonly<Record<string, unknown>>;
}

export interface AdaptiveDevelopmentBenchmarkLaunchSpec extends AdaptiveDevelopmentBenchmarkRunSpec {
  readonly budget: Readonly<z.infer<typeof LaunchBudgetSchema>>;
  readonly environmentSha256: string;
}

export function parseAdaptiveDevelopmentBenchmarkManifest(input: unknown): AdaptiveDevelopmentBenchmarkManifest {
  return BenchmarkManifestSchema.parse(input);
}

export function fingerprintAdaptiveDevelopmentStageAdmissionCandidate(input: {
  readonly manifest: unknown;
  readonly taskId: string;
  readonly candidateKind: 'baseline' | 'gold_projection';
  readonly runnerCommit: string;
  readonly candidateTreeSha: string;
}): string {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(input.manifest);
  const runnerCommit = Sha1Schema.parse(input.runnerCommit);
  const candidateTreeSha = Sha1Schema.parse(input.candidateTreeSha);
  const task = manifest.tasks.find((candidate) => candidate.id === input.taskId);
  const skillArm = manifest.arms[0];
  if (
    !task ||
    task.source.kind !== 'local_history' ||
    !task.oraclePolicy.goldOutcomeCommit ||
    !task.oraclePolicy.goldProjectionPaths ||
    !skillArm
  ) {
    throw new Error(`stage admission candidate identity requires a complete local-history task: ${input.taskId}`);
  }
  return fingerprintAdaptiveDevelopmentBenchmark({
    schemaVersion: 'lf-0001.stage-admission-candidate-identity.v2',
    runnerCommit,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
    taskId: task.id,
    candidateKind: input.candidateKind,
    candidateTreeSha,
    baseCommit: task.source.baseCommit,
    materializationMode: task.materializationMode,
    skillArm: {
      id: skillArm.id,
      skillSnapshot: skillArm.skillSnapshot,
    },
    ...(input.candidateKind === 'gold_projection'
      ? {
          goldOutcomeCommit: task.oraclePolicy.goldOutcomeCommit,
          appliedGoldPaths: task.oraclePolicy.goldProjectionPaths,
        }
      : { appliedGoldPaths: [] }),
  });
}

export function parseAdaptiveDevelopmentBenchmarkReceipt(input: unknown): AdaptiveDevelopmentBenchmarkReceipt {
  return BenchmarkReceiptSchema.parse(input);
}

export function parseAdaptiveDevelopmentBenchmarkEvidence(input: unknown): AdaptiveDevelopmentBenchmarkEvidence {
  return BenchmarkEvidenceSchema.parse(input);
}

export function parseAdaptiveDevelopmentBenchmarkArtifact(input: unknown): AdaptiveDevelopmentBenchmarkArtifact {
  return BenchmarkArtifactSchema.parse(input);
}

export function parseAdaptiveDevelopmentBenchmarkLaunchPlan(input: unknown): AdaptiveDevelopmentBenchmarkLaunchPlan {
  return BenchmarkLaunchPlanSchema.parse(input);
}

export function parseAdaptiveDevelopmentBenchmarkLaunchScope(input: unknown): AdaptiveDevelopmentBenchmarkLaunchScope {
  return BenchmarkLaunchScopeSchema.parse(input);
}

export function parseAdaptiveDevelopmentStageAdmissionScope(input: unknown): AdaptiveDevelopmentStageAdmissionScope {
  return StageAdmissionScopeSchema.parse(input);
}

export function parseAdaptiveDevelopmentStageAdmissionResult(input: unknown): AdaptiveDevelopmentStageAdmissionResult {
  return StageAdmissionResultSchema.parse(input);
}

function stageAdmissionOracleVector(
  oracle: AdaptiveDevelopmentStageAdmissionResult['samples'][number]['oracle'],
): string {
  if (!oracle) throw new Error('stage admission sample is missing its oracle result');
  return oracle.checks.map((check) => `${check.name}:${check.actualExitCode}`).join('|');
}

export function validateAdaptiveDevelopmentStageAdmission(input: {
  readonly manifest: unknown;
  readonly stageId: string;
  readonly expectedRunnerCommit: string;
  readonly expectedOracleToolchainSha256: string;
  readonly scope: unknown;
  readonly resultArtifact: string;
}): AdaptiveDevelopmentStageAdmissionBinding {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(input.manifest);
  const stage = manifest.stages.find((candidate) => candidate.id === input.stageId);
  if (!stage || stage.horizon !== 'long' || !stage.admissionRepetitions) {
    throw new Error(`stage admission binding requires a long-horizon stage: ${input.stageId}`);
  }
  const expectedRunnerCommit = Sha1Schema.parse(input.expectedRunnerCommit);
  const expectedOracleToolchainSha256 = Sha256Schema.parse(input.expectedOracleToolchainSha256);
  const resultSha256 = createHash('sha256').update(input.resultArtifact).digest('hex');
  const scope = parseAdaptiveDevelopmentStageAdmissionScope(input.scope);
  const result = parseAdaptiveDevelopmentStageAdmissionResult(JSON.parse(input.resultArtifact));
  const manifestSha256 = fingerprintAdaptiveDevelopmentBenchmark(manifest);
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  if (
    scope.benchmarkId !== manifest.benchmarkId ||
    scope.manifestSha256 !== manifestSha256 ||
    scope.runnerCommit !== expectedRunnerCommit ||
    scope.stageId !== stage.id ||
    scope.admissionRepetitions !== stage.admissionRepetitions ||
    scope.materializationSkillArmId !== manifest.arms[0]?.id ||
    scope.oracleToolchainSha256 !== expectedOracleToolchainSha256
  ) {
    throw new Error(
      'stage admission scope is stale or does not bind the exact manifest, runner, oracle toolchain, stage, and repetitions',
    );
  }
  const expectedAdmissionByTask = new Map<string, StageAdmissionTaskExpectation>();
  const expectedTasks = stage.taskIds.map((taskId) => {
    const task = manifest.tasks.find((candidate) => candidate.id === taskId);
    if (
      !task ||
      task.source.kind !== 'local_history' ||
      !task.oraclePolicy.goldOutcomeCommit ||
      !task.oraclePolicy.goldProjectionPaths ||
      !task.oraclePolicy.checks
    ) {
      throw new Error(`stage admission task is incomplete: ${taskId}`);
    }
    expectedAdmissionByTask.set(taskId, {
      manifest,
      taskId,
      runnerCommit: expectedRunnerCommit,
      goldProjectionPaths: task.oraclePolicy.goldProjectionPaths,
      oracleChecks: task.oraclePolicy.checks.map((check) => ({
        name: check.id,
        expectedExitCode: task.oraclePolicy.successExitCode,
      })),
    });
    return {
      taskId,
      baseCommit: task.source.baseCommit,
      goldOutcomeCommit: task.oraclePolicy.goldOutcomeCommit,
      oraclePolicyId: task.oraclePolicy.id,
    };
  });
  if (fingerprintAdaptiveDevelopmentBenchmark(scope.tasks) !== fingerprintAdaptiveDevelopmentBenchmark(expectedTasks)) {
    throw new Error('stage admission scope task identity mismatch');
  }
  if (result.scopeSha256 !== scopeSha256) throw new Error('stage admission result does not bind its exact scope');
  if (result.status !== 'admitted' || result.tasks.some((task) => !task.admitted)) {
    throw new Error('stage admission result is not admitted');
  }
  validateStageAdmissionSamples(expectedAdmissionByTask, stage.admissionRepetitions, result);
  return StageAdmissionBindingSchema.parse({
    schemaVersion: ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_BINDING_VERSION,
    resultSha256,
    scopeSha256,
    runnerCommit: scope.runnerCommit,
    manifestSha256,
    stageId: stage.id,
    admissionRepetitions: stage.admissionRepetitions,
    oracleToolchainSha256: scope.oracleToolchainSha256,
  });
}

interface StageAdmissionTaskExpectation {
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly taskId: string;
  readonly runnerCommit: string;
  readonly goldProjectionPaths: readonly string[];
  readonly oracleChecks: ReadonlyArray<Readonly<{ name: string; expectedExitCode: number }>>;
}

function validateStageAdmissionSamples(
  expectedAdmissionByTask: ReadonlyMap<string, StageAdmissionTaskExpectation>,
  admissionRepetitions: number,
  result: AdaptiveDevelopmentStageAdmissionResult,
): void {
  const taskIds = [...expectedAdmissionByTask.keys()];
  if (result.tasks.length !== taskIds.length || result.samples.length !== taskIds.length * admissionRepetitions * 2) {
    throw new Error('stage admission result does not contain the complete task/sample matrix');
  }
  const expectedTaskIds = new Set(taskIds);
  const summaryTaskIds = result.tasks.map((task) => task.taskId);
  if (
    new Set(summaryTaskIds).size !== taskIds.length ||
    summaryTaskIds.some((taskId) => !expectedTaskIds.has(taskId)) ||
    result.samples.some((sample) => !expectedTaskIds.has(sample.taskId))
  ) {
    throw new Error('stage admission result contains duplicate or unknown task identities');
  }
  for (const taskId of taskIds) {
    validateStageAdmissionTask(taskId, expectedAdmissionByTask.get(taskId), admissionRepetitions, result);
  }
}

function validateStageAdmissionTask(
  taskId: string,
  expected: StageAdmissionTaskExpectation | undefined,
  admissionRepetitions: number,
  result: AdaptiveDevelopmentStageAdmissionResult,
): void {
  const summary = result.tasks.find((task) => task.taskId === taskId);
  const taskSamples = result.samples.filter((sample) => sample.taskId === taskId);
  const baselines = taskSamples.filter((sample) => sample.candidateKind === 'baseline');
  const gold = taskSamples.filter((sample) => sample.candidateKind === 'gold_projection');
  if (
    !summary ||
    !expected ||
    !stageAdmissionRepetitionsAreExact(baselines, admissionRepetitions) ||
    !stageAdmissionRepetitionsAreExact(gold, admissionRepetitions)
  ) {
    throw new Error(`stage admission sample identity is incomplete for ${taskId}`);
  }
  if (!stageAdmissionGoldProjectionIsExact(baselines, gold, expected.goldProjectionPaths)) {
    throw new Error(`stage admission result does not contain the exact gold projection for ${taskId}`);
  }
  if (!stageAdmissionCandidateIdentityIsExact(taskSamples, expected)) {
    throw new Error(`stage admission candidate identity mismatch for ${taskId}`);
  }
  if (!stageAdmissionCandidateTreesAreStable(baselines, gold)) {
    throw new Error(`stage admission candidate trees are unstable for ${taskId}`);
  }
  if (!stageAdmissionOracleCheckIdentityIsExact(taskSamples, expected.oracleChecks)) {
    throw new Error(`stage admission oracle check identity mismatch for ${taskId}`);
  }
  if (!stageAdmissionRedGreenContractIsValid(taskSamples, baselines, gold)) {
    throw new Error(`stage admission red/green contract failed for ${taskId}`);
  }
  const baselineVectors = new Set(baselines.map((sample) => stageAdmissionOracleVector(sample.oracle)));
  const goldVectors = new Set(gold.map((sample) => stageAdmissionOracleVector(sample.oracle)));
  if (
    baselineVectors.size !== 1 ||
    goldVectors.size !== 1 ||
    summary.baselineOracleVector !== [...baselineVectors][0] ||
    summary.goldOracleVector !== [...goldVectors][0]
  ) {
    throw new Error(`stage admission oracle vectors are unstable or mismatched for ${taskId}`);
  }
}

function stageAdmissionRedGreenContractIsValid(
  taskSamples: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  baselines: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  gold: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
): boolean {
  return (
    taskSamples.every(
      (sample) =>
        !sample.error &&
        Boolean(sample.candidateTreeSha) &&
        Boolean(sample.candidateIdentitySha256) &&
        Boolean(sample.oracle),
    ) &&
    baselines.every((sample) => sample.oracle?.passed === false) &&
    gold.every((sample) => sample.oracle?.passed === true)
  );
}

function stageAdmissionCandidateIdentityIsExact(
  samples: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  expected: StageAdmissionTaskExpectation,
): boolean {
  return samples.every(
    (sample) =>
      sample.candidateTreeSha !== undefined &&
      sample.candidateIdentitySha256 ===
        fingerprintAdaptiveDevelopmentStageAdmissionCandidate({
          manifest: expected.manifest,
          taskId: expected.taskId,
          candidateKind: sample.candidateKind,
          runnerCommit: expected.runnerCommit,
          candidateTreeSha: sample.candidateTreeSha,
        }),
  );
}

function stageAdmissionCandidateTreesAreStable(
  baselines: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  gold: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
): boolean {
  return (
    new Set(baselines.map((sample) => sample.candidateTreeSha)).size === 1 &&
    new Set(gold.map((sample) => sample.candidateTreeSha)).size === 1
  );
}

function stageAdmissionOracleCheckIdentityIsExact(
  samples: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  expectedChecks: ReadonlyArray<Readonly<{ name: string; expectedExitCode: number }>>,
): boolean {
  const expectedFingerprint = fingerprintAdaptiveDevelopmentBenchmark(expectedChecks);
  return samples.every((sample) => {
    if (!sample.oracle) return false;
    const actualChecks = sample.oracle.checks.map((check) => ({
      name: check.name,
      expectedExitCode: check.expectedExitCode,
    }));
    return (
      fingerprintAdaptiveDevelopmentBenchmark(actualChecks) === expectedFingerprint &&
      sample.oracle.passed === sample.oracle.checks.every((check) => check.actualExitCode === check.expectedExitCode)
    );
  });
}

function stageAdmissionRepetitionsAreExact(
  samples: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  admissionRepetitions: number,
): boolean {
  return (
    samples.length === admissionRepetitions &&
    new Set(samples.map((sample) => sample.repetition)).size === admissionRepetitions &&
    samples.every((sample) => sample.repetition <= admissionRepetitions)
  );
}

function stageAdmissionGoldProjectionIsExact(
  baselines: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  gold: ReadonlyArray<AdaptiveDevelopmentStageAdmissionResult['samples'][number]>,
  expectedGoldPaths: readonly string[],
): boolean {
  const expectedFingerprint = fingerprintAdaptiveDevelopmentBenchmark(expectedGoldPaths);
  return (
    baselines.every((sample) => (sample.appliedGoldPaths?.length ?? 0) === 0) &&
    gold.every(
      (sample) =>
        sample.appliedGoldPaths !== undefined &&
        fingerprintAdaptiveDevelopmentBenchmark(sample.appliedGoldPaths) === expectedFingerprint,
    )
  );
}

export function fingerprintAdaptiveDevelopmentBenchmark(input: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(normalizeAdaptiveDevelopmentBenchmarkForJson(input)))
    .digest('hex');
}

export function normalizeAdaptiveDevelopmentBenchmarkForJson<T>(input: T): T {
  const serialized = JSON.stringify(input);
  if (serialized === undefined) throw new Error('benchmark value is not JSON serializable');
  return JSON.parse(serialized) as T;
}

export function buildAdaptiveDevelopmentBenchmarkRunMatrix(
  manifestInput: unknown,
  stageId: string,
): AdaptiveDevelopmentBenchmarkRunSpec[] {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(manifestInput);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${stageId}`);
  const taskById = new Map(manifest.tasks.map((task) => [task.id, task]));
  const pairs: AdaptiveDevelopmentBenchmarkRunSpec[][] = [];

  for (const taskId of stage.taskIds) {
    const task = taskById.get(taskId);
    if (!task) throw new Error(`unknown benchmark task ${taskId}`);
    const taskInputSha256 = fingerprintAdaptiveDevelopmentBenchmark(task.executorInput);
    for (let repetition = 0; repetition < stage.repetitionsPerArm; repetition += 1) {
      const pair = manifest.arms
        .map((arm) => ({
          runKey: `${stage.id}:${task.id}:${repetition}:${arm.id}`,
          stageId: stage.id,
          taskId: task.id,
          armId: arm.id,
          repetition,
          runtimeCommit: manifest.runtimeCommit,
          skillSnapshot: arm.skillSnapshot,
          model: manifest.model,
          taskInputSha256,
          executorInput: structuredClone(task.executorInput),
        }))
        .sort((left, right) =>
          fingerprintAdaptiveDevelopmentBenchmark(`${manifest.randomizationSeed}:${left.runKey}`).localeCompare(
            fingerprintAdaptiveDevelopmentBenchmark(`${manifest.randomizationSeed}:${right.runKey}`),
          ),
        );
      pairs.push(pair);
    }
  }

  return pairs
    .sort((left, right) =>
      fingerprintAdaptiveDevelopmentBenchmark(
        `${manifest.randomizationSeed}:${left[0]?.taskId}:${left[0]?.repetition}`,
      ).localeCompare(
        fingerprintAdaptiveDevelopmentBenchmark(
          `${manifest.randomizationSeed}:${right[0]?.taskId}:${right[0]?.repetition}`,
        ),
      ),
    )
    .flat();
}

export function buildAdaptiveDevelopmentBenchmarkLaunchScope(
  manifestInput: unknown,
  stageId: string,
  launchScopeInput: unknown,
): AdaptiveDevelopmentBenchmarkLaunchScope {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(manifestInput);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${stageId}`);
  const input = LaunchScopeInputSchema.parse(launchScopeInput);
  const budgetByTask = input.budgetByTask;
  const expectedTaskIds = new Set(stage.taskIds);
  const receivedTaskIds = Object.keys(budgetByTask);
  if (
    receivedTaskIds.length !== expectedTaskIds.size ||
    receivedTaskIds.some((taskId) => !expectedTaskIds.has(taskId))
  ) {
    throw new Error('launch budget must cover exactly the selected stage tasks');
  }

  const runs = buildAdaptiveDevelopmentBenchmarkRunMatrix(manifest, stageId).map((spec) => {
    const budget = budgetByTask[spec.taskId];
    if (!budget) throw new Error(`launch budget missing for ${spec.taskId}`);
    return {
      ...spec,
      environmentSha256: input.environmentSha256,
      budget: structuredClone(budget),
    } satisfies AdaptiveDevelopmentBenchmarkLaunchSpec;
  });
  if (input.stageBudget.maximumInfrastructureRetryAttempts > manifest.budgetPolicy.infrastructureRetryLimit) {
    throw new Error('stage retry attempts exceed the manifest retry limit');
  }
  if (input.executionMode === 'live' && stage.horizon === 'long' && !input.stageAdmission) {
    throw new Error('long-horizon live launch scope requires a validated stage admission binding');
  }
  if (
    input.stageAdmission &&
    (input.stageAdmission.stageId !== stage.id ||
      input.stageAdmission.manifestSha256 !== fingerprintAdaptiveDevelopmentBenchmark(manifest) ||
      input.stageAdmission.admissionRepetitions !== stage.admissionRepetitions)
  ) {
    throw new Error('stage admission binding does not match the selected manifest and stage');
  }

  return parseAdaptiveDevelopmentBenchmarkLaunchScope({
    schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_SCOPE_VERSION,
    benchmarkId: manifest.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
    stageId,
    executionMode: input.executionMode,
    ...(input.stageAdmission ? { stageAdmission: input.stageAdmission } : {}),
    stageBudget: input.stageBudget,
    runs,
  });
}

export function adaptiveDevelopmentBenchmarkLaunchScope(
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): AdaptiveDevelopmentBenchmarkLaunchScope {
  return parseAdaptiveDevelopmentBenchmarkLaunchScope({
    schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_SCOPE_VERSION,
    benchmarkId: launchPlan.benchmarkId,
    manifestSha256: launchPlan.manifestSha256,
    stageId: launchPlan.stageId,
    executionMode: launchPlan.executionMode,
    ...(launchPlan.stageAdmission ? { stageAdmission: launchPlan.stageAdmission } : {}),
    stageBudget: launchPlan.stageBudget,
    runs: launchPlan.runs,
  });
}

export function buildAdaptiveDevelopmentBenchmarkLaunchPlan(
  manifestInput: unknown,
  stageId: string,
  launchPlanInput: unknown,
): AdaptiveDevelopmentBenchmarkLaunchPlan {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(manifestInput);
  const input = LaunchPlanInputSchema.parse(launchPlanInput);
  if (input.scope.benchmarkId !== manifest.benchmarkId) throw new Error('launch scope benchmark id mismatch');
  if (input.scope.manifestSha256 !== fingerprintAdaptiveDevelopmentBenchmark(manifest)) {
    throw new Error('launch scope manifest mismatch');
  }
  if (input.scope.stageId !== stageId) throw new Error('launch scope stage mismatch');
  if (input.scope.executionMode === 'live' && input.authorization.kind !== 'operator_approval') {
    throw new Error('live launch scope requires operator approval');
  }
  if (input.scope.executionMode === 'fixture' && input.authorization.kind !== 'fixture') {
    throw new Error('fixture launch scope requires fixture authorization');
  }
  const launchScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.scope);
  if (input.authorization.approvedLaunchScopeSha256 !== launchScopeSha256) {
    throw new Error('operator approval does not bind the exact launch scope');
  }
  return parseAdaptiveDevelopmentBenchmarkLaunchPlan({
    schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_LAUNCH_PLAN_VERSION,
    benchmarkId: input.scope.benchmarkId,
    manifestSha256: input.scope.manifestSha256,
    stageId: input.scope.stageId,
    executionMode: input.scope.executionMode,
    ...(input.scope.stageAdmission ? { stageAdmission: input.scope.stageAdmission } : {}),
    stageBudget: input.scope.stageBudget,
    launchScopeSha256,
    authorization: input.authorization,
    runs: input.scope.runs,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
