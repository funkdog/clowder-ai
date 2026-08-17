import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { AdaptiveDevelopmentCollector } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-collector.js';
import { AdaptiveDevelopmentTrialProvider } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-trial-provider.js';
import { AdaptiveDevelopmentTrialStore } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-trial-store.js';
import { generateAdaptiveDevelopmentLiveVerdict } from '../../dist/infrastructure/harness-eval/adaptive-development/eval-adaptive-development-live-verdict.js';
import { validateAdaptiveDevelopmentSelector } from '../../dist/infrastructure/harness-eval/publish-verdict/validation.js';

const START_MS = Date.parse('2026-07-29T00:00:00.000Z');
const END_MS = Date.parse('2026-07-30T00:00:00.000Z');
const roots = [];
const domain = {
  domainId: 'eval:adaptive-development',
  displayName: 'Adaptive Development Free Plan Eval',
  systemThreadId: 'thread_eval_adaptive_development',
  evalCat: { catId: 'opus-47', handle: '@opus47', model: 'claude-opus-4-7' },
  frequency: 'daily',
  sourceAdapter: 'adaptive-development-trial-eval',
  sourceRefsKind: 'adaptive-development-trial-window',
  threadPolicy: {
    role: 'working-home',
    stateSot: 'registry',
    allowedContent: ['longitudinal-analysis'],
  },
  legacyScheduledTaskIds: [],
  handoffTargetResolver: { featureId: 'F192', ownerCatId: 'opus-47', threadLookup: 'feature-thread' },
  sla: { acknowledgeHours: 48, reevalWithinHours: 168 },
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('adaptive development eval wiring', () => {
  it('resolves only the owner-scoped passive episode window', () => {
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const own = activate(store, 'owner', 'message-own');
    activate(store, 'other-owner', 'message-other');
    const provider = new AdaptiveDevelopmentTrialProvider(store, new AdaptiveDevelopmentCollector(store));

    const result = provider.resolve({ windowStartMs: START_MS, windowEndMs: END_MS }, { ownerUserId: 'owner' });
    assert.deepEqual(
      result.observedEpisodes.map((episode) => episode.episodeId),
      [own.episodeId],
    );
    assert.deepEqual(result.incompleteEpisodeIds, [own.episodeId]);
    store.close();
  });

  it('does not allow an explicit episode selector to escape the owner boundary', () => {
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const other = activate(store, 'other-owner', 'message-other');
    const provider = new AdaptiveDevelopmentTrialProvider(store, new AdaptiveDevelopmentCollector(store));

    assert.throws(
      () =>
        provider.resolve(
          { windowStartMs: START_MS, windowEndMs: END_MS, episodeIds: [other.episodeId] },
          { ownerUserId: 'owner' },
        ),
      /no_adaptive_development_episodes_in_window/,
    );
    store.close();
  });

  it('validates passive episode selectors and rejects Work identifiers', () => {
    assert.equal(
      validateAdaptiveDevelopmentSelector({
        kind: 'adaptive-development-trial-window',
        windowStartMs: START_MS,
        windowEndMs: END_MS,
        episodeIds: ['adep-123'],
      }),
      null,
    );
    assert.match(
      validateAdaptiveDevelopmentSelector({
        kind: 'adaptive-development-trial-window',
        windowStartMs: START_MS,
        windowEndMs: END_MS,
        workIds: ['work-123'],
      }),
      /workIds are not supported/,
    );
  });

  it('publishes only opaque episode refs and aggregate passive evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'adaptive-episode-projection-'));
    roots.push(root);
    const harnessFeedbackRoot = join(root, 'docs', 'harness-feedback');
    mkdirSync(harnessFeedbackRoot, { recursive: true });

    generateAdaptiveDevelopmentLiveVerdict({
      verdictId: 'adaptive-episode-safe-projection',
      harnessFeedbackRoot,
      domain,
      sourceWindow: {
        windowStartMs: START_MS,
        windowEndMs: END_MS,
        observedEpisodes: [
          {
            episodeId: 'adep-private-id',
            startedAt: '2026-07-29T12:00:00.000Z',
            actorCatId: 'private-author-cat',
            modelId: 'private-model',
            harnessVersion: 'skill-v3',
            projectPath: '/Users/operator/private-project',
            worktree: '/Users/operator/private-worktree',
          },
        ],
        receipts: [
          {
            episodeId: 'adep-private-id',
            mode: 'free_plan_hard_gates',
            collectorContractVersion: 'adaptive-development-collector.v3',
            outcome: 'corrected_success',
            startedAt: '2026-07-29T12:00:00.000Z',
            modelId: 'private-model',
            harnessVersion: 'skill-v3',
            projectPath: '/Users/operator/private-project',
            worktree: '/Users/operator/private-worktree',
            branch: 'private/branch',
            baseSha: 'a'.repeat(40),
            finalSha: 'b'.repeat(40),
            diffRef: `commit:${'b'.repeat(40)}`,
            scopeEnvelope: 'private/file.ts',
            omittedOrReplacedSoftSteps: [],
            replans: ['private replan'],
            verificationRefs: ['private:verification'],
            reviewRefs: ['private:review'],
            reviewedFinalSha: 'b'.repeat(40),
            reviewedDiffRef: `commit:${'b'.repeat(40)}`,
            reviewFindingCounts: { p1: 0, p2: 0, p3: 1 },
            strategyResult: 'continue',
            actionGateSummary: { satisfied: 1, needEvidence: 0, needAuthority: 0, denied: 0 },
            operatorExperience: 'not_assessed',
            harnessFriction: {
              routeFailures: 3,
              invocationTimeouts: 1,
              recoveryNudges: 3,
              controlPlaneFailures: 1,
            },
            missingFields: ['operator_experience'],
            candidateCase: false,
            candidateCaseReason: 'missing:operator_experience',
          },
        ],
        incompleteEpisodeIds: [],
      },
      submittedPacket: packet(),
      generatedAt: '2026-07-29T13:00:00.000Z',
      generatorCommit: 'c'.repeat(40),
    });

    const raw = readFileSync(
      join(harnessFeedbackRoot, 'bundles', 'adaptive-episode-safe-projection', 'raw', 'trial-receipts.json'),
      'utf8',
    );
    for (const secret of [
      'adep-private-id',
      'private-author-cat',
      'private-model',
      '/Users/operator',
      'private/branch',
      'private/file.ts',
      'private replan',
      'private:verification',
      'private:review',
      'a'.repeat(40),
      'b'.repeat(40),
    ]) {
      assert.equal(raw.includes(secret), false, `publish projection leaked ${secret}`);
    }
    assert.match(raw, /"episodeRef": "episode-[a-f0-9]{20}"/);
    assert.match(raw, /"operatorExperience": "not_assessed"/);
    assert.match(raw, /"routeFailures": 3/);
    assert.match(raw, /"candidateCase": false/);
    assert.match(raw, /"projectionVersion": "adaptive-development-publish-projection.v3"/);

    const provenance = readFileSync(
      join(harnessFeedbackRoot, 'bundles', 'adaptive-episode-safe-projection', 'provenance.json'),
      'utf8',
    );
    assert.match(provenance, /"version": "3"/);
    assert.match(provenance, /"sanitizeRulesVersion": "lf-0001-adaptive-development-v3"/);
  });
});

