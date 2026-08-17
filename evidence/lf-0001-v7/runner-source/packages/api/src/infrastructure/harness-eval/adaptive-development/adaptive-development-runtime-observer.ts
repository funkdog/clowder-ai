import { createHash } from 'node:crypto';
import type { CatId } from '@cat-cafe/shared';
import type { StoredMessage } from '../../../domains/cats/services/stores/ports/MessageStore.js';
import type { Thread } from '../../../domains/cats/services/stores/ports/ThreadStore.js';
import { SYSTEM_USER_IDS } from '../../../domains/cats/services/stores/visibility.js';
import type { AgentMessage } from '../../../domains/cats/services/types.js';
import { AdaptiveDevelopmentCollector } from './adaptive-development-collector.js';
import {
  type AdaptiveDevelopmentGitFactResolver,
  type AdaptiveDevelopmentGitSnapshot,
} from './adaptive-development-git-facts.js';
import { detectAdaptiveDevelopmentOptIn } from './adaptive-development-opt-in.js';
import { AdaptiveDevelopmentTrialStore } from './adaptive-development-trial-store.js';
import type { AdaptiveDevelopmentEvent } from './adaptive-development-types.js';

type RouteMode = 'open' | 'review' | 'experience';

interface RouteObservation {
  episodeId?: string;
  mode?: RouteMode;
  threadId?: string;
  allowedReviewers: Set<string>;
  reviewRequest?: AdaptiveDevelopmentEvent;
  textByCat: Map<string, string>;
  friction: Array<{ kind: 'route_failure' | 'invocation_timeout' | 'control_plane_failure'; detail: string }>;
}

interface ParsedOutcomeCheckpoint extends Record<string, unknown> {
  original_outcome: string;
  final_scope: string;
  achieved: string;
  not_achieved: string;
  deferred: string;
  changed_surface: string;
  verification_evidence: string;
  review_evidence: string;
  remaining_risks: string;
  next_owner_or_action: string;
  reviewIntent: 'local_result' | 'formal_review' | 'delivery';
  reviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale';
  reviewUnit: string;
  operatorExperience: 'pending';
  omittedOrReplacedSoftSteps: string[];
}

interface ParsedReviewUnit {
  reviewUnit: string;
  baseSha: string;
  finalSha: string;
  diffRef: string;
}

export interface AdaptiveDevelopmentCommandReceipt {
  sourceEventId: string;
  ownerUserId: string;
  invocationId: string;
  routeInvocationId?: string;
  toolCallId: string;
  commandKind?: 'verification' | 'other';
  commandDigest: string;
  exitCode: number;
  outputDigest: string;
  completedAt: string;
}

export interface AdaptiveDevelopmentCommandReceiptReader {
  get(ownerUserId: string, sourceEventId: string): Promise<AdaptiveDevelopmentCommandReceipt | null>;
}

export interface AdaptiveDevelopmentRuntimeObserverDeps {
  store: AdaptiveDevelopmentTrialStore;
  gitResolver: AdaptiveDevelopmentGitFactResolver;
  harnessVersion?: string;
  getModelId(catId: string): string | undefined;
  collector?: AdaptiveDevelopmentCollector;
  commandReceiptReader?: AdaptiveDevelopmentCommandReceiptReader;
}

export interface AdaptiveDevelopmentObserverPort {
  recordUserOptIn(input: {
    ownerUserId?: string;
    invocationId?: string;
    message: StoredMessage;
    thread: Thread | null;
    targetCats: readonly CatId[];
  }): void;
  observeAgentMessage(input: {
    ownerUserId: string;
    threadId: string;
    userMessageId: string;
    message: AgentMessage;
  }): void;
  observeRouteFailure(input: { ownerUserId: string; threadId: string; userMessageId: string; error: unknown }): void;
  finishInvocation(input: { ownerUserId: string; threadId: string; userMessageId: string }): Promise<void>;
}

/**
 * Fail-isolated passive observation engine for the Free Plan pilot.
 *
 * Production mounts this engine behind an off-thread worker port. Its source
 * facts can never authorize effects, block an invocation, complete user work,
 * or turn an engineering result into operator acceptance.
 */
