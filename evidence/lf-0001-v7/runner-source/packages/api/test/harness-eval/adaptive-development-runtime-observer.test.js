import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { AdaptiveDevelopmentCollector } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-collector.js';
import { AdaptiveDevelopmentRuntimeObserver } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-runtime-observer.js';
import { AdaptiveDevelopmentRuntimeObserverWorker } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-runtime-observer-worker-client.js';
import { AdaptiveDevelopmentTrialStore } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-trial-store.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('adaptive development runtime ownership migration', () => {
  it('mounts a fail-isolated passive observer in the API and AgentRouter', () => {
    const index = readFileSync(resolve(root, 'packages/api/src/index.ts'), 'utf8');
    const router = readFileSync(
      resolve(root, 'packages/api/src/domains/cats/services/agents/routing/AgentRouter.ts'),
      'utf8',
    );

    assert.match(index, /AdaptiveDevelopmentRuntimeObserver/);
    assert.match(index, /AdaptiveDevelopmentRuntimeObserverWorker/);
    assert.doesNotMatch(index, /new AdaptiveDevelopmentRuntimeObserver\(\{/);
    assert.match(index, /AdaptiveDevelopmentTrialStore/);
    assert.match(router, /recordUserOptIn/);
    assert.match(router, /invocationId:\s*options\.parentInvocationId/);
    assert.match(router, /observeRouteFailure/);
    assert.match(router, /adaptiveDevelopmentObserver/);
  });

  it('keeps the passive observer implementation separate from Work acceptance authority', () => {
    assert.equal(
      existsSync(
        resolve(
          root,
          'packages/api/src/infrastructure/harness-eval/adaptive-development/adaptive-development-runtime-observer.ts',
        ),
      ),
      true,
    );
    const observer = readFileSync(
      resolve(
        root,
        'packages/api/src/infrastructure/harness-eval/adaptive-development/adaptive-development-runtime-observer.ts',
      ),
      'utf8',
    );
    assert.doesNotMatch(observer, /WorkLedger|WorkAcceptance|admitWork|publishWorkDeliveryClaim/);
    assert.doesNotMatch(observer, /bindLegacyRoute|bindOpenRoute/);
    assert.match(observer, /fail-isolated|fail isolated/i);
  });

  it('persists production observations through an off-thread worker boundary', async () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'adaptive-observer-worker-'));
    const dbPath = resolve(tempRoot, 'episodes.sqlite');
    const observer = new AdaptiveDevelopmentRuntimeObserverWorker({
      dbPath,
      harnessVersion: 'sha256:worker-test',
      modelIds: { 'cat-vjdun65e': 'gpt-5.6-sol' },
    });
    try {
      observer.recordUserOptIn({
        ownerUserId: 'owner',
        message: userMessage({
          id: 'worker-activation',
          content: '请使用 adaptive-development-sop 推进这个任务',
        }),
        thread: passiveThread(),
        targetCats: ['cat-vjdun65e'],
      });
      await observer.finishInvocation({
        ownerUserId: 'owner',
        threadId: 'thread-passive',
        userMessageId: 'worker-activation',
      });
      await observer.close();

      const store = new AdaptiveDevelopmentTrialStore(dbPath);
      assert.equal(store.getLatestEpisodeByThread('owner', 'thread-passive')?.activationMessageId, 'worker-activation');
      store.close();
    } finally {
      await observer.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('records an Outcome Checkpoint and explicit experience without blocking the route on receipt derivation', async () => {
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const baseSha = 'a'.repeat(40);
    const finalSha = 'b'.repeat(40);
    let gitCalls = 0;
    const observer = new AdaptiveDevelopmentRuntimeObserver({
      store,
      gitResolver: {
        async resolve() {
          gitCalls += 1;
          const isFinal = gitCalls > 1;
          return {
            projectPath: '/isolated/repo',
            worktree: '/isolated/repo',
            branch: 'feat/passive-eval',
            baseSha,
            finalSha: isFinal ? finalSha : baseSha,
            diffRef: `commit:${isFinal ? finalSha : baseSha}`,
            scopeEnvelope: isFinal ? 'one implementation and its tests' : 'baseline',
            mutating: isFinal,
            evidenceComplete: true,
            trackedDirty: false,
            untrackedPaths: [],
            untrackedContentHashes: {},
            untrackedContentDigest: 'empty',
          };
        },
      },
      harnessVersion: 'sha256:test',
      getModelId: () => 'gpt-5.6-sol',
    });
    const thread = {
      id: 'thread-passive',
      projectPath: '/isolated/repo',
      title: null,
      createdBy: 'owner',
      participants: [],
      lastActiveAt: 1,
      createdAt: 1,
    };
    const activationMessage = userMessage({
      id: 'activation',
      content: '请使用 adaptive-development-sop 推进这个任务',
    });

    observer.recordUserOptIn({ message: activationMessage, thread, targetCats: ['cat-vjdun65e'] });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation',
    });

    beginRoute(observer, 'failed-route', 'continue implementation', ['cat-vjdun65e']);
    observer.observeRouteFailure({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'failed-route',
      error: new Error('agent route timed out'),
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'failed-route',
    });
    const frictionKinds = store
      .listEvents(store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId)
      .filter((event) => event.type === 'harness_friction')
      .map((event) => event.payload.kind);
    assert.deepEqual(frictionKinds, ['route_failure', 'invocation_timeout']);

    beginRoute(observer, 'decorative-checkpoint', 'report current status', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'decorative-checkpoint',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content:
          '## Outcome Checkpoint\nreview_intent: local_result\nreview_state: pending\nreview_unit: passive observer correction',
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'decorative-checkpoint',
    });
    const activeEpisode = store.getLatestEpisodeByThread('owner', 'thread-passive');
    assert.ok(activeEpisode);
    assert.equal(
      store.listEvents(activeEpisode.episodeId).some((event) => event.type === 'terminal'),
      false,
      'review labels alone must not masquerade as an outcome alignment checkpoint',
    );

    beginRoute(observer, 'result-route', 'report bounded outcome', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'result-route',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: [
          '## Outcome Checkpoint',
          'original_outcome: remove synchronous Work control from the free-plan path',
          'final_scope: passive runtime observation and honest terminal alignment',
          'achieved: local development no longer waits on Work orchestration',
          'not_achieved: none',
          'deferred: independent review',
          'changed_surface: adaptive SOP and passive API observer',
          'verification_evidence: API build and focused tests passed',
          'review_evidence: none yet',
          'remaining_risks: exact reviewer-route binding remains pending',
          'next_owner_or_action: independent reviewer',
          'operator_experience: pending',
          'review_intent: formal_review',
          'review_state: in_review',
          `review_unit: outcome=passive observer correction; base=${baseSha}; final=${finalSha}; diff=commit:${finalSha}`,
        ].join('\n'),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'result-route',
    });

    const episode = store.getLatestEpisodeByThread('owner', 'thread-passive');
    assert.ok(episode);
    assert.deepEqual(
      store
        .listEvents(episode.episodeId)
        .filter((event) => event.type === 'handoff' || event.type === 'terminal')
        .map((event) => event.type),
      ['handoff', 'terminal'],
    );

    beginReviewRoute(observer, 'review-route', 'review the exact candidate', ['cat-iebdnvwv']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'review-route',
      message: {
        type: 'text',
        catId: 'cat-iebdnvwv',
        timestamp: 4,
        content: `APPROVE\nbase=${baseSha}\nfinal=${finalSha}\ndiff=commit:${finalSha}\nP1=0 P2=0 P3=1`,
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'review-route',
    });
    const reviewEvent = store.listEvents(episode.episodeId).find((event) => event.type === 'review_verdict');
    assert.equal(reviewEvent?.payload.reviewedFinalSha, finalSha);
    assert.equal(reviewEvent?.payload.reviewedDiffRef, `commit:${finalSha}`);

    observer.recordUserOptIn({
      message: userMessage({
        id: 'experience',
        content: '产品体验验收：通过',
        timestamp: 5,
      }),
      thread,
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'experience',
    });
    assert.equal(
      store.listEvents(episode.episodeId).find((event) => event.type === 'experience_assessment')?.payload.verdict,
      'accepted',
    );
    store.close();
  });

  it('does not trust provider tool-result prose as verification evidence', async () => {
    const { observer, store, episodeId } = await setupObserver();
    beginRoute(observer, 'untrusted-tool-route', 'continue implementation', ['cat-vjdun65e']);

    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'untrusted-tool-route',
      message: {
        type: 'tool_use',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        toolUseId: 'tool-1',
        toolName: 'exec_command',
        toolInput: { command: 'pnpm test' },
      },
    });
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'untrusted-tool-route',
      message: {
        type: 'tool_result',
        catId: 'cat-vjdun65e',
        timestamp: 4,
        toolUseId: 'tool-1',
        toolName: 'exec_command',
        toolResultStatus: 'error',
        content: 'command: pnpm test\nexit_code: 0\nall tests passed',
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'untrusted-tool-route',
    });

    assert.equal(
      store.listEvents(episodeId).some((event) => event.type === 'verification'),
      false,
      'only an immutable runtime receipt may become verification evidence',
    );
    store.close();
  });

  it('binds a delayed managed-command receipt to the episode that launched its route', async () => {
    const receipt = {
      sourceEventId: 'managed-command:task-a',
      ownerUserId: 'owner',
      invocationId: 'child-invocation-a',
      routeInvocationId: 'route-invocation-a',
      toolCallId: 'task-a',
      commandKind: 'verification',
      commandDigest: `sha256:${'1'.repeat(64)}`,
      exitCode: 0,
      outputDigest: `sha256:${'2'.repeat(64)}`,
      completedAt: '2026-07-29T19:20:00.000Z',
    };
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const observer = new AdaptiveDevelopmentRuntimeObserver({
      store,
      gitResolver: {
        async resolve() {
          return gitSnapshot('a'.repeat(40), 'b'.repeat(40));
        },
      },
      harnessVersion: 'sha256:test',
      getModelId: () => 'gpt-5.6-sol',
      commandReceiptReader: {
        async get() {
          return receipt;
        },
      },
    });
    observer.recordUserOptIn({
      invocationId: 'activation-a',
      message: userMessage({ id: 'activation-a', content: '请使用 adaptive-development-sop 推进任务 A' }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation-a',
    });
    const episodeA = store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId;
    observer.recordUserOptIn({
      invocationId: receipt.routeInvocationId,
      message: userMessage({ id: 'launch-a', content: 'run verification for A' }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'launch-a',
    });

    observer.recordUserOptIn({
      invocationId: 'activation-b',
      message: userMessage({ id: 'activation-b', content: '请使用 adaptive-development-sop 推进任务 B', timestamp: 4 }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation-b',
    });
    const episodeB = store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId;

    observer.recordUserOptIn({
      message: {
        ...userMessage({ id: 'wake-a', content: 'managed command A completed', timestamp: 5 }),
        userId: 'scheduler',
        source: {
          connector: 'hold-ball',
          label: '持球通知',
          icon: '🏓',
          meta: { taskId: 'task-a', threadId: 'thread-passive', catId: 'cat-vjdun65e', wakeWhen: true },
        },
      },
      ownerUserId: 'owner',
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'wake-a',
    });

    assert.equal(
      store.listEvents(episodeA).some((event) => event.type === 'verification'),
      true,
    );
    assert.equal(
      store.listEvents(episodeB).some((event) => event.type === 'verification'),
      false,
    );
    store.close();
  });

  it('freezes a route to the episode selected when observation begins', async () => {
    const { observer, store, episodeId: episodeA } = await setupObserver();
    beginRoute(observer, 'route-a', 'finish episode A', ['cat-vjdun65e']);

    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'route-a',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: outcomeCheckpoint({
          originalOutcome: 'finish episode A',
          achieved: 'episode A is complete',
          reviewUnit:
            'outcome=episode A; base=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; final=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; diff=commit:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        }),
      },
    });

    observer.recordUserOptIn({
      message: userMessage({
        id: 'activation-b',
        content: '请使用 adaptive-development-sop 推进另一个目标',
        timestamp: 4,
      }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation-b',
    });
    const episodeB = store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId;
    assert.notEqual(episodeB, episodeA);

    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'route-a',
    });

    assert.equal(
      store.listEvents(episodeA).some((event) => event.type === 'handoff'),
      true,
    );
    assert.equal(
      store.listEvents(episodeB).some((event) => event.type === 'handoff'),
      false,
    );
    store.close();
  });

  it('binds review to its request, parses explicit counts, and invalidates approval after a later Git change', async () => {
    const baseSha = 'a'.repeat(40);
    const reviewedSha = `${'b'.repeat(39)}3`;
    const changedSha = 'c'.repeat(40);
    let gitCalls = 0;
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const observer = new AdaptiveDevelopmentRuntimeObserver({
      store,
      gitResolver: {
        async resolve() {
          gitCalls += 1;
          const finalSha = gitCalls === 1 ? baseSha : gitCalls < 4 ? reviewedSha : changedSha;
          return gitSnapshot(baseSha, finalSha);
        },
      },
      harnessVersion: 'sha256:test',
      getModelId: () => 'gpt-5.6-sol',
    });
    observer.recordUserOptIn({
      message: userMessage({ id: 'activation', content: '请使用 adaptive-development-sop 推进这个任务' }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation',
    });
    const episodeId = store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId;

    beginRoute(observer, 'checkpoint', 'prepare exact review unit', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: outcomeCheckpoint({
          originalOutcome: 'ship the reviewed implementation',
          achieved: 'the implementation is ready for review',
          reviewIntent: 'formal_review',
          reviewState: 'in_review',
          reviewUnit: `outcome=ship implementation; base=${baseSha}; final=${reviewedSha}; diff=commit:${reviewedSha}`,
        }),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
    });
    store.appendEvent(episodeId, {
      eventId: 'trusted-verification',
      type: 'verification',
      occurredAt: '2026-07-29T19:20:00.000Z',
      source: 'verification',
      sourceRef: 'managed-command:trusted',
      payload: { exitCode: 0, finalSha: reviewedSha, diffRef: `commit:${reviewedSha}` },
    });

    beginReviewRoute(observer, 'review', 'review the exact candidate', ['cat-iebdnvwv']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'review',
      message: {
        type: 'text',
        catId: 'cat-iebdnvwv',
        timestamp: 4,
        content: [
          'APPROVE',
          `base=${baseSha}`,
          `final=${reviewedSha}`,
          `diff=commit:${reviewedSha}`,
          'P1=0 P2=0 P3=1',
        ].join('\n'),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'review',
    });
    const reviewEvent = store.listEvents(episodeId).find((event) => event.type === 'review_verdict');
    assert.deepEqual(reviewEvent?.payload.findingCounts, { p1: 0, p2: 0, p3: 1 });
    assert.equal(typeof reviewEvent?.payload.reviewRequestEventId, 'string');

    observer.recordUserOptIn({
      message: userMessage({ id: 'experience', content: '产品体验验收：通过', timestamp: 5 }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'experience',
    });

    const receipt = new AdaptiveDevelopmentCollector(store).collectEpisode(episodeId);
    assert.ok(receipt);
    assert.equal(receipt.finalSha, changedSha);
    assert.equal(receipt.candidateCase, false);
    assert.equal(receipt.missingFields.includes('review_binding'), true);
    store.close();
  });

  it('keeps the exact review request open when the worktree drifts before the verdict arrives', async () => {
    const baseSha = 'a'.repeat(40);
    const requestedSha = 'b'.repeat(40);
    const driftedSha = 'c'.repeat(40);
    let gitCalls = 0;
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const observer = new AdaptiveDevelopmentRuntimeObserver({
      store,
      gitResolver: {
        async resolve() {
          gitCalls += 1;
          return gitSnapshot(baseSha, gitCalls === 1 ? baseSha : gitCalls === 2 ? requestedSha : driftedSha);
        },
      },
      harnessVersion: 'sha256:test',
      getModelId: () => 'gpt-5.6-sol',
    });
    observer.recordUserOptIn({
      message: userMessage({ id: 'activation', content: '请使用 adaptive-development-sop 推进这个任务' }),
      thread: passiveThread(),
      targetCats: ['cat-vjdun65e'],
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'activation',
    });
    const episodeId = store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId;

    beginRoute(observer, 'checkpoint', 'prepare exact review unit', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: outcomeCheckpoint({
          originalOutcome: 'ship the reviewed implementation',
          achieved: 'the implementation is ready for review',
          reviewIntent: 'formal_review',
          reviewState: 'in_review',
          reviewUnit: `outcome=ship implementation; base=${baseSha}; final=${requestedSha}; diff=commit:${requestedSha}`,
        }),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
    });

    beginReviewRoute(observer, 'stale-review', 'review the exact candidate', ['cat-iebdnvwv']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'stale-review',
      message: {
        type: 'text',
        catId: 'cat-iebdnvwv',
        timestamp: 4,
        content: ['APPROVE', `final=${requestedSha}`, `diff=commit:${requestedSha}`, 'P1=0 P2=0 P3=0'].join('\n'),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'stale-review',
    });

    assert.equal(
      store.listEvents(episodeId).some((event) => event.type === 'review_verdict'),
      false,
    );
    assert.equal(store.getLatestEpisodeAwaitingReview('owner', 'thread-passive')?.episodeId, episodeId);
    store.close();
  });

  it('drops a reviewer verdict when the trusted route begin binding is missing', async () => {
    const { observer, store, episodeId } = await setupObserver();
    const baseSha = 'a'.repeat(40);
    const finalSha = 'b'.repeat(40);
    beginRoute(observer, 'checkpoint', 'prepare exact review unit', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: outcomeCheckpoint({
          originalOutcome: 'ship the reviewed implementation',
          achieved: 'the implementation is ready for review',
          reviewIntent: 'formal_review',
          reviewState: 'in_review',
          reviewUnit: `outcome=ship implementation; base=${baseSha}; final=${finalSha}; diff=commit:${finalSha}`,
        }),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'checkpoint',
    });

    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'unrouted-review',
      message: {
        type: 'text',
        catId: 'unrouted-cat',
        timestamp: 4,
        content: ['APPROVE', `final=${finalSha}`, `diff=commit:${finalSha}`, 'P1=0 P2=0 P3=0'].join('\n'),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'unrouted-review',
    });

    assert.equal(
      store.listEvents(episodeId).some((event) => event.type === 'review_verdict'),
      false,
    );
    store.close();
  });

  it('maps a complete but unmet Outcome Checkpoint to a failed terminal outcome', async () => {
    const { observer, store, episodeId } = await setupObserver();
    beginRoute(observer, 'unmet', 'report the bounded iteration outcome', ['cat-vjdun65e']);
    observer.observeAgentMessage({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'unmet',
      message: {
        type: 'text',
        catId: 'cat-vjdun65e',
        timestamp: 3,
        content: outcomeCheckpoint({
          originalOutcome: 'implement the requested behavior',
          achieved: 'none',
          notAchieved: 'the requested behavior is still missing',
          reviewUnit:
            'outcome=missing; base=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; final=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; diff=commit:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      },
    });
    await observer.finishInvocation({
      ownerUserId: 'owner',
      threadId: 'thread-passive',
      userMessageId: 'unmet',
    });

    const terminal = store.listEvents(episodeId).find((event) => event.type === 'terminal');
    assert.equal(terminal?.payload.state, 'failed');
    assert.equal(terminal?.payload.reason, 'outcome_checkpoint_not_achieved');
    store.close();
  });
});

async function setupObserver() {
  const store = new AdaptiveDevelopmentTrialStore(':memory:');
  let gitCalls = 0;
  const observer = new AdaptiveDevelopmentRuntimeObserver({
    store,
    gitResolver: {
      async resolve() {
        gitCalls += 1;
        return gitSnapshot('a'.repeat(40), gitCalls === 1 ? 'a'.repeat(40) : 'b'.repeat(40));
      },
    },
    harnessVersion: 'sha256:test',
    getModelId: () => 'gpt-5.6-sol',
  });
  observer.recordUserOptIn({
    invocationId: 'invocation-activation',
    message: userMessage({ id: 'activation', content: '请使用 adaptive-development-sop 推进这个任务' }),
    thread: passiveThread(),
    targetCats: ['cat-vjdun65e'],
  });
  await observer.finishInvocation({
    ownerUserId: 'owner',
    threadId: 'thread-passive',
    userMessageId: 'activation',
  });
  return {
    observer,
    store,
    episodeId: store.getLatestEpisodeByThread('owner', 'thread-passive').episodeId,
  };
}

function beginRoute(observer, id, content, targetCats) {
  observer.recordUserOptIn({
    invocationId: `invocation-${id}`,
    message: userMessage({ id, content }),
    thread: passiveThread(),
    targetCats,
  });
}

function beginReviewRoute(observer, id, content, targetCats) {
  observer.recordUserOptIn({
    invocationId: `invocation-${id}`,
    message: { ...userMessage({ id, content }), catId: 'cat-vjdun65e', origin: 'callback' },
    thread: passiveThread(),
    targetCats,
  });
}

function passiveThread() {
  return {
    id: 'thread-passive',
    projectPath: '/isolated/repo',
    title: null,
    createdBy: 'owner',
    participants: [],
    lastActiveAt: 1,
    createdAt: 1,
  };
}

function gitSnapshot(baseSha, finalSha) {
  return {
    projectPath: '/isolated/repo',
    worktree: '/isolated/repo',
    branch: 'feat/passive-eval',
    baseSha,
    finalSha,
    diffRef: `commit:${finalSha}`,
    scopeEnvelope: baseSha === finalSha ? 'baseline' : 'one implementation and its tests',
    mutating: baseSha !== finalSha,
    evidenceComplete: true,
    trackedDirty: false,
    untrackedPaths: [],
    untrackedContentHashes: {},
    untrackedContentDigest: 'empty',
  };
}

function outcomeCheckpoint({
  originalOutcome,
  achieved,
  notAchieved = 'none',
  reviewIntent = 'local_result',
  reviewState = 'pending',
  reviewUnit,
}) {
  return [
    '## Outcome Checkpoint',
    `original_outcome: ${originalOutcome}`,
    'final_scope: passive runtime evaluation',
    `achieved: ${achieved}`,
    `not_achieved: ${notAchieved}`,
    'deferred: independent review',
    'changed_surface: adaptive SOP and passive observer',
    'verification_evidence: focused tests',
    'review_evidence: none yet',
    'remaining_risks: reviewer verdict pending',
    'next_owner_or_action: independent reviewer',
    'operator_experience: pending',
    `review_intent: ${reviewIntent}`,
    `review_state: ${reviewState}`,
    `review_unit: ${reviewUnit}`,
  ].join('\n');
}

function userMessage({ id, content, timestamp = 2 }) {
  return {
    id,
    threadId: 'thread-passive',
    userId: 'owner',
    catId: null,
    content,
    mentions: [],
    timestamp,
  };
}
