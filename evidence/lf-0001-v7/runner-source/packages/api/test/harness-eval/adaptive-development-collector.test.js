import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdaptiveDevelopmentCollector } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-collector.js';
import { AdaptiveDevelopmentTrialStore } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-trial-store.js';

const BASE_SHA = '0a25a7e3d0de9c7529baefb1f84fbfec39351723';
const F240_REVIEWED_SHA = 'cd4bb48cbc06bf7cc9a011639e5cb56853557c04';
const DIFF_REF = `commit:${F240_REVIEWED_SHA}`;

describe('AdaptiveDevelopmentCollector', () => {
  it('does not derive a receipt before both Git and an Outcome Checkpoint terminal exist', () => {
    const { store, collector, episodeId } = setup();
    assert.equal(collector.collectEpisode(episodeId), null);
    appendGit(store, episodeId, BASE_SHA, BASE_SHA, false, '2026-07-29T18:00:01.000Z');
    assert.equal(collector.collectEpisode(episodeId), null);
    store.close();
  });

  it('joins exact independent evidence and explicit operator experience into a candidate', () => {
    const { store, collector, episodeId } = setup();
    appendCompleteEngineeringEvidence(store, episodeId);
    append(store, episodeId, 'experience', 'experience_assessment', 'session', {
      verdict: 'accepted',
    });

    const receipt = collector.collectEpisode(episodeId);
    assert.ok(receipt);
    assert.equal(receipt.candidateCase, true);
    assert.equal(receipt.operatorExperience, 'accepted');
    assert.equal(receipt.reviewedFinalSha, F240_REVIEWED_SHA);
    assert.deepEqual(receipt.missingFields, []);
    store.close();
  });

  it('keeps product experience unresolved even when engineering and Review evidence are green', () => {
    const { store, collector, episodeId } = setup();
    appendCompleteEngineeringEvidence(store, episodeId);

    const receipt = collector.collectEpisode(episodeId);
    assert.ok(receipt);
    assert.equal(receipt.outcome, 'success');
    assert.equal(receipt.operatorExperience, 'not_assessed');
    assert.equal(receipt.candidateCase, false);
    assert.deepEqual(receipt.missingFields, ['operator_experience']);
    store.close();
  });

  it('replays the latest F240 iteration without hiding harness friction or inventing acceptance', () => {
    const { store, collector, episodeId } = setup();
    appendGit(store, episodeId, BASE_SHA, BASE_SHA, false, '2026-07-29T18:00:01.000Z');
    appendGit(store, episodeId, BASE_SHA, F240_REVIEWED_SHA, true, '2026-07-29T19:20:00.000Z');
    append(store, episodeId, 'verification', 'verification', 'verification', {
      exitCode: 0,
      finalSha: F240_REVIEWED_SHA,
      diffRef: DIFF_REF,
    });
    append(store, episodeId, 'review-request-old', 'review_request', 'session', {
      reviewUnit: 'F240 first candidate',
      finalSha: '80ce69cf64bb3df6a0ec763130e04c4e2b8a69ce',
      diffRef: 'commit:80ce69cf64bb3df6a0ec763130e04c4e2b8a69ce',
    });
    append(store, episodeId, 'changes-requested', 'review_verdict', 'review-observer', {
      reviewerId: 'cat-iebdnvwv',
      authorId: 'cat-vjdun65e',
      verdict: 'changes_requested',
      reviewedFinalSha: '80ce69cf64bb3df6a0ec763130e04c4e2b8a69ce',
      reviewedDiffRef: 'commit:80ce69cf64bb3df6a0ec763130e04c4e2b8a69ce',
      reviewRequestEventId: 'event-review-request-old',
      reviewRequestSourceRef: 'session:review-request-old',
      findingCounts: { p1: 1, p2: 3, p3: 0 },
    });
    append(store, episodeId, 'review-request-final', 'review_request', 'session', {
      reviewUnit: 'F240 final candidate',
      finalSha: F240_REVIEWED_SHA,
      diffRef: DIFF_REF,
    });
    append(store, episodeId, 'approved', 'review_verdict', 'review-observer', {
      reviewerId: 'cat-iebdnvwv',
      authorId: 'cat-vjdun65e',
      verdict: 'approved',
      reviewedFinalSha: F240_REVIEWED_SHA,
      reviewedDiffRef: DIFF_REF,
      reviewRequestEventId: 'event-review-request-final',
      reviewRequestSourceRef: 'session:review-request-final',
      findingCounts: { p1: 0, p2: 0, p3: 0 },
    });
    append(store, episodeId, 'checkpoint', 'handoff', 'session', {
      reviewIntent: 'formal_review',
      reviewState: 'reviewed',
      reviewUnit: `F240 calibration authority; final=${F240_REVIEWED_SHA}`,
      operatorExperience: 'pending',
    });
    append(store, episodeId, 'terminal', 'terminal', 'runtime', { state: 'completed' });
    for (let index = 0; index < 3; index += 1) {
      append(store, episodeId, `route-failure-${index}`, 'harness_friction', 'runtime', {
        kind: 'route_failure',
      });
      append(store, episodeId, `recovery-nudge-${index}`, 'harness_friction', 'session', {
        kind: 'recovery_nudge',
      });
    }
    append(store, episodeId, 'timeout', 'harness_friction', 'runtime', {
      kind: 'invocation_timeout',
    });
    append(store, episodeId, 'control-plane', 'harness_friction', 'runtime', {
      kind: 'control_plane_failure',
    });

    const receipt = collector.collectEpisode(episodeId);
    assert.ok(receipt);
    assert.equal(receipt.outcome, 'corrected_success');
    assert.equal(receipt.reviewedFinalSha, F240_REVIEWED_SHA);
    assert.deepEqual(receipt.harnessFriction, {
      routeFailures: 3,
      invocationTimeouts: 1,
      recoveryNudges: 3,
      controlPlaneFailures: 1,
    });
    assert.equal(receipt.operatorExperience, 'not_assessed');
    assert.equal(receipt.candidateCase, false);
    assert.deepEqual(receipt.missingFields, ['operator_experience']);
    store.close();
  });
});