function activate(store, ownerUserId, activationMessageId) {
  return store.recordActivation({
    ownerUserId,
    threadId: 'thread-f240',
    activationMessageId,
    activationText: '请使用 adaptive-development-sop',
    startedAt: '2026-07-29T12:00:00.000Z',
    actorCatId: 'cat-vjdun65e',
    modelId: 'gpt-5.6-sol',
    harnessVersion: 'sha256:test',
    projectPath: '/isolated/repo',
    worktree: '/isolated/repo',
  }).episode;
}

function packet() {
  return {
    id: 'adaptive-episode-safe-projection',
    domainId: 'eval:adaptive-development',
    createdAt: '2026-07-29T13:00:00.000Z',
    phenomenon: 'one passive episode is ready for evaluation',
    harnessUnderEval: {
      featureId: 'F192',
      componentId: 'LF-0001-free-plan-collector',
      name: 'Passive episode evidence collector',
    },
    evidencePacket: {
      snapshotRefs: ['placeholder'],
      attributionRefs: ['placeholder'],
      metricRefs: ['metric:observed_episodes_total'],
      sampleTraceRefs: ['episode:opaque'],
    },
    dailyTrend: {
      window: '24h',
      current: { observed_episodes_total: 1 },
      baseline: { observed_episodes_total: 0 },
      threshold: { observed_episodes_total: 3 },
      direction: 'unknown',
    },
    rootCauseHypothesis: {
      summary: 'passive episode evidence preserves incomplete operator experience',
      confidence: 'medium',
      alternatives: ['more samples needed'],
    },
    verdict: 'keep_observe',
    ownerAsk: {
      targetFeatureId: 'F192',
      targetOwnerCatId: 'opus-47',
      requestedAction: 'observe more passive episodes',
    },
    acceptanceReevalPlan: {
      nextEvalAt: '2026-07-30T13:00:00.000Z',
      closureCondition: 'enough passive receipts exist',
    },
    counterarguments: ['current sample is small'],
  };
}
