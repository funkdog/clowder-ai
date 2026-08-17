import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildAdaptiveDevelopmentBenchmarkLaunchPlan,
  buildAdaptiveDevelopmentBenchmarkLaunchScope,
  buildAdaptiveDevelopmentBenchmarkRunMatrix,
  fingerprintAdaptiveDevelopmentBenchmark,
  fingerprintAdaptiveDevelopmentStageAdmissionCandidate,
  parseAdaptiveDevelopmentBenchmarkEvidence,
  parseAdaptiveDevelopmentBenchmarkManifest,
  validateAdaptiveDevelopmentStageAdmission,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  adaptiveDevelopmentBenchmarkArtifactFacts,
  evaluateAdaptiveDevelopmentBenchmark,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-evaluator.js';
import {
  LocalAdaptiveDevelopmentBenchmarkArtifactStore,
  LocalAdaptiveDevelopmentBenchmarkEvidenceStore,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../../..');
const benchmarkManifestPath = join(
  repositoryRoot,
  'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
);
const replayManifestPath = join(here, 'fixtures/adaptive-sop-replay-manifest.json');
const manifest = JSON.parse(readFileSync(benchmarkManifestPath, 'utf8'));
const replayManifest = JSON.parse(readFileSync(replayManifestPath, 'utf8'));

const budgetByTask = {
  'local-stale-formatter-regression': { tokenPolicy: 'unbounded', wallTimeMsCap: 10_000 },
  'local-pwa-reconnect-input': { tokenPolicy: 'unbounded', wallTimeMsCap: 12_000 },
};
const environmentSha256 = fingerprintAdaptiveDevelopmentBenchmark('lf-0001-s0-controlled-environment');
const launchScope = buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, 's0-measurement-smoke', {
  executionMode: 'live',
  environmentSha256,
  budgetByTask,
  stageBudget: {
    tokenPolicy: 'unbounded',
    maximumInfrastructureRetryAttempts: 1,
  },
});
const launchPlanInput = {
  scope: launchScope,
  authorization: {
    kind: 'operator_approval',
    authorizedBy: 'co-creator',
    approvalRef: 'cat-cafe://message/lf-0001-s0-launch',
    approvalMessageSha256: fingerprintAdaptiveDevelopmentBenchmark('approved exact LF-0001 S0 launch scope'),
    approvedLaunchScopeSha256: fingerprintAdaptiveDevelopmentBenchmark(launchScope),
    approvedAt: '2026-08-02T16:00:00.000Z',
  },
};

function stageAdmissionFixture() {
  const parsed = parseAdaptiveDevelopmentBenchmarkManifest(manifest);
  const stage = parsed.stages.find((candidate) => candidate.id === 's1-long-horizon-directional');
  assert.ok(stage?.admissionRepetitions);
  const runnerCommit = 'c'.repeat(40);
  const oracleToolchainSha256 = fingerprintAdaptiveDevelopmentBenchmark('exact oracle toolchain');
  const scope = {
    schemaVersion: 'lf-0001.stage-admission-scope.v4',
    benchmarkId: parsed.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(parsed),
    runnerCommit,
    stageId: stage.id,
    admissionRepetitions: stage.admissionRepetitions,
    materializationSkillArmId: parsed.arms[0].id,
    oracleToolchainSha256,
    tasks: stage.taskIds.map((taskId) => {
      const task = parsed.tasks.find((candidate) => candidate.id === taskId);
      assert.ok(task?.oraclePolicy.goldOutcomeCommit);
      return {
        taskId,
        baseCommit: task.source.baseCommit,
        goldOutcomeCommit: task.oraclePolicy.goldOutcomeCommit,
        oraclePolicyId: task.oraclePolicy.id,
      };
    }),
  };
  const samples = stage.taskIds.flatMap((taskId) => {
    const task = parsed.tasks.find((candidate) => candidate.id === taskId);
    assert.ok(task?.oraclePolicy.goldProjectionPaths);
    const baselineCandidateTreeSha = fingerprintAdaptiveDevelopmentBenchmark(`${taskId}:baseline`).slice(0, 40);
    const goldCandidateTreeSha = fingerprintAdaptiveDevelopmentBenchmark(`${taskId}:gold`).slice(0, 40);
    return Array.from({ length: stage.admissionRepetitions }, (_, index) => index + 1).flatMap((repetition) => [
      {
        taskId,
        repetition,
        candidateKind: 'baseline',
        candidateTreeSha: baselineCandidateTreeSha,
        candidateIdentitySha256: fingerprintAdaptiveDevelopmentStageAdmissionCandidate({
          manifest: parsed,
          taskId,
          candidateKind: 'baseline',
          runnerCommit,
          candidateTreeSha: baselineCandidateTreeSha,
        }),
        appliedGoldPaths: [],
        oracle: {
          passed: false,
          checks: task.oraclePolicy.checks.map((check) => ({
            name: check.id,
            expectedExitCode: task.oraclePolicy.successExitCode,
            actualExitCode: 1,
            elapsedMs: 10,
          })),
        },
      },
      {
        taskId,
        repetition,
        candidateKind: 'gold_projection',
        candidateTreeSha: goldCandidateTreeSha,
        candidateIdentitySha256: fingerprintAdaptiveDevelopmentStageAdmissionCandidate({
          manifest: parsed,
          taskId,
          candidateKind: 'gold_projection',
          runnerCommit,
          candidateTreeSha: goldCandidateTreeSha,
        }),
        appliedGoldPaths: task.oraclePolicy.goldProjectionPaths,
        oracle: {
          passed: true,
          checks: task.oraclePolicy.checks.map((check) => ({
            name: check.id,
            expectedExitCode: task.oraclePolicy.successExitCode,
            actualExitCode: 0,
            elapsedMs: 10,
          })),
        },
      },
    ]);
  });
  const result = {
    schemaVersion: 'lf-0001.stage-admission-result.v3',
    scopeSha256: fingerprintAdaptiveDevelopmentBenchmark(scope),
    status: 'admitted',
    effectClaimEligible: false,
    tasks: stage.taskIds.map((taskId) => {
      const task = parsed.tasks.find((candidate) => candidate.id === taskId);
      assert.ok(task);
      return {
        taskId,
        admitted: true,
        baselineOracleVector: task.oraclePolicy.checks.map((check) => `${check.id}:1`).join('|'),
        goldOracleVector: task.oraclePolicy.checks.map((check) => `${check.id}:0`).join('|'),
      };
    }),
    samples,
  };
  return { parsed, stage, runnerCommit, oracleToolchainSha256, scope, result };
}