function setup() {
  const store = new AdaptiveDevelopmentTrialStore(':memory:');
  const episode = store.recordActivation({
    ownerUserId: 'default-user',
    threadId: 'thread_mqrp1yysrzhwspi5',
    activationMessageId: 'activation-message',
    activationText: '请使用 adaptive-development-sop 推进 F240',
    startedAt: '2026-07-29T18:00:00.000Z',
    actorCatId: 'cat-vjdun65e',
    modelId: 'gpt-5.6-sol',
    harnessVersion: 'sha256:f240-replay',
    projectPath: '/isolated/f240',
    worktree: '/isolated/f240',
  }).episode;
  return {
    store,
    collector: new AdaptiveDevelopmentCollector(store),
    episodeId: episode.episodeId,
  };
}

function appendCompleteEngineeringEvidence(store, episodeId) {
  appendGit(store, episodeId, BASE_SHA, BASE_SHA, false, '2026-07-29T18:00:01.000Z');
  appendGit(store, episodeId, BASE_SHA, F240_REVIEWED_SHA, true, '2026-07-29T19:20:00.000Z');
  append(store, episodeId, 'verification', 'verification', 'verification', {
    exitCode: 0,
    finalSha: F240_REVIEWED_SHA,
    diffRef: DIFF_REF,
  });
  append(store, episodeId, 'review-request', 'review_request', 'session', {
    reviewUnit: 'F240 exact final candidate',
    finalSha: F240_REVIEWED_SHA,
    diffRef: DIFF_REF,
  });
  append(store, episodeId, 'approved', 'review_verdict', 'review-observer', {
    reviewerId: 'cat-iebdnvwv',
    authorId: 'cat-vjdun65e',
    verdict: 'approved',
    reviewedFinalSha: F240_REVIEWED_SHA,
    reviewedDiffRef: DIFF_REF,
    reviewRequestEventId: 'event-review-request',
    reviewRequestSourceRef: 'session:review-request',
    findingCounts: { p1: 0, p2: 0, p3: 0 },
  });
  append(store, episodeId, 'checkpoint', 'handoff', 'session', {
    reviewIntent: 'formal_review',
    reviewState: 'reviewed',
    reviewUnit: `F240 calibration authority; final=${F240_REVIEWED_SHA}`,
    operatorExperience: 'pending',
  });
  append(store, episodeId, 'terminal', 'terminal', 'runtime', { state: 'completed' });
}

function appendGit(store, episodeId, baseSha, finalSha, mutating, occurredAt) {
  append(
    store,
    episodeId,
    `git-${finalSha}-${mutating}`,
    'git_snapshot',
    'git',
    {
      projectPath: '/isolated/f240',
      worktree: '/isolated/f240',
      branch: 'feat/f240-calibration-authority',
      baseSha,
      finalSha,
      diffRef: `commit:${finalSha}`,
      scopeEnvelope: mutating ? 'F240 calibration authority and product language' : 'baseline',
      mutating,
      evidenceComplete: true,
    },
    occurredAt,
  );
}

function append(store, episodeId, key, type, source, payload, occurredAt = '2026-07-29T19:30:00.000Z') {
  store.appendEvent(episodeId, {
    eventId: `event-${key}`,
    type,
    occurredAt,
    source,
    sourceRef: `${source}:${key}`,
    payload,
  });
}
