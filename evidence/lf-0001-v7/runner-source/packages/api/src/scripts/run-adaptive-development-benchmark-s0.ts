#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statfsSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, homedir, platform, release, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRedisClient, getDefaultRedisConfig, type RedisClient } from '@cat-cafe/shared/utils';
import { RedisMessageStore } from '../domains/cats/services/stores/redis/RedisMessageStore.js';
import {
  ADAPTIVE_DEVELOPMENT_BENCHMARK_EVIDENCE_VERSION,
  ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_RESULT_VERSION,
  ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_SCOPE_VERSION,
  type AdaptiveDevelopmentBenchmarkEvidence,
  type AdaptiveDevelopmentBenchmarkLaunchPlan,
  type AdaptiveDevelopmentBenchmarkLaunchScope,
  type AdaptiveDevelopmentBenchmarkManifest,
  type AdaptiveDevelopmentBenchmarkReceipt,
  type AdaptiveDevelopmentStageAdmissionBinding,
  adaptiveDevelopmentBenchmarkLaunchScope,
  buildAdaptiveDevelopmentBenchmarkLaunchPlan,
  buildAdaptiveDevelopmentBenchmarkLaunchScope,
  fingerprintAdaptiveDevelopmentBenchmark,
  fingerprintAdaptiveDevelopmentStageAdmissionCandidate,
  parseAdaptiveDevelopmentBenchmarkLaunchPlan,
  parseAdaptiveDevelopmentBenchmarkManifest,
  parseAdaptiveDevelopmentBenchmarkReceipt,
  validateAdaptiveDevelopmentStageAdmission,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import { evaluateAdaptiveDevelopmentBenchmark } from '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-evaluator.js';
import {
  type AdaptiveDevelopmentBenchmarkExecutionRecord,
  RedisAdaptiveDevelopmentBenchmarkExecutionStore,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-execution-store.js';
import {
  ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
  ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION,
  ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT,
  type AdaptiveDevelopmentCarrierReadinessReceipt,
  type AdaptiveDevelopmentCodexAgentGraphObservation,
  type AdaptiveDevelopmentCodexCarrierSmokeResult,
  type AdaptiveDevelopmentCodexInvocation,
  type AdaptiveDevelopmentDirectoryStorageGuard,
  type AdaptiveDevelopmentOperatorApprovalAuthority,
  type AdaptiveDevelopmentOperatorApprovalResolver,
  type AdaptiveDevelopmentProcessContainerRole,
  AdaptiveDevelopmentProcessInterruptedError,
  type AdaptiveDevelopmentProcessResult,
  type AdaptiveDevelopmentStageAttemptReservation,
  adaptiveDevelopmentCodexTelemetryIsSuccessful,
  adaptiveDevelopmentProcessContainerCapabilities,
  adaptiveDevelopmentProviderTransportCertificatePaths,
  adaptiveDevelopmentStageAdmissionActiveDirectory,
  adaptiveDevelopmentToolTemporaryDirectory,
  assertAdaptiveDevelopmentCarrierReadinessReceipt,
  assertAdaptiveDevelopmentCodexDoctorProviderTransport,
  assertAdaptiveDevelopmentReviewVisibilityIntegrity,
  attachAdaptiveDevelopmentBenchmarkArtifacts,
  buildAdaptiveDevelopmentBenchmarkCommitInvocation,
  buildAdaptiveDevelopmentCodexDoctorInvocation,
  buildAdaptiveDevelopmentCodexInvocation,
  buildAdaptiveDevelopmentCodexProcessContainerProfile,
  buildAdaptiveDevelopmentCodexSandboxProbeInvocation,
  buildAdaptiveDevelopmentDirectoryStorageGuard,
  buildAdaptiveDevelopmentLocalToolEnvironment,
  buildAdaptiveDevelopmentOperatorApprovalAuthority,
  buildAdaptiveDevelopmentOracleEnvironment,
  buildAdaptiveDevelopmentProviderTransportTrustBundle,
  buildAdaptiveDevelopmentReviewVisibilityManifest,
  cloneAdaptiveDevelopmentOracleSnapshot as cloneAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard,
  installAdaptiveDevelopmentProcessSignalHandlers,
  installAdaptiveDevelopmentStageAdmissionProcessRecovery,
  materializeAdaptiveDevelopmentOracleSnapshot as materializeAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard,
  measureAdaptiveDevelopmentDirectoryFootprintBytes,
  observeAdaptiveDevelopmentCodexAgentGraph,
  observeAdaptiveDevelopmentRuntimeIndependentReview,
  parseAdaptiveDevelopmentCodexTelemetry,
  readAdaptiveDevelopmentStructuredOutput,
  reserveAdaptiveDevelopmentInitialStageAttempts,
  reserveAdaptiveDevelopmentRetryStageAttempt,
  runAdaptiveDevelopmentCodexAgentGraphCarrierSmoke,
  runAdaptiveDevelopmentCodexCarrierSmoke,
  runAdaptiveDevelopmentPostModelEnvironmentIsolationProbe,
  runAdaptiveDevelopmentPostModelNetworkProbe,
  runAdaptiveDevelopmentPostModelPhaseIsolationProbe,
  runAdaptiveDevelopmentPostModelProcessIsolationProbe,
  runAdaptiveDevelopmentPostModelWorkspaceWriteProbe,
  runAdaptiveDevelopmentProcess as runAdaptiveDevelopmentProcessWithoutStorageGuard,
  runAdaptiveDevelopmentSystemResolverSocketProbe,
  sanitizeAdaptiveDevelopmentReviewWorkspace,
  sanitizeAdaptiveDevelopmentRuntimeSnapshot,
  verifyAdaptiveDevelopmentOperatorApproval,
  verifyAdaptiveDevelopmentOperatorDirective,
  writeAdaptiveDevelopmentCodexDoctorDiagnosticReport,
  writeAdaptiveDevelopmentProcessLogs,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js';
import {
  LocalAdaptiveDevelopmentBenchmarkArtifactStore,
  LocalAdaptiveDevelopmentBenchmarkEvidenceStore,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-store.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION,
  type AdaptiveDevelopmentConvergenceCanaryPlan,
  type AdaptiveDevelopmentConvergenceCanaryReceipt,
  type AdaptiveDevelopmentConvergenceCanaryUsage,
  type AdaptiveDevelopmentConvergenceCandidate,
  type AdaptiveDevelopmentConvergenceJudgeResult,
  type AdaptiveDevelopmentConvergenceOracleResult,
  type AdaptiveDevelopmentOracleCalibrationCertificate,
  type AdaptiveDevelopmentOracleSpecificityCalibration,
  assertAdaptiveDevelopmentConvergenceCanaryReceipt,
  assertAdaptiveDevelopmentOracleCalibrationCertificate,
  buildAdaptiveDevelopmentConvergenceCanaryDirective,
  buildAdaptiveDevelopmentConvergenceCanaryScope,
  buildAdaptiveDevelopmentOracleCalibrationCertificate,
  deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs,
  deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs,
  deriveAdaptiveDevelopmentConvergenceCandidateEvaluation,
  parseAdaptiveDevelopmentConvergenceCanaryPlan,
  runAdaptiveDevelopmentConvergenceCanary,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js';
import {
  type AdaptiveDevelopmentConvergenceCanaryExecutionRecord,
  RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary-store.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_TRIALS,
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan,
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationClassification,
  type AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial,
  type AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  type AdaptiveDevelopmentConvergenceReviewBoundaryJudgeProjection,
  type AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_JUDGE_OUTPUT_SCHEMA as CONVERGENCE_JUDGE_OUTPUT_SCHEMA,
  assertAdaptiveDevelopmentConvergenceReviewBoundaryJudgeEvidence as assertConvergenceJudgeEvidence,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection,
  buildAdaptiveDevelopmentConvergenceReviewBoundaryJudgePrompt as convergenceReviewBoundaryPrompt,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryJudgeOutput as parseConvergenceJudgeOutput,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary-judge.js';
import {
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
  type AdaptiveDevelopmentOperationalCanaryPlan,
  type AdaptiveDevelopmentOperationalCanaryReceipt,
  assertAdaptiveDevelopmentOperationalCanaryReceipt,
  assertAdaptiveDevelopmentOperationalCanaryReviewerObservation,
  buildAdaptiveDevelopmentOperationalCanaryDirective,
  buildAdaptiveDevelopmentOperationalCanaryScope,
  parseAdaptiveDevelopmentOperationalCanaryPlan,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary.js';
import {
  type AdaptiveDevelopmentOperationalCanaryExecutionRecord,
  RedisAdaptiveDevelopmentOperationalCanaryExecutionStore,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary-store.js';
import {
  type AdaptiveDevelopmentOracleToolchainIdentity,
  type AdaptiveDevelopmentSealedOracleToolchain,
  assertAdaptiveDevelopmentSealedOracleToolchain,
  captureAdaptiveDevelopmentOracleToolchainIdentity,
  fingerprintAdaptiveDevelopmentOracleToolchain,
  readAdaptiveDevelopmentSealedOracleSource,
  sealAdaptiveDevelopmentOracleToolchain,
} from '../infrastructure/harness-eval/adaptive-development/adaptive-development-oracle-toolchain.js';
import { API_INSTANCE_LEASE_KEY } from '../services/ApiInstanceLease.js';

const DEFAULT_STAGE_ID = 's0-measurement-smoke';
const CONVERGENCE_CANARY_STAGE_ID = 's1-long-horizon-directional';
const CARRIER_READINESS_REMINDER_TOKENS = 3_000;
const PRELAUNCH_COMMAND_TIMEOUT_MS = 180_000;
const GIBIBYTE = 1024 ** 3;
const STAGE_ADMISSION_STORAGE_GUARD_INTERVAL_MS = 1_000;
const STAGE_ADMISSION_MINIMUM_FREE_BYTES = 64 * GIBIBYTE;
const STAGE_ADMISSION_MAXIMUM_SAMPLE_BYTES = 16 * GIBIBYTE;
const CONVERGENCE_CANARY_STORAGE_GUARD_INTERVAL_MS = 1_000;
const CONVERGENCE_CANARY_MINIMUM_FREE_BYTES = 64 * GIBIBYTE;
const CONVERGENCE_CANARY_MAXIMUM_FOOTPRINT_BYTES = 16 * GIBIBYTE;
const CONVERGENCE_CANARY_CALIBRATION_WALL_TIME_MS_CAP = 30 * 60 * 1_000;
const CONVERGENCE_CANARY_PREPARATION_WALL_TIME_MS_CAP = 30 * 60 * 1_000;
const CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_WALL_TIME_MS_CAP = 2 * 60 * 60 * 1_000;
const CONVERGENCE_REVIEW_BOUNDARY_RUBRIC_PATH =
  'docs/harness-feedback/benchmarks/adaptive-development-v1/convergence-review-boundary-rubric.json';
const CONVERGENCE_REVIEW_BOUNDARY_GOLD_SUITE_PATH =
  'docs/harness-feedback/benchmarks/adaptive-development-v1/convergence-review-boundary-gold-cases.json';
const CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_EXECUTION_VERSION =
  'lf-0001.development-convergence-review-boundary-calibration-execution.v1' as const;
const CLAIM_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
if redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return 1
`;
const COMPLETE_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;
let activeStageAdmissionStorageGuard: AdaptiveDevelopmentDirectoryStorageGuard | undefined;
let activeConvergenceCanaryStorageGuard: AdaptiveDevelopmentDirectoryStorageGuard | undefined;
const BENCHMARK_GIT_EXECUTABLE = '/Library/Developer/CommandLineTools/usr/bin/git';
const BENCHMARK_COPY_EXECUTABLE = '/bin/cp';
const RUNTIME_ARTIFACT_SOURCES = [
  fileURLToPath(import.meta.url),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-evaluator.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-execution-store.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary-judge.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary-store.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-oracle-toolchain.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary.js',
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      '../infrastructure/harness-eval/adaptive-development/adaptive-development-operational-canary-store.js',
      import.meta.url,
    ),
  ),
] as const;

const CONVERGENCE_REVIEW_BOUNDARY_JUDGE_EVIDENCE_PATHS = [
  '.adaptive-development-judge/candidate-identity.json',
  '.adaptive-development-judge/candidate.patch',
  '.adaptive-development-judge/task-input.json',
  '.adaptive-development-judge/scope.json',
  '.adaptive-development-judge/episode-checkpoint.json',
  '.adaptive-development-judge/agent-episode.json',
  '.adaptive-development-judge/review-evidence.json',
  '.adaptive-development-judge/review-boundary-rubric.json',
] as const;

const EXECUTOR_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claimed', 'summary', 'verificationCommands', 'reviewIntent', 'reviewState', 'reviewUnit'],
  properties: {
    claimed: { type: 'string', enum: ['achieved', 'not_achieved', 'deferred'] },
    summary: { type: 'string' },
    verificationCommands: { type: 'array', items: { type: 'string' } },
    reviewIntent: { type: 'string', enum: ['local_result', 'formal_review', 'delivery'] },
    reviewState: { type: 'string', enum: ['pending', 'in_review', 'changes_requested', 'reviewed', 'stale'] },
    reviewUnit: { type: 'string' },
  },
} as const;

const SOP_JUDGE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'reviewDemand', 'observedReviewState', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['sop_compliant', 'sop_noncompliant'] },
    summary: { type: 'string' },
    reviewDemand: { type: 'string', enum: ['required', 'not_required', 'indeterminate'] },
    observedReviewState: {
      type: 'string',
      enum: ['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown'],
    },
    findings: {
      type: 'object',
      additionalProperties: false,
      required: ['p1', 'p2', 'p3'],
      properties: {
        p1: { type: 'integer', minimum: 0 },
        p2: { type: 'integer', minimum: 0 },
        p3: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

interface CliArgs {
  readonly mode:
    | 'admit'
    | 'prepare-canary'
    | 'canary'
    | 'prepare-review-boundary-calibration'
    | 'review-boundary-calibration'
    | 'prepare-convergence-canary'
    | 'convergence-canary'
    | 'prepare'
    | 'live'
    | 'fixture';
  readonly repositoryRoot: string;
  readonly outputRoot?: string;
  readonly launchPlanPath?: string;
  readonly canaryPlanPath?: string;
  readonly convergenceCanaryPlanPath?: string;
  readonly reviewBoundaryCalibrationPlanPath?: string;
  readonly reviewBoundaryCalibrationCertificatePath?: string;
  readonly fixtureCommand?: string;
  readonly admissionResultPath?: string;
  readonly stageId: string;
}

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
  readonly timedOut: boolean;
}

interface ProcessContainerBoundary {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
}

interface OracleResult {
  readonly passed: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly expectedExitCode: number;
    readonly actualExitCode: number;
    readonly elapsedMs: number;
  }[];
}

type OraclePhaseId = string;

interface OraclePhaseRuntime {
  readonly worktree: string;
  readonly boundary: ProcessContainerBoundary;
  readonly assertFrozen: () => Promise<void>;
  readonly dispose: () => void;
}

interface RunAttemptResult {
  readonly receipt: AdaptiveDevelopmentBenchmarkReceipt;
  readonly infrastructureError: boolean;
  readonly stopStage: boolean;
}

interface CostTelemetry {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  readonly behavioralFailedToolCalls: number;
  readonly infrastructureFailedToolCalls: number;
  readonly usageComplete: boolean;
  readonly accountedSessionIds: readonly string[];
}

interface StructuredExecutorOutput {
  readonly claimed: 'achieved' | 'not_achieved' | 'deferred';
  readonly summary: string;
  readonly verificationCommands: readonly string[];
  readonly reviewIntent: 'local_result' | 'formal_review' | 'delivery';
  readonly reviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale';
  readonly reviewUnit: string;
}

interface StructuredSopJudgeOutput {
  readonly verdict: 'sop_compliant' | 'sop_noncompliant';
  readonly summary: string;
  readonly reviewDemand: 'required' | 'not_required' | 'indeterminate';
  readonly observedReviewState: 'pending' | 'in_review' | 'changes_requested' | 'reviewed' | 'stale' | 'unknown';
  readonly findings: { readonly p1: number; readonly p2: number; readonly p3: number };
}

function candidatePatchSha256(patch: string): string {
  return createHash('sha256').update(patch).digest('hex');
}

type ValueOptionName =
  | '--repository-root'
  | '--output-root'
  | '--launch-plan'
  | '--canary-plan'
  | '--convergence-canary-plan'
  | '--review-boundary-calibration-plan'
  | '--review-boundary-calibration-certificate'
  | '--fixture-command'
  | '--admission-result'
  | '--stage-id';

interface MutableCliArgs {
  mode?: CliArgs['mode'];
  repositoryRoot: string;
  outputRoot?: string;
  launchPlanPath?: string;
  canaryPlanPath?: string;
  convergenceCanaryPlanPath?: string;
  reviewBoundaryCalibrationPlanPath?: string;
  reviewBoundaryCalibrationCertificatePath?: string;
  fixtureCommand?: string;
  admissionResultPath?: string;
  stageId?: string;
}

const VALUE_OPTION_NAMES: readonly ValueOptionName[] = [
  '--repository-root',
  '--output-root',
  '--launch-plan',
  '--canary-plan',
  '--convergence-canary-plan',
  '--review-boundary-calibration-plan',
  '--review-boundary-calibration-certificate',
  '--fixture-command',
  '--admission-result',
  '--stage-id',
];

function parseArgs(argv: readonly string[]): CliArgs {
  const values: MutableCliArgs = {
    repositoryRoot: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const mode = modeForArgument(arg);
    if (mode) {
      setMode(values, mode);
      continue;
    }
    const option = readValueOption(argv, index);
    applyValueOption(values, option.name, option.value);
    index = option.nextIndex;
  }
  const mode = requireCliMode(values.mode);
  validateCliModeOptions(mode, values);
  return {
    mode,
    repositoryRoot: resolve(values.repositoryRoot),
    ...(values.outputRoot ? { outputRoot: resolve(values.outputRoot) } : {}),
    ...(values.launchPlanPath ? { launchPlanPath: resolve(values.launchPlanPath) } : {}),
    ...(values.canaryPlanPath ? { canaryPlanPath: resolve(values.canaryPlanPath) } : {}),
    ...(values.convergenceCanaryPlanPath
      ? { convergenceCanaryPlanPath: resolve(values.convergenceCanaryPlanPath) }
      : {}),
    ...(values.reviewBoundaryCalibrationPlanPath
      ? { reviewBoundaryCalibrationPlanPath: resolve(values.reviewBoundaryCalibrationPlanPath) }
      : {}),
    ...(values.reviewBoundaryCalibrationCertificatePath
      ? { reviewBoundaryCalibrationCertificatePath: resolve(values.reviewBoundaryCalibrationCertificatePath) }
      : {}),
    ...(values.fixtureCommand ? { fixtureCommand: resolve(values.fixtureCommand) } : {}),
    ...(values.admissionResultPath ? { admissionResultPath: resolve(values.admissionResultPath) } : {}),
    stageId:
      values.stageId ??
      (mode === 'prepare-review-boundary-calibration' ||
      mode === 'review-boundary-calibration' ||
      mode === 'prepare-convergence-canary' ||
      mode === 'convergence-canary'
        ? CONVERGENCE_CANARY_STAGE_ID
        : DEFAULT_STAGE_ID),
  };
}

function requireCliMode(mode: CliArgs['mode'] | undefined): CliArgs['mode'] {
  if (!mode) {
    throw new Error(
      'choose exactly one of --admit-stage, --prepare-canary, --run-canary, --prepare-review-boundary-calibration, --run-review-boundary-calibration, --prepare-convergence-canary, --run-convergence-canary, --prepare-launch, --run-live, or --run-fixture',
    );
  }
  return mode;
}

function validateCliModeOptions(mode: CliArgs['mode'], values: MutableCliArgs): void {
  if (mode === 'canary' && !values.canaryPlanPath) throw new Error('--run-canary requires --canary-plan');
  if (mode === 'convergence-canary' && !values.convergenceCanaryPlanPath) {
    throw new Error('--run-convergence-canary requires --convergence-canary-plan');
  }
  if (mode === 'review-boundary-calibration' && !values.reviewBoundaryCalibrationPlanPath) {
    throw new Error('--run-review-boundary-calibration requires --review-boundary-calibration-plan');
  }
  if (mode === 'prepare-convergence-canary' && !values.reviewBoundaryCalibrationCertificatePath) {
    throw new Error('--prepare-convergence-canary requires --review-boundary-calibration-certificate');
  }
  if ((mode === 'prepare' || mode === 'live') && !values.canaryPlanPath) {
    throw new Error(`${mode === 'prepare' ? '--prepare-launch' : '--run-live'} requires --canary-plan`);
  }
  if (mode === 'live' && !values.launchPlanPath) throw new Error('--run-live requires --launch-plan');
  if (mode === 'fixture' && !values.fixtureCommand) throw new Error('--run-fixture requires --fixture-command');
}

function modeForArgument(arg: string): CliArgs['mode'] | undefined {
  if (arg === '--admit-stage') return 'admit';
  if (arg === '--prepare-canary') return 'prepare-canary';
  if (arg === '--run-canary') return 'canary';
  if (arg === '--prepare-review-boundary-calibration') return 'prepare-review-boundary-calibration';
  if (arg === '--run-review-boundary-calibration') return 'review-boundary-calibration';
  if (arg === '--prepare-convergence-canary') return 'prepare-convergence-canary';
  if (arg === '--run-convergence-canary') return 'convergence-canary';
  if (arg === '--prepare-launch' || arg === '--preflight-only') return 'prepare';
  if (arg === '--run-live') return 'live';
  if (arg === '--run-fixture') return 'fixture';
  return undefined;
}

function setMode(values: MutableCliArgs, mode: CliArgs['mode']): void {
  if (values.mode && values.mode !== mode) throw new Error('benchmark execution modes are mutually exclusive');
  values.mode = mode;
}

function readValueOption(
  argv: readonly string[],
  index: number,
): {
  readonly name: ValueOptionName;
  readonly value: string;
  readonly nextIndex: number;
} {
  const arg = argv[index];
  const name = VALUE_OPTION_NAMES.find((candidate) => arg === candidate || arg.startsWith(`${candidate}=`));
  if (!name) throw new Error(`unknown argument ${arg}`);
  const inline = arg.startsWith(`${name}=`);
  const value = inline ? arg.slice(name.length + 1) : argv[index + 1];
  if (!value) throw new Error(`missing value for ${name}`);
  return { name, value, nextIndex: inline ? index : index + 1 };
}

function applyValueOption(values: MutableCliArgs, name: ValueOptionName, value: string): void {
  if (name === '--repository-root') values.repositoryRoot = value;
  if (name === '--output-root') values.outputRoot = value;
  if (name === '--launch-plan') values.launchPlanPath = value;
  if (name === '--canary-plan') values.canaryPlanPath = value;
  if (name === '--convergence-canary-plan') values.convergenceCanaryPlanPath = value;
  if (name === '--review-boundary-calibration-plan') values.reviewBoundaryCalibrationPlanPath = value;
  if (name === '--review-boundary-calibration-certificate') values.reviewBoundaryCalibrationCertificatePath = value;
  if (name === '--fixture-command') values.fixtureCommand = value;
  if (name === '--admission-result') values.admissionResultPath = value;
  if (name === '--stage-id') values.stageId = value;
}

function activeAdaptiveDevelopmentStorageGuard(): AdaptiveDevelopmentDirectoryStorageGuard | undefined {
  if (activeStageAdmissionStorageGuard && activeConvergenceCanaryStorageGuard) {
    throw new Error('adaptive development storage guards cannot overlap');
  }
  return activeConvergenceCanaryStorageGuard ?? activeStageAdmissionStorageGuard;
}

class AdaptiveDevelopmentStorageGuardProcessError extends Error {
  constructor(readonly processResult: AdaptiveDevelopmentProcessResult) {
    super(processResult.resourceGuardFailure ?? 'adaptive development process storage guard failed');
    this.name = 'AdaptiveDevelopmentStorageGuardProcessError';
  }
}

async function runAdaptiveDevelopmentProcess(
  invocation: AdaptiveDevelopmentCodexInvocation,
  deadlineEpochMs: number,
): Promise<AdaptiveDevelopmentProcessResult> {
  const activeGuard = activeAdaptiveDevelopmentStorageGuard();
  const guards = [invocation.resourceGuard, activeGuard].filter(
    (guard, index, values): guard is AdaptiveDevelopmentDirectoryStorageGuard =>
      guard !== undefined && values.indexOf(guard) === index,
  );
  const resourceGuard =
    guards.length === 0
      ? undefined
      : {
          intervalMs: Math.min(...guards.map((guard) => guard.intervalMs)),
          check: () => {
            for (const guard of guards) guard.check();
          },
        };
  resourceGuard?.check();
  const result = await runAdaptiveDevelopmentProcessWithoutStorageGuard(
    { ...invocation, ...(resourceGuard ? { resourceGuard } : {}) },
    deadlineEpochMs,
  );
  if (result.resourceGuardFailure) throw new AdaptiveDevelopmentStorageGuardProcessError(result);
  try {
    resourceGuard?.check();
  } catch (error) {
    throw new AdaptiveDevelopmentStorageGuardProcessError({
      ...result,
      resourceGuardFailure: error instanceof Error ? error.message : String(error),
    });
  }
  return result;
}

async function materializeAdaptiveDevelopmentOracleSnapshot(
  input: Parameters<typeof materializeAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard>[0],
): Promise<void> {
  const resourceGuard = activeAdaptiveDevelopmentStorageGuard();
  resourceGuard?.check();
  await materializeAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard({
    ...input,
    ...(resourceGuard ? { resourceGuard } : {}),
  });
  resourceGuard?.check();
}

async function cloneAdaptiveDevelopmentOracleSnapshot(
  input: Parameters<typeof cloneAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard>[0],
): Promise<void> {
  const resourceGuard = activeAdaptiveDevelopmentStorageGuard();
  resourceGuard?.check();
  await cloneAdaptiveDevelopmentOracleSnapshotWithoutStorageGuard({
    ...input,
    ...(resourceGuard ? { resourceGuard } : {}),
  });
  resourceGuard?.check();
}

async function command(
  executable: string,
  args: readonly string[],
  cwd: string,
  deadlineEpochMs: number,
  env: Readonly<NodeJS.ProcessEnv> = {},
): Promise<CommandResult> {
  const result = await runAdaptiveDevelopmentProcess(
    {
      command: executable,
      args,
      cwd,
      prompt: '',
      environmentPolicy: 'inherit-host',
      env,
    },
    deadlineEpochMs,
  );
  return {
    exitCode: result.exitCode ?? (result.timedOut ? 124 : 1),
    stdout: result.stdout,
    stderr: result.stderr,
    elapsedMs: result.elapsedMs,
    timedOut: result.timedOut,
  };
}

async function checkedCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
  deadlineEpochMs: number,
  env: Readonly<NodeJS.ProcessEnv> = {},
): Promise<string> {
  const result = await command(executable, args, cwd, deadlineEpochMs, env);
  if (result.timedOut) throw new AttemptDeadlineExceededError(`${executable} exceeded the attempt deadline`);
  if (result.exitCode !== 0) {
    throw new Error(`${executable} ${args[0] ?? ''} failed: ${tail(result.stderr || result.stdout)}`);
  }
  return result.stdout.trim();
}

async function sandboxedCommand(
  boundary: ProcessContainerBoundary,
  executable: string,
  args: readonly string[],
  deadlineEpochMs: number,
  env: Readonly<NodeJS.ProcessEnv> = {},
): Promise<CommandResult> {
  const invocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
    workingDirectory: boundary.workingDirectory,
    nodeExecutable: boundary.nodeExecutable,
    processContainer: boundary.processContainer,
    command: executable,
    args,
  });
  const result = await runAdaptiveDevelopmentProcess(
    {
      ...invocation,
      env: { ...invocation.env, ...env },
    },
    deadlineEpochMs,
  );
  return {
    exitCode: result.exitCode ?? (result.timedOut ? 124 : 1),
    stdout: result.stdout,
    stderr: result.stderr,
    elapsedMs: result.elapsedMs,
    timedOut: result.timedOut,
  };
}

async function checkedSandboxedCommand(
  boundary: ProcessContainerBoundary,
  executable: string,
  args: readonly string[],
  deadlineEpochMs: number,
  env: Readonly<NodeJS.ProcessEnv> = {},
): Promise<string> {
  const result = await sandboxedCommand(boundary, executable, args, deadlineEpochMs, env);
  if (result.timedOut) throw new AttemptDeadlineExceededError(`${executable} exceeded the attempt deadline`);
  if (result.exitCode !== 0) {
    throw new Error(
      `${executable} ${args[0] ?? ''} failed in process container: ${tail(result.stderr || result.stdout)}`,
    );
  }
  return result.stdout.trim();
}

function hardenedGitArguments(args: readonly string[]): string[] {
  return ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgSign=false', ...args];
}

async function checkedSandboxedGit(
  boundary: ProcessContainerBoundary,
  args: readonly string[],
  deadlineEpochMs: number,
  env: Readonly<NodeJS.ProcessEnv> = {},
): Promise<string> {
  return await checkedSandboxedCommand(
    boundary,
    BENCHMARK_GIT_EXECUTABLE,
    hardenedGitArguments(args),
    deadlineEpochMs,
    env,
  );
}

async function checkedBenchmarkCommit(
  role: Parameters<typeof buildAdaptiveDevelopmentBenchmarkCommitInvocation>[0],
  cwd: string,
  commitArguments: readonly string[],
  deadlineEpochMs: number,
): Promise<string> {
  const invocation = buildAdaptiveDevelopmentBenchmarkCommitInvocation(role, commitArguments);
  return await checkedCommand('git', invocation.args, cwd, deadlineEpochMs, invocation.environment);
}

async function checkedSandboxedBenchmarkCommit(
  boundary: ProcessContainerBoundary,
  role: Parameters<typeof buildAdaptiveDevelopmentBenchmarkCommitInvocation>[0],
  commitArguments: readonly string[],
  deadlineEpochMs: number,
): Promise<string> {
  const invocation = buildAdaptiveDevelopmentBenchmarkCommitInvocation(role, commitArguments);
  return await checkedSandboxedGit(boundary, invocation.args, deadlineEpochMs, invocation.environment);
}

async function probeProviderTrustBundleAccess<T extends 'passed' | 'denied'>(input: {
  readonly boundary: ProcessContainerBoundary;
  readonly trustBundlePath: string;
  readonly expected: T;
  readonly deadlineEpochMs: number;
}): Promise<T> {
  const result = await sandboxedCommand(
    input.boundary,
    input.boundary.nodeExecutable,
    [
      '-e',
      "const fs=require('node:fs');const path=process.argv[1];fs.accessSync(path,fs.constants.R_OK);fs.readFileSync(path);",
      input.trustBundlePath,
    ],
    input.deadlineEpochMs,
  );
  if (input.expected === 'passed' && (result.timedOut || result.exitCode !== 0)) {
    throw new Error('provider-facing process cannot read the exact configured transport trust bundle');
  }
  if (input.expected === 'denied' && !result.timedOut && result.exitCode === 0) {
    throw new Error('post-model process can read the provider transport trust bundle');
  }
  return input.expected;
}

class AttemptDeadlineExceededError extends Error {}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function materializeConvergenceReviewBoundaryJudgeContext(input: {
  readonly workspace: string;
  readonly projection: AdaptiveDevelopmentConvergenceReviewBoundaryJudgeProjection;
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
}): string {
  const judgeContext = join(input.workspace, '.adaptive-development-judge');
  mkdirSync(judgeContext, { recursive: true });
  writeJson(join(judgeContext, 'candidate-identity.json'), input.projection.judgeContext.candidateIdentity);
  writeFileSync(join(judgeContext, 'candidate.patch'), `${input.projection.candidatePatch}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  writeJson(join(judgeContext, 'task-input.json'), input.projection.judgeContext.taskInput);
  writeJson(join(judgeContext, 'scope.json'), input.projection.judgeContext.scope);
  writeJson(join(judgeContext, 'episode-checkpoint.json'), input.projection.judgeContext.episodeCheckpoint);
  writeJson(join(judgeContext, 'agent-episode.json'), input.projection.judgeContext.agentEpisode);
  writeJson(join(judgeContext, 'review-evidence.json'), input.projection.judgeContext.reviewEvidence);
  writeJson(join(judgeContext, 'review-boundary-rubric.json'), input.rubric);
  return judgeContext;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function tail(value: string): string {
  return value.length <= 2_000 ? value : value.slice(-2_000);
}

async function buildEnvironment(
  repositoryRoot: string,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  stageId: string,
  oracleToolchain: AdaptiveDevelopmentOracleToolchainIdentity,
  approvalAuthority?: AdaptiveDevelopmentOperatorApprovalAuthority,
  executionProfile: 'benchmark' | 'convergence_canary' = 'benchmark',
) {
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${stageId}`);
  const deadline = Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS;
  const [runnerCommit, codexExecutable, pnpmVersion, nodeExecutable] = await Promise.all([
    checkedCommand('git', ['rev-parse', 'HEAD'], repositoryRoot, deadline),
    resolveTrustedExecutable('codex', repositoryRoot, deadline),
    checkedCommand('pnpm', ['--version'], repositoryRoot, deadline),
    resolveTrustedExecutable('node', repositoryRoot, deadline),
  ]);
  const codexNativeExecutable = await resolveTrustedExecutablePath(
    codexNativeExecutablePath(codexExecutable.path),
    repositoryRoot,
    deadline,
  );
  const modelCatalog = await buildBenchmarkModelCatalog(
    codexExecutable,
    manifest.model.modelId,
    repositoryRoot,
    deadline,
  );
  const providerCertificatePaths = adaptiveDevelopmentProviderTransportCertificatePaths();
  const providerTransportTrustBundle = buildAdaptiveDevelopmentProviderTransportTrustBundle();
  return {
    schemaVersion: 'lf-0001.adaptive-development-benchmark-environment.v4',
    runnerCommit,
    runtimeCommit: manifest.runtimeCommit,
    nodeVersion: process.version,
    pnpmVersion,
    codexExecutable,
    codexNativeExecutable,
    nodeExecutable,
    providerTransportTrustBundleSha256: createHash('sha256').update(providerTransportTrustBundle).digest('hex'),
    runtimeArtifacts: [...RUNTIME_ARTIFACT_SOURCES, ...providerCertificatePaths].map((path) => ({
      path: realpathSync(path),
      sha256: sha256File(path),
    })),
    oracleToolchain,
    approvalAuthority: approvalAuthority ?? null,
    modelCatalog,
    operatingSystem: { platform: platform(), arch: arch(), release: release() },
    lockfileSha256: sha256File(join(repositoryRoot, 'pnpm-lock.yaml')),
    model: manifest.model,
    isolation: {
      ephemeralSession: true,
      ignoreUserConfig: true,
      sandbox: 'macos-seatbelt-anonymous-workspace-process-container',
      networkAccess: true,
      modelSessionExternalNetworkAccess: true,
      modelSessionControlPlaneNetworkAccess: false,
      postModelNetworkAccess: false,
      postModelNestedSandbox: false,
      postModelFreezeWorkspaceAccess: 'write',
      postModelOracleWorkspaceAccess: 'read',
      oracleSnapshotFromFinalSha: true,
      oraclePhaseSnapshotsIndependent: true,
      oraclePhaseTemporaryStateShared: false,
      oracleDependenciesRebuiltAfterModel: true,
      dependencyImportMethod: 'copy',
      standaloneSingleCommitRepository: true,
      sourceHistoryVisibleToExecutor: false,
      sourceWorkspaceVisibleToExecutor: false,
      anonymousPhysicalPaths: true,
      builtinShellTools: true,
      modelFacingMcpServers: false,
      candidateExecutionMode: 'natural_agent_graph',
      candidateAgentCollaboration: true,
      evaluationExecutionMode: 'single_agent',
      offlineDependencyInstall: true,
      blindFreshReviewSession: true,
    },
    budgets: {
      stageId,
      tokenPolicy: 'unbounded',
      wallTimeMsCap: stage.wallTimeMsCap,
      maximumInfrastructureRetryAttempts: executionProfile === 'convergence_canary' ? 0 : 1,
    },
  };
}

function activeApiInstanceIdentity(raw: string | null): string {
  if (!raw) throw new Error('trusted Cat Café runtime has no active API instance lease');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('trusted Cat Café API instance lease is invalid');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('token' in parsed) ||
    typeof parsed.token !== 'string' ||
    parsed.token.length === 0 ||
    !('instanceId' in parsed) ||
    typeof parsed.instanceId !== 'string' ||
    parsed.instanceId.length === 0 ||
    !('pid' in parsed) ||
    typeof parsed.pid !== 'number' ||
    !Number.isInteger(parsed.pid) ||
    parsed.pid <= 0 ||
    !('hostname' in parsed) ||
    typeof parsed.hostname !== 'string' ||
    parsed.hostname.length === 0 ||
    !('apiPort' in parsed) ||
    typeof parsed.apiPort !== 'number' ||
    !Number.isInteger(parsed.apiPort) ||
    parsed.apiPort <= 0 ||
    !('cwd' in parsed) ||
    typeof parsed.cwd !== 'string' ||
    parsed.cwd.length === 0 ||
    !('startedAt' in parsed) ||
    typeof parsed.startedAt !== 'number' ||
    !Number.isInteger(parsed.startedAt) ||
    parsed.startedAt <= 0
  ) {
    throw new Error('trusted Cat Café API instance lease is invalid');
  }
  return fingerprintAdaptiveDevelopmentBenchmark({
    version: parsed.version,
    token: parsed.token,
    instanceId: parsed.instanceId,
    pid: parsed.pid,
    hostname: parsed.hostname,
    apiPort: parsed.apiPort,
    cwd: parsed.cwd,
    startedAt: parsed.startedAt,
  });
}

function reviewedMessageStoreConfig(): { readonly url: string; readonly keyPrefix: string } {
  const config = getDefaultRedisConfig();
  if (
    config.url !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisUrl ||
    config.keyPrefix !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisKeyPrefix
  ) {
    throw new Error('benchmark runner is not using the reviewed Cat Café runtime configuration');
  }
  return {
    url: config.url,
    keyPrefix: config.keyPrefix,
  };
}

async function resolveOperatorApprovalAuthority(
  redis: Pick<RedisClient, 'get' | 'pttl'>,
): Promise<AdaptiveDevelopmentOperatorApprovalAuthority> {
  const config = reviewedMessageStoreConfig();
  const [rawLease, leaseTtlMs] = await Promise.all([
    redis.get(API_INSTANCE_LEASE_KEY),
    redis.pttl(API_INSTANCE_LEASE_KEY),
  ]);
  if (leaseTtlMs <= 0) throw new Error('trusted Cat Café API instance lease is not active');
  return buildAdaptiveDevelopmentOperatorApprovalAuthority({
    redisUrl: config.url,
    redisKeyPrefix: config.keyPrefix,
    runtimeInstanceIdentitySha256: activeApiInstanceIdentity(rawLease),
  });
}

async function connectApprovalAuthority(): Promise<{
  readonly redis: RedisClient;
  readonly authority: AdaptiveDevelopmentOperatorApprovalAuthority;
}> {
  const config = reviewedMessageStoreConfig();
  const redis = createRedisClient(config);
  try {
    await redis.ping();
    return { redis, authority: await resolveOperatorApprovalAuthority(redis) };
  } catch (error) {
    await redis.quit().catch(() => {});
    throw error;
  }
}

async function readOperatorApprovalAuthority(): Promise<AdaptiveDevelopmentOperatorApprovalAuthority> {
  const connection = await connectApprovalAuthority();
  try {
    return connection.authority;
  } finally {
    await connection.redis.quit().catch(() => {});
  }
}

interface TrustedExecutableIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly version: string;
}

interface BenchmarkModelCatalog {
  readonly models: readonly Readonly<Record<string, unknown>>[];
}

interface CarrierReadinessArtifact {
  readonly path: string;
  readonly sha256: string;
}

async function resolveTrustedExecutable(
  name: string,
  cwd: string,
  deadlineEpochMs: number,
): Promise<TrustedExecutableIdentity> {
  const located = await checkedCommand('/usr/bin/which', [name], cwd, deadlineEpochMs);
  const path = realpathSync(located);
  const version = await checkedCommand(path, ['--version'], cwd, deadlineEpochMs);
  return { path, sha256: sha256File(path), version };
}

async function resolveTrustedExecutablePath(
  executablePath: string,
  cwd: string,
  deadlineEpochMs: number,
): Promise<TrustedExecutableIdentity> {
  const path = realpathSync(executablePath);
  const version = await checkedCommand(path, ['--version'], cwd, deadlineEpochMs);
  return { path, sha256: sha256File(path), version };
}

function codexNativeExecutablePath(codexExecutablePath: string): string {
  if (platform() !== 'darwin') throw new Error('S0 process containment currently requires macOS');
  const target = arch() === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  const platformPackage = arch() === 'arm64' ? 'codex-darwin-arm64' : 'codex-darwin-x64';
  return join(
    dirname(dirname(codexExecutablePath)),
    'node_modules',
    '@openai',
    platformPackage,
    'vendor',
    target,
    'bin',
    'codex',
  );
}

async function assertTrustedExecutable(
  identity: TrustedExecutableIdentity,
  cwd: string,
  deadlineEpochMs: number,
): Promise<void> {
  if (realpathSync(identity.path) !== identity.path) throw new Error('trusted executable realpath changed');
  if (sha256File(identity.path) !== identity.sha256) throw new Error('trusted executable hash changed');
  const version = await checkedCommand(identity.path, ['--version'], cwd, deadlineEpochMs);
  if (version !== identity.version) throw new Error('trusted executable version changed');
}

async function buildBenchmarkModelCatalog(
  codexExecutable: TrustedExecutableIdentity,
  modelId: string,
  cwd: string,
  deadlineEpochMs: number,
): Promise<BenchmarkModelCatalog> {
  const raw = JSON.parse(
    await checkedCommand(codexExecutable.path, ['debug', 'models', '--bundled'], cwd, deadlineEpochMs),
  ) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray((raw as { models?: unknown }).models)) {
    throw new Error('trusted Codex returned an invalid bundled model catalog');
  }
  const model = (raw as { models: unknown[] }).models.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      (candidate as { slug?: unknown }).slug === modelId,
  );
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error(`trusted Codex bundled catalog does not contain ${modelId}`);
  }
  const multiAgentVersion = (model as { multi_agent_version?: unknown }).multi_agent_version;
  if (multiAgentVersion !== 'v1' && multiAgentVersion !== 'v2') {
    throw new Error(`trusted Codex model ${modelId} does not declare a supported multi-agent execution version`);
  }
  return {
    models: [
      {
        ...(structuredClone(model) as Record<string, unknown>),
        apply_patch_tool_type: 'freeform',
        web_search_tool_type: 'text',
        supports_search_tool: false,
        experimental_supported_tools: [],
      },
    ],
  };
}

function assertRuntimeArtifacts(artifacts: readonly { readonly path: string; readonly sha256: string }[]): void {
  for (const artifact of artifacts) {
    if (realpathSync(artifact.path) !== artifact.path || sha256File(artifact.path) !== artifact.sha256) {
      throw new Error(`benchmark runtime artifact changed after launch authorization: ${artifact.path}`);
    }
  }
}

async function assertCleanTrackedTree(repositoryRoot: string, action = 'live benchmark'): Promise<void> {
  const status = await checkedCommand(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=no'],
    repositoryRoot,
    Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS,
  );
  if (status) throw new Error(`${action} requires a clean tracked tree at the exact runner commit`);
}

function materializeBenchmarkSessionRuntime(input: {
  readonly runDirectory: string;
  role: AdaptiveDevelopmentProcessContainerRole;
  readonly instanceId?: string;
  readonly workingDirectory: string;
  readonly sessionExecutable: string;
  readonly codexNativeExecutable?: string;
  readonly codexAuthPath?: string;
  readonly codexConfigPath?: string;
  readonly nodeExecutable: string;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly writeProtectedPaths?: readonly string[];
}): {
  readonly controlDirectory: string;
  readonly codexHome: string;
  readonly credentialSourcePath?: string;
  readonly modelCatalogPath: string;
  readonly providerTransportTrustPath: string;
  readonly processContainer: { readonly sandboxExecutable: string; readonly sandboxProfilePath: string };
} {
  if (input.instanceId && !/^[a-z0-9-]+$/.test(input.instanceId)) {
    throw new Error(`benchmark session runtime instance is invalid: ${input.instanceId}`);
  }
  const controlDirectory = join(
    input.runDirectory,
    `${input.role}${input.instanceId ? `-${input.instanceId}` : ''}-control`,
  );
  const codexHome = join(controlDirectory, 'codex-home');
  const modelCatalogPath = join(controlDirectory, 'model-catalog.json');
  const providerTransportTrustPath = join(input.runDirectory, 'provider-transport-ca.pem');
  const sandboxProfilePath = join(controlDirectory, 'codex-container.sb');
  const toolTemporaryDirectory = join(controlDirectory, 'tool-tmp');
  const capabilities = adaptiveDevelopmentProcessContainerCapabilities(input.role);
  mkdirSync(join(codexHome, 'tmp'), { recursive: true });
  mkdirSync(toolTemporaryDirectory, { recursive: true });
  writeJson(modelCatalogPath, input.modelCatalog);
  const providerTransportTrustBundle = buildAdaptiveDevelopmentProviderTransportTrustBundle();
  if (existsSync(providerTransportTrustPath)) {
    if (readFileSync(providerTransportTrustPath, 'utf8') !== providerTransportTrustBundle) {
      throw new Error('provider transport trust bundle changed within one benchmark run');
    }
  } else {
    writeFileSync(providerTransportTrustPath, providerTransportTrustBundle, { encoding: 'utf8', flag: 'wx' });
  }
  writeFileSync(
    sandboxProfilePath,
    buildAdaptiveDevelopmentCodexProcessContainerProfile({
      workingDirectory: input.workingDirectory,
      controlDirectory,
      codexExecutable: input.sessionExecutable,
      nodeExecutable: input.nodeExecutable,
      codexStateDirectory: codexHome,
      ...(input.codexNativeExecutable && input.codexAuthPath
        ? {
            codexCredentialReaderExecutable: input.codexNativeExecutable,
            codexAuthPath: input.codexAuthPath,
            ...(input.codexConfigPath ? { codexConfigPath: input.codexConfigPath } : {}),
          }
        : {}),
      providerCertificatePaths: capabilities.allowNetwork ? [providerTransportTrustPath] : [],
      ...(input.writeProtectedPaths ? { writeProtectedPaths: input.writeProtectedPaths } : {}),
      ...capabilities,
    }),
    { encoding: 'utf8', flag: 'wx' },
  );
  return {
    controlDirectory,
    codexHome,
    ...(input.codexAuthPath ? { credentialSourcePath: input.codexAuthPath } : {}),
    modelCatalogPath,
    providerTransportTrustPath,
    processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
  };
}

async function withBenchmarkSessionCredential<T>(
  runtime: { readonly codexHome: string; readonly credentialSourcePath?: string },
  action: () => Promise<T>,
): Promise<T> {
  if (!runtime.credentialSourcePath) return await action();
  const credentialLinkPath = join(runtime.codexHome, 'auth.json');
  if (existsSync(credentialLinkPath)) {
    throw new Error('benchmark session credential link must be absent before the authorized action');
  }
  symlinkSync(runtime.credentialSourcePath, credentialLinkPath);
  try {
    return await action();
  } finally {
    if (existsSync(credentialLinkPath)) unlinkSync(credentialLinkPath);
  }
}

function benchmarkSessionCredentialInput(input: {
  readonly fixtureCommand?: string;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
}): {
  readonly codexNativeExecutable?: string;
  readonly codexAuthPath?: string;
} {
  if (input.fixtureCommand) return {};
  return {
    codexNativeExecutable: input.codexNativeExecutable.path,
    codexAuthPath: join(homedir(), '.codex', 'auth.json'),
  };
}

async function assertBenchmarkModelCatalogAccepted(input: {
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly modelCatalogPath: string;
  readonly workingDirectory: string;
  readonly modelId: string;
  readonly deadlineEpochMs: number;
}): Promise<void> {
  await checkedCommand(
    input.codexExecutable.path,
    [
      'debug',
      'prompt-input',
      '--disable',
      'remote_models',
      '--config',
      `model_catalog_json=${JSON.stringify(input.modelCatalogPath)}`,
      '--config',
      `model=${JSON.stringify(input.modelId)}`,
      'benchmark catalog validation',
    ],
    input.workingDirectory,
    input.deadlineEpochMs,
  );
}

function taskFocusedCheck(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  nodeExecutable: string,
): { readonly command: string; readonly args: readonly string[] } | undefined {
  if (task.id === 'local-stale-formatter-regression') {
    return {
      command: nodeExecutable,
      args: ['--test', 'packages/api/test/telegram-html-formatter.test.js'],
    };
  }
  if (task.id === 'local-pwa-reconnect-input') {
    return {
      command: nodeExecutable,
      args: ['--test', 'packages/web/test/next-config.test.cjs'],
    };
  }
  return undefined;
}

function focusedSandboxCheckInput(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  nodeExecutable: string,
  baselineOracle: OracleResult,
): {
  readonly focusedCheck?: { readonly command: string; readonly args: readonly string[] };
  readonly focusedCheckExitCode?: number;
} {
  const focusedCheck = taskFocusedCheck(task, nodeExecutable);
  if (!focusedCheck) return {};
  return { focusedCheck, focusedCheckExitCode: baselineOracle.checks[0]?.actualExitCode };
}

async function assertLocalToolSandbox(input: {
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly repositoryRoot: string;
  readonly workingDirectory: string;
  readonly filesystemAccess: 'write' | 'read';
  readonly processContainer: { readonly sandboxExecutable: string; readonly sandboxProfilePath: string };
  readonly readableProbePath: string;
  readonly deniedWriteProbePath?: string;
  readonly deniedCredentialPath?: string;
  readonly focusedCheck?: { readonly command: string; readonly args: readonly string[] };
  readonly focusedCheckExitCode?: number;
  readonly deadlineEpochMs: number;
}): Promise<void> {
  const siblingProbePath = `/private/tmp/lf0001-denied-${randomUUID()}.txt`;
  const writableProbePath = join(input.workingDirectory, '.benchmark-write-probe');
  const gitMetadataProbePath = join(input.workingDirectory, '.git', '.benchmark-write-probe');
  mkdirSync(adaptiveDevelopmentToolTemporaryDirectory(input), { recursive: true });
  writeFileSync(siblingProbePath, 'denied probe\n', { encoding: 'utf8', flag: 'wx' });
  const runProbe = async (
    command: string,
    args: readonly string[],
  ): Promise<Awaited<ReturnType<typeof runAdaptiveDevelopmentProcess>>> =>
    await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable.path,
        processContainer: input.processContainer,
        command,
        args,
      }),
      input.deadlineEpochMs,
    );
  const assertProbe = async (
    label: string,
    expectedSuccess: boolean,
    command: string,
    args: readonly string[],
  ): Promise<void> => {
    const result = await runProbe(command, args);
    if (result.timedOut) throw new AttemptDeadlineExceededError(`${label} sandbox probe timed out`);
    if ((result.exitCode === 0) !== expectedSuccess) {
      throw new Error(
        `${label} sandbox probe ${expectedSuccess ? 'failed' : 'escaped'}: ${tail(result.stderr || result.stdout)}`,
      );
    }
  };
  const assertProbeExitCode = async (
    label: string,
    expectedExitCode: number,
    command: string,
    args: readonly string[],
  ): Promise<void> => {
    const result = await runProbe(command, args);
    if (result.timedOut) throw new AttemptDeadlineExceededError(`${label} sandbox probe timed out`);
    if (result.exitCode !== expectedExitCode || /operation not permitted/i.test(result.stderr)) {
      throw new Error(
        `${label} sandbox probe diverged from baseline exit ${expectedExitCode}: ${tail(result.stderr || result.stdout)}`,
      );
    }
  };
  const readScript = "require('node:fs').readFileSync(process.argv[1]);";
  const listScript = "require('node:fs').readdirSync(process.argv[1]);";
  const writeScript = "require('node:fs').writeFileSync(process.argv[1], 'probe');";
  try {
    await assertProbe('assigned workspace read', true, input.nodeExecutable.path, [
      '-e',
      readScript,
      input.readableProbePath,
    ]);
    await assertProbe('assigned workspace write', input.filesystemAccess === 'write', input.nodeExecutable.path, [
      '-e',
      writeScript,
      writableProbePath,
    ]);
    if (input.deniedWriteProbePath) {
      await assertProbe('write-protected evidence mutation', false, input.nodeExecutable.path, [
        '-e',
        writeScript,
        input.deniedWriteProbePath,
      ]);
    }
    await assertProbe('source repository read', false, input.nodeExecutable.path, [
      '-e',
      readScript,
      join(input.repositoryRoot, 'package.json'),
    ]);
    await assertProbe('workspace parent listing', false, input.nodeExecutable.path, [
      '-e',
      listScript,
      dirname(input.workingDirectory),
    ]);
    await assertProbe('sibling temporary read', false, input.nodeExecutable.path, ['-e', readScript, siblingProbePath]);
    if (input.deniedCredentialPath) {
      await assertProbe('Codex credential read by ordinary child', false, input.nodeExecutable.path, [
        '-e',
        readScript,
        input.deniedCredentialPath,
      ]);
    }
    if (existsSync(join(input.workingDirectory, '.git'))) {
      await assertProbe('Git metadata write by ordinary child', false, input.nodeExecutable.path, [
        '-e',
        writeScript,
        gitMetadataProbePath,
      ]);
    }
    if (input.focusedCheck) {
      await assertProbe('git diff check', true, BENCHMARK_GIT_EXECUTABLE, ['diff', '--check']);
      if (input.focusedCheckExitCode === undefined) throw new Error('focused sandbox check has no baseline exit code');
      await assertProbeExitCode(
        'focused task check',
        input.focusedCheckExitCode,
        input.focusedCheck.command,
        input.focusedCheck.args,
      );
    }
  } finally {
    if (existsSync(writableProbePath)) unlinkSync(writableProbePath);
    if (existsSync(gitMetadataProbePath)) unlinkSync(gitMetadataProbePath);
    unlinkSync(siblingProbePath);
  }
}

async function assertCodexProcessContainerStarts(input: {
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly codexHome: string;
  readonly workingDirectory: string;
  readonly processContainer: { readonly sandboxExecutable: string; readonly sandboxProfilePath: string };
  readonly deadlineEpochMs: number;
}): Promise<void> {
  const withCodexHome = (invocation: ReturnType<typeof buildAdaptiveDevelopmentCodexSandboxProbeInvocation>) => ({
    ...invocation,
    env: { ...invocation.env, CODEX_HOME: input.codexHome },
  });
  const result = await runAdaptiveDevelopmentProcess(
    withCodexHome(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable.path,
        processContainer: input.processContainer,
        command: input.codexExecutable.path,
        args: ['--version'],
      }),
    ),
    input.deadlineEpochMs,
  );
  if (result.timedOut) throw new AttemptDeadlineExceededError('Codex process-container startup probe timed out');
  if (result.exitCode !== 0 || result.stdout.trim() !== input.codexExecutable.version) {
    throw new Error(`Codex process-container startup probe failed: ${tail(result.stderr || result.stdout)}`);
  }
  const loginStatus = await runAdaptiveDevelopmentProcess(
    withCodexHome(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable.path,
        processContainer: input.processContainer,
        command: input.codexExecutable.path,
        args: ['login', 'status'],
      }),
    ),
    input.deadlineEpochMs,
  );
  if (loginStatus.timedOut) throw new AttemptDeadlineExceededError('Codex credential-scope probe timed out');
  if (loginStatus.exitCode !== 0 || !/logged in/i.test(loginStatus.stdout || loginStatus.stderr)) {
    throw new Error(`Codex credential-scope probe failed: ${tail(loginStatus.stderr || loginStatus.stdout)}`);
  }
}

async function assertCodexProcessContainerBoundary(input: {
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly codexStateDirectory: string;
  readonly workingDirectory: string;
  readonly readableProbePath: string;
  readonly deniedReadProbePaths: readonly { readonly label: string; readonly path: string }[];
  readonly deniedListProbePaths: readonly { readonly label: string; readonly path: string }[];
  readonly filesystemAccess: 'write' | 'read';
  readonly processContainer: { readonly sandboxExecutable: string; readonly sandboxProfilePath: string };
  readonly deadlineEpochMs: number;
}): Promise<void> {
  const writableProbePath = join(input.workingDirectory, `.process-container-${input.filesystemAccess}-write-probe`);
  const localToolEnvironment = buildAdaptiveDevelopmentLocalToolEnvironment({
    workingDirectory: input.workingDirectory,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: input.processContainer,
  });
  const environmentArguments = (environment: Readonly<Record<string, string>>): string[] =>
    Object.entries(environment).map(([key, value]) => `${key}=${value}`);
  const runProbe = async (
    command: string,
    args: readonly string[],
    environment: Readonly<Record<string, string>> = {},
  ) =>
    await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable.path,
        processContainer: input.processContainer,
        command: '/usr/bin/env',
        args: ['-i', ...environmentArguments({ ...localToolEnvironment, ...environment }), command, ...args],
      }),
      input.deadlineEpochMs,
    );
  const assertDenied = async (
    label: string,
    command: string,
    args: readonly string[],
    environment: Readonly<Record<string, string>> = {},
  ): Promise<void> => {
    const result = await runProbe(command, args, environment);
    if (result.timedOut) throw new AttemptDeadlineExceededError(`${label} process-container probe timed out`);
    if (result.exitCode === 0) throw new Error(`${label} escaped the Codex process container`);
    if (!/operation not permitted|permission denied/i.test(result.stderr || result.stdout)) {
      throw new Error(`${label} failed without a process-container denial: ${tail(result.stderr || result.stdout)}`);
    }
  };
  try {
    const workspaceRead = await runProbe(input.nodeExecutable.path, [
      '-e',
      "require('node:fs').readFileSync(process.argv[1])",
      input.readableProbePath,
    ]);
    if (workspaceRead.timedOut) {
      throw new AttemptDeadlineExceededError('workspace read process-container probe timed out');
    }
    if (workspaceRead.exitCode !== 0) {
      throw new Error(
        `workspace read process-container probe failed: ${tail(workspaceRead.stderr || workspaceRead.stdout)}`,
      );
    }
    const workspaceWrite = await runProbe(input.nodeExecutable.path, [
      '-e',
      "require('node:fs').writeFileSync(process.argv[1], 'permission-profile-probe')",
      writableProbePath,
    ]);
    if (workspaceWrite.timedOut) {
      throw new AttemptDeadlineExceededError('workspace process-container probe timed out');
    }
    if ((workspaceWrite.exitCode === 0) !== (input.filesystemAccess === 'write')) {
      throw new Error(
        `workspace ${input.filesystemAccess} process-container probe diverged: ${tail(workspaceWrite.stderr || workspaceWrite.stdout)}`,
      );
    }
    for (const probe of input.deniedReadProbePaths) {
      await assertDenied(probe.label, input.nodeExecutable.path, [
        '-e',
        "require('node:fs').readFileSync(process.argv[1])",
        probe.path,
      ]);
    }
    for (const probe of input.deniedListProbePaths) {
      await assertDenied(probe.label, input.nodeExecutable.path, [
        '-e',
        "require('node:fs').readdirSync(process.argv[1])",
        probe.path,
      ]);
    }
    const recursiveLoginArgs = [input.codexNativeExecutable.path, 'login', 'status'];
    const recursiveEnvironment = { CODEX_HOME: input.codexStateDirectory };
    await assertDenied(
      'recursive native Codex login',
      input.codexNativeExecutable.path,
      ['login', 'status'],
      recursiveEnvironment,
    );
    await assertDenied('nested permissive sandbox', '/usr/bin/sandbox-exec', [
      '-p',
      '(version 1)\n(allow default)',
      '/usr/bin/env',
      '-i',
      ...environmentArguments({ ...localToolEnvironment, ...recursiveEnvironment }),
      ...recursiveLoginArgs,
    ]);
  } finally {
    if (existsSync(writableProbePath)) unlinkSync(writableProbePath);
  }
}

async function materializeRunWorktree(
  repositoryRoot: string,
  runDirectory: string,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number],
  deadlineEpochMs: number,
): Promise<{
  readonly worktree: string;
  readonly baselineSha: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
}> {
  const task = manifest.tasks.find((candidate) => candidate.id === launch.taskId);
  if (!task || task.source.kind !== 'local_history' || !task.allowedChangedPaths) {
    throw new Error(`S0 runner only accepts pinned local-history tasks: ${launch.taskId}`);
  }
  const worktree = join(runDirectory, 'sandbox', 'workspace');
  mkdirSync(worktree, { recursive: true });
  const snapshotCommit =
    task.materializationMode === 'full_base_commit' ? task.source.baseCommit : manifest.runtimeCommit;
  await extractGitArchive(repositoryRoot, snapshotCommit, worktree, runDirectory, deadlineEpochMs);
  sanitizeAdaptiveDevelopmentRuntimeSnapshot(worktree);
  writeFileSync(join(runDirectory, 'worktree-path.txt'), `${worktree}\n`, { encoding: 'utf8', flag: 'wx' });
  if (task.materializationMode !== 'full_base_commit') {
    for (const path of task.allowedChangedPaths) {
      await writeGitObject(repositoryRoot, task.source.baseCommit, path, worktree, deadlineEpochMs);
    }
  }
  await writeGitObject(
    repositoryRoot,
    launch.skillSnapshot.commit,
    launch.skillSnapshot.path,
    worktree,
    deadlineEpochMs,
  );
  await checkedCommand('git', ['init', '--initial-branch=benchmark-run'], worktree, deadlineEpochMs);
  const actualSkillBlob = await checkedCommand(
    'git',
    ['hash-object', launch.skillSnapshot.path],
    worktree,
    deadlineEpochMs,
  );
  if (actualSkillBlob !== launch.skillSnapshot.blobObjectId)
    throw new Error(`Skill blob mismatch for ${launch.runKey}`);
  await checkedCommand('git', ['add', '--all', '--force'], worktree, deadlineEpochMs);
  await checkedBenchmarkCommit(
    'runner',
    worktree,
    [
      '-m',
      `benchmark(base): materialize ${task.id}`,
      '-m',
      'Why: bind one history-isolated runtime snapshot, historical task paths, and the exact Skill arm.',
    ],
    deadlineEpochMs,
  );
  const visibleCommitCount = await checkedCommand('git', ['rev-list', '--count', 'HEAD'], worktree, deadlineEpochMs);
  if (visibleCommitCount !== '1') throw new Error(`executor history isolation failed for ${launch.runKey}`);
  const configuredRemotes = await checkedCommand('git', ['remote'], worktree, deadlineEpochMs);
  if (configuredRemotes) throw new Error(`executor repository unexpectedly has a remote for ${launch.runKey}`);
  await checkedCommand(
    'pnpm',
    ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--prod=false', '--package-import-method=copy'],
    worktree,
    deadlineEpochMs,
  );
  const baselineSha = await checkedCommand('git', ['rev-parse', 'HEAD'], worktree, deadlineEpochMs);
  if (task.id === 'local-stale-formatter-regression') {
    await checkedCommand('pnpm', ['--filter', '@cat-cafe/api', 'build'], worktree, deadlineEpochMs);
  }
  await runTaskOracleSetupCommands(task, worktree, deadlineEpochMs);
  mkdirSync(join(dirname(worktree), 'tool-tmp'), { recursive: true });
  return { worktree, baselineSha, task };
}

async function materializePreparedOracleCandidate(input: {
  readonly repositoryRoot: string;
  readonly sourceWorktree: string;
  readonly runDirectory: string;
  readonly finalSha: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly oracleSetId: string;
  readonly deadlineEpochMs: number;
}): Promise<{ readonly directory: string; readonly worktree: string; readonly oracleSnapshotSha: string }> {
  const directory = join(input.runDirectory, 'oracle-sandbox', `${input.oracleSetId}-prepared`);
  const worktree = join(directory, 'workspace');
  try {
    await materializeAdaptiveDevelopmentOracleSnapshot({
      gitExecutable: BENCHMARK_GIT_EXECUTABLE,
      sourceRepository: input.sourceWorktree,
      destination: worktree,
      finalSha: input.finalSha,
      deadlineEpochMs: input.deadlineEpochMs,
    });
    await checkedCommand(
      'pnpm',
      [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--prod=false',
        '--package-import-method=clone',
      ],
      worktree,
      input.deadlineEpochMs,
    );
    if (input.task.id === 'local-stale-formatter-regression') {
      await checkedCommand('pnpm', ['--filter', '@cat-cafe/api', 'build'], worktree, input.deadlineEpochMs);
    }
    await runTaskOracleSetupCommands(input.task, worktree, input.deadlineEpochMs);
    if (input.task.oraclePolicy.hiddenTestPatch) {
      for (const path of input.task.oraclePolicy.hiddenTestPatch.paths) {
        await writeGitObject(
          input.repositoryRoot,
          input.task.oraclePolicy.hiddenTestPatch.commit,
          path,
          worktree,
          input.deadlineEpochMs,
        );
      }
      await checkedCommand(
        'git',
        ['add', '--force', '--', ...input.task.oraclePolicy.hiddenTestPatch.paths],
        worktree,
        input.deadlineEpochMs,
      );
      await checkedBenchmarkCommit(
        'oracle',
        worktree,
        ['--allow-empty', '-m', `benchmark(oracle): bind hidden checks for ${input.task.id}`],
        input.deadlineEpochMs,
      );
    }
    const oracleSnapshotSha = await checkedCommand('git', ['rev-parse', 'HEAD'], worktree, input.deadlineEpochMs);
    return { directory, worktree, oracleSnapshotSha };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function materializeOraclePhaseWorktree(input: {
  readonly preparedWorktree: string;
  readonly runDirectory: string;
  readonly oracleSnapshotSha: string;
  readonly phase: OraclePhaseId;
  readonly deadlineEpochMs: number;
}): Promise<{ readonly directory: string; readonly worktree: string; readonly oracleSnapshotSha: string }> {
  const directory = join(input.runDirectory, 'oracle-sandbox', input.phase);
  const worktree = join(directory, 'workspace');
  try {
    // Each phase gets an independent APFS copy-on-write view; no phase can mutate the prepared candidate or a sibling.
    await cloneAdaptiveDevelopmentOracleSnapshot({
      copyExecutable: BENCHMARK_COPY_EXECUTABLE,
      source: input.preparedWorktree,
      destination: worktree,
      deadlineEpochMs: input.deadlineEpochMs,
    });
    mkdirSync(join(directory, 'tool-tmp'), { recursive: true });
    return { directory, worktree, oracleSnapshotSha: input.oracleSnapshotSha };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function runTaskOracleSetupCommands(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  worktree: string,
  deadlineEpochMs: number,
): Promise<void> {
  for (const setup of task.oraclePolicy.setupCommands ?? []) {
    await checkedCommand('pnpm', setup.args, worktree, deadlineEpochMs);
  }
}

async function extractGitArchive(
  repositoryRoot: string,
  commit: string,
  destination: string,
  runDirectory: string,
  deadlineEpochMs: number,
): Promise<void> {
  const archivePath = join(runDirectory, 'runtime-snapshot.tar');
  await checkedCommand(
    'git',
    ['archive', '--format=tar', '--output', archivePath, commit],
    repositoryRoot,
    deadlineEpochMs,
  );
  await checkedCommand('tar', ['-xf', archivePath, '-C', destination], repositoryRoot, deadlineEpochMs);
}

async function writeGitObject(
  repositoryRoot: string,
  commit: string,
  path: string,
  destinationRoot: string,
  deadlineEpochMs: number,
): Promise<void> {
  const result = await command('git', ['show', `${commit}:${path}`], repositoryRoot, deadlineEpochMs);
  if (result.timedOut) throw new AttemptDeadlineExceededError(`git show exceeded the attempt deadline for ${path}`);
  if (result.exitCode !== 0) throw new Error(`failed to materialize ${path}: ${tail(result.stderr)}`);
  const destination = join(destinationRoot, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, result.stdout, { encoding: 'utf8' });
}

type OracleNodeRunner = (
  phase: OraclePhaseId,
  args: readonly string[],
  env?: Readonly<NodeJS.ProcessEnv>,
  workingDirectory?: string,
) => Promise<CommandResult>;

type RegisteredOracleCheck = NonNullable<
  AdaptiveDevelopmentBenchmarkManifest['tasks'][number]['oraclePolicy']['checks']
>[number];

type RegisteredOracleRunner = (check: RegisteredOracleCheck) => Promise<CommandResult>;

async function runRegisteredOracleChecks(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  checks: NonNullable<AdaptiveDevelopmentBenchmarkManifest['tasks'][number]['oraclePolicy']['checks']>,
  runCheck: RegisteredOracleRunner,
): Promise<OracleResult> {
  const results: OracleResult['checks'][number][] = [];
  for (const check of checks) {
    const result = await runCheck(check);
    if (result.timedOut) throw new AttemptDeadlineExceededError(`${check.id} oracle exceeded the attempt deadline`);
    results.push({
      name: check.id,
      expectedExitCode: task.oraclePolicy.successExitCode,
      actualExitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
    });
  }
  return {
    passed: results.every((check) => check.actualExitCode === check.expectedExitCode),
    checks: results,
  };
}

async function runSmokeOracle(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  runNode: OracleNodeRunner,
): Promise<OracleResult> {
  if (task.id === 'local-stale-formatter-regression') {
    const focused = await runNode('formatter-focused', [
      '--test',
      '--test-isolation=none',
      'packages/api/test/telegram-html-formatter.test.js',
    ]);
    if (focused.timedOut) throw new AttemptDeadlineExceededError('formatter oracle exceeded the attempt deadline');
    return {
      passed: focused.exitCode === task.oraclePolicy.successExitCode,
      checks: [
        {
          name: 'focused-formatter-regression',
          expectedExitCode: task.oraclePolicy.successExitCode,
          actualExitCode: focused.exitCode,
          elapsedMs: focused.elapsedMs,
        },
      ],
    };
  }
  if (task.id !== 'local-pwa-reconnect-input') throw new Error(`unknown benchmark oracle ${task.id}`);
  const focused = await runNode('pwa-focused', [
    '--test',
    '--test-isolation=none',
    'packages/web/test/next-config.test.cjs',
  ]);
  if (focused.timedOut) throw new AttemptDeadlineExceededError('PWA oracle exceeded the attempt deadline');
  const captureScript = [
    "const Module=require('node:module');",
    'let captured;',
    'const original=Module._load;',
    "Module._load=function(request,parent,isMain){if(request==='@ducanh2912/next-pwa')return {default:(options)=>(config)=>{captured=options;return config;}};return original.call(this,request,parent,isMain);};",
    "require(require('node:path').resolve(process.argv[1]));",
    "if(!captured||captured.reloadOnOnline!==false){console.error('reloadOnOnline must be exactly false');process.exit(1);}",
  ].join('');
  const behavior = await runNode('pwa-hidden', ['-e', captureScript, 'packages/web/next.config.js'], {
    NODE_ENV: 'test',
  });
  if (behavior.timedOut) throw new AttemptDeadlineExceededError('PWA behavior oracle exceeded the attempt deadline');
  return {
    passed: focused.exitCode === 0 && behavior.exitCode === 0,
    checks: [
      {
        name: 'focused-next-config-regression',
        expectedExitCode: 0,
        actualExitCode: focused.exitCode,
        elapsedMs: focused.elapsedMs,
      },
      {
        name: 'hidden-reload-on-online-behavior',
        expectedExitCode: 0,
        actualExitCode: behavior.exitCode,
        elapsedMs: behavior.elapsedMs,
      },
    ],
  };
}

async function runOracle(
  task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number],
  oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain,
  deadlineEpochMs: number,
  phaseRuntime: (phase: OraclePhaseId) => Promise<OraclePhaseRuntime>,
): Promise<OracleResult> {
  const runPhase = async (
    phase: OraclePhaseId,
    prepareArgs: (runtime: OraclePhaseRuntime) => Promise<readonly string[]>,
    env: Readonly<NodeJS.ProcessEnv> = {},
    checkWorkingDirectory?: string,
  ): Promise<CommandResult> => {
    const runtime = await phaseRuntime(phase);
    const workingDirectory = checkWorkingDirectory ? join(runtime.worktree, checkWorkingDirectory) : runtime.worktree;
    const checkBoundary = { ...runtime.boundary, workingDirectory };
    try {
      mkdirSync(adaptiveDevelopmentToolTemporaryDirectory(runtime.boundary), { recursive: true });
      await runtime.assertFrozen();
      const args = await prepareArgs(runtime);
      await runtime.assertFrozen();
      return await sandboxedCommand(checkBoundary, checkBoundary.nodeExecutable, args, deadlineEpochMs, {
        ...env,
        ...buildAdaptiveDevelopmentOracleEnvironment(checkBoundary),
      });
    } finally {
      rmSync(adaptiveDevelopmentToolTemporaryDirectory(runtime.boundary), { recursive: true, force: true });
      try {
        await runtime.assertFrozen();
      } finally {
        runtime.dispose();
      }
    }
  };
  const runNode: OracleNodeRunner = async (phase, args, env = {}, checkWorkingDirectory) =>
    await runPhase(phase, async () => args, env, checkWorkingDirectory);
  const runCheck: RegisteredOracleRunner = async (check) => {
    if ('nodeArgs' in check) return await runNode(check.id, check.nodeArgs, {}, check.workingDirectory);
    return await runPhase(
      check.id,
      async (runtime) => await prepareBehaviorBundle(check, runtime, oracleToolchain, deadlineEpochMs),
      {},
      check.workingDirectory,
    );
  };
  return task.oraclePolicy.checks
    ? await runRegisteredOracleChecks(task, task.oraclePolicy.checks, runCheck)
    : await runSmokeOracle(task, runNode);
}

async function prepareBehaviorBundle(
  check: Extract<RegisteredOracleCheck, { behaviorBundle: unknown }>,
  runtime: OraclePhaseRuntime,
  oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain,
  deadlineEpochMs: number,
): Promise<readonly string[]> {
  const toolTemporaryDirectory = adaptiveDevelopmentToolTemporaryDirectory(runtime.boundary);
  const entryPath = join(toolTemporaryDirectory, `${check.id}.tsx`);
  const bundlePath = join(toolTemporaryDirectory, `${check.id}.mjs`);
  const candidateRoot = runtime.worktree.replaceAll('\\', '/').replace(/\/$/, '');
  const source =
    'source' in check.behaviorBundle
      ? check.behaviorBundle.source
      : readAdaptiveDevelopmentSealedOracleSource(oracleToolchain, check.behaviorBundle.sourcePath);
  writeFileSync(entryPath, source.replaceAll('$CANDIDATE_ROOT', candidateRoot));
  assertAdaptiveDevelopmentSealedOracleToolchain(oracleToolchain);
  const esbuildExecutable = oracleToolchain.compilerPath;
  const tsconfigPath = join(runtime.worktree, check.behaviorBundle.tsconfigPath);
  await checkedCommand(
    esbuildExecutable,
    [
      entryPath,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundlePath}`,
      `--tsconfig=${tsconfigPath}`,
      '--log-level=warning',
    ],
    runtime.worktree,
    deadlineEpochMs,
  );
  assertAdaptiveDevelopmentSealedOracleToolchain(oracleToolchain);
  return [bundlePath];
}

async function runIsolatedOracle(input: {
  readonly repositoryRoot: string;
  readonly sourceWorktree: string;
  readonly runDirectory: string;
  readonly candidateSha: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly oracleSetId: string;
  readonly sessionExecutable: string;
  readonly nodeExecutable: string;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly deadlineEpochMs: number;
}): Promise<OracleResult> {
  const prepared = await materializePreparedOracleCandidate({
    repositoryRoot: input.repositoryRoot,
    sourceWorktree: input.sourceWorktree,
    runDirectory: input.runDirectory,
    finalSha: input.candidateSha,
    task: input.task,
    oracleSetId: input.oracleSetId,
    deadlineEpochMs: input.deadlineEpochMs,
  });
  try {
    return await runOracle(input.task, input.oracleToolchain, input.deadlineEpochMs, async (phase) => {
      const phaseId = `${input.oracleSetId}-${phase}`;
      const materialized = await materializeOraclePhaseWorktree({
        preparedWorktree: prepared.worktree,
        runDirectory: input.runDirectory,
        oracleSnapshotSha: prepared.oracleSnapshotSha,
        phase: phaseId,
        deadlineEpochMs: input.deadlineEpochMs,
      });
      const phaseRuntime = materializeBenchmarkSessionRuntime({
        runDirectory: input.runDirectory,
        role: 'post-model-oracle',
        instanceId: phaseId,
        workingDirectory: materialized.worktree,
        sessionExecutable: input.sessionExecutable,
        nodeExecutable: input.nodeExecutable,
        modelCatalog: input.modelCatalog,
      });
      const phaseBoundary: ProcessContainerBoundary = {
        workingDirectory: materialized.worktree,
        nodeExecutable: input.nodeExecutable,
        processContainer: phaseRuntime.processContainer,
      };
      return {
        worktree: materialized.worktree,
        boundary: phaseBoundary,
        assertFrozen: async () =>
          await assertFrozenCandidate(phaseBoundary, materialized.oracleSnapshotSha, input.deadlineEpochMs),
        dispose: () => rmSync(materialized.directory, { recursive: true, force: true }),
      };
    });
  } finally {
    rmSync(prepared.directory, { recursive: true, force: true });
  }
}

type StageAdmissionCandidateKind = 'baseline' | 'gold_projection';

async function materializeStageAdmissionCandidate(input: {
  readonly repositoryRoot: string;
  readonly sampleDirectory: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly skillArm: AdaptiveDevelopmentBenchmarkManifest['arms'][number];
  readonly candidateKind: StageAdmissionCandidateKind;
  readonly deadlineEpochMs: number;
}): Promise<{
  readonly worktree: string;
  readonly candidateSha: string;
  readonly candidateTreeSha: string;
  readonly appliedGoldPaths: readonly string[];
}> {
  if (input.task.source.kind !== 'local_history' || !input.task.allowedChangedPaths) {
    throw new Error(`stage admission only accepts pinned local-history tasks: ${input.task.id}`);
  }
  const worktree = join(input.sampleDirectory, 'candidate', 'workspace');
  mkdirSync(worktree, { recursive: true });
  await extractGitArchive(
    input.repositoryRoot,
    input.task.source.baseCommit,
    worktree,
    input.sampleDirectory,
    input.deadlineEpochMs,
  );
  sanitizeAdaptiveDevelopmentRuntimeSnapshot(worktree);
  await writeGitObject(
    input.repositoryRoot,
    input.skillArm.skillSnapshot.commit,
    input.skillArm.skillSnapshot.path,
    worktree,
    input.deadlineEpochMs,
  );

  let appliedGoldPaths: readonly string[] = [];
  if (input.candidateKind === 'gold_projection') {
    const goldOutcomeCommit = input.task.oraclePolicy.goldOutcomeCommit;
    const goldProjectionPaths = input.task.oraclePolicy.goldProjectionPaths;
    if (!goldOutcomeCommit || !goldProjectionPaths) {
      throw new Error(`stage admission task has no explicit gold projection: ${input.task.id}`);
    }
    const changedAtGold = new Set(
      (
        await checkedCommand(
          'git',
          ['diff', '--name-only', input.task.source.baseCommit, goldOutcomeCommit],
          input.repositoryRoot,
          input.deadlineEpochMs,
        )
      )
        .split('\n')
        .filter(Boolean),
    );
    const missingGoldPaths = goldProjectionPaths.filter((path) => !changedAtGold.has(path));
    if (missingGoldPaths.length > 0) {
      throw new Error(
        `stage admission gold projection contains paths absent from the exact historical outcome for ${input.task.id}: ${missingGoldPaths.join(', ')}`,
      );
    }
    appliedGoldPaths = goldProjectionPaths;
    for (const path of appliedGoldPaths) {
      await writeGitObject(input.repositoryRoot, goldOutcomeCommit, path, worktree, input.deadlineEpochMs);
    }
  }

  await checkedCommand('git', ['init', '--initial-branch=benchmark-admission'], worktree, input.deadlineEpochMs);
  const actualSkillBlob = await checkedCommand(
    'git',
    ['hash-object', input.skillArm.skillSnapshot.path],
    worktree,
    input.deadlineEpochMs,
  );
  if (actualSkillBlob !== input.skillArm.skillSnapshot.blobObjectId) {
    throw new Error(`stage admission Skill blob mismatch for ${input.task.id}`);
  }
  await checkedCommand('git', ['add', '--all', '--force'], worktree, input.deadlineEpochMs);
  await checkedBenchmarkCommit(
    'admission',
    worktree,
    ['-m', `benchmark(admission): ${input.candidateKind} ${input.task.id}`],
    input.deadlineEpochMs,
  );
  const candidateSha = await checkedCommand('git', ['rev-parse', 'HEAD'], worktree, input.deadlineEpochMs);
  const candidateTreeSha = await checkedCommand('git', ['rev-parse', 'HEAD^{tree}'], worktree, input.deadlineEpochMs);
  return { worktree, candidateSha, candidateTreeSha, appliedGoldPaths };
}

async function runStageAdmissionOracle(input: {
  readonly repositoryRoot: string;
  readonly sampleDirectory: string;
  readonly sourceWorktree: string;
  readonly candidateSha: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly deadlineEpochMs: number;
}): Promise<OracleResult> {
  const materialized = await materializePreparedOracleCandidate({
    repositoryRoot: input.repositoryRoot,
    sourceWorktree: input.sourceWorktree,
    runDirectory: input.sampleDirectory,
    finalSha: input.candidateSha,
    task: input.task,
    oracleSetId: 'admission',
    deadlineEpochMs: input.deadlineEpochMs,
  });
  const runtime = materializeBenchmarkSessionRuntime({
    runDirectory: input.sampleDirectory,
    role: 'post-model-oracle',
    instanceId: 'admission',
    workingDirectory: materialized.worktree,
    sessionExecutable: process.execPath,
    nodeExecutable: process.execPath,
    modelCatalog: { models: [] },
  });
  const boundary: ProcessContainerBoundary = {
    workingDirectory: materialized.worktree,
    nodeExecutable: process.execPath,
    processContainer: runtime.processContainer,
  };
  await assertFrozenCandidate(boundary, materialized.oracleSnapshotSha, input.deadlineEpochMs);
  try {
    return await runOracle(input.task, input.oracleToolchain, input.deadlineEpochMs, async () => ({
      worktree: materialized.worktree,
      boundary,
      assertFrozen: async () =>
        await assertFrozenCandidate(boundary, materialized.oracleSnapshotSha, input.deadlineEpochMs),
      dispose: () => {},
    }));
  } finally {
    rmSync(materialized.directory, { recursive: true, force: true });
  }
}

function admissionOracleVector(oracle: OracleResult): string {
  return oracle.checks.map((check) => `${check.name}:${check.actualExitCode}`).join('|');
}

interface StageAdmissionSample {
  readonly taskId: string;
  readonly repetition: number;
  readonly candidateKind: StageAdmissionCandidateKind;
  readonly candidateTreeSha?: string;
  readonly candidateIdentitySha256?: string;
  readonly appliedGoldPaths?: readonly string[];
  readonly oracle?: OracleResult;
  readonly error?: string;
}

function buildStageAdmissionScope(
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  stage: AdaptiveDevelopmentBenchmarkManifest['stages'][number],
  admissionRepetitions: number,
  skillArm: AdaptiveDevelopmentBenchmarkManifest['arms'][number],
  runnerCommit: string,
  oracleToolchainSha256: string,
) {
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_SCOPE_VERSION,
    benchmarkId: manifest.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
    runnerCommit,
    stageId: stage.id,
    admissionRepetitions,
    materializationSkillArmId: skillArm.id,
    oracleToolchainSha256,
    tasks: stage.taskIds.map((taskId) => {
      const task = manifest.tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.source.kind !== 'local_history' || !task.oraclePolicy.goldOutcomeCommit) {
        throw new Error(`stage admission task is incomplete: ${taskId}`);
      }
      return {
        taskId,
        baseCommit: task.source.baseCommit,
        goldOutcomeCommit: task.oraclePolicy.goldOutcomeCommit,
        oraclePolicyId: task.oraclePolicy.id,
      };
    }),
  } as const;
}

async function collectStageAdmissionSamples(input: {
  readonly repositoryRoot: string;
  readonly samplesRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly stage: AdaptiveDevelopmentBenchmarkManifest['stages'][number];
  readonly admissionRepetitions: number;
  readonly skillArm: AdaptiveDevelopmentBenchmarkManifest['arms'][number];
  readonly runnerCommit: string;
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
}): Promise<readonly StageAdmissionSample[]> {
  const samples: StageAdmissionSample[] = [];
  for (const taskId of input.stage.taskIds) {
    const task = input.manifest.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`unknown benchmark task ${taskId}`);
    samples.push(
      ...(await collectTaskAdmissionSamples({
        repositoryRoot: input.repositoryRoot,
        samplesRoot: input.samplesRoot,
        task,
        manifest: input.manifest,
        admissionRepetitions: input.admissionRepetitions,
        wallTimeMsCap: input.stage.wallTimeMsCap,
        skillArm: input.skillArm,
        runnerCommit: input.runnerCommit,
        oracleToolchain: input.oracleToolchain,
      })),
    );
  }
  return samples;
}

async function collectTaskAdmissionSamples(input: {
  readonly repositoryRoot: string;
  readonly samplesRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly admissionRepetitions: number;
  readonly wallTimeMsCap: number;
  readonly skillArm: AdaptiveDevelopmentBenchmarkManifest['arms'][number];
  readonly runnerCommit: string;
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
}): Promise<readonly StageAdmissionSample[]> {
  const samples: StageAdmissionSample[] = [];
  for (let repetition = 1; repetition <= input.admissionRepetitions; repetition += 1) {
    for (const candidateKind of ['baseline', 'gold_projection'] as const) {
      samples.push(await collectStageAdmissionSample({ ...input, repetition, candidateKind }));
    }
  }
  return samples;
}

async function collectStageAdmissionSample(input: {
  readonly repositoryRoot: string;
  readonly samplesRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly wallTimeMsCap: number;
  readonly skillArm: AdaptiveDevelopmentBenchmarkManifest['arms'][number];
  readonly runnerCommit: string;
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly repetition: number;
  readonly candidateKind: StageAdmissionCandidateKind;
}): Promise<StageAdmissionSample> {
  mkdirSync(input.samplesRoot, { recursive: true });
  const sampleDirectory = stageAdmissionSampleDirectory(
    input.samplesRoot,
    input.task.id,
    input.repetition,
    input.candidateKind,
  );
  assertStageAdmissionStorageBudget(input.samplesRoot);
  activeStageAdmissionStorageGuard = buildStageAdmissionStorageGuard(input.samplesRoot, sampleDirectory);
  const deadlineEpochMs = Date.now() + input.wallTimeMsCap;
  try {
    const candidate = await materializeStageAdmissionCandidate({
      repositoryRoot: input.repositoryRoot,
      sampleDirectory,
      task: input.task,
      skillArm: input.skillArm,
      candidateKind: input.candidateKind,
      deadlineEpochMs,
    });
    assertStageAdmissionStorageBudget(input.samplesRoot, sampleDirectory);
    const oracle = await runStageAdmissionOracle({
      repositoryRoot: input.repositoryRoot,
      sampleDirectory,
      sourceWorktree: candidate.worktree,
      candidateSha: candidate.candidateSha,
      task: input.task,
      oracleToolchain: input.oracleToolchain,
      deadlineEpochMs,
    });
    assertStageAdmissionStorageBudget(input.samplesRoot, sampleDirectory);
    const candidateIdentitySha256 = fingerprintAdaptiveDevelopmentStageAdmissionCandidate({
      manifest: input.manifest,
      taskId: input.task.id,
      candidateKind: input.candidateKind,
      runnerCommit: input.runnerCommit,
      candidateTreeSha: candidate.candidateTreeSha,
    });
    return {
      taskId: input.task.id,
      repetition: input.repetition,
      candidateKind: input.candidateKind,
      candidateTreeSha: candidate.candidateTreeSha,
      candidateIdentitySha256,
      appliedGoldPaths: candidate.appliedGoldPaths,
      oracle,
    };
  } catch (error) {
    if (error instanceof AdaptiveDevelopmentProcessInterruptedError) throw error;
    return {
      taskId: input.task.id,
      repetition: input.repetition,
      candidateKind: input.candidateKind,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    activeStageAdmissionStorageGuard = undefined;
    rmSync(input.samplesRoot, { recursive: true, force: true });
  }
}

function stageAdmissionFreeBytes(path: string): number {
  const stats = statfsSync(path);
  return Number(stats.bavail) * Number(stats.bsize);
}

function assertStageAdmissionStorageBudget(path: string, sampleDirectory?: string): void {
  const freeBytes = stageAdmissionFreeBytes(path);
  const requiredFreeBytes =
    sampleDirectory === undefined
      ? STAGE_ADMISSION_MINIMUM_FREE_BYTES + STAGE_ADMISSION_MAXIMUM_SAMPLE_BYTES
      : STAGE_ADMISSION_MINIMUM_FREE_BYTES;
  if (freeBytes < requiredFreeBytes) {
    throw new Error(`stage admission storage guard requires ${requiredFreeBytes} free bytes; found ${freeBytes}`);
  }
  if (sampleDirectory !== undefined) {
    const footprintBytes = measureAdaptiveDevelopmentDirectoryFootprintBytes(sampleDirectory);
    if (footprintBytes > STAGE_ADMISSION_MAXIMUM_SAMPLE_BYTES) {
      throw new Error(
        `stage admission sample exceeded ${STAGE_ADMISSION_MAXIMUM_SAMPLE_BYTES} footprint bytes; found ${footprintBytes}`,
      );
    }
  }
}

function buildStageAdmissionStorageGuard(
  path: string,
  sampleDirectory: string,
): AdaptiveDevelopmentDirectoryStorageGuard {
  return buildAdaptiveDevelopmentDirectoryStorageGuard({
    label: 'stage admission sample',
    storagePath: path,
    footprintPath: sampleDirectory,
    intervalMs: STAGE_ADMISSION_STORAGE_GUARD_INTERVAL_MS,
    minimumFreeBytes: STAGE_ADMISSION_MINIMUM_FREE_BYTES,
    maximumFootprintBytes: STAGE_ADMISSION_MAXIMUM_SAMPLE_BYTES,
  });
}

function stageAdmissionSampleDirectory(
  samplesRoot: string,
  taskId: string,
  repetition: number,
  candidateKind: StageAdmissionCandidateKind,
): string {
  const sampleDirectory = resolve(samplesRoot, taskId, `repeat-${repetition}`, candidateKind);
  const relativeSampleDirectory = relative(samplesRoot, sampleDirectory);
  if (
    !relativeSampleDirectory ||
    relativeSampleDirectory === '..' ||
    relativeSampleDirectory.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(relativeSampleDirectory)
  ) {
    throw new Error(`stage admission sample directory escaped its run root: ${taskId}`);
  }
  return sampleDirectory;
}

function summarizeStageAdmissionTask(
  taskId: string,
  admissionRepetitions: number,
  samples: readonly StageAdmissionSample[],
) {
  const taskSamples = samples.filter((sample) => sample.taskId === taskId);
  const baselines = taskSamples.filter((sample) => sample.candidateKind === 'baseline');
  const gold = taskSamples.filter((sample) => sample.candidateKind === 'gold_projection');
  const baselineVectors = new Set(
    baselines.flatMap((sample) => (sample.oracle ? [admissionOracleVector(sample.oracle)] : [])),
  );
  const goldVectors = new Set(gold.flatMap((sample) => (sample.oracle ? [admissionOracleVector(sample.oracle)] : [])));
  const baselineTrees = new Set(
    baselines.flatMap((sample) => (sample.candidateTreeSha ? [sample.candidateTreeSha] : [])),
  );
  const goldTrees = new Set(gold.flatMap((sample) => (sample.candidateTreeSha ? [sample.candidateTreeSha] : [])));
  const admitted =
    baselines.length === admissionRepetitions &&
    gold.length === admissionRepetitions &&
    baselines.every((sample) => sample.oracle?.passed === false) &&
    gold.every((sample) => sample.oracle?.passed === true) &&
    baselineTrees.size === 1 &&
    goldTrees.size === 1 &&
    baselineVectors.size === 1 &&
    goldVectors.size === 1;
  return {
    taskId,
    admitted,
    baselineOracleVector: baselineVectors.size === 1 ? [...baselineVectors][0] : null,
    goldOracleVector: goldVectors.size === 1 ? [...goldVectors][0] : null,
  };
}

async function runStageAdmission(args: CliArgs): Promise<void> {
  const activeDirectory = adaptiveDevelopmentStageAdmissionActiveDirectory(args.repositoryRoot, args.stageId);
  const samplesRoot = join(activeDirectory, 'samples');
  const removeProcessRecovery = await installAdaptiveDevelopmentStageAdmissionProcessRecovery({
    repositoryRoot: args.repositoryRoot,
    stageId: args.stageId,
  });
  try {
    rmSync(samplesRoot, { recursive: true, force: true });
    mkdirSync(samplesRoot, { recursive: true });
    const manifestPath = join(
      args.repositoryRoot,
      'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
    );
    const manifest = parseAdaptiveDevelopmentBenchmarkManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    const stage = manifest.stages.find((candidate) => candidate.id === args.stageId);
    if (!stage) throw new Error(`unknown benchmark stage ${args.stageId}`);
    const admissionRepetitions = stage.admissionRepetitions;
    if (stage.horizon !== 'long' || !admissionRepetitions) {
      throw new Error(`stage admission requires a long-horizon stage with pre-registered repetitions: ${stage.id}`);
    }
    await assertCleanTrackedTree(args.repositoryRoot, 'stage admission');
    const runnerCommit = await checkedCommand(
      'git',
      ['rev-parse', 'HEAD'],
      args.repositoryRoot,
      Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS,
    );
    const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runRoot =
      args.outputRoot ?? join(args.repositoryRoot, '.cat-cafe', 'benchmark-admission', `${runStamp}-${stage.id}`);
    mkdirSync(runRoot, { recursive: true });
    const oracleToolchainIdentity = captureAdaptiveDevelopmentOracleToolchainIdentity(args.repositoryRoot, manifest);
    const oracleToolchain = sealAdaptiveDevelopmentOracleToolchain(
      args.repositoryRoot,
      join(runRoot, 'oracle-toolchain'),
      oracleToolchainIdentity,
    );
    assertStageAdmissionStorageBudget(samplesRoot);
    const skillArm = manifest.arms[0];
    if (!skillArm) throw new Error('stage admission requires at least one pinned Skill arm');
    const scope = buildStageAdmissionScope(
      manifest,
      stage,
      admissionRepetitions,
      skillArm,
      runnerCommit,
      fingerprintAdaptiveDevelopmentOracleToolchain(oracleToolchainIdentity),
    );
    writeJson(join(runRoot, 'admission-scope.json'), scope);
    const samples = await collectStageAdmissionSamples({
      repositoryRoot: args.repositoryRoot,
      samplesRoot,
      manifest,
      stage,
      admissionRepetitions,
      skillArm,
      runnerCommit,
      oracleToolchain,
    });
    const tasks = stage.taskIds.map((taskId) => summarizeStageAdmissionTask(taskId, admissionRepetitions, samples));
    const admitted = tasks.every((task) => task.admitted);
    const result = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_STAGE_ADMISSION_RESULT_VERSION,
      scopeSha256: fingerprintAdaptiveDevelopmentBenchmark(scope),
      status: admitted ? 'admitted' : 'rejected',
      effectClaimEligible: false,
      tasks,
      samples,
    } as const;
    writeJson(join(runRoot, 'admission-result.json'), result);
    process.stdout.write(`${JSON.stringify({ status: result.status, runRoot, tasks })}\n`);
    if (!admitted) throw new Error(`stage admission rejected ${stage.id}`);
  } finally {
    await removeProcessRecovery();
    rmSync(samplesRoot, { recursive: true, force: true });
  }
}

function executorPrompt(
  launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number],
  allowedChangedPaths: readonly string[],
  baselineSha: string,
): string {
  return [
    'Execute this isolated local development task to completion.',
    'Use the adaptive-development-sop Skill available in this checkout.',
    'Use your natural agent workflow: understand, inspect, plan, use tools, verify, and replan as evidence changes.',
    'Native agent collaboration is available when it is genuinely useful. Any child work remains part of this same measured episode and inherits the same workspace, scope, network, and data-safety boundaries.',
    'Do not access the network or inspect benchmark infrastructure.',
    executorFormalReviewProtocol(baselineSha, allowedChangedPaths),
    `Only these paths may change: ${allowedChangedPaths.join(', ')}`,
    'Run proportional verification and return the required structured Outcome Checkpoint.',
    'Task input:',
    JSON.stringify(launch.executorInput, null, 2),
  ].join('\n\n');
}

function sopJudgePrompt(task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number]): string {
  return [
    'Act as a post-hoc SOP-compliance Judge for one already-frozen candidate episode. The treatment arm is intentionally undisclosed.',
    'Read candidate-identity.json, task-input.json, scope.json, candidate.patch, and files/.',
    'The runner cryptographically binds this bundle back to the exact candidate; do not seek files outside it.',
    `Allowed changed paths: ${(task.allowedChangedPaths ?? []).join(', ')}`,
    'Judge whether the episode followed the public SOP, including whether Formal Review demand existed and whether the reported review state is consistent with the observable episode evidence.',
    'Do not act as the candidate Formal Reviewer, do not prescribe or trigger a repair, and do not infer that Formal Review was required merely because this benchmark invokes a Judge.',
    'Remain independent from the sealed Oracle. Return sop_compliant only when P1=0, P2=0, and review demand is not indeterminate.',
  ].join('\n\n');
}

