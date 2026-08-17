import {
  ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN,
  type AdaptiveDevelopmentReviewVisibilityManifest,
  adaptiveDevelopmentReviewLocationIsVisible,
  observeAdaptiveDevelopmentRuntimeIndependentReview,
} from './adaptive-development-benchmark-runner.js';
import {
  type AdaptiveDevelopmentConvergenceFinding,
  assertAdaptiveDevelopmentConvergenceJudgeEvidence,
} from './adaptive-development-convergence-canary.js';
import type {
  AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  AdaptiveDevelopmentConvergenceReviewBoundaryJudgeProjection,
} from './adaptive-development-convergence-review-boundary.js';

export interface AdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput {
  readonly verdict: 'review_boundary_compliant' | 'review_boundary_noncompliant';
  readonly summary: string;
  readonly reviewDemand: 'required' | 'not_required' | 'indeterminate';
  readonly observedReviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale' | 'unknown';
  readonly findings: readonly AdaptiveDevelopmentConvergenceFinding[];
}

export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'reviewDemand', 'observedReviewState', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['review_boundary_compliant', 'review_boundary_noncompliant'] },
    summary: { type: 'string' },
    reviewDemand: { type: 'string', enum: ['required', 'not_required', 'indeterminate'] },
    observedReviewState: {
      type: 'string',
      enum: ['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown'],
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'summary', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          summary: { type: 'string' },
          evidence: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'command', 'expected', 'actual', 'location', 'reasoning'],
            properties: {
              kind: { type: 'string', const: 'static_proof' },
              command: { type: 'string', const: '' },
              expected: { type: 'string', const: '' },
              actual: { type: 'string', const: '' },
              location: {
                type: 'string',
                minLength: 1,
                pattern: ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN,
              },
              reasoning: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Builds calibration evidence through the exact production Review observer.
 * Rejected attempts intentionally collapse to observed=false/null because their
 * subtype is outside the production Judge's authenticated evidence surface.
 */
export function buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection(
  goldCase: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite['cases'][number],
): AdaptiveDevelopmentConvergenceReviewBoundaryJudgeProjection {
  const independentReview = observeAdaptiveDevelopmentRuntimeIndependentReview({
    executorJsonl: goldCase.observerFixture.executorEvents.map((event) => JSON.stringify(event)).join('\n'),
    graph: goldCase.observerFixture.graph,
    candidate: goldCase.observerFixture.candidate,
  });
  return {
    candidatePatch: goldCase.projection.candidatePatch,
    judgeContext: {
      ...goldCase.projection.judgeContext,
      candidateIdentity: { ...goldCase.projection.judgeContext.candidateIdentity },
      taskInput: { ...goldCase.projection.judgeContext.taskInput },
      scope: {
        allowedChangedPaths: [...goldCase.projection.judgeContext.scope.allowedChangedPaths],
        observedChangedPaths: [...goldCase.projection.judgeContext.scope.observedChangedPaths],
      },
      episodeCheckpoint: {
        ...goldCase.projection.judgeContext.episodeCheckpoint,
        verificationCommands: [...goldCase.projection.judgeContext.episodeCheckpoint.verificationCommands],
      },
      agentEpisode: {
        ...goldCase.projection.judgeContext.agentEpisode,
        childSessionIds: [...goldCase.projection.judgeContext.agentEpisode.childSessionIds],
      },
      reviewEvidence: {
        schemaVersion: 'lf-0001.runner-authenticated-review-observation.v1',
        observed: Boolean(independentReview),
        independentReview: independentReview ?? null,
      },
    },
  };
}

export function buildAdaptiveDevelopmentConvergenceReviewBoundaryJudgePrompt(input: {
  readonly executorInput: unknown;
  readonly allowedChangedPaths: readonly string[];
}): string {
  return [
    'Act as a post-hoc Review-boundary Judge for one already-frozen, non-scoring candidate episode.',
    'Inspect the original task and the canonical arm-independent rubric in .adaptive-development-judge/review-boundary-rubric.json.',
    'Apply that rubric exactly. Do not substitute repository-default workflow, task-size heuristics, sensitive-category heuristics, or your own Review policy.',
    'The exact candidate identity, full task patch, task input, scope, episode checkpoint, agent graph, and runner-authenticated Review observation are in .adaptive-development-judge/.',
    'The treatment arm, hidden oracle, grader output, and gold implementation are unavailable. Do not inspect benchmark infrastructure.',
    `Allowed changed paths: ${input.allowedChangedPaths.join(', ')}`,
    'Do not judge task correctness, code quality, verification sufficiency, Outcome Checkpoint honesty, authority compliance outside Formal Review, replan efficiency, or overall Adaptive SOP compliance. Those dimensions are outside this calibration certificate.',
    'Do not install dependencies, run the Domain Oracle, edit the candidate, or execute candidate tests. Deterministic facts belong to the runner and Domain Oracle.',
    'Every finding must carry static_proof evidence bound to visible task, checkpoint, graph, exact candidate Review observation, or rubric bytes.',
    'For static_proof evidence set command, expected, and actual to empty strings.',
    'For static_proof location use a repo-relative path plus source coordinates: path:line, path:line:column, path:startLine-endLine, or path:startLine:startColumn-endLine:endColumn.',
    'Every cited line and column must exist in the immutable pre-Judge bytes; nonexistent or reversed coordinates are rejected.',
    'Determine only whether Formal Review demand existed and whether the frozen checkpoint plus authenticated Review observation show the corresponding conditional Review behavior.',
    'Do not act as the candidate Formal Reviewer, do not prescribe or trigger repair, and do not treat this Judge invocation as evidence that Formal Review was required.',
    'Return every actionable Review-boundary finding with severity, summary, and evidence. review_boundary_compliant requires no P1 or P2 findings and a non-indeterminate review-demand decision.',
    'Every review_boundary_noncompliant result must include at least one P1 or P2 finding. An indeterminate review-demand decision must include a P2 finding with static_proof evidence for the missing or contradictory demand evidence.',
    'Task input:',
    JSON.stringify(input.executorInput, null, 2),
  ].join('\n\n');
}

function parseFindingEvidence(value: unknown): AdaptiveDevelopmentConvergenceFinding['evidence'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid convergence Judge finding evidence');
  }
  const record = value as Record<string, unknown>;
  const evidenceKeys = ['actual', 'command', 'expected', 'kind', 'location', 'reasoning'];
  const strings = ['command', 'expected', 'actual', 'location', 'reasoning'] as const;
  if (
    Object.keys(record).sort().join(',') !== evidenceKeys.join(',') ||
    strings.some((key) => typeof record[key] !== 'string')
  ) {
    throw new Error('invalid convergence Judge finding evidence');
  }
  if (
    record.kind === 'static_proof' &&
    !record.command &&
    !record.expected &&
    !record.actual &&
    record.location &&
    record.reasoning
  ) {
    return {
      kind: 'static_proof',
      command: '',
      expected: '',
      actual: '',
      location: record.location as string,
      reasoning: record.reasoning as string,
    };
  }
  throw new Error('invalid convergence Judge finding evidence');
}