export class AdaptiveDevelopmentRuntimeObserver implements AdaptiveDevelopmentObserverPort {
  private readonly collector: AdaptiveDevelopmentCollector;
  private readonly routes = new Map<string, RouteObservation>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly deps: AdaptiveDevelopmentRuntimeObserverDeps) {
    this.collector = deps.collector ?? new AdaptiveDevelopmentCollector(deps.store);
  }

  recordUserOptIn(input: {
    ownerUserId?: string;
    invocationId?: string;
    message: StoredMessage;
    thread: Thread | null;
    targetCats: readonly CatId[];
  }): void {
    const { message, thread, targetCats } = input;
    const ownerUserId = input.ownerUserId ?? message.userId;
    const route = this.getRoute(message.id);
    const isOperatorMessage = message.catId === null && !message.source && !SYSTEM_USER_IDS.has(message.userId);

    if (isOperatorMessage && this.bindOperatorSpecialRoute(route, message, thread, targetCats, ownerUserId)) {
      this.recordInvocationBinding(route, input.invocationId, ownerUserId, message.threadId);
      return;
    }
    if (message.source) {
      this.bindManagedCommandRoute(route, message, ownerUserId);
      return;
    }
    if (!isOperatorMessage) {
      this.bindAuthorReviewRoute(route, message, targetCats, ownerUserId);
      return;
    }
    this.bindOrdinaryOperatorRoute(route, message, targetCats, ownerUserId);
    this.recordInvocationBinding(route, input.invocationId, ownerUserId, message.threadId);
  }

  private bindOperatorSpecialRoute(
    route: RouteObservation,
    message: StoredMessage,
    thread: Thread | null,
    targetCats: readonly CatId[],
    ownerUserId: string,
  ): boolean {
    if (detectAdaptiveDevelopmentOptIn(message.content).activated) {
      this.recordActivation(route, message, thread, targetCats);
      return true;
    }
    const experience = parseOperatorExperience(message.content);
    if (!experience) return false;
    const episode = this.deps.store.getLatestEpisodeAwaitingExperience(ownerUserId, message.threadId);
    if (!episode) return true;
    bindRoute(route, episode.episodeId, 'experience');
    this.enqueue(message.id, () => this.recordExperienceAssessment(episode.episodeId, message, experience));
    return true;
  }

  private bindManagedCommandRoute(route: RouteObservation, message: StoredMessage, ownerUserId: string): void {
    const sourceEventId = managedCommandSourceEventId(message);
    if (!sourceEventId) return;
    route.mode = 'open';
    route.threadId = message.threadId;
    if (!this.deps.commandReceiptReader) return;
    this.enqueue(message.id, async () => {
      const receipt = await this.deps.commandReceiptReader?.get(ownerUserId, sourceEventId);
      if (receipt) await this.recordManagedCommandReceipt(message.id, ownerUserId, receipt, message.timestamp);
    });
  }

  private bindAuthorReviewRoute(
    route: RouteObservation,
    message: StoredMessage,
    targetCats: readonly CatId[],
    ownerUserId: string,
  ): void {
    if (!message.catId) return;
    const episode = this.deps.store.getLatestEpisodeAwaitingReview(ownerUserId, message.threadId);
    if (!episode?.actorCatId || message.catId !== episode.actorCatId) return;
    const allowedReviewers = targetCats.map(String).filter((catId) => catId !== episode.actorCatId);
    if (allowedReviewers.length === 0) return;
    bindRoute(route, episode.episodeId, 'review');
    route.allowedReviewers = new Set(allowedReviewers);
    route.reviewRequest = latestReviewRequest(this.deps.store, episode.episodeId);
  }

  private bindOrdinaryOperatorRoute(
    route: RouteObservation,
    message: StoredMessage,
    targetCats: readonly CatId[],
    ownerUserId: string,
  ): void {
    const openEpisode = this.deps.store.getLatestOpenEpisodeByThread(ownerUserId, message.threadId);
    if (openEpisode) {
      bindRoute(route, openEpisode.episodeId, 'open');
      this.recordRecoveryNudge(openEpisode.episodeId, message);
      return;
    }
    const reviewEpisode = this.deps.store.getLatestEpisodeAwaitingReview(ownerUserId, message.threadId);
    if (!reviewEpisode?.actorCatId) return;
    const allowedReviewers = targetCats.map(String).filter((catId) => catId !== reviewEpisode.actorCatId);
    if (allowedReviewers.length === 0) return;
    bindRoute(route, reviewEpisode.episodeId, 'review');
    route.allowedReviewers = new Set(allowedReviewers);
    route.reviewRequest = latestReviewRequest(this.deps.store, reviewEpisode.episodeId);
  }

  private recordRecoveryNudge(episodeId: string, message: StoredMessage): void {
    if (!isRecoveryNudge(message.content) || !hasUnresolvedFriction(this.deps.store, episodeId)) return;
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'harness_friction', `${message.id}:recovery-nudge`),
      type: 'harness_friction',
      occurredAt: new Date(message.timestamp).toISOString(),
      source: 'session',
      sourceRef: `message:${message.id}`,
      payload: { kind: 'recovery_nudge' },
    });
  }

  observeAgentMessage(input: {
    ownerUserId: string;
    threadId: string;
    userMessageId: string;
    message: AgentMessage;
  }): void {
    const route = this.routes.get(input.userMessageId);
    if (!route?.episodeId) return;
    const { message } = input;
    const catId = message.catId as string;
    if (message.type === 'text') this.observeText(route, catId, message);
    if (message.type === 'error' && route.mode === 'open') this.observeError(route, message);
    // Provider/model tool prose is deliberately ignored. Verification enters
    // only through recordManagedCommandReceipt() and an immutable runtime fact.
  }

  observeRouteFailure(input: { ownerUserId: string; threadId: string; userMessageId: string; error: unknown }): void {
    const route = this.routes.get(input.userMessageId);
    if (!route?.episodeId || route.mode !== 'open') return;
    recordRouteFriction(route, String(input.error));
  }

  finishInvocation(input: { ownerUserId: string; threadId: string; userMessageId: string }): Promise<void> {
    return this.enqueue(input.userMessageId, () => this.finishRoute(input));
  }

  async recordManagedCommandReceipt(
    userMessageId: string,
    ownerUserId: string,
    receipt: AdaptiveDevelopmentCommandReceipt,
    observedAtMs = Date.now(),
  ): Promise<void> {
    const route = this.routes.get(userMessageId);
    if (
      !route ||
      route.mode !== 'open' ||
      !route.threadId ||
      receipt.ownerUserId !== ownerUserId ||
      !receipt.routeInvocationId ||
      receipt.commandKind !== 'verification' ||
      receipt.exitCode !== 0
    ) {
      return;
    }
    const episode = this.deps.store.getEpisodeByInvocationBinding(ownerUserId, receipt.routeInvocationId);
    if (!episode?.worktree || episode.threadId !== route.threadId) return;
    bindRoute(route, episode.episodeId, 'open');
    const baseline = this.readBaselineSnapshot(episode.episodeId);
    const snapshot = await this.deps.gitResolver.resolve(episode.worktree, baseline ?? undefined);
    if (!snapshot) return;
    this.appendGitSnapshot(episode.episodeId, `verification:${receipt.sourceEventId}`, snapshot);
    this.ensureMeaningfulDiff(episode.episodeId, snapshot, episode.startedAt, observedAtMs);
    this.deps.store.appendEvent(episode.episodeId, {
      eventId: stableEventId(episode.episodeId, 'verification', receipt.sourceEventId),
      type: 'verification',
      occurredAt: receipt.completedAt,
      source: 'verification',
      sourceRef: receipt.sourceEventId,
      payload: {
        sourceEventId: receipt.sourceEventId,
        invocationId: receipt.invocationId,
        routeInvocationId: receipt.routeInvocationId,
        toolCallId: receipt.toolCallId,
        commandDigest: receipt.commandDigest,
        outputDigest: receipt.outputDigest,
        exitCode: receipt.exitCode,
        finalSha: snapshot.finalSha,
        diffRef: snapshot.diffRef,
      },
    });
  }

  private recordActivation(
    route: RouteObservation,
    message: StoredMessage,
    thread: Thread | null,
    targetCats: readonly CatId[],
  ): void {
    const actorCatId = targetCats.length === 1 ? (targetCats[0] as string) : undefined;
    const modelId = actorCatId ? this.deps.getModelId(actorCatId) : undefined;
    const worktree = resolveObservedWorktree(thread);
    const activation = this.deps.store.recordActivation({
      ownerUserId: message.userId,
      threadId: message.threadId,
      activationMessageId: message.id,
      activationText: message.content,
      startedAt: new Date(message.timestamp).toISOString(),
      ...(actorCatId ? { actorCatId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(this.deps.harnessVersion ? { harnessVersion: this.deps.harnessVersion } : {}),
      ...(thread?.projectPath && thread.projectPath !== 'default' ? { projectPath: thread.projectPath } : {}),
      ...(worktree ? { worktree } : {}),
    });
    bindRoute(route, activation.episode.episodeId, 'open');
    if (!activation.inserted || !worktree) return;
    this.enqueue(message.id, async () => {
      const snapshot = await this.deps.gitResolver.resolve(worktree);
      if (snapshot) this.appendGitSnapshot(activation.episode.episodeId, 'activation', snapshot);
    });
  }

  private async recordExperienceAssessment(
    episodeId: string,
    message: StoredMessage,
    verdict: 'accepted' | 'rejected' | 'deferred',
  ): Promise<void> {
    const episode = this.deps.store.getEpisode(episodeId);
    if (!episode?.worktree) return;
    const baseline = this.readBaselineSnapshot(episodeId);
    const snapshot = await this.deps.gitResolver.resolve(episode.worktree, baseline ?? undefined);
    if (snapshot) this.appendGitSnapshot(episodeId, `experience:${message.id}`, snapshot);
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'experience_assessment', message.id),
      type: 'experience_assessment',
      occurredAt: new Date(message.timestamp).toISOString(),
      source: 'session',
      sourceRef: `message:${message.id}`,
      payload: { verdict },
    });
    this.collector.collectEpisode(episodeId);
  }

  private observeText(route: RouteObservation, catId: string, message: AgentMessage): void {
    if (!message.content) return;
    const previous = route.textByCat.get(catId) ?? '';
    route.textByCat.set(catId, message.textMode === 'replace' ? message.content : previous + message.content);
  }

  private observeError(route: RouteObservation, message: AgentMessage): void {
    const detail = message.error ?? message.content ?? 'agent route error';
    recordRouteFriction(route, detail);
  }

  private async finishRoute(input: { ownerUserId: string; threadId: string; userMessageId: string }): Promise<void> {
    const route = this.routes.get(input.userMessageId);
    if (!route?.episodeId) return;
    const episode = this.deps.store.getEpisode(route.episodeId);
    if (!episode || episode.ownerUserId !== input.ownerUserId || episode.threadId !== input.threadId) return;

    if (route.mode === 'open') await this.finishOpenRoute(route, episode.actorCatId, input.userMessageId);
    if (route.mode === 'review' && route.reviewRequest) {
      await this.finishReviewRoute(route, episode.episodeId, route.reviewRequest, input.userMessageId);
    }
    this.collector.collectEpisode(episode.episodeId);
    this.routes.delete(input.userMessageId);
  }

  private async finishOpenRoute(route: RouteObservation, actorCatId: string | undefined, userMessageId: string) {
    this.recordFriction(route, userMessageId);
    if (!route.episodeId || !actorCatId) return;
    for (const [catId, text] of route.textByCat) {
      if (catId === actorCatId) await this.recordAuthorCheckpoint(route.episodeId, catId, text, userMessageId);
    }
  }

  private async finishReviewRoute(
    route: RouteObservation,
    episodeId: string,
    reviewRequest: AdaptiveDevelopmentEvent,
    userMessageId: string,
  ) {
    for (const [catId, text] of route.textByCat) {
      if (route.allowedReviewers.has(catId)) {
        await this.recordReviewVerdict(episodeId, reviewRequest, catId, text, userMessageId);
      }
    }
  }

  private recordFriction(route: RouteObservation, userMessageId: string): void {
    if (!route.episodeId) return;
    route.friction.forEach((friction, index) => {
      this.deps.store.appendEvent(route.episodeId as string, {
        eventId: stableEventId(
          route.episodeId as string,
          'harness_friction',
          `${userMessageId}:${friction.kind}:${index}`,
        ),
        type: 'harness_friction',
        occurredAt: new Date().toISOString(),
        source: 'runtime',
        sourceRef: `route:${userMessageId}`,
        payload: { kind: friction.kind, detail: friction.detail.slice(0, 500) },
      });
    });
  }

  private async recordAuthorCheckpoint(
    episodeId: string,
    authorId: string,
    text: string,
    userMessageId: string,
  ): Promise<void> {
    const episode = this.deps.store.getEpisode(episodeId);
    const checkpoint = parseOutcomeCheckpoint(text);
    if (!episode?.worktree || !checkpoint) return;
    const baseline = this.readBaselineSnapshot(episodeId);
    const snapshot = await this.deps.gitResolver.resolve(episode.worktree, baseline ?? undefined);
    if (snapshot) {
      this.appendGitSnapshot(episodeId, `checkpoint:${userMessageId}:${authorId}`, snapshot);
      this.ensureMeaningfulDiff(episodeId, snapshot, episode.startedAt);
    }
    const occurredAt = new Date().toISOString();
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'handoff', `${userMessageId}:${authorId}`),
      type: 'handoff',
      occurredAt,
      source: 'session',
      sourceRef: `message:${userMessageId}:${authorId}`,
      payload: checkpoint,
    });

    const reviewUnit =
      checkpoint.reviewIntent === 'formal_review' || checkpoint.reviewIntent === 'delivery'
        ? parseReviewUnit(checkpoint.reviewUnit)
        : null;
    if (
      reviewUnit &&
      snapshot &&
      reviewUnit.baseSha === (baseline?.baseSha ?? snapshot.baseSha) &&
      reviewUnit.finalSha === snapshot.finalSha &&
      reviewUnit.diffRef === snapshot.diffRef
    ) {
      this.deps.store.appendEvent(episodeId, {
        eventId: stableEventId(episodeId, 'review_request', `${userMessageId}:${authorId}`),
        type: 'review_request',
        occurredAt,
        source: 'session',
        sourceRef: `message:${userMessageId}:${authorId}`,
        payload: { ...reviewUnit },
      });
    }

    const achieved = !isNone(checkpoint.achieved);
    const notAchieved = !isNone(checkpoint.not_achieved);
    const state = achieved && !notAchieved ? 'completed' : 'failed';
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'terminal', `${userMessageId}:${authorId}`),
      type: 'terminal',
      occurredAt,
      source: 'runtime',
      sourceRef: `route:${userMessageId}`,
      payload: {
        state,
        ...(state === 'failed' ? { reason: 'outcome_checkpoint_not_achieved' } : {}),
      },
    });
  }

  private async recordReviewVerdict(
    episodeId: string,
    reviewRequest: AdaptiveDevelopmentEvent,
    reviewerId: string,
    text: string,
    userMessageId: string,
  ): Promise<void> {
    const episode = this.deps.store.getEpisode(episodeId);
    if (!episode || !episode.actorCatId || reviewerId === episode.actorCatId || !episode.worktree) return;
    const parsed = parseFormalReview(text);
    const requestedFinalSha = stringField(reviewRequest.payload, 'finalSha');
    const requestedDiffRef = stringField(reviewRequest.payload, 'diffRef');
    if (
      !parsed?.reviewedFinalSha ||
      !parsed.reviewedDiffRef ||
      !requestedFinalSha ||
      !requestedDiffRef ||
      parsed.reviewedFinalSha !== requestedFinalSha ||
      parsed.reviewedDiffRef !== requestedDiffRef
    ) {
      return;
    }
    const baseline = this.readBaselineSnapshot(episodeId);
    const snapshot = await this.deps.gitResolver.resolve(episode.worktree, baseline ?? undefined);
    if (!snapshot || snapshot.finalSha !== requestedFinalSha || snapshot.diffRef !== requestedDiffRef) {
      return;
    }
    this.appendGitSnapshot(episodeId, `review:${userMessageId}:${reviewerId}`, snapshot);
    const occurredAt = new Date().toISOString();
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'review_verdict', `${userMessageId}:${reviewerId}`),
      type: 'review_verdict',
      occurredAt,
      source: 'review-observer',
      sourceRef: `message:${userMessageId}:${reviewerId}`,
      payload: {
        reviewerId,
        authorId: episode.actorCatId,
        verdict: parsed.verdict,
        reviewedFinalSha: parsed.reviewedFinalSha,
        reviewedDiffRef: parsed.reviewedDiffRef,
        reviewRequestEventId: reviewRequest.eventId,
        reviewRequestSourceRef: reviewRequest.sourceRef,
        reviewUnit: stringField(reviewRequest.payload, 'reviewUnit'),
        findingCounts: parsed.findingCounts,
      },
    });
    if (parsed.verdict === 'changes_requested') {
      this.deps.store.appendEvent(episodeId, {
        eventId: stableEventId(episodeId, 'replan', `${userMessageId}:${reviewerId}`),
        type: 'replan',
        occurredAt,
        source: 'review-observer',
        sourceRef: `message:${userMessageId}:${reviewerId}`,
        payload: { reason: 'formal_review_changes_requested', reviewRequestEventId: reviewRequest.eventId },
      });
    }
  }

  private appendGitSnapshot(episodeId: string, sourceKey: string, snapshot: AdaptiveDevelopmentGitSnapshot): void {
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'git_snapshot', sourceKey),
      type: 'git_snapshot',
      occurredAt: new Date().toISOString(),
      source: 'git',
      sourceRef: `git:${snapshot.worktree}@${snapshot.finalSha}:${snapshot.diffRef}`,
      payload: snapshot as unknown as Record<string, unknown>,
    });
  }

  private ensureMeaningfulDiff(
    episodeId: string,
    snapshot: AdaptiveDevelopmentGitSnapshot,
    startedAt: string,
    observedAtMs = Date.now(),
  ): void {
    if (!snapshot.mutating) return;
    if (this.deps.store.listEvents(episodeId).some((event) => event.type === 'meaningful_diff')) return;
    this.deps.store.appendEvent(episodeId, {
      eventId: stableEventId(episodeId, 'meaningful_diff', snapshot.diffRef),
      type: 'meaningful_diff',
      occurredAt: new Date(Math.max(Date.parse(startedAt), observedAtMs)).toISOString(),
      source: 'git',
      sourceRef: `git:${snapshot.diffRef}`,
      payload: { diffRef: snapshot.diffRef },
    });
  }

  private readBaselineSnapshot(episodeId: string): AdaptiveDevelopmentGitSnapshot | null {
    const event = this.deps.store
      .listEvents(episodeId)
      .find((candidate) => candidate.type === 'git_snapshot' && candidate.source === 'git');
    return event ? (event.payload as unknown as AdaptiveDevelopmentGitSnapshot) : null;
  }

  private getRoute(userMessageId: string): RouteObservation {
    const existing = this.routes.get(userMessageId);
    if (existing) return existing;
    const created: RouteObservation = {
      allowedReviewers: new Set(),
      textByCat: new Map(),
      friction: [],
    };
    this.routes.set(userMessageId, created);
    return created;
  }

  private recordInvocationBinding(
    route: RouteObservation,
    routeInvocationId: string | undefined,
    ownerUserId: string,
    threadId: string,
  ): void {
    if (!routeInvocationId || !route.episodeId || route.mode !== 'open') return;
    this.deps.store.recordInvocationBinding({
      routeInvocationId,
      episodeId: route.episodeId,
      ownerUserId,
      threadId,
    });
  }

  private enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.pending.get(key) === next) this.pending.delete(key);
      });
    this.pending.set(key, next);
    return next;
  }
}

