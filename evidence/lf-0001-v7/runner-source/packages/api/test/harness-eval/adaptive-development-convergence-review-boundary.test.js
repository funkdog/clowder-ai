import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import {
  buildAdaptiveDevelopmentReviewVisibilityManifest,
  verifyAdaptiveDevelopmentOperatorDirective,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js';
import {
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary.js';
import {
  assertAdaptiveDevelopmentConvergenceReviewBoundaryJudgeEvidence,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryJudgePrompt,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary-judge.js';

const assetsRoot = fileURLToPath(
  new URL('../../../../docs/harness-feedback/benchmarks/adaptive-development-v1/', import.meta.url),
);

function readJson(name) {
  return JSON.parse(readFileSync(join(assetsRoot, name), 'utf8'));
}

function fixture() {
  const rubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(
    readJson('convergence-review-boundary-rubric.json'),
  );
  const goldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(
    readJson('convergence-review-boundary-gold-cases.json'),
    rubric,
  );
  const trial = (sessionPrefix) => ({
    caseRuns: goldSuite.cases.map((entry, index) => ({
      caseId: entry.id,
      sessionId: `${sessionPrefix}-${index + 1}`,
      classification: structuredClone(entry.expected),
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 10,
        toolCalls: 0,
        failedToolCalls: 0,
        usageObserved: true,
      },
    })),
  });
  const certificate = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    modelId: 'gpt-5.6-sol',
    calibrationScopeSha256: '4'.repeat(64),
    calibrationPlanSha256: '5'.repeat(64),
    rubric,
    goldSuite,
    trials: [trial('review-boundary-calibration-1'), trial('review-boundary-calibration-2')],
  });
  return { rubric, goldSuite, certificate };
}