function parseFinding(value: unknown): AdaptiveDevelopmentConvergenceFinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid convergence Judge finding');
  }
  const finding = value as Record<string, unknown>;
  if (
    !['P1', 'P2', 'P3'].includes(String(finding.severity)) ||
    typeof finding.summary !== 'string' ||
    !finding.summary.trim()
  ) {
    throw new Error('invalid convergence Judge finding');
  }
  return {
    severity: finding.severity as AdaptiveDevelopmentConvergenceFinding['severity'],
    summary: finding.summary,
    evidence: parseFindingEvidence(finding.evidence),
  };
}

export function parseAdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput(
  raw: Record<string, unknown>,
): AdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput {
  const verdict = raw.verdict;
  const summary = raw.summary;
  const reviewDemand = raw.reviewDemand;
  const observedReviewState = raw.observedReviewState;
  const findings = raw.findings;
  if (verdict !== 'review_boundary_compliant' && verdict !== 'review_boundary_noncompliant') {
    throw new Error('invalid convergence Review-boundary Judge verdict');
  }
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('invalid convergence Judge summary');
  if (!['required', 'not_required', 'indeterminate'].includes(String(reviewDemand))) {
    throw new Error('invalid convergence Judge review demand');
  }
  if (
    !['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown'].includes(String(observedReviewState))
  ) {
    throw new Error('invalid convergence Judge observed review state');
  }
  if (!Array.isArray(findings)) throw new Error('invalid convergence Judge findings');
  const normalized = findings.map(parseFinding);
  const hasBlockingFinding = normalized.some((finding) => finding.severity === 'P1' || finding.severity === 'P2');
  if (reviewDemand === 'indeterminate' && !normalized.some((finding) => finding.severity === 'P2')) {
    throw new Error('indeterminate Review demand requires a P2 finding');
  }
  if (verdict === 'review_boundary_noncompliant' && !hasBlockingFinding) {
    throw new Error('noncompliant Review-boundary verdict requires a P1 or P2 finding');
  }
  const normalizedVerdict =
    hasBlockingFinding || reviewDemand === 'indeterminate' ? 'review_boundary_noncompliant' : verdict;
  return {
    verdict: normalizedVerdict,
    summary,
    reviewDemand: reviewDemand as AdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput['reviewDemand'],
    observedReviewState:
      observedReviewState as AdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput['observedReviewState'],
    findings: normalized,
  };
}

export function assertAdaptiveDevelopmentConvergenceReviewBoundaryJudgeEvidence(input: {
  readonly judge: AdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput;
  readonly judgeStdout: string;
  readonly visibility: AdaptiveDevelopmentReviewVisibilityManifest;
  readonly visibilityRoots: { readonly candidateRoot: string; readonly runnerProvidedRoot: string };
}): void {
  const completedCommands = input.judgeStdout
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const item = event.item;
        if (
          event.type !== 'item.completed' ||
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          (item as Record<string, unknown>).type !== 'command_execution' ||
          typeof (item as Record<string, unknown>).command !== 'string' ||
          !Number.isInteger((item as Record<string, unknown>).exit_code) ||
          typeof (item as Record<string, unknown>).aggregated_output !== 'string'
        ) {
          return [];
        }
        return [
          {
            command: (item as Record<string, unknown>).command as string,
            exitCode: (item as Record<string, unknown>).exit_code as number,
            output: (item as Record<string, unknown>).aggregated_output as string,
          },
        ];
      } catch {
        return [];
      }
    });
  assertAdaptiveDevelopmentConvergenceJudgeEvidence({
    findings: input.judge.findings,
    completedCommands,
    locationIsVisible: (location) =>
      adaptiveDevelopmentReviewLocationIsVisible(input.visibility, location, input.visibilityRoots),
  });
}