function bindRoute(route: RouteObservation, episodeId: string, mode: RouteMode): void {
  if (route.episodeId && route.episodeId !== episodeId) return;
  route.episodeId = episodeId;
  route.mode = mode;
}

function latestReviewRequest(
  store: AdaptiveDevelopmentTrialStore,
  episodeId: string,
): AdaptiveDevelopmentEvent | undefined {
  return store
    .listEvents(episodeId)
    .filter((event) => event.type === 'review_request' && event.source === 'session')
    .at(-1);
}

function resolveObservedWorktree(thread: Thread | null): string | undefined {
  if (!thread) return undefined;
  const worktrees = [...new Set(thread.threadMetadata?.worktrees ?? [])];
  if (worktrees.length === 1) return worktrees[0];
  if (worktrees.length > 1) return undefined;
  return thread.projectPath && thread.projectPath !== 'default' ? thread.projectPath : undefined;
}

function recordRouteFriction(route: RouteObservation, detail: string): void {
  route.friction.push({ kind: 'route_failure', detail });
  if (/timeout|timed out|超时/i.test(detail)) {
    route.friction.push({ kind: 'invocation_timeout', detail });
  }
  if (/control[- ]plane|admission|routing guard|route guard/i.test(detail)) {
    route.friction.push({ kind: 'control_plane_failure', detail });
  }
}

