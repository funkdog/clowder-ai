import type { AdaptiveDevelopmentTrialStore } from './adaptive-development-trial-store.js';
import {
  ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION,
  type AdaptiveDevelopmentEpisode,
  type AdaptiveDevelopmentEvent,
  type AdaptiveDevelopmentTrialReceipt,
} from './adaptive-development-types.js';

interface GitSnapshot {
  projectPath: string;
  worktree: string;
  branch: string;
  baseSha: string;
  finalSha: string;
  diffRef: string;
  scopeEnvelope: string;
  mutating: boolean;
  evidenceComplete: boolean;
}

interface ExactApprovedReview {
  reviewedFinalSha: string;
  reviewedDiffRef: string;
  findingCounts: { p1: number; p2: number; p3: number };
}

interface CollectionContext {
  episode: AdaptiveDevelopmentEpisode;
  events: AdaptiveDevelopmentEvent[];
  terminal: AdaptiveDevelopmentEvent;
  git: GitSnapshot;
  verificationEvents: AdaptiveDevelopmentEvent[];
  reviewRequestEvents: AdaptiveDevelopmentEvent[];
  reviewEvents: AdaptiveDevelopmentEvent[];
  exactVerification: boolean;
  exactReview?: ExactApprovedReview;
  handoff?: AdaptiveDevelopmentEvent;
}

/**
 * Fail-honest read model over passive Free Plan episodes.
 *
 * The collector is evaluation-only: it cannot authorize an effect, block an
 * invocation, complete user work, or turn an agent claim into acceptance.
 */
export class AdaptiveDevelopmentCollector {
  constructor(private readonly store: AdaptiveDevelopmentTrialStore) {}

  collectEpisode(episodeId: string): AdaptiveDevelopmentTrialReceipt | null {
    const episode = this.store.getEpisode(episodeId);
    if (!episode) throw new Error(`adaptive_episode_not_found:${episodeId}`);
    const events = this.store.listEvents(episodeId);
    const context = resolveCollectionContext(episode, events);
    return context ? buildReceipt(context) : null;
  }

  collectWindow(input: {
    ownerUserId: string;
    windowStartMs: number;
    windowEndMs: number;
    episodeIds?: string[];
  }): AdaptiveDevelopmentTrialReceipt[] {
    return this.store
      .listEpisodesInWindow(input)
      .map((episode) => this.collectEpisode(episode.episodeId))
      .filter((receipt): receipt is AdaptiveDevelopmentTrialReceipt => receipt !== null);
  }
}

function resolveCollectionContext(
  episode: AdaptiveDevelopmentEpisode,
  events: AdaptiveDevelopmentEvent[],
): CollectionContext | null {
  const terminal = lastEvent(events, 'terminal', 'runtime');
  const gitEvents = events.filter((event) => event.type === 'git_snapshot' && event.source === 'git');
  const latestGitEvent = gitEvents.at(-1);
  const latestGit = latestGitEvent ? parseGitSnapshot(latestGitEvent.payload) : null;
  if (!terminal || !latestGit) return null;

  const baselineEvent = gitEvents.at(0);
  const baseline = baselineEvent ? parseGitSnapshot(baselineEvent.payload) : null;
  const git = baseline ? { ...latestGit, baseSha: baseline.baseSha } : latestGit;
  const verificationEvents = events.filter((event) => event.type === 'verification' && event.source === 'verification');
  const reviewRequestEvents = events.filter((event) => event.type === 'review_request' && event.source === 'session');
  const reviewEvents = events.filter((event) => event.type === 'review_verdict' && event.source === 'review-observer');
  return {
    episode,
    events,
    terminal,
    git,
    verificationEvents,
    reviewRequestEvents,
    reviewEvents,
    exactVerification: verificationEvents.some((event) => isExactVerification(event, git)),
    exactReview: findExactApprovedReview(reviewEvents, reviewRequestEvents, episode, git),
    handoff: lastEvent(events, 'handoff', 'session'),
  };
}