function buildEvidence(spec, launchPlanSha256, overrides = {}) {
  const evidence = {
    schemaVersion: 'lf-0001.development-benchmark-evidence.v4',
    benchmarkId: manifest.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
    runId: `run-${spec.runKey}`,
    stageId: spec.stageId,
    taskId: spec.taskId,
    armId: spec.armId,
    repetition: spec.repetition,
    attempt: 1,
    launchPlanSha256,
    candidate: {
      finalSha: (spec.armId === 'baseline_old_sop' ? 'a' : 'b').repeat(40),
      diffRef: `commit:${(spec.armId === 'baseline_old_sop' ? 'a' : 'b').repeat(40)}`,
      patchSha256: fingerprintAdaptiveDevelopmentBenchmark(`patch:${spec.runKey}`),
    },
    provenance: {
      runtimeCommit: spec.runtimeCommit,
      skillSnapshot: spec.skillSnapshot,
      taskInputSha256: spec.taskInputSha256,
      environmentSha256: spec.environmentSha256,
      attemptReservationSha256: fingerprintAdaptiveDevelopmentBenchmark(`reservation:${spec.runKey}`),
      model: spec.model,
    },
    budget: spec.budget,
    execution: {
      status: 'completed',
      startedAt: '2026-08-02T16:05:00.000Z',
      elapsedMs: spec.armId === 'baseline_old_sop' ? 1000 : 800,
      candidateReadyElapsedMs: spec.armId === 'baseline_old_sop' ? 800 : 600,
      agentEpisode: {
        mode: 'natural_agent_graph',
        rootSessionId: `executor-${spec.runKey}`,
        childSessionIds: [],
        collaborationToolCalls: 0,
      },
      outcomeCheckpoint: {
        claimed: 'achieved',
        summary: 'Completed the task and proportional verification.',
        verificationCommands: ['pnpm test'],
        reviewIntent: 'local_result',
        reviewState: 'pending',
        reviewUnit: `commit:${(spec.armId === 'baseline_old_sop' ? 'a' : 'b').repeat(40)}`,
      },
    },
    outcome: {
      claimed: 'achieved',
      oracle: 'passed',
      verificationExactBound: true,
      checkpointTruthful: true,
      judge: {
        verdict: 'sop_compliant',
        reviewDemand: 'not_required',
        observedReviewState: 'pending',
        exactBinding: true,
        blind: true,
        candidateSessionId: `executor-${spec.runKey}`,
        judgeSessionId: `judge-${spec.runKey}`,
        findings: { p1: 0, p2: 0, p3: 0 },
      },
    },
    safety: { hardInvariantMisses: [] },
    cost: {
      inputTokens: spec.armId === 'baseline_old_sop' ? 100 : 90,
      cachedInputTokens: 20,
      outputTokens: spec.armId === 'baseline_old_sop' ? 20 : 15,
      toolCalls: 4,
      failedToolCalls: 1,
      behavioralFailedToolCalls: 1,
      infrastructureFailedToolCalls: 0,
      usageComplete: true,
      accountedSessionIds: [`executor-${spec.runKey}`, `judge-${spec.runKey}`],
    },
    operatorInterventions: spec.armId === 'baseline_old_sop' ? 1 : 0,
    artifacts: [],
    ...overrides,
  };
  return evidence;
}

function withApprovedIndependentReview(evidence) {
  const reviewerSessionId = `reviewer-${evidence.runId}`;
  const requestEventId = `review-request-${evidence.runId}`;
  return {
    ...evidence,
    execution: {
      ...evidence.execution,
      agentEpisode: {
        ...evidence.execution.agentEpisode,
        childSessionIds: [reviewerSessionId],
        collaborationToolCalls: 1,
      },
      outcomeCheckpoint: {
        ...evidence.execution.outcomeCheckpoint,
        reviewIntent: 'formal_review',
        reviewState: 'reviewed',
      },
    },
    outcome: {
      ...evidence.outcome,
      judge: {
        ...evidence.outcome.judge,
        reviewDemand: 'required',
        observedReviewState: 'reviewed',
      },
      independentReview: {
        source: 'authenticated_runtime_observer',
        request: {
          eventId: requestEventId,
          authorSessionId: evidence.execution.agentEpisode.rootSessionId,
          candidateSha: evidence.candidate.finalSha,
          candidateDiffRef: evidence.candidate.diffRef,
          candidatePatchSha256: evidence.candidate.patchSha256,
        },
        verdict: {
          eventId: `review-verdict-${evidence.runId}`,
          requestEventId,
          reviewerSessionId,
          reviewerPrincipalId: `reviewer-principal-${evidence.runId}`,
          candidateSha: evidence.candidate.finalSha,
          candidateDiffRef: evidence.candidate.diffRef,
          candidatePatchSha256: evidence.candidate.patchSha256,
          state: 'approved',
          findings: { p1: 0, p2: 0, p3: 0 },
        },
      },
    },
    cost: {
      ...evidence.cost,
      accountedSessionIds: [...evidence.cost.accountedSessionIds, reviewerSessionId],
    },
  };
}

function buildRunSet(transform = (evidence) => evidence, planInput = launchPlanInput) {
  const evidenceByUri = new Map();
  const artifactByUri = new Map();
  const launchPlan = buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', planInput);
  const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
  const receipts = launchPlan.runs.map((spec) => {
    const evidence = attachIndependentArtifacts(transform(buildEvidence(spec, launchPlanSha256), spec), artifactByUri);
    const uri = `memory://trusted-runner/${spec.runKey}`;
    evidenceByUri.set(uri, evidence);
    return {
      schemaVersion: 'lf-0001.development-benchmark-receipt.v1',
      benchmarkId: manifest.benchmarkId,
      manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
      runId: evidence.runId,
      stageId: spec.stageId,
      taskId: spec.taskId,
      armId: spec.armId,
      repetition: spec.repetition,
      attempt: evidence.attempt,
      launchPlanSha256,
      ...(evidence.supersedesReceiptSha256 === undefined
        ? {}
        : { supersedesReceiptSha256: evidence.supersedesReceiptSha256 }),
      evidence: { uri, sha256: fingerprintAdaptiveDevelopmentBenchmark(evidence) },
    };
  });
  return {
    receipts,
    launchPlan,
    resolver: { resolve: (receipt) => evidenceByUri.get(receipt.evidence.uri) },
    artifactResolver: { resolve: (reference) => artifactByUri.get(reference.uri) },
    evidenceByUri,
    artifactByUri,
  };
}

function attachIndependentArtifacts(evidence, artifactByUri) {
  const kinds = ['launch_control', 'execution', 'oracle', 'outcome_checkpoint', 'telemetry', 'safety'];
  if (evidence.outcome.verificationExactBound) kinds.push('verification');
  kinds.push('judge');
  evidence.artifacts = kinds.map((kind) => {
    const artifact = {
      schemaVersion: 'lf-0001.development-benchmark-artifact.v2',
      benchmarkId: evidence.benchmarkId,
      manifestSha256: evidence.manifestSha256,
      runId: evidence.runId,
      stageId: evidence.stageId,
      taskId: evidence.taskId,
      armId: evidence.armId,
      repetition: evidence.repetition,
      attempt: evidence.attempt,
      launchPlanSha256: evidence.launchPlanSha256,
      kind,
      factsSha256: fingerprintAdaptiveDevelopmentBenchmark(
        adaptiveDevelopmentBenchmarkArtifactFacts(evidence, manifest, kind),
      ),
    };
    const uri = `memory://independent-artifact/${evidence.runId}/${kind}`;
    artifactByUri.set(uri, artifact);
    return { kind, uri, sha256: fingerprintAdaptiveDevelopmentBenchmark(artifact) };
  });
  return evidence;
}

