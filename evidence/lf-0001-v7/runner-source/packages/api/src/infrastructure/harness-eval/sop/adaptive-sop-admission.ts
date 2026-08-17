import { createHash } from 'node:crypto';
import {
  type AdaptiveSopPlan,
  SOP_ADMISSION_DECISION_SCHEMA_VERSION,
  type SopActionGate,
  type SopAdmissionDecision,
  type SopCapability,
  SopCapabilitySchema,
} from '@cat-cafe/shared';
import { z } from 'zod';
import { AdaptiveSopContractError, parseAdaptiveSopPlan } from './adaptive-sop-contract.js';

export const SOP_ADMISSION_FACTS_SCHEMA_VERSION = 'sop-admission-facts.v4' as const;

const NonEmptyStringSchema = z.string().trim().min(1);
const KnownBooleanSchema = z.union([z.boolean(), z.literal('unknown')]);
const KnownStringSchema = z.union([NonEmptyStringSchema, z.literal('unknown')]);
const KnownSha1Schema = z.union([z.string().regex(/^[0-9a-f]{40}$/), z.literal('unknown')]);
const KnownSha256Schema = z.union([z.string().regex(/^[0-9a-f]{64}$/), z.literal('unknown')]);
const KnownChangedFilesSchema = z.union([z.array(NonEmptyStringSchema), z.literal('unknown')]);
const CapabilityRequestSchema = z
  .object({
    actionId: NonEmptyStringSchema,
    capability: SopCapabilitySchema,
    stage: z.enum(['before_execution', 'before_review_ready', 'before_publication']),
    enforcement: z.enum(['hard_enforced', 'instruction_enforced', 'unknown']),
    authority: z.enum(['not_required', 'granted', 'missing', 'unknown']),
    evidenceRefs: z.array(NonEmptyStringSchema),
  })
  .strict();

const CapabilityRequestsSchema = z.array(CapabilityRequestSchema).superRefine((requests, context) => {
  const seen = new Set<string>();
  for (const [index, request] of requests.entries()) {
    const key = capabilityKey(request.actionId, request.capability);
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'capability'],
        message: `duplicate action capability ${key}`,
      });
    }
    seen.add(key);
  }
});

const ClassifierResolutionSchema = z
  .object({
    classification: z.enum(['unrestricted', 'resolved', 'unknown']),
    capabilities: z.array(SopCapabilitySchema),
    rationale: NonEmptyStringSchema,
    evidenceRefs: z.array(NonEmptyStringSchema),
    evidenceStatus: z.enum(['resolved', 'unresolvable']),
  })
  .strict()
  .superRefine((resolution, context) => {
    const uniqueCapabilities = new Set(resolution.capabilities);
    if (uniqueCapabilities.size !== resolution.capabilities.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities'], message: 'capabilities must be unique' });
    }
    if (resolution.capabilities.includes('unclassified_action')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: 'unclassified_action is reserved for fail-closed admission gates',
      });
    }
    if (resolution.classification === 'resolved' && resolution.capabilities.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: 'resolved actions require at least one capability',
      });
    }
    if (resolution.classification !== 'resolved' && resolution.capabilities.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: `${resolution.classification} actions cannot carry resolved capabilities`,
      });
    }
    if (resolution.evidenceStatus === 'resolved' && resolution.evidenceRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenceRefs'],
        message: 'resolved evidence status requires at least one evidence reference',
      });
    }
  });

const CapabilityReviewSchema = z
  .object({
    verdict: z.enum(['verified', 'conflict', 'unknown']),
    rationale: NonEmptyStringSchema,
    evidenceRefs: z.array(NonEmptyStringSchema),
    evidenceStatus: z.enum(['resolved', 'unresolvable']),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.evidenceStatus === 'resolved' && review.evidenceRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenceRefs'],
        message: 'resolved evidence status requires at least one evidence reference',
      });
    }
  });