function buildReceipt(context: CollectionContext): AdaptiveDevelopmentTrialReceipt {
  const { episode, events, terminal, git, verificationEvents, reviewEvents, exactReview, handoff } = context;
  const experience = resolveExperience(events);
  const outcome = resolveOutcome(events, terminal, experience);
  const unresolvedActionGate = hasUnresolvedActionGate(events);
  const missingFields = deriveMissingFields(context, experience, outcome, unresolvedActionGate);
  const candidateCase = missingFields.length === 0;
  const receipt: AdaptiveDevelopmentTrialReceipt = {
    episodeId: episode.episodeId,
    mode: episode.mode,
    collectorContractVersion: ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION,
    outcome,
    startedAt: episode.startedAt,
    ...(episode.modelId ? { modelId: episode.modelId } : {}),
    ...(episode.harnessVersion ? { harnessVersion: episode.harnessVersion } : {}),
    projectPath: git.projectPath,
    worktree: git.worktree,
    branch: git.branch,
    baseSha: git.baseSha,
    finalSha: git.finalSha,
    diffRef: git.diffRef,
    scopeEnvelope: git.scopeEnvelope,
    ...timingFields(events, episode),
    omittedOrReplacedSoftSteps: stringList(handoff?.payload.omittedOrReplacedSoftSteps),
    replans: events
      .filter((event) => event.type === 'replan')
      .map((event) => stringField(event.payload, 'reason'))
      .filter((value): value is string => value !== null),
    verificationRefs: verificationEvents.map((event) => event.sourceRef),
    reviewRefs: reviewEvents.map((event) => event.sourceRef),
    reviewFindingCounts: exactReview?.findingCounts ?? {},
    ...(exactReview
      ? {
          reviewedFinalSha: exactReview.reviewedFinalSha,
          reviewedDiffRef: exactReview.reviewedDiffRef,
        }
      : {}),
    strategyResult: isUnsuccessful(outcome) || unresolvedActionGate ? 'stopped' : 'continue',
    actionGateSummary: summarizeActionGates(events),
    operatorExperience: experience,
    harnessFriction: summarizeHarnessFriction(events),
    ...(isUnsuccessful(outcome)
      ? { stopReason: stringField(terminal.payload, 'reason') ?? `terminal outcome: ${outcome}` }
      : {}),
    missingFields,
    candidateCase,
    candidateCaseReason: candidateCase
      ? 'passive exact evidence and explicit operator experience are complete'
      : `not a candidate: ${missingFields.join(', ')}`,
  };
  return receipt;
}

function deriveMissingFields(
  context: CollectionContext,
  experience: AdaptiveDevelopmentTrialReceipt['operatorExperience'],
  outcome: AdaptiveDevelopmentTrialReceipt['outcome'],
  unresolvedActionGate: boolean,
): string[] {
  const { episode, git, handoff, exactVerification, exactReview, verificationEvents, reviewEvents } = context;
  const missing = new Set<string>();
  if (!episode.modelId) missing.add('modelId');
  if (!episode.harnessVersion) missing.add('harnessVersion');
  if (!git.evidenceComplete) missing.add('git_identity');
  if (!handoff) missing.add('outcome_checkpoint');
  if (git.mutating && !exactVerification) {
    missing.add(verificationEvents.length === 0 ? 'verification' : 'verification_binding');
  }
  if (git.mutating && !exactReview) {
    missing.add(reviewEvents.length === 0 ? 'review' : 'review_binding');
  }
  if (experience === 'not_assessed') missing.add('operator_experience');
  if (unresolvedActionGate) missing.add('unresolved_action_gate');
  if (isUnsuccessful(outcome)) missing.add('successful_outcome');
  return [...missing].sort();
}

function isUnsuccessful(outcome: AdaptiveDevelopmentTrialReceipt['outcome']): boolean {
  return outcome === 'failed' || outcome === 'abandoned';
}