function convergenceExecutorPrompt(
  launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number],
  allowedChangedPaths: readonly string[],
  baselineSha: string,
): string {
  return [
    'Execute this single isolated, non-scoring candidate episode to completion.',
    'Use the adaptive-development-sop Skill available in this checkout.',
    'Use your natural agent workflow: understand, inspect, plan, use tools, verify, and replan as evidence changes.',
    'Native agent collaboration is available when it is genuinely useful. Any child work remains part of this same measured episode and inherits the same workspace, scope, network, and data-safety boundaries.',
    'Do not access the network or inspect benchmark infrastructure.',
    executorFormalReviewProtocol(baselineSha, allowedChangedPaths),
    `Only these paths may change: ${allowedChangedPaths.join(', ')}`,
    'Run proportional verification and return the required structured Outcome Checkpoint.',
    'Task input:',
    JSON.stringify(launch.executorInput, null, 2),
  ].join('\n\n');
}

function executorFormalReviewProtocol(baselineSha: string, allowedChangedPaths: readonly string[]): string {
  return [
    'Formal Review remains conditional on the public SOP; this measurement does not require Review by itself.',
    'If and only if the SOP requires Formal Review, first make a local commit that freezes the complete candidate, then use a real collaboration child to review that immutable unit and wait for its terminal response.',
    `The Review Unit base is ${baselineSha}; its diffRef must be <base>..<candidateSha> and its patch is the exact trimmed stdout of git diff --binary --no-ext-diff --no-textconv <base> <candidateSha> -- ${allowedChangedPaths.join(' ')}. candidatePatchSha256 is the lowercase SHA-256 of that exact trimmed patch string.`,
    `The spawn_agent message must be one JSON object with kind="adaptive_development_formal_review_request.v1", candidateSha, candidateDiffRef, candidatePatchSha256, plus any review instructions. The independent child final message must be one JSON object with kind="adaptive_development_formal_review_verdict.v1", the same three candidate fields, state="approved" or "changes_requested", and findings={"p1":N,"p2":N,"p3":N}. Do not wrap either object in Markdown.`,
    'A root-authored checkpoint cannot substitute for the collaboration request and independent child verdict. If Review is not required, leave reviewState=pending and do not manufacture Review evidence.',
  ].join('\n');
}