const ActionResolutionSchema = z
  .object({
    actionId: NonEmptyStringSchema,
    classification: z.enum(['unrestricted', 'resolved', 'unknown']),
    capabilities: z.array(SopCapabilitySchema),
    resolver: ClassifierResolutionSchema,
    review: CapabilityReviewSchema,
  })
  .strict()
  .superRefine((resolution, context) => {
    const finalMatchesResolver =
      resolution.classification === resolution.resolver.classification &&
      JSON.stringify(resolution.capabilities) === JSON.stringify(resolution.resolver.capabilities);
    const evidenceVerified =
      resolution.resolver.evidenceStatus === 'resolved' && resolution.review.evidenceStatus === 'resolved';
    if (resolution.review.verdict === 'verified' && evidenceVerified) {
      if (!finalMatchesResolver) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['classification'],
          message: 'verified reviews require the final classification to match the resolver proposal',
        });
      }
      if (resolution.resolver.evidenceRefs.length === 0 || resolution.review.evidenceRefs.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['review'],
          message: 'verified classifications require resolver and reviewer evidence',
        });
      }
    } else if (resolution.classification !== 'unknown' || resolution.capabilities.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classification'],
        message: 'conflicting or unknown reviews must fail closed as an unknown classification',
      });
    }
    if (resolution.classification === 'resolved' && resolution.capabilities.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: 'resolved actions require at least one capability',
      });
    }
    if (resolution.classification !== 'resolved' && resolution.capabilities.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: `${resolution.classification} actions cannot carry resolved capabilities`,
      });
    }
  });

const CapabilityResolutionSchema = z
  .object({
    resolverFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    reviewerFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    actions: z.array(ActionResolutionSchema),
    requiredCapabilitiesMissing: z.array(SopCapabilitySchema),
  })
  .strict()
  .superRefine((resolution, context) => {
    const actionIds = resolution.actions.map((action) => action.actionId);
    if (new Set(actionIds).size !== actionIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'actionId values must be unique' });
    }
    if (new Set(resolution.requiredCapabilitiesMissing).size !== resolution.requiredCapabilitiesMissing.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiredCapabilitiesMissing'],
        message: 'requiredCapabilitiesMissing values must be unique',
      });
    }
  });

export const SopAdmissionFactsSchema = z
  .object({
    schemaVersion: z.literal(SOP_ADMISSION_FACTS_SCHEMA_VERSION),
    episodeId: NonEmptyStringSchema,
    planFingerprint: KnownSha256Schema,
    observedAt: z.string().datetime({ offset: true }),
    repository: z
      .object({
        worktreeRoot: KnownStringSchema,
        branch: KnownStringSchema,
        baseSha: KnownSha1Schema,
        changedFiles: KnownChangedFilesSchema,
        diffFingerprint: KnownSha256Schema,
        isolatedWorktree: KnownBooleanSchema,
        recoveryWithinOneCommit: KnownBooleanSchema,
      })
      .strict(),
    data: z
      .object({
        testDataIsolated: z.union([z.boolean(), z.enum(['unknown', 'not_applicable'])]),
        productionUserDataInScope: KnownBooleanSchema,
      })
      .strict(),
    capabilityRequests: CapabilityRequestsSchema,
    capabilityResolution: CapabilityResolutionSchema,
    verification: z
      .object({
        objectiveOutcomeCheck: KnownBooleanSchema,
        mutatingWork: KnownBooleanSchema,
        crossIndividualReviewPlanned: KnownBooleanSchema,
        p1p2ClearancePlanned: KnownBooleanSchema,
      })
      .strict(),
  })
  .strict();

export type SopAdmissionFacts = z.infer<typeof SopAdmissionFactsSchema>;
export type SopCapabilityRequest = z.infer<typeof CapabilityRequestSchema>;

const REQUIRED_REPOSITORY_FACTS = [
  'repository.worktreeRoot',
  'repository.branch',
  'repository.baseSha',
  'repository.changedFiles',
  'repository.diffFingerprint',
  'repository.isolatedWorktree',
  'repository.recoveryWithinOneCommit',
] as const;