function isExactVerification(event: AdaptiveDevelopmentEvent, git: GitSnapshot): boolean {
  return (
    numberField(event.payload, 'exitCode') === 0 &&
    stringField(event.payload, 'finalSha') === git.finalSha &&
    stringField(event.payload, 'diffRef') === git.diffRef
  );
}

function parseGitSnapshot(payload: Record<string, unknown>): GitSnapshot | null {
  const projectPath = stringField(payload, 'projectPath');
  const worktree = stringField(payload, 'worktree');
  const branch = stringField(payload, 'branch');
  const baseSha = stringField(payload, 'baseSha');
  const finalSha = stringField(payload, 'finalSha');
  const diffRef = stringField(payload, 'diffRef');
  const scopeEnvelope = stringField(payload, 'scopeEnvelope');
  if (
    !projectPath ||
    !worktree ||
    !branch ||
    !baseSha ||
    !finalSha ||
    !diffRef ||
    !scopeEnvelope ||
    typeof payload.mutating !== 'boolean'
  ) {
    return null;
  }
  return {
    projectPath,
    worktree,
    branch,
    baseSha,
    finalSha,
    diffRef,
    scopeEnvelope,
    mutating: payload.mutating,
    evidenceComplete: payload.evidenceComplete === true,
  };
}

function findExactApprovedReview(
  reviewEvents: AdaptiveDevelopmentEvent[],
  reviewRequestEvents: AdaptiveDevelopmentEvent[],
  episode: AdaptiveDevelopmentEpisode,
  git: GitSnapshot,
): ExactApprovedReview | undefined {
  const requestsById = new Map(reviewRequestEvents.map((event) => [event.eventId, event]));
  for (const event of [...reviewEvents].reverse()) {
    const reviewRequestEventId = stringField(event.payload, 'reviewRequestEventId');
    const request = reviewRequestEventId ? requestsById.get(reviewRequestEventId) : undefined;
    const review = request ? parseExactApprovedReview(event, request, episode, git) : null;
    if (review) return review;
  }
  return undefined;
}

function parseExactApprovedReview(
  event: AdaptiveDevelopmentEvent,
  request: AdaptiveDevelopmentEvent,
  episode: AdaptiveDevelopmentEpisode,
  git: GitSnapshot,
): ExactApprovedReview | null {
  const reviewerId = stringField(event.payload, 'reviewerId');
  const authorId = stringField(event.payload, 'authorId');
  const findingCounts = parseReviewFindingCounts(event.payload);
  if (stringField(event.payload, 'verdict') !== 'approved') return null;
  if (!reviewerId || !authorId || reviewerId === authorId) return null;
  if (episode.actorCatId && authorId !== episode.actorCatId) return null;
  if (stringField(request.payload, 'finalSha') !== git.finalSha) return null;
  if (stringField(request.payload, 'diffRef') !== git.diffRef) return null;
  if (stringField(event.payload, 'reviewRequestSourceRef') !== request.sourceRef) return null;
  if (stringField(event.payload, 'reviewedFinalSha') !== git.finalSha) return null;
  if (stringField(event.payload, 'reviewedDiffRef') !== git.diffRef) return null;
  if (!findingCounts || findingCounts.p1 !== 0 || findingCounts.p2 !== 0) return null;
  return {
    reviewedFinalSha: git.finalSha,
    reviewedDiffRef: git.diffRef,
    findingCounts,
  };
}

function parseReviewFindingCounts(payload: Record<string, unknown>): ExactApprovedReview['findingCounts'] | null {
  const counts = recordField(payload, 'findingCounts');
  if (!counts) return null;
  const p1 = numberField(counts, 'p1');
  const p2 = numberField(counts, 'p2');
  const p3 = numberField(counts, 'p3');
  return p1 === null || p2 === null || p3 === null ? null : { p1, p2, p3 };
}

function resolveExperience(events: AdaptiveDevelopmentEvent[]): AdaptiveDevelopmentTrialReceipt['operatorExperience'] {
  const event = lastEvent(events, 'experience_assessment', 'session');
  const verdict = event ? stringField(event.payload, 'verdict') : null;
  if (verdict === 'accepted' || verdict === 'rejected' || verdict === 'deferred') return verdict;
  return 'not_assessed';
}

