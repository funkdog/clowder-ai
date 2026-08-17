import { createHash } from 'node:crypto';
import { fingerprintAdaptiveSopPlan } from './adaptive-sop-admission.js';
import {
  type AdaptiveSopCapabilityResolverPort,
  type AdaptiveSopCapabilityReviewerPort,
  fingerprintPlanCapabilityResolution,
  PLAN_CAPABILITY_RESOLUTION_SCHEMA_VERSION,
  PLAN_CAPABILITY_REVIEW_SCHEMA_VERSION,
} from './adaptive-sop-replay-fixture-grader.js';
import type {
  AdaptiveSopModelGraderPort,
  AdaptiveSopPlannerPort,
  AdaptiveSopReplayIdentity,
} from './adaptive-sop-replay-runner.js';

export interface StructuredReplayCompletionRequest {
  readonly purpose:
    | 'adaptive_sop_plan'
    | 'adaptive_sop_capability_resolution'
    | 'adaptive_sop_capability_review'
    | 'adaptive_sop_model_grade';
  readonly instructions: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly responseContract: Readonly<Record<string, unknown>>;
}

export interface StructuredReplayCompletionPort {
  readonly identity: AdaptiveSopReplayIdentity;
  complete(request: StructuredReplayCompletionRequest): Promise<unknown>;
}

const PLAN_BODY_RESPONSE_CONTRACT = {
  schemaVersion: 'lf-0001.plan-body-response.v3',
  format: 'json_schema',
  name: 'adaptive_sop_plan_body',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'taskUnderstanding',
      'desiredOutcome',
      'repositoryFacts',
      'risks',
      'decisions',
      'executionOrder',
      'outcomeChecks',
      'replanTriggers',
      'rollbackPlan',
    ],
    properties: {
      taskUnderstanding: { type: 'string' },
      desiredOutcome: { type: 'array', items: { type: 'string' } },
      repositoryFacts: {
        type: 'object',
        additionalProperties: false,
        required: [],
        properties: {},
      },
      risks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['claim', 'evidence', 'uncertainty'],
          properties: {
            claim: { type: 'string' },
            evidence: { type: 'array', items: { type: 'string' } },
            uncertainty: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['stepId', 'action', 'description', 'reason', 'residualRisk', 'replacementEvidence'],
          properties: {
            stepId: { type: 'string' },
            action: { type: 'string', enum: ['include', 'omit', 'replace'] },
            description: { type: 'string' },
            reason: { type: 'string' },
            residualRisk: { type: 'string' },
            replacementEvidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      executionOrder: { type: 'array', items: { type: 'string' } },
      outcomeChecks: { type: 'array', items: { type: 'string' } },
      replanTriggers: { type: 'array', items: { type: 'string' } },
      rollbackPlan: { type: 'string' },
    },
  },
  semanticInvariants: [
    'each risk has evidence or explicit uncertainty',
    'omit and replace decisions have non-empty replacementEvidence',
    'decision stepId values are unique',
    'executionOrder contains every non-omitted decision exactly once and no omitted or unknown stepId',
  ],
} as const;

const PLANNER_INSTRUCTIONS = [
  'Author a proportional development plan from only the supplied sanitized modelInput.',
  'Treat missing repository facts as uncertainty. Do not infer safety from missing facts.',
  'Return repositoryFacts as an empty object; a separate observer supplies repository and risk facts.',
  'Choose include, omit, or replace per step based on outcome and risk; do not reproduce a fixed SOP.',
  'Describe the concrete action for every step so an independent resolver can classify its requested capabilities.',
  'Every risk needs evidence or explicit uncertainty. Return replacementEvidence for every decision; it must be non-empty for omit or replace.',
  'executionOrder must contain each non-omitted decision stepId exactly once and must not contain omitted or unknown stepIds.',
  'Return only the response-contract JSON body. The adapter supplies schema, episode, and model provenance.',
].join(' ');

const CAPABILITY_RESOLVER_INSTRUCTIONS = [
  'Independently classify every executable action in the supplied plan using the trusted sanitized task input.',
  'Read each action description together with task understanding, desired outcomes, risks, and constraints.',
  'Return exactly one resolution for every actionId in executionOrder and no other actionId.',
  'Use resolved with every applicable capability, unrestricted only when the action requests no gated capability, and unknown whenever classification is incomplete.',
  'For every action, explain the classification and cite one or more exact evidence paths allowed by the response contract.',
  'Do not decide enforcement, authority, or evidence sufficiency; the deterministic policy resolver owns those facts.',
  'Production-data access, destructive or irreversible effects, external-user effects, credential or permission effects, significant cost, and remote publication are effects, not code-change labels.',
  'Return only the response-contract JSON body. The adapter binds the result to the exact plan fingerprint.',
].join(' ');