export function parseSopAdmissionFacts(input: unknown): SopAdmissionFacts {
  if (!isRecord(input) || typeof input.schemaVersion !== 'string') {
    throw factContractError('invalid_contract', undefined, ['schemaVersion is required']);
  }
  if (input.schemaVersion !== SOP_ADMISSION_FACTS_SCHEMA_VERSION) {
    throw factContractError('unsupported_schema_version', input.schemaVersion, [
      `supported=${SOP_ADMISSION_FACTS_SCHEMA_VERSION}`,
      `received=${input.schemaVersion}`,
    ]);
  }

  const result = SopAdmissionFactsSchema.safeParse(input);
  if (!result.success) {
    throw factContractError(
      'invalid_contract',
      input.schemaVersion,
      result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    );
  }
  return result.data;
}

export function evaluateSopAdmission(planInput: unknown, factsInput: unknown): SopAdmissionDecision {
  const plan = parseAdaptiveSopPlan(planInput);
  const facts = parseSopAdmissionFacts(factsInput);
  const envelopeFingerprint = buildEnvelopeFingerprint(plan, facts);

  const identityBlock = evaluateIdentityAndFactConsistency(plan, facts);
  if (identityBlock) {
    return deny(plan.episodeId, envelopeFingerprint, false, [], identityBlock, 'stop_adaptive');
  }

  const coverage = evaluateCapabilityCoverage(plan, facts);
  const actionGates = [...facts.capabilityRequests.map(evaluateCapabilityRequest), ...coverage.actionGates];

  const containmentFailure = firstContainmentFailure(facts);
  if (containmentFailure) {
    return deny(
      plan.episodeId,
      envelopeFingerprint,
      false,
      actionGates,
      `containment failed: ${containmentFailure}`,
      'stop_adaptive',
    );
  }

  if (facts.data.productionUserDataInScope === true) {
    return deny(
      plan.episodeId,
      envelopeFingerprint,
      false,
      [productionDataGate(), ...actionGates],
      'production user data is outside the local-trial boundary',
      'operator',
    );
  }

  const deniedGate = actionGates.find((gate) => gate.disposition === 'denied');
  if (deniedGate) {
    return deny(plan.episodeId, envelopeFingerprint, true, actionGates, deniedGate.reason, 'replan');
  }

  const evidenceNeeds = collectEvidenceNeeds(facts, actionGates, coverage.evidenceNeeds);
  if (evidenceNeeds.requiredFacts.length > 0) {
    return {
      schemaVersion: SOP_ADMISSION_DECISION_SCHEMA_VERSION,
      status: 'need_evidence',
      episodeId: plan.episodeId,
      envelopeFingerprint,
      strategyMayContinue: true,
      actionGates,
      missingEvidence: evidenceNeeds.missingEvidence,
      requiredFacts: evidenceNeeds.requiredFacts,
    };
  }

  const requiredAuthorities = actionGates
    .filter((gate) => gate.disposition === 'need_authority')
    .map((gate) => ({ actionId: gate.actionId, capability: gate.capability }));
  if (requiredAuthorities.length > 0) {
    return {
      schemaVersion: SOP_ADMISSION_DECISION_SCHEMA_VERSION,
      status: 'need_authority',
      episodeId: plan.episodeId,
      envelopeFingerprint,
      strategyMayContinue: true,
      actionGates,
      requiredAuthorities,
    };
  }

  return {
    schemaVersion: SOP_ADMISSION_DECISION_SCHEMA_VERSION,
    status: 'continue',
    episodeId: plan.episodeId,
    envelopeFingerprint,
    strategyMayContinue: true,
    actionGates,
  };
}

