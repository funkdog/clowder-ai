import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateSopAdmission,
  fingerprintAdaptiveSopPlan,
  parseSopAdmissionFacts,
} from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-admission.js';
import { AdaptiveSopContractError } from '../../dist/infrastructure/harness-eval/sop/adaptive-sop-contract.js';

const validPlan = {
  schemaVersion: 'adaptive-sop-plan.v2',
  episodeId: 'episode-admission-001',
  model: { provider: 'openai', modelId: 'gpt-5.6-sol', harnessVersion: 'lf-0001.v1' },
  taskUnderstanding: 'Add a static replay contract in an isolated feature worktree.',
  desiredOutcome: ['The replay contract is validated without changing runtime behavior.'],
  repositoryFacts: {
    worktreeRoot: '/tmp/clowder-adaptive-sop',
    branch: 'feat/F192-lf-0001-adaptive-sop',
    baseSha: 'd5961fe3974cf568b6bd080b0024eb97774ea53b',
    changedFiles: ['packages/api/test/harness-eval/adaptive-sop-admission.test.js'],
    diffFingerprint: 'a'.repeat(64),
  },
  risks: [
    {
      claim: 'The evaluator could trust model-authored risk flags.',
      evidence: ['Admission facts are supplied through a separate input.'],
      uncertainty: [],
    },
  ],
  decisions: [
    {
      stepId: 'targeted-test',
      action: 'include',
      description: 'Run the focused admission contract test.',
      reason: 'The independent facts boundary needs a regression test.',
      residualRisk: 'No end-to-end runtime wiring exists yet.',
    },
  ],
  executionOrder: ['targeted-test'],
  outcomeChecks: ['The evaluator returns a deterministic structured decision.'],
  replanTriggers: ['The observed diff enters a protected surface.'],
  rollbackPlan: 'Revert the single feature commit.',
};

const validFacts = {
  schemaVersion: 'sop-admission-facts.v4',
  episodeId: 'episode-admission-001',
  planFingerprint: fingerprintAdaptiveSopPlan(validPlan),
  observedAt: '2026-07-21T02:00:00.000Z',
  repository: {
    worktreeRoot: '/tmp/clowder-adaptive-sop',
    branch: 'feat/F192-lf-0001-adaptive-sop',
    baseSha: 'd5961fe3974cf568b6bd080b0024eb97774ea53b',
    changedFiles: ['packages/api/test/harness-eval/adaptive-sop-admission.test.js'],
    diffFingerprint: 'a'.repeat(64),
    isolatedWorktree: true,
    recoveryWithinOneCommit: true,
  },
  data: {
    testDataIsolated: true,
    productionUserDataInScope: false,
  },
  capabilityRequests: [],
  capabilityResolution: {
    resolverFingerprint: 'b'.repeat(64),
    reviewerFingerprint: 'c'.repeat(64),
    actions: [reviewedAction('targeted-test', 'unrestricted', [])],
    requiredCapabilitiesMissing: [],
  },
  verification: {
    objectiveOutcomeCheck: true,
    mutatingWork: true,
    crossIndividualReviewPlanned: true,
    p1p2ClearancePlanned: true,
  },
};

function reviewedAction(actionId, classification, capabilities) {
  const evidenceRefs = [`plan.decisions.${actionId}.description`];
  return {
    actionId,
    classification,
    capabilities,
    resolver: {
      classification,
      capabilities,
      rationale: `Classify ${actionId} from the concrete action description.`,
      evidenceRefs,
      evidenceStatus: 'resolved',
    },
    review: {
      verdict: 'verified',
      rationale: `The cited description supports the ${classification} classification.`,
      evidenceRefs,
      evidenceStatus: 'resolved',
    },
  };
}

function capabilityRequest(overrides = {}) {
  return {
    actionId: 'change-public-contract-code',
    capability: 'public_contract_code_change',
    stage: 'before_review_ready',
    enforcement: 'hard_enforced',
    authority: 'not_required',
    evidenceRefs: ['review-gate:cross-individual'],
    ...overrides,
  };
}

function evaluateWithRequests(requests, factOverrides = {}) {
  const actionIds = [...new Set(requests.map((request) => request.actionId))];
  const plan = {
    ...validPlan,
    decisions: actionIds.map((actionId) => ({
      stepId: actionId,
      action: 'include',
      description: `Execute ${actionId}.`,
      reason: 'Exercise one independently classified action gate.',
      residualRisk: 'The test covers admission semantics only.',
    })),
    executionOrder: actionIds,
  };
  const actions = actionIds.map((actionId) =>
    reviewedAction(
      actionId,
      'resolved',
      requests.filter((request) => request.actionId === actionId).map((request) => request.capability),
    ),
  );
  const facts = {
    ...validFacts,
    ...factOverrides,
    planFingerprint: fingerprintAdaptiveSopPlan(plan),
    capabilityRequests: requests,
    capabilityResolution: {
      resolverFingerprint: 'b'.repeat(64),
      reviewerFingerprint: 'c'.repeat(64),
      actions,
      requiredCapabilitiesMissing: [],
    },
  };
  return evaluateSopAdmission(plan, facts);
}

