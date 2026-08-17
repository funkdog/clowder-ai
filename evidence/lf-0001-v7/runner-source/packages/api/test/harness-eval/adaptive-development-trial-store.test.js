import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { AdaptiveDevelopmentTrialStore } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-trial-store.js';

function activation(overrides = {}) {
  return {
    ownerUserId: 'user-1',
    threadId: 'thread-1',
    activationMessageId: 'message-1',
    activationText: '请按 free-plan hard-gates 推进',
    startedAt: '2026-07-23T01:00:00.000Z',
    actorCatId: 'cat-vjdun65e',
    modelId: 'gpt-5.6-sol',
    harnessVersion: 'sha256:skill-v1',
    projectPath: '/repo',
    worktree: '/repo-wt',
    ...overrides,
  };
}

describe('AdaptiveDevelopmentTrialStore', () => {
  it('creates exactly one durable episode per owner/thread/activation message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adaptive-trial-store-'));
    const dbPath = join(dir, 'trials.sqlite');

    const firstStore = new AdaptiveDevelopmentTrialStore(dbPath);
    const first = firstStore.recordActivation(activation());
    const duplicate = firstStore.recordActivation(activation());
    assert.equal(first.inserted, true);
    assert.equal(duplicate.inserted, false);
    assert.equal(duplicate.episode.episodeId, first.episode.episodeId);
    firstStore.close();

    const reopened = new AdaptiveDevelopmentTrialStore(dbPath);
    assert.deepEqual(reopened.getEpisode(first.episode.episodeId), first.episode);
    reopened.close();
  });

  it('persists an immutable route-invocation binding and rejects reassignment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adaptive-trial-binding-'));
    const dbPath = join(dir, 'trials.sqlite');
    const firstStore = new AdaptiveDevelopmentTrialStore(dbPath);
    const episodeA = firstStore.recordActivation(activation()).episode;
    const episodeB = firstStore.recordActivation(
      activation({
        activationMessageId: 'message-2',
        startedAt: '2026-07-23T02:00:00.000Z',
      }),
    ).episode;
    const binding = {
      routeInvocationId: 'route-invocation-1',
      episodeId: episodeA.episodeId,
      ownerUserId: episodeA.ownerUserId,
      threadId: episodeA.threadId,
    };

    firstStore.recordInvocationBinding(binding);
    firstStore.close();

    const reopened = new AdaptiveDevelopmentTrialStore(dbPath);
    assert.equal(
      reopened.getEpisodeByInvocationBinding(binding.ownerUserId, binding.routeInvocationId)?.episodeId,
      episodeA.episodeId,
    );
    reopened.recordInvocationBinding(binding);
    assert.throws(
      () => reopened.recordInvocationBinding({ ...binding, episodeId: episodeB.episodeId }),
      /adaptive_invocation_binding_collision/,
    );
    assert.equal(
      reopened.getEpisodeByInvocationBinding(binding.ownerUserId, binding.routeInvocationId)?.episodeId,
      episodeA.episodeId,
    );
    reopened.close();
  });

  it('deduplicates identical immutable facts and rejects an event-id collision', () => {
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    const episode = store.recordActivation(activation()).episode;
    const event = {
      eventId: 'git-snapshot-1',
      type: 'git_snapshot',
      occurredAt: '2026-07-23T01:01:00.000Z',
      source: 'git',
      sourceRef: 'git:/repo-wt@abc',
      payload: {
        projectPath: '/repo',
        worktree: '/repo-wt',
        branch: 'feat/test',
        baseSha: 'a'.repeat(40),
        finalSha: 'b'.repeat(40),
        diffRef: 'b'.repeat(40),
        scopeEnvelope: 'one source file and its test',
        mutating: true,
      },
    };

    assert.equal(store.appendEvent(episode.episodeId, event).inserted, true);
    assert.equal(store.appendEvent(episode.episodeId, event).inserted, false);
    assert.throws(
      () =>
        store.appendEvent(episode.episodeId, {
          ...event,
          payload: { ...event.payload, finalSha: 'c'.repeat(40) },
        }),
      /adaptive_event_id_collision/,
    );
    assert.equal(store.listEvents(episode.episodeId).length, 1);
    store.close();
  });

  it('uses a half-open owner-scoped window and never expires old episodes', () => {
    const store = new AdaptiveDevelopmentTrialStore(':memory:');
    store.recordActivation(activation({ startedAt: '2026-01-01T00:00:00.000Z' }));
    store.recordActivation(
      activation({
        ownerUserId: 'user-2',
        activationMessageId: 'message-2',
        startedAt: '2026-07-23T01:00:00.000Z',
      }),
    );
    store.recordActivation(
      activation({
        activationMessageId: 'message-3',
        startedAt: '2026-07-23T02:00:00.000Z',
      }),
    );

    const rows = store.listEpisodesInWindow({
      ownerUserId: 'user-1',
      windowStartMs: Date.parse('2026-07-23T01:00:00.000Z'),
      windowEndMs: Date.parse('2026-07-23T02:00:00.000Z'),
    });
    assert.equal(rows.length, 0, 'exclusive upper bound excludes message-3 and the only 01:00 row belongs to user-2');
    assert.equal(
      store.listEpisodesInWindow({ ownerUserId: 'user-1', windowStartMs: 0, windowEndMs: Date.now() }).length,
      2,
    );
    store.close();
  });

  it('persists only source episodes, invocation bindings, and events, not derived receipts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adaptive-trial-schema-'));
    const dbPath = join(dir, 'trials.sqlite');
    const store = new AdaptiveDevelopmentTrialStore(dbPath);
    store.close();

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'adaptive_development_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name);
    db.close();

    assert.deepEqual(tables, [
      'adaptive_development_episodes',
      'adaptive_development_events',
      'adaptive_development_invocation_bindings',
    ]);
  });
});
