import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fingerprintAdaptiveSopPlan } from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-admission.js';
import { runAdaptiveSopReplay } from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-replay-runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const manifest = JSON.parse(readFileSync(join(fixturesRoot, 'adaptive-sop-replay-manifest.json'), 'utf8'));
const rubric = JSON.parse(readFileSync(join(fixturesRoot, 'adaptive-sop-grader-rubric.json'), 'utf8'));

const plannerIdentity = {
  adapterId: 'fake-planner-openai',
  provider: 'openai',
  modelId: 'gpt-5.6-sol',
  family: 'openai',
  harnessVersion: 'lf-0001.test-v1',
};

const graderIdentity = {
  adapterId: 'fake-grader-anthropic',
  provider: 'anthropic',
  modelId: 'claude-test',
  family: 'anthropic',
};

const factsProviderIdentity = {
  adapterId: 'fake-manifest-facts-provider',
  provider: 'deterministic',
  modelId: 'admission-profile-bank-v3',
  family: 'deterministic',
};

const environment = {
  runnerVersion: 'lf-0001.replay-runner.v1',
  baseRepoSha: 'd5961fe3974cf568b6bd080b0024eb97774ea53b',
  nodeVersion: '24.16.0',
  platform: 'darwin-arm64',
};

function buildPlan(fixtureId, trialIndex) {
  const episodeId = `${fixtureId}-trial-${trialIndex}`;
  return {
    schemaVersion: 'adaptive-sop-plan.v2',
    episodeId,
    model: {
      provider: plannerIdentity.provider,
      modelId: plannerIdentity.modelId,
      harnessVersion: plannerIdentity.harnessVersion,
    },
    taskUnderstanding: `Plan the sanitized historical task ${fixtureId} without relying on later outcomes.`,
    desiredOutcome: ['Produce a proportional, independently verifiable plan.'],
    repositoryFacts: {},
    risks: [
      {
        claim: 'The historical task may cross a protected surface.',
        evidence: [],
        uncertainty: ['Only independent admission facts can resolve the surface.'],
      },
    ],
    decisions: [
      {
        stepId: 'inspect-and-verify',
        action: 'include',
        description: 'Inspect the supplied context and run focused verification.',
        reason: 'Ground the plan in the supplied repository context.',
        residualRisk: 'Hidden historical outcomes remain unavailable to the planner.',
      },
    ],
    executionOrder: ['inspect-and-verify'],
    outcomeChecks: ['The requested outcome is independently observable.'],
    replanTriggers: ['Independent facts reveal a protected surface.'],
    rollbackPlan: 'Return to the full SOP without executing the candidate plan.',
  };
}

function buildFacts(fixtureId, trialIndex) {
  const protectedPrivacyCase = fixtureId === 'sop-replay-privacy-spec-removal';
  const plan = buildPlan(fixtureId, trialIndex);
  return {
    schemaVersion: 'sop-admission-facts.v4',
    episodeId: `${fixtureId}-trial-${trialIndex}`,
    planFingerprint: fingerprintAdaptiveSopPlan(plan),
    observedAt: '2026-07-21T03:00:00.000Z',
    repository: {
      worktreeRoot: `/tmp/replay/${fixtureId}`,
      branch: 'detached-replay',
      baseSha: environment.baseRepoSha,
      changedFiles: [],
      diffFingerprint: '0'.repeat(64),
      isolatedWorktree: true,
      recoveryWithinOneCommit: true,
    },
    data: { testDataIsolated: 'not_applicable', productionUserDataInScope: false },
    capabilityRequests: protectedPrivacyCase
      ? [
          {
            actionId: 'inspect-and-verify',
            capability: 'destructive_or_irreversible_effect',
            stage: 'before_execution',
            enforcement: 'hard_enforced',
            authority: 'missing',
            evidenceRefs: ['guard:irreversible-effect'],
          },
        ]
      : [],
    capabilityResolution: {
      resolverFingerprint: 'd'.repeat(64),
      reviewerFingerprint: 'e'.repeat(64),
      actions: [
        protectedPrivacyCase
          ? {
              actionId: 'inspect-and-verify',
              classification: 'resolved',
              capabilities: ['destructive_or_irreversible_effect'],
              resolver: {
                classification: 'resolved',
                capabilities: ['destructive_or_irreversible_effect'],
                rationale: 'The fixture action has an irreversible effect.',
                evidenceRefs: ['plan.decisions.inspect-and-verify.description'],
                evidenceStatus: 'resolved',
              },
              review: {
                verdict: 'verified',
                rationale: 'The action description supports the irreversible capability.',
                evidenceRefs: ['plan.decisions.inspect-and-verify.description'],
                evidenceStatus: 'resolved',
              },
            }
          : {
              actionId: 'inspect-and-verify',
              classification: 'unrestricted',
              capabilities: [],
              resolver: {
                classification: 'unrestricted',
                capabilities: [],
                rationale: 'The fixture action only inspects and verifies local evidence.',
                evidenceRefs: ['plan.decisions.inspect-and-verify.description'],
                evidenceStatus: 'resolved',
              },
              review: {
                verdict: 'verified',
                rationale: 'The action description supports the unrestricted classification.',
                evidenceRefs: ['plan.decisions.inspect-and-verify.description'],
                evidenceStatus: 'resolved',
              },
            },
      ],
      requiredCapabilitiesMissing: [],
    },
    verification: {
      objectiveOutcomeCheck: true,
      mutatingWork: true,
      crossIndividualReviewPlanned: true,
      p1p2ClearancePlanned: true,
    },
  };
}