function appendSuccessfulRetry(runSet, firstReceipt, retryStartedAt) {
  const spec = runSet.launchPlan.runs.find(
    (candidate) =>
      candidate.stageId === firstReceipt.stageId &&
      candidate.taskId === firstReceipt.taskId &&
      candidate.armId === firstReceipt.armId &&
      candidate.repetition === firstReceipt.repetition,
  );
  assert.ok(spec);
  const firstEvidence = runSet.evidenceByUri.get(firstReceipt.evidence.uri);
  assert.ok(firstEvidence);
  const startedAt =
    retryStartedAt ??
    new Date(Date.parse(firstEvidence.execution.startedAt) + firstEvidence.execution.elapsedMs).toISOString();
  const retryEvidence = buildEvidence(spec, fingerprintAdaptiveDevelopmentBenchmark(runSet.launchPlan), {
    runId: `${firstReceipt.runId}:retry-1`,
    attempt: 2,
    supersedesReceiptSha256: fingerprintAdaptiveDevelopmentBenchmark(firstReceipt),
  });
  retryEvidence.execution = { ...retryEvidence.execution, startedAt };
  const evidence = attachIndependentArtifacts(retryEvidence, runSet.artifactByUri);
  const uri = `memory://trusted-runner/${spec.runKey}:attempt-2`;
  runSet.evidenceByUri.set(uri, evidence);
  const receipt = {
    schemaVersion: 'lf-0001.development-benchmark-receipt.v1',
    benchmarkId: evidence.benchmarkId,
    manifestSha256: evidence.manifestSha256,
    runId: evidence.runId,
    stageId: evidence.stageId,
    taskId: evidence.taskId,
    armId: evidence.armId,
    repetition: evidence.repetition,
    attempt: evidence.attempt,
    launchPlanSha256: evidence.launchPlanSha256,
    supersedesReceiptSha256: evidence.supersedesReceiptSha256,
    evidence: { uri, sha256: fingerprintAdaptiveDevelopmentBenchmark(evidence) },
  };
  runSet.receipts.push(receipt);
  return receipt;
}