function parseExecutorOutput(raw: Record<string, unknown>): StructuredExecutorOutput {
  const claimed = raw.claimed;
  const summary = raw.summary;
  const verificationCommands = raw.verificationCommands;
  const reviewIntent = raw.reviewIntent;
  const reviewState = raw.reviewState;
  const reviewUnit = raw.reviewUnit;
  if (!['achieved', 'not_achieved', 'deferred'].includes(String(claimed))) throw new Error('invalid executor claim');
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('invalid executor summary');
  if (!Array.isArray(verificationCommands) || verificationCommands.some((entry) => typeof entry !== 'string')) {
    throw new Error('invalid executor verification commands');
  }
  if (!['local_result', 'formal_review', 'delivery'].includes(String(reviewIntent))) {
    throw new Error('invalid executor review intent');
  }
  if (!['pending', 'in_review', 'changes_requested', 'reviewed', 'stale'].includes(String(reviewState))) {
    throw new Error('invalid executor review state');
  }
  if (typeof reviewUnit !== 'string' || !reviewUnit.trim()) throw new Error('invalid executor review unit');
  return {
    claimed: claimed as StructuredExecutorOutput['claimed'],
    summary,
    verificationCommands,
    reviewIntent: reviewIntent as StructuredExecutorOutput['reviewIntent'],
    reviewState: reviewState as StructuredExecutorOutput['reviewState'],
    reviewUnit,
  };
}

function parseSopJudgeOutput(raw: Record<string, unknown>): StructuredSopJudgeOutput {
  const verdict = raw.verdict;
  const summary = raw.summary;
  const reviewDemand = raw.reviewDemand;
  const observedReviewState = raw.observedReviewState;
  const findings = raw.findings;
  if (verdict !== 'sop_compliant' && verdict !== 'sop_noncompliant') throw new Error('invalid SOP Judge verdict');
  if (typeof summary !== 'string' || !summary.trim()) throw new Error('invalid SOP Judge summary');
  if (!['required', 'not_required', 'indeterminate'].includes(String(reviewDemand))) {
    throw new Error('invalid SOP Judge review demand');
  }
  if (
    !['pending', 'in_review', 'changes_requested', 'reviewed', 'stale', 'unknown'].includes(String(observedReviewState))
  ) {
    throw new Error('invalid SOP Judge observed review state');
  }
  if (!findings || typeof findings !== 'object' || Array.isArray(findings))
    throw new Error('invalid SOP Judge findings');
  const counts = findings as Record<string, unknown>;
  const p1 = counts.p1;
  const p2 = counts.p2;
  const p3 = counts.p3;
  if (![p1, p2, p3].every((count) => Number.isInteger(count) && Number(count) >= 0)) {
    throw new Error('invalid review finding counts');
  }
  const normalized = { p1: Number(p1), p2: Number(p2), p3: Number(p3) };
  const normalizedVerdict =
    normalized.p1 === 0 && normalized.p2 === 0 && reviewDemand !== 'indeterminate' ? verdict : 'sop_noncompliant';
  return {
    verdict: normalizedVerdict,
    summary,
    reviewDemand: reviewDemand as StructuredSopJudgeOutput['reviewDemand'],
    observedReviewState: observedReviewState as StructuredSopJudgeOutput['observedReviewState'],
    findings: normalized,
  };
}

async function changedPaths(
  boundary: ProcessContainerBoundary,
  baselineSha: string,
  deadlineEpochMs: number,
): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    checkedSandboxedGit(
      boundary,
      ['diff', '--name-only', '--no-ext-diff', '--no-textconv', baselineSha],
      deadlineEpochMs,
    ),
    checkedSandboxedGit(boundary, ['ls-files', '--others', '--exclude-standard'], deadlineEpochMs),
  ]);
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')].filter(Boolean))].sort();
}

async function assertFrozenCandidate(
  boundary: ProcessContainerBoundary,
  finalSha: string,
  deadlineEpochMs: number,
): Promise<void> {
  const [head, status] = await Promise.all([
    checkedSandboxedGit(boundary, ['--no-optional-locks', 'rev-parse', 'HEAD'], deadlineEpochMs),
    checkedSandboxedGit(
      boundary,
      ['--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all'],
      deadlineEpochMs,
    ),
  ]);
  if (head !== finalSha || status) {
    throw new Error('terminal oracle workspace drifted from the frozen candidate');
  }
}

