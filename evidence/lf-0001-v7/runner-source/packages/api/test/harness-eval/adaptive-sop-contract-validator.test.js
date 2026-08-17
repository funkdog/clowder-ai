import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateSopAdmission,
  fingerprintAdaptiveSopPlan,
} from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-admission.js';
import {
  AdaptiveSopContractError,
  parseAdaptiveSopPlan,
  parseSopAdmissionDecision,
  parseSopTrialEpisode,
} from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-contract.js';

const validPlan = {
  schemaVersion: 'adaptive-sop-plan.v2',
  episodeId: 'episode-001',
  model: { provider: 'openai', modelId: 'gpt-5.6-sol', harnessVersion: 'lf-0001.v1' },
  taskUnderstanding: 'Produce a provenance-backed replay manifest without enabling runtime behavior.',
  desiredOutcome: ['The planner cannot see grader-only outcomes.'],
  repositoryFacts: {
    worktreeRoot: '/tmp/clowder-adaptive-sop',
    branch: 'feat/F192-lf-0001-adaptive-sop',
    baseSha: 'd5961fe3974cf568b6bd080b0024eb97774ea53b',
    changedFiles: ['packages/api/test/harness-eval/adaptive-sop-replay-manifest.test.js'],
    diffFingerprint: 'a'.repeat(64),
  },
  risks: [
    {
      claim: 'Historical outcomes could leak into planner context.',
      evidence: ['Planner and grader data share one manifest.'],
      uncertainty: [],
    },
  ],
  decisions: [
    {
      stepId: 'targeted-contract-test',
      action: 'include',
      description: 'Run the focused contract test.',
      reason: 'The projection boundary needs executable regression evidence.',
      residualRisk: 'Runner wiring remains outside this slice.',
    },
    {
      stepId: 'runtime-restart',
      action: 'omit',
      description: 'Restart the runtime after the contract-only change.',
      reason: 'No runtime module changes in this slice.',
      residualRisk: 'End-to-end wiring remains untested.',
      replacementEvidence: ['Static diff plus targeted schema test.'],
    },
  ],
  executionOrder: ['targeted-contract-test'],
  outcomeChecks: ['The contract test rejects grader-only leakage.'],
  replanTriggers: ['A production module enters the diff.'],
  rollbackPlan: 'Revert the single commit.',
};

const continued = {
  schemaVersion: 'sop-admission-decision.v3',
  status: 'continue',
  episodeId: 'episode-001',
  envelopeFingerprint: 'b'.repeat(64),
  strategyMayContinue: true,
  actionGates: [],
};

function validEpisode() {
  return {
    schemaVersion: 'sop-trial-episode.v3',
    plan: validPlan,
    admission: continued,
    actualSteps: [
      {
        stage: 'quality_gate',
        commandOrTool: 'node --test adaptive-sop-contract-validator.test.js',
        startedAt: '2026-07-21T01:00:00.000Z',
        completedAt: '2026-07-21T01:00:01.000Z',
        exitCode: 0,
        evidenceRef: 'test:adaptive-sop-contract-validator',
      },
    ],
    outcome: {
      requestedOutcomeMet: true,
      testsPassed: true,
      reviewFindingCounts: { p1: 0, p2: 0, p3: 0 },
      operatorCorrection: false,
      rollback: false,
      escapedRegression: false,
    },
    cost: {
      invocations: 1,
      toolCalls: 3,
      inputTokens: 1200,
      outputTokens: 500,
      wallTimeMs: 1000,
      gateDurationMs: 500,
    },
    telemetryComplete: true,
    missingFields: [],
  };
}

function assertContractError(fn, code) {
  assert.throws(fn, (error) => error instanceof AdaptiveSopContractError && error.code === code);
}