function managedCommandSourceEventId(message: StoredMessage): string | null {
  if (message.source?.connector !== 'hold-ball') return null;
  const meta = message.source.meta;
  if (!meta || meta.wakeWhen !== true || typeof meta.taskId !== 'string' || meta.taskId.length === 0) return null;
  return `managed-command:${meta.taskId}`;
}

function parseOutcomeCheckpoint(text: string): ParsedOutcomeCheckpoint | null {
  if (!/\bOutcome Checkpoint\b/i.test(text)) return null;
  const requiredFields = [
    'original_outcome',
    'final_scope',
    'achieved',
    'not_achieved',
    'deferred',
    'changed_surface',
    'verification_evidence',
    'review_evidence',
    'remaining_risks',
    'next_owner_or_action',
  ] as const;
  const fields = Object.fromEntries(requiredFields.map((field) => [field, lineValue(text, field)])) as Record<
    (typeof requiredFields)[number],
    string | null
  >;
  if (requiredFields.some((field) => !fields[field])) return null;
  if (lineValue(text, 'operator_experience') !== 'pending') return null;
  const reviewIntent = text.match(/^\s*review_intent:\s*(local_result|formal_review|delivery)\s*$/im)?.[1] as
    | ParsedOutcomeCheckpoint['reviewIntent']
    | undefined;
  const reviewState = text.match(
    /^\s*review_state:\s*(pending|in_review|changes_requested|reviewed|stale)\s*$/im,
  )?.[1] as ParsedOutcomeCheckpoint['reviewState'] | undefined;
  const reviewUnit = text.match(/^\s*review_unit:\s*(.+?)\s*$/im)?.[1];
  if (!reviewIntent || !reviewState || !reviewUnit) return null;
  return {
    ...(fields as Record<(typeof requiredFields)[number], string>),
    reviewIntent,
    reviewState,
    reviewUnit,
    operatorExperience: 'pending',
    omittedOrReplacedSoftSteps: [],
  };
}