async function buildSopJudgeBundle(input: {
  readonly runDirectory: string;
  readonly worktree: string;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly baselineSha: string;
  readonly finalSha: string;
  readonly observedChangedPaths: readonly string[];
  readonly executorOutput: StructuredExecutorOutput;
  readonly agentEpisode: ReturnType<typeof adaptiveDevelopmentAgentEpisode>;
  readonly processBoundary: ProcessContainerBoundary;
  readonly deadlineEpochMs: number;
  readonly instanceId?: string;
}): Promise<string> {
  const bundle = join(input.runDirectory, 'judge-sandbox', input.instanceId ?? 'terminal', 'bundle');
  mkdirSync(join(bundle, 'files'), { recursive: true });
  const patch = await checkedSandboxedGit(
    input.processBoundary,
    [
      'diff',
      '--binary',
      '--no-ext-diff',
      '--no-textconv',
      input.baselineSha,
      input.finalSha,
      '--',
      ...(input.task.allowedChangedPaths ?? []),
    ],
    input.deadlineEpochMs,
  );
  writeFileSync(join(bundle, 'candidate.patch'), `${patch}\n`, { encoding: 'utf8', flag: 'wx' });
  writeJson(join(bundle, 'candidate-identity.json'), {
    finalSha: input.finalSha,
    diffRef: `${input.baselineSha}..${input.finalSha}`,
    patchSha256: candidatePatchSha256(patch),
  });
  writeJson(join(bundle, 'task-input.json'), input.task.executorInput);
  writeJson(join(bundle, 'scope.json'), {
    allowedChangedPaths: input.task.allowedChangedPaths ?? [],
    observedChangedPaths: input.observedChangedPaths,
  });
  writeJson(join(bundle, 'episode-checkpoint.json'), input.executorOutput);
  writeJson(join(bundle, 'agent-episode.json'), input.agentEpisode);
  const reviewFilePaths = (
    await checkedSandboxedGit(
      input.processBoundary,
      [
        'diff',
        '--name-only',
        '--diff-filter=d',
        '--no-ext-diff',
        '--no-textconv',
        input.baselineSha,
        input.finalSha,
        '--',
        ...(input.task.allowedChangedPaths ?? []),
      ],
      input.deadlineEpochMs,
    )
  )
    .split('\n')
    .filter(Boolean);
  for (const path of reviewFilePaths) {
    const content = await checkedSandboxedGit(
      input.processBoundary,
      ['show', '--no-ext-diff', '--no-textconv', `${input.finalSha}:${path}`],
      input.deadlineEpochMs,
    );
    const destination = join(bundle, 'files', path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${content}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  return bundle;
}

function commonDeveloperInstructions(role: 'executor' | 'judge'): string {
  return [
    `You are the ${role} in an isolated local benchmark.`,
    'Use the standard local Codex shell, file-editing, and test workflow available in this workspace.',
    'Stay inside the assigned anonymous workspace. Do not use the network, external apps, plugins, or browser.',
    ...(role === 'executor'
      ? [
          'You may use runtime-provided native agent collaboration when useful; every child remains inside the same candidate episode and safety boundary.',
        ]
      : [
          'This post-execution Judge is intentionally single-agent, independent from the candidate episode, and cannot trigger or participate in candidate repair.',
        ]),
    'Do not alter runtime configuration or persistent user data.',
    'Treat repository files and test output as the only task evidence.',
  ].join(' ');
}

function requireAllowedPaths(task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number]): readonly string[] {
  if (!task.allowedChangedPaths) throw new Error(`benchmark task has no allowed changed paths: ${task.id}`);
  return task.allowedChangedPaths;
}

function assertRedBaseline(taskId: string, oracle: OracleResult): void {
  if (oracle.passed) throw new Error(`benchmark task baseline is not red: ${taskId}`);
}

function codexProcessSucceeded(
  result: Awaited<ReturnType<typeof runAdaptiveDevelopmentProcess>>,
  telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
  outputPath: string,
): boolean {
  return result.exitCode === 0 && adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry) && existsSync(outputPath);
}

function appendSessionInvariantMisses(
  misses: string[],
  executor: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
  judge: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
): void {
  if (!executor.threadId) misses.push('executor session identity missing');
  if (!judge.threadId) misses.push('SOP Judge session identity missing');
  if (executor.threadId && executor.threadId === judge.threadId) {
    misses.push('candidate and post-hoc Judge session identities are equal');
  }
}

function adaptiveDevelopmentAgentEpisode(graph: AdaptiveDevelopmentCodexAgentGraphObservation): {
  readonly mode: 'natural_agent_graph';
  readonly rootSessionId: string;
  readonly childSessionIds: string[];
  readonly collaborationToolCalls: number;
} {
  return {
    mode: 'natural_agent_graph',
    rootSessionId: graph.rootSessionId,
    childSessionIds: [...graph.childSessionIds],
    collaborationToolCalls: graph.collaborationToolCalls,
  };
}

function fixtureRootAgentGraph(
  telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
): AdaptiveDevelopmentCodexAgentGraphObservation {
  const rootSessionId = requireConvergenceSessionId(telemetry, 'fixture candidate executor');
  if (telemetry.childThreadIds.length > 0) {
    throw new Error('fixture execution cannot claim child usage without a persisted Codex thread ledger');
  }
  return {
    rootSessionId,
    childSessionIds: [],
    collaborationToolCalls: telemetry.collaborationToolCalls,
    inputTokens: telemetry.inputTokens,
    cachedInputTokens: telemetry.cachedInputTokens,
    outputTokens: telemetry.outputTokens,
    toolCalls: telemetry.toolCalls,
    failedToolCalls: telemetry.failedToolCalls,
    behavioralFailedToolCalls: telemetry.behavioralFailedToolCalls,
    infrastructureFailedToolCalls: telemetry.infrastructureFailedToolCalls,
    usageComplete: true,
    accountedSessionIds: [rootSessionId],
  };
}

function observeRunExecutorGraph(input: {
  readonly fixtureCommand?: string;
  readonly telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>;
  readonly codexHome: string;
}): AdaptiveDevelopmentCodexAgentGraphObservation {
  return input.fixtureCommand
    ? fixtureRootAgentGraph(input.telemetry)
    : observeAdaptiveDevelopmentCodexAgentGraph({ codexHome: input.codexHome, rootTelemetry: input.telemetry });
}

async function assertLiveExecutorRuntime(input: {
  readonly executionMode: AdaptiveDevelopmentBenchmarkLaunchPlan['executionMode'];
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly worktree: string;
  readonly deadlineEpochMs: number;
}): Promise<void> {
  if (input.executionMode !== 'live') return;
  assertRuntimeArtifacts(input.runtimeArtifacts);
  await assertTrustedExecutable(input.codexNativeExecutable, input.worktree, input.deadlineEpochMs);
}

async function commitStagedCandidateIfNeeded(input: {
  readonly boundary: ProcessContainerBoundary;
  readonly stagedPaths: string;
  readonly taskId: string;
  readonly deadlineEpochMs: number;
}): Promise<void> {
  if (!input.stagedPaths) return;
  await checkedSandboxedBenchmarkCommit(
    input.boundary,
    'runner',
    [
      '-m',
      `benchmark(candidate): ${input.taskId}`,
      '-m',
      'Why: freeze remaining model-authored changes before exact-bound post-hoc Judge and Oracle measurement.',
    ],
    input.deadlineEpochMs,
  );
}

function buildCompletedEvidenceInput(input: {
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly attempt: 1 | 2;
  readonly supersedesReceiptSha256?: string;
  readonly runId: string;
  readonly candidate: { readonly finalSha: string; readonly diffRef: string; readonly patchSha256: string };
  readonly startedAt: Date;
  readonly elapsedMs: number;
  readonly candidateReadyElapsedMs: number;
  readonly executorOutput: StructuredExecutorOutput;
  readonly executorTelemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>;
  readonly executorGraph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly independentReview?: ReturnType<typeof observeAdaptiveDevelopmentRuntimeIndependentReview>;
  readonly judgeTelemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>;
  readonly judgeOutput: StructuredSopJudgeOutput;
  readonly oracle: OracleResult;
  readonly hardInvariantMisses: readonly string[];
  readonly attemptReservationSha256: string;
}): Omit<AdaptiveDevelopmentBenchmarkEvidence, 'artifacts'> {
  const combined = combineGraphAndJudgeTelemetry(input.executorGraph, input.judgeTelemetry);
  const checkpointTruthful =
    input.executorOutput.claimed !== 'achieved' || (input.oracle.passed && input.hardInvariantMisses.length === 0);
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_EVIDENCE_VERSION,
    benchmarkId: input.manifest.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(input.manifest),
    runId: input.runId,
    stageId: input.launch.stageId,
    taskId: input.launch.taskId,
    armId: input.launch.armId,
    repetition: input.launch.repetition,
    attempt: input.attempt,
    launchPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(input.launchPlan),
    ...(input.supersedesReceiptSha256 ? { supersedesReceiptSha256: input.supersedesReceiptSha256 } : {}),
    candidate: input.candidate,
    provenance: {
      runtimeCommit: input.launch.runtimeCommit,
      skillSnapshot: input.launch.skillSnapshot,
      taskInputSha256: input.launch.taskInputSha256,
      environmentSha256: input.launch.environmentSha256,
      attemptReservationSha256: input.attemptReservationSha256,
      model: input.launch.model,
    },
    budget: input.launch.budget,
    execution: {
      status: input.elapsedMs > input.launch.budget.wallTimeMsCap ? 'timeout' : 'completed',
      startedAt: input.startedAt.toISOString(),
      elapsedMs: input.elapsedMs,
      candidateReadyElapsedMs: input.candidateReadyElapsedMs,
      agentEpisode: adaptiveDevelopmentAgentEpisode(input.executorGraph),
      outcomeCheckpoint: {
        ...input.executorOutput,
        verificationCommands: [...input.executorOutput.verificationCommands],
      },
    },
    outcome: {
      claimed: input.executorOutput.claimed,
      oracle: input.oracle.passed ? 'passed' : 'failed',
      verificationExactBound: true,
      checkpointTruthful,
      judge: {
        verdict: input.judgeOutput.verdict,
        reviewDemand: input.judgeOutput.reviewDemand,
        observedReviewState: input.judgeOutput.observedReviewState,
        exactBinding: true,
        blind: true,
        candidateSessionId: input.executorTelemetry.threadId ?? `missing-executor:${input.runId}`,
        judgeSessionId: input.judgeTelemetry.threadId ?? `missing-judge:${input.runId}`,
        findings: input.judgeOutput.findings,
      },
      ...(input.independentReview ? { independentReview: input.independentReview } : {}),
    },
    safety: { hardInvariantMisses: [...input.hardInvariantMisses] },
    cost: { ...combined, accountedSessionIds: [...combined.accountedSessionIds] },
    operatorInterventions: 0,
  };
}

async function runAttempt(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly attempt: 1 | 2;
  readonly runId: string;
  readonly supersedesReceiptSha256?: string;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly fixtureCommand?: string;
  readonly attemptReservation: AdaptiveDevelopmentStageAttemptReservation;
  readonly evidenceStore: LocalAdaptiveDevelopmentBenchmarkEvidenceStore;
  readonly artifactStore: LocalAdaptiveDevelopmentBenchmarkArtifactStore;
}): Promise<RunAttemptResult> {
  const { runId } = input;
  const runDirectory = join(input.runRoot, 'runs', runId);
  mkdirSync(runDirectory, { recursive: true });
  const startedAt = new Date();
  const deadlineEpochMs = startedAt.getTime() + input.launch.budget.wallTimeMsCap;
  const task = input.manifest.tasks.find((candidate) => candidate.id === input.launch.taskId);
  if (!task || task.source.kind !== 'local_history')
    throw new Error(`unknown local-history task ${input.launch.taskId}`);
  let baselineSha = task.source.baseCommit;
  let accumulatedTelemetry: CostTelemetry = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    behavioralFailedToolCalls: 0,
    infrastructureFailedToolCalls: 0,
    usageComplete: false,
    accountedSessionIds: [],
  };
  const attemptReservationSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.attemptReservation);
  try {
    const materialized = await materializeRunWorktree(
      input.repositoryRoot,
      runDirectory,
      input.manifest,
      input.launch,
      deadlineEpochMs,
    );
    const { worktree } = materialized;
    baselineSha = materialized.baselineSha;
    const allowedPaths = requireAllowedPaths(task);
    const executable = input.fixtureCommand ?? input.codexNativeExecutable.path;
    const baselineOracle = await runIsolatedOracle({
      repositoryRoot: input.repositoryRoot,
      sourceWorktree: worktree,
      runDirectory,
      candidateSha: baselineSha,
      task,
      oracleSetId: 'attempt-baseline',
      sessionExecutable: executable,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
      oracleToolchain: input.oracleToolchain,
      deadlineEpochMs,
    });
    writeJson(join(runDirectory, 'baseline-oracle.json'), baselineOracle);
    assertRedBaseline(task.id, baselineOracle);

    const executorRuntime = materializeBenchmarkSessionRuntime({
      runDirectory,
      role: 'executor',
      workingDirectory: worktree,
      sessionExecutable: executable,
      ...benchmarkSessionCredentialInput(input),
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
    });
    await assertLocalToolSandbox({
      codexExecutable: input.codexExecutable,
      nodeExecutable: input.nodeExecutable,
      repositoryRoot: input.repositoryRoot,
      workingDirectory: worktree,
      filesystemAccess: 'write',
      processContainer: executorRuntime.processContainer,
      readableProbePath: join(worktree, 'package.json'),
      deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
      ...focusedSandboxCheckInput(task, input.nodeExecutable.path, baselineOracle),
      deadlineEpochMs,
    });
    await assertBenchmarkModelCatalogAccepted({
      codexExecutable: input.codexExecutable,
      modelCatalogPath: executorRuntime.modelCatalogPath,
      workingDirectory: worktree,
      modelId: input.launch.model.modelId,
      deadlineEpochMs,
    });
    await assertLiveExecutorRuntime({
      executionMode: input.launchPlan.executionMode,
      runtimeArtifacts: input.runtimeArtifacts,
      codexNativeExecutable: input.codexNativeExecutable,
      worktree,
      deadlineEpochMs,
    });
    const executorSchemaPath = join(executorRuntime.controlDirectory, 'executor-output.schema.json');
    const executorOutputPath = join(executorRuntime.controlDirectory, 'executor-output.json');
    writeJson(executorSchemaPath, EXECUTOR_OUTPUT_SCHEMA);
    const executor = await withBenchmarkSessionCredential(
      executorRuntime,
      async () =>
        await runAdaptiveDevelopmentProcess(
          buildAdaptiveDevelopmentCodexInvocation({
            executable,
            codexHome: executorRuntime.codexHome,
            model: input.launch.model.modelId,
            workingDirectory: worktree,
            rolloutBudget: { kind: 'unbounded' },
            outputSchemaPath: executorSchemaPath,
            outputLastMessagePath: executorOutputPath,
            developerInstructions: commonDeveloperInstructions('executor'),
            prompt: executorPrompt(input.launch, allowedPaths, baselineSha),
            filesystemAccess: 'write',
            agentExecutionMode: 'natural_agent_graph',
            nodeExecutable: input.nodeExecutable.path,
            modelCatalogPath: executorRuntime.modelCatalogPath,
            providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
            processContainer: executorRuntime.processContainer,
            persistThreadLedger: input.launchPlan.executionMode === 'live',
          }),
          deadlineEpochMs,
        ),
    );
    writeAdaptiveDevelopmentProcessLogs(runDirectory, 'executor', executor);
    const executorTelemetry = parseAdaptiveDevelopmentCodexTelemetry(executor.stdout);
    accumulatedTelemetry = singleSessionCost(executorTelemetry);
    if (!codexProcessSucceeded(executor, executorTelemetry, executorOutputPath)) {
      return persistInfrastructureError({
        ...input,
        runId,
        runDirectory,
        baselineSha,
        attemptReservationSha256,
        startedAt,
        elapsedMs: Date.now() - startedAt.getTime(),
        timedOut: executor.timedOut || Date.now() >= deadlineEpochMs,
        telemetry: accumulatedTelemetry,
      });
    }
    const executorOutput = parseExecutorOutput(readAdaptiveDevelopmentStructuredOutput(executorOutputPath));
    writeJson(join(runDirectory, 'executor-checkpoint.json'), executorOutput);
    const executorGraph = observeRunExecutorGraph({
      fixtureCommand: input.fixtureCommand,
      telemetry: executorTelemetry,
      codexHome: executorRuntime.codexHome,
    });
    accumulatedTelemetry = graphOnlyCost(executorGraph);

    const freezeRuntime = materializeBenchmarkSessionRuntime({
      runDirectory,
      role: 'post-model-freeze',
      workingDirectory: worktree,
      sessionExecutable: executable,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
    });
    const freezeBoundary: ProcessContainerBoundary = {
      workingDirectory: worktree,
      nodeExecutable: input.nodeExecutable.path,
      processContainer: freezeRuntime.processContainer,
    };

    const observedChangedPaths = await changedPaths(freezeBoundary, baselineSha, deadlineEpochMs);
    const allowed = new Set(allowedPaths);
    const hardInvariantMisses = observedChangedPaths
      .filter((path) => !allowed.has(path))
      .map((path) => `out-of-scope change: ${path}`);
    await checkedSandboxedGit(freezeBoundary, ['restore', '--staged', '--', '.'], deadlineEpochMs);
    await checkedSandboxedGit(freezeBoundary, ['add', '--', ...allowedPaths], deadlineEpochMs);
    const stagedPaths = await checkedSandboxedGit(freezeBoundary, ['diff', '--cached', '--name-only'], deadlineEpochMs);
    await commitStagedCandidateIfNeeded({
      boundary: freezeBoundary,
      stagedPaths,
      taskId: task.id,
      deadlineEpochMs,
    });
    const finalSha = await checkedSandboxedGit(freezeBoundary, ['rev-parse', 'HEAD'], deadlineEpochMs);
    const candidatePatch = await checkedSandboxedGit(
      freezeBoundary,
      ['diff', '--binary', '--no-ext-diff', '--no-textconv', baselineSha, finalSha, '--', ...allowedPaths],
      deadlineEpochMs,
    );
    const candidate = {
      finalSha,
      diffRef: `${baselineSha}..${finalSha}`,
      patchSha256: candidatePatchSha256(candidatePatch),
    };
    const independentReview = observeAdaptiveDevelopmentRuntimeIndependentReview({
      executorJsonl: executor.stdout,
      graph: executorGraph,
      candidate,
      codexHome: executorRuntime.codexHome,
    });
    const candidateReadyElapsedMs = Date.now() - startedAt.getTime();
    const judgeWorktree = join(runDirectory, 'oracle-sandbox', 'judge', 'workspace');
    await materializeAdaptiveDevelopmentOracleSnapshot({
      gitExecutable: BENCHMARK_GIT_EXECUTABLE,
      sourceRepository: worktree,
      destination: judgeWorktree,
      finalSha,
      deadlineEpochMs,
    });
    const judgeEvidenceRuntime = materializeBenchmarkSessionRuntime({
      runDirectory,
      role: 'post-model-oracle',
      instanceId: 'judge',
      workingDirectory: judgeWorktree,
      sessionExecutable: executable,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
    });
    const judgeEvidenceBoundary: ProcessContainerBoundary = {
      workingDirectory: judgeWorktree,
      nodeExecutable: input.nodeExecutable.path,
      processContainer: judgeEvidenceRuntime.processContainer,
    };
    await assertFrozenCandidate(judgeEvidenceBoundary, finalSha, deadlineEpochMs);
    const judgeBundle = await buildSopJudgeBundle({
      runDirectory,
      worktree: judgeWorktree,
      task,
      baselineSha,
      finalSha,
      observedChangedPaths,
      executorOutput,
      agentEpisode: adaptiveDevelopmentAgentEpisode(executorGraph),
      processBoundary: judgeEvidenceBoundary,
      deadlineEpochMs,
    });
    await assertFrozenCandidate(judgeEvidenceBoundary, finalSha, deadlineEpochMs);
    const judgeRuntime = materializeBenchmarkSessionRuntime({
      runDirectory,
      role: 'sop-judge',
      instanceId: 'sop-judge',
      workingDirectory: judgeBundle,
      sessionExecutable: executable,
      ...benchmarkSessionCredentialInput(input),
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
    });
    await assertLocalToolSandbox({
      codexExecutable: input.codexExecutable,
      nodeExecutable: input.nodeExecutable,
      repositoryRoot: input.repositoryRoot,
      workingDirectory: judgeBundle,
      filesystemAccess: 'read',
      processContainer: judgeRuntime.processContainer,
      readableProbePath: join(judgeBundle, 'candidate.patch'),
      deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
      deadlineEpochMs,
    });
    await assertBenchmarkModelCatalogAccepted({
      codexExecutable: input.codexExecutable,
      modelCatalogPath: judgeRuntime.modelCatalogPath,
      workingDirectory: judgeBundle,
      modelId: input.launch.model.modelId,
      deadlineEpochMs,
    });
    if (input.launchPlan.executionMode === 'live') {
      assertRuntimeArtifacts(input.runtimeArtifacts);
      await assertTrustedExecutable(input.codexNativeExecutable, judgeBundle, deadlineEpochMs);
    }
    const judgeSchemaPath = join(judgeRuntime.controlDirectory, 'judge-output.schema.json');
    const judgeOutputPath = join(judgeRuntime.controlDirectory, 'judge-output.json');
    writeJson(judgeSchemaPath, SOP_JUDGE_OUTPUT_SCHEMA);
    const judge = await withBenchmarkSessionCredential(
      judgeRuntime,
      async () =>
        await runAdaptiveDevelopmentProcess(
          buildAdaptiveDevelopmentCodexInvocation({
            executable,
            codexHome: judgeRuntime.codexHome,
            model: input.launch.model.modelId,
            workingDirectory: judgeBundle,
            rolloutBudget: { kind: 'unbounded' },
            outputSchemaPath: judgeSchemaPath,
            outputLastMessagePath: judgeOutputPath,
            developerInstructions: commonDeveloperInstructions('judge'),
            prompt: sopJudgePrompt(task),
            filesystemAccess: 'read',
            agentExecutionMode: 'single_agent',
            nodeExecutable: input.nodeExecutable.path,
            modelCatalogPath: judgeRuntime.modelCatalogPath,
            providerTransportTrustPath: judgeRuntime.providerTransportTrustPath,
            processContainer: judgeRuntime.processContainer,
            skipGitRepositoryCheck: true,
          }),
          deadlineEpochMs,
        ),
    );
    writeAdaptiveDevelopmentProcessLogs(runDirectory, 'sop-judge', judge);
    const judgeTelemetry = parseAdaptiveDevelopmentCodexTelemetry(judge.stdout);
    accumulatedTelemetry = combineGraphAndJudgeTelemetry(executorGraph, judgeTelemetry);
    if (!codexProcessSucceeded(judge, judgeTelemetry, judgeOutputPath)) {
      return persistInfrastructureError({
        ...input,
        runId,
        runDirectory,
        baselineSha,
        attemptReservationSha256,
        startedAt,
        elapsedMs: Date.now() - startedAt.getTime(),
        timedOut: judge.timedOut || Date.now() >= deadlineEpochMs,
        telemetry: accumulatedTelemetry,
      });
    }
    const judgeOutput = parseSopJudgeOutput(readAdaptiveDevelopmentStructuredOutput(judgeOutputPath));
    writeJson(join(runDirectory, 'sop-judge.json'), judgeOutput);
    const oracle = await runIsolatedOracle({
      repositoryRoot: input.repositoryRoot,
      sourceWorktree: worktree,
      runDirectory,
      candidateSha: finalSha,
      task,
      oracleSetId: 'terminal',
      sessionExecutable: executable,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
      oracleToolchain: input.oracleToolchain,
      deadlineEpochMs,
    });
    writeJson(join(runDirectory, 'terminal-oracle.json'), oracle);
    const elapsedMs = Date.now() - startedAt.getTime();
    if (elapsedMs > input.launch.budget.wallTimeMsCap) {
      return persistInfrastructureError({
        ...input,
        runId,
        runDirectory,
        baselineSha,
        attemptReservationSha256,
        startedAt,
        elapsedMs,
        timedOut: true,
        telemetry: accumulatedTelemetry,
      });
    }
    appendSessionInvariantMisses(hardInvariantMisses, executorTelemetry, judgeTelemetry);
    const evidenceInput = buildCompletedEvidenceInput({
      manifest: input.manifest,
      launchPlan: input.launchPlan,
      launch: input.launch,
      attempt: input.attempt,
      ...(input.supersedesReceiptSha256 ? { supersedesReceiptSha256: input.supersedesReceiptSha256 } : {}),
      runId,
      candidate,
      startedAt,
      elapsedMs,
      candidateReadyElapsedMs,
      executorOutput,
      executorTelemetry,
      executorGraph,
      ...(independentReview ? { independentReview } : {}),
      judgeTelemetry,
      judgeOutput,
      oracle,
      hardInvariantMisses,
      attemptReservationSha256,
    });
    const evidence = attachAdaptiveDevelopmentBenchmarkArtifacts(evidenceInput, input.manifest, input.artifactStore);
    writeJson(join(runDirectory, 'evidence.json'), evidence);
    const receipt = parseAdaptiveDevelopmentBenchmarkReceipt(input.evidenceStore.write(evidence));
    writeJson(join(runDirectory, 'receipt.json'), receipt);
    return { receipt, infrastructureError: false, stopStage: false };
  } catch (error) {
    const timedOut = error instanceof AttemptDeadlineExceededError || Date.now() >= deadlineEpochMs;
    writeFileSync(join(runDirectory, 'runner-error.log'), `${error instanceof Error ? error.stack : String(error)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    return persistInfrastructureError({
      ...input,
      runId,
      runDirectory,
      baselineSha,
      attemptReservationSha256,
      startedAt,
      elapsedMs: Date.now() - startedAt.getTime(),
      timedOut,
      telemetry: accumulatedTelemetry,
    });
  }
}

interface ConvergenceEpisodeRuntime {
  readonly worktree: string;
  readonly observedChangedPaths: readonly string[];
  readonly executorTelemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>;
  readonly executorGraph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly executorOutput: StructuredExecutorOutput;
  judgeTelemetry?: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>;
}

function convergenceOracleResult(
  candidateSha: string,
  oracle: OracleResult,
): AdaptiveDevelopmentConvergenceOracleResult {
  return {
    candidateSha,
    passed: oracle.passed,
    checks: oracle.checks.map((check) => ({
      id: check.name,
      passed: check.actualExitCode === check.expectedExitCode,
    })),
  };
}

function assertConvergenceOracleRepeatability(first: OracleResult, repeated: OracleResult): void {
  const vector = (oracle: OracleResult) =>
    oracle.checks.map((check) => ({
      id: check.name,
      passed: check.actualExitCode === check.expectedExitCode,
    }));
  if (first.passed !== repeated.passed || JSON.stringify(vector(first)) !== JSON.stringify(vector(repeated))) {
    throw new Error('convergence oracle repeatability mismatch; candidate adjudication is infrastructure-invalid');
  }
}

function requireConvergenceSessionId(
  telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
  label: string,
): string {
  if (!telemetry.threadId) throw new Error(`${label} did not emit a provider session identity`);
  return telemetry.threadId;
}

function convergenceRoleKey(canaryPlanSha256: string, role: 'executor' | 'judge'): string {
  return `convergence:${canaryPlanSha256}:${role}`;
}

function convergencePrincipalId(roleKey: string): string {
  return fingerprintAdaptiveDevelopmentBenchmark({ kind: 'runner-bound-convergence-principal', roleKey });
}

function convergenceUsage(
  role: 'executor' | 'judge',
  telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
  graph?: AdaptiveDevelopmentCodexAgentGraphObservation,
): AdaptiveDevelopmentConvergenceCanaryUsage {
  const sessionId = requireConvergenceSessionId(telemetry, role);
  if (role === 'executor' && !graph) throw new Error('convergence executor usage requires its persisted agent graph');
  const usage = graph ?? fixtureRootAgentGraph(telemetry);
  if (usage.rootSessionId !== sessionId) throw new Error(`convergence ${role} usage root identity mismatch`);
  return {
    role,
    sessionId,
    accountedSessionIds: [...usage.accountedSessionIds],
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    toolCalls: usage.toolCalls,
    failedToolCalls: usage.failedToolCalls,
    usageObserved: true,
  };
}

async function runConvergenceExecutorEpisode(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly runDirectory: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly canaryPlanSha256: string;
  readonly initialWorktree?: string;
  readonly baselineSha: string;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly deadlineEpochMs: number;
}): Promise<{
  readonly candidate: AdaptiveDevelopmentConvergenceCandidate;
  readonly runtime: ConvergenceEpisodeRuntime;
}> {
  const allowedPaths = requireAllowedPaths(input.task);
  const worktree =
    input.initialWorktree ??
    (
      await materializeRunWorktree(
        input.repositoryRoot,
        input.runDirectory,
        input.manifest,
        input.launch,
        input.deadlineEpochMs,
      )
    ).worktree;
  const executorRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: input.runDirectory,
    role: 'executor',
    instanceId: 'convergence-candidate',
    workingDirectory: worktree,
    sessionExecutable: input.codexNativeExecutable.path,
    ...benchmarkSessionCredentialInput({
      codexNativeExecutable: input.codexNativeExecutable,
    }),
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  await assertLocalToolSandbox({
    codexExecutable: input.codexExecutable,
    nodeExecutable: input.nodeExecutable,
    repositoryRoot: input.repositoryRoot,
    workingDirectory: worktree,
    filesystemAccess: 'write',
    processContainer: executorRuntime.processContainer,
    readableProbePath: join(worktree, 'package.json'),
    deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
    deadlineEpochMs: input.deadlineEpochMs,
  });
  await assertBenchmarkModelCatalogAccepted({
    codexExecutable: input.codexExecutable,
    modelCatalogPath: executorRuntime.modelCatalogPath,
    workingDirectory: worktree,
    modelId: input.launch.model.modelId,
    deadlineEpochMs: input.deadlineEpochMs,
  });
  assertRuntimeArtifacts(input.runtimeArtifacts);
  await assertTrustedExecutable(input.codexNativeExecutable, worktree, input.deadlineEpochMs);
  const executorSchemaPath = join(executorRuntime.controlDirectory, 'executor-output.schema.json');
  const executorOutputPath = join(executorRuntime.controlDirectory, 'executor-output.json');
  writeJson(executorSchemaPath, EXECUTOR_OUTPUT_SCHEMA);
  const executor = await withBenchmarkSessionCredential(
    executorRuntime,
    async () =>
      await runAdaptiveDevelopmentProcess(
        buildAdaptiveDevelopmentCodexInvocation({
          executable: input.codexNativeExecutable.path,
          codexHome: executorRuntime.codexHome,
          model: input.launch.model.modelId,
          workingDirectory: worktree,
          rolloutBudget: { kind: 'unbounded' },
          outputSchemaPath: executorSchemaPath,
          outputLastMessagePath: executorOutputPath,
          developerInstructions: commonDeveloperInstructions('executor'),
          prompt: convergenceExecutorPrompt(input.launch, allowedPaths, input.baselineSha),
          filesystemAccess: 'write',
          agentExecutionMode: 'natural_agent_graph',
          nodeExecutable: input.nodeExecutable.path,
          modelCatalogPath: executorRuntime.modelCatalogPath,
          providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
          processContainer: executorRuntime.processContainer,
          persistThreadLedger: true,
        }),
        input.deadlineEpochMs,
      ),
  );
  writeAdaptiveDevelopmentProcessLogs(input.runDirectory, 'convergence-executor', executor);
  const executorTelemetry = parseAdaptiveDevelopmentCodexTelemetry(executor.stdout);
  if (!codexProcessSucceeded(executor, executorTelemetry, executorOutputPath)) {
    throw new Error(
      `convergence candidate executor failed before terminal usage: ${tail(executor.stderr || executor.stdout)}`,
    );
  }
  const executorOutput = parseExecutorOutput(readAdaptiveDevelopmentStructuredOutput(executorOutputPath));
  writeJson(join(input.runDirectory, 'executor-checkpoint.json'), executorOutput);
  const executorGraph = observeAdaptiveDevelopmentCodexAgentGraph({
    codexHome: executorRuntime.codexHome,
    rootTelemetry: executorTelemetry,
  });
  const freezeRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: input.runDirectory,
    role: 'post-model-freeze',
    instanceId: 'convergence-candidate',
    workingDirectory: worktree,
    sessionExecutable: input.codexNativeExecutable.path,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const freezeBoundary: ProcessContainerBoundary = {
    workingDirectory: worktree,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: freezeRuntime.processContainer,
  };
  const observedChangedPaths = await changedPaths(freezeBoundary, input.baselineSha, input.deadlineEpochMs);
  const allowed = new Set(allowedPaths);
  const hardInvariantMisses = observedChangedPaths
    .filter((path) => !allowed.has(path))
    .map((path) => `out-of-scope change: ${path}`);
  await checkedSandboxedGit(freezeBoundary, ['restore', '--staged', '--', '.'], input.deadlineEpochMs);
  await checkedSandboxedGit(freezeBoundary, ['add', '--', ...allowedPaths], input.deadlineEpochMs);
  const stagedPaths = await checkedSandboxedGit(
    freezeBoundary,
    ['diff', '--cached', '--name-only'],
    input.deadlineEpochMs,
  );
  if (stagedPaths) {
    await checkedSandboxedBenchmarkCommit(
      freezeBoundary,
      'runner',
      [
        '-m',
        `benchmark(convergence): ${input.task.id} candidate episode`,
        '-m',
        'Why: freeze remaining model-authored changes before independent post-hoc measurement.',
      ],
      input.deadlineEpochMs,
    );
  }
  const candidateSha = await checkedSandboxedGit(freezeBoundary, ['rev-parse', 'HEAD'], input.deadlineEpochMs);
  const candidatePatch = await checkedSandboxedGit(
    freezeBoundary,
    ['diff', '--binary', '--no-ext-diff', '--no-textconv', input.baselineSha, candidateSha, '--', ...allowedPaths],
    input.deadlineEpochMs,
  );
  const executorSessionId = requireConvergenceSessionId(executorTelemetry, 'candidate executor');
  const executorRoleKey = convergenceRoleKey(input.canaryPlanSha256, 'executor');
  const candidateIdentity = {
    finalSha: candidateSha,
    diffRef: `${input.baselineSha}..${candidateSha}`,
    patchSha256: candidatePatchSha256(candidatePatch),
  };
  const independentReview = observeAdaptiveDevelopmentRuntimeIndependentReview({
    executorJsonl: executor.stdout,
    graph: executorGraph,
    candidate: candidateIdentity,
    codexHome: executorRuntime.codexHome,
  });
  return {
    candidate: {
      round: 1,
      candidateSha,
      candidatePatchSha256: candidateIdentity.patchSha256,
      candidateDiffRef: candidateIdentity.diffRef,
      executorRoleKey,
      executorSessionId,
      executorEpisode: {
        ...adaptiveDevelopmentAgentEpisode(executorGraph),
      },
      executorCheckpoint: executorOutput,
      ...(independentReview ? { independentReview } : {}),
      executorPrincipalId: convergencePrincipalId(executorRoleKey),
      hardInvariantMisses,
    },
    runtime: { worktree, observedChangedPaths, executorTelemetry, executorGraph, executorOutput },
  };
}

async function runConvergenceJudge(input: {
  readonly repositoryRoot: string;
  readonly runDirectory: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly task: AdaptiveDevelopmentBenchmarkManifest['tasks'][number];
  readonly candidate: AdaptiveDevelopmentConvergenceCandidate;
  readonly runtime: ConvergenceEpisodeRuntime;
  readonly baselineSha: string;
  readonly canaryPlanSha256: string;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly reviewBoundaryRubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly deadlineEpochMs: number;
}): Promise<AdaptiveDevelopmentConvergenceJudgeResult> {
  const judgeWorktree = join(input.runDirectory, 'oracle-sandbox', 'judge', 'workspace');
  await materializeAdaptiveDevelopmentOracleSnapshot({
    gitExecutable: BENCHMARK_GIT_EXECUTABLE,
    sourceRepository: input.runtime.worktree,
    destination: judgeWorktree,
    finalSha: input.candidate.candidateSha,
    deadlineEpochMs: input.deadlineEpochMs,
  });
  const [judgeHead, judgeStatus, candidatePatch, candidatePathListing] = await Promise.all([
    checkedCommand(BENCHMARK_GIT_EXECUTABLE, ['rev-parse', 'HEAD'], judgeWorktree, input.deadlineEpochMs),
    checkedCommand(
      BENCHMARK_GIT_EXECUTABLE,
      ['status', '--porcelain=v1', '--untracked-files=all'],
      judgeWorktree,
      input.deadlineEpochMs,
    ),
    checkedCommand(
      BENCHMARK_GIT_EXECUTABLE,
      [
        'diff',
        '--binary',
        '--no-ext-diff',
        '--no-textconv',
        input.baselineSha,
        input.candidate.candidateSha,
        '--',
        ...(input.task.allowedChangedPaths ?? []),
      ],
      judgeWorktree,
      input.deadlineEpochMs,
    ),
    checkedCommand(
      BENCHMARK_GIT_EXECUTABLE,
      ['ls-tree', '-r', '-z', '--name-only', input.candidate.candidateSha],
      judgeWorktree,
      input.deadlineEpochMs,
    ),
  ]);
  if (judgeHead !== input.candidate.candidateSha || judgeStatus) {
    throw new Error('post-hoc Judge workspace drifted before evaluation');
  }
  if (!input.candidate.executorEpisode) {
    throw new Error('post-hoc Judge requires the authenticated candidate agent graph');
  }
  const judgeContext = materializeConvergenceReviewBoundaryJudgeContext({
    workspace: judgeWorktree,
    projection: {
      candidatePatch,
      judgeContext: {
        candidateIdentity: {
          finalSha: input.candidate.candidateSha,
          diffRef: `${input.baselineSha}..${input.candidate.candidateSha}`,
          patchSha256: candidatePatchSha256(candidatePatch),
        },
        taskInput: input.task.executorInput,
        scope: {
          allowedChangedPaths: [...(input.task.allowedChangedPaths ?? [])],
          observedChangedPaths: [...input.runtime.observedChangedPaths],
        },
        episodeCheckpoint: {
          ...input.runtime.executorOutput,
          verificationCommands: [...input.runtime.executorOutput.verificationCommands],
        },
        agentEpisode: {
          ...input.candidate.executorEpisode,
          childSessionIds: [...input.candidate.executorEpisode.childSessionIds],
        },
        reviewEvidence: {
          schemaVersion: 'lf-0001.runner-authenticated-review-observation.v1',
          observed: Boolean(input.candidate.independentReview),
          independentReview: input.candidate.independentReview ?? null,
        },
      },
    },
    rubric: input.reviewBoundaryRubric,
  });
  const hiddenOracleSourcePaths = (input.task.oraclePolicy.checks ?? []).flatMap((check) =>
    'behaviorBundle' in check && 'sourcePath' in check.behaviorBundle ? [check.behaviorBundle.sourcePath] : [],
  );
  const treatmentArm = input.manifest.arms.find((arm) => arm.id === input.manifest.convergenceCanary.armId);
  if (!treatmentArm) throw new Error('post-hoc Judge cannot resolve the hidden treatment identity');
  sanitizeAdaptiveDevelopmentReviewWorkspace(judgeWorktree, hiddenOracleSourcePaths, [treatmentArm.skillSnapshot.path]);
  const judgeVisibility = buildAdaptiveDevelopmentReviewVisibilityManifest({
    root: judgeWorktree,
    candidateSha: input.candidate.candidateSha,
    candidatePaths: candidatePathListing.split('\0').filter(Boolean),
    runnerProvidedPaths: CONVERGENCE_REVIEW_BOUNDARY_JUDGE_EVIDENCE_PATHS,
  });
  if (judgeVisibility.candidateSha !== input.candidate.candidateSha) {
    throw new Error('post-hoc Judge visibility manifest does not bind the immutable candidate');
  }
  writeJson(join(input.runDirectory, 'judge-visible-candidate.json'), judgeVisibility);
  const judgeRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: input.runDirectory,
    role: 'post-hoc-judge',
    instanceId: 'convergence-judge',
    workingDirectory: judgeWorktree,
    sessionExecutable: input.codexNativeExecutable.path,
    ...benchmarkSessionCredentialInput({
      codexNativeExecutable: input.codexNativeExecutable,
    }),
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
    writeProtectedPaths: [judgeWorktree],
  });
  await assertLocalToolSandbox({
    codexExecutable: input.codexExecutable,
    nodeExecutable: input.nodeExecutable,
    repositoryRoot: input.repositoryRoot,
    workingDirectory: judgeWorktree,
    filesystemAccess: 'read',
    processContainer: judgeRuntime.processContainer,
    readableProbePath: join(judgeContext, 'candidate.patch'),
    deniedWriteProbePath: join(judgeContext, 'episode-checkpoint.json'),
    deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
    deadlineEpochMs: input.deadlineEpochMs,
  });
  await assertBenchmarkModelCatalogAccepted({
    codexExecutable: input.codexExecutable,
    modelCatalogPath: judgeRuntime.modelCatalogPath,
    workingDirectory: judgeWorktree,
    modelId: input.manifest.model.modelId,
    deadlineEpochMs: input.deadlineEpochMs,
  });
  assertRuntimeArtifacts(input.runtimeArtifacts);
  await assertTrustedExecutable(input.codexNativeExecutable, judgeWorktree, input.deadlineEpochMs);
  const judgeSchemaPath = join(judgeRuntime.controlDirectory, 'review-boundary-output.schema.json');
  const judgeOutputPath = join(judgeRuntime.controlDirectory, 'review-boundary-output.json');
  writeJson(judgeSchemaPath, CONVERGENCE_JUDGE_OUTPUT_SCHEMA);
  const judge = await withBenchmarkSessionCredential(
    judgeRuntime,
    async () =>
      await runAdaptiveDevelopmentProcess(
        buildAdaptiveDevelopmentCodexInvocation({
          executable: input.codexNativeExecutable.path,
          codexHome: judgeRuntime.codexHome,
          model: input.manifest.model.modelId,
          workingDirectory: judgeWorktree,
          rolloutBudget: { kind: 'unbounded' },
          outputSchemaPath: judgeSchemaPath,
          outputLastMessagePath: judgeOutputPath,
          developerInstructions: commonDeveloperInstructions('judge'),
          prompt: convergenceReviewBoundaryPrompt({
            executorInput: input.task.executorInput,
            allowedChangedPaths: input.task.allowedChangedPaths ?? [],
          }),
          filesystemAccess: 'read',
          agentExecutionMode: 'single_agent',
          nodeExecutable: input.nodeExecutable.path,
          modelCatalogPath: judgeRuntime.modelCatalogPath,
          providerTransportTrustPath: judgeRuntime.providerTransportTrustPath,
          processContainer: judgeRuntime.processContainer,
          skipGitRepositoryCheck: true,
        }),
        input.deadlineEpochMs,
      ),
  );
  writeAdaptiveDevelopmentProcessLogs(input.runDirectory, 'convergence-judge', judge);
  const judgeTelemetry = parseAdaptiveDevelopmentCodexTelemetry(judge.stdout);
  if (!codexProcessSucceeded(judge, judgeTelemetry, judgeOutputPath)) {
    throw new Error(`convergence post-hoc Judge failed before terminal usage: ${tail(judge.stderr || judge.stdout)}`);
  }
  assertAdaptiveDevelopmentReviewVisibilityIntegrity(judgeWorktree, judgeVisibility);
  const judgeOutput = parseConvergenceJudgeOutput(readAdaptiveDevelopmentStructuredOutput(judgeOutputPath));
  assertConvergenceJudgeEvidence({
    judge: judgeOutput,
    judgeStdout: judge.stdout,
    visibility: judgeVisibility,
    visibilityRoots: {
      candidateRoot: input.runtime.worktree,
      runnerProvidedRoot: judgeWorktree,
    },
  });
  writeJson(join(input.runDirectory, 'review-boundary-judge.json'), judgeOutput);
  input.runtime.judgeTelemetry = judgeTelemetry;
  const judgeSessionId = requireConvergenceSessionId(judgeTelemetry, 'post-hoc Judge');
  const judgeRoleKey = convergenceRoleKey(input.canaryPlanSha256, 'judge');
  return {
    candidateSha: input.candidate.candidateSha,
    judgeSessionId,
    judgePrincipalId: convergencePrincipalId(judgeRoleKey),
    judgeRoleKey,
    verdict: judgeOutput.verdict,
    reviewDemand: judgeOutput.reviewDemand,
    observedReviewState: judgeOutput.observedReviewState,
    findings: judgeOutput.findings,
  };
}

function assertConvergenceCanaryStorageCapacity(storagePath: string, footprintPath: string): void {
  const freeBytes = stageAdmissionFreeBytes(storagePath);
  const requiredFreeBytes = CONVERGENCE_CANARY_MINIMUM_FREE_BYTES + CONVERGENCE_CANARY_MAXIMUM_FOOTPRINT_BYTES;
  if (freeBytes < requiredFreeBytes) {
    throw new Error(
      `convergence canary storage guard requires ${requiredFreeBytes} free bytes before execution; found ${freeBytes}`,
    );
  }
  const footprintBytes = measureAdaptiveDevelopmentDirectoryFootprintBytes(footprintPath);
  if (footprintBytes > CONVERGENCE_CANARY_MAXIMUM_FOOTPRINT_BYTES) {
    throw new Error(
      `convergence canary footprint exceeded ${CONVERGENCE_CANARY_MAXIMUM_FOOTPRINT_BYTES} bytes; found ${footprintBytes}`,
    );
  }
}

function buildConvergenceCanaryStorageGuard(
  storagePath: string,
  footprintPath: string,
): AdaptiveDevelopmentDirectoryStorageGuard {
  return buildAdaptiveDevelopmentDirectoryStorageGuard({
    label: 'convergence canary',
    storagePath,
    footprintPath,
    intervalMs: CONVERGENCE_CANARY_STORAGE_GUARD_INTERVAL_MS,
    minimumFreeBytes: CONVERGENCE_CANARY_MINIMUM_FREE_BYTES,
    maximumFootprintBytes: CONVERGENCE_CANARY_MAXIMUM_FOOTPRINT_BYTES,
  });
}

function cleanupConvergenceCanaryEphemeralWorktrees(runDirectory: string): void {
  for (const relativePath of ['sandbox', 'oracle-sandbox'] as const) {
    const target = resolve(runDirectory, relativePath);
    if (relative(runDirectory, target) !== relativePath) {
      throw new Error(`convergence canary cleanup escaped its run directory: ${relativePath}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
}

function persistConvergenceCanaryStorageGuardFailure(runDirectory: string, storagePath: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!/^convergence canary (?:footprint exceeded|free-space floor)/.test(message)) return;
  const processResult = error instanceof AdaptiveDevelopmentStorageGuardProcessError ? error.processResult : undefined;
  writeJson(join(runDirectory, 'convergence-storage-guard-failure.json'), {
    schemaVersion: 'lf-0001.convergence-storage-guard-failure.v1',
    message,
    footprintBytes: measureAdaptiveDevelopmentDirectoryFootprintBytes(runDirectory),
    freeBytes: stageAdmissionFreeBytes(storagePath),
    ...(processResult
      ? {
          elapsedMs: processResult.elapsedMs,
          exitCode: processResult.exitCode,
          signal: processResult.signal,
          stdoutTail: tail(processResult.stdout),
          stderrTail: tail(processResult.stderr),
        }
      : {}),
  });
}

