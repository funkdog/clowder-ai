import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveA2aEvidenceBundle } from '../a2a/eval-a2a-artifact-resolver.js';
import type { EvalDomainRegistryEntry } from '../domain/eval-domain-registry.js';
import { parseVerdictHandoffPacket, type VerdictHandoffPacket } from '../verdict-handoff.js';
import type { ResolvedAdaptiveDevelopmentWindow } from './adaptive-development-trial-provider.js';
import {
  ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION,
  ADAPTIVE_DEVELOPMENT_PUBLISH_PROJECTION_VERSION,
} from './adaptive-development-types.js';
import { formatAdaptiveDevelopmentLiveVerdictMarkdown } from './eval-adaptive-development-renderer.js';

const SAFE_VERDICT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SANITIZE_RULES_VERSION = 'lf-0001-adaptive-development-v3';
const COMPONENT_ID = 'LF-0001-free-plan-collector';

export interface GenerateAdaptiveDevelopmentLiveVerdictInput {
  verdictId: string;
  harnessFeedbackRoot: string;
  domain: EvalDomainRegistryEntry;
  sourceWindow: ResolvedAdaptiveDevelopmentWindow;
  submittedPacket: VerdictHandoffPacket;
  generatedAt?: string;
  generatorCommit?: string;
}

export interface AdaptiveDevelopmentLiveVerdictArtifact {
  path: string;
  bundleDir: string;
  packet: VerdictHandoffPacket;
  markdown: string;
  refs: {
    bundleDir: string;
    snapshotRef: string;
    attributionRefs: string[];
  };
  isLive: true;
  sentCrossThreadMessage: false;
}

export function generateAdaptiveDevelopmentLiveVerdict(
  input: GenerateAdaptiveDevelopmentLiveVerdictInput,
): AdaptiveDevelopmentLiveVerdictArtifact {
  assertSafeVerdictId(input.verdictId);
  assertSubmittedPacketMatches(input.submittedPacket, input.domain);

  const bundleDir = join(input.harnessFeedbackRoot, 'bundles', input.verdictId);
  const rawDir = join(bundleDir, 'raw');
  const verdictPath = join(input.harnessFeedbackRoot, 'verdicts', `${input.verdictId}.md`);
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(join(input.harnessFeedbackRoot, 'verdicts'), { recursive: true });

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const snapshot = buildSnapshot(input, generatedAt);
  const attribution = buildAttribution(input, generatedAt);
  const rawReceiptsPath = join(rawDir, 'trial-receipts.json');
  const publishSafeSourceWindow = buildPublishSafeSourceWindow(input);
  assertPublishSafeProjection(publishSafeSourceWindow);
  writeJson(rawReceiptsPath, {
    verdictId: input.verdictId,
    projectionVersion: ADAPTIVE_DEVELOPMENT_PUBLISH_PROJECTION_VERSION,
    ...publishSafeSourceWindow,
  });
  const repoRoot = join(input.harnessFeedbackRoot, '..', '..');
  const provenance = {
    verdictId: input.verdictId,
    rawInputs: [
      {
        path: relative(repoRoot, rawReceiptsPath).replace(/\\/g, '/'),
        sha256: sha256File(rawReceiptsPath),
      },
    ],
    generatedAt,
    generator: {
      name: 'eval-adaptive-development-live-verdict',
      version: '3',
      collectorContractVersion: ADAPTIVE_DEVELOPMENT_COLLECTOR_CONTRACT_VERSION,
      ...(input.generatorCommit ? { commit: input.generatorCommit } : {}),
    },
    sanitizeRulesVersion: SANITIZE_RULES_VERSION,
  };

  writeJson(join(bundleDir, 'snapshot.json'), snapshot);
  writeJson(join(bundleDir, 'attribution.json'), attribution);
  writeJson(join(bundleDir, 'provenance.json'), provenance);

  const resolved = resolveA2aEvidenceBundle({ bundleDir, verdictId: input.verdictId });
  const packet = parseVerdictHandoffPacket({
    ...input.submittedPacket,
    evidencePacket: {
      ...input.submittedPacket.evidencePacket,
      snapshotRefs: [resolved.snapshotRef],
      attributionRefs: resolved.attributionRefs,
    },
  });
  const markdown = formatAdaptiveDevelopmentLiveVerdictMarkdown(input.verdictId, packet, resolved.snapshotRef);
  writeFileSync(verdictPath, markdown, 'utf8');

  return {
    path: verdictPath,
    bundleDir,
    packet,
    markdown,
    refs: {
      bundleDir,
      snapshotRef: resolved.snapshotRef,
      attributionRefs: resolved.attributionRefs,
    },
    isLive: true,
    sentCrossThreadMessage: false,
  };
}

