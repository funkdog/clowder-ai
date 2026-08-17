export const ADAPTIVE_DEVELOPMENT_MODE = 'free_plan_hard_gates' as const;
export const ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION = 'adaptive-development-collector.v3' as const;
export const ADAPTIVE_DEVELOPMENT_PUBLISH_PROJECTION_VERSION = 'adaptive-development-publish-projection.v3' as const;

export type AdaptiveDevelopmentMode = typeof ADAPTIVE_DEVELOPMENT_MODE;

export interface AdaptiveDevelopmentActivationInput {
  ownerUserId: string;
  threadId: string;
  activationMessageId: string;
  activationText: string;
  startedAt: string;
  actorCatId?: string;
  modelId?: string;
  harnessVersion?: string;
  projectPath?: string;
  worktree?: string;
}

export interface AdaptiveDevelopmentEpisode {
  episodeId: string;
  mode: AdaptiveDevelopmentMode;
  ownerUserId: string;
  threadId: string;
  activationMessageId: string;
  activationText: string;
  startedAt: string;
  actorCatId?: string;
  modelId?: string;
  harnessVersion?: string;
  projectPath?: string;
  worktree?: string;
  createdAt: string;
}

export const ADAPTIVE_DEVELOPMENT_EVENT_TYPES = [
  'meaningful_diff',
  'git_snapshot',
  'verification',
  'review_request',
  'review_verdict',
  'handoff',
  'action_gate',
  'replan',
  'experience_assessment',
  'harness_friction',
  'terminal',
] as const;

export type AdaptiveDevelopmentEventType = (typeof ADAPTIVE_DEVELOPMENT_EVENT_TYPES)[number];

export const ADAPTIVE_DEVELOPMENT_EVENT_SOURCES = [
  'runtime',
  'session',
  'git',
  'verification',
  'review-observer',
] as const;

export type AdaptiveDevelopmentEventSource = (typeof ADAPTIVE_DEVELOPMENT_EVENT_SOURCES)[number];

export interface AdaptiveDevelopmentEventInput {
  eventId: string;
  type: AdaptiveDevelopmentEventType;
  occurredAt: string;
  source: AdaptiveDevelopmentEventSource;
  sourceRef: string;
  payload: Record<string, unknown>;
}

export interface AdaptiveDevelopmentEvent extends AdaptiveDevelopmentEventInput {
  id: number;
  episodeId: string;
  eventDigest: string;
  createdAt: string;
}

export interface AdaptiveDevelopmentTrialReceipt {
  episodeId: string;
  mode: AdaptiveDevelopmentMode;
  collectorContractVersion: typeof ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION;
  outcome: 'success' | 'corrected_success' | 'failed' | 'abandoned';
  startedAt?: string;
  modelId?: string;
  harnessVersion?: string;
  projectPath?: string;
  worktree?: string;
  branch?: string;
  baseSha?: string;
  finalSha?: string;
  diffRef?: string;
  scopeEnvelope?: string;
  timeToFirstMeaningfulDiffMs?: number;
  reviewReadyElapsedMs?: number;
  omittedOrReplacedSoftSteps?: string[];
  replans?: string[];
  verificationRefs: string[];
  reviewRefs: string[];
  reviewedFinalSha?: string;
  reviewedDiffRef?: string;
  reviewFindingCounts: {
    p1?: number;
    p2?: number;
    p3?: number;
  };
  strategyResult?: 'continue' | 'stopped';
  actionGateSummary?: {
    satisfied: number;
    needEvidence: number;
    needAuthority: number;
    denied: number;
  };
  operatorExperience: 'accepted' | 'rejected' | 'deferred' | 'not_assessed';
  harnessFriction: {
    routeFailures: number;
    invocationTimeouts: number;
    recoveryNudges: number;
    controlPlaneFailures: number;
  };
  stopReason?: string;
  missingFields: string[];
  candidateCase: boolean;
  candidateCaseReason: string;
}

export interface AdaptiveDevelopmentEpisodeWindowSelector {
  ownerUserId: string;
  windowStartMs: number;
  windowEndMs: number;
  episodeIds?: string[];
}