interface ProviderBackedConvergenceCanaryInput {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly plan: AdaptiveDevelopmentConvergenceCanaryPlan;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly modelCatalog: BenchmarkModelCatalog;
}

interface ProviderBackedConvergenceCanaryOutput {
  readonly result: Awaited<ReturnType<typeof runAdaptiveDevelopmentConvergenceCanary>>;
  readonly usage: readonly AdaptiveDevelopmentConvergenceCanaryUsage[];
  readonly timing: AdaptiveDevelopmentConvergenceCanaryReceipt['timing'];
}

async function executeProviderBackedConvergenceCanary(
  input: ProviderBackedConvergenceCanaryInput,
): Promise<ProviderBackedConvergenceCanaryOutput> {
  const runDirectory = join(input.runRoot, 'convergence-canary');
  mkdirSync(runDirectory, { recursive: true });
  assertConvergenceCanaryStorageCapacity(input.runRoot, runDirectory);
  if (activeConvergenceCanaryStorageGuard) {
    throw new Error('convergence canary storage guard is already installed');
  }
  const storageGuard = buildConvergenceCanaryStorageGuard(input.runRoot, runDirectory);
  activeConvergenceCanaryStorageGuard = storageGuard;
  try {
    storageGuard.check();
    return await executeProviderBackedConvergenceCanaryUnderStorageGuard(input, runDirectory, storageGuard);
  } catch (error) {
    persistConvergenceCanaryStorageGuardFailure(runDirectory, input.runRoot, error);
    throw error;
  } finally {
    activeConvergenceCanaryStorageGuard = undefined;
    cleanupConvergenceCanaryEphemeralWorktrees(runDirectory);
  }
}

async function executeProviderBackedConvergenceCanaryUnderStorageGuard(
  input: ProviderBackedConvergenceCanaryInput,
  runDirectory: string,
  storageGuard: AdaptiveDevelopmentDirectoryStorageGuard,
): Promise<ProviderBackedConvergenceCanaryOutput> {
  const canary = input.manifest.convergenceCanary;
  const task = input.manifest.tasks.find((candidate) => candidate.id === canary.taskId);
  const arm = input.manifest.arms.find((candidate) => candidate.id === canary.armId);
  if (!task || task.source.kind !== 'local_history' || !arm) {
    throw new Error('convergence canary manifest no longer resolves its exact local task and treatment arm');
  }
  const scope = input.plan.scope;
  if (scope.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    throw new Error('convergence canary execution requires a current exact scope');
  }
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.plan);
  const launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number] = {
    runKey: `convergence:${canary.id}`,
    stageId: 'non-scoring-convergence-canary',
    taskId: task.id,
    armId: arm.id,
    repetition: 0,
    runtimeCommit: input.manifest.runtimeCommit,
    skillSnapshot: arm.skillSnapshot,
    model: input.manifest.model,
    taskInputSha256: fingerprintAdaptiveDevelopmentBenchmark(task.executorInput),
    executorInput: task.executorInput,
    environmentSha256: scope.environmentSha256,
    budget: { tokenPolicy: 'unbounded', wallTimeMsCap: scope.candidateWallTimeMsCap },
  };
  const baselineMaterialized = await materializeRunWorktree(
    input.repositoryRoot,
    runDirectory,
    input.manifest,
    launch,
    Date.now() + CONVERGENCE_CANARY_PREPARATION_WALL_TIME_MS_CAP,
  );
  const baselineSha = baselineMaterialized.baselineSha;
  const lifecycleStartedAtEpochMs = Date.now();
  let candidateCompletedAtEpochMs: number | undefined;
  let adjudicationStartedAtEpochMs: number | undefined;
  const beginAdjudication = (): number => {
    if (candidateCompletedAtEpochMs === undefined) {
      throw new Error('convergence adjudication cannot begin before candidate freeze');
    }
    adjudicationStartedAtEpochMs ??= candidateCompletedAtEpochMs;
    return adjudicationStartedAtEpochMs;
  };
  const developmentDeadlineEpochMs = deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs({
    lifecycleStartedAtEpochMs,
    candidateStartedAtEpochMs: lifecycleStartedAtEpochMs,
    candidateWallTimeMsCap: scope.candidateWallTimeMsCap,
    wallTimeMsCap: scope.wallTimeMsCap,
  });
  let episodeRuntime: ConvergenceEpisodeRuntime | undefined;
  const result = await runAdaptiveDevelopmentConvergenceCanary({
    execute: async () => {
      const execution = await runConvergenceExecutorEpisode({
        repositoryRoot: input.repositoryRoot,
        runRoot: input.runRoot,
        runDirectory,
        manifest: input.manifest,
        launch,
        task,
        canaryPlanSha256,
        initialWorktree: baselineMaterialized.worktree,
        baselineSha,
        codexExecutable: input.codexExecutable,
        codexNativeExecutable: input.codexNativeExecutable,
        nodeExecutable: input.nodeExecutable,
        runtimeArtifacts: input.runtimeArtifacts,
        modelCatalog: input.modelCatalog,
        deadlineEpochMs: developmentDeadlineEpochMs,
      });
      episodeRuntime = execution.runtime;
      candidateCompletedAtEpochMs = Date.now();
      return execution.candidate;
    },
    evaluate: async (candidate) => {
      const runtime = episodeRuntime;
      if (!runtime) throw new Error('convergence episode has no exact executor runtime');
      const adjudicationDeadlineEpochMs = deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        adjudicationStartedAtEpochMs: beginAdjudication(),
        adjudicationWallTimeMsCap: scope.adjudicationWallTimeMsCap,
        wallTimeMsCap: scope.wallTimeMsCap,
      });
      const oracle = await runIsolatedOracle({
        repositoryRoot: input.repositoryRoot,
        sourceWorktree: runtime.worktree,
        runDirectory,
        candidateSha: candidate.candidateSha,
        task,
        oracleSetId: 'convergence-episode',
        sessionExecutable: input.codexNativeExecutable.path,
        nodeExecutable: input.nodeExecutable.path,
        modelCatalog: input.modelCatalog,
        oracleToolchain: input.oracleToolchain,
        deadlineEpochMs: adjudicationDeadlineEpochMs,
      });
      writeJson(join(runDirectory, 'oracle-episode.json'), oracle);
      if (!oracle.passed) {
        const repeatedOracle = await runIsolatedOracle({
          repositoryRoot: input.repositoryRoot,
          sourceWorktree: runtime.worktree,
          runDirectory,
          candidateSha: candidate.candidateSha,
          task,
          oracleSetId: 'convergence-episode-repeatability',
          sessionExecutable: input.codexNativeExecutable.path,
          nodeExecutable: input.nodeExecutable.path,
          modelCatalog: input.modelCatalog,
          oracleToolchain: input.oracleToolchain,
          deadlineEpochMs: adjudicationDeadlineEpochMs,
        });
        writeJson(join(runDirectory, 'oracle-episode-repeatability.json'), repeatedOracle);
        assertConvergenceOracleRepeatability(oracle, repeatedOracle);
      }
      return convergenceOracleResult(candidate.candidateSha, oracle);
    },
    judge: async (candidate) => {
      const runtime = episodeRuntime;
      if (!runtime) throw new Error('convergence episode has no exact executor runtime');
      const adjudicationDeadlineEpochMs = deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs({
        lifecycleStartedAtEpochMs,
        adjudicationStartedAtEpochMs: beginAdjudication(),
        adjudicationWallTimeMsCap: scope.adjudicationWallTimeMsCap,
        wallTimeMsCap: scope.wallTimeMsCap,
      });
      return await runConvergenceJudge({
        repositoryRoot: input.repositoryRoot,
        runDirectory,
        manifest: input.manifest,
        task,
        candidate,
        runtime,
        baselineSha,
        canaryPlanSha256,
        codexExecutable: input.codexExecutable,
        codexNativeExecutable: input.codexNativeExecutable,
        nodeExecutable: input.nodeExecutable,
        runtimeArtifacts: input.runtimeArtifacts,
        reviewBoundaryRubric: scope.reviewBoundaryRubric,
        modelCatalog: input.modelCatalog,
        deadlineEpochMs: adjudicationDeadlineEpochMs,
      });
    },
  });
  writeJson(join(runDirectory, 'convergence-result.json'), result);
  if (!episodeRuntime?.judgeTelemetry) throw new Error('convergence canary is missing terminal Judge usage');
  const usage = [
    convergenceUsage('executor', episodeRuntime.executorTelemetry, episodeRuntime.executorGraph),
    convergenceUsage('judge', episodeRuntime.judgeTelemetry),
  ];
  const measurementCompletedAtEpochMs = Date.now();
  if (candidateCompletedAtEpochMs === undefined || adjudicationStartedAtEpochMs === undefined) {
    throw new Error('convergence canary timing is missing a candidate or adjudication boundary');
  }
  const timing = {
    candidateElapsedMs: candidateCompletedAtEpochMs - lifecycleStartedAtEpochMs,
    adjudicationElapsedMs: measurementCompletedAtEpochMs - adjudicationStartedAtEpochMs,
    totalMeasuredElapsedMs:
      candidateCompletedAtEpochMs - lifecycleStartedAtEpochMs +
      (measurementCompletedAtEpochMs - adjudicationStartedAtEpochMs),
  };
  storageGuard.check();
  return { result, usage, timing };
}

function combineGraphAndJudgeTelemetry(
  executor: AdaptiveDevelopmentCodexAgentGraphObservation,
  judge: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
): CostTelemetry {
  const judgeSessionId = requireConvergenceSessionId(judge, 'post-hoc Judge');
  if (executor.accountedSessionIds.includes(judgeSessionId)) {
    throw new Error('post-hoc Judge session is already part of the candidate agent graph');
  }
  return {
    inputTokens: executor.inputTokens + judge.inputTokens,
    cachedInputTokens: executor.cachedInputTokens + judge.cachedInputTokens,
    outputTokens: executor.outputTokens + judge.outputTokens,
    toolCalls: executor.toolCalls + judge.toolCalls,
    failedToolCalls: executor.failedToolCalls + judge.failedToolCalls,
    behavioralFailedToolCalls: executor.behavioralFailedToolCalls + judge.behavioralFailedToolCalls,
    infrastructureFailedToolCalls: executor.infrastructureFailedToolCalls + judge.infrastructureFailedToolCalls,
    usageComplete: executor.usageComplete && judge.usageObserved,
    accountedSessionIds: [...executor.accountedSessionIds, judgeSessionId],
  };
}

function graphOnlyCost(graph: AdaptiveDevelopmentCodexAgentGraphObservation): CostTelemetry {
  return {
    inputTokens: graph.inputTokens,
    cachedInputTokens: graph.cachedInputTokens,
    outputTokens: graph.outputTokens,
    toolCalls: graph.toolCalls,
    failedToolCalls: graph.failedToolCalls,
    behavioralFailedToolCalls: graph.behavioralFailedToolCalls,
    infrastructureFailedToolCalls: graph.infrastructureFailedToolCalls,
    usageComplete: graph.usageComplete,
    accountedSessionIds: [...graph.accountedSessionIds],
  };
}

function singleSessionCost(telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>): CostTelemetry {
  const accountedSessionIds = telemetry.threadId ? [telemetry.threadId] : [];
  return {
    inputTokens: telemetry.inputTokens,
    cachedInputTokens: telemetry.cachedInputTokens,
    outputTokens: telemetry.outputTokens,
    toolCalls: telemetry.toolCalls,
    failedToolCalls: telemetry.failedToolCalls,
    behavioralFailedToolCalls: telemetry.behavioralFailedToolCalls,
    infrastructureFailedToolCalls: telemetry.infrastructureFailedToolCalls,
    usageComplete: telemetry.usageObserved && telemetry.childThreadIds.length === 0 && accountedSessionIds.length === 1,
    accountedSessionIds,
  };
}

function persistInfrastructureError(input: {
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly attempt: 1 | 2;
  readonly supersedesReceiptSha256?: string;
  readonly runId: string;
  readonly runDirectory: string;
  readonly baselineSha: string;
  readonly attemptReservationSha256: string;
  readonly startedAt: Date;
  readonly elapsedMs: number;
  readonly timedOut: boolean;
  readonly telemetry: CostTelemetry;
  readonly evidenceStore: LocalAdaptiveDevelopmentBenchmarkEvidenceStore;
  readonly artifactStore: LocalAdaptiveDevelopmentBenchmarkArtifactStore;
}): RunAttemptResult {
  const evidenceInput: Omit<AdaptiveDevelopmentBenchmarkEvidence, 'artifacts'> = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_EVIDENCE_VERSION,
    benchmarkId: input.manifest.benchmarkId,
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(input.manifest),
    runId: input.runId,
    stageId: input.launch.stageId,
    taskId: input.launch.taskId,
    armId: input.launch.armId,
    repetition: input.launch.repetition,
    attempt: input.attempt,
    launchPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(input.launchPlan),
    ...(input.supersedesReceiptSha256 ? { supersedesReceiptSha256: input.supersedesReceiptSha256 } : {}),
    candidate: {
      finalSha: input.baselineSha,
      diffRef: `${input.baselineSha}..${input.baselineSha}`,
      patchSha256: candidatePatchSha256(''),
    },
    provenance: {
      runtimeCommit: input.launch.runtimeCommit,
      skillSnapshot: input.launch.skillSnapshot,
      taskInputSha256: input.launch.taskInputSha256,
      environmentSha256: input.launch.environmentSha256,
      attemptReservationSha256: input.attemptReservationSha256,
      model: input.launch.model,
    },
    budget: input.launch.budget,
    execution: {
      status: input.timedOut ? 'timeout' : 'infrastructure_error',
      startedAt: input.startedAt.toISOString(),
      elapsedMs: input.elapsedMs,
    },
    outcome: {
      claimed: 'not_achieved',
      oracle: 'not_run',
      verificationExactBound: false,
      checkpointTruthful: true,
      judge: {
        verdict: 'sop_noncompliant',
        reviewDemand: 'indeterminate',
        observedReviewState: 'unknown',
        exactBinding: false,
        blind: true,
        candidateSessionId: 'candidate-not-run',
        judgeSessionId: 'judge-not-run',
        findings: { p1: 0, p2: 0, p3: 0 },
      },
    },
    safety: { hardInvariantMisses: [] },
    cost: {
      inputTokens: input.telemetry.inputTokens,
      cachedInputTokens: input.telemetry.cachedInputTokens,
      outputTokens: input.telemetry.outputTokens,
      toolCalls: input.telemetry.toolCalls,
      failedToolCalls: input.telemetry.failedToolCalls,
      behavioralFailedToolCalls: input.telemetry.behavioralFailedToolCalls,
      infrastructureFailedToolCalls: input.telemetry.infrastructureFailedToolCalls,
      usageComplete: input.telemetry.usageComplete,
      accountedSessionIds: [...input.telemetry.accountedSessionIds],
    },
    operatorInterventions: 0,
  };
  const evidence = attachAdaptiveDevelopmentBenchmarkArtifacts(evidenceInput, input.manifest, input.artifactStore);
  writeJson(join(input.runDirectory, 'evidence.json'), evidence);
  const receipt = parseAdaptiveDevelopmentBenchmarkReceipt(input.evidenceStore.write(evidence));
  writeJson(join(input.runDirectory, 'receipt.json'), receipt);
  return { receipt, infrastructureError: !input.timedOut, stopStage: input.timedOut };
}

function buildLaunchScope(
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  stageId: string,
  environmentSha256: string,
  executionMode: 'live' | 'fixture',
  stageAdmission?: AdaptiveDevelopmentStageAdmissionBinding,
): AdaptiveDevelopmentBenchmarkLaunchScope {
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${stageId}`);
  return buildAdaptiveDevelopmentBenchmarkLaunchScope(manifest, stageId, {
    executionMode,
    environmentSha256,
    ...(stageAdmission ? { stageAdmission } : {}),
    budgetByTask: Object.fromEntries(
      stage.taskIds.map((taskId) => [taskId, { tokenPolicy: 'unbounded', wallTimeMsCap: stage.wallTimeMsCap }]),
    ),
    stageBudget: {
      tokenPolicy: 'unbounded',
      maximumInfrastructureRetryAttempts: 1,
    },
  });
}

async function loadValidatedStageAdmissionBinding(
  args: CliArgs,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  oracleToolchainSha256: string,
): Promise<AdaptiveDevelopmentStageAdmissionBinding | undefined> {
  if (args.mode !== 'prepare' && args.mode !== 'live') return undefined;
  const stage = manifest.stages.find((candidate) => candidate.id === args.stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${args.stageId}`);
  if (stage.horizon !== 'long') return undefined;
  if (!args.admissionResultPath) {
    throw new Error(`long-horizon ${args.mode} requires --admission-result from the exact admitted runner`);
  }
  const resultArtifact = readFileSync(args.admissionResultPath, 'utf8');
  const scopePath = join(dirname(args.admissionResultPath), 'admission-scope.json');
  const scope = JSON.parse(readFileSync(scopePath, 'utf8'));
  const runnerCommit = await checkedCommand(
    'git',
    ['rev-parse', 'HEAD'],
    args.repositoryRoot,
    Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS,
  );
  return validateAdaptiveDevelopmentStageAdmission({
    manifest,
    stageId: stage.id,
    expectedRunnerCommit: runnerCommit,
    expectedOracleToolchainSha256: oracleToolchainSha256,
    scope,
    resultArtifact,
  });
}

async function loadAuthorizedLiveLaunchPlan(
  path: string,
  expectedScope: AdaptiveDevelopmentBenchmarkLaunchScope,
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
  messageStore: Pick<RedisMessageStore, 'getById'>,
): Promise<AdaptiveDevelopmentBenchmarkLaunchPlan> {
  const plan = parseAdaptiveDevelopmentBenchmarkLaunchPlan(JSON.parse(readFileSync(path, 'utf8')));
  if (plan.executionMode !== 'live' || plan.authorization.kind !== 'operator_approval') {
    throw new Error('live execution requires an operator-approved live launch plan');
  }
  const expectedScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(expectedScope);
  const embeddedScope = adaptiveDevelopmentBenchmarkLaunchScope(plan);
  if (
    plan.launchScopeSha256 !== expectedScopeSha256 ||
    plan.authorization.approvedLaunchScopeSha256 !== expectedScopeSha256 ||
    fingerprintAdaptiveDevelopmentBenchmark(embeddedScope) !== expectedScopeSha256
  ) {
    throw new Error('live launch plan does not bind the current exact environment, matrix, and stage budget');
  }
  if (Date.parse(plan.authorization.approvedAt) >= Date.now()) {
    throw new Error('operator authorization must precede live execution');
  }
  await verifyAdaptiveDevelopmentOperatorApproval({
    authorization: plan.authorization,
    stageBudget: plan.stageBudget,
    authority,
    resolver: messageStore,
  });
  return plan;
}

async function runPreflight(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly scope: AdaptiveDevelopmentBenchmarkLaunchScope;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly carrierReadiness: CarrierReadinessArtifact;
}): Promise<void> {
  assertRuntimeArtifacts(input.runtimeArtifacts);
  assertAdaptiveDevelopmentSealedOracleToolchain(input.oracleToolchain);
  assertCarrierReadinessArtifact(input.carrierReadiness);
  const preflights = [];
  for (const launch of input.scope.runs) {
    const runDirectory = join(input.runRoot, 'preflight', `probe-${randomUUID()}`);
    mkdirSync(runDirectory, { recursive: true });
    const siblingWorkspace = join(runDirectory, 'permission-profile-denied-probes', 'other-anonymous-workspace');
    const siblingWorkspaceProbe = join(siblingWorkspace, 'package.json');
    mkdirSync(siblingWorkspace, { recursive: true });
    writeFileSync(siblingWorkspaceProbe, '{"name":"other-anonymous-workspace"}\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    const deadlineEpochMs = Date.now() + launch.budget.wallTimeMsCap;
    const { worktree, baselineSha, task } = await materializeRunWorktree(
      input.repositoryRoot,
      runDirectory,
      input.manifest,
      launch,
      deadlineEpochMs,
    );
    const oracle = await runIsolatedOracle({
      repositoryRoot: input.repositoryRoot,
      sourceWorktree: worktree,
      runDirectory,
      candidateSha: baselineSha,
      task,
      oracleSetId: 'preflight-baseline',
      sessionExecutable: input.codexNativeExecutable.path,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
      oracleToolchain: input.oracleToolchain,
      deadlineEpochMs,
    });
    assertRedBaseline(task.id, oracle);
    const focusedCheck = taskFocusedCheck(task, input.nodeExecutable.path);
    let modelCatalogPath: string | undefined;
    for (const filesystemAccess of ['write', 'read'] as const) {
      const preflightRuntime = materializeBenchmarkSessionRuntime({
        runDirectory,
        role: filesystemAccess === 'write' ? 'executor' : 'reviewer',
        instanceId: `preflight-${filesystemAccess}`,
        workingDirectory: worktree,
        sessionExecutable: input.codexNativeExecutable.path,
        codexNativeExecutable: input.codexNativeExecutable.path,
        codexAuthPath: join(homedir(), '.codex', 'auth.json'),
        nodeExecutable: input.nodeExecutable.path,
        modelCatalog: input.modelCatalog,
      });
      modelCatalogPath ??= preflightRuntime.modelCatalogPath;
      await assertLocalToolSandbox({
        codexExecutable: input.codexNativeExecutable,
        nodeExecutable: input.nodeExecutable,
        repositoryRoot: input.repositoryRoot,
        workingDirectory: worktree,
        filesystemAccess,
        processContainer: preflightRuntime.processContainer,
        readableProbePath: join(worktree, 'package.json'),
        deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
        ...(filesystemAccess === 'write' && focusedCheck
          ? { focusedCheck, focusedCheckExitCode: oracle.checks[0]?.actualExitCode }
          : {}),
        deadlineEpochMs,
      });
      await withBenchmarkSessionCredential(
        preflightRuntime,
        async () =>
          await assertCodexProcessContainerStarts({
            codexExecutable: input.codexNativeExecutable,
            nodeExecutable: input.nodeExecutable,
            codexHome: preflightRuntime.codexHome,
            workingDirectory: worktree,
            processContainer: preflightRuntime.processContainer,
            deadlineEpochMs,
          }),
      );
      await assertCodexProcessContainerBoundary({
        codexNativeExecutable: input.codexNativeExecutable,
        nodeExecutable: input.nodeExecutable,
        codexStateDirectory: join(homedir(), '.codex'),
        workingDirectory: worktree,
        readableProbePath: join(worktree, 'package.json'),
        deniedReadProbePaths: [
          { label: 'source repository read', path: join(input.repositoryRoot, 'package.json') },
          { label: 'launch scope read', path: join(input.runRoot, 'launch-scope.json') },
          { label: 'outer process profile read', path: preflightRuntime.processContainer.sandboxProfilePath },
          { label: 'other anonymous workspace read', path: siblingWorkspaceProbe },
        ],
        deniedListProbePaths: [
          { label: 'workspace parent listing', path: dirname(worktree) },
          { label: 'run root listing', path: input.runRoot },
        ],
        filesystemAccess,
        processContainer: preflightRuntime.processContainer,
        deadlineEpochMs,
      });
    }
    if (!modelCatalogPath) throw new Error('preflight did not materialize a model catalog');
    await assertBenchmarkModelCatalogAccepted({
      codexExecutable: input.codexExecutable,
      modelCatalogPath,
      workingDirectory: worktree,
      modelId: launch.model.modelId,
      deadlineEpochMs,
    });
    preflights.push({ runKey: launch.runKey, baselineSha, baselineOracle: oracle, isolation: 'passed' });
  }
  writeJson(join(input.runRoot, 'preflight-result.json'), { status: 'passed', preflights });
}

async function loadAuthorizedOperationalCanaryPlan(
  path: string,
  expectedScope: ReturnType<typeof buildAdaptiveDevelopmentOperationalCanaryScope>,
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
  messageStore: Pick<RedisMessageStore, 'getById'>,
): Promise<AdaptiveDevelopmentOperationalCanaryPlan> {
  const plan = parseAdaptiveDevelopmentOperationalCanaryPlan(JSON.parse(readFileSync(path, 'utf8')));
  const expectedScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(expectedScope);
  if (
    plan.canaryScopeSha256 !== expectedScopeSha256 ||
    plan.authorization.approvedOperationalCanaryScopeSha256 !== expectedScopeSha256 ||
    fingerprintAdaptiveDevelopmentBenchmark(plan.scope) !== expectedScopeSha256
  ) {
    throw new Error('operational canary plan does not bind the current exact environment and token policy');
  }
  if (Date.parse(plan.authorization.approvedAt) >= Date.now()) {
    throw new Error('operational canary authorization must precede execution');
  }
  await verifyAdaptiveDevelopmentOperatorDirective({
    authorization: plan.authorization,
    authority,
    resolver: messageStore,
    directive: buildAdaptiveDevelopmentOperationalCanaryDirective(expectedScopeSha256, authority),
  });
  return plan;
}

function operationalCanaryOutput(path: string): { readonly carrierReady: true };
function operationalCanaryOutput(
  path: string,
  expectedMarkerSha256: string,
): { readonly carrierReady: true; readonly observedMarkerSha256: string };
function operationalCanaryOutput(
  path: string,
  expectedMarkerSha256?: string,
): { readonly carrierReady: true; readonly observedMarkerSha256?: string } {
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const expectedKeys = expectedMarkerSha256 ? ['carrierReady', 'observedMarkerSha256'] : ['carrierReady'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { carrierReady?: unknown }).carrierReady !== true ||
    Object.keys(value).sort().join(',') !== expectedKeys.sort().join(',') ||
    (expectedMarkerSha256 !== undefined &&
      (value as { observedMarkerSha256?: unknown }).observedMarkerSha256 !== expectedMarkerSha256)
  ) {
    throw new Error('operational canary did not return the exact schema-bound readiness object');
  }
  return {
    carrierReady: true,
    ...(expectedMarkerSha256
      ? { observedMarkerSha256: (value as { observedMarkerSha256: string }).observedMarkerSha256 }
      : {}),
  };
}