describe('Adaptive Development convergence Review-boundary rubric', () => {
  it('has a complete metric birth certificate and covers both Review-demand classes plus abstention', () => {
    const { rubric, goldSuite } = fixture();
    assert.equal(rubric.schemaVersion, 'lf-0001.development-convergence-review-boundary-rubric.v3');
    assert.equal(goldSuite.schemaVersion, 'lf-0001.development-convergence-review-boundary-gold-suite.v4');
    assert.deepEqual(rubric.calibratedDimensions, [
      'review_demand',
      'review_state',
      'authenticated_exact_candidate_review',
    ]);
    assert.ok(rubric.excludedClaims.includes('overall_sop_compliance'));
    assert.ok(rubric.metricBirthCertificate.utilityClaim.length > 0);
    assert.ok(rubric.metricBirthCertificate.estimator.length > 0);
    assert.ok(rubric.metricBirthCertificate.validityBounds.length > 0);
    assert.ok(rubric.metricBirthCertificate.consumer.length > 0);
    assert.ok(rubric.metricBirthCertificate.calibrationPlan.length > 0);
    assert.ok(rubric.metricBirthCertificate.repeatabilityContract.length > 0);
    assert.deepEqual(
      rubric.findingPolicy.precedence.map((entry) => entry.id),
      ['claimed_reviewed_without_authenticated_review', 'review_boundary_failure_without_false_reviewed_claim'],
    );
    assert.match(
      rubric.findingPolicy.precedence[0].rule,
      /reviewState=reviewed.*observed=false.*independentReview=null.*P1/i,
    );
    assert.match(rubric.findingPolicy.precedence[1].rule, /pending.*stale.*changes_requested.*moving candidate.*P2/i);
    assert.match(rubric.findingPolicy.p2, /indeterminate.*P2/i);
    assert.doesNotMatch(rubric.findingPolicy.p2, /exact-unit mismatch/i);
    assert.ok(goldSuite.cases.some((entry) => entry.expected.reviewDemand === 'required'));
    assert.ok(goldSuite.cases.some((entry) => entry.expected.reviewDemand === 'not_required'));
    assert.ok(goldSuite.cases.some((entry) => entry.expected.reviewDemand === 'indeterminate'));
    const invalidGoldSuite = readJson('convergence-review-boundary-gold-cases.json');
    invalidGoldSuite.cases.find((entry) => entry.expected.reviewDemand === 'indeterminate').expected.findings.p2 = 0;
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(invalidGoldSuite, rubric),
      /indeterminate.*P2/i,
    );
    const contradictoryGoldSuite = readJson('convergence-review-boundary-gold-cases.json');
    contradictoryGoldSuite.cases.find(
      (entry) => entry.expected.verdict === 'review_boundary_compliant',
    ).expected.findings.p2 = 1;
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(contradictoryGoldSuite, rubric),
      /compliant.*blocking/i,
    );
    assert.deepEqual(
      new Set(goldSuite.cases.map((entry) => entry.scenario)),
      new Set([
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
      ]),
    );
    for (const entry of goldSuite.cases) {
      assert.equal('taskEvidence' in entry, false);
      assert.equal('episodeEvidence' in entry, false);
      assert.ok(entry.projection.candidatePatch.length > 0);
      assert.deepEqual(Object.keys(entry.projection.judgeContext).sort(), [
        'agentEpisode',
        'candidateIdentity',
        'episodeCheckpoint',
        'scope',
        'taskInput',
      ]);
      assert.deepEqual(entry.observerFixture.candidate, entry.projection.judgeContext.candidateIdentity);
      const productionProjection = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection(entry);
      assert.deepEqual(Object.keys(productionProjection.judgeContext).sort(), [
        'agentEpisode',
        'candidateIdentity',
        'episodeCheckpoint',
        'reviewEvidence',
        'scope',
        'taskInput',
      ]);
    }
  });

  it('feeds raw Review attempts through the production exact-only observer before materialization', () => {
    const { goldSuite } = fixture();
    const rejectedScenarios = new Set([
      'sha_mismatch',
      'diff_mismatch',
      'patch_mismatch',
      'self_review',
      'non_child_reviewer',
    ]);
    for (const scenario of rejectedScenarios) {
      const entry = goldSuite.cases.find((candidate) => candidate.scenario === scenario);
      assert.ok(entry, `missing ${scenario} gold case`);
      assert.ok(entry.observerFixture.executorEvents.length > 0, `${scenario} must preserve its raw rejected attempt`);
      const [spawnEvent, waitEvent] = entry.observerFixture.executorEvents;
      const receiverSessionId = spawnEvent.item.receiver_thread_ids[0];
      const verdict = JSON.parse(waitEvent.item.agents_states[receiverSessionId].message);
      if (scenario === 'sha_mismatch') {
        assert.notEqual(verdict.candidateSha, entry.observerFixture.candidate.finalSha);
      } else if (scenario === 'diff_mismatch') {
        assert.notEqual(verdict.candidateDiffRef, entry.observerFixture.candidate.diffRef);
      } else if (scenario === 'patch_mismatch') {
        assert.notEqual(verdict.candidatePatchSha256, entry.observerFixture.candidate.patchSha256);
      } else if (scenario === 'self_review') {
        assert.equal(receiverSessionId, entry.observerFixture.graph.rootSessionId);
      } else {
        assert.equal(entry.observerFixture.graph.childSessionIds.includes(receiverSessionId), false);
      }
      const projection = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection(entry);
      assert.deepEqual(projection.judgeContext.reviewEvidence, {
        schemaVersion: 'lf-0001.runner-authenticated-review-observation.v1',
        observed: false,
        independentReview: null,
      });
      assert.equal(
        entry.projection.judgeContext.episodeCheckpoint.summary,
        'Candidate checkpoint records reviewed state.',
      );
      assert.deepEqual(entry.expected.findings, { p1: 1, p2: 0, p3: 0 });
    }

    for (const scenario of ['exact_candidate_review', 'changes_requested', 'manufactured_review_without_demand']) {
      const entry = goldSuite.cases.find((candidate) => candidate.scenario === scenario);
      assert.ok(entry, `missing ${scenario} gold case`);
      const projection = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection(entry);
      assert.equal(projection.judgeContext.reviewEvidence.observed, true);
      assert.ok(projection.judgeContext.reviewEvidence.independentReview);
    }
  });

  it('issues a certificate only after two independent exact human-gold matches', () => {
    const { rubric, goldSuite, certificate } = fixture();
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(certificate, rubric, goldSuite),
    );
    assert.deepEqual(certificate.calibratedDimensions, rubric.calibratedDimensions);
    assert.equal(
      certificate.judgeContractVersion,
      'lf-0001.development-convergence-production-review-boundary-judge.v2',
    );
    assert.equal(new Set(certificate.trials.flatMap((trial) => trial.caseRuns.map((run) => run.sessionId))).size, 26);

    const duplicateSession = structuredClone(certificate);
    duplicateSession.trials[1].caseRuns[0].sessionId = duplicateSession.trials[0].caseRuns[0].sessionId;
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(duplicateSession, rubric, goldSuite),
      /independent per-case session identities/,
    );

    const wrongClassification = structuredClone(certificate);
    wrongClassification.trials[1].caseRuns[0].classification.reviewDemand = 'required';
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
          wrongClassification,
          rubric,
          goldSuite,
        ),
      /disagrees with the human-gold suite/,
    );

    const reordered = structuredClone(certificate);
    reordered.trials[0].caseRuns.reverse();
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(reordered, rubric, goldSuite),
      /disagrees with the human-gold suite/,
    );

    const contradictoryGoldSuite = structuredClone(goldSuite);
    const contradictoryCase = contradictoryGoldSuite.cases.find(
      (entry) => entry.expected.verdict === 'review_boundary_compliant',
    );
    contradictoryCase.expected.findings.p2 = 1;
    const contradictoryCertificate = structuredClone(certificate);
    contradictoryCertificate.goldSuiteSha256 = fingerprintAdaptiveDevelopmentBenchmark(contradictoryGoldSuite);
    for (const trial of contradictoryCertificate.trials) {
      trial.caseRuns.find((entry) => entry.caseId === contradictoryCase.id).classification.findings.p2 = 1;
    }
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(
          contradictoryCertificate,
          rubric,
          contradictoryGoldSuite,
        ),
      /compliant.*blocking/i,
    );
  });

  it('invalidates calibration when rubric or gold bytes change', () => {
    const { rubric, goldSuite, certificate } = fixture();
    const changedRubric = structuredClone(rubric);
    changedRubric.reviewDemandPolicy.notRequiredWhen += ' Changed after calibration.';
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(certificate, changedRubric, goldSuite),
      /does not bind the exact rubric and gold suite/,
    );

    const changedGold = structuredClone(goldSuite);
    changedGold.cases[0].projection.judgeContext.taskInput.instruction += ' Changed after calibration.';
    assert.throws(
      () => assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate(certificate, rubric, changedGold),
      /does not bind the exact rubric and gold suite/,
    );

    const mismatchedPatch = structuredClone(goldSuite);
    mismatchedPatch.cases[0].projection.candidatePatch += '\n+unbound';
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(mismatchedPatch, rubric),
      /does not bind its exact candidate patch and identity/,
    );

    const unboundObserver = structuredClone(goldSuite);
    unboundObserver.cases[0].observerFixture.candidate.finalSha = 'f'.repeat(40);
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(unboundObserver, rubric),
      /does not bind its exact candidate patch and identity/,
    );

    const unboundGraph = structuredClone(goldSuite);
    unboundGraph.cases[0].observerFixture.graph.collaborationToolCalls += 1;
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(unboundGraph, rubric),
      /does not bind its raw observer graph to the Judge projection/,
    );
  });

  it('freezes calibration behind one exact operator-approved scope and plan', () => {
    const { rubric, goldSuite, certificate: fixtureCertificate } = fixture();
    const scope = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope({
      runnerCommit: '1'.repeat(40),
      environmentSha256: '2'.repeat(64),
      manifestSha256: '3'.repeat(64),
      modelId: 'gpt-5.6-sol',
      rubric,
      goldSuite,
    });
    const calibrationScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
    const plan = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan({
      schemaVersion: 'lf-0001.development-convergence-review-boundary-calibration-plan.v2',
      calibrationScopeSha256,
      scope,
      authorization: {
        kind: 'operator_approval',
        approvalRef: 'cat-cafe://message/calibration-approval',
        approvalMessageSha256: '6'.repeat(64),
        approvedCalibrationScopeSha256: calibrationScopeSha256,
        approvedAt: '2026-08-13T12:00:00.000Z',
      },
    });
    const calibrationPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    const certificate = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate({
      runnerCommit: scope.runnerCommit,
      environmentSha256: scope.environmentSha256,
      manifestSha256: scope.manifestSha256,
      modelId: scope.modelId,
      calibrationScopeSha256,
      calibrationPlanSha256,
      rubric,
      goldSuite,
      trials: fixtureCertificate.trials,
    });
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope(
        certificate,
        scope,
        calibrationPlanSha256,
      ),
    );
    assert.match(
      buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective(scope, {
        operatorUserId: 'default-user',
        threadId: 'thread_mrsvt7x42vkz9ua5',
        messageStoreIdentitySha256: 'a'.repeat(64),
        runtimeInstanceIdentitySha256: 'b'.repeat(64),
      }),
      new RegExp(
        `scope_sha256=${calibrationScopeSha256}.*rubric_sha256=${scope.rubricSha256}.*judge_contract_version=${scope.judgeContractVersion}.*trials=2.*cases_per_trial=13.*total_judge_sessions=26.*token_policy=unbounded`,
      ),
    );

    const driftedPlan = structuredClone(plan);
    driftedPlan.scope.modelId = 'different-model';
    assert.throws(
      () => parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan(driftedPlan),
      /not bound to one exact approved scope/,
    );

    const wrongPlanCertificate = structuredClone(certificate);
    wrongPlanCertificate.calibrationPlanSha256 = '9'.repeat(64);
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope(
          wrongPlanCertificate,
          scope,
          calibrationPlanSha256,
        ),
      /does not bind the exact authorized calibration execution/,
    );
  });

  it('fails closed when the durable approval omits or tampers with the exact Judge session budget', async () => {
    const { rubric, goldSuite } = fixture();
    const scope = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope({
      runnerCommit: '1'.repeat(40),
      environmentSha256: '2'.repeat(64),
      manifestSha256: '3'.repeat(64),
      modelId: 'gpt-5.6-sol',
      rubric,
      goldSuite,
    });
    const authority = {
      kind: 'cat_cafe_runtime_message_store.v1',
      operatorUserId: 'default-user',
      threadId: 'thread_mrsvt7x42vkz9ua5',
      messageStoreIdentitySha256: fingerprintAdaptiveDevelopmentBenchmark({
        redisUrl: 'redis://localhost:6399',
        redisKeyPrefix: 'cat-cafe:',
      }),
      runtimeInstanceIdentitySha256: 'b'.repeat(64),
    };
    const directive = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective(scope, authority);
    const timestamp = Date.parse('2026-08-13T12:00:00.000Z');
    for (const content of [
      directive.replace(' cases_per_trial=13', ''),
      directive.replace('total_judge_sessions=26', 'total_judge_sessions=25'),
    ]) {
      await assert.rejects(
        () =>
          verifyAdaptiveDevelopmentOperatorDirective({
            authorization: {
              approvalRef: 'cat-cafe://message/calibration-approval',
              approvalMessageSha256: fingerprintAdaptiveDevelopmentBenchmark(content),
              approvedAt: new Date(timestamp).toISOString(),
            },
            authority,
            resolver: {
              getById: () => ({
                id: 'calibration-approval',
                threadId: authority.threadId,
                userId: authority.operatorUserId,
                catId: null,
                content,
                timestamp,
                deliveryStatus: 'delivered',
              }),
            },
            directive,
          }),
        /does not authorize the exact launch scope and budget/,
      );
    }
  });

  it('uses the production parser and static-proof validator for calibration outputs', () => {
    const root = mkdtempSync(join(tmpdir(), 'review-boundary-judge-contract-'));
    try {
      const context = join(root, '.adaptive-development-judge');
      mkdirSync(context);
      writeFileSync(join(context, 'task-input.json'), '{\n  "instruction": "review me"\n}\n');
      const visibility = buildAdaptiveDevelopmentReviewVisibilityManifest({
        root,
        candidateSha: 'a'.repeat(40),
        candidatePaths: [],
        runnerProvidedPaths: ['.adaptive-development-judge/task-input.json'],
      });
      const prompt = buildAdaptiveDevelopmentConvergenceReviewBoundaryJudgePrompt({
        executorInput: { instruction: 'review me' },
        allowedChangedPaths: [],
      });
      assert.match(prompt, /noncompliant.*P1 or P2.*indeterminate.*P2/is);
      const judge = parseAdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput({
        verdict: 'review_boundary_compliant',
        summary: 'Required Review is missing.',
        reviewDemand: 'required',
        observedReviewState: 'pending',
        findings: [
          {
            severity: 'P2',
            summary: 'Missing required Review.',
            evidence: {
              kind: 'static_proof',
              command: '',
              expected: '',
              actual: '',
              location: '.adaptive-development-judge/task-input.json:2',
              reasoning: 'The task explicitly requests Review.',
            },
          },
        ],
      });
      assert.equal(judge.verdict, 'review_boundary_noncompliant');
      assert.throws(
        () =>
          parseAdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput({
            verdict: 'review_boundary_noncompliant',
            summary: 'Review demand is indeterminate because the next action is unavailable.',
            reviewDemand: 'indeterminate',
            observedReviewState: 'pending',
            findings: [],
          }),
        /indeterminate.*P2/i,
      );
      assert.doesNotThrow(() =>
        assertAdaptiveDevelopmentConvergenceReviewBoundaryJudgeEvidence({
          judge,
          judgeStdout: '',
          visibility,
          visibilityRoots: { candidateRoot: root, runnerProvidedRoot: root },
        }),
      );
      const invalidLocation = structuredClone(judge);
      invalidLocation.findings[0].evidence.location = '.adaptive-development-judge/task-input.json:99';
      assert.throws(
        () =>
          assertAdaptiveDevelopmentConvergenceReviewBoundaryJudgeEvidence({
            judge: invalidLocation,
            judgeStdout: '',
            visibility,
            visibilityRoots: { candidateRoot: root, runnerProvidedRoot: root },
          }),
        /visible candidate or runner-provided evidence/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