function evaluateIdentityAndFactConsistency(plan: AdaptiveSopPlan, facts: SopAdmissionFacts): string | undefined {
  if (plan.episodeId !== facts.episodeId) return 'contradictory episode identity';
  if (facts.planFingerprint !== 'unknown' && facts.planFingerprint !== fingerprintAdaptiveSopPlan(plan)) {
    return 'contradictory plan fingerprint';
  }

  const scalarFacts: Array<
    [keyof Pick<AdaptiveSopPlan['repositoryFacts'], 'worktreeRoot' | 'branch' | 'baseSha' | 'diffFingerprint'>, string]
  > = [
    ['worktreeRoot', facts.repository.worktreeRoot],
    ['branch', facts.repository.branch],
    ['baseSha', facts.repository.baseSha],
    ['diffFingerprint', facts.repository.diffFingerprint],
  ];
  for (const [key, observed] of scalarFacts) {
    const claimed = plan.repositoryFacts[key];
    if (observed !== 'unknown' && claimed !== undefined && claimed !== observed) {
      return `contradictory repository fact: ${key}`;
    }
  }

  if (
    facts.repository.changedFiles !== 'unknown' &&
    plan.repositoryFacts.changedFiles !== undefined &&
    !sameStringSet(plan.repositoryFacts.changedFiles, facts.repository.changedFiles)
  ) {
    return 'contradictory repository fact: changedFiles';
  }
  return undefined;
}

function firstContainmentFailure(facts: SopAdmissionFacts): string | undefined {
  if (facts.repository.isolatedWorktree === false) return 'repository.isolatedWorktree';
  if (facts.repository.recoveryWithinOneCommit === false) return 'repository.recoveryWithinOneCommit';
  if (facts.data.testDataIsolated === false) return 'data.testDataIsolated';
  return undefined;
}

function collectEvidenceNeeds(
  facts: SopAdmissionFacts,
  actionGates: readonly SopActionGate[],
  coverageNeeds: readonly { path: string; message: string }[],
): { missingEvidence: string[]; requiredFacts: string[] } {
  const missingEvidence: string[] = [];
  const requiredFacts: string[] = [];

  if (facts.planFingerprint === 'unknown') {
    addEvidenceNeed(
      'planFingerprint',
      'the capability resolution is not bound to the current plan fingerprint',
      missingEvidence,
      requiredFacts,
    );
  }

  for (const path of REQUIRED_REPOSITORY_FACTS) {
    if (readFact(facts, path) === 'unknown') {
      addEvidenceNeed(path, `${path} is unknown`, missingEvidence, requiredFacts);
    }
  }
  if (facts.data.testDataIsolated === 'unknown') {
    addEvidenceNeed('data.testDataIsolated', 'data.testDataIsolated is unknown', missingEvidence, requiredFacts);
  }
  if (facts.data.productionUserDataInScope === 'unknown') {
    addEvidenceNeed(
      'data.productionUserDataInScope',
      'data.productionUserDataInScope is unknown',
      missingEvidence,
      requiredFacts,
    );
  }

  for (const need of coverageNeeds) {
    addEvidenceNeed(need.path, need.message, missingEvidence, requiredFacts);
  }

  collectActionGateEvidenceNeeds(facts, actionGates, missingEvidence, requiredFacts);
  collectVerificationEvidenceNeeds(facts, missingEvidence, requiredFacts);
  return { missingEvidence, requiredFacts };
}

function collectActionGateEvidenceNeeds(
  facts: SopAdmissionFacts,
  actionGates: readonly SopActionGate[],
  missingEvidence: string[],
  requiredFacts: string[],
): void {
  for (const gate of actionGates) {
    if (gate.disposition !== 'need_evidence') continue;
    const request = facts.capabilityRequests.find(
      (candidate) => candidate.actionId === gate.actionId && candidate.capability === gate.capability,
    );
    if (!request) continue;
    const prefix = `capabilityRequests.${request.actionId}`;
    if (request.enforcement !== 'hard_enforced') {
      addEvidenceNeed(
        `${prefix}.enforcement`,
        `${request.actionId} lacks hard enforcement`,
        missingEvidence,
        requiredFacts,
      );
    }
    if (request.evidenceRefs.length === 0) {
      addEvidenceNeed(
        `${prefix}.evidenceRefs`,
        `${request.actionId} has no independently resolvable gate evidence`,
        missingEvidence,
        requiredFacts,
      );
    }
    if (request.authority === 'unknown') {
      addEvidenceNeed(
        `${prefix}.authority`,
        `${request.actionId} authority applicability is unresolved`,
        missingEvidence,
        requiredFacts,
      );
    }
  }
}