function assertOperationalCanaryTelemetry(
  role: 'executor' | 'reviewer',
  telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
): void {
  if (
    !adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry) ||
    telemetry.toolCalls < 1 ||
    telemetry.failedToolCalls !== 0
  ) {
    throw new Error(`${role} operational canary did not satisfy its real-provider tool and usage contract`);
  }
}

async function runOperationalCanary(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly environmentSha256: string;
  readonly plan: AdaptiveDevelopmentOperationalCanaryPlan;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly startedAt: string;
}): Promise<AdaptiveDevelopmentOperationalCanaryReceipt> {
  assertRuntimeArtifacts(input.runtimeArtifacts);
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.plan);
  const canaryDirectory = join(input.runRoot, 'operational-canary');
  const workspace = join(canaryDirectory, 'workspace');
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, 'package.json'), '{"name":"adaptive-operational-canary","private":true}\n', {
    encoding: 'utf8',
    flag: 'wx',
  });
  const deadlineEpochMs = Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS;
  await checkedCommand(
    BENCHMARK_GIT_EXECUTABLE,
    ['init', '--initial-branch=operational-canary'],
    workspace,
    deadlineEpochMs,
  );
  const rolePolicies = [
    {
      role: 'executor',
      filesystemAccess: 'write',
      tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
    },
    {
      role: 'reviewer',
      filesystemAccess: 'read',
      tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
    },
  ] as const;
  writeJson(join(input.runRoot, 'operational-canary-token-policy.json'), {
    schemaVersion: 'lf-0001.adaptive-operational-canary-token-policy.v1',
    canaryPlanSha256,
    canaryScopeSha256: input.plan.canaryScopeSha256,
    tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
    roles: rolePolicies,
  });

  const outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['carrierReady'],
    properties: { carrierReady: { type: 'boolean', const: true } },
  } as const;
  const credentialInput = {
    codexNativeExecutable: input.codexNativeExecutable.path,
    codexAuthPath: join(homedir(), '.codex', 'auth.json'),
  } as const;
  const markerPath = join(workspace, '.adaptive-operational-canary');
  const markerPayload = `adaptive-operational-canary-${randomUUID()}`;
  const markerContents = `${markerPayload}\n`;

  const executorRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: canaryDirectory,
    role: 'executor',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    ...credentialInput,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const executorSchemaPath = join(executorRuntime.controlDirectory, 'canary-output.schema.json');
  const executorOutputPath = join(executorRuntime.controlDirectory, 'canary-output.json');
  writeJson(executorSchemaPath, outputSchema);
  await assertTrustedExecutable(input.codexNativeExecutable, workspace, deadlineEpochMs);
  const executor = await withBenchmarkSessionCredential(executorRuntime, async () => {
    if (!existsSync(join(executorRuntime.codexHome, 'auth.json'))) {
      throw new Error('executor operational canary did not mount the trusted credential');
    }
    return await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexInvocation({
        executable: input.codexNativeExecutable.path,
        codexHome: executorRuntime.codexHome,
        model: input.plan.scope.modelId,
        workingDirectory: workspace,
        rolloutBudget: { kind: 'unbounded' },
        outputSchemaPath: executorSchemaPath,
        outputLastMessagePath: executorOutputPath,
        developerInstructions:
          'This is a single-use operational carrier canary. Use the standard local exec tool exactly as instructed; do not perform any other work.',
        prompt: `Use the local exec tool to run exactly: printf '${markerPayload}\\n' > .adaptive-operational-canary. Then return {"carrierReady":true}.`,
        filesystemAccess: 'write',
        agentExecutionMode: 'single_agent',
        nodeExecutable: input.nodeExecutable.path,
        modelCatalogPath: executorRuntime.modelCatalogPath,
        providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
        processContainer: executorRuntime.processContainer,
      }),
      deadlineEpochMs,
    );
  });
  writeAdaptiveDevelopmentProcessLogs(canaryDirectory, 'executor', executor);
  const executorTelemetry = parseAdaptiveDevelopmentCodexTelemetry(executor.stdout);
  assertOperationalCanaryTelemetry('executor', executorTelemetry);
  operationalCanaryOutput(executorOutputPath);
  if (readFileSync(markerPath, 'utf8') !== markerContents) {
    throw new Error('executor operational canary did not create the exact workspace marker');
  }
  if (existsSync(join(executorRuntime.codexHome, 'auth.json'))) {
    throw new Error('executor operational canary left the trusted credential mounted');
  }
  const markerSha256 = sha256File(markerPath);

  const postModelRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: canaryDirectory,
    role: 'post-model-freeze',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const postModelBoundary: ProcessContainerBoundary = {
    workingDirectory: workspace,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: postModelRuntime.processContainer,
  };
  await checkedSandboxedGit(
    postModelBoundary,
    ['add', '--', 'package.json', '.adaptive-operational-canary'],
    deadlineEpochMs,
  );
  await checkedSandboxedBenchmarkCommit(
    postModelBoundary,
    'operational_canary',
    ['-m', 'test(benchmark): freeze operational canary marker'],
    deadlineEpochMs,
  );
  const postModelCommit = await checkedSandboxedGit(postModelBoundary, ['rev-parse', 'HEAD'], deadlineEpochMs);

  const reviewerRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: canaryDirectory,
    role: 'reviewer',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    ...credentialInput,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const reviewerSchemaPath = join(reviewerRuntime.controlDirectory, 'canary-output.schema.json');
  const reviewerOutputPath = join(reviewerRuntime.controlDirectory, 'canary-output.json');
  writeJson(reviewerSchemaPath, {
    type: 'object',
    additionalProperties: false,
    required: ['carrierReady', 'observedMarkerSha256'],
    properties: {
      carrierReady: { type: 'boolean', const: true },
      observedMarkerSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    },
  });
  await assertTrustedExecutable(input.codexNativeExecutable, workspace, deadlineEpochMs);
  const reviewer = await withBenchmarkSessionCredential(reviewerRuntime, async () => {
    if (!existsSync(join(reviewerRuntime.codexHome, 'auth.json'))) {
      throw new Error('reviewer operational canary did not mount the trusted credential');
    }
    return await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexInvocation({
        executable: input.codexNativeExecutable.path,
        codexHome: reviewerRuntime.codexHome,
        model: input.plan.scope.modelId,
        workingDirectory: workspace,
        rolloutBudget: { kind: 'unbounded' },
        outputSchemaPath: reviewerSchemaPath,
        outputLastMessagePath: reviewerOutputPath,
        developerInstructions:
          'This is a single-use read-only operational carrier canary. Read only the instructed marker and do not perform any other work.',
        prompt:
          'Use the local exec tool to run exactly: /usr/bin/shasum -a 256 .adaptive-operational-canary. Return {"carrierReady":true,"observedMarkerSha256":"<the exact hash printed by that command>"}.',
        filesystemAccess: 'read',
        agentExecutionMode: 'single_agent',
        nodeExecutable: input.nodeExecutable.path,
        modelCatalogPath: reviewerRuntime.modelCatalogPath,
        providerTransportTrustPath: reviewerRuntime.providerTransportTrustPath,
        processContainer: reviewerRuntime.processContainer,
      }),
      deadlineEpochMs,
    );
  });
  writeAdaptiveDevelopmentProcessLogs(canaryDirectory, 'reviewer', reviewer);
  const reviewerTelemetry = parseAdaptiveDevelopmentCodexTelemetry(reviewer.stdout);
  assertOperationalCanaryTelemetry('reviewer', reviewerTelemetry);
  const reviewerOutput = operationalCanaryOutput(reviewerOutputPath, markerSha256);
  const reviewerObservation = assertAdaptiveDevelopmentOperationalCanaryReviewerObservation(
    reviewer.stdout,
    markerSha256,
  );
  if (sha256File(markerPath) !== markerSha256) {
    throw new Error('reviewer operational canary did not observe the frozen executor marker');
  }
  if (existsSync(join(reviewerRuntime.codexHome, 'auth.json'))) {
    throw new Error('reviewer operational canary left the trusted credential mounted');
  }

  const roleReceipt = <T extends 'write' | 'read'>(
    telemetry: ReturnType<typeof parseAdaptiveDevelopmentCodexTelemetry>,
    filesystemAccess: T,
  ) =>
    ({
      filesystemAccess,
      tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
      credentialMounted: true,
      credentialRemoved: true,
      completed: true,
      usageObserved: true,
      inputTokens: telemetry.inputTokens,
      cachedInputTokens: telemetry.cachedInputTokens,
      outputTokens: telemetry.outputTokens,
      toolCalls: telemetry.toolCalls,
      failedToolCalls: 0,
    }) as const;
  const receipt = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION,
    status: 'passed',
    zeroModelProvider: false,
    runnerCommit: input.plan.scope.runnerCommit,
    environmentSha256: input.environmentSha256,
    modelId: input.plan.scope.modelId,
    canaryScopeSha256: input.plan.canaryScopeSha256,
    canaryPlanSha256,
    tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
    completedAt: lifecycleTimestampAfter(input.startedAt),
    roles: {
      executor: { ...roleReceipt(executorTelemetry, 'write'), markerSha256, postModelCommit },
      reviewer: {
        ...roleReceipt(reviewerTelemetry, 'read'),
        observedMarkerSha256: reviewerOutput.observedMarkerSha256,
        observationCommandSha256: fingerprintAdaptiveDevelopmentBenchmark(reviewerObservation),
      },
    },
  } satisfies AdaptiveDevelopmentOperationalCanaryReceipt;
  assertAdaptiveDevelopmentOperationalCanaryReceipt(receipt);
  writeJson(join(input.runRoot, 'operational-canary-receipt.json'), receipt);
  return receipt;
}

async function loadTrustedOperationalCanaryExecution(
  planPath: string,
  baseEnvironment: Awaited<ReturnType<typeof buildEnvironment>>,
  approvalAuthority: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<{
  readonly record: AdaptiveDevelopmentOperationalCanaryExecutionRecord;
  readonly receipt: AdaptiveDevelopmentOperationalCanaryReceipt;
  readonly plan: AdaptiveDevelopmentOperationalCanaryPlan;
  readonly recordSha256: string;
}> {
  if (realpathSync(planPath) !== planPath) {
    throw new Error('operational canary plan path must already be canonical');
  }
  const plan = parseAdaptiveDevelopmentOperationalCanaryPlan(JSON.parse(readFileSync(planPath, 'utf8')));
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  const environmentSha256 = fingerprintAdaptiveDevelopmentBenchmark(baseEnvironment);
  const expectedScope = buildAdaptiveDevelopmentOperationalCanaryScope({
    runnerCommit: baseEnvironment.runnerCommit,
    environmentSha256,
    modelId: baseEnvironment.model.modelId,
  });
  if (
    plan.scope.runnerCommit !== baseEnvironment.runnerCommit ||
    plan.scope.environmentSha256 !== environmentSha256 ||
    plan.scope.modelId !== baseEnvironment.model.modelId ||
    plan.canaryScopeSha256 !== fingerprintAdaptiveDevelopmentBenchmark(expectedScope)
  ) {
    throw new Error('operational canary plan does not bind the current exact benchmark environment');
  }
  const { redis, authority: currentAuthority } = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before canary receipt verification');
    }
    await verifyAdaptiveDevelopmentOperatorDirective({
      authorization: plan.authorization,
      authority: approvalAuthority,
      resolver: new RedisMessageStore(redis),
      directive: buildAdaptiveDevelopmentOperationalCanaryDirective(plan.canaryScopeSha256, approvalAuthority),
    });
    const record = await new RedisAdaptiveDevelopmentOperationalCanaryExecutionStore(redis).get(canaryPlanSha256);
    if (record?.state !== 'passed' || !record.receipt || !record.receiptSha256 || !record.receiptArtifactSha256) {
      throw new Error('trusted operational canary ledger has no passing execution for this exact plan');
    }
    const receipt = record.receipt;
    if (
      fingerprintAdaptiveDevelopmentBenchmark(record.authority) !==
        fingerprintAdaptiveDevelopmentBenchmark(operationalCanaryAuthorityBinding(approvalAuthority)) ||
      fingerprintAdaptiveDevelopmentBenchmark(record.plan) !== canaryPlanSha256 ||
      receipt.runnerCommit !== baseEnvironment.runnerCommit ||
      receipt.environmentSha256 !== environmentSha256 ||
      receipt.modelId !== baseEnvironment.model.modelId ||
      receipt.canaryScopeSha256 !== plan.canaryScopeSha256 ||
      receipt.canaryPlanSha256 !== canaryPlanSha256 ||
      fingerprintAdaptiveDevelopmentBenchmark(receipt) !== record.receiptSha256 ||
      Date.parse(receipt.completedAt) <= Date.parse(plan.authorization.approvedAt)
    ) {
      throw new Error('trusted operational canary ledger does not bind the current benchmark environment');
    }
    return {
      record,
      receipt,
      plan,
      recordSha256: fingerprintAdaptiveDevelopmentBenchmark(record),
    };
  } finally {
    await redis.quit().catch(() => {});
  }
}

function operationalCanaryAuthorityBinding(authority: AdaptiveDevelopmentOperatorApprovalAuthority): {
  readonly operatorUserId: string;
  readonly threadId: string;
  readonly messageStoreIdentitySha256: string;
  readonly runtimeInstanceIdentitySha256: string;
} {
  return {
    operatorUserId: authority.operatorUserId,
    threadId: authority.threadId,
    messageStoreIdentitySha256: authority.messageStoreIdentitySha256,
    runtimeInstanceIdentitySha256: authority.runtimeInstanceIdentitySha256,
  };
}

async function runCarrierReadiness(input: {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly modelId: string;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly modelCatalog: BenchmarkModelCatalog;
}): Promise<CarrierReadinessArtifact> {
  assertRuntimeArtifacts(input.runtimeArtifacts);
  const readinessDirectory = join(input.runRoot, 'carrier-readiness');
  const workspace = join(readinessDirectory, 'workspace');
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, 'package.json'), '{"name":"adaptive-carrier-readiness","private":true}\n', {
    encoding: 'utf8',
    flag: 'wx',
  });
  const deadlineEpochMs = Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS;
  await checkedCommand(
    BENCHMARK_GIT_EXECUTABLE,
    ['init', '--initial-branch=carrier-readiness'],
    workspace,
    deadlineEpochMs,
  );
  const credentialInput = {
    codexNativeExecutable: input.codexNativeExecutable.path,
    codexAuthPath: join(homedir(), '.codex', 'auth.json'),
  } as const;
  const executorRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: readinessDirectory,
    role: 'executor',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    ...credentialInput,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const executorOutputSchemaPath = join(executorRuntime.controlDirectory, 'carrier-output.schema.json');
  const executorSystemResolverSocketAccessible = await runAdaptiveDevelopmentSystemResolverSocketProbe({
    workingDirectory: workspace,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: executorRuntime.processContainer,
    deadlineEpochMs,
  });
  const executorTrustBundleAccess = await probeProviderTrustBundleAccess({
    boundary: {
      workingDirectory: workspace,
      nodeExecutable: input.nodeExecutable.path,
      processContainer: executorRuntime.processContainer,
    },
    trustBundlePath: executorRuntime.providerTransportTrustPath,
    expected: 'passed',
    deadlineEpochMs,
  });
  const executorOutputLastMessagePath = join(executorRuntime.controlDirectory, 'carrier-output.json');
  writeJson(executorOutputSchemaPath, {
    type: 'object',
    additionalProperties: false,
    required: ['carrierReady'],
    properties: { carrierReady: { type: 'boolean', const: true } },
  });
  const {
    carrier: executor,
    graphCarrier: executorGraphCarrier,
    transport: executorTransport,
  } = await withBenchmarkSessionCredential(executorRuntime, async () => {
    if (!existsSync(join(executorRuntime.codexHome, 'auth.json'))) {
      throw new Error('executor carrier readiness did not mount the trusted session credential');
    }
    await assertCodexProcessContainerStarts({
      codexExecutable: input.codexNativeExecutable,
      nodeExecutable: input.nodeExecutable,
      codexHome: executorRuntime.codexHome,
      workingDirectory: workspace,
      processContainer: executorRuntime.processContainer,
      deadlineEpochMs,
    });
    const doctorResult = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexDoctorInvocation({
        executable: input.codexNativeExecutable.path,
        codexHome: executorRuntime.codexHome,
        model: input.modelId,
        workingDirectory: workspace,
        nodeExecutable: input.nodeExecutable.path,
        modelCatalogPath: executorRuntime.modelCatalogPath,
        providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
        processContainer: executorRuntime.processContainer,
      }),
      deadlineEpochMs,
    );
    writeAdaptiveDevelopmentCodexDoctorDiagnosticReport(
      join(readinessDirectory, 'executor-provider-doctor-report.json'),
      doctorResult,
    );
    const transport = assertAdaptiveDevelopmentCodexDoctorProviderTransport(doctorResult);
    const carrier = await runAdaptiveDevelopmentCodexCarrierSmoke({
      invocation: {
        executable: input.codexNativeExecutable.path,
        codexHome: executorRuntime.codexHome,
        model: input.modelId,
        workingDirectory: workspace,
        rolloutBudget: {
          kind: 'capped',
          tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
          reminderAtRemainingTokens: CARRIER_READINESS_REMINDER_TOKENS,
        },
        outputSchemaPath: executorOutputSchemaPath,
        outputLastMessagePath: executorOutputLastMessagePath,
        developerInstructions:
          'Execute the provider-supplied local readiness call, then return the schema-bound carrier object.',
        prompt: 'Complete the zero-cost local executor carrier readiness turn.',
        filesystemAccess: 'write',
        agentExecutionMode: 'natural_agent_graph',
        nodeExecutable: input.nodeExecutable.path,
        modelCatalogPath: executorRuntime.modelCatalogPath,
        providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
        processContainer: executorRuntime.processContainer,
      },
      deadlineEpochMs,
    });
    const graphCarrier = await runAdaptiveDevelopmentCodexAgentGraphCarrierSmoke({
      invocation: {
        executable: input.codexNativeExecutable.path,
        codexHome: executorRuntime.codexHome,
        model: input.modelId,
        workingDirectory: workspace,
        rolloutBudget: {
          kind: 'capped',
          tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
          reminderAtRemainingTokens: CARRIER_READINESS_REMINDER_TOKENS,
        },
        outputSchemaPath: executorOutputSchemaPath,
        outputLastMessagePath: join(executorRuntime.controlDirectory, 'agent-graph-carrier-output.json'),
        developerInstructions:
          'Exercise one zero-cost authenticated Formal Review child and return the schema-bound carrier object.',
        prompt: 'Complete the zero-cost natural agent graph readiness turn.',
        filesystemAccess: 'write',
        agentExecutionMode: 'natural_agent_graph',
        nodeExecutable: input.nodeExecutable.path,
        modelCatalogPath: executorRuntime.modelCatalogPath,
        providerTransportTrustPath: executorRuntime.providerTransportTrustPath,
        processContainer: executorRuntime.processContainer,
      },
      deadlineEpochMs,
    });
    return { carrier, graphCarrier, transport };
  });
  if (existsSync(join(executorRuntime.codexHome, 'auth.json'))) {
    throw new Error('executor carrier readiness left the trusted session credential mounted');
  }
  const freezeRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: readinessDirectory,
    role: 'post-model-freeze',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const freezeBoundary: ProcessContainerBoundary = {
    workingDirectory: workspace,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: freezeRuntime.processContainer,
  };
  await checkedSandboxedGit(
    freezeBoundary,
    ['add', '--', 'package.json', '.adaptive-carrier-smoke-tool'],
    deadlineEpochMs,
  );
  await checkedSandboxedBenchmarkCommit(
    freezeBoundary,
    'carrier_readiness',
    ['-m', 'test(benchmark): freeze carrier readiness marker'],
    deadlineEpochMs,
  );
  const finalSha = await checkedSandboxedGit(freezeBoundary, ['rev-parse', 'HEAD'], deadlineEpochMs);
  const materializeReadinessOraclePhase = async (phase: 'phase-a' | 'phase-b'): Promise<ProcessContainerBoundary> => {
    const phaseWorktree = join(readinessDirectory, `post-model-${phase}`, 'workspace');
    await materializeAdaptiveDevelopmentOracleSnapshot({
      gitExecutable: BENCHMARK_GIT_EXECUTABLE,
      sourceRepository: workspace,
      destination: phaseWorktree,
      finalSha,
      deadlineEpochMs,
    });
    const phaseRuntime = materializeBenchmarkSessionRuntime({
      runDirectory: readinessDirectory,
      role: 'post-model-oracle',
      instanceId: phase,
      workingDirectory: phaseWorktree,
      sessionExecutable: input.codexExecutable.path,
      nodeExecutable: input.nodeExecutable.path,
      modelCatalog: input.modelCatalog,
    });
    return {
      workingDirectory: phaseWorktree,
      nodeExecutable: input.nodeExecutable.path,
      processContainer: phaseRuntime.processContainer,
    };
  };
  const oraclePhaseA = await materializeReadinessOraclePhase('phase-a');
  const oraclePhaseB = await materializeReadinessOraclePhase('phase-b');
  await assertFrozenCandidate(oraclePhaseA, finalSha, deadlineEpochMs);
  await assertFrozenCandidate(oraclePhaseB, finalSha, deadlineEpochMs);
  const postModelControlPlaneLoopbackDenied = await runAdaptiveDevelopmentPostModelNetworkProbe({
    ...oraclePhaseA,
    deadlineEpochMs,
  });
  const postModelWorkspaceReadOnly = await runAdaptiveDevelopmentPostModelWorkspaceWriteProbe({
    ...oraclePhaseA,
    probePath: join(oraclePhaseA.workingDirectory, 'package.json'),
    deadlineEpochMs,
  });
  const postModelPhasesIsolated = await runAdaptiveDevelopmentPostModelPhaseIsolationProbe({
    sourcePhase: oraclePhaseA,
    destinationPhase: oraclePhaseB,
    deadlineEpochMs,
  });
  const postModelProcessStateIsolated = await runAdaptiveDevelopmentPostModelProcessIsolationProbe({
    ...oraclePhaseA,
    deadlineEpochMs,
  });
  const postModelEnvironmentIsolated = await runAdaptiveDevelopmentPostModelEnvironmentIsolationProbe({
    ...oraclePhaseA,
    deadlineEpochMs,
  });
  const postModelTrustBundleAccess = await probeProviderTrustBundleAccess({
    boundary: oraclePhaseA,
    trustBundlePath: executorRuntime.providerTransportTrustPath,
    expected: 'denied',
    deadlineEpochMs,
  });
  await assertFrozenCandidate(oraclePhaseA, finalSha, deadlineEpochMs);
  await assertFrozenCandidate(oraclePhaseB, finalSha, deadlineEpochMs);

  const reviewerRuntime = materializeBenchmarkSessionRuntime({
    runDirectory: readinessDirectory,
    role: 'reviewer',
    workingDirectory: workspace,
    sessionExecutable: input.codexNativeExecutable.path,
    ...credentialInput,
    nodeExecutable: input.nodeExecutable.path,
    modelCatalog: input.modelCatalog,
  });
  const reviewerOutputSchemaPath = join(reviewerRuntime.controlDirectory, 'carrier-output.schema.json');
  const reviewerSystemResolverSocketAccessible = await runAdaptiveDevelopmentSystemResolverSocketProbe({
    workingDirectory: workspace,
    nodeExecutable: input.nodeExecutable.path,
    processContainer: reviewerRuntime.processContainer,
    deadlineEpochMs,
  });
  const reviewerTrustBundleAccess = await probeProviderTrustBundleAccess({
    boundary: {
      workingDirectory: workspace,
      nodeExecutable: input.nodeExecutable.path,
      processContainer: reviewerRuntime.processContainer,
    },
    trustBundlePath: reviewerRuntime.providerTransportTrustPath,
    expected: 'passed',
    deadlineEpochMs,
  });
  const reviewerOutputLastMessagePath = join(reviewerRuntime.controlDirectory, 'carrier-output.json');
  writeJson(reviewerOutputSchemaPath, {
    type: 'object',
    additionalProperties: false,
    required: ['carrierReady'],
    properties: { carrierReady: { type: 'boolean', const: true } },
  });
  const { carrier: reviewer, transport: reviewerTransport } = await withBenchmarkSessionCredential(
    reviewerRuntime,
    async () => {
      if (!existsSync(join(reviewerRuntime.codexHome, 'auth.json'))) {
        throw new Error('reviewer carrier readiness did not mount the trusted session credential');
      }
      await assertCodexProcessContainerStarts({
        codexExecutable: input.codexNativeExecutable,
        nodeExecutable: input.nodeExecutable,
        codexHome: reviewerRuntime.codexHome,
        workingDirectory: workspace,
        processContainer: reviewerRuntime.processContainer,
        deadlineEpochMs,
      });
      const doctorResult = await runAdaptiveDevelopmentProcess(
        buildAdaptiveDevelopmentCodexDoctorInvocation({
          executable: input.codexNativeExecutable.path,
          codexHome: reviewerRuntime.codexHome,
          model: input.modelId,
          workingDirectory: workspace,
          nodeExecutable: input.nodeExecutable.path,
          modelCatalogPath: reviewerRuntime.modelCatalogPath,
          providerTransportTrustPath: reviewerRuntime.providerTransportTrustPath,
          processContainer: reviewerRuntime.processContainer,
        }),
        deadlineEpochMs,
      );
      writeAdaptiveDevelopmentCodexDoctorDiagnosticReport(
        join(readinessDirectory, 'reviewer-provider-doctor-report.json'),
        doctorResult,
      );
      const transport = assertAdaptiveDevelopmentCodexDoctorProviderTransport(doctorResult);
      const carrier = await runAdaptiveDevelopmentCodexCarrierSmoke({
        invocation: {
          executable: input.codexNativeExecutable.path,
          codexHome: reviewerRuntime.codexHome,
          model: input.modelId,
          workingDirectory: workspace,
          rolloutBudget: {
            kind: 'capped',
            tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
            reminderAtRemainingTokens: CARRIER_READINESS_REMINDER_TOKENS,
          },
          outputSchemaPath: reviewerOutputSchemaPath,
          outputLastMessagePath: reviewerOutputLastMessagePath,
          developerInstructions:
            'Read the provider-supplied frozen marker, then return the schema-bound carrier object.',
          prompt: 'Complete the zero-cost local reviewer carrier readiness turn.',
          filesystemAccess: 'read',
          agentExecutionMode: 'single_agent',
          nodeExecutable: input.nodeExecutable.path,
          modelCatalogPath: reviewerRuntime.modelCatalogPath,
          providerTransportTrustPath: reviewerRuntime.providerTransportTrustPath,
          processContainer: reviewerRuntime.processContainer,
        },
        deadlineEpochMs,
      });
      return { carrier, transport };
    },
  );
  if (existsSync(join(reviewerRuntime.codexHome, 'auth.json'))) {
    throw new Error('reviewer carrier readiness left the trusted session credential mounted');
  }

  const roleReceipt = <T extends 'write' | 'read'>(
    result: AdaptiveDevelopmentCodexCarrierSmokeResult,
    filesystemAccess: T,
    systemResolverSocketAccessible: true,
    transport: { readonly providerReachable: true; readonly websocketReachable: true },
  ) =>
    ({
      filesystemAccess,
      agentExecutionMode: filesystemAccess === 'write' ? 'natural_agent_graph' : 'single_agent',
      systemResolverSocketAccessible,
      ...transport,
      credentialMounted: true,
      credentialRemoved: true,
      providerRequestCount: 2,
      providerToolKinds: result.providerToolKinds,
      toolRoundTripCompleted: true,
      controlPlaneLoopbackDenied: result.controlPlaneLoopbackDenied,
      usage: {
        inputTokens: result.telemetry.inputTokens,
        cachedInputTokens: result.telemetry.cachedInputTokens,
        outputTokens: result.telemetry.outputTokens,
        toolCalls: result.telemetry.toolCalls,
        failedToolCalls: result.telemetry.failedToolCalls,
        usageObserved: true,
      },
    }) as const;
  const receipt = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION,
    status: 'passed',
    zeroModelProvider: true,
    modelId: input.modelId,
    postModelControlPlaneLoopbackDenied,
    postModelWorkspaceReadOnly,
    postModelPhasesIsolated,
    postModelProcessStateIsolated,
    postModelEnvironmentIsolated,
    providerTransportTrust: {
      trustBundleSha256: sha256File(executorRuntime.providerTransportTrustPath),
      executorTrustBundleAccess,
      reviewerTrustBundleAccess,
      postModelTrustBundleAccess,
    },
    roles: {
      executor: {
        ...roleReceipt(executor, 'write', executorSystemResolverSocketAccessible, executorTransport),
        postModelCommit: finalSha,
        agentGraph: {
          childSessionCount: 1,
          accountedSessionCount: 2,
          usageComplete: executorGraphCarrier.graph.usageComplete,
          independentReviewObserved: true,
        },
      },
      reviewer: roleReceipt(reviewer, 'read', reviewerSystemResolverSocketAccessible, reviewerTransport),
    },
  } satisfies AdaptiveDevelopmentCarrierReadinessReceipt;
  assertAdaptiveDevelopmentCarrierReadinessReceipt(receipt);
  const receiptPath = join(input.runRoot, 'carrier-readiness.json');
  writeJson(receiptPath, receipt);
  return { path: receiptPath, sha256: sha256File(receiptPath) };
}

function assertCarrierReadinessArtifact(artifact: CarrierReadinessArtifact): void {
  if (realpathSync(artifact.path) !== artifact.path || sha256File(artifact.path) !== artifact.sha256) {
    throw new Error('carrier readiness artifact changed before benchmark execution');
  }
  const receipt = JSON.parse(readFileSync(artifact.path, 'utf8')) as unknown;
  assertAdaptiveDevelopmentCarrierReadinessReceipt(receipt);
}

interface DurableBenchmarkExecution {
  readonly store: RedisAdaptiveDevelopmentBenchmarkExecutionStore;
  readonly record: AdaptiveDevelopmentBenchmarkExecutionRecord;
}

interface ExecuteLaunchPlanInput {
  readonly repositoryRoot: string;
  readonly runRoot: string;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly codexExecutable: TrustedExecutableIdentity;
  readonly codexNativeExecutable: TrustedExecutableIdentity;
  readonly nodeExecutable: TrustedExecutableIdentity;
  readonly runtimeArtifacts: readonly { readonly path: string; readonly sha256: string }[];
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly modelCatalog: BenchmarkModelCatalog;
  readonly carrierReadiness: CarrierReadinessArtifact;
  readonly fixtureCommand?: string;
  readonly execution?: DurableBenchmarkExecution;
}

interface ExecuteLaunchPlanResult {
  readonly receipts: AdaptiveDevelopmentBenchmarkReceipt[];
  readonly stoppedByDeadline: boolean;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
}

type RunAttemptCommon = Omit<
  Parameters<typeof runAttempt>[0],
  'attempt' | 'runId' | 'supersedesReceiptSha256' | 'attemptReservation'
>;

async function reserveInitialDurableExecution(
  input: ExecuteLaunchPlanInput,
  initialReservations: readonly AdaptiveDevelopmentStageAttemptReservation[],
): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord | undefined> {
  if (input.launchPlan.executionMode === 'live' && !input.execution) {
    throw new Error('live benchmark execution is missing its durable lifecycle claim');
  }
  if (!input.execution) return undefined;
  const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.launchPlan);
  if (input.execution.record.launchPlanSha256 !== launchPlanSha256) {
    throw new Error('durable benchmark execution does not bind the launch plan');
  }
  return await input.execution.store.reserveInitialAttempts(launchPlanSha256, {
    attempts: initialReservations.map((reservation) => ({
      runKey: reservation.runKey,
      attempt: reservation.attempt,
      reservationSha256: fingerprintAdaptiveDevelopmentBenchmark(reservation),
    })),
    reservedAt: lifecycleTimestampAfter(input.execution.record.authorizedAt),
  });
}