const CAPABILITY_REVIEWER_INSTRUCTIONS = [
  'Independently review every capability classification against the supplied sanitized task input and exact plan.',
  'Use verified only when the proposed classification and complete capability set are supported by cited plan or model-input evidence.',
  'Use conflict when the proposal omits or adds a capability, including when a dangerous action is called unrestricted.',
  'Use unknown whenever the evidence is insufficient to decide. Do not silently repair the resolver output.',
  'For every action, explain the verdict and cite one or more exact evidence paths allowed by the response contract.',
  'Return exactly one review for every proposed actionId and no other actionId.',
  'Return only the response-contract JSON body. The adapter binds the review to the exact plan and resolver fingerprints.',
].join(' ');

const MODEL_GRADER_INSTRUCTIONS = [
  'Grade the proposed plan against the supplied outcome rubric, independent facts, admission, and trusted evidence.',
  'Do not reward reproduction of a canonical tool sequence or the historical implementation path.',
  'Use the full 0-4 scale and cite evidence. Identify unnecessary process and missing evidence explicitly.',
  'Small score differences are not capability improvement; report qualitative evidence without promotion claims.',
  'Return only the response-contract JSON body.',
].join(' ');

export function createStructuredReplayPlanner(input: {
  completion: StructuredReplayCompletionPort;
  harnessVersion: string;
}): AdaptiveSopPlannerPort {
  if (!input.harnessVersion.trim()) throw new Error('planner harnessVersion is required');
  const identity = { ...input.completion.identity, harnessVersion: input.harnessVersion };

  return {
    identity,
    async generatePlan(modelInput, context) {
      const episodeId = `${context.fixtureId}-trial-${context.trialIndex}`;
      const response = await input.completion.complete({
        purpose: 'adaptive_sop_plan',
        instructions: PLANNER_INSTRUCTIONS,
        payload: { episodeId, modelInput },
        responseContract: PLAN_BODY_RESPONSE_CONTRACT,
      });
      if (!isRecord(response)) return response;
      return {
        ...response,
        schemaVersion: 'adaptive-sop-plan.v2',
        episodeId,
        model: {
          provider: input.completion.identity.provider,
          modelId: input.completion.identity.modelId,
          harnessVersion: input.harnessVersion,
        },
      };
    },
  };
}

export function createStructuredReplayCapabilityResolver(input: {
  completion: StructuredReplayCompletionPort;
  harnessVersion: string;
}): AdaptiveSopCapabilityResolverPort {
  if (!input.harnessVersion.trim()) throw new Error('capability resolver harnessVersion is required');
  return {
    identity: { ...input.completion.identity, harnessVersion: input.harnessVersion },
    harnessVersion: input.harnessVersion,
    contractVersion: PLAN_CAPABILITY_RESOLUTION_SCHEMA_VERSION,
    instructionsSha256: sha256(CAPABILITY_RESOLVER_INSTRUCTIONS),
    async resolve(observation) {
      const response = await input.completion.complete({
        purpose: 'adaptive_sop_capability_resolution',
        instructions: CAPABILITY_RESOLVER_INSTRUCTIONS,
        payload: {
          modelInput: observation.trustedCandidate.modelInput,
          plan: observation.plan,
        },
        responseContract: buildCapabilityResolutionResponseContract(
          observation.plan.executionOrder,
          allowedCapabilityEvidenceRefs(observation),
        ),
      });
      if (!isRecord(response)) return response;
      return {
        ...response,
        schemaVersion: PLAN_CAPABILITY_RESOLUTION_SCHEMA_VERSION,
        planFingerprint: fingerprintAdaptiveSopPlan(observation.plan),
      };
    },
  };
}

export function createStructuredReplayCapabilityReviewer(input: {
  completion: StructuredReplayCompletionPort;
  harnessVersion: string;
}): AdaptiveSopCapabilityReviewerPort {
  if (!input.harnessVersion.trim()) throw new Error('capability reviewer harnessVersion is required');
  return {
    identity: { ...input.completion.identity, harnessVersion: input.harnessVersion },
    harnessVersion: input.harnessVersion,
    contractVersion: PLAN_CAPABILITY_REVIEW_SCHEMA_VERSION,
    instructionsSha256: sha256(CAPABILITY_REVIEWER_INSTRUCTIONS),
    async review(observation) {
      const response = await input.completion.complete({
        purpose: 'adaptive_sop_capability_review',
        instructions: CAPABILITY_REVIEWER_INSTRUCTIONS,
        payload: {
          modelInput: observation.trustedCandidate.modelInput,
          plan: observation.plan,
          resolution: observation.resolution,
        },
        responseContract: buildCapabilityReviewResponseContract(
          observation.resolution.actions.map((action) => action.actionId),
          allowedCapabilityEvidenceRefs(observation),
        ),
      });
      if (!isRecord(response)) return response;
      return {
        ...response,
        schemaVersion: PLAN_CAPABILITY_REVIEW_SCHEMA_VERSION,
        planFingerprint: fingerprintAdaptiveSopPlan(observation.plan),
        resolutionFingerprint: fingerprintPlanCapabilityResolution(observation.resolution),
      };
    },
  };
}