function collectVerificationEvidenceNeeds(
  facts: SopAdmissionFacts,
  missingEvidence: string[],
  requiredFacts: string[],
): void {
  const { verification } = facts;
  if (verification.objectiveOutcomeCheck !== true) {
    addEvidenceNeed(
      'verification.objectiveOutcomeCheck',
      verification.objectiveOutcomeCheck === false
        ? 'objective outcome check is not established'
        : 'verification.objectiveOutcomeCheck is unknown',
      missingEvidence,
      requiredFacts,
    );
  }
  if (verification.mutatingWork === 'unknown') {
    addEvidenceNeed(
      'verification.mutatingWork',
      'verification.mutatingWork is unknown',
      missingEvidence,
      requiredFacts,
    );
    return;
  }
  if (!verification.mutatingWork) return;

  if (verification.crossIndividualReviewPlanned !== true) {
    addEvidenceNeed(
      'verification.crossIndividualReviewPlanned',
      verification.crossIndividualReviewPlanned === false
        ? 'cross-individual review is not planned'
        : 'verification.crossIndividualReviewPlanned is unknown',
      missingEvidence,
      requiredFacts,
    );
  }
  if (verification.p1p2ClearancePlanned !== true) {
    addEvidenceNeed(
      'verification.p1p2ClearancePlanned',
      verification.p1p2ClearancePlanned === false
        ? 'P1/P2 clearance is not planned'
        : 'verification.p1p2ClearancePlanned is unknown',
      missingEvidence,
      requiredFacts,
    );
  }
}

function addEvidenceNeed(path: string, message: string, missingEvidence: string[], requiredFacts: string[]): void {
  if (!requiredFacts.includes(path)) requiredFacts.push(path);
  if (!missingEvidence.includes(message)) missingEvidence.push(message);
}

function evaluateCapabilityRequest(request: SopCapabilityRequest): SopActionGate {
  if (request.capability === 'unclassified_action') {
    return gate(request, 'need_evidence', `${request.actionId} has no independent capability classification`);
  }
  if (request.capability === 'production_data_access') {
    return gate(request, 'denied', 'production data access is prohibited in a local adaptive trial');
  }
  if (request.enforcement !== 'hard_enforced') {
    return gate(request, 'need_evidence', `${request.actionId} is not protected by a verified hard gate`);
  }
  if (request.evidenceRefs.length === 0) {
    return gate(request, 'need_evidence', `${request.actionId} lacks independently resolvable gate evidence`);
  }
  if (request.authority === 'unknown') {
    return gate(request, 'need_evidence', `${request.actionId} authority applicability is unknown`);
  }
  if (request.authority === 'missing') {
    return gate(request, 'need_authority', `${request.actionId} requires explicit authority before execution`);
  }
  return gate(request, 'satisfied', `${request.actionId} is covered by independent gate evidence`);
}

function gate(request: SopCapabilityRequest, disposition: SopActionGate['disposition'], reason: string): SopActionGate {
  return {
    actionId: request.actionId,
    capability: request.capability,
    stage: request.stage,
    disposition,
    reason,
    evidenceRefs: request.evidenceRefs,
  };
}

function productionDataGate(): SopActionGate {
  return {
    actionId: 'task-production-data-scope',
    capability: 'production_data_access',
    stage: 'before_execution',
    disposition: 'denied',
    reason: 'production user data is outside the local-trial boundary',
    evidenceRefs: [],
  };
}