function buildPublishSafeSourceWindow(input: GenerateAdaptiveDevelopmentLiveVerdictInput) {
  const episodeRefById = new Map(
    input.sourceWindow.observedEpisodes.map((episode) => [
      episode.episodeId,
      opaqueEpisodeRef(input.verdictId, episode.episodeId),
    ]),
  );
  return {
    windowStartMs: input.sourceWindow.windowStartMs,
    windowEndMs: input.sourceWindow.windowEndMs,
    observedEpisodes: input.sourceWindow.observedEpisodes.map((episode) => ({
      episodeRef: episodeRefById.get(episode.episodeId),
      startedAt: episode.startedAt,
      harnessVersion: episode.harnessVersion,
    })),
    receipts: input.sourceWindow.receipts.map((receipt) => ({
      episodeRef: episodeRefById.get(receipt.episodeId) ?? opaqueEpisodeRef(input.verdictId, receipt.episodeId),
      mode: receipt.mode,
      collectorContractVersion: receipt.collectorContractVersion,
      outcome: receipt.outcome,
      ...(receipt.startedAt ? { startedAt: receipt.startedAt } : {}),
      ...(receipt.harnessVersion ? { harnessVersion: receipt.harnessVersion } : {}),
      ...(receipt.timeToFirstMeaningfulDiffMs !== undefined
        ? { timeToFirstMeaningfulDiffMs: receipt.timeToFirstMeaningfulDiffMs }
        : {}),
      ...(receipt.reviewReadyElapsedMs !== undefined ? { reviewReadyElapsedMs: receipt.reviewReadyElapsedMs } : {}),
      ...(receipt.replans ? { replanCount: receipt.replans.length } : {}),
      verificationCount: receipt.verificationRefs.length,
      reviewCount: receipt.reviewRefs.length,
      reviewFindingCounts: receipt.reviewFindingCounts,
      ...(receipt.strategyResult ? { strategyResult: receipt.strategyResult } : {}),
      ...(receipt.actionGateSummary ? { actionGateSummary: receipt.actionGateSummary } : {}),
      operatorExperience: receipt.operatorExperience,
      harnessFriction: receipt.harnessFriction,
      missingFields: receipt.missingFields,
      candidateCase: receipt.candidateCase,
    })),
    incompleteEpisodeRefs: input.sourceWindow.incompleteEpisodeIds.map(
      (episodeId) => episodeRefById.get(episodeId) ?? opaqueEpisodeRef(input.verdictId, episodeId),
    ),
  };
}

function opaqueEpisodeRef(verdictId: string, episodeId: string): string {
  return `episode-${createHash('sha256').update(`${verdictId}\0${episodeId}`).digest('hex').slice(0, 20)}`;
}