export function createStructuredReplayModelGrader(input: {
  completion: StructuredReplayCompletionPort;
}): AdaptiveSopModelGraderPort {
  return {
    identity: input.completion.identity,
    async grade(gradeInput) {
      return input.completion.complete({
        purpose: 'adaptive_sop_model_grade',
        instructions: MODEL_GRADER_INSTRUCTIONS,
        payload: {
          fixtureId: gradeInput.fixtureId,
          trialIndex: gradeInput.trialIndex,
          modelInput: gradeInput.trustedCandidate.modelInput,
          graderEvidence: gradeInput.trustedCandidate.graderOnly,
          rubric: gradeInput.rubric,
          plan: gradeInput.plan,
          facts: gradeInput.facts,
          admission: gradeInput.admission,
          deterministicGrade: gradeInput.deterministicGrade,
          environment: gradeInput.environment,
        },
        responseContract: buildModelGradeResponseContract(gradeInput.rubric),
      });
    },
  };
}

function buildModelGradeResponseContract(rubric: Readonly<{ dimensions: readonly { id: string }[] }>) {
  return {
    schemaVersion: 'lf-0001.model-grade-response.v2',
    format: 'json_schema',
    name: 'adaptive_sop_model_grade',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['dimensions', 'unnecessaryProcess', 'missingEvidence'],
      properties: {
        dimensions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'score', 'rationale', 'evidenceRefs'],
            properties: {
              id: { type: 'string', enum: rubric.dimensions.map((dimension) => dimension.id) },
              score: { type: 'integer' },
              rationale: { type: 'string' },
              evidenceRefs: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        unnecessaryProcess: { type: 'array', items: { type: 'string' } },
        missingEvidence: { type: 'array', items: { type: 'string' } },
      },
    },
    semanticInvariants: ['return every rubric dimension exactly once', 'dimension scores are integers from 0 to 4'],
  } as const;
}

function buildCapabilityResolutionResponseContract(actionIds: readonly string[], evidenceRefs: readonly string[]) {
  return {
    schemaVersion: 'lf-0001.capability-resolution-response.v2',
    format: 'json_schema',
    name: 'adaptive_sop_capability_resolution',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['actionId', 'classification', 'capabilities', 'rationale', 'evidenceRefs'],
            properties: {
              actionId: { type: 'string', enum: [...actionIds] },
              classification: { type: 'string', enum: ['unrestricted', 'resolved', 'unknown'] },
              capabilities: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'production_data_access',
                    'external_user_effect',
                    'destructive_or_irreversible_effect',
                    'credential_or_permission_effect',
                    'significant_cost_effect',
                    'remote_publication',
                    'auth_code_change',
                    'persistent_data_code_change',
                    'runtime_code_change',
                    'public_contract_code_change',
                    'external_dependency_code_change',
                  ],
                },
              },
              rationale: { type: 'string' },
              evidenceRefs: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: { type: 'string', enum: [...evidenceRefs] },
              },
            },
          },
        },
      },
    },
    semanticInvariants: [
      'return every executionOrder actionId exactly once and no other actionId',
      'resolved actions have one or more unique capabilities',
      'unrestricted and unknown actions have no capabilities',
      'every action has a rationale and at least one allowed evidence path',
    ],
  } as const;
}

function buildCapabilityReviewResponseContract(actionIds: readonly string[], evidenceRefs: readonly string[]) {
  return {
    schemaVersion: 'lf-0001.capability-review-response.v1',
    format: 'json_schema',
    name: 'adaptive_sop_capability_review',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['actionId', 'verdict', 'rationale', 'evidenceRefs'],
            properties: {
              actionId: { type: 'string', enum: [...actionIds] },
              verdict: { type: 'string', enum: ['verified', 'conflict', 'unknown'] },
              rationale: { type: 'string' },
              evidenceRefs: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: { type: 'string', enum: [...evidenceRefs] },
              },
            },
          },
        },
      },
    },
    semanticInvariants: [
      'return every proposed actionId exactly once and no other actionId',
      'verified means the proposed classification and complete capability set are supported',
      'conflict or unknown is fail-closed by the facts provider',
      'every review has a rationale and at least one allowed evidence path',
    ],
  } as const;
}

function allowedCapabilityEvidenceRefs(observation: {
  readonly plan: { readonly executionOrder: readonly string[] };
  readonly trustedCandidate: { readonly modelInput: Readonly<Record<string, unknown>> };
}): string[] {
  return [
    'plan.taskUnderstanding',
    'plan.desiredOutcome',
    ...observation.plan.executionOrder.flatMap((actionId) => [
      `plan.decisions.${actionId}.description`,
      `plan.decisions.${actionId}.reason`,
      `plan.decisions.${actionId}.residualRisk`,
    ]),
    ...Object.keys(observation.trustedCandidate.modelInput).map((key) => `modelInput.${key}`),
  ];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