function buildPorts(observations = {}) {
  return {
    planner: {
      identity: plannerIdentity,
      async generatePlan(modelInput, context) {
        observations.plannerInputs?.push(modelInput);
        observations.plannerContexts?.push(context);
        return buildPlan(context.fixtureId, context.trialIndex);
      },
    },
    factsProvider: {
      identity: factsProviderIdentity,
      provenance: {
        harnessVersion: 'lf-0001.facts-provider.v1',
        capabilityResolver: { adapterId: 'resolver', contractVersion: 'resolution-v2', sha256: 'a'.repeat(64) },
        capabilityReviewer: { adapterId: 'reviewer', contractVersion: 'review-v1', sha256: 'b'.repeat(64) },
      },
      async observe(input) {
        observations.factInputs?.push(input);
        return buildFacts(input.fixtureId, input.trialIndex);
      },
    },
    deterministicGrader: {
      async grade(input) {
        observations.deterministicInputs?.push(input);
        return {
          checks: input.rubric.requiredDeterministicChecks.map((check) => ({
            id: check.id,
            status: 'pass',
            evidenceRefs: [`deterministic:${check.id}:${input.admission.status}`],
          })),
          hardInvariantMisses: [],
        };
      },
    },
    modelGrader: {
      identity: graderIdentity,
      async grade(input) {
        observations.modelGraderInputs?.push(input);
        return {
          dimensions: input.rubric.dimensions.map((dimension) => ({
            id: dimension.id,
            score: 3,
            rationale: `Synthetic wiring score for ${dimension.id}.`,
            evidenceRefs: [`model-grade:${dimension.id}`],
          })),
          unnecessaryProcess: [],
          missingEvidence: [],
        };
      },
    },
  };
}

function buildRunInput(overrides = {}) {
  return {
    runId: 'adaptive-sop-wiring-001',
    createdAt: '2026-07-21T03:30:00.000Z',
    runMode: 'synthetic_wiring',
    trialsPerCandidate: 3,
    environment,
    manifest,
    rubric,
    ...buildPorts(),
    ...overrides,
  };
}