function deny(
  episodeId: string,
  envelopeFingerprint: string,
  strategyMayContinue: boolean,
  actionGates: readonly SopActionGate[],
  invariant: string,
  recovery: 'replan' | 'stop_adaptive' | 'operator',
): SopAdmissionDecision {
  return {
    schemaVersion: SOP_ADMISSION_DECISION_SCHEMA_VERSION,
    status: 'deny',
    episodeId,
    envelopeFingerprint,
    strategyMayContinue,
    actionGates: [...actionGates],
    invariant,
    recovery,
  };
}

export function fingerprintAdaptiveSopPlan(planInput: unknown): string {
  const plan = parseAdaptiveSopPlan(planInput);
  const normalizedPlan = {
    ...plan,
    repositoryFacts: {
      ...plan.repositoryFacts,
      changedFiles: plan.repositoryFacts.changedFiles ? [...plan.repositoryFacts.changedFiles].sort() : undefined,
    },
  };
  return createHash('sha256').update(canonicalJson(normalizedPlan)).digest('hex');
}

function buildEnvelopeFingerprint(plan: AdaptiveSopPlan, facts: SopAdmissionFacts): string {
  const { observedAt: _observedAt, ...stableFacts } = facts;
  const normalizedFacts = {
    ...stableFacts,
    repository: {
      ...stableFacts.repository,
      changedFiles:
        stableFacts.repository.changedFiles === 'unknown' ? 'unknown' : [...stableFacts.repository.changedFiles].sort(),
    },
  };
  return createHash('sha256')
    .update(canonicalJson({ planFingerprint: fingerprintAdaptiveSopPlan(plan), facts: normalizedFacts }))
    .digest('hex');
}

function evaluateCapabilityCoverage(
  plan: AdaptiveSopPlan,
  facts: SopAdmissionFacts,
): {
  actionGates: SopActionGate[];
  evidenceNeeds: Array<{ path: string; message: string }>;
} {
  const actionGates: SopActionGate[] = [];
  const evidenceNeeds: Array<{ path: string; message: string }> = [];
  if (facts.planFingerprint === 'unknown') {
    actionGates.push({
      actionId: 'plan-fingerprint',
      capability: 'unclassified_action',
      stage: 'before_execution',
      disposition: 'need_evidence',
      reason: 'capability facts are not bound to the current plan fingerprint',
      evidenceRefs: [],
    });
  }
  const plannedActionIds = new Set(plan.executionOrder);
  const resolutionByActionId = new Map(
    facts.capabilityResolution.actions.map((resolution) => [resolution.actionId, resolution]),
  );
  collectPlannedActionCoverage(plan, facts, resolutionByActionId, actionGates, evidenceNeeds);
  collectUndeclaredActionCoverage(facts, plannedActionIds, actionGates, evidenceNeeds);
  collectRequiredCapabilityGaps(facts, actionGates, evidenceNeeds);
  collectCapabilityResolutionMismatches(facts, evidenceNeeds);

  return { actionGates, evidenceNeeds };
}

function collectPlannedActionCoverage(
  plan: AdaptiveSopPlan,
  facts: SopAdmissionFacts,
  resolutionByActionId: ReadonlyMap<string, SopAdmissionFacts['capabilityResolution']['actions'][number]>,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  for (const actionId of plan.executionOrder) {
    const resolution = resolutionByActionId.get(actionId);
    collectOneActionCoverage(actionId, resolution, facts, actionGates, evidenceNeeds);
  }
}