function assertPublishSafeProjection(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (/\/Users\/|\/home\/|[A-Za-z]:\\Users\\|adep-/.test(value)) {
      throw new Error(`adaptive_development_publish_projection_leak:${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertPublishSafeProjection(entry, `${path}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (
      [
        'activationText',
        'actorCatId',
        'modelId',
        'projectPath',
        'worktree',
        'branch',
        'baseSha',
        'finalSha',
        'diffRef',
        'scopeEnvelope',
        'sourceRef',
        'verificationRefs',
        'reviewRefs',
      ].includes(key)
    ) {
      throw new Error(`adaptive_development_publish_projection_forbidden_field:${path}.${key}`);
    }
    assertPublishSafeProjection(nested, `${path}.${key}`);
  }
}

function buildSnapshot(input: GenerateAdaptiveDevelopmentLiveVerdictInput, generatedAt: string) {
  const receipts = input.sourceWindow.receipts;
  const outcomes = countBy(receipts.map((receipt) => receipt.outcome));
  const candidateCount = receipts.filter((receipt) => receipt.candidateCase).length;
  const nonCandidate = receipts.length - candidateCount;
  const reviewMissing = receipts.filter((receipt) =>
    receipt.missingFields.some((field) => field.startsWith('review')),
  ).length;
  const bindingGap = receipts.filter((receipt) =>
    receipt.missingFields.some((field) => field === 'git_identity' || field.endsWith('_binding')),
  ).length;

  return {
    verdictId: input.verdictId,
    evalSnapshotId: evalSnapshotId(input.domain, generatedAt),
    featureId: input.domain.handoffTargetResolver.featureId,
    generatedAt,
    window: {
      startMs: input.sourceWindow.windowStartMs,
      endMs: input.sourceWindow.windowEndMs,
      durationHours: roundHours(input.sourceWindow.windowEndMs - input.sourceWindow.windowStartMs),
    },
    components: [
      {
        id: COMPONENT_ID,
        name: 'Free Plan passive collector and evidence join',
        confidence: receipts.length >= 3 ? 'medium' : 'low',
        activationCounts: {
          observed_episodes_total: input.sourceWindow.observedEpisodes.length,
          receipts_total: receipts.length,
          candidate_cases_total: candidateCount,
          success_total: outcomes.success ?? 0,
          corrected_success_total: outcomes.corrected_success ?? 0,
          failed_total: outcomes.failed ?? 0,
          abandoned_total: outcomes.abandoned ?? 0,
        },
        frictionCounts: {
          receipts_missing_total: input.sourceWindow.incompleteEpisodeIds.length,
          non_candidate_total: nonCandidate,
          review_missing_total: reviewMissing,
          binding_gap_total: bindingGap,
          telemetry_gap_total: input.sourceWindow.incompleteEpisodeIds.length,
        },
      },
    ],
  };
}

function buildAttribution(input: GenerateAdaptiveDevelopmentLiveVerdictInput, generatedAt: string) {
  const missingReceipts = input.sourceWindow.incompleteEpisodeIds.length;
  const nonCandidates = input.sourceWindow.receipts.filter((receipt) => !receipt.candidateCase);
  const finding =
    missingReceipts > 0
      ? buildFinding(
          input,
          generatedAt,
          'receipt-gap',
          'telemetry_gap',
          `${missingReceipts} observed episode(s) did not yet have enough independent sources to derive a receipt`,
          'receipts_missing_total',
          'Inspect collector source coverage; do not treat missing receipts as successful trials.',
        )
      : nonCandidates.length > 0
        ? buildFinding(
            input,
            generatedAt,
            'candidate-gap',
            'evidence_binding_gap',
            `${nonCandidates.length} derived receipt(s) were not candidate cases`,
            'non_candidate_total',
            'Inspect the receipt missingFields distribution before changing the Free Plan contract.',
          )
        : null;

  return finding
    ? {
        verdictId: input.verdictId,
        featureId: input.domain.handoffTargetResolver.featureId,
        evalSnapshotId: evalSnapshotId(input.domain, generatedAt),
        generatedAt,
        findings: [finding],
      }
    : {
        verdictId: input.verdictId,
        featureId: input.domain.handoffTargetResolver.featureId,
        evalSnapshotId: evalSnapshotId(input.domain, generatedAt),
        generatedAt,
        findings: [],
        noFindingRecord: {
          reason: 'all observed episodes produced derived receipts and no candidate-binding gap was present',
          evidence: `${COMPONENT_ID}/observed_episodes_total`,
        },
      };
}

function buildFinding(
  input: GenerateAdaptiveDevelopmentLiveVerdictInput,
  generatedAt: string,
  suffix: string,
  signalType: string,
  excerpt: string,
  metric: string,
  rationale: string,
) {
  return {
    id: `AD-${generatedAt.slice(0, 10)}-${suffix}`,
    relatedFeature: input.domain.handoffTargetResolver.featureId,
    frictionSignal: {
      type: `adaptive_development.${signalType}`,
      severity: 'medium',
      confidence: 0.9,
      detectedAt: generatedAt,
    },
    attribution: {
      primaryLayer: 'needs_investigation',
      evidence: [{ type: 'telemetry-gap', anchor: `${COMPONENT_ID}/${metric}`, excerpt }],
    },
    proposedAction: [
      {
        action: 'inspect-collector-coverage',
        target: `${input.domain.handoffTargetResolver.featureId}/${COMPONENT_ID}`,
        rationale,
      },
    ],
    status: 'open',
  };
}

function assertSubmittedPacketMatches(packet: VerdictHandoffPacket, domain: EvalDomainRegistryEntry): void {
  if (packet.domainId !== domain.domainId) {
    throw new Error(
      `submitted_packet_evidence_mismatch: packet.domainId=${packet.domainId} vs domain.domainId=${domain.domainId}`,
    );
  }
  if (packet.harnessUnderEval.featureId !== domain.handoffTargetResolver.featureId) {
    throw new Error(
      `submitted_packet_evidence_mismatch: packet.harnessUnderEval.featureId=${packet.harnessUnderEval.featureId} vs domain.featureId=${domain.handoffTargetResolver.featureId}`,
    );
  }
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function evalSnapshotId(domain: EvalDomainRegistryEntry, generatedAt: string): string {
  return `eval-${domain.handoffTargetResolver.featureId}-adaptive-development-${generatedAt.slice(0, 10)}`;
}

function roundHours(durationMs: number): number {
  return Math.max(0, Math.round((durationMs / 3_600_000) * 1000) / 1000);
}

function assertSafeVerdictId(verdictId: string): void {
  if (!SAFE_VERDICT_ID_PATTERN.test(verdictId)) throw new Error('verdictId must be a safe slug');
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