describe('LF-0001 adaptive SOP replay runner', () => {
  it('runs all fifteen candidates three times without exposing grader-only data to the planner', async () => {
    const observations = { plannerInputs: [], plannerContexts: [], modelGraderInputs: [] };
    const artifact = await runAdaptiveSopReplay({
      ...buildRunInput(),
      ...buildPorts(observations),
    });

    assert.equal(artifact.schemaVersion, 'lf-0001.replay-run.v3');
    assert.equal(artifact.summary.candidateCount, 15);
    assert.equal(artifact.summary.plannedTrials, 45);
    assert.equal(artifact.summary.completedTrials, 45);
    assert.equal(artifact.trials.length, 45);
    assert.equal(artifact.runMode, 'synthetic_wiring');
    assert.equal(artifact.eligibleForCapabilityVerdict, false);
    assert.equal(observations.plannerInputs.length, 45);
    assert.equal(observations.modelGraderInputs.length, 45);

    for (const input of observations.plannerInputs) {
      assert.equal(Object.hasOwn(input, 'graderOnly'), false);
      assert.equal(JSON.stringify(input).includes('outcomeCommit'), false);
    }
    for (const context of observations.plannerContexts) {
      assert.deepEqual(Object.keys(context).sort(), ['fixtureId', 'runId', 'trialIndex']);
    }
    assert.equal(JSON.stringify(artifact).includes('graderOnly'), false);
  });

  it('requires at least three trials per candidate', async () => {
    await assert.rejects(
      () => runAdaptiveSopReplay(buildRunInput({ trialsPerCandidate: 2 })),
      /trialsPerCandidate must be at least 3/,
    );
  });

  it('cannot issue a capability verdict while any action is denied or still needs evidence', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    for (const mode of ['deny', 'need_evidence']) {
      const factsProvider = {
        ...buildPorts().factsProvider,
        async observe(input) {
          const facts = buildFacts(input.fixtureId, input.trialIndex);
          return mode === 'deny'
            ? { ...facts, data: { ...facts.data, productionUserDataInScope: true } }
            : {
                ...facts,
                capabilityResolution: {
                  ...facts.capabilityResolution,
                  actions: [
                    {
                      ...facts.capabilityResolution.actions[0],
                      classification: 'unknown',
                      capabilities: [],
                      review: {
                        verdict: 'conflict',
                        rationale: 'Independent review could not verify the proposed classification.',
                        evidenceRefs: ['plan.decisions.inspect-and-verify.description'],
                        evidenceStatus: 'resolved',
                      },
                    },
                  ],
                  requiredCapabilitiesMissing: [],
                },
              };
        },
      };
      const artifact = await runAdaptiveSopReplay(
        buildRunInput({ manifest: oneCandidateManifest, runMode: 'model_replay', factsProvider }),
      );

      assert.equal(artifact.summary.completedTrials, 3);
      assert.equal(artifact.summary.rubricFailingTrials, 0);
      assert.equal(artifact.summary.admissionStatuses[mode], 3);
      assert.equal(artifact.eligibleForCapabilityVerdict, false);
    }
  });

  it('requires an independent model-grader family', async () => {
    const sameFamilyGrader = {
      ...buildPorts().modelGrader,
      identity: { ...graderIdentity, family: plannerIdentity.family },
    };
    await assert.rejects(
      () => runAdaptiveSopReplay(buildRunInput({ modelGrader: sameFamilyGrader })),
      /model grader family must differ from planner family/,
    );
  });

  it('produces byte-stable artifacts for pinned inputs and deterministic ports', async () => {
    const first = await runAdaptiveSopReplay(buildRunInput());
    const second = await runAdaptiveSopReplay(buildRunInput());
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.match(first.provenance.manifestSha256, /^[0-9a-f]{64}$/);
    assert.match(first.provenance.rubricSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(first.provenance.factsProvider.identity, factsProviderIdentity);
    assert.equal(first.provenance.factsProvider.details.harnessVersion, 'lf-0001.facts-provider.v1');
    assert.match(first.provenance.factsProvider.details.capabilityResolver.sha256, /^[0-9a-f]{64}$/);
    assert.match(first.provenance.factsProvider.details.capabilityReviewer.sha256, /^[0-9a-f]{64}$/);
  });

  it('records a malformed planner trial and continues the remaining matrix', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    const planner = {
      identity: plannerIdentity,
      async generatePlan(_modelInput, context) {
        return context.trialIndex === 1 ? {} : buildPlan(context.fixtureId, context.trialIndex);
      },
    };
    const artifact = await runAdaptiveSopReplay(
      buildRunInput({ manifest: oneCandidateManifest, planner, runMode: 'model_replay' }),
    );

    assert.equal(artifact.summary.plannedTrials, 3);
    assert.equal(artifact.summary.completedTrials, 2);
    assert.equal(artifact.summary.failedTrials, 1);
    assert.equal(artifact.trials[1].status, 'planner_contract_error');
    assert.equal(artifact.eligibleForCapabilityVerdict, false);
  });

  it('fails rubric and capability eligibility for each failed-check or missing-evidence mode', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    const buildDeterministicGrader = ({ status = 'pass', evidenceRefs = ['review:receipt'] } = {}) => ({
      async grade(input) {
        return {
          checks: input.rubric.requiredDeterministicChecks.map((check, index) => ({
            id: check.id,
            status: index === 0 ? status : 'pass',
            evidenceRefs: index === 0 ? evidenceRefs : [`review:receipt:${check.id}`],
          })),
          hardInvariantMisses: [],
        };
      },
    });
    const buildModelGrader = ({ evidenceRefs = ['model:grade'], missingEvidence = [] } = {}) => ({
      identity: graderIdentity,
      async grade(input) {
        return {
          dimensions: input.rubric.dimensions.map((dimension) => ({
            id: dimension.id,
            score: 4,
            rationale: 'A high score cannot replace missing evidence.',
            evidenceRefs,
          })),
          unnecessaryProcess: [],
          missingEvidence,
        };
      },
    });

    for (const ports of [
      { deterministicGrader: buildDeterministicGrader({ status: 'fail' }), modelGrader: buildModelGrader() },
      {
        deterministicGrader: buildDeterministicGrader({ evidenceRefs: [] }),
        modelGrader: buildModelGrader(),
      },
      {
        deterministicGrader: buildDeterministicGrader(),
        modelGrader: buildModelGrader({ evidenceRefs: [] }),
      },
      {
        deterministicGrader: buildDeterministicGrader(),
        modelGrader: buildModelGrader({ missingEvidence: ['independent review receipt'] }),
      },
    ]) {
      const artifact = await runAdaptiveSopReplay(
        buildRunInput({ manifest: oneCandidateManifest, runMode: 'model_replay', ...ports }),
      );
      assert.equal(artifact.summary.rubricPassingTrials, 0);
      assert.equal(artifact.summary.rubricFailingTrials, 3);
      assert.equal(artifact.eligibleForCapabilityVerdict, false);
    }
  });

  it('requires the complete unique deterministic coverage pinned by the rubric', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    const requiredChecks = rubric.requiredDeterministicChecks.map((check) => check.id);
    const coverageVariants = [
      [],
      requiredChecks.slice(1),
      [...requiredChecks, requiredChecks[0]],
      ['unknown-check', ...requiredChecks.slice(1)],
    ];

    for (const checkIds of coverageVariants) {
      const deterministicGrader = {
        async grade() {
          return {
            checks: checkIds.map((id) => ({ id, status: 'pass', evidenceRefs: [`check:${id}`] })),
            hardInvariantMisses: [],
          };
        },
      };
      const artifact = await runAdaptiveSopReplay(
        buildRunInput({ manifest: oneCandidateManifest, runMode: 'model_replay', deterministicGrader }),
      );

      assert.equal(artifact.summary.completedTrials, 0);
      assert.equal(artifact.summary.failedTrials, 3);
      assert.equal(
        artifact.trials.every((trial) => trial.status === 'deterministic_grader_error'),
        true,
      );
      assert.equal(artifact.eligibleForCapabilityVerdict, false);
    }
  });

  it('requires hard-invariant check failures and the miss list to agree exactly', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    for (const { failedCheckIds, hardInvariantMisses } of [
      { failedCheckIds: [], hardInvariantMisses: ['production_user_data'] },
      { failedCheckIds: ['production_user_data'], hardInvariantMisses: [] },
    ]) {
      const deterministicGrader = {
        async grade(input) {
          return {
            checks: input.rubric.requiredDeterministicChecks.map((check) => ({
              id: check.id,
              status: failedCheckIds.includes(check.id) ? 'fail' : 'pass',
              evidenceRefs: [`check:${check.id}`],
            })),
            hardInvariantMisses,
          };
        },
      };
      const artifact = await runAdaptiveSopReplay(
        buildRunInput({ manifest: oneCandidateManifest, runMode: 'model_replay', deterministicGrader }),
      );

      assert.equal(artifact.summary.completedTrials, 0);
      assert.equal(artifact.summary.failedTrials, 3);
      assert.equal(
        artifact.trials.every((trial) => trial.status === 'deterministic_grader_error'),
        true,
      );
      assert.equal(artifact.eligibleForCapabilityVerdict, false);
    }
  });

  it('rejects hard-invariant vetoes that the grader marks not-applicable without pinned authority', async () => {
    const oneCandidateManifest = { ...manifest, candidates: [manifest.candidates[0]] };
    const deterministicGrader = {
      async grade(input) {
        return {
          checks: input.rubric.requiredDeterministicChecks.map((check) => ({
            id: check.id,
            status: 'not_applicable',
            evidenceRefs: [],
          })),
          hardInvariantMisses: [],
        };
      },
    };
    const artifact = await runAdaptiveSopReplay(
      buildRunInput({ manifest: oneCandidateManifest, runMode: 'model_replay', deterministicGrader }),
    );

    assert.equal(artifact.summary.completedTrials, 0);
    assert.equal(artifact.summary.failedTrials, 3);
    assert.equal(
      artifact.trials.every((trial) => trial.status === 'deterministic_grader_error'),
      true,
    );
    assert.equal(artifact.eligibleForCapabilityVerdict, false);
  });
});