function collectOneActionCoverage(
  actionId: string,
  resolution: SopAdmissionFacts['capabilityResolution']['actions'][number] | undefined,
  facts: SopAdmissionFacts,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  if (!resolution) {
    addUnclassifiedCoverageGate(actionId, 'capability resolution is missing', actionGates, evidenceNeeds);
    return;
  }
  if (resolution.classification === 'unknown') {
    addUnclassifiedCoverageGate(actionId, 'capability classification is unresolved', actionGates, evidenceNeeds);
    return;
  }
  if (resolution.classification === 'unrestricted') {
    if (facts.capabilityRequests.some((request) => request.actionId === actionId)) {
      evidenceNeeds.push({
        path: `capabilityResolution.${actionId}`,
        message: `${actionId} is marked unrestricted but has observed capability requests`,
      });
    }
    return;
  }
  for (const capability of resolution.capabilities) {
    collectResolvedCapabilityCoverage(actionId, capability, facts, actionGates, evidenceNeeds);
  }
}

function collectResolvedCapabilityCoverage(
  actionId: string,
  capability: SopCapability,
  facts: SopAdmissionFacts,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  const observed = facts.capabilityRequests.some(
    (request) => request.actionId === actionId && request.capability === capability,
  );
  if (observed) return;
  const message = `${actionId} lacks independently observed policy facts for ${capability}`;
  actionGates.push({
    actionId,
    capability,
    stage: 'before_execution',
    disposition: 'need_evidence',
    reason: message,
    evidenceRefs: [],
  });
  evidenceNeeds.push({ path: `capabilityRequests.${actionId}.${capability}`, message });
}

function collectUndeclaredActionCoverage(
  facts: SopAdmissionFacts,
  plannedActionIds: ReadonlySet<string>,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  for (const resolution of facts.capabilityResolution.actions) {
    if (!plannedActionIds.has(resolution.actionId)) {
      addUnclassifiedCoverageGate(
        resolution.actionId,
        'independent capability resolution found an undeclared plan action',
        actionGates,
        evidenceNeeds,
      );
    }
  }
}

function collectRequiredCapabilityGaps(
  facts: SopAdmissionFacts,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  for (const capability of facts.capabilityResolution.requiredCapabilitiesMissing) {
    addUnclassifiedCoverageGate(
      `required-capability:${capability}`,
      `trusted task evidence requires ${capability}, but no plan action covers it`,
      actionGates,
      evidenceNeeds,
    );
  }
}

function collectCapabilityResolutionMismatches(
  facts: SopAdmissionFacts,
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  const resolvedKeys = new Set(
    facts.capabilityResolution.actions.flatMap((resolution) =>
      resolution.classification === 'resolved'
        ? resolution.capabilities.map((capability) => capabilityKey(resolution.actionId, capability))
        : [],
    ),
  );
  for (const request of facts.capabilityRequests) {
    if (!resolvedKeys.has(capabilityKey(request.actionId, request.capability))) {
      evidenceNeeds.push({
        path: `capabilityResolution.${request.actionId}.${request.capability}`,
        message: `${request.actionId}:${request.capability} is observed but absent from capability resolution`,
      });
    }
  }
}

function addUnclassifiedCoverageGate(
  actionId: string,
  reason: string,
  actionGates: SopActionGate[],
  evidenceNeeds: Array<{ path: string; message: string }>,
): void {
  actionGates.push({
    actionId,
    capability: 'unclassified_action',
    stage: 'before_execution',
    disposition: 'need_evidence',
    reason,
    evidenceRefs: [],
  });
  evidenceNeeds.push({ path: `capabilityResolution.${actionId}`, message: reason });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readFact(facts: SopAdmissionFacts, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), facts);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function capabilityKey(actionId: string, capability: SopCapability): string {
  return `${actionId}:${capability}`;
}

function factContractError(
  code: 'unsupported_schema_version' | 'invalid_contract',
  receivedVersion: string | undefined,
  issues: readonly string[],
): AdaptiveSopContractError {
  return new AdaptiveSopContractError({
    code,
    contract: 'SopAdmissionFacts',
    supportedVersion: SOP_ADMISSION_FACTS_SCHEMA_VERSION,
    receivedVersion,
    issues,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