function parseReviewUnit(reviewUnit: string): ParsedReviewUnit | null {
  const baseSha = reviewUnit.match(/(?:^|;)\s*base\s*=\s*([a-f0-9]{40})\b/i)?.[1]?.toLowerCase();
  const finalSha = reviewUnit.match(/(?:^|;)\s*final\s*=\s*([a-f0-9]{40})\b/i)?.[1]?.toLowerCase();
  const diffRef = reviewUnit.match(/(?:^|;)\s*diff\s*=\s*(commit:[a-f0-9]{40})\b/i)?.[1]?.toLowerCase();
  if (!baseSha || !finalSha || !diffRef) return null;
  return { reviewUnit, baseSha, finalSha, diffRef };
}

function parseFormalReview(text: string): {
  verdict: 'approved' | 'changes_requested';
  reviewedFinalSha?: string;
  reviewedDiffRef?: string;
  findingCounts: { p1: number; p2: number; p3: number };
} | null {
  const verdict = /\bREQUEST\s+CHANGES\b/i.test(text)
    ? 'changes_requested'
    : /\bAPPROVE(?:D)?\b/i.test(text)
      ? 'approved'
      : null;
  if (!verdict) return null;
  const reviewedFinalSha = text
    .match(/(?:reviewed[_ ]?final[_ ]?sha|final[_ ]?sha|final|candidate|head)\s*[:=]\s*`?([a-f0-9]{40})`?/i)?.[1]
    ?.toLowerCase();
  const reviewedDiffRef = text
    .match(/(?:reviewed[_ ]?diff[_ ]?ref|diff[_ ]?ref|diff)\s*[:=]\s*`?(commit:[a-f0-9]{40})`?/i)?.[1]
    ?.toLowerCase();
  const p1 = parseFindingCount(text, 'P1');
  const p2 = parseFindingCount(text, 'P2');
  const p3 = parseFindingCount(text, 'P3');
  if (p1 === null || p2 === null || p3 === null) return null;
  return {
    verdict,
    ...(reviewedFinalSha ? { reviewedFinalSha } : {}),
    ...(reviewedDiffRef ? { reviewedDiffRef } : {}),
    findingCounts: { p1, p2, p3 },
  };
}