describe('LF-0001 deterministic SOP admission envelope', () => {
  it('admits only independently verified facts and returns a stable fingerprint', () => {
    const first = evaluateSopAdmission(validPlan, validFacts);
    const laterObservation = evaluateSopAdmission(validPlan, {
      ...validFacts,
      observedAt: '2026-07-21T02:05:00.000Z',
      repository: {
        ...validFacts.repository,
        changedFiles: [...validFacts.repository.changedFiles].reverse(),
      },
    });

    assert.equal(first.schemaVersion, 'sop-admission-decision.v3');
    assert.equal(first.status, 'continue');
    assert.equal(first.strategyMayContinue, true);
    assert.deepEqual(first.actionGates, []);
    assert.match(first.envelopeFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(laterObservation.status, 'continue');
    assert.equal(laterObservation.envelopeFingerprint, first.envelopeFingerprint);

    const changedDiff = evaluateSopAdmission(validPlan, {
      ...validFacts,
      repository: { ...validFacts.repository, diffFingerprint: 'c'.repeat(64) },
    });
    assert.equal(changedDiff.status, 'deny', 'a contradictory actual diff must not reuse admission');
    assert.equal(changedDiff.strategyMayContinue, false);
  });

  it('keeps strategy live while requiring independently resolvable facts', () => {
    const decision = evaluateWithRequests([capabilityRequest({ enforcement: 'unknown', evidenceRefs: [] })], {
      ...validFacts,
      repository: { ...validFacts.repository, diffFingerprint: 'unknown' },
    });

    assert.equal(decision.status, 'need_evidence');
    assert.equal(decision.strategyMayContinue, true);
    assert.equal(decision.episodeId, validPlan.episodeId);
    assert.match(decision.envelopeFingerprint, /^[0-9a-f]{64}$/);
    assert.ok(decision.requiredFacts.includes('repository.diffFingerprint'));
    assert.ok(decision.requiredFacts.includes('capabilityRequests.change-public-contract-code.enforcement'));
    assert.equal(decision.actionGates[0].disposition, 'need_evidence');
  });

  it('continues adaptive strategy across sensitive code surfaces when their action gates are evidenced', () => {
    for (const capability of [
      'auth_code_change',
      'persistent_data_code_change',
      'runtime_code_change',
      'public_contract_code_change',
      'external_dependency_code_change',
    ]) {
      const decision = evaluateWithRequests([capabilityRequest({ actionId: capability, capability })]);

      assert.equal(decision.status, 'continue');
      assert.equal(decision.strategyMayContinue, true);
      assert.equal(decision.actionGates[0].disposition, 'satisfied');
      assert.equal(decision.actionGates[0].capability, capability);
    }
  });

  it('pauses only the concrete external effect when authority is missing', () => {
    const request = capabilityRequest({
      actionId: 'publish-release',
      capability: 'remote_publication',
      stage: 'before_publication',
      authority: 'missing',
      evidenceRefs: ['publication-guard:enabled'],
    });
    const decision = evaluateWithRequests([request]);

    assert.equal(decision.status, 'need_authority');
    assert.equal(decision.strategyMayContinue, true);
    assert.deepEqual(decision.requiredAuthorities, [{ actionId: 'publish-release', capability: 'remote_publication' }]);
    assert.equal(decision.actionGates[0].disposition, 'need_authority');

    const granted = evaluateWithRequests([
      { ...request, authority: 'granted', evidenceRefs: ['authority:operator', 'publication-guard:enabled'] },
    ]);
    assert.equal(granted.status, 'continue');
    assert.equal(granted.actionGates[0].disposition, 'satisfied');
  });

  it('takes authority policy from independent facts instead of a capability denylist', () => {
    const decision = evaluateWithRequests([
      capabilityRequest({
        actionId: 'approve-contract-migration',
        capability: 'public_contract_code_change',
        authority: 'missing',
        evidenceRefs: ['review-gate:cross-individual', 'gate:contract-compatibility'],
      }),
    ]);

    assert.equal(decision.status, 'need_authority');
    assert.deepEqual(decision.requiredAuthorities, [
      { actionId: 'approve-contract-migration', capability: 'public_contract_code_change' },
    ]);
  });

  it('resolves gate evidence before asking the operator for action authority', () => {
    const decision = evaluateWithRequests([
      capabilityRequest({
        actionId: 'publish-release',
        capability: 'remote_publication',
        stage: 'before_publication',
        authority: 'missing',
        evidenceRefs: [],
      }),
    ]);

    assert.equal(decision.status, 'need_evidence');
    assert.ok(decision.requiredFacts.includes('capabilityRequests.publish-release.evidenceRefs'));
    assert.equal(decision.actionGates[0].disposition, 'need_evidence');
  });

  it('requires evidence without abandoning adaptive strategy when enforcement is instruction-only', () => {
    const decision = evaluateWithRequests([
      capabilityRequest({ enforcement: 'instruction_enforced', evidenceRefs: [] }),
    ]);

    assert.equal(decision.status, 'need_evidence');
    assert.equal(decision.strategyMayContinue, true);
    assert.equal(decision.actionGates[0].disposition, 'need_evidence');
  });

  it('stops adaptive execution outside worktree or rollback containment without claiming full_sop is safe', () => {
    for (const repository of [
      { ...validFacts.repository, isolatedWorktree: false },
      { ...validFacts.repository, recoveryWithinOneCommit: false },
    ]) {
      const decision = evaluateSopAdmission(validPlan, { ...validFacts, repository });
      assert.equal(decision.status, 'deny');
      assert.equal(decision.strategyMayContinue, false);
      assert.equal(decision.recovery, 'stop_adaptive');
      assert.equal(Object.hasOwn(decision, 'fallback'), false);
    }
  });

  it('blocks contradictory model repository facts against observed facts', () => {
    const contradictoryPlan = {
      ...validPlan,
      repositoryFacts: { ...validPlan.repositoryFacts, branch: 'main' },
    };
    const decision = evaluateSopAdmission(contradictoryPlan, {
      ...validFacts,
      planFingerprint: fingerprintAdaptiveSopPlan(contradictoryPlan),
    });

    assert.equal(decision.schemaVersion, 'sop-admission-decision.v3');
    assert.equal(decision.status, 'deny');
    assert.equal(decision.strategyMayContinue, false);
    assert.equal(decision.episodeId, validPlan.episodeId);
    assert.match(decision.envelopeFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(decision.invariant, 'contradictory repository fact: branch');
    assert.equal(decision.recovery, 'stop_adaptive');
  });

  it('rejects capability facts resolved for a different plan fingerprint', () => {
    const decision = evaluateSopAdmission(validPlan, {
      ...validFacts,
      planFingerprint: '0'.repeat(64),
    });

    assert.equal(decision.status, 'deny');
    assert.equal(decision.strategyMayContinue, false);
    assert.equal(decision.invariant, 'contradictory plan fingerprint');
    assert.equal(decision.recovery, 'stop_adaptive');
  });

  it('keeps an unknown plan binding at need_evidence instead of treating it as authority', () => {
    const decision = evaluateSopAdmission(validPlan, {
      ...validFacts,
      planFingerprint: 'unknown',
    });

    assert.equal(decision.status, 'need_evidence');
    assert.ok(decision.requiredFacts.includes('planFingerprint'));
    assert.equal(decision.actionGates[0].capability, 'unclassified_action');
    assert.equal(decision.actionGates[0].disposition, 'need_evidence');
  });

  it('requires objective verification and mutating-work review plans', () => {
    const decision = evaluateSopAdmission(validPlan, {
      ...validFacts,
      verification: {
        ...validFacts.verification,
        objectiveOutcomeCheck: false,
        crossIndividualReviewPlanned: false,
      },
    });

    assert.equal(decision.status, 'need_evidence');
    assert.equal(decision.strategyMayContinue, true);
    assert.ok(decision.missingEvidence.includes('objective outcome check is not established'));
    assert.ok(decision.missingEvidence.includes('cross-individual review is not planned'));
  });

  it('accepts not-applicable test data isolation but rejects production data scope', () => {
    const docsDecision = evaluateSopAdmission(validPlan, {
      ...validFacts,
      data: { ...validFacts.data, testDataIsolated: 'not_applicable' },
    });
    assert.equal(docsDecision.status, 'continue');

    const productionDecision = evaluateSopAdmission(validPlan, {
      ...validFacts,
      data: { ...validFacts.data, productionUserDataInScope: true },
    });
    assert.equal(productionDecision.status, 'deny');
    assert.equal(productionDecision.strategyMayContinue, false);
    assert.equal(productionDecision.recovery, 'operator');
    assert.equal(productionDecision.actionGates[0].capability, 'production_data_access');
    assert.equal(productionDecision.actionGates[0].disposition, 'denied');
  });

  it('denies a forbidden action while allowing the model to replan the task around it', () => {
    const decision = evaluateWithRequests([
      capabilityRequest({
        actionId: 'read-production-users',
        capability: 'production_data_access',
        stage: 'before_execution',
        authority: 'granted',
        evidenceRefs: ['authority:operator'],
      }),
    ]);

    assert.equal(decision.status, 'deny');
    assert.equal(decision.strategyMayContinue, true);
    assert.equal(decision.recovery, 'replan');
    assert.equal(decision.actionGates[0].disposition, 'denied');
  });

  it('rejects duplicate action identities instead of joining their authority', () => {
    assert.throws(
      () =>
        parseSopAdmissionFacts({
          ...validFacts,
          capabilityRequests: [capabilityRequest(), capabilityRequest()],
        }),
      (error) => error instanceof AdaptiveSopContractError && error.code === 'invalid_contract',
    );
  });

  it('reports fact schema upgrades explicitly', () => {
    assert.throws(
      () => parseSopAdmissionFacts({ ...validFacts, schemaVersion: 'sop-admission-facts.v5' }),
      (error) => error instanceof AdaptiveSopContractError && error.code === 'unsupported_schema_version',
    );
  });
});
