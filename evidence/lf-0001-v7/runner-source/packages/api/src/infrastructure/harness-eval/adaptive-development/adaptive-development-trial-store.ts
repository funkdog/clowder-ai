import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  ADAPTIVE_DEVELOPMENT_MODE,
  type AdaptiveDevelopmentActivationInput,
  type AdaptiveDevelopmentEpisode,
  type AdaptiveDevelopmentEpisodeWindowSelector,
  type AdaptiveDevelopmentEvent,
  type AdaptiveDevelopmentEventInput,
} from './adaptive-development-types.js';

interface ActivationResult {
  episode: AdaptiveDevelopmentEpisode;
  inserted: boolean;
}

interface AppendEventResult {
  event: AdaptiveDevelopmentEvent;
  inserted: boolean;
}

interface InvocationBindingInput {
  routeInvocationId: string;
  episodeId: string;
  ownerUserId: string;
  threadId: string;
}

/**
 * Durable source-fact store for passively observed Free Plan episodes.
 *
 * The store owns evaluation identity only. It is not a Work ledger, execution
 * lifecycle, delivery claim, or acceptance authority, and its availability
 * must never gate the user-facing development path.
 */
export class AdaptiveDevelopmentTrialStore {
  private readonly db: InstanceType<typeof Database>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  recordActivation(input: AdaptiveDevelopmentActivationInput): ActivationResult {
    assertNonEmpty(input.ownerUserId, 'ownerUserId');
    assertNonEmpty(input.threadId, 'threadId');
    assertNonEmpty(input.activationMessageId, 'activationMessageId');
    assertNonEmpty(input.activationText, 'activationText');
    assertIsoTimestamp(input.startedAt, 'startedAt');

    const episodeId = stableEpisodeId(input.ownerUserId, input.threadId, input.activationMessageId);
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO adaptive_development_episodes
         (episodeId, mode, ownerUserId, threadId, activationMessageId, activationText,
          startedAt, actorCatId, modelId, harnessVersion, projectPath, worktree, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        episodeId,
        ADAPTIVE_DEVELOPMENT_MODE,
        input.ownerUserId,
        input.threadId,
        input.activationMessageId,
        input.activationText,
        input.startedAt,
        input.actorCatId ?? null,
        input.modelId ?? null,
        input.harnessVersion ?? null,
        input.projectPath ?? null,
        input.worktree ?? null,
        createdAt,
      ) as { changes: number };

    const episode = this.getEpisode(episodeId);
    if (!episode) {
      throw new Error(`adaptive_activation_insert_failed:${episodeId}`);
    }
    if (!sameActivationIdentity(episode, input)) {
      throw new Error(`adaptive_activation_identity_collision:${episodeId}`);
    }
    return { episode, inserted: result.changes === 1 };
  }