function lineValue(text: string, field: string): string | null {
  return text.match(new RegExp(`^\\s*${field}:\\s*(\\S.*?)\\s*$`, 'im'))?.[1]?.trim() ?? null;
}

function parseFindingCount(text: string, severity: 'P1' | 'P2' | 'P3'): number | null {
  const after = text.match(new RegExp(`(?:^|[ \\t])${severity}[ \\t]*[:=][ \\t]*(\\d+)\\b`, 'im'))?.[1];
  if (after !== undefined) return Number(after);
  const before = text.match(new RegExp(`(?:^|[ \\t])(\\d+)[ \\t]+${severity}\\b`, 'im'))?.[1];
  return before !== undefined ? Number(before) : null;
}

function parseOperatorExperience(text: string): 'accepted' | 'rejected' | 'deferred' | null {
  const structured = text.match(
    /(?:operator[_ ]experience|产品体验(?:验收)?|需求体验(?:验收)?|体验验收)\s*[:：=]\s*(accepted|rejected|deferred|通过|不通过|拒绝|延期)/i,
  )?.[1];
  if (structured) {
    if (/^(accepted|通过)$/i.test(structured)) return 'accepted';
    if (/^(rejected|不通过|拒绝)$/i.test(structured)) return 'rejected';
    if (/^(deferred|延期)$/i.test(structured)) return 'deferred';
  }
  if (/(?:我|本轮)(?:明确)?(?:接受|验收通过)(?:本轮|这个)?(?:结果|需求|体验)/.test(text)) return 'accepted';
  if (/(?:我|本轮)(?:明确)?(?:拒绝|验收不通过)(?:本轮|这个)?(?:结果|需求|体验)/.test(text)) return 'rejected';
  if (/(?:我|本轮)(?:明确)?(?:延期验收|暂缓验收)(?:本轮|这个)?(?:结果|需求|体验)?/.test(text)) return 'deferred';
  return null;
}

function isNone(value: string): boolean {
  return /^(?:none|无|没有|不适用|n\/a)$/i.test(value.trim());
}

function isRecoveryNudge(text: string): boolean {
  return /^(?:请)?(?:继续|重试|再试一次|接着推进|恢复推进|汇报一下)(?:[。！!，, ]|$)/i.test(text.trim());
}

function hasUnresolvedFriction(store: AdaptiveDevelopmentTrialStore, episodeId: string): boolean {
  const events = store.listEvents(episodeId);
  let lastFrictionIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === 'harness_friction' && event.payload.kind !== 'recovery_nudge') {
      lastFrictionIndex = index;
      break;
    }
  }
  if (lastFrictionIndex < 0) return false;
  return !events
    .slice(lastFrictionIndex + 1)
    .some((event) => event.type === 'harness_friction' && event.payload.kind === 'recovery_nudge');
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function stableEventId(episodeId: string, type: string, key: string): string {
  return `adevt-${createHash('sha256').update(`${episodeId}\u0000${type}\u0000${key}`).digest('hex').slice(0, 28)}`;
}