function resolveOutcome(
  events: AdaptiveDevelopmentEvent[],
  terminal: AdaptiveDevelopmentEvent,
  experience: AdaptiveDevelopmentTrialReceipt['operatorExperience'],
): AdaptiveDevelopmentTrialReceipt['outcome'] {
  const state = stringField(terminal.payload, 'state');
  if (state === 'failed' || experience === 'rejected') return 'failed';
  if (state === 'abandoned') return 'abandoned';
  return events.some(
    (event) => event.type === 'review_verdict' && stringField(event.payload, 'verdict') === 'changes_requested',
  )
    ? 'corrected_success'
    : 'success';
}

function timingFields(
  events: AdaptiveDevelopmentEvent[],
  episode: AdaptiveDevelopmentEpisode,
): { timeToFirstMeaningfulDiffMs?: number; reviewReadyElapsedMs?: number } {
  const result: { timeToFirstMeaningfulDiffMs?: number; reviewReadyElapsedMs?: number } = {};
  const meaningfulDiff = firstEvent(events, 'meaningful_diff', 'git');
  const reviewRequest = firstEvent(events, 'review_request');
  if (meaningfulDiff) {
    result.timeToFirstMeaningfulDiffMs = Math.max(
      0,
      Date.parse(meaningfulDiff.occurredAt) - Date.parse(episode.startedAt),
    );
  }
  if (reviewRequest) {
    result.reviewReadyElapsedMs = Math.max(0, Date.parse(reviewRequest.occurredAt) - Date.parse(episode.startedAt));
  }
  return result;
}

function summarizeActionGates(events: AdaptiveDevelopmentEvent[]) {
  const summary = { satisfied: 0, needEvidence: 0, needAuthority: 0, denied: 0 };
  for (const event of events) {
    if (event.type !== 'action_gate') continue;
    const disposition = stringField(event.payload, 'disposition');
    if (disposition === 'satisfied') summary.satisfied += 1;
    if (disposition === 'need_evidence') summary.needEvidence += 1;
    if (disposition === 'need_authority') summary.needAuthority += 1;
    if (disposition === 'denied') summary.denied += 1;
  }
  return summary;
}

function summarizeHarnessFriction(events: AdaptiveDevelopmentEvent[]) {
  const summary = { routeFailures: 0, invocationTimeouts: 0, recoveryNudges: 0, controlPlaneFailures: 0 };
  for (const event of events) {
    if (event.type !== 'harness_friction') continue;
    const kind = stringField(event.payload, 'kind');
    if (kind === 'route_failure') summary.routeFailures += 1;
    if (kind === 'invocation_timeout') summary.invocationTimeouts += 1;
    if (kind === 'recovery_nudge') summary.recoveryNudges += 1;
    if (kind === 'control_plane_failure') summary.controlPlaneFailures += 1;
  }
  return summary;
}

function hasUnresolvedActionGate(events: AdaptiveDevelopmentEvent[]): boolean {
  return events.some(
    (event) =>
      event.type === 'action_gate' &&
      stringField(event.payload, 'disposition') !== 'satisfied' &&
      event.payload.resolved !== true,
  );
}

function firstEvent(
  events: AdaptiveDevelopmentEvent[],
  type: AdaptiveDevelopmentEvent['type'],
  source?: AdaptiveDevelopmentEvent['source'],
): AdaptiveDevelopmentEvent | undefined {
  return events.find((event) => event.type === type && (!source || event.source === source));
}

function lastEvent(
  events: AdaptiveDevelopmentEvent[],
  type: AdaptiveDevelopmentEvent['type'],
  source?: AdaptiveDevelopmentEvent['source'],
): AdaptiveDevelopmentEvent | undefined {
  return events.filter((event) => event.type === type && (!source || event.source === source)).at(-1);
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function numberField(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : null;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const field = value[key];
  return field !== null && typeof field === 'object' && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}