describe('LF-0001 adaptive development behavioral benchmark', () => {
  it('pre-registers one red/green calibration and one paired S1 cohort without an effect claim', () => {
    const parsed = parseAdaptiveDevelopmentBenchmarkManifest(manifest);
    const stage = parsed.stages.find((candidate) => candidate.id === 's1-long-horizon-directional');
    assert.ok(stage);
    assert.equal(stage.kind, 'exploratory');
    assert.equal(stage.horizon, 'long');
    assert.equal(stage.wallTimeMsCap, 2_700_000);
    assert.equal(stage.repetitionsPerArm, 1);
    assert.equal(stage.admissionRepetitions, 1);
    assert.equal(stage.maximumRuns, 8);
    assert.equal(stage.effectClaimEligible, false);
    assert.equal(stage.automaticScale, false);

    const specs = buildAdaptiveDevelopmentBenchmarkRunMatrix(parsed, stage.id);
    assert.equal(specs.length, 8);
    for (let index = 0; index < specs.length; index += 2) {
      const pair = specs.slice(index, index + 2);
      assert.equal(pair[0].taskId, pair[1].taskId);
      assert.equal(pair[0].repetition, pair[1].repetition);
      assert.deepEqual(new Set(pair.map((spec) => spec.armId)), new Set(['baseline_old_sop', 'treatment_new_sop']));
    }
    const scope = buildAdaptiveDevelopmentBenchmarkLaunchScope(parsed, stage.id, {
      executionMode: 'fixture',
      environmentSha256: fingerprintAdaptiveDevelopmentBenchmark('lf-0001-s1-controlled-environment'),
      budgetByTask: Object.fromEntries(
        stage.taskIds.map((taskId) => [taskId, { tokenPolicy: 'unbounded', wallTimeMsCap: stage.wallTimeMsCap }]),
      ),
      stageBudget: { tokenPolicy: 'unbounded', maximumInfrastructureRetryAttempts: 1 },
    });
    assert.equal(scope.runs.length, 8);
    assert.ok(scope.runs.every((run) => run.budget.wallTimeMsCap === 2_700_000));

    const selectedTasks = stage.taskIds.map((taskId) => parsed.tasks.find((task) => task.id === taskId));
    assert.ok(selectedTasks.every(Boolean));
    for (const task of selectedTasks) {
      assert.equal(task.complexity, 'large');
      assert.equal(task.materializationMode, 'full_base_commit');
      assert.equal(task.horizonProfile.decisionDepth, 'long');
      assert.deepEqual(
        new Set(task.horizonProfile.requiredDimensions),
        new Set(['diagnosis', 'replanning', 'cross_layer_change', 'verification_review_convergence']),
      );
      assert.ok(task.oraclePolicy.hiddenTestPatch.paths.length >= 2);
      assert.deepEqual(task.oraclePolicy.goldProjectionPaths, task.allowedChangedPaths);
      assert.ok(task.oraclePolicy.checks.length >= 1);
    }
    const persistentPathChecks = selectedTasks.find((task) => task.id === 'long-disposable-checkout-writes')
      .oraclePolicy.checks;
    const persistentPathTask = selectedTasks.find((task) => task.id === 'long-disposable-checkout-writes');
    assert.deepEqual(
      persistentPathTask.oraclePolicy.observableBehaviors.map((behavior) => behavior.id),
      [
        'runtime-root-and-descendant-remap',
        'workspace-containment',
        'stale-runtime-fail-closed',
        'filtered-read-isolation',
      ],
    );
    assert.ok(
      parsed.convergenceCanary.oracleBehaviorRationale.some((outcome) => outcome.includes('symlink')),
      'the internal oracle rationale must cover workspace containment',
    );
    assert.ok(
      parsed.convergenceCanary.oracleBehaviorRationale.some((outcome) => outcome.includes('unrelated unmappable')),
      'the internal oracle rationale must cover filtered-read isolation',
    );
    assert.doesNotMatch(
      persistentPathChecks.map((check) => JSON.stringify(check)).join('\n'),
      /resolvePersistentProjectPathDetailed|migrateStoredProjectPath/,
      'the hidden oracle must not require candidate-owned helper names',
    );
    assert.deepEqual(
      persistentPathChecks.map((check) => check.id),
      persistentPathTask.oraclePolicy.observableBehaviors.map((behavior) => behavior.id),
    );
    assert.ok(persistentPathChecks.every((check) => check.behaviorBundle.sourcePath));
    const invocationChecks = selectedTasks.find((task) => task.id === 'long-invocation-interrupt-self-heal')
      .oraclePolicy.checks;
    assert.match(invocationChecks[0].nodeArgs.join(' '), /resume failure classification/);
    const providerTask = selectedTasks.find((task) => task.id === 'long-provider-native-effort');
    assert.equal(providerTask.oraclePolicy.checks[0].workingDirectory, 'packages/shared');
    assert.equal(providerTask.oraclePolicy.checks[2].id, 'provider-effort-hub');
    assert.match(providerTask.oraclePolicy.checks[2].behaviorBundle.source, /initialState/);
    assert.match(providerTask.oraclePolicy.checks[2].behaviorBundle.source, /AdvancedRuntimeSection/);

    assert.deepEqual(parsed.convergenceCanary, {
      id: 'real-agent-sop-outcome-v3',
      taskId: 'long-disposable-checkout-writes',
      armId: 'treatment_new_sop',
      maximumRepairRounds: 0,
      effectClaimEligible: false,
      candidateExecution: {
        mode: 'single_real_sop_episode',
        formalReview: 'conditional_inside_episode',
      },
      postHocJudge: {
        timing: 'after_candidate_freeze',
        purpose: 'sop_compliance_measurement',
        candidateIntervention: 'none',
        feedbackToCandidate: 'none',
        workspace: 'isolated_candidate_snapshot',
        filesystemAccess: 'write',
        acceptanceSource: 'original_task',
        armIdentity: 'hidden',
        requiredEvidence: ['reproduced_test_failure', 'static_proof'],
      },
      oracleBehaviorRationale: [
        'Existing runtime roots and descendants map to their corresponding persistent workspace paths at every public route boundary.',
        'A mapped descendant must resolve inside the persistent workspace even when symlinks are present.',
        'A stored missing runtime descendant is reset and persisted as the safe default project without failing unrelated list results.',
        'A project-filtered list migrates only matching records; an unrelated unmappable record cannot fail or mutate that request.',
      ],
      successGate: ['behavior_oracle_passed', 'sop_judge_passed', 'hard_invariants_passed'],
      oracleSpecificity: {
        candidateKinds: ['baseline', 'gold_projection', 'behavior_equivalent_alternate'],
        singleFaultMutations: [
          {
            id: 'collapse-runtime-descendant-remap',
            targetBehaviorIds: ['runtime-root-and-descendant-remap'],
          },
          { id: 'allow-workspace-symlink-escape', targetBehaviorIds: ['workspace-containment'] },
          { id: 'migrate-unrelated-filtered-records', targetBehaviorIds: ['filtered-read-isolation'] },
          { id: 'expose-stale-runtime-descendant', targetBehaviorIds: ['stale-runtime-fail-closed'] },
        ],
      },
    });

    const uncalibrated = structuredClone(manifest);
    delete uncalibrated.stages.find((candidate) => candidate.id === stage.id).admissionRepetitions;
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkManifest(uncalibrated),
      /at least one red\/green admission calibration/,
    );

    const goldless = structuredClone(manifest);
    delete goldless.tasks.find((task) => task.id === stage.taskIds[0]).oraclePolicy.goldOutcomeCommit;
    assert.throws(() => parseAdaptiveDevelopmentBenchmarkManifest(goldless), /grader-only gold outcome commit/);

    const implicitProjection = structuredClone(manifest);
    delete implicitProjection.tasks.find((task) => task.id === stage.taskIds[0]).oraclePolicy.goldProjectionPaths;
    assert.throws(() => parseAdaptiveDevelopmentBenchmarkManifest(implicitProjection), /explicit gold projection/);

    const escapedProjection = structuredClone(manifest);
    escapedProjection.tasks
      .find((task) => task.id === stage.taskIds[0])
      .oraclePolicy.goldProjectionPaths.push('packages/not-allowed.ts');
    assert.throws(() => parseAdaptiveDevelopmentBenchmarkManifest(escapedProjection), /allowed write surface/);

    const shallow = structuredClone(manifest);
    shallow.tasks.find((task) => task.id === stage.taskIds[0]).horizonProfile.requiredDimensions = [
      'diagnosis',
      'diagnosis',
      'cross_layer_change',
      'verification_review_convergence',
    ];
    assert.throws(() => parseAdaptiveDevelopmentBenchmarkManifest(shallow), /four distinct horizon dimensions/);

    const escapedOracle = structuredClone(manifest);
    escapedOracle.tasks.find((task) => task.id === stage.taskIds[0]).oraclePolicy.checks[0].workingDirectory = '..';
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkManifest(escapedOracle),
      /oracle working directory must stay within the candidate repository/,
    );

    const implementationShapedOracle = structuredClone(manifest);
    implementationShapedOracle.tasks.find(
      (task) => task.id === implementationShapedOracle.convergenceCanary.taskId,
    ).oraclePolicy.checks[0].id = 'candidate-helper-name';
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkManifest(implementationShapedOracle),
      /checks must match the declared observable behaviors exactly/,
    );

    const unrelatedMutation = structuredClone(manifest);
    unrelatedMutation.convergenceCanary.oracleSpecificity.singleFaultMutations[0].targetBehaviorIds = [
      'undeclared-behavior',
    ];
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkManifest(unrelatedMutation),
      /single-fault mutation targets must name declared observable behaviors/,
    );

    const incompleteMutationCoverage = structuredClone(manifest);
    incompleteMutationCoverage.convergenceCanary.oracleSpecificity.singleFaultMutations.shift();
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkManifest(incompleteMutationCoverage),
      /mutation targets must cover every declared observable behavior/,
    );
  });

  it('binds S1 live scope to one complete admitted artifact and rejects missing, rejected, stale, or mismatched evidence', () => {
    const { parsed, stage, runnerCommit, oracleToolchainSha256, scope, result } = stageAdmissionFixture();
    assert.equal(result.samples.length, 8);
    assert.deepEqual(new Set(result.samples.map((sample) => sample.repetition)), new Set([1]));
    const resultArtifact = `${JSON.stringify(result, null, 2)}\n`;
    const binding = validateAdaptiveDevelopmentStageAdmission({
      manifest: parsed,
      stageId: stage.id,
      expectedRunnerCommit: runnerCommit,
      expectedOracleToolchainSha256: oracleToolchainSha256,
      scope,
      resultArtifact,
    });
    const stageBudgetByTask = Object.fromEntries(
      stage.taskIds.map((taskId) => [taskId, { tokenPolicy: 'unbounded', wallTimeMsCap: stage.wallTimeMsCap }]),
    );
    const stageBudget = { tokenPolicy: 'unbounded', maximumInfrastructureRetryAttempts: 1 };
    assert.throws(
      () =>
        buildAdaptiveDevelopmentBenchmarkLaunchScope(parsed, stage.id, {
          executionMode: 'live',
          environmentSha256,
          budgetByTask: stageBudgetByTask,
          stageBudget,
        }),
      /requires a validated stage admission binding/,
    );
    const boundScope = buildAdaptiveDevelopmentBenchmarkLaunchScope(parsed, stage.id, {
      executionMode: 'live',
      environmentSha256,
      budgetByTask: stageBudgetByTask,
      stageAdmission: binding,
      stageBudget,
    });
    assert.deepEqual(boundScope.stageAdmission, binding);

    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify({ ...result, status: 'rejected' }, null, 2)}\n`,
        }),
      /not admitted/,
    );
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: 'd'.repeat(40),
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact,
        }),
      /stale/,
    );
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: 'd'.repeat(64),
          scope,
          resultArtifact,
        }),
      /stale/,
    );
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify({ ...result, scopeSha256: 'e'.repeat(64) }, null, 2)}\n`,
        }),
      /does not bind its exact scope/,
    );
    const incompleteResult = { ...result, samples: result.samples.slice(1) };
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify(incompleteResult, null, 2)}\n`,
        }),
      /complete task\/sample matrix/,
    );
    const partialGoldResult = structuredClone(result);
    partialGoldResult.samples.find((sample) => sample.candidateKind === 'gold_projection').appliedGoldPaths = [];
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify(partialGoldResult, null, 2)}\n`,
        }),
      /exact gold projection/,
    );

    const forgedCandidateIdentity = structuredClone(result);
    for (const sample of forgedCandidateIdentity.samples) sample.candidateIdentitySha256 = 'f'.repeat(64);
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify(forgedCandidateIdentity, null, 2)}\n`,
        }),
      /candidate identity/,
    );

    const forgedLegacyCandidateSha = structuredClone(result);
    forgedLegacyCandidateSha.samples[0].candidateSha = 'f'.repeat(40);
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify(forgedLegacyCandidateSha, null, 2)}\n`,
        }),
      /candidateSha/,
    );

    const inventedOracleCheck = structuredClone(result);
    const forgedTaskId = stage.taskIds[0];
    for (const sample of inventedOracleCheck.samples.filter((candidate) => candidate.taskId === forgedTaskId)) {
      sample.oracle.checks[0].name = 'invented-check';
    }
    const forgedSummary = inventedOracleCheck.tasks.find((candidate) => candidate.taskId === forgedTaskId);
    forgedSummary.baselineOracleVector = 'invented-check:1';
    forgedSummary.goldOracleVector = 'invented-check:0';
    assert.throws(
      () =>
        validateAdaptiveDevelopmentStageAdmission({
          manifest: parsed,
          stageId: stage.id,
          expectedRunnerCommit: runnerCommit,
          expectedOracleToolchainSha256: oracleToolchainSha256,
          scope,
          resultArtifact: `${JSON.stringify(inventedOracleCheck, null, 2)}\n`,
        }),
      /oracle check identity/,
    );
  });

  it('binds S1 model inputs to replay candidates while keeping grader-only gold data out of launch specs', () => {
    const selectedFixtureIds = new Set([
      'sop-replay-invocation-interrupt-self-heal',
      'sop-replay-disposable-checkout-writes',
      'sop-replay-provider-native-effort',
      'sop-replay-github-delivery-truth',
    ]);
    const replayByFixtureId = new Map(
      replayManifest.candidates
        .filter((candidate) => selectedFixtureIds.has(candidate.fixtureId))
        .map((candidate) => [candidate.fixtureId, candidate]),
    );
    assert.equal(replayByFixtureId.size, 4);
    const parsed = parseAdaptiveDevelopmentBenchmarkManifest(manifest);
    const stage = parsed.stages.find((candidate) => candidate.id === 's1-long-horizon-directional');
    assert.ok(stage);
    for (const taskId of stage.taskIds) {
      const task = parsed.tasks.find((candidate) => candidate.id === taskId);
      assert.ok(task);
      const replay = replayByFixtureId.get(task.source.fixtureId);
      assert.ok(replay);
      assert.deepEqual(task.executorInput, replay.modelInput);
      assert.equal(task.source.baseCommit, replay.graderOnly.provenance.baseCommit);
      assert.equal(task.source.sourcePullRequest, replay.graderOnly.provenance.sourcePullRequest);
      assert.equal(task.oraclePolicy.goldOutcomeCommit, replay.graderOnly.provenance.outcomeCommit);
      assert.equal(task.oraclePolicy.hiddenTestPatch.commit, replay.graderOnly.provenance.outcomeCommit);
      for (const path of replay.graderOnly.outcomeEvidence.testPaths) {
        assert.ok(task.oraclePolicy.hiddenTestPatch.paths.includes(path));
      }
    }

    const launchProjection = JSON.stringify(buildAdaptiveDevelopmentBenchmarkRunMatrix(parsed, stage.id));
    for (const replay of replayByFixtureId.values()) {
      assert.equal(launchProjection.includes(replay.graderOnly.provenance.outcomeCommit), false);
      assert.equal(launchProjection.includes(replay.graderOnly.graderProfileIds[0]), false);
    }
    assert.ok(
      buildAdaptiveDevelopmentBenchmarkRunMatrix(parsed, stage.id).every(
        (spec) => !Object.hasOwn(spec, 'oraclePolicy') && !Object.hasOwn(spec, 'hiddenTestPatch'),
      ),
    );
  });

  it('pins exact old/new Skill objects and a four-run non-claiming S0 matrix', () => {
    const parsed = parseAdaptiveDevelopmentBenchmarkManifest(manifest);
    const specs = buildAdaptiveDevelopmentBenchmarkRunMatrix(parsed, 's0-measurement-smoke');

    assert.equal(specs.length, 4);
    assert.equal(new Set(specs.map((spec) => spec.runKey)).size, 4);
    assert.deepEqual(
      new Set(specs.map((spec) => spec.taskId)),
      new Set(['local-stale-formatter-regression', 'local-pwa-reconnect-input']),
    );
    assert.deepEqual(new Set(specs.map((spec) => spec.armId)), new Set(['baseline_old_sop', 'treatment_new_sop']));
    assert.equal(parsed.stages[0].effectClaimEligible, false);
    assert.equal(parsed.stages[0].automaticScale, false);
    assert.equal(parsed.budgetPolicy.tokenPolicy, 'unbounded');
    assert.equal(Object.hasOwn(parsed.budgetPolicy, 'hardCeilingRequiredBeforeLaunch'), false);

    for (const arm of parsed.arms) {
      const actualBlob = execFileSync('git', ['rev-parse', `${arm.skillSnapshot.commit}:${arm.skillSnapshot.path}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim();
      assert.equal(actualBlob, arm.skillSnapshot.blobObjectId);
    }
    assert.notEqual(parsed.arms[0].skillSnapshot.blobObjectId, parsed.arms[1].skillSnapshot.blobObjectId);
  });

  it('does not materialize a launch plan until every task pair has an explicit unbounded policy and deadline', () => {
    assert.throws(
      () => buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', {}),
      /authorization|environment|budget/i,
    );
    const launchPlan = buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', launchPlanInput);

    assert.equal(launchPlan.runs.length, 4);
    assert.equal(launchPlan.authorization.kind, 'operator_approval');
    assert.equal(launchPlan.manifestSha256, fingerprintAdaptiveDevelopmentBenchmark(manifest));
    for (const taskId of manifest.stages[0].taskIds) {
      const pair = launchPlan.runs.filter((spec) => spec.taskId === taskId);
      assert.equal(pair.length, 2);
      assert.deepEqual(pair[0].budget, pair[1].budget);
      assert.equal(pair[0].environmentSha256, pair[1].environmentSha256);
    }
    assert.throws(
      () =>
        buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, 's0-measurement-smoke', {
          executionMode: 'live',
          environmentSha256,
          budgetByTask: {
            ...budgetByTask,
            'local-stale-formatter-regression': { tokenPolicy: 'capped', wallTimeMsCap: 10_000 },
          },
          stageBudget: launchScope.stageBudget,
        }),
      /Invalid literal value|tokenPolicy/,
    );
  });

  it('binds live authorization to one exact stage scope and keeps fixture plans non-scoring', () => {
    assert.throws(
      () =>
        buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', {
          ...launchPlanInput,
          authorization: {
            ...launchPlanInput.authorization,
            approvedLaunchScopeSha256: fingerprintAdaptiveDevelopmentBenchmark('another scope'),
          },
        }),
      /exact launch scope/,
    );
    assert.throws(
      () =>
        buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, 's0-measurement-smoke', {
          executionMode: 'live',
          environmentSha256,
          budgetByTask,
          stageBudget: { ...launchScope.stageBudget, maximumInfrastructureRetryAttempts: 2 },
        }),
      /retry attempts exceed/,
    );
    const fixtureScope = buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, 's0-measurement-smoke', {
      executionMode: 'fixture',
      environmentSha256,
      budgetByTask,
      stageBudget: launchScope.stageBudget,
    });
    const fixturePlan = buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', {
      scope: fixtureScope,
      authorization: {
        kind: 'fixture',
        fixtureId: 'deterministic-test',
        approvedLaunchScopeSha256: fingerprintAdaptiveDevelopmentBenchmark(fixtureScope),
        approvedAt: '2026-08-02T16:00:00.000Z',
      },
    });
    assert.throws(
      () => evaluateAdaptiveDevelopmentBenchmark(manifest, [], 's0-measurement-smoke', fixturePlan),
      /non-scoring/,
    );
  });

  it('reuses historical model inputs exactly and never projects oracle policy to executors', () => {
    const specs = buildAdaptiveDevelopmentBenchmarkRunMatrix(manifest, 's0-measurement-smoke');
    for (const task of manifest.tasks.filter((candidate) => candidate.source.kind === 'local_history')) {
      const source = replayManifest.candidates.find((candidate) => candidate.fixtureId === task.source.fixtureId);
      assert.ok(source, `missing replay fixture ${task.source.fixtureId}`);
      assert.deepEqual(task.executorInput, source.modelInput);
      assert.equal(task.source.baseCommit, source.graderOnly.provenance.baseCommit);
      assert.equal(task.source.sourcePullRequest, source.graderOnly.provenance.sourcePullRequest);
    }
    for (const spec of specs) {
      assert.equal(Object.hasOwn(spec, 'oraclePolicy'), false);
      assert.equal(JSON.stringify(spec.executorInput).includes('successExitCode'), false);
      assert.equal(JSON.stringify(spec.executorInput).includes('outcomeCommit'), false);
    }
  });

  it('pins an external JS task without allowing candidate-only work into S0', () => {
    const external = manifest.tasks.find((task) => task.id === 'external-swebench-multilingual-axios-4738');
    assert.ok(external);
    assert.equal(external.readiness, 'candidate');
    assert.equal(external.source.datasetId, 'SWE-bench/SWE-bench_Multilingual');
    assert.equal(external.source.datasetRevision, 'e5c585e008e2cb5eecc7c64192d855c53279d788');
    assert.equal(external.source.instanceId, 'axios__axios-4738');
    assert.equal(JSON.stringify(external.executorInput).includes('test_patch'), false);
    assert.equal(JSON.stringify(external.executorInput).includes('gold patch'), true);
    assert.equal(manifest.stages[0].taskIds.includes(external.id), false);

    const unsafe = structuredClone(manifest);
    unsafe.stages[0].taskIds[0] = external.id;
    assert.throws(() => parseAdaptiveDevelopmentBenchmarkManifest(unsafe), /candidate-only task/);
  });

  it('summarizes externally verified outcomes but refuses an S0 effect or automatic-scale claim', () => {
    const { receipts, launchPlan, resolver, artifactResolver } = buildRunSet();
    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      receipts,
      's0-measurement-smoke',
      launchPlan,
      resolver,
      artifactResolver,
    );

    assert.equal(result.status, 'measurement_smoke_complete');
    assert.equal(result.effectClaimEligible, false);
    assert.equal(result.automaticScale, false);
    assert.equal(result.scaleDecision, 'operator_decision_required');
    assert.deepEqual(result.stopReasons, []);
    assert.deepEqual(result.incompleteReasons, []);
    assert.equal(result.arms.baseline_old_sop.runCount, 2);
    assert.equal(result.arms.treatment_new_sop.runCount, 2);
    assert.equal(result.arms.baseline_old_sop.nonInfrastructureRunCount, 2);
    assert.equal(result.arms.treatment_new_sop.infrastructureErrorCount, 0);
    assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessCount, 2);
    assert.equal(result.arms.treatment_new_sop.externallyVerifiedSuccessCount, 2);
    assert.equal(result.comparison.externallyVerifiedSuccessRateDeltaPp, 0);
    assert.equal(result.comparison.medianCandidateReadyElapsedDeltaPct, -25);
    assert.equal(result.comparison.tokensPerVerifiedSuccessDeltaPct, -15);
    assert.equal(result.comparison.operatorInterventionsDelta, -2);
    assert.equal(Object.hasOwn(result, 'winner'), false);
    assert.equal(Object.hasOwn(result, 'promote'), false);
  });

  it('keeps missing runs or unresolved evidence insufficient', () => {
    const runSet = buildRunSet();
    const missingRun = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts.slice(1),
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );
    assert.equal(missingRun.status, 'insufficient_evidence');
    assert.ok(missingRun.incompleteReasons.some((reason) => reason.startsWith('missing run ')));

    const unresolved = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      { resolve: () => undefined },
    );
    assert.equal(unresolved.status, 'insufficient_evidence');
    assert.equal(unresolved.arms.baseline_old_sop.runCount, 0);

    const selfResolvedOnly = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
    );
    assert.equal(selfResolvedOnly.status, 'insufficient_evidence');
    assert.ok(selfResolvedOnly.incompleteReasons.some((reason) => reason.startsWith('artifact resolver unavailable')));
  });

  it('reports infrastructure errors without putting them in the effect denominator', () => {
    const runSet = buildRunSet((evidence, spec) =>
      spec.armId === 'baseline_old_sop' && spec.taskId === 'local-stale-formatter-regression'
        ? {
            ...evidence,
            execution: { ...evidence.execution, status: 'infrastructure_error' },
            outcome: {
              ...evidence.outcome,
              claimed: 'not_achieved',
              oracle: 'not_run',
              verificationExactBound: false,
              judge: {
                ...evidence.outcome.judge,
                verdict: 'sop_noncompliant',
                reviewDemand: 'indeterminate',
                observedReviewState: 'unknown',
                exactBinding: false,
              },
            },
          }
        : evidence,
    );
    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );

    assert.equal(result.status, 'insufficient_evidence');
    assert.equal(result.arms.baseline_old_sop.runCount, 2);
    assert.equal(result.arms.baseline_old_sop.nonInfrastructureRunCount, 1);
    assert.equal(result.arms.baseline_old_sop.infrastructureErrorCount, 1);
    assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessRate, 1);
  });

  it('preserves one infrastructure failure while selecting its authorized retry for the effect denominator', () => {
    const runSet = buildRunSet((evidence, spec) =>
      spec.armId === 'baseline_old_sop' && spec.taskId === 'local-stale-formatter-regression'
        ? {
            ...evidence,
            execution: { ...evidence.execution, status: 'infrastructure_error' },
            outcome: {
              ...evidence.outcome,
              claimed: 'not_achieved',
              oracle: 'not_run',
              verificationExactBound: false,
              judge: {
                ...evidence.outcome.judge,
                verdict: 'sop_noncompliant',
                reviewDemand: 'indeterminate',
                observedReviewState: 'unknown',
                exactBinding: false,
              },
            },
          }
        : evidence,
    );
    const firstReceipt = runSet.receipts.find(
      (receipt) => receipt.armId === 'baseline_old_sop' && receipt.taskId === 'local-stale-formatter-regression',
    );
    assert.ok(firstReceipt);
    appendSuccessfulRetry(runSet, firstReceipt);

    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );

    assert.equal(result.status, 'measurement_smoke_complete');
    assert.equal(result.arms.baseline_old_sop.runCount, 3);
    assert.equal(result.arms.baseline_old_sop.nonInfrastructureRunCount, 2);
    assert.equal(result.arms.baseline_old_sop.infrastructureErrorCount, 1);
    assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessCount, 2);
    assert.equal(
      result.incompleteReasons.some((reason) => reason.startsWith('infrastructure error')),
      false,
    );

    const retryReceipt = runSet.receipts.at(-1);
    assert.ok(retryReceipt);
    const retryEvidence = runSet.evidenceByUri.get(retryReceipt.evidence.uri);
    assert.ok(retryEvidence);
    retryEvidence.execution = {
      ...retryEvidence.execution,
      startedAt: '2026-08-02T16:05:00.000Z',
    };
    attachIndependentArtifacts(retryEvidence, runSet.artifactByUri);
    retryReceipt.evidence.sha256 = fingerprintAdaptiveDevelopmentBenchmark(retryEvidence);
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          runSet.receipts,
          's0-measurement-smoke',
          runSet.launchPlan,
          runSet.resolver,
          runSet.artifactResolver,
        ),
      /retry cannot start before the initial attempt finished/,
    );

    const invalidRetry = buildRunSet();
    appendSuccessfulRetry(invalidRetry, invalidRetry.receipts[0]);
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          invalidRetry.receipts,
          's0-measurement-smoke',
          invalidRetry.launchPlan,
          invalidRetry.resolver,
          invalidRetry.artifactResolver,
        ),
      /retry requires an infrastructure error/,
    );
  });

  it('rejects tampering and paired budget divergence', () => {
    const tampered = buildRunSet();
    const first = tampered.receipts[0];
    tampered.evidenceByUri.get(first.evidence.uri).cost.inputTokens += 1;
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          tampered.receipts,
          's0-measurement-smoke',
          tampered.launchPlan,
          tampered.resolver,
          tampered.artifactResolver,
        ),
      /evidence fingerprint mismatch/,
    );

    const selfSigned = buildRunSet();
    const selfSignedReceipt = selfSigned.receipts[0];
    const selfSignedEvidence = selfSigned.evidenceByUri.get(selfSignedReceipt.evidence.uri);
    selfSignedEvidence.candidate = {
      finalSha: 'c'.repeat(40),
      diffRef: `commit:${'c'.repeat(40)}`,
      patchSha256: 'c'.repeat(64),
    };
    selfSignedReceipt.evidence.sha256 = fingerprintAdaptiveDevelopmentBenchmark(selfSignedEvidence);
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          selfSigned.receipts,
          's0-measurement-smoke',
          selfSigned.launchPlan,
          selfSigned.resolver,
          selfSigned.artifactResolver,
        ),
      /artifact facts mismatch/,
    );

    const divergent = buildRunSet((evidence, spec) =>
      spec.armId === 'treatment_new_sop' && spec.taskId === 'local-stale-formatter-regression'
        ? { ...evidence, budget: { ...evidence.budget, wallTimeMsCap: 9_999 } }
        : evidence,
    );
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          divergent.receipts,
          's0-measurement-smoke',
          divergent.launchPlan,
          divergent.resolver,
          divergent.artifactResolver,
        ),
      /launch plan budget mismatch/,
    );

    const forgedControls = buildRunSet();
    const forgedReceipt = forgedControls.receipts[0];
    const forgedEvidence = forgedControls.evidenceByUri.get(forgedReceipt.evidence.uri);
    forgedEvidence.budget = { tokenPolicy: 'unbounded', wallTimeMsCap: 999_999_999 };
    forgedEvidence.provenance.environmentSha256 = fingerprintAdaptiveDevelopmentBenchmark('forged-environment');
    attachIndependentArtifacts(forgedEvidence, forgedControls.artifactByUri);
    forgedReceipt.evidence.sha256 = fingerprintAdaptiveDevelopmentBenchmark(forgedEvidence);
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          forgedControls.receipts,
          's0-measurement-smoke',
          forgedControls.launchPlan,
          forgedControls.resolver,
          forgedControls.artifactResolver,
        ),
      /launch plan (budget|environment) mismatch/,
    );

    const lateAuthorization = buildRunSet((evidence) => evidence, {
      ...launchPlanInput,
      authorization: { ...launchPlanInput.authorization, approvedAt: '2026-08-02T17:00:00.000Z' },
    });
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          lateAuthorization.receipts,
          's0-measurement-smoke',
          lateAuthorization.launchPlan,
          lateAuthorization.resolver,
          lateAuthorization.artifactResolver,
        ),
      /not authorized before execution/,
    );

    const simultaneousAuthorization = buildRunSet((evidence) => evidence, {
      ...launchPlanInput,
      authorization: { ...launchPlanInput.authorization, approvedAt: '2026-08-02T16:05:00.000Z' },
    });
    assert.throws(
      () =>
        evaluateAdaptiveDevelopmentBenchmark(
          manifest,
          simultaneousAuthorization.receipts,
          's0-measurement-smoke',
          simultaneousAuthorization.launchPlan,
          simultaneousAuthorization.resolver,
          simultaneousAuthorization.artifactResolver,
        ),
      /not authorized before execution/,
    );
  });

  it('rejects incomplete or inconsistent failed-tool telemetry', () => {
    const runSet = buildRunSet();
    const evidence = structuredClone(runSet.evidenceByUri.values().next().value);
    assert.ok(evidence);
    delete evidence.cost.infrastructureFailedToolCalls;
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkEvidence(evidence),
      /failed tool-call telemetry must be complete and internally consistent/,
    );

    evidence.cost.infrastructureFailedToolCalls = 1;
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkEvidence(evidence),
      /failed tool-call telemetry must be complete and internally consistent/,
    );
  });

  it('fails closed on invalid post-hoc Judge passes', () => {
    for (const judgePatch of [{ reviewDemand: 'indeterminate' }, { blind: false }, { exactBinding: false }]) {
      const runSet = buildRunSet((evidence) => ({
        ...evidence,
        outcome: {
          ...evidence.outcome,
          judge: { ...evidence.outcome.judge, ...judgePatch },
        },
      }));
      const result = evaluateAdaptiveDevelopmentBenchmark(
        manifest,
        runSet.receipts,
        's0-measurement-smoke',
        runSet.launchPlan,
        runSet.resolver,
        runSet.artifactResolver,
      );
      assert.equal(result.status, 'insufficient_evidence');
      assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessCount, 0);
      assert.equal(result.arms.baseline_old_sop.sopJudgePassCount, 0);
      assert.ok(result.incompleteReasons.some((reason) => reason.startsWith('invalid post-hoc Judge pass')));
    }
  });

  it('fails closed on conditional Review state mismatches', () => {
    const cases = [
      {
        reviewDemand: 'required',
        observedReviewState: 'pending',
        checkpointReviewState: 'pending',
      },
      {
        reviewDemand: 'not_required',
        observedReviewState: 'reviewed',
        checkpointReviewState: 'reviewed',
      },
    ];
    for (const testCase of cases) {
      const runSet = buildRunSet((evidence) => ({
        ...evidence,
        execution: {
          ...evidence.execution,
          outcomeCheckpoint: {
            ...evidence.execution.outcomeCheckpoint,
            reviewIntent: testCase.checkpointReviewState === 'reviewed' ? 'formal_review' : 'local_result',
            reviewState: testCase.checkpointReviewState,
          },
        },
        outcome: {
          ...evidence.outcome,
          judge: {
            ...evidence.outcome.judge,
            reviewDemand: testCase.reviewDemand,
            observedReviewState: testCase.observedReviewState,
          },
        },
      }));
      const result = evaluateAdaptiveDevelopmentBenchmark(
        manifest,
        runSet.receipts,
        's0-measurement-smoke',
        runSet.launchPlan,
        runSet.resolver,
        runSet.artifactResolver,
      );
      assert.equal(result.status, 'insufficient_evidence');
      assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessCount, 0);
      assert.equal(result.arms.baseline_old_sop.sopJudgePassCount, 0);
      assert.ok(result.incompleteReasons.some((reason) => reason.startsWith('invalid post-hoc Judge pass')));
    }
  });

  it('accepts required Review only with an authenticated exact independent verdict', () => {
    const runSet = buildRunSet(withApprovedIndependentReview);
    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );
    assert.equal(result.status, 'measurement_smoke_complete');
    assert.equal(result.arms.baseline_old_sop.sopJudgePassCount, 2);
    assert.equal(result.arms.treatment_new_sop.sopJudgePassCount, 2);
    assert.equal(result.arms.baseline_old_sop.externallyVerifiedSuccessCount, 2);
    assert.equal(result.arms.treatment_new_sop.externallyVerifiedSuccessCount, 2);
  });

  it('rejects complete usage claims that omit a child agent session', () => {
    const runSet = buildRunSet();
    const evidence = structuredClone(runSet.evidenceByUri.values().next().value);
    assert.ok(evidence);
    evidence.execution.agentEpisode.childSessionIds = ['child-session'];
    evidence.execution.agentEpisode.collaborationToolCalls = 1;
    assert.throws(
      () => parseAdaptiveDevelopmentBenchmarkEvidence(evidence),
      /usage accounting must cover every candidate and Judge session exactly once/,
    );
  });

  it('requires a bounded candidate-ready time for completed episodes', () => {
    for (const candidateReadyElapsedMs of [undefined, 1001]) {
      const runSet = buildRunSet((evidence) => ({
        ...evidence,
        execution: { ...evidence.execution, candidateReadyElapsedMs },
      }));
      const result = evaluateAdaptiveDevelopmentBenchmark(
        manifest,
        runSet.receipts,
        's0-measurement-smoke',
        runSet.launchPlan,
        runSet.resolver,
        runSet.artifactResolver,
      );
      assert.equal(result.status, 'insufficient_evidence');
      assert.ok(result.incompleteReasons.some((reason) => reason.startsWith('invalid candidate-ready time')));
    }
  });

  it('stops scaling on false outcome claims or invariant misses without inventing a token ceiling', () => {
    const runSet = buildRunSet((evidence, spec) =>
      spec.armId === 'treatment_new_sop' && spec.taskId === 'local-pwa-reconnect-input'
        ? {
            ...evidence,
            outcome: { ...evidence.outcome, oracle: 'failed' },
            safety: { hardInvariantMisses: ['protected-surface-miss'] },
            cost: { ...evidence.cost, inputTokens: 1210, outputTokens: 20 },
          }
        : evidence,
    );
    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );

    assert.equal(result.status, 'stop');
    assert.equal(result.scaleDecision, 'stop');
    assert.ok(result.stopReasons.some((reason) => reason.startsWith('false outcome claim')));
    assert.ok(result.stopReasons.some((reason) => reason.startsWith('hard invariant miss')));
    assert.equal(
      result.stopReasons.some((reason) => reason.startsWith('token ceiling exceeded')),
      false,
    );
  });

  it('stops scaling when any model session lacks terminal token usage', () => {
    const runSet = buildRunSet((evidence, spec) => {
      if (spec.armId !== 'treatment_new_sop' || spec.taskId !== 'local-pwa-reconnect-input') return evidence;
      const legacyIncompleteEvidence = structuredClone(evidence);
      delete legacyIncompleteEvidence.cost.usageComplete;
      return legacyIncompleteEvidence;
    });
    const result = evaluateAdaptiveDevelopmentBenchmark(
      manifest,
      runSet.receipts,
      's0-measurement-smoke',
      runSet.launchPlan,
      runSet.resolver,
      runSet.artifactResolver,
    );

    assert.equal(result.status, 'stop');
    assert.ok(result.stopReasons.some((reason) => reason.startsWith('token usage incomplete')));
    assert.equal(result.arms.treatment_new_sop.tokenUsageComplete, false);
    assert.equal(result.arms.treatment_new_sop.tokensPerVerifiedSuccess, null);
  });

  it('persists immutable local evidence and replays it through the same evaluator', () => {
    const root = mkdtempSync(join(tmpdir(), 'adaptive-development-benchmark-'));
    try {
      const store = new LocalAdaptiveDevelopmentBenchmarkEvidenceStore(root);
      const launchPlan = buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', launchPlanInput);
      const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
      const artifactByUri = new Map();
      const evidence = launchPlan.runs.map((spec) =>
        attachIndependentArtifacts(buildEvidence(spec, launchPlanSha256), artifactByUri),
      );
      const receipts = evidence.map((entry) => store.write(entry));

      const explicitUndefined = attachIndependentArtifacts(
        buildEvidence(launchPlan.runs[0], launchPlanSha256, {
          runId: `${evidence[0].runId}:explicit-undefined`,
          execution: { ...evidence[0].execution, candidateReadyElapsedMs: undefined },
        }),
        artifactByUri,
      );
      const undefinedReceipt = store.write(explicitUndefined);
      assert.deepEqual(store.write(explicitUndefined), undefinedReceipt);
      assert.equal(
        fingerprintAdaptiveDevelopmentBenchmark(store.resolve(undefinedReceipt)),
        undefinedReceipt.evidence.sha256,
      );

      assert.deepEqual(store.write(evidence[0]), receipts[0], 'identical evidence write should be idempotent');
      assert.throws(
        () => store.write({ ...evidence[0], operatorInterventions: evidence[0].operatorInterventions + 1 }),
        /evidence collision/,
      );
      assert.throws(
        () => store.resolve({ ...receipts[0], evidence: { ...receipts[0].evidence, uri: '../escape.json' } }),
        /safe store-relative path/,
      );

      const result = evaluateAdaptiveDevelopmentBenchmark(
        manifest,
        receipts,
        's0-measurement-smoke',
        launchPlan,
        store,
        { resolve: (reference) => artifactByUri.get(reference.uri) },
      );
      assert.equal(result.status, 'measurement_smoke_complete');
      assert.equal(result.effectClaimEligible, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('persists immutable artifacts with safe store-relative references', () => {
    const root = mkdtempSync(join(tmpdir(), 'adaptive-development-benchmark-artifacts-'));
    try {
      const store = new LocalAdaptiveDevelopmentBenchmarkArtifactStore(root);
      const launchPlan = buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, 's0-measurement-smoke', launchPlanInput);
      const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
      const evidence = buildEvidence(launchPlan.runs[0], launchPlanSha256);
      const artifactByUri = new Map();
      const attached = attachIndependentArtifacts(evidence, artifactByUri);
      const executionReference = attached.artifacts.find((candidate) => candidate.kind === 'execution');
      assert.ok(executionReference);
      const artifact = artifactByUri.get(executionReference.uri);
      assert.ok(artifact);
      const reference = store.write(artifact);

      assert.deepEqual(store.write(artifact), reference, 'identical artifact write should be idempotent');
      assert.equal(fingerprintAdaptiveDevelopmentBenchmark(store.resolve(reference)), reference.sha256);
      assert.throws(() => store.resolve({ ...reference, uri: '../escape.json' }), /safe store-relative path/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