describe('LF-0001 adaptive SOP semantic contract validator', () => {
  it('parses a semantically valid plan and continue decision', () => {
    assert.deepEqual(parseAdaptiveSopPlan(validPlan), validPlan);
    assert.deepEqual(parseSopAdmissionDecision(continued), continued);
  });

  it('reports unsupported schema versions separately from malformed input', () => {
    assertContractError(
      () => parseAdaptiveSopPlan({ ...validPlan, schemaVersion: 'adaptive-sop-plan.v3' }),
      'unsupported_schema_version',
    );
    assertContractError(() => parseAdaptiveSopPlan({ ...validPlan, taskUnderstanding: '' }), 'invalid_contract');
  });

  it('requires alternative evidence for omitted or replaced steps', () => {
    const decisions = validPlan.decisions.map((decision) =>
      decision.action === 'omit' ? { ...decision, replacementEvidence: [] } : decision,
    );
    assertContractError(() => parseAdaptiveSopPlan({ ...validPlan, decisions }), 'semantic_invariant_violation');
  });

  it('rejects risk claims with neither evidence nor explicit uncertainty', () => {
    assertContractError(
      () =>
        parseAdaptiveSopPlan({
          ...validPlan,
          risks: [{ claim: 'This might be low risk.', evidence: [], uncertainty: [] }],
        }),
      'semantic_invariant_violation',
    );
  });

  it('requires executionOrder to contain every non-omitted step exactly once', () => {
    assertContractError(
      () =>
        parseAdaptiveSopPlan({ ...validPlan, executionOrder: ['targeted-contract-test', 'targeted-contract-test'] }),
      'semantic_invariant_violation',
    );
    assertContractError(
      () => parseAdaptiveSopPlan({ ...validPlan, executionOrder: ['targeted-contract-test', 'runtime-restart'] }),
      'semantic_invariant_violation',
    );
  });

  it('requires continued episode identity and step time order to match reality', () => {
    assertContractError(
      () => parseSopTrialEpisode({ ...validEpisode(), admission: { ...continued, episodeId: 'other-episode' } }),
      'semantic_invariant_violation',
    );
    const episode = validEpisode();
    episode.actualSteps[0] = {
      ...episode.actualSteps[0],
      startedAt: '2026-07-21T01:00:02.000Z',
      completedAt: '2026-07-21T01:00:01.000Z',
    };
    assertContractError(() => parseSopTrialEpisode(episode), 'semantic_invariant_violation');
  });

  it('binds evidence and deny decisions to the same episode and observed-facts fingerprint', () => {
    for (const admission of [
      {
        schemaVersion: 'sop-admission-decision.v3',
        status: 'need_evidence',
        episodeId: 'other-episode',
        envelopeFingerprint: 'c'.repeat(64),
        strategyMayContinue: true,
        actionGates: [],
        missingEvidence: ['diff fingerprint is missing'],
        requiredFacts: ['repository.diffFingerprint'],
      },
      {
        schemaVersion: 'sop-admission-decision.v3',
        status: 'deny',
        episodeId: 'other-episode',
        envelopeFingerprint: 'd'.repeat(64),
        strategyMayContinue: false,
        actionGates: [],
        invariant: 'worktree isolation is absent',
        recovery: 'stop_adaptive',
      },
    ]) {
      assertContractError(() => parseSopTrialEpisode({ ...validEpisode(), admission }), 'semantic_invariant_violation');
    }
  });

  it('requires decision status to agree with its action gates', () => {
    const gate = {
      actionId: 'publish',
      capability: 'remote_publication',
      stage: 'before_publication',
      disposition: 'need_authority',
      reason: 'Publication requires operator authority.',
      evidenceRefs: ['guard:publication'],
    };
    assertContractError(
      () => parseSopAdmissionDecision({ ...continued, actionGates: [gate] }),
      'semantic_invariant_violation',
    );
    assertContractError(
      () =>
        parseSopAdmissionDecision({
          ...continued,
          status: 'need_authority',
          actionGates: [gate],
          requiredAuthorities: [{ actionId: 'other-action', capability: 'remote_publication' }],
        }),
      'semantic_invariant_violation',
    );

    const unresolvedGate = {
      actionId: 'inspect-publication-evidence',
      capability: 'public_contract_code_change',
      stage: 'before_review_ready',
      disposition: 'need_evidence',
      reason: 'Compatibility evidence is unresolved.',
      evidenceRefs: [],
    };
    assertContractError(
      () =>
        parseSopAdmissionDecision({
          ...continued,
          status: 'need_authority',
          actionGates: [unresolvedGate, gate],
          requiredAuthorities: [{ actionId: 'publish', capability: 'remote_publication' }],
        }),
      'semantic_invariant_violation',
    );
  });

  it('round-trips need_evidence decisions caused only by global verification facts', () => {
    const facts = {
      schemaVersion: 'sop-admission-facts.v4',
      episodeId: validPlan.episodeId,
      planFingerprint: fingerprintAdaptiveSopPlan(validPlan),
      observedAt: '2026-07-21T01:00:00.000Z',
      repository: {
        worktreeRoot: '/tmp/clowder-adaptive-sop',
        branch: 'feat/F192-lf-0001-adaptive-sop',
        baseSha: 'd5961fe3974cf568b6bd080b0024eb97774ea53b',
        changedFiles: ['packages/api/test/harness-eval/adaptive-sop-replay-manifest.test.js'],
        diffFingerprint: 'a'.repeat(64),
        isolatedWorktree: true,
        recoveryWithinOneCommit: true,
      },
      data: { testDataIsolated: 'not_applicable', productionUserDataInScope: false },
      capabilityRequests: [],
      capabilityResolution: {
        resolverFingerprint: 'd'.repeat(64),
        reviewerFingerprint: 'e'.repeat(64),
        actions: [
          {
            actionId: 'targeted-contract-test',
            classification: 'unrestricted',
            capabilities: [],
            resolver: {
              classification: 'unrestricted',
              capabilities: [],
              rationale: 'The action only runs a local focused test.',
              evidenceRefs: ['plan.decisions.targeted-contract-test.description'],
              evidenceStatus: 'resolved',
            },
            review: {
              verdict: 'verified',
              rationale: 'The cited action has no gated capability.',
              evidenceRefs: ['plan.decisions.targeted-contract-test.description'],
              evidenceStatus: 'resolved',
            },
          },
        ],
        requiredCapabilitiesMissing: [],
      },
      verification: {
        objectiveOutcomeCheck: false,
        mutatingWork: false,
        crossIndividualReviewPlanned: true,
        p1p2ClearancePlanned: true,
      },
    };
    const decision = evaluateSopAdmission(validPlan, facts);

    assert.equal(decision.status, 'need_evidence');
    assert.deepEqual(decision.actionGates, []);
    assert.deepEqual(parseSopAdmissionDecision(decision), decision);
  });

  it('keeps telemetryComplete consistent with missing values and paths', () => {
    const episode = validEpisode();
    episode.cost.inputTokens = 'missing';
    assertContractError(() => parseSopTrialEpisode(episode), 'semantic_invariant_violation');

    const incomplete = validEpisode();
    incomplete.telemetryComplete = false;
    incomplete.missingFields = [];
    assertContractError(() => parseSopTrialEpisode(incomplete), 'semantic_invariant_violation');
  });
});