function benchmarkExecutionAttempt(
  record: AdaptiveDevelopmentBenchmarkExecutionRecord,
  runKey: string,
  attempt: 1 | 2,
): AdaptiveDevelopmentBenchmarkExecutionRecord['attempts'][number] {
  const selected = record.attempts.find((candidate) => candidate.runKey === runKey && candidate.attempt === attempt);
  if (!selected) throw new Error(`durable benchmark attempt is missing for ${runKey}:${attempt}`);
  return selected;
}

async function startDurableBenchmarkAttempt(input: {
  readonly execution?: DurableBenchmarkExecution;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
  readonly runKey: string;
  readonly attempt: 1 | 2;
  readonly runId: string;
}): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord | undefined> {
  if (!input.execution) return input.executionRecord;
  if (!input.executionRecord) throw new Error('durable benchmark execution state is missing');
  const reserved = benchmarkExecutionAttempt(input.executionRecord, input.runKey, input.attempt);
  if (reserved.state !== 'reserved') {
    throw new Error(`durable benchmark attempt is not reserved for ${input.runKey}:${input.attempt}`);
  }
  return await input.execution.store.startAttempt(input.executionRecord.launchPlanSha256, {
    runKey: input.runKey,
    attempt: input.attempt,
    runId: input.runId,
    startedAt: lifecycleTimestampAfter(reserved.reservedAt),
  });
}

async function finishDurableBenchmarkAttempt(input: {
  readonly execution?: DurableBenchmarkExecution;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
  readonly runKey: string;
  readonly attempt: 1 | 2;
  readonly runId: string;
  readonly result: RunAttemptResult;
}): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord | undefined> {
  if (!input.execution) return input.executionRecord;
  if (!input.executionRecord) throw new Error('durable benchmark execution state is missing');
  const running = benchmarkExecutionAttempt(input.executionRecord, input.runKey, input.attempt);
  if (running.state !== 'running' || running.runId !== input.runId) {
    throw new Error(`durable benchmark attempt lost its running claim for ${input.runKey}:${input.attempt}`);
  }
  return await input.execution.store.finishAttempt(input.executionRecord.launchPlanSha256, {
    runKey: input.runKey,
    attempt: input.attempt,
    runId: input.runId,
    completedAt: lifecycleTimestampAfter(running.startedAt),
    receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(input.result.receipt),
    infrastructureError: input.result.infrastructureError,
    stopStage: input.result.stopStage,
  });
}

async function runClaimedBenchmarkAttempt(input: {
  readonly common: RunAttemptCommon;
  readonly execution?: DurableBenchmarkExecution;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
  readonly attempt: 1 | 2;
  readonly attemptReservation: AdaptiveDevelopmentStageAttemptReservation;
  readonly supersedesReceiptSha256?: string;
}): Promise<{
  readonly result: RunAttemptResult;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
}> {
  const runId = `run-${randomUUID()}`;
  const runningRecord = await startDurableBenchmarkAttempt({
    ...(input.execution ? { execution: input.execution } : {}),
    ...(input.executionRecord ? { executionRecord: input.executionRecord } : {}),
    runKey: input.common.launch.runKey,
    attempt: input.attempt,
    runId,
  });
  const result = await runAttempt({
    ...input.common,
    attempt: input.attempt,
    runId,
    ...(input.supersedesReceiptSha256 ? { supersedesReceiptSha256: input.supersedesReceiptSha256 } : {}),
    attemptReservation: input.attemptReservation,
  });
  const executionRecord = await finishDurableBenchmarkAttempt({
    ...(input.execution ? { execution: input.execution } : {}),
    ...(runningRecord ? { executionRecord: runningRecord } : {}),
    runKey: input.common.launch.runKey,
    attempt: input.attempt,
    runId,
    result,
  });
  return { result, ...(executionRecord ? { executionRecord } : {}) };
}

async function reserveDurableBenchmarkRetry(input: {
  readonly execution?: DurableBenchmarkExecution;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly reservation: AdaptiveDevelopmentStageAttemptReservation;
}): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord | undefined> {
  if (!input.execution) return input.executionRecord;
  if (!input.executionRecord) throw new Error('durable benchmark execution state is missing');
  const first = benchmarkExecutionAttempt(input.executionRecord, input.launch.runKey, 1);
  if (first.state !== 'terminal' || first.terminalKind !== 'receipt') {
    throw new Error(`durable benchmark first attempt is not terminal for ${input.launch.runKey}`);
  }
  return await input.execution.store.reserveRetry(input.executionRecord.launchPlanSha256, {
    attempt: {
      runKey: input.reservation.runKey,
      attempt: input.reservation.attempt,
      reservationSha256: fingerprintAdaptiveDevelopmentBenchmark(input.reservation),
    },
    reservedAt: lifecycleTimestampAfter(first.completedAt),
  });
}

function executeLaunchPlanResult(
  receipts: AdaptiveDevelopmentBenchmarkReceipt[],
  stoppedByDeadline: boolean,
  executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord,
): ExecuteLaunchPlanResult {
  return { receipts, stoppedByDeadline, ...(executionRecord ? { executionRecord } : {}) };
}

async function executeLaunchPlanRun(input: {
  readonly command: ExecuteLaunchPlanInput;
  readonly launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number];
  readonly firstReservation: AdaptiveDevelopmentStageAttemptReservation;
  readonly evidenceStore: LocalAdaptiveDevelopmentBenchmarkEvidenceStore;
  readonly artifactStore: LocalAdaptiveDevelopmentBenchmarkArtifactStore;
  readonly executionRecord?: AdaptiveDevelopmentBenchmarkExecutionRecord;
}): Promise<ExecuteLaunchPlanResult> {
  const common = {
    repositoryRoot: input.command.repositoryRoot,
    runRoot: input.command.runRoot,
    manifest: input.command.manifest,
    launchPlan: input.command.launchPlan,
    launch: input.launch,
    codexExecutable: input.command.codexExecutable,
    codexNativeExecutable: input.command.codexNativeExecutable,
    nodeExecutable: input.command.nodeExecutable,
    runtimeArtifacts: input.command.runtimeArtifacts,
    oracleToolchain: input.command.oracleToolchain,
    modelCatalog: input.command.modelCatalog,
    ...(input.command.fixtureCommand ? { fixtureCommand: input.command.fixtureCommand } : {}),
    evidenceStore: input.evidenceStore,
    artifactStore: input.artifactStore,
  } satisfies RunAttemptCommon;
  const firstExecution = await runClaimedBenchmarkAttempt({
    common,
    ...(input.command.execution ? { execution: input.command.execution } : {}),
    ...(input.executionRecord ? { executionRecord: input.executionRecord } : {}),
    attempt: 1,
    attemptReservation: input.firstReservation,
  });
  const first = firstExecution.result;
  if (first.stopStage) return executeLaunchPlanResult([first.receipt], true, firstExecution.executionRecord);
  if (!first.infrastructureError) {
    return executeLaunchPlanResult([first.receipt], false, firstExecution.executionRecord);
  }
  const retryReservation = reserveAdaptiveDevelopmentRetryStageAttempt(
    input.command.runRoot,
    input.command.launchPlan,
    input.launch,
  );
  if (!retryReservation) return executeLaunchPlanResult([first.receipt], false, firstExecution.executionRecord);
  const reservedRetryRecord = await reserveDurableBenchmarkRetry({
    ...(input.command.execution ? { execution: input.command.execution } : {}),
    ...(firstExecution.executionRecord ? { executionRecord: firstExecution.executionRecord } : {}),
    launch: input.launch,
    reservation: retryReservation,
  });
  const retryExecution = await runClaimedBenchmarkAttempt({
    common,
    ...(input.command.execution ? { execution: input.command.execution } : {}),
    ...(reservedRetryRecord ? { executionRecord: reservedRetryRecord } : {}),
    attempt: 2,
    attemptReservation: retryReservation,
    supersedesReceiptSha256: fingerprintAdaptiveDevelopmentBenchmark(first.receipt),
  });
  return executeLaunchPlanResult(
    [first.receipt, retryExecution.result.receipt],
    retryExecution.result.stopStage,
    retryExecution.executionRecord,
  );
}

async function executeLaunchPlan(input: ExecuteLaunchPlanInput): Promise<ExecuteLaunchPlanResult> {
  assertAdaptiveDevelopmentSealedOracleToolchain(input.oracleToolchain);
  assertCarrierReadinessArtifact(input.carrierReadiness);
  const evidenceStore = new LocalAdaptiveDevelopmentBenchmarkEvidenceStore(input.runRoot);
  const artifactStore = new LocalAdaptiveDevelopmentBenchmarkArtifactStore(input.runRoot);
  const receipts: AdaptiveDevelopmentBenchmarkReceipt[] = [];
  const initialReservations = reserveAdaptiveDevelopmentInitialStageAttempts(input.runRoot, input.launchPlan);
  let executionRecord = await reserveInitialDurableExecution(input, initialReservations);
  const initialReservationByRunKey = new Map(
    initialReservations.map((reservation) => [reservation.runKey, reservation]),
  );
  for (const launch of input.launchPlan.runs) {
    const firstReservation = initialReservationByRunKey.get(launch.runKey);
    if (!firstReservation) throw new Error(`stage attempt ledger cannot reserve initial attempt for ${launch.runKey}`);
    const run = await executeLaunchPlanRun({
      command: input,
      launch,
      firstReservation,
      evidenceStore,
      artifactStore,
      ...(executionRecord ? { executionRecord } : {}),
    });
    receipts.push(...run.receipts);
    executionRecord = run.executionRecord;
    if (run.stoppedByDeadline) return executeLaunchPlanResult(receipts, true, executionRecord);
  }
  return executeLaunchPlanResult(receipts, false, executionRecord);
}

type BenchmarkEnvironment = Awaited<ReturnType<typeof buildEnvironment>>;
type CommandEnvironment = BenchmarkEnvironment & {
  readonly operationalCanary?:
    | { readonly kind: 'fixture_non_scoring' }
    | {
        readonly kind: 'passed';
        readonly receiptSha256: string;
        readonly receiptArtifactSha256: string;
        readonly executionRecordSha256: string;
        readonly canaryScopeSha256: string;
        readonly canaryPlanSha256: string;
        readonly tokenPolicy: 'unbounded';
      };
};

interface BenchmarkCommandContext {
  readonly args: CliArgs;
  readonly manifest: AdaptiveDevelopmentBenchmarkManifest;
  readonly approvalAuthority?: AdaptiveDevelopmentOperatorApprovalAuthority;
  readonly baseEnvironment: BenchmarkEnvironment;
  readonly environment: CommandEnvironment;
  readonly environmentSha256: string;
  readonly oracleToolchain: AdaptiveDevelopmentSealedOracleToolchain;
  readonly stageAdmission?: AdaptiveDevelopmentStageAdmissionBinding;
  readonly runRoot: string;
}

interface ConvergenceReviewBoundaryCalibrationExecutionRecord {
  readonly schemaVersion: typeof CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_EXECUTION_VERSION;
  readonly state: 'running' | 'completed' | 'failed';
  readonly calibrationPlanSha256: string;
  readonly plan: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan;
  readonly authority: ReturnType<typeof operationalCanaryAuthorityBinding>;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly certificate?: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate;
  readonly certificateSha256?: string;
  readonly failedAt?: string;
  readonly failureSha256?: string;
}

async function initializeBenchmarkCommand(args: CliArgs): Promise<BenchmarkCommandContext> {
  const manifestPath = join(
    args.repositoryRoot,
    'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
  );
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const oracleToolchainIdentity = captureAdaptiveDevelopmentOracleToolchainIdentity(args.repositoryRoot, manifest);
  const oracleToolchainSha256 = fingerprintAdaptiveDevelopmentOracleToolchain(oracleToolchainIdentity);
  const stageAdmission = await loadValidatedStageAdmissionBinding(args, manifest, oracleToolchainSha256);
  if (args.mode !== 'fixture') {
    reviewedMessageStoreConfig();
    await assertCleanTrackedTree(args.repositoryRoot);
  }
  const approvalAuthority = args.mode === 'fixture' ? undefined : await readOperatorApprovalAuthority();
  const baseEnvironment = await buildEnvironment(
    args.repositoryRoot,
    manifest,
    args.stageId,
    oracleToolchainIdentity,
    approvalAuthority,
    args.mode === 'prepare-review-boundary-calibration' ||
    args.mode === 'review-boundary-calibration' ||
    args.mode === 'prepare-convergence-canary' ||
    args.mode === 'convergence-canary'
      ? 'convergence_canary'
      : 'benchmark',
  );
  const environment = await bindOperationalCanaryToEnvironment(args, baseEnvironment, approvalAuthority);
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runRoot =
    args.outputRoot ??
    join(
      args.repositoryRoot,
      '.cat-cafe',
      'benchmark-runs',
      `${runStamp}-${
        args.mode === 'prepare-canary' || args.mode === 'canary'
          ? 'operational-canary'
          : args.mode === 'prepare-review-boundary-calibration' || args.mode === 'review-boundary-calibration'
            ? 'review-boundary-calibration'
            : args.mode === 'prepare-convergence-canary' || args.mode === 'convergence-canary'
            ? 'convergence-canary'
            : args.stageId
      }`,
    );
  mkdirSync(runRoot, { recursive: true });
  const oracleToolchain = sealAdaptiveDevelopmentOracleToolchain(
    args.repositoryRoot,
    join(runRoot, 'oracle-toolchain'),
    oracleToolchainIdentity,
  );
  writeJson(join(runRoot, 'environment.json'), environment);
  writeJson(join(runRoot, 'manifest.json'), manifest);
  return {
    args,
    manifest,
    ...(approvalAuthority ? { approvalAuthority } : {}),
    baseEnvironment,
    environment,
    environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(environment),
    oracleToolchain,
    ...(stageAdmission ? { stageAdmission } : {}),
    runRoot,
  };
}

async function bindOperationalCanaryToEnvironment(
  args: CliArgs,
  baseEnvironment: BenchmarkEnvironment,
  approvalAuthority?: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<CommandEnvironment> {
  if (args.mode === 'fixture') return { ...baseEnvironment, operationalCanary: { kind: 'fixture_non_scoring' } };
  if (args.mode !== 'prepare' && args.mode !== 'live') return baseEnvironment;
  if (!approvalAuthority) throw new Error('S0 scope creation requires the trusted Cat Café approval authority');
  const artifact = await loadTrustedOperationalCanaryExecution(
    args.canaryPlanPath as string,
    baseEnvironment,
    approvalAuthority,
  );
  return {
    ...baseEnvironment,
    operationalCanary: {
      kind: 'passed',
      receiptSha256: artifact.record.receiptSha256 as string,
      receiptArtifactSha256: artifact.record.receiptArtifactSha256 as string,
      executionRecordSha256: artifact.recordSha256,
      canaryScopeSha256: artifact.receipt.canaryScopeSha256,
      canaryPlanSha256: artifact.receipt.canaryPlanSha256,
      tokenPolicy: artifact.receipt.tokenPolicy,
    },
  };
}

async function runCanaryCommand(context: BenchmarkCommandContext): Promise<void> {
  const { args, manifest, approvalAuthority, baseEnvironment, runRoot } = context;
  if (!approvalAuthority) throw new Error('operational canary requires the trusted Cat Café approval authority');
  const carrierReadiness = await runCarrierReadiness({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    modelId: manifest.model.modelId,
    codexExecutable: baseEnvironment.codexExecutable,
    codexNativeExecutable: baseEnvironment.codexNativeExecutable,
    nodeExecutable: baseEnvironment.nodeExecutable,
    runtimeArtifacts: baseEnvironment.runtimeArtifacts,
    modelCatalog: baseEnvironment.modelCatalog,
  });
  const canaryScope = buildAdaptiveDevelopmentOperationalCanaryScope({
    runnerCommit: baseEnvironment.runnerCommit,
    environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(baseEnvironment),
    modelId: manifest.model.modelId,
  });
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(canaryScope);
  writeJson(join(runRoot, 'operational-canary-scope.json'), canaryScope);
  if (args.mode === 'prepare-canary') {
    process.stdout.write(
      `${JSON.stringify({
        status: 'operational_canary_scope_ready',
        runRoot,
        canaryScopeSha256,
        tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
        carrierReadinessSha256: carrierReadiness.sha256,
        requiredApprovalDirective: buildAdaptiveDevelopmentOperationalCanaryDirective(
          canaryScopeSha256,
          approvalAuthority,
        ),
      })}\n`,
    );
    return;
  }
  const execution = await claimAuthorizedOperationalCanaryExecution(
    args.canaryPlanPath as string,
    canaryScope,
    approvalAuthority,
  );
  let lifecycleRecord = execution.record;
  let receipt: AdaptiveDevelopmentOperationalCanaryReceipt;
  let passedRecord: AdaptiveDevelopmentOperationalCanaryExecutionRecord;
  try {
    assertRuntimeArtifacts(baseEnvironment.runtimeArtifacts);
    await assertTrustedExecutable(
      baseEnvironment.codexExecutable,
      args.repositoryRoot,
      Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS,
    );
    writeJson(join(runRoot, 'operational-canary-plan.json'), execution.plan);
    lifecycleRecord = await execution.store.reserve(
      lifecycleRecord.canaryPlanSha256,
      lifecycleTimestampAfter(lifecycleRecord.authorizedAt),
    );
    lifecycleRecord = await execution.store.start(
      lifecycleRecord.canaryPlanSha256,
      lifecycleTimestampAfter(lifecycleRecord.reservation?.reservedAt as string),
    );
    receipt = await runOperationalCanary({
      repositoryRoot: args.repositoryRoot,
      runRoot,
      environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(baseEnvironment),
      plan: execution.plan,
      codexExecutable: baseEnvironment.codexExecutable,
      codexNativeExecutable: baseEnvironment.codexNativeExecutable,
      nodeExecutable: baseEnvironment.nodeExecutable,
      runtimeArtifacts: baseEnvironment.runtimeArtifacts,
      modelCatalog: baseEnvironment.modelCatalog,
      startedAt: lifecycleRecord.startedAt as string,
    });
    const currentAuthority = await resolveOperatorApprovalAuthority(execution.redis);
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed during operational canary execution');
    }
    const receiptPath = join(runRoot, 'operational-canary-receipt.json');
    passedRecord = await execution.store.pass(lifecycleRecord.canaryPlanSha256, {
      completedAt: receipt.completedAt,
      receipt,
      receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
      receiptArtifactSha256: sha256File(receiptPath),
    });
  } catch (error) {
    try {
      const current = await execution.store.get(lifecycleRecord.canaryPlanSha256);
      if (current && current.state !== 'passed' && current.state !== 'failed') {
        await execution.store.fail(current.canaryPlanSha256, {
          failedAt: lifecycleTimestampAfter(
            current.startedAt ?? current.reservation?.reservedAt ?? current.authorizedAt,
          ),
          failureSha256: fingerprintAdaptiveDevelopmentBenchmark({
            kind: 'operational_canary_execution_failure',
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          }),
        });
      }
    } catch (stateError) {
      throw new AggregateError(
        [error, stateError],
        'operational canary failed and its consumed state could not converge',
      );
    }
    throw error;
  } finally {
    await execution.redis.quit().catch(() => {});
  }
  process.stdout.write(
    `${JSON.stringify({
      status: 'operational_canary_complete',
      runRoot,
      canaryScopeSha256,
      tokenPolicy: receipt.tokenPolicy,
      receiptSha256: passedRecord.receiptSha256,
      receiptArtifactSha256: passedRecord.receiptArtifactSha256,
      executionRecordSha256: fingerprintAdaptiveDevelopmentBenchmark(passedRecord),
    })}\n`,
  );
}

async function claimAuthorizedOperationalCanaryExecution(
  path: string,
  scope: ReturnType<typeof buildAdaptiveDevelopmentOperationalCanaryScope>,
  approvalAuthority: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<{
  readonly redis: RedisClient;
  readonly store: RedisAdaptiveDevelopmentOperationalCanaryExecutionStore;
  readonly plan: AdaptiveDevelopmentOperationalCanaryPlan;
  readonly record: AdaptiveDevelopmentOperationalCanaryExecutionRecord;
}> {
  const { redis, authority: currentAuthority } = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before canary authorization resolution');
    }
    const plan = await loadAuthorizedOperationalCanaryPlan(
      path,
      scope,
      approvalAuthority,
      new RedisMessageStore(redis),
    );
    const store = new RedisAdaptiveDevelopmentOperationalCanaryExecutionStore(redis);
    const record = await store.authorize({
      plan,
      authority: operationalCanaryAuthorityBinding(currentAuthority),
      authorizedAt: lifecycleTimestampAfter(plan.authorization.approvedAt),
    });
    return { redis, store, plan, record };
  } catch (error) {
    await redis.quit().catch(() => {});
    throw error;
  }
}

async function loadAuthorizedConvergenceCanaryPlan(
  path: string,
  scope: ReturnType<typeof buildAdaptiveDevelopmentConvergenceCanaryScope>,
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
  resolver: AdaptiveDevelopmentOperatorApprovalResolver,
): Promise<AdaptiveDevelopmentConvergenceCanaryPlan> {
  const plan = parseAdaptiveDevelopmentConvergenceCanaryPlan(JSON.parse(readFileSync(path, 'utf8')));
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  if (plan.canaryScopeSha256 !== scopeSha256 || fingerprintAdaptiveDevelopmentBenchmark(plan.scope) !== scopeSha256) {
    throw new Error('convergence canary plan does not bind the current exact scope');
  }
  await verifyAdaptiveDevelopmentOperatorDirective({
    authorization: plan.authorization,
    authority,
    resolver,
    directive: buildAdaptiveDevelopmentConvergenceCanaryDirective(scope, authority),
  });
  return plan;
}

async function claimAuthorizedConvergenceCanaryExecution(
  path: string,
  scope: ReturnType<typeof buildAdaptiveDevelopmentConvergenceCanaryScope>,
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<{
  readonly redis: RedisClient;
  readonly store: RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore;
  readonly plan: AdaptiveDevelopmentConvergenceCanaryPlan;
  readonly record: AdaptiveDevelopmentConvergenceCanaryExecutionRecord;
}> {
  const { redis, authority: currentAuthority } = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !== fingerprintAdaptiveDevelopmentBenchmark(authority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before convergence canary authorization');
    }
    const plan = await loadAuthorizedConvergenceCanaryPlan(path, scope, authority, new RedisMessageStore(redis));
    const store = new RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore(redis);
    const record = await store.authorize({
      plan,
      authority: operationalCanaryAuthorityBinding(currentAuthority),
      authorizedAt: lifecycleTimestampAfter(plan.authorization.approvedAt),
    });
    return { redis, store, plan, record };
  } catch (error) {
    await redis.quit().catch(() => {});
    throw error;
  }
}

function parseConvergenceOracleCalibrationOutput(
  stdout: string,
  expectedTaskId: string,
): AdaptiveDevelopmentOracleSpecificityCalibration {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error('convergence oracle calibration did not emit one JSON result');
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).status !== 'calibrated' ||
    (value as Record<string, unknown>).taskId !== expectedTaskId ||
    (value as Record<string, unknown>).calibration === null ||
    typeof (value as Record<string, unknown>).calibration !== 'object' ||
    Array.isArray((value as Record<string, unknown>).calibration)
  ) {
    throw new Error('convergence oracle calibration did not prove the exact task');
  }
  return (value as Record<string, unknown>).calibration as AdaptiveDevelopmentOracleSpecificityCalibration;
}

async function runConvergenceOracleCalibration(
  context: BenchmarkCommandContext,
): Promise<AdaptiveDevelopmentOracleCalibrationCertificate> {
  const { args, manifest, baseEnvironment, oracleToolchain, runRoot } = context;
  const canary = manifest.convergenceCanary;
  const task = manifest.tasks.find((candidate) => candidate.id === canary.taskId);
  if (!task?.oraclePolicy.observableBehaviors) {
    throw new Error('convergence oracle calibration requires the exact observable behavior contract');
  }
  const calibrationWorkRoot = mkdtempSync(join(tmpdir(), 'lf0001-convergence-calibration-'));
  let storageGuard: AdaptiveDevelopmentDirectoryStorageGuard | undefined;
  try {
    assertConvergenceCanaryStorageCapacity(runRoot, calibrationWorkRoot);
    if (activeConvergenceCanaryStorageGuard) {
      throw new Error('convergence oracle calibration storage guard is already installed');
    }
    storageGuard = buildConvergenceCanaryStorageGuard(runRoot, calibrationWorkRoot);
    activeConvergenceCanaryStorageGuard = storageGuard;
    const result = await command(
      process.execPath,
      [join(args.repositoryRoot, 'packages/api/scripts/run-adaptive-development-disposable-oracle-calibration.mjs')],
      args.repositoryRoot,
      Date.now() + CONVERGENCE_CANARY_CALIBRATION_WALL_TIME_MS_CAP,
      { LF0001_CONVERGENCE_CALIBRATION_ROOT: calibrationWorkRoot },
    );
    if (result.timedOut) throw new Error('convergence oracle calibration exceeded its infrastructure deadline');
    if (result.exitCode !== 0) {
      throw new Error(`convergence oracle calibration failed: ${tail(result.stderr || result.stdout)}`);
    }
    const calibration = parseConvergenceOracleCalibrationOutput(result.stdout, task.id);
    const certificate = buildAdaptiveDevelopmentOracleCalibrationCertificate({
      runnerCommit: baseEnvironment.runnerCommit,
      environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(baseEnvironment),
      manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
      oracleToolchainSha256: fingerprintAdaptiveDevelopmentOracleToolchain(oracleToolchain.identity),
      oracleSpecificitySha256: fingerprintAdaptiveDevelopmentBenchmark(canary.oracleSpecificity),
      canaryId: canary.id,
      taskId: task.id,
      calibration,
    });
    writeJson(join(runRoot, 'oracle-calibration-certificate.json'), certificate);
    return certificate;
  } finally {
    if (activeConvergenceCanaryStorageGuard === storageGuard) {
      activeConvergenceCanaryStorageGuard = undefined;
    }
    rmSync(calibrationWorkRoot, { recursive: true, force: true });
  }
}

function convergenceCalibrationCertificateFromPlan(path: string): AdaptiveDevelopmentOracleCalibrationCertificate {
  const plan = parseAdaptiveDevelopmentConvergenceCanaryPlan(JSON.parse(readFileSync(path, 'utf8')));
  if (plan.scope.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    throw new Error('convergence canary execution requires a calibration-bound current scope');
  }
  assertAdaptiveDevelopmentOracleCalibrationCertificate(plan.scope.calibrationCertificate);
  return plan.scope.calibrationCertificate;
}

function loadConvergenceJudgeAssets(repositoryRoot: string): {
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
} {
  const rubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(
    JSON.parse(readFileSync(join(repositoryRoot, CONVERGENCE_REVIEW_BOUNDARY_RUBRIC_PATH), 'utf8')),
  );
  const goldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(
    JSON.parse(readFileSync(join(repositoryRoot, CONVERGENCE_REVIEW_BOUNDARY_GOLD_SUITE_PATH), 'utf8')),
    rubric,
  );
  return { rubric, goldSuite };
}

function convergenceJudgeCalibrationExecutionKey(calibrationPlanSha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(calibrationPlanSha256)) throw new Error('Review-boundary calibration plan hash is invalid');
  return `harness-eval:adaptive-development:convergence-review-boundary-calibration-execution:v1:${calibrationPlanSha256}`;
}

function convergenceJudgeCalibrationApprovalClaimKey(approvalRef: string): string {
  const match = /^cat-cafe:\/\/message\/([A-Za-z0-9-]+)$/.exec(approvalRef);
  if (!match) throw new Error('Review-boundary calibration approval reference is invalid');
  return `harness-eval:adaptive-development:convergence-review-boundary-calibration-approval:v1:${encodeURIComponent(match[1])}`;
}

function currentConvergenceReviewBoundaryCalibrationScope(
  context: BenchmarkCommandContext,
  rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope {
  return buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope({
    runnerCommit: context.baseEnvironment.runnerCommit,
    environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(context.baseEnvironment),
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(context.manifest),
    modelId: context.manifest.model.modelId,
    rubric,
    goldSuite,
  });
}

async function claimAuthorizedConvergenceReviewBoundaryCalibration(input: {
  readonly context: BenchmarkCommandContext;
  readonly scope: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationScope;
  readonly planPath: string;
}): Promise<{
  readonly redis: RedisClient;
  readonly record: ConvergenceReviewBoundaryCalibrationExecutionRecord;
}> {
  const { approvalAuthority } = input.context;
  if (!approvalAuthority) throw new Error('Review-boundary calibration requires trusted operator authority');
  const plan = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan(
    JSON.parse(readFileSync(input.planPath, 'utf8')),
  );
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(input.scope);
  if (
    plan.calibrationScopeSha256 !== scopeSha256 ||
    fingerprintAdaptiveDevelopmentBenchmark(plan.scope) !== scopeSha256
  ) {
    throw new Error('Review-boundary calibration plan does not bind the current exact scope');
  }
  const connection = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(connection.authority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before Review-boundary calibration authorization');
    }
    await verifyAdaptiveDevelopmentOperatorDirective({
      authorization: plan.authorization,
      authority: approvalAuthority,
      resolver: new RedisMessageStore(connection.redis),
      directive: buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective(input.scope, approvalAuthority),
    });
    const calibrationPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    const record: ConvergenceReviewBoundaryCalibrationExecutionRecord = {
      schemaVersion: CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_EXECUTION_VERSION,
      state: 'running',
      calibrationPlanSha256,
      plan,
      authority: operationalCanaryAuthorityBinding(connection.authority),
      startedAt: lifecycleTimestampAfter(plan.authorization.approvedAt),
    };
    const claimed = Number(
      await connection.redis.eval(
        CLAIM_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_LUA,
        2,
        convergenceJudgeCalibrationExecutionKey(calibrationPlanSha256),
        convergenceJudgeCalibrationApprovalClaimKey(plan.authorization.approvalRef),
        JSON.stringify(record),
        calibrationPlanSha256,
      ),
    );
    if (claimed === -1) throw new Error('Review-boundary calibration plan has already been consumed');
    if (claimed === -2) throw new Error('Review-boundary calibration approval message has already been consumed');
    if (claimed !== 1) throw new Error('Review-boundary calibration authorization claim failed');
    return { redis: connection.redis, record };
  } catch (error) {
    await connection.redis.quit().catch(() => {});
    throw error;
  }
}

async function transitionConvergenceReviewBoundaryCalibrationRecord(
  redis: RedisClient,
  current: ConvergenceReviewBoundaryCalibrationExecutionRecord,
  next: ConvergenceReviewBoundaryCalibrationExecutionRecord,
): Promise<void> {
  const changed = Number(
    await redis.eval(
      COMPLETE_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_LUA,
      1,
      convergenceJudgeCalibrationExecutionKey(current.calibrationPlanSha256),
      JSON.stringify(current),
      JSON.stringify(next),
    ),
  );
  if (changed !== 1) throw new Error('Review-boundary calibration execution transition lost an atomic race');
}

function parseConvergenceReviewBoundaryCalibrationExecutionRecord(
  value: unknown,
): ConvergenceReviewBoundaryCalibrationExecutionRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Review-boundary calibration execution record is corrupt');
  }
  const record = value as Partial<ConvergenceReviewBoundaryCalibrationExecutionRecord>;
  if (
    record.schemaVersion !== CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_EXECUTION_VERSION ||
    !['running', 'completed', 'failed'].includes(record.state ?? '') ||
    typeof record.calibrationPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.calibrationPlanSha256) ||
    typeof record.startedAt !== 'string' ||
    Number.isNaN(Date.parse(record.startedAt))
  ) {
    throw new Error('Review-boundary calibration execution record is corrupt');
  }
  const plan = parseAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationPlan(record.plan);
  if (fingerprintAdaptiveDevelopmentBenchmark(plan) !== record.calibrationPlanSha256) {
    throw new Error('Review-boundary calibration execution record does not bind its exact plan');
  }
  return record as ConvergenceReviewBoundaryCalibrationExecutionRecord;
}