  getEpisode(episodeId: string): AdaptiveDevelopmentEpisode | null {
    const row = this.db.prepare('SELECT * FROM adaptive_development_episodes WHERE episodeId = ?').get(episodeId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToEpisode(row) : null;
  }

  getLatestEpisodeByThread(ownerUserId: string, threadId: string): AdaptiveDevelopmentEpisode | null {
    const row = this.db
      .prepare(
        `SELECT * FROM adaptive_development_episodes
         WHERE ownerUserId = ? AND threadId = ?
         ORDER BY startedAt DESC, episodeId DESC
         LIMIT 1`,
      )
      .get(ownerUserId, threadId) as Record<string, unknown> | undefined;
    return row ? rowToEpisode(row) : null;
  }

  getLatestOpenEpisodeByThread(ownerUserId: string, threadId: string): AdaptiveDevelopmentEpisode | null {
    return this.getLatestEpisodeMatching(
      ownerUserId,
      threadId,
      `NOT EXISTS (
        SELECT 1 FROM adaptive_development_events event
        WHERE event.episodeId = episode.episodeId AND event.eventType = 'terminal'
      )
      OR COALESCE((
        SELECT MAX(replan.id) FROM adaptive_development_events replan
        WHERE replan.episodeId = episode.episodeId AND replan.eventType = 'replan'
      ), 0) > COALESCE((
        SELECT MAX(terminal.id) FROM adaptive_development_events terminal
        WHERE terminal.episodeId = episode.episodeId AND terminal.eventType = 'terminal'
      ), 0)`,
    );
  }

  getLatestEpisodeAwaitingReview(ownerUserId: string, threadId: string): AdaptiveDevelopmentEpisode | null {
    return this.getLatestEpisodeMatching(
      ownerUserId,
      threadId,
      `COALESCE((
        SELECT MAX(request.id) FROM adaptive_development_events request
        WHERE request.episodeId = episode.episodeId AND request.eventType = 'review_request'
      ), 0) > COALESCE((
        SELECT MAX(verdict.id) FROM adaptive_development_events verdict
        WHERE verdict.episodeId = episode.episodeId AND verdict.eventType = 'review_verdict'
      ), 0)`,
    );
  }

  getLatestEpisodeAwaitingExperience(ownerUserId: string, threadId: string): AdaptiveDevelopmentEpisode | null {
    return this.getLatestEpisodeMatching(
      ownerUserId,
      threadId,
      `EXISTS (
        SELECT 1 FROM adaptive_development_events terminal
        WHERE terminal.episodeId = episode.episodeId AND terminal.eventType = 'terminal'
      )
      AND NOT EXISTS (
        SELECT 1 FROM adaptive_development_events experience
        WHERE experience.episodeId = episode.episodeId AND experience.eventType = 'experience_assessment'
      )`,
    );
  }

  recordInvocationBinding(input: InvocationBindingInput): void {
    assertNonEmpty(input.routeInvocationId, 'routeInvocationId');
    const episode = this.getEpisode(input.episodeId);
    if (!episode || episode.ownerUserId !== input.ownerUserId || episode.threadId !== input.threadId) {
      throw new Error(`adaptive_invocation_binding_episode_mismatch:${input.routeInvocationId}`);
    }
    this.db
      .prepare(
        `INSERT OR IGNORE INTO adaptive_development_invocation_bindings
         (routeInvocationId, episodeId, ownerUserId, threadId, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.routeInvocationId, input.episodeId, input.ownerUserId, input.threadId, new Date().toISOString());
    const binding = this.db
      .prepare(
        `SELECT episodeId, ownerUserId, threadId
         FROM adaptive_development_invocation_bindings
         WHERE routeInvocationId = ?`,
      )
      .get(input.routeInvocationId) as { episodeId: string; ownerUserId: string; threadId: string } | undefined;
    if (
      !binding ||
      binding.episodeId !== input.episodeId ||
      binding.ownerUserId !== input.ownerUserId ||
      binding.threadId !== input.threadId
    ) {
      throw new Error(`adaptive_invocation_binding_collision:${input.routeInvocationId}`);
    }
  }

  getEpisodeByInvocationBinding(ownerUserId: string, routeInvocationId: string): AdaptiveDevelopmentEpisode | null {
    const row = this.db
      .prepare(
        `SELECT episode.* FROM adaptive_development_invocation_bindings binding
         JOIN adaptive_development_episodes episode ON episode.episodeId = binding.episodeId
         WHERE binding.ownerUserId = ? AND binding.routeInvocationId = ?`,
      )
      .get(ownerUserId, routeInvocationId) as Record<string, unknown> | undefined;
    return row ? rowToEpisode(row) : null;
  }

  listEpisodesInWindow(selector: AdaptiveDevelopmentEpisodeWindowSelector): AdaptiveDevelopmentEpisode[] {
    assertWindow(selector.windowStartMs, selector.windowEndMs);
    assertNonEmpty(selector.ownerUserId, 'ownerUserId');
    const params: unknown[] = [
      selector.ownerUserId,
      new Date(selector.windowStartMs).toISOString(),
      new Date(selector.windowEndMs).toISOString(),
    ];
    let sql = 'SELECT * FROM adaptive_development_episodes WHERE ownerUserId = ? AND startedAt >= ? AND startedAt < ?';
    if (selector.episodeIds !== undefined) {
      const uniqueIds = [...new Set(selector.episodeIds)];
      if (uniqueIds.length === 0) return [];
      sql += ` AND episodeId IN (${uniqueIds.map(() => '?').join(', ')})`;
      params.push(...uniqueIds);
    }
    sql += ' ORDER BY startedAt ASC, episodeId ASC';
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToEpisode);
  }

  appendEvent(episodeId: string, input: AdaptiveDevelopmentEventInput): AppendEventResult {
    if (!this.getEpisode(episodeId)) {
      throw new Error(`adaptive_episode_not_found:${episodeId}`);
    }
    assertNonEmpty(input.eventId, 'eventId');
    assertNonEmpty(input.sourceRef, 'sourceRef');
    assertIsoTimestamp(input.occurredAt, 'occurredAt');
    const eventDigest = sha256(
      stableJson({
        episodeId,
        eventId: input.eventId,
        type: input.type,
        occurredAt: input.occurredAt,
        source: input.source,
        sourceRef: input.sourceRef,
        payload: input.payload,
      }),
    );
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO adaptive_development_events
         (eventId, episodeId, eventType, occurredAt, source, sourceRef, payload, eventDigest, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.eventId,
        episodeId,
        input.type,
        input.occurredAt,
        input.source,
        input.sourceRef,
        JSON.stringify(input.payload),
        eventDigest,
        createdAt,
      ) as { changes: number };

    const row = this.db.prepare('SELECT * FROM adaptive_development_events WHERE eventId = ?').get(input.eventId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new Error(`adaptive_event_insert_failed:${input.eventId}`);
    const event = rowToEvent(row);
    if (event.episodeId !== episodeId || event.eventDigest !== eventDigest) {
      throw new Error(`adaptive_event_id_collision:${input.eventId}`);
    }
    return { event, inserted: result.changes === 1 };
  }

  listEvents(episodeId: string): AdaptiveDevelopmentEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM adaptive_development_events
         WHERE episodeId = ?
         ORDER BY occurredAt ASC, id ASC`,
      )
      .all(episodeId) as Array<Record<string, unknown>>;
    return rows.map(rowToEvent);
  }

  private getLatestEpisodeMatching(
    ownerUserId: string,
    threadId: string,
    predicate: string,
  ): AdaptiveDevelopmentEpisode | null {
    const row = this.db
      .prepare(
        `SELECT episode.* FROM adaptive_development_episodes episode
         WHERE episode.ownerUserId = ? AND episode.threadId = ? AND (${predicate})
         ORDER BY episode.startedAt DESC, episode.episodeId DESC
         LIMIT 1`,
      )
      .get(ownerUserId, threadId) as Record<string, unknown> | undefined;
    return row ? rowToEpisode(row) : null;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS adaptive_development_episodes (
        episodeId TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        ownerUserId TEXT NOT NULL,
        threadId TEXT NOT NULL,
        activationMessageId TEXT NOT NULL,
        activationText TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        actorCatId TEXT,
        modelId TEXT,
        harnessVersion TEXT,
        projectPath TEXT,
        worktree TEXT,
        createdAt TEXT NOT NULL,
        UNIQUE(ownerUserId, threadId, activationMessageId)
      );

      CREATE INDEX IF NOT EXISTS idx_adaptive_development_episode_window
        ON adaptive_development_episodes(ownerUserId, startedAt);

      CREATE TABLE IF NOT EXISTS adaptive_development_invocation_bindings (
        routeInvocationId TEXT PRIMARY KEY,
        episodeId TEXT NOT NULL REFERENCES adaptive_development_episodes(episodeId),
        ownerUserId TEXT NOT NULL,
        threadId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_adaptive_development_invocation_binding_episode
        ON adaptive_development_invocation_bindings(episodeId);

      CREATE TABLE IF NOT EXISTS adaptive_development_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventId TEXT NOT NULL UNIQUE,
        episodeId TEXT NOT NULL REFERENCES adaptive_development_episodes(episodeId),
        eventType TEXT NOT NULL,
        occurredAt TEXT NOT NULL,
        source TEXT NOT NULL,
        sourceRef TEXT NOT NULL,
        payload TEXT NOT NULL,
        eventDigest TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_adaptive_development_event_episode
        ON adaptive_development_events(episodeId, occurredAt, id);
    `);
  }
}

function stableEpisodeId(ownerUserId: string, threadId: string, activationMessageId: string): string {
  return `adep-${sha256(`${ownerUserId}\u0000${threadId}\u0000${activationMessageId}`).slice(0, 24)}`;
}

function sameActivationIdentity(
  episode: AdaptiveDevelopmentEpisode,
  input: AdaptiveDevelopmentActivationInput,
): boolean {
  return (
    episode.ownerUserId === input.ownerUserId &&
    episode.threadId === input.threadId &&
    episode.activationMessageId === input.activationMessageId &&
    episode.activationText === input.activationText &&
    episode.startedAt === input.startedAt
  );
}

function rowToEpisode(row: Record<string, unknown>): AdaptiveDevelopmentEpisode {
  return {
    episodeId: row.episodeId as string,
    mode: ADAPTIVE_DEVELOPMENT_MODE,
    ownerUserId: row.ownerUserId as string,
    threadId: row.threadId as string,
    activationMessageId: row.activationMessageId as string,
    activationText: row.activationText as string,
    startedAt: row.startedAt as string,
    ...(typeof row.actorCatId === 'string' ? { actorCatId: row.actorCatId } : {}),
    ...(typeof row.modelId === 'string' ? { modelId: row.modelId } : {}),
    ...(typeof row.harnessVersion === 'string' ? { harnessVersion: row.harnessVersion } : {}),
    ...(typeof row.projectPath === 'string' ? { projectPath: row.projectPath } : {}),
    ...(typeof row.worktree === 'string' ? { worktree: row.worktree } : {}),
    createdAt: row.createdAt as string,
  };
}

function rowToEvent(row: Record<string, unknown>): AdaptiveDevelopmentEvent {
  return {
    id: row.id as number,
    eventId: row.eventId as string,
    episodeId: row.episodeId as string,
    type: row.eventType as AdaptiveDevelopmentEvent['type'],
    occurredAt: row.occurredAt as string,
    source: row.source as AdaptiveDevelopmentEvent['source'],
    sourceRef: row.sourceRef as string,
    payload: JSON.parse(row.payload as string) as Record<string, unknown>,
    eventDigest: row.eventDigest as string,
    createdAt: row.createdAt as string,
  };
}

function assertWindow(startMs: number, endMs: number): void {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('adaptive_invalid_window: expected finite windowEndMs > windowStartMs');
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`adaptive_invalid_${field}: expected non-empty string`);
  }
}

function assertIsoTimestamp(value: string, field: string): void {
  assertNonEmpty(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`adaptive_invalid_${field}: expected ISO timestamp`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