async function loadTrustedConvergenceReviewBoundaryCalibrationCertificate(
  context: BenchmarkCommandContext,
  certificate: unknown,
  rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
): Promise<AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate> {
  const scope = currentConvergenceReviewBoundaryCalibrationScope(context, rubric, goldSuite);
  if (
    certificate === null ||
    typeof certificate !== 'object' ||
    Array.isArray(certificate) ||
    typeof (certificate as { calibrationPlanSha256?: unknown }).calibrationPlanSha256 !== 'string'
  ) {
    throw new Error('Review-boundary calibration certificate is invalid');
  }
  const parsedCertificate = certificate as AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate;
  assertAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificateMatchesScope(
    certificate,
    scope,
    parsedCertificate.calibrationPlanSha256,
  );
  const connection = await connectApprovalAuthority();
  try {
    if (
      !context.approvalAuthority ||
      fingerprintAdaptiveDevelopmentBenchmark(connection.authority) !==
        fingerprintAdaptiveDevelopmentBenchmark(context.approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before Review-boundary calibration certificate validation');
    }
    const raw = await connection.redis.get(
      convergenceJudgeCalibrationExecutionKey(parsedCertificate.calibrationPlanSha256),
    );
    if (!raw) throw new Error('trusted Review-boundary calibration execution record is missing');
    const record = parseConvergenceReviewBoundaryCalibrationExecutionRecord(JSON.parse(raw));
    if (
      record.state !== 'completed' ||
      !record.certificate ||
      record.certificateSha256 !== fingerprintAdaptiveDevelopmentBenchmark(parsedCertificate) ||
      fingerprintAdaptiveDevelopmentBenchmark(record.certificate) !== record.certificateSha256 ||
      fingerprintAdaptiveDevelopmentBenchmark(record.certificate) !==
        fingerprintAdaptiveDevelopmentBenchmark(parsedCertificate) ||
      fingerprintAdaptiveDevelopmentBenchmark(record.authority) !==
        fingerprintAdaptiveDevelopmentBenchmark(operationalCanaryAuthorityBinding(connection.authority))
    ) {
      throw new Error('trusted Review-boundary calibration ledger does not bind the supplied certificate');
    }
    return parsedCertificate;
  } finally {
    await connection.redis.quit().catch(() => {});
  }
}

async function runConvergenceReviewBoundaryCalibrationCase(input: {
  readonly context: BenchmarkCommandContext;
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly goldCase: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite['cases'][number];
  readonly calibrationRoot: string;
  readonly trialIndex: number;
  readonly deadlineEpochMs: number;
}): Promise<AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial['caseRuns'][number]> {
  const { args, baseEnvironment, manifest } = input.context;
  const caseRoot = join(input.calibrationRoot, `trial-${input.trialIndex}`, input.goldCase.id);
  const workspace = join(caseRoot, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const projection = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection(input.goldCase);
  const judgeContext = materializeConvergenceReviewBoundaryJudgeContext({
    workspace,
    projection,
    rubric: input.rubric,
  });
  const judgeVisibility = buildAdaptiveDevelopmentReviewVisibilityManifest({
    root: workspace,
    candidateSha: projection.judgeContext.candidateIdentity.finalSha,
    candidatePaths: [],
    runnerProvidedPaths: CONVERGENCE_REVIEW_BOUNDARY_JUDGE_EVIDENCE_PATHS,
  });
  writeJson(join(caseRoot, 'judge-visible-candidate.json'), judgeVisibility);
  const runtime = materializeBenchmarkSessionRuntime({
    runDirectory: caseRoot,
    role: 'post-hoc-judge',
    instanceId: `rubric-calibration-${input.trialIndex}-${input.goldCase.id}`,
    workingDirectory: workspace,
    sessionExecutable: baseEnvironment.codexNativeExecutable.path,
    ...benchmarkSessionCredentialInput({ codexNativeExecutable: baseEnvironment.codexNativeExecutable }),
    nodeExecutable: baseEnvironment.nodeExecutable.path,
    modelCatalog: baseEnvironment.modelCatalog,
    writeProtectedPaths: [workspace],
  });
  await assertLocalToolSandbox({
    codexExecutable: baseEnvironment.codexExecutable,
    nodeExecutable: baseEnvironment.nodeExecutable,
    repositoryRoot: args.repositoryRoot,
    workingDirectory: workspace,
    filesystemAccess: 'read',
    processContainer: runtime.processContainer,
    readableProbePath: join(judgeContext, 'candidate.patch'),
    deniedWriteProbePath: join(judgeContext, 'episode-checkpoint.json'),
    deniedCredentialPath: join(homedir(), '.codex', 'auth.json'),
    deadlineEpochMs: input.deadlineEpochMs,
  });
  await assertBenchmarkModelCatalogAccepted({
    codexExecutable: baseEnvironment.codexExecutable,
    modelCatalogPath: runtime.modelCatalogPath,
    workingDirectory: workspace,
    modelId: manifest.model.modelId,
    deadlineEpochMs: input.deadlineEpochMs,
  });
  await assertTrustedExecutable(baseEnvironment.codexNativeExecutable, workspace, input.deadlineEpochMs);
  const outputSchemaPath = join(runtime.controlDirectory, 'review-boundary-output.schema.json');
  const outputPath = join(runtime.controlDirectory, 'review-boundary-output.json');
  writeJson(outputSchemaPath, CONVERGENCE_JUDGE_OUTPUT_SCHEMA);
  const result = await withBenchmarkSessionCredential(
    runtime,
    async () =>
      await runAdaptiveDevelopmentProcess(
        buildAdaptiveDevelopmentCodexInvocation({
          executable: baseEnvironment.codexNativeExecutable.path,
          codexHome: runtime.codexHome,
          model: manifest.model.modelId,
          workingDirectory: workspace,
          rolloutBudget: { kind: 'unbounded' },
          outputSchemaPath,
          outputLastMessagePath: outputPath,
          developerInstructions: commonDeveloperInstructions('judge'),
          prompt: convergenceReviewBoundaryPrompt({
            executorInput: projection.judgeContext.taskInput,
            allowedChangedPaths: projection.judgeContext.scope.allowedChangedPaths,
          }),
          filesystemAccess: 'read',
          agentExecutionMode: 'single_agent',
          nodeExecutable: baseEnvironment.nodeExecutable.path,
          modelCatalogPath: runtime.modelCatalogPath,
          providerTransportTrustPath: runtime.providerTransportTrustPath,
          processContainer: runtime.processContainer,
          skipGitRepositoryCheck: true,
        }),
        input.deadlineEpochMs,
      ),
  );
  writeAdaptiveDevelopmentProcessLogs(caseRoot, 'convergence-review-boundary-calibration', result);
  const telemetry = parseAdaptiveDevelopmentCodexTelemetry(result.stdout);
  if (!codexProcessSucceeded(result, telemetry, outputPath)) {
    throw new Error(
      `convergence Review-boundary calibration trial ${input.trialIndex} case ${input.goldCase.id} failed: ${tail(result.stderr || result.stdout)}`,
    );
  }
  if (telemetry.childThreadIds.length > 0) {
    throw new Error('convergence Review-boundary calibration must remain single-agent');
  }
  assertAdaptiveDevelopmentReviewVisibilityIntegrity(workspace, judgeVisibility);
  const judgeOutput = parseConvergenceJudgeOutput(readAdaptiveDevelopmentStructuredOutput(outputPath));
  assertConvergenceJudgeEvidence({
    judge: judgeOutput,
    judgeStdout: result.stdout,
    visibility: judgeVisibility,
    visibilityRoots: { candidateRoot: workspace, runnerProvidedRoot: workspace },
  });
  const findings = {
    p1: judgeOutput.findings.filter((finding) => finding.severity === 'P1').length,
    p2: judgeOutput.findings.filter((finding) => finding.severity === 'P2').length,
    p3: judgeOutput.findings.filter((finding) => finding.severity === 'P3').length,
  };
  return {
    caseId: input.goldCase.id,
    sessionId: requireConvergenceSessionId(telemetry, 'Review-boundary calibration'),
    classification: {
      reviewDemand: judgeOutput.reviewDemand,
      observedReviewState: judgeOutput.observedReviewState,
      verdict: judgeOutput.verdict,
      findings,
    },
    usage: {
      inputTokens: telemetry.inputTokens,
      cachedInputTokens: telemetry.cachedInputTokens,
      outputTokens: telemetry.outputTokens,
      toolCalls: telemetry.toolCalls,
      failedToolCalls: telemetry.failedToolCalls,
      usageObserved: true,
    },
  };
}

async function runConvergenceReviewBoundaryCalibrationTrial(input: {
  readonly context: BenchmarkCommandContext;
  readonly rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric;
  readonly goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite;
  readonly calibrationRoot: string;
  readonly trialIndex: number;
  readonly deadlineEpochMs: number;
}): Promise<AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial> {
  const caseRuns: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationTrial['caseRuns'][number][] = [];
  for (const goldCase of input.goldSuite.cases) {
    caseRuns.push(await runConvergenceReviewBoundaryCalibrationCase({ ...input, goldCase }));
  }
  return { caseRuns };
}

async function runConvergenceReviewBoundaryCalibration(
  context: BenchmarkCommandContext,
  rubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  goldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  calibrationScopeSha256: string,
  calibrationPlanSha256: string,
): Promise<AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate> {
  const calibrationRoot = join(context.runRoot, 'review-boundary-calibration');
  mkdirSync(calibrationRoot, { recursive: true });
  const deadlineEpochMs = Date.now() + CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_WALL_TIME_MS_CAP;
  const trials = await Promise.all(
    Array.from({ length: ADAPTIVE_DEVELOPMENT_CONVERGENCE_REVIEW_BOUNDARY_CALIBRATION_TRIALS }, (_, index) =>
      runConvergenceReviewBoundaryCalibrationTrial({
        context,
        rubric,
        goldSuite,
        calibrationRoot,
        trialIndex: index + 1,
        deadlineEpochMs,
      }),
    ),
  );
  if (trials.length !== 2) throw new Error('convergence Review-boundary calibration requires exactly two trials');
  const certificate = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate({
    runnerCommit: context.baseEnvironment.runnerCommit,
    environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(context.baseEnvironment),
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(context.manifest),
    modelId: context.manifest.model.modelId,
    calibrationScopeSha256,
    calibrationPlanSha256,
    rubric,
    goldSuite,
    trials: [trials[0], trials[1]],
  });
  writeJson(join(context.runRoot, 'review-boundary-calibration-certificate.json'), certificate);
  return certificate;
}

function convergenceReviewBoundaryCalibrationCertificateFromPlan(
  path: string,
): AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate {
  const plan = parseAdaptiveDevelopmentConvergenceCanaryPlan(JSON.parse(readFileSync(path, 'utf8')));
  if (plan.scope.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    throw new Error('convergence canary execution requires a rubric-calibrated current scope');
  }
  return plan.scope.reviewBoundaryCalibrationCertificate;
}

async function runConvergenceReviewBoundaryCalibrationCommand(context: BenchmarkCommandContext): Promise<void> {
  const { args, approvalAuthority, runRoot } = context;
  if (!approvalAuthority) throw new Error('Review-boundary calibration requires trusted operator authority');
  const { rubric, goldSuite } = loadConvergenceJudgeAssets(args.repositoryRoot);
  const scope = currentConvergenceReviewBoundaryCalibrationScope(context, rubric, goldSuite);
  const calibrationScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  writeJson(join(runRoot, 'review-boundary-calibration-scope.json'), scope);
  if (args.mode === 'prepare-review-boundary-calibration') {
    process.stdout.write(
      `${JSON.stringify({
        status: 'convergence_judge_calibration_scope_ready',
        runRoot,
        calibrationScopeSha256,
        rubricSha256: scope.rubricSha256,
        goldSuiteSha256: scope.goldSuiteSha256,
        judgeContractVersion: scope.judgeContractVersion,
        trials: scope.trials,
        casesPerTrial: scope.goldSuite.cases.length,
        totalJudgeSessions: scope.trials * scope.goldSuite.cases.length,
        tokenPolicy: scope.tokenPolicy,
        nonScoring: true,
        effectClaimEligible: false,
        requiredApprovalDirective: buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective(
          scope,
          approvalAuthority,
        ),
      })}\n`,
    );
    return;
  }
  await runCarrierReadiness({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    modelId: context.manifest.model.modelId,
    codexExecutable: context.baseEnvironment.codexExecutable,
    codexNativeExecutable: context.baseEnvironment.codexNativeExecutable,
    nodeExecutable: context.baseEnvironment.nodeExecutable,
    runtimeArtifacts: context.baseEnvironment.runtimeArtifacts,
    modelCatalog: context.baseEnvironment.modelCatalog,
  });
  const claimed = await claimAuthorizedConvergenceReviewBoundaryCalibration({
    context,
    scope,
    planPath: args.reviewBoundaryCalibrationPlanPath as string,
  });
  let current = claimed.record;
  try {
    writeJson(join(runRoot, 'review-boundary-calibration-plan.json'), current.plan);
    const certificate = await runConvergenceReviewBoundaryCalibration(
      context,
      rubric,
      goldSuite,
      calibrationScopeSha256,
      current.calibrationPlanSha256,
    );
    const completedAt = lifecycleTimestampAfter(current.startedAt);
    const next: ConvergenceReviewBoundaryCalibrationExecutionRecord = {
      ...current,
      state: 'completed',
      completedAt,
      certificate,
      certificateSha256: fingerprintAdaptiveDevelopmentBenchmark(certificate),
    };
    await transitionConvergenceReviewBoundaryCalibrationRecord(claimed.redis, current, next);
    current = next;
    writeJson(join(runRoot, 'review-boundary-calibration-execution-record.json'), current);
    process.stdout.write(
      `${JSON.stringify({
        status: 'convergence_judge_calibration_complete',
        runRoot,
        calibrationScopeSha256,
        calibrationPlanSha256: current.calibrationPlanSha256,
        certificateSha256: current.certificateSha256,
        executionRecordSha256: fingerprintAdaptiveDevelopmentBenchmark(current),
      })}\n`,
    );
  } catch (error) {
    const next: ConvergenceReviewBoundaryCalibrationExecutionRecord = {
      ...current,
      state: 'failed',
      failedAt: lifecycleTimestampAfter(current.startedAt),
      failureSha256: fingerprintAdaptiveDevelopmentBenchmark({
        kind: 'convergence_judge_calibration_failure',
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      }),
    };
    await transitionConvergenceReviewBoundaryCalibrationRecord(claimed.redis, current, next);
    throw error;
  } finally {
    await claimed.redis.quit().catch(() => {});
  }
}

function buildCurrentConvergenceCanaryScope(
  context: BenchmarkCommandContext,
  calibrationCertificate: AdaptiveDevelopmentOracleCalibrationCertificate,
  reviewBoundaryRubric: AdaptiveDevelopmentConvergenceReviewBoundaryRubric,
  reviewBoundaryGoldSuite: AdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  reviewBoundaryCalibrationCertificate: AdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
) {
  const { manifest, baseEnvironment } = context;
  const canary = manifest.convergenceCanary;
  const stage = manifest.stages.find((candidate) => candidate.id === context.args.stageId);
  const task = manifest.tasks.find((candidate) => candidate.id === canary.taskId);
  if (!stage || !stage.taskIds.includes(canary.taskId)) {
    throw new Error('convergence canary stage does not contain the exact canary task');
  }
  if (!task?.oraclePolicy.observableBehaviors) {
    throw new Error('convergence canary task does not declare its approved behavior vector');
  }
  if (
    calibrationCertificate.oracleToolchainSha256 !==
      fingerprintAdaptiveDevelopmentOracleToolchain(context.oracleToolchain.identity) ||
    calibrationCertificate.oracleSpecificitySha256 !== fingerprintAdaptiveDevelopmentBenchmark(canary.oracleSpecificity)
  ) {
    throw new Error('convergence oracle calibration certificate is stale for the current toolchain or contract');
  }
  return buildAdaptiveDevelopmentConvergenceCanaryScope({
    runnerCommit: baseEnvironment.runnerCommit,
    environmentSha256: fingerprintAdaptiveDevelopmentBenchmark(baseEnvironment),
    manifestSha256: fingerprintAdaptiveDevelopmentBenchmark(manifest),
    canaryId: canary.id,
    taskId: canary.taskId,
    armId: canary.armId,
    modelId: manifest.model.modelId,
    behaviorIds: task.oraclePolicy.observableBehaviors.map((behavior) => behavior.id),
    maximumRepairRounds: 0,
    candidateWallTimeMsCap: stage.wallTimeMsCap,
    adjudicationWallTimeMsCap: stage.wallTimeMsCap,
    calibrationCertificate,
    reviewBoundaryRubric,
    reviewBoundaryGoldSuite,
    reviewBoundaryCalibrationCertificate,
  });
}

async function runConvergenceCanaryCommand(context: BenchmarkCommandContext): Promise<void> {
  const { args, manifest, approvalAuthority, baseEnvironment, oracleToolchain, runRoot } = context;
  if (!approvalAuthority) throw new Error('convergence canary requires the trusted Cat Café approval authority');
  const carrierReadiness = await runCarrierReadiness({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    modelId: manifest.model.modelId,
    codexExecutable: baseEnvironment.codexExecutable,
    codexNativeExecutable: baseEnvironment.codexNativeExecutable,
    nodeExecutable: baseEnvironment.nodeExecutable,
    runtimeArtifacts: baseEnvironment.runtimeArtifacts,
    modelCatalog: baseEnvironment.modelCatalog,
  });
  const { rubric: reviewBoundaryRubric, goldSuite: reviewBoundaryGoldSuite } = loadConvergenceJudgeAssets(args.repositoryRoot);
  const suppliedReviewBoundaryCalibrationCertificate =
    args.mode === 'prepare-convergence-canary'
      ? (JSON.parse(readFileSync(args.reviewBoundaryCalibrationCertificatePath as string, 'utf8')) as unknown)
      : convergenceReviewBoundaryCalibrationCertificateFromPlan(args.convergenceCanaryPlanPath as string);
  const reviewBoundaryCalibrationCertificate = await loadTrustedConvergenceReviewBoundaryCalibrationCertificate(
    context,
    suppliedReviewBoundaryCalibrationCertificate,
    reviewBoundaryRubric,
    reviewBoundaryGoldSuite,
  );
  const calibrationCertificate =
    args.mode === 'prepare-convergence-canary'
      ? await runConvergenceOracleCalibration(context)
      : convergenceCalibrationCertificateFromPlan(args.convergenceCanaryPlanPath as string);
  const scope = buildCurrentConvergenceCanaryScope(
    context,
    calibrationCertificate,
    reviewBoundaryRubric,
    reviewBoundaryGoldSuite,
    reviewBoundaryCalibrationCertificate,
  );
  const canaryScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(scope);
  writeJson(join(runRoot, 'convergence-canary-scope.json'), scope);
  if (args.mode === 'prepare-convergence-canary') {
    process.stdout.write(
      `${JSON.stringify({
        status: 'convergence_canary_scope_ready',
        runRoot,
        canaryScopeSha256,
        tokenPolicy: scope.tokenPolicy,
        nonScoring: true,
        effectClaimEligible: false,
        carrierReadinessSha256: carrierReadiness.sha256,
        calibrationCertificateSha256: scope.calibrationCertificateSha256,
        reviewBoundaryRubricSha256: scope.reviewBoundaryRubricSha256,
        reviewBoundaryGoldSuiteSha256: scope.reviewBoundaryGoldSuiteSha256,
        reviewBoundaryCalibrationCertificateSha256: scope.reviewBoundaryCalibrationCertificateSha256,
        requiredApprovalDirective: buildAdaptiveDevelopmentConvergenceCanaryDirective(scope, approvalAuthority),
      })}\n`,
    );
    return;
  }
  const execution = await claimAuthorizedConvergenceCanaryExecution(
    args.convergenceCanaryPlanPath as string,
    scope,
    approvalAuthority,
  );
  let lifecycleRecord = execution.record;
  try {
    assertRuntimeArtifacts(baseEnvironment.runtimeArtifacts);
    await assertTrustedExecutable(
      baseEnvironment.codexNativeExecutable,
      args.repositoryRoot,
      Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS,
    );
    writeJson(join(runRoot, 'convergence-canary-plan.json'), execution.plan);
    lifecycleRecord = await execution.store.reserve(
      lifecycleRecord.canaryPlanSha256,
      lifecycleTimestampAfter(lifecycleRecord.authorizedAt),
    );
    lifecycleRecord = await execution.store.start(
      lifecycleRecord.canaryPlanSha256,
      lifecycleTimestampAfter(lifecycleRecord.reservation?.reservedAt as string),
    );
    const executed = await executeProviderBackedConvergenceCanary({
      repositoryRoot: args.repositoryRoot,
      runRoot,
      manifest,
      plan: execution.plan,
      codexExecutable: baseEnvironment.codexExecutable,
      codexNativeExecutable: baseEnvironment.codexNativeExecutable,
      nodeExecutable: baseEnvironment.nodeExecutable,
      runtimeArtifacts: baseEnvironment.runtimeArtifacts,
      oracleToolchain,
      modelCatalog: baseEnvironment.modelCatalog,
    });
    const currentAuthority = await resolveOperatorApprovalAuthority(execution.redis);
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed during convergence canary execution');
    }
    const completedAt = lifecycleTimestampAfter(lifecycleRecord.startedAt as string);
    const receipt: AdaptiveDevelopmentConvergenceCanaryReceipt = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_RECEIPT_VERSION,
      status: executed.result.status,
      zeroModelProvider: false,
      runnerCommit: scope.runnerCommit,
      environmentSha256: scope.environmentSha256,
      manifestSha256: scope.manifestSha256,
      modelId: scope.modelId,
      canaryId: scope.canaryId,
      taskId: scope.taskId,
      armId: scope.armId,
      behaviorIds: scope.behaviorIds,
      reviewBoundaryRubricSha256: scope.reviewBoundaryRubricSha256,
      reviewBoundaryCalibrationCertificateSha256: scope.reviewBoundaryCalibrationCertificateSha256,
      calibrationCoverage: scope.calibrationCoverage,
      overallSopCalibrationComplete: scope.overallSopCalibrationComplete,
      canaryScopeSha256,
      canaryPlanSha256: lifecycleRecord.canaryPlanSha256,
      tokenPolicy: scope.tokenPolicy,
      nonScoring: true,
      effectClaimEligible: false,
      completedAt,
      result: executed.result,
      usage: executed.usage,
      timing: executed.timing,
    };
    assertAdaptiveDevelopmentConvergenceCanaryReceipt(receipt);
    const candidateEvaluation = deriveAdaptiveDevelopmentConvergenceCandidateEvaluation(
      receipt.result,
      receipt.behaviorIds,
    );
    const receiptPath = join(runRoot, 'convergence-canary-receipt.json');
    writeJson(receiptPath, receipt);
    const completed = await execution.store.complete(lifecycleRecord.canaryPlanSha256, {
      completedAt,
      receipt,
      receiptSha256: fingerprintAdaptiveDevelopmentBenchmark(receipt),
      receiptArtifactSha256: sha256File(receiptPath),
    });
    writeJson(join(runRoot, 'candidate-evaluation.json'), candidateEvaluation);
    process.stdout.write(
      `${JSON.stringify({
        status: 'convergence_canary_complete',
        resultStatus: receipt.status,
        runRoot,
        canaryScopeSha256,
        canaryPlanSha256: lifecycleRecord.canaryPlanSha256,
        receiptSha256: completed.receiptSha256,
        receiptArtifactSha256: completed.receiptArtifactSha256,
        executionRecordSha256: fingerprintAdaptiveDevelopmentBenchmark(completed),
        finalAdjudication: receipt.result.finalAdjudication,
        candidateEvaluation,
      })}\n`,
    );
  } catch (error) {
    try {
      const current = await execution.store.get(lifecycleRecord.canaryPlanSha256);
      if (current && current.state !== 'completed' && current.state !== 'failed') {
        await execution.store.fail(current.canaryPlanSha256, {
          failedAt: lifecycleTimestampAfter(
            current.startedAt ?? current.reservation?.reservedAt ?? current.authorizedAt,
          ),
          failureSha256: fingerprintAdaptiveDevelopmentBenchmark({
            kind: 'convergence_canary_execution_failure',
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          }),
        });
      }
    } catch (stateError) {
      throw new AggregateError(
        [error, stateError],
        'convergence canary failed and its consumed state could not converge',
      );
    }
    throw error;
  } finally {
    await execution.redis.quit().catch(() => {});
  }
}

function lifecycleTimestampAfter(earlier: string): string {
  return new Date(Math.max(Date.now(), Date.parse(earlier) + 1)).toISOString();
}

function latestBenchmarkExecutionTimestamp(record: AdaptiveDevelopmentBenchmarkExecutionRecord): string {
  const timestamps = [record.authorizedAt, record.completedAt, record.failedAt];
  for (const attempt of record.attempts) {
    timestamps.push(attempt.reservedAt);
    if (attempt.state === 'running' || (attempt.state === 'terminal' && attempt.terminalKind === 'receipt')) {
      timestamps.push(attempt.startedAt);
    }
    if (attempt.state === 'terminal') timestamps.push(attempt.completedAt);
  }
  return timestamps
    .filter((timestamp): timestamp is string => timestamp !== undefined)
    .reduce((latest, timestamp) => (Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest));
}

async function runPrepareCommand(context: BenchmarkCommandContext): Promise<void> {
  const { args, manifest, environment, environmentSha256, oracleToolchain, stageAdmission, runRoot } = context;
  const scope = buildLaunchScope(manifest, args.stageId, environmentSha256, 'live', stageAdmission);
  writeJson(join(runRoot, 'launch-scope.json'), scope);
  const carrierReadiness = await runCarrierReadiness({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    modelId: manifest.model.modelId,
    codexExecutable: environment.codexExecutable,
    codexNativeExecutable: environment.codexNativeExecutable,
    nodeExecutable: environment.nodeExecutable,
    runtimeArtifacts: environment.runtimeArtifacts,
    modelCatalog: environment.modelCatalog,
  });
  await runPreflight({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    manifest,
    scope,
    codexExecutable: environment.codexExecutable,
    codexNativeExecutable: environment.codexNativeExecutable,
    nodeExecutable: environment.nodeExecutable,
    runtimeArtifacts: environment.runtimeArtifacts,
    oracleToolchain,
    modelCatalog: environment.modelCatalog,
    carrierReadiness,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: 'launch_scope_ready',
      runRoot,
      launchScopeSha256: fingerprintAdaptiveDevelopmentBenchmark(scope),
      runCount: scope.runs.length,
      stageBudget: scope.stageBudget,
      carrierReadinessSha256: carrierReadiness.sha256,
    })}\n`,
  );
}

type ClaimedBenchmarkExecution = Awaited<ReturnType<typeof claimAuthorizedBenchmarkExecution>>;

async function prepareLiveBenchmarkExecution(input: {
  readonly context: BenchmarkCommandContext;
  readonly scope: AdaptiveDevelopmentBenchmarkLaunchScope;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly carrierReadiness: CarrierReadinessArtifact;
}): Promise<ClaimedBenchmarkExecution | undefined> {
  const { args, approvalAuthority, environment, manifest, oracleToolchain, runRoot } = input.context;
  if (args.mode !== 'live') return undefined;
  await revalidateLiveExecutables(args.repositoryRoot, environment);
  await runPreflight({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    manifest,
    scope: input.scope,
    codexExecutable: environment.codexExecutable,
    codexNativeExecutable: environment.codexNativeExecutable,
    nodeExecutable: environment.nodeExecutable,
    runtimeArtifacts: environment.runtimeArtifacts,
    oracleToolchain,
    modelCatalog: environment.modelCatalog,
    carrierReadiness: input.carrierReadiness,
  });
  if (!approvalAuthority) throw new Error('live execution requires the trusted Cat Café approval authority');
  const execution = await claimAuthorizedBenchmarkExecution(
    args.launchPlanPath as string,
    input.scope,
    approvalAuthority,
  );
  if (
    fingerprintAdaptiveDevelopmentBenchmark(execution.plan) !==
    fingerprintAdaptiveDevelopmentBenchmark(input.launchPlan)
  ) {
    try {
      await execution.store.fail(execution.record.launchPlanSha256, {
        failedAt: lifecycleTimestampAfter(execution.record.authorizedAt),
        failureSha256: fingerprintAdaptiveDevelopmentBenchmark({
          kind: 'benchmark_plan_changed_after_preflight',
          preflightPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(input.launchPlan),
          claimedPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(execution.plan),
        }),
      });
    } finally {
      await execution.redis.quit().catch(() => {});
    }
    throw new Error('durable benchmark execution claim changed after live preflight');
  }
  return execution;
}

function writeFixtureBenchmarkResult(input: {
  readonly runRoot: string;
  readonly receipts: readonly AdaptiveDevelopmentBenchmarkReceipt[];
  readonly stoppedByDeadline: boolean;
  readonly carrierReadinessSha256: string;
}): void {
  const result = {
    status: 'fixture_complete',
    nonScoring: true,
    receiptCount: input.receipts.length,
    stoppedByDeadline: input.stoppedByDeadline,
    carrierReadinessSha256: input.carrierReadinessSha256,
  };
  writeJson(join(input.runRoot, 'fixture-result.json'), result);
  process.stdout.write(`${JSON.stringify({ ...result, runRoot: input.runRoot })}\n`);
}

async function completeLiveBenchmarkExecution(input: {
  readonly context: BenchmarkCommandContext;
  readonly launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly carrierReadiness: CarrierReadinessArtifact;
  readonly execution?: ClaimedBenchmarkExecution;
  readonly executionResult: ExecuteLaunchPlanResult;
}): Promise<void> {
  if (!input.execution || !input.executionResult.executionRecord) {
    throw new Error('live benchmark result is missing its durable execution lifecycle');
  }
  const { manifest, runRoot } = input.context;
  const result = evaluateAdaptiveDevelopmentBenchmark(
    manifest,
    input.executionResult.receipts,
    input.launchPlan.stageId,
    input.launchPlan,
    new LocalAdaptiveDevelopmentBenchmarkEvidenceStore(runRoot),
    new LocalAdaptiveDevelopmentBenchmarkArtifactStore(runRoot),
  );
  writeJson(join(runRoot, 'evaluation.json'), result);
  const completedRecord = await input.execution.store.complete(input.execution.record.launchPlanSha256, {
    completedAt: lifecycleTimestampAfter(latestBenchmarkExecutionTimestamp(input.executionResult.executionRecord)),
    evaluationSha256: fingerprintAdaptiveDevelopmentBenchmark(result),
    resultStatus: result.status,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      runRoot,
      stoppedByDeadline: input.executionResult.stoppedByDeadline,
      carrierReadinessSha256: input.carrierReadiness.sha256,
      executionRecordSha256: fingerprintAdaptiveDevelopmentBenchmark(completedRecord),
      result,
    })}\n`,
  );
}

async function failBenchmarkExecutionLifecycle(
  execution: ClaimedBenchmarkExecution | undefined,
  error: unknown,
): Promise<void> {
  if (!execution) return;
  try {
    const current = await execution.store.get(execution.record.launchPlanSha256);
    if (!current || current.state === 'completed' || current.state === 'failed') return;
    await execution.store.fail(current.launchPlanSha256, {
      failedAt: lifecycleTimestampAfter(latestBenchmarkExecutionTimestamp(current)),
      failureSha256: fingerprintAdaptiveDevelopmentBenchmark({
        kind: 'benchmark_execution_failure',
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      }),
    });
  } catch (stateError) {
    throw new AggregateError([error, stateError], 'benchmark execution failed and its lifecycle could not converge');
  }
}

async function runBenchmarkExecutionCommand(context: BenchmarkCommandContext): Promise<void> {
  const {
    args,
    manifest,
    approvalAuthority,
    environment,
    environmentSha256,
    oracleToolchain,
    stageAdmission,
    runRoot,
  } = context;
  const scope = buildLaunchScope(
    manifest,
    args.stageId,
    environmentSha256,
    args.mode as 'live' | 'fixture',
    stageAdmission,
  );
  writeJson(join(runRoot, 'launch-scope.json'), scope);
  const launchPlan = await resolveBenchmarkLaunchPlan(args, manifest, scope, approvalAuthority);
  writeJson(join(runRoot, 'launch-plan.json'), launchPlan);
  const carrierReadiness = await runCarrierReadiness({
    repositoryRoot: args.repositoryRoot,
    runRoot,
    modelId: manifest.model.modelId,
    codexExecutable: environment.codexExecutable,
    codexNativeExecutable: environment.codexNativeExecutable,
    nodeExecutable: environment.nodeExecutable,
    runtimeArtifacts: environment.runtimeArtifacts,
    modelCatalog: environment.modelCatalog,
  });
  const execution = await prepareLiveBenchmarkExecution({ context, scope, launchPlan, carrierReadiness });
  try {
    const executionResult = await executeLaunchPlan({
      repositoryRoot: args.repositoryRoot,
      runRoot,
      manifest,
      launchPlan,
      codexExecutable: environment.codexExecutable,
      codexNativeExecutable: environment.codexNativeExecutable,
      nodeExecutable: environment.nodeExecutable,
      runtimeArtifacts: environment.runtimeArtifacts,
      oracleToolchain,
      modelCatalog: environment.modelCatalog,
      carrierReadiness,
      ...(args.fixtureCommand ? { fixtureCommand: realpathSync(args.fixtureCommand) } : {}),
      ...(execution ? { execution: { store: execution.store, record: execution.record } } : {}),
    });
    const { receipts, stoppedByDeadline } = executionResult;
    writeJson(join(runRoot, 'receipts.json'), receipts);
    if (args.mode === 'fixture') {
      writeFixtureBenchmarkResult({
        runRoot,
        receipts,
        stoppedByDeadline,
        carrierReadinessSha256: carrierReadiness.sha256,
      });
      return;
    }
    await completeLiveBenchmarkExecution({
      context,
      launchPlan,
      carrierReadiness,
      ...(execution ? { execution } : {}),
      executionResult,
    });
  } catch (error) {
    await failBenchmarkExecutionLifecycle(execution, error);
    throw error;
  } finally {
    await execution?.redis.quit().catch(() => {});
  }
}

async function claimAuthorizedBenchmarkExecution(
  path: string,
  scope: AdaptiveDevelopmentBenchmarkLaunchScope,
  approvalAuthority: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<{
  readonly redis: RedisClient;
  readonly store: RedisAdaptiveDevelopmentBenchmarkExecutionStore;
  readonly plan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly record: AdaptiveDevelopmentBenchmarkExecutionRecord;
}> {
  const { redis, authority: currentAuthority } = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before benchmark execution claim');
    }
    const plan = await loadAuthorizedLiveLaunchPlan(path, scope, approvalAuthority, new RedisMessageStore(redis));
    const store = new RedisAdaptiveDevelopmentBenchmarkExecutionStore(redis);
    const record = await store.authorize({
      plan,
      authority: operationalCanaryAuthorityBinding(currentAuthority),
      authorizedAt: lifecycleTimestampAfter(plan.authorization.approvedAt),
    });
    return { redis, store, plan, record };
  } catch (error) {
    await redis.quit().catch(() => {});
    throw error;
  }
}

async function resolveBenchmarkLaunchPlan(
  args: CliArgs,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  scope: AdaptiveDevelopmentBenchmarkLaunchScope,
  approvalAuthority?: AdaptiveDevelopmentOperatorApprovalAuthority,
): Promise<AdaptiveDevelopmentBenchmarkLaunchPlan> {
  if (args.mode !== 'live') {
    return buildAdaptiveDevelopmentBenchmarkLaunchPlan(manifest, scope.stageId, {
      scope,
      authorization: {
        kind: 'fixture',
        fixtureId: 'deterministic-local-e2e',
        approvedLaunchScopeSha256: fingerprintAdaptiveDevelopmentBenchmark(scope),
        approvedAt: new Date(Date.now() - 1_000).toISOString(),
      },
    });
  }
  if (!approvalAuthority) throw new Error('live execution requires the trusted Cat Café approval authority');
  const { redis, authority: currentAuthority } = await connectApprovalAuthority();
  try {
    if (
      fingerprintAdaptiveDevelopmentBenchmark(currentAuthority) !==
      fingerprintAdaptiveDevelopmentBenchmark(approvalAuthority)
    ) {
      throw new Error('trusted Cat Café runtime identity changed before authorization resolution');
    }
    return await loadAuthorizedLiveLaunchPlan(
      args.launchPlanPath as string,
      scope,
      approvalAuthority,
      new RedisMessageStore(redis),
    );
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function revalidateLiveExecutables(repositoryRoot: string, environment: CommandEnvironment): Promise<void> {
  assertRuntimeArtifacts(environment.runtimeArtifacts);
  const deadlineEpochMs = Date.now() + PRELAUNCH_COMMAND_TIMEOUT_MS;
  await assertTrustedExecutable(environment.codexExecutable, repositoryRoot, deadlineEpochMs);
  await assertTrustedExecutable(environment.codexNativeExecutable, repositoryRoot, deadlineEpochMs);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'admit') {
    await runStageAdmission(args);
    return;
  }
  const context = await initializeBenchmarkCommand(args);
  if (context.args.mode === 'prepare-canary' || context.args.mode === 'canary') {
    await runCanaryCommand(context);
    return;
  }
  if (context.args.mode === 'prepare-review-boundary-calibration' || context.args.mode === 'review-boundary-calibration') {
    await runConvergenceReviewBoundaryCalibrationCommand(context);
    return;
  }
  if (context.args.mode === 'prepare-convergence-canary' || context.args.mode === 'convergence-canary') {
    await runConvergenceCanaryCommand(context);
    return;
  }
  if (context.args.mode === 'prepare') {
    await runPrepareCommand(context);
    return;
  }
  await runBenchmarkExecutionCommand(context);
}

const removeProcessSignalHandlers = installAdaptiveDevelopmentProcessSignalHandlers();
main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(removeProcessSignalHandlers);
