import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep as pathSeparator, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { rootCertificates } from 'node:tls';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { fingerprintAdaptiveDevelopmentBenchmark } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-contract.js';
import * as adaptiveDevelopmentBenchmarkRunner from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js';
import {
  ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
  ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION,
  ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_DIAGNOSTIC_REPORT_VERSION,
  ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN,
  adaptiveDevelopmentCodexTelemetryIsSuccessful,
  adaptiveDevelopmentProcessContainerCapabilities,
  adaptiveDevelopmentReviewLocationIsVisible,
  adaptiveDevelopmentStageAdmissionActiveDirectory,
  assertAdaptiveDevelopmentCarrierReadinessReceipt,
  assertAdaptiveDevelopmentCodexDoctorProviderTransport,
  assertAdaptiveDevelopmentReviewVisibilityIntegrity,
  buildAdaptiveDevelopmentCodexDoctorDiagnosticReport,
  buildAdaptiveDevelopmentCodexDoctorInvocation,
  buildAdaptiveDevelopmentCodexInvocation,
  buildAdaptiveDevelopmentCodexProcessContainerProfile,
  buildAdaptiveDevelopmentCodexSandboxProbeInvocation,
  buildAdaptiveDevelopmentDirectoryStorageGuard,
  buildAdaptiveDevelopmentLocalToolEnvironment,
  buildAdaptiveDevelopmentOperatorApprovalAuthority,
  buildAdaptiveDevelopmentOperatorApprovalDirective,
  buildAdaptiveDevelopmentOracleEnvironment,
  buildAdaptiveDevelopmentProviderTransportTrustBundle,
  buildAdaptiveDevelopmentReviewVisibilityManifest,
  materializeAdaptiveDevelopmentOracleSnapshot,
  measureAdaptiveDevelopmentDirectoryFootprintBytes,
  observeAdaptiveDevelopmentCodexAgentGraph,
  observeAdaptiveDevelopmentRuntimeIndependentReview,
  parseAdaptiveDevelopmentCodexTelemetry,
  reserveAdaptiveDevelopmentInitialStageAttempts,
  reserveAdaptiveDevelopmentRetryStageAttempt,
  runAdaptiveDevelopmentCodexAgentGraphCarrierSmoke,
  runAdaptiveDevelopmentCodexCarrierSmoke,
  runAdaptiveDevelopmentPostModelEnvironmentIsolationProbe,
  runAdaptiveDevelopmentPostModelPhaseIsolationProbe,
  runAdaptiveDevelopmentPostModelProcessIsolationProbe,
  runAdaptiveDevelopmentProcess,
  runAdaptiveDevelopmentSystemResolverSocketProbe,
  sanitizeAdaptiveDevelopmentReviewWorkspace,
  sanitizeAdaptiveDevelopmentRuntimeSnapshot,
  verifyAdaptiveDevelopmentOperatorApproval,
  writeAdaptiveDevelopmentCodexDoctorDiagnosticReport,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js';
import {
  assertAdaptiveDevelopmentConvergenceCanaryReceipt,
  assertAdaptiveDevelopmentConvergenceJudgeEvidence,
  assertAdaptiveDevelopmentOracleCalibrationCertificate,
  buildAdaptiveDevelopmentConvergenceCanaryScope,
  buildAdaptiveDevelopmentOracleCalibrationCertificate,
  deriveAdaptiveDevelopmentConvergenceCandidateEvaluation,
  evaluateAdaptiveDevelopmentOracleSpecificity,
  runAdaptiveDevelopmentConvergenceCanary,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js';
import {
  captureAdaptiveDevelopmentOracleToolchainIdentity,
  sealAdaptiveDevelopmentOracleToolchain,
} from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-oracle-toolchain.js';
import { adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture } from './helpers/adaptive-development-convergence-review-boundary-fixture.js';

const localToolEnvironment = {
  nodeExecutable: process.execPath,
  modelCatalogPath: '/private/tmp/model-catalog.json',
  providerTransportTrustPath: '/private/tmp/provider-transport-ca.pem',
  processContainer: {
    sandboxExecutable: '/usr/bin/sandbox-exec',
    sandboxProfilePath: '/private/tmp/benchmark-container.sb',
  },
};

const benchmarkRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const invocationRoot = mkdtempSync('/private/tmp/lf0001-invocation-fixture-');
const invocationWorkspace = join(invocationRoot, 'workspace');
mkdirSync(invocationWorkspace);
after(() => rmSync(invocationRoot, { recursive: true, force: true }));
const benchmarkRunnerScript = join(
  benchmarkRepositoryRoot,
  'packages/api/dist/scripts/run-adaptive-development-benchmark-s0.js',
);
const benchmarkRunnerSource = readFileSync(
  join(benchmarkRepositoryRoot, 'packages/api/src/scripts/run-adaptive-development-benchmark-s0.ts'),
  'utf8',
);
const convergenceReviewBoundaryJudgeSource = readFileSync(
  join(
    benchmarkRepositoryRoot,
    'packages/api/src/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary-judge.ts',
  ),
  'utf8',
);

async function waitForPath(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

function writePersistedCodexThread(codexHome, sessionId, usage, toolNames = []) {
  const sessions = join(codexHome, 'sessions');
  mkdirSync(sessions, { recursive: true });
  const rolloutPath = join(sessions, `rollout-${sessionId}.jsonl`);
  const lines = [
    { type: 'session_meta', payload: { id: sessionId } },
    ...toolNames.flatMap((name, index) => [
      {
        type: 'response_item',
        payload: { type: 'function_call', name, call_id: `${sessionId}-call-${index}`, status: 'completed' },
      },
      {
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: `${sessionId}-call-${index}`, output: '{}' },
      },
    ]),
    {
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: usage.inputTokens,
            cached_input_tokens: usage.cachedInputTokens,
            output_tokens: usage.outputTokens,
          },
        },
      },
    },
    { type: 'event_msg', payload: { type: 'task_complete' } },
  ];
  writeFileSync(rolloutPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return rolloutPath;
}

function writePersistedCodexGraph(codexHome, sessions, edges) {
  mkdirSync(codexHome, { recursive: true });
  const database = new Database(join(codexHome, 'state_5.sqlite'));
  try {
    database.exec(
      'CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, tokens_used INTEGER NOT NULL);' +
        'CREATE TABLE thread_spawn_edges (parent_thread_id TEXT NOT NULL, child_thread_id TEXT NOT NULL PRIMARY KEY, status TEXT NOT NULL);',
    );
    const insertThread = database.prepare('INSERT INTO threads (id, rollout_path, tokens_used) VALUES (?, ?, ?)');
    for (const session of sessions) {
      const rolloutPath = writePersistedCodexThread(codexHome, session.id, session.usage, session.toolNames);
      insertThread.run(session.id, rolloutPath, session.usage.inputTokens + session.usage.outputTokens);
    }
    const insertEdge = database.prepare(
      "INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, 'open')",
    );
    for (const edge of edges) insertEdge.run(edge.parent, edge.child);
  } finally {
    database.close();
  }
}

async function waitForPathRemoval(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path} to be removed`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

async function waitForChildClose(child, timeoutMs = 5_000) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`timed out waiting for child ${child.pid ?? 'unknown'} to close`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, signal });
    });
  });
}

function killChildIfRunning(child) {
  if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function killDetachedProcessGroupIfRunning(processGroupId) {
  try {
    process.kill(-processGroupId, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') return error;
  }
  return undefined;
}

function sourceFunction(name, nextName) {
  const start = benchmarkRunnerSource.indexOf(`async function ${name}(`);
  const end = benchmarkRunnerSource.indexOf(`async function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `missing source function ${name}`);
  assert.notEqual(end, -1, `missing source function ${nextName}`);
  return benchmarkRunnerSource.slice(start, end);
}

function sourceSection(startMarker, endMarker) {
  const start = benchmarkRunnerSource.indexOf(startMarker);
  const end = benchmarkRunnerSource.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, `missing source section ${startMarker}`);
  assert.notEqual(end, -1, `missing source section ${endMarker}`);
  return benchmarkRunnerSource.slice(start, end);
}

function launchPlanFixture() {
  const runs = ['run-a', 'run-b', 'run-c', 'run-d'].map((runKey) => ({
    runKey,
    budget: { tokenPolicy: 'unbounded', wallTimeMsCap: 600_000 },
  }));
  return {
    launchScopeSha256: 'a'.repeat(64),
    stageBudget: {
      tokenPolicy: 'unbounded',
      maximumInfrastructureRetryAttempts: 1,
    },
    runs,
  };
}

function currentCandidateEvidence(rootSessionId, reviewState = 'pending', candidateSha = '9'.repeat(40)) {
  return {
    candidatePatchSha256: '9'.repeat(64),
    candidateDiffRef: `${'8'.repeat(40)}..${candidateSha}`,
    executorEpisode: {
      mode: 'natural_agent_graph',
      rootSessionId,
      childSessionIds: [],
      collaborationToolCalls: 0,
    },
    executorCheckpoint: {
      claimed: 'achieved',
      summary: 'Completed the candidate task and proportional verification.',
      verificationCommands: ['pnpm test'],
      reviewIntent: reviewState === 'reviewed' ? 'formal_review' : 'local_result',
      reviewState,
      reviewUnit: 'candidate SHA',
    },
  };
}

function independentlyReviewedCandidateEvidence(rootSessionId, reviewerSessionId) {
  const evidence = currentCandidateEvidence(rootSessionId, 'reviewed');
  evidence.executorEpisode.childSessionIds = [reviewerSessionId];
  evidence.executorEpisode.collaborationToolCalls = 1;
  evidence.independentReview = {
    source: 'authenticated_runtime_observer',
    request: {
      eventId: 'review-request-1',
      authorSessionId: rootSessionId,
      candidateSha: '9'.repeat(40),
      candidateDiffRef: evidence.candidateDiffRef,
      candidatePatchSha256: evidence.candidatePatchSha256,
    },
    verdict: {
      eventId: 'review-verdict-1',
      requestEventId: 'review-request-1',
      reviewerSessionId,
      reviewerPrincipalId: 'reviewer-principal',
      candidateSha: '9'.repeat(40),
      candidateDiffRef: evidence.candidateDiffRef,
      candidatePatchSha256: evidence.candidatePatchSha256,
      state: 'approved',
      findings: { p1: 0, p2: 0, p3: 0 },
    },
  };
  return evidence;
}

function diagnosticCompleteConvergenceReceiptFixture() {
  const result = {
    schemaVersion: 'lf-0001.development-convergence-canary-result.v4',
    status: 'diagnostic_complete',
    nonScoring: true,
    effectClaimEligible: false,
    episode: {
      candidate: {
        round: 1,
        candidateSha: '5'.repeat(40),
        executorRoleKey: 'convergence:plan:executor',
        executorSessionId: 'executor-session-1',
        ...currentCandidateEvidence('executor-session-1', 'pending', '5'.repeat(40)),
        executorPrincipalId: 'executor-principal',
        hardInvariantMisses: [],
      },
      oracle: {
        candidateSha: '5'.repeat(40),
        passed: true,
        checks: [
          { id: 'behavior-a', passed: true },
          { id: 'behavior-b', passed: true },
        ],
      },
      judge: {
        candidateSha: '5'.repeat(40),
        judgeSessionId: 'judge-session-1',
        judgePrincipalId: 'judge-principal-1',
        judgeRoleKey: 'convergence:plan:judge',
        verdict: 'review_boundary_compliant',
        reviewDemand: 'not_required',
        observedReviewState: 'pending',
        findings: [],
      },
    },
    finalAdjudication: {
      taskCorrectnessPassed: true,
      hardBoundariesPassed: true,
      singleCandidateExecutionPassed: true,
      candidateFrozenBeforeMeasurement: true,
      postHocFeedbackAbsent: true,
      repairRounds: 0,
      reviewBoundaryPassed: true,
      outcomeCheckpointOracleConsistent: true,
      structuralMeasurementValid: true,
      calibrationCoverage: 'review_boundary_only',
      overallSopCalibrationComplete: false,
    },
  };
  return {
    schemaVersion: 'lf-0001.development-convergence-canary-receipt.v4',
    status: 'diagnostic_complete',
    zeroModelProvider: false,
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    modelId: 'gpt-5.6-sol',
    canaryId: 'convergence-canary',
    taskId: 'task',
    armId: 'treatment',
    behaviorIds: ['behavior-a', 'behavior-b'],
    reviewBoundaryRubricSha256: '6'.repeat(64),
    reviewBoundaryCalibrationCertificateSha256: '7'.repeat(64),
    calibrationCoverage: 'review_boundary_only',
    overallSopCalibrationComplete: false,
    canaryScopeSha256: '4'.repeat(64),
    canaryPlanSha256: '5'.repeat(64),
    tokenPolicy: 'unbounded',
    nonScoring: true,
    effectClaimEligible: false,
    completedAt: '2026-08-07T07:04:00.000Z',
    result,
    usage: [
      {
        role: 'executor',
        sessionId: 'executor-session-1',
        accountedSessionIds: ['executor-session-1'],
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 1,
        toolCalls: 1,
        failedToolCalls: 0,
        usageObserved: true,
      },
      {
        role: 'judge',
        sessionId: 'judge-session-1',
        accountedSessionIds: ['judge-session-1'],
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 1,
        toolCalls: 1,
        failedToolCalls: 0,
        usageObserved: true,
      },
    ],
    timing: { candidateElapsedMs: 10, adjudicationElapsedMs: 20, totalMeasuredElapsedMs: 30 },
  };
}

function oracleSpecificityCalibrationFixture() {
  const behaviorIds = ['behavior-a', 'behavior-b'];
  const oracle = (candidateSha, values) => ({
    candidateSha,
    passed: values.every(Boolean),
    checks: behaviorIds.map((id, index) => ({ id, passed: values[index] })),
  });
  return {
    expectedBehaviorIds: behaviorIds,
    baseline: oracle('1'.repeat(40), [false, false]),
    goldProjection: oracle('2'.repeat(40), [true, true]),
    behaviorEquivalentAlternate: oracle('3'.repeat(40), [true, true]),
    singleFaultMutations: [
      {
        id: 'break-behavior-a',
        targetBehaviorIds: ['behavior-a'],
        oracle: oracle('4'.repeat(40), [false, true]),
      },
      {
        id: 'break-behavior-b',
        targetBehaviorIds: ['behavior-b'],
        oracle: oracle('5'.repeat(40), [true, false]),
      },
    ],
  };
}

function oracleCalibrationCertificateFixture() {
  return buildAdaptiveDevelopmentOracleCalibrationCertificate({
    runnerCommit: '1'.repeat(40),
    environmentSha256: '2'.repeat(64),
    manifestSha256: '3'.repeat(64),
    oracleToolchainSha256: '4'.repeat(64),
    oracleSpecificitySha256: '5'.repeat(64),
    canaryId: 'convergence-canary',
    taskId: 'task',
    calibration: oracleSpecificityCalibrationFixture(),
  });
}

function executeRegisteredBehaviorCheck(check, root) {
  const controlDirectory = join(root, check.id);
  const codexHome = join(controlDirectory, 'codex-home');
  const toolTemporaryDirectory = join(controlDirectory, 'tool-tmp');
  const sandboxProfilePath = join(controlDirectory, 'post-model.sb');
  mkdirSync(toolTemporaryDirectory, { recursive: true });
  mkdirSync(join(codexHome, 'tmp'), { recursive: true });
  writeFileSync(
    sandboxProfilePath,
    buildAdaptiveDevelopmentCodexProcessContainerProfile({
      workingDirectory: benchmarkRepositoryRoot,
      controlDirectory,
      codexExecutable: process.execPath,
      nodeExecutable: process.execPath,
      codexStateDirectory: codexHome,
      ...adaptiveDevelopmentProcessContainerCapabilities('post-model-oracle'),
    }),
  );
  const workingDirectory = check.workingDirectory
    ? join(benchmarkRepositoryRoot, check.workingDirectory)
    : benchmarkRepositoryRoot;
  const boundary = {
    workingDirectory,
    nodeExecutable: process.execPath,
    processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
  };
  let nodeArgs = check.nodeArgs;
  if (check.behaviorBundle) {
    const entryPath = join(toolTemporaryDirectory, `${check.id}.tsx`);
    const bundlePath = join(toolTemporaryDirectory, `${check.id}.mjs`);
    const source = check.behaviorBundle.sourcePath
      ? readFileSync(join(benchmarkRepositoryRoot, check.behaviorBundle.sourcePath), 'utf8')
      : check.behaviorBundle.source;
    writeFileSync(entryPath, source.replaceAll('$CANDIDATE_ROOT', benchmarkRepositoryRoot));
    execFileSync(
      check.behaviorBundle.sourcePath
        ? join(benchmarkRepositoryRoot, 'node_modules', '.bin', 'esbuild')
        : join(benchmarkRepositoryRoot, check.behaviorBundle.packageDirectory, 'node_modules', '.bin', 'esbuild'),
      [
        entryPath,
        '--bundle',
        '--platform=node',
        '--format=esm',
        `--outfile=${bundlePath}`,
        `--tsconfig=${join(benchmarkRepositoryRoot, check.behaviorBundle.tsconfigPath)}`,
        '--log-level=warning',
      ],
      { cwd: benchmarkRepositoryRoot, stdio: 'pipe' },
    );
    nodeArgs = [bundlePath];
  }
  execFileSync('/usr/bin/sandbox-exec', ['-f', sandboxProfilePath, process.execPath, ...nodeArgs], {
    cwd: workingDirectory,
    env: {
      ...buildAdaptiveDevelopmentLocalToolEnvironment(boundary),
      ...buildAdaptiveDevelopmentOracleEnvironment(boundary),
    },
    stdio: 'pipe',
  });
}

describe('Adaptive Development benchmark S0 runner', () => {
  it('binds one calibrated oracle certificate into the exact canary scope and rejects drift', () => {
    const calibrationCertificate = oracleCalibrationCertificateFixture();
    const judge = adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture({
      runnerCommit: calibrationCertificate.runnerCommit,
      environmentSha256: calibrationCertificate.environmentSha256,
      manifestSha256: calibrationCertificate.manifestSha256,
      modelId: 'gpt-5.6-sol',
    });
    assert.doesNotThrow(() => assertAdaptiveDevelopmentOracleCalibrationCertificate(calibrationCertificate));
    const scope = buildAdaptiveDevelopmentConvergenceCanaryScope({
      runnerCommit: calibrationCertificate.runnerCommit,
      environmentSha256: calibrationCertificate.environmentSha256,
      manifestSha256: calibrationCertificate.manifestSha256,
      canaryId: calibrationCertificate.canaryId,
      taskId: calibrationCertificate.taskId,
      armId: 'treatment_new_sop',
      modelId: 'gpt-5.6-sol',
      behaviorIds: calibrationCertificate.behaviorIds,
      maximumRepairRounds: 0,
      candidateWallTimeMsCap: 2_700_000,
      adjudicationWallTimeMsCap: 2_700_000,
      calibrationCertificate,
      ...judge,
    });
    assert.equal(scope.calibrationCertificateSha256, fingerprintAdaptiveDevelopmentBenchmark(calibrationCertificate));
    assert.equal(scope.schemaVersion, 'lf-0001.development-convergence-canary-scope.v7');
    assert.equal(scope.wallTimeMsCap, 5_400_000);
    assert.equal(scope.roles[1].filesystemAccess, 'read');
    assert.deepEqual(adaptiveDevelopmentProcessContainerCapabilities('post-hoc-judge'), {
      writable: true,
      allowGitMetadataWrites: false,
      allowNetwork: true,
      allowNestedSandbox: false,
      allowChildProcesses: true,
      allowInterprocessCommunication: true,
    });

    const drifted = structuredClone(calibrationCertificate);
    drifted.manifestSha256 = '6'.repeat(64);
    assert.throws(
      () =>
        buildAdaptiveDevelopmentConvergenceCanaryScope({
          ...scope,
          schemaVersion: undefined,
          calibrationCertificateSha256: undefined,
          calibrationCertificate: drifted,
        }),
      /calibration certificate.*scope|scope.*calibration certificate/,
    );

    const forged = structuredClone(calibrationCertificate);
    forged.calibration.singleFaultMutations[0].oracle.checks[1].passed = false;
    forged.calibration.singleFaultMutations[0].oracle.passed = false;
    assert.throws(() => assertAdaptiveDevelopmentOracleCalibrationCertificate(forged), /calibration/);

    const reordered = structuredClone(calibrationCertificate);
    reordered.calibration.goldProjection.checks.reverse();
    assert.throws(() => assertAdaptiveDevelopmentOracleCalibrationCertificate(reordered), /ordered behavior vector/);
  });

  it('keeps ruler calibration outside the provider-backed candidate episode', () => {
    const liveStart = benchmarkRunnerSource.indexOf(
      'async function executeProviderBackedConvergenceCanaryUnderStorageGuard(',
    );
    const liveEnd = benchmarkRunnerSource.indexOf('\nfunction combineGraphAndJudgeTelemetry(', liveStart);
    assert.notEqual(liveStart, -1);
    assert.notEqual(liveEnd, -1);
    const liveEpisode = benchmarkRunnerSource.slice(liveStart, liveEnd);
    assert.doesNotMatch(liveEpisode, /convergence-baseline|assertConvergenceBaseline/);

    const commandStart = benchmarkRunnerSource.indexOf('async function runConvergenceCanaryCommand(');
    const commandEnd = benchmarkRunnerSource.indexOf('\nasync function runPrepareCommand(', commandStart);
    assert.notEqual(commandStart, -1);
    assert.notEqual(commandEnd, -1);
    const convergenceCommand = benchmarkRunnerSource.slice(commandStart, commandEnd);
    assert.match(convergenceCommand, /runConvergenceOracleCalibration/);
    assert.match(convergenceCommand, /prepare-convergence-canary/);
  });

  it('uses deterministic command-scoped identities for every runner-owned Git commit', () => {
    if (process.platform !== 'darwin') return;
    const buildCommitInvocation = adaptiveDevelopmentBenchmarkRunner.buildAdaptiveDevelopmentBenchmarkCommitInvocation;
    assert.equal(typeof buildCommitInvocation, 'function');
    const expectedIdentities = {
      runner: ['Clowder Benchmark Runner', 'benchmark@clowder.local'],
      oracle: ['Clowder Benchmark Oracle', 'benchmark-oracle@clowder.local'],
      admission: ['Clowder Benchmark Admission', 'benchmark-admission@clowder.local'],
      operational_canary: ['Adaptive Operational Canary', 'operational-canary@invalid'],
      carrier_readiness: ['Adaptive Carrier Readiness', 'carrier-readiness@invalid'],
    };
    const root = mkdtempSync(join(tmpdir(), 'lf0001-commit-identity-'));
    const workspace = join(root, 'workspace');
    const emptyHome = join(root, 'empty-home');
    const git = '/Library/Developer/CommandLineTools/usr/bin/git';
    const isolatedEnvironment = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Ambient Author Must Not Leak',
      GIT_AUTHOR_EMAIL: 'ambient-author@invalid',
      GIT_COMMITTER_NAME: 'Ambient Committer Must Not Leak',
      GIT_COMMITTER_EMAIL: 'ambient-committer@invalid',
      HOME: emptyHome,
      XDG_CONFIG_HOME: emptyHome,
    };
    mkdirSync(workspace, { recursive: true });
    mkdirSync(emptyHome, { recursive: true });
    try {
      execFileSync(git, ['init', '--initial-branch=benchmark-run'], {
        cwd: workspace,
        env: isolatedEnvironment,
        stdio: 'ignore',
      });
      for (const [role, [name, email]] of Object.entries(expectedIdentities)) {
        const invocation = buildCommitInvocation(role, ['--allow-empty', '-m', `test deterministic ${role} identity`]);
        execFileSync(git, invocation.args, {
          cwd: workspace,
          env: { ...isolatedEnvironment, ...invocation.environment },
          stdio: 'ignore',
        });
        assert.deepEqual(
          execFileSync(git, ['log', '-1', '--format=%an%n%ae%n%cn%n%ce'], {
            cwd: workspace,
            env: isolatedEnvironment,
            encoding: 'utf8',
          })
            .trim()
            .split('\n'),
          [name, email, name, email],
        );
      }
      assert.throws(() =>
        execFileSync(git, ['config', '--local', '--get-regexp', '^user\\.(name|email)$'], {
          cwd: workspace,
          env: isolatedEnvironment,
          stdio: 'pipe',
        }),
      );
      assert.doesNotMatch(benchmarkRunnerSource, /['"]commit['"]/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs one real candidate episode and never feeds post-hoc Judge or Oracle failures back into it', async () => {
    const events = [];
    let executionCount = 0;
    const result = await runAdaptiveDevelopmentConvergenceCanary({
      execute: async () => {
        executionCount += 1;
        events.push('candidate-frozen');
        return {
          round: 1,
          candidateSha: 'a'.repeat(40),
          executorRoleKey: 'candidate-role',
          executorSessionId: 'candidate-session',
          ...currentCandidateEvidence('candidate-session', 'pending', 'a'.repeat(40)),
          executorPrincipalId: 'candidate-principal',
          hardInvariantMisses: [],
        };
      },
      evaluate: async (candidate) => {
        events.push('oracle-started');
        return {
          candidateSha: candidate.candidateSha,
          passed: false,
          checks: [{ id: 'observable-behavior', passed: false }],
        };
      },
      judge: async (candidate) => {
        events.push('judge-started');
        return {
          candidateSha: candidate.candidateSha,
          judgeSessionId: 'judge-session',
          judgePrincipalId: 'judge-principal',
          judgeRoleKey: 'judge-role',
          verdict: 'review_boundary_noncompliant',
          reviewDemand: 'required',
          observedReviewState: 'pending',
          findings: [],
        };
      },
    });

    assert.equal(executionCount, 1);
    assert.deepEqual(events, ['candidate-frozen', 'oracle-started', 'judge-started']);
    assert.equal(result.status, 'diagnostic_complete');
    assert.equal(result.episode.candidate.candidateSha, 'a'.repeat(40));
    assert.equal('conjunctiveCanaryPassed' in result.episode, false);
    assert.deepEqual(result.finalAdjudication, {
      taskCorrectnessPassed: false,
      hardBoundariesPassed: true,
      singleCandidateExecutionPassed: true,
      candidateFrozenBeforeMeasurement: true,
      postHocFeedbackAbsent: true,
      repairRounds: 0,
      reviewBoundaryPassed: false,
      outcomeCheckpointOracleConsistent: false,
      structuralMeasurementValid: true,
      calibrationCoverage: 'review_boundary_only',
      overallSopCalibrationComplete: false,
    });
    assert.equal('rounds' in result, false);
    assert.equal('repairBrief' in result, false);
  });

  it('treats Formal Review as a conditional SOP obligation, not as the post-hoc Judge invocation', async () => {
    const run = async ({ candidateEvidence, reviewDemand, observedReviewState }) =>
      await runAdaptiveDevelopmentConvergenceCanary({
        execute: async () => ({
          round: 1,
          candidateSha: '9'.repeat(40),
          executorRoleKey: 'candidate-role',
          executorSessionId: 'candidate-session',
          ...candidateEvidence,
          executorPrincipalId: 'candidate-principal',
          hardInvariantMisses: [],
        }),
        evaluate: async (candidate) => ({
          candidateSha: candidate.candidateSha,
          passed: true,
          checks: [{ id: 'observable-behavior', passed: true }],
        }),
        judge: async (candidate) => ({
          candidateSha: candidate.candidateSha,
          judgeSessionId: 'judge-session',
          judgePrincipalId: 'judge-principal',
          judgeRoleKey: 'judge-role',
          verdict: 'review_boundary_compliant',
          reviewDemand,
          observedReviewState,
          findings: [],
        }),
      });

    const reviewMissing = await run({
      candidateEvidence: currentCandidateEvidence('candidate-session', 'pending'),
      reviewDemand: 'required',
      observedReviewState: 'pending',
    });
    assert.equal(reviewMissing.status, 'diagnostic_complete');
    assert.equal(reviewMissing.finalAdjudication.reviewBoundaryPassed, false);

    const selfReportedReview = await run({
      candidateEvidence: currentCandidateEvidence('candidate-session', 'reviewed'),
      reviewDemand: 'required',
      observedReviewState: 'reviewed',
    });
    assert.equal(selfReportedReview.status, 'diagnostic_complete');
    assert.equal(selfReportedReview.finalAdjudication.reviewBoundaryPassed, false);

    const reviewCompleted = await run({
      candidateEvidence: independentlyReviewedCandidateEvidence('candidate-session', 'reviewer-session'),
      reviewDemand: 'required',
      observedReviewState: 'reviewed',
    });
    assert.equal(reviewCompleted.status, 'diagnostic_complete');

    const unnecessaryReview = independentlyReviewedCandidateEvidence('candidate-session', 'reviewer-session');
    unnecessaryReview.executorCheckpoint.reviewIntent = 'local_result';
    unnecessaryReview.executorCheckpoint.reviewState = 'pending';
    const reviewWithoutDemand = await run({
      candidateEvidence: unnecessaryReview,
      reviewDemand: 'not_required',
      observedReviewState: 'pending',
    });
    assert.equal(reviewWithoutDemand.finalAdjudication.reviewBoundaryPassed, false);

    const movingCandidate = currentCandidateEvidence('candidate-session', 'pending');
    movingCandidate.executorCheckpoint.claimed = 'not_achieved';
    const reviewDeferredUntilStable = await run({
      candidateEvidence: movingCandidate,
      reviewDemand: 'required',
      observedReviewState: 'pending',
    });
    assert.equal(reviewDeferredUntilStable.finalAdjudication.reviewBoundaryPassed, true);
    assert.equal(reviewDeferredUntilStable.finalAdjudication.outcomeCheckpointOracleConsistent, false);
    assert.equal(reviewDeferredUntilStable.status, 'diagnostic_complete');

    const staleReview = independentlyReviewedCandidateEvidence('candidate-session', 'reviewer-session');
    staleReview.independentReview.verdict.candidatePatchSha256 = '8'.repeat(64);
    await assert.rejects(
      run({ candidateEvidence: staleReview, reviewDemand: 'required', observedReviewState: 'reviewed' }),
      /authenticated exact Review Unit/,
    );

    const selfReview = independentlyReviewedCandidateEvidence('candidate-session', 'reviewer-session');
    selfReview.independentReview.verdict.reviewerSessionId = 'candidate-session';
    await assert.rejects(
      run({ candidateEvidence: selfReview, reviewDemand: 'required', observedReviewState: 'reviewed' }),
      /authenticated exact Review Unit/,
    );

    const mismatchedRequest = independentlyReviewedCandidateEvidence('candidate-session', 'reviewer-session');
    mismatchedRequest.independentReview.verdict.requestEventId = 'different-request';
    await assert.rejects(
      run({ candidateEvidence: mismatchedRequest, reviewDemand: 'required', observedReviewState: 'reviewed' }),
      /authenticated exact Review Unit/,
    );

    await assert.rejects(
      run({
        candidateEvidence: currentCandidateEvidence('candidate-session', 'pending'),
        reviewDemand: 'required',
        observedReviewState: 'reviewed',
      }),
      /observed review state disagrees with the frozen candidate checkpoint/,
    );
  });

  it('derives a non-scoring diagnostic vector without projecting an incompletely calibrated final score', async () => {
    const result = await runAdaptiveDevelopmentConvergenceCanary({
      execute: async () => ({
        round: 1,
        candidateSha: 'b'.repeat(40),
        executorRoleKey: 'candidate-role',
        executorSessionId: 'candidate-session',
        ...currentCandidateEvidence('candidate-session', 'pending', 'b'.repeat(40)),
        executorPrincipalId: 'candidate-principal',
        hardInvariantMisses: [],
      }),
      evaluate: async (candidate) => ({
        candidateSha: candidate.candidateSha,
        passed: true,
        checks: [
          { id: 'remap-runtime-path', passed: true },
          { id: 'isolate-filtered-migration', passed: true },
        ],
      }),
      judge: async (candidate) => ({
        candidateSha: candidate.candidateSha,
        judgeSessionId: 'judge-session',
        judgePrincipalId: 'judge-principal',
        judgeRoleKey: 'judge-role',
        verdict: 'review_boundary_compliant',
        reviewDemand: 'not_required',
        observedReviewState: 'pending',
        findings: [],
      }),
    });

    assert.equal(result.status, 'diagnostic_complete');
    assert.equal('conjunctiveCanaryPassed' in result.episode, false);
    assert.deepEqual(
      deriveAdaptiveDevelopmentConvergenceCandidateEvaluation(result, [
        'remap-runtime-path',
        'isolate-filtered-migration',
      ]),
      {
        schemaVersion: 'lf-0001.development-convergence-candidate-evaluation.v4',
        nonScoring: true,
        effectClaimEligible: false,
        validity: 'valid',
        sourceResultSha256: fingerprintAdaptiveDevelopmentBenchmark(result),
        candidateSha: 'b'.repeat(40),
        executionStatus: 'completed',
        behaviorVector: [
          { id: 'remap-runtime-path', passed: true },
          { id: 'isolate-filtered-migration', passed: true },
        ],
        taskCorrectnessPassed: true,
        hardBoundariesPassed: true,
        singleCandidateExecutionPassed: true,
        candidateFrozenBeforeMeasurement: true,
        postHocFeedbackAbsent: true,
        repairRounds: 0,
        reviewBoundaryPassed: true,
        reviewBoundaryP1Count: 0,
        reviewBoundaryP2Count: 0,
        outcomeCheckpointOracleConsistent: true,
        structuralMeasurementValid: true,
        calibrationCoverage: 'review_boundary_only',
        overallSopCalibrationComplete: false,
      },
    );
    const diagnostic = deriveAdaptiveDevelopmentConvergenceCandidateEvaluation(result, [
      'remap-runtime-path',
      'isolate-filtered-migration',
    ]);
    assert.equal('y' in diagnostic, false);
    assert.equal('conjunctiveCanaryPassed' in diagnostic, false);
  });

  it('accepts only exact reproduced command traces or visible static proof as post-hoc Judge evidence', () => {
    const testFailure = {
      severity: 'P2',
      summary: 'The route still exposes a disposable descendant.',
      evidence: {
        kind: 'test_failure',
        command: "/bin/zsh -lc 'node --test packages/api/test/threads-endpoint.test.js'",
        expected: 'the stored path is under the persistent workspace',
        actual: 'expected /workspace/demo but received /runtime/demo',
        location: '',
        reasoning: '',
      },
    };
    const completedCommands = [
      {
        command: testFailure.evidence.command,
        exitCode: 1,
        output: `AssertionError: ${testFailure.evidence.actual}`,
      },
    ];
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentConvergenceJudgeEvidence({
        findings: [testFailure],
        completedCommands,
        locationIsVisible: () => false,
      }),
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceJudgeEvidence({
          findings: [
            {
              ...testFailure,
              evidence: { ...testFailure.evidence, command: 'node --test' },
            },
          ],
          completedCommands,
          locationIsVisible: () => false,
        }),
      /exact tool trace/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceJudgeEvidence({
          findings: [
            {
              ...testFailure,
              evidence: { ...testFailure.evidence, actual: 'invented failure output' },
            },
          ],
          completedCommands,
          locationIsVisible: () => false,
        }),
      /exact tool trace/,
    );

    const staticProof = {
      severity: 'P2',
      summary: 'A route bypasses the persistent-path boundary.',
      evidence: {
        kind: 'static_proof',
        command: '',
        expected: '',
        actual: '',
        location: 'packages/api/src/routes/threads.ts:100',
        reasoning: 'The response returns the stored runtime path directly.',
      },
    };
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentConvergenceJudgeEvidence({
        findings: [staticProof],
        completedCommands: [],
        locationIsVisible: () => true,
      }),
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentConvergenceJudgeEvidence({
          findings: [staticProof],
          completedCommands: [],
          locationIsVisible: () => false,
        }),
      /visible candidate or runner-provided evidence/,
    );
  });

  it('requires exact candidate binding and an independent post-hoc Judge', async () => {
    await assert.rejects(
      runAdaptiveDevelopmentConvergenceCanary({
        execute: async () => ({
          round: 1,
          candidateSha: 'd'.repeat(40),
          executorRoleKey: 'run-executor',
          executorSessionId: 'shared-session',
          ...currentCandidateEvidence('shared-session', 'pending', 'd'.repeat(40)),
          executorPrincipalId: 'shared-principal',
          hardInvariantMisses: [],
        }),
        evaluate: async () => ({
          candidateSha: 'e'.repeat(40),
          passed: true,
          checks: [{ id: 'observable-behavior', passed: true }],
        }),
        judge: async (candidate) => ({
          candidateSha: candidate.candidateSha,
          judgeSessionId: 'shared-session',
          judgePrincipalId: 'shared-principal',
          judgeRoleKey: 'judge-role',
          verdict: 'review_boundary_compliant',
          reviewDemand: 'not_required',
          observedReviewState: 'pending',
          findings: [],
        }),
      }),
      /not bound to the exact candidate/,
    );
  });

  it('requires an internally consistent behavior Oracle', async () => {
    await assert.rejects(
      runAdaptiveDevelopmentConvergenceCanary({
        execute: async () => ({
          round: 1,
          candidateSha: 'd'.repeat(40),
          executorRoleKey: 'candidate-role',
          executorSessionId: 'candidate-session',
          ...currentCandidateEvidence('candidate-session', 'pending', 'd'.repeat(40)),
          executorPrincipalId: 'candidate-principal',
          hardInvariantMisses: [],
        }),
        evaluate: async (current) => ({
          candidateSha: current.candidateSha,
          passed: true,
          checks: [{ id: 'observable-behavior', passed: false }],
        }),
        judge: async (current) => ({
          candidateSha: current.candidateSha,
          judgeSessionId: 'judge-session',
          judgePrincipalId: 'judge-principal',
          judgeRoleKey: 'judge-role',
          verdict: 'review_boundary_compliant',
          reviewDemand: 'not_required',
          observedReviewState: 'pending',
          findings: [],
        }),
      }),
      /aggregate disagrees/,
    );
  });

  it('rejects durable receipt claims that contradict terminal episode evidence', () => {
    const mutations = [
      {
        label: 'candidate-oracle binding',
        apply: (receipt) => {
          receipt.result.episode.oracle.candidateSha = '6'.repeat(40);
        },
      },
      {
        label: 'complete behavior vector',
        apply: (receipt) => {
          receipt.result.episode.oracle.checks.pop();
        },
      },
      {
        label: 'Judge independence',
        apply: (receipt) => {
          receipt.result.episode.judge.judgeSessionId = 'executor-session-1';
          receipt.usage[1].sessionId = 'executor-session-1';
        },
      },
      {
        label: 'hard invariant misses',
        apply: (receipt) => {
          receipt.result.episode.candidate.hardInvariantMisses = ['out-of-scope change'];
        },
      },
      {
        label: 'Judge verdict',
        apply: (receipt) => {
          receipt.result.episode.judge.verdict = 'review_boundary_noncompliant';
        },
      },
      {
        label: 'final adjudication',
        apply: (receipt) => {
          receipt.result.finalAdjudication.taskCorrectnessPassed = false;
        },
      },
      {
        label: 'terminal status',
        apply: (receipt) => {
          receipt.result.status = 'passed';
          receipt.status = 'passed';
        },
      },
    ];
    assert.doesNotThrow(() =>
      assertAdaptiveDevelopmentConvergenceCanaryReceipt(diagnosticCompleteConvergenceReceiptFixture()),
    );
    for (const mutation of mutations) {
      const receipt = structuredClone(diagnosticCompleteConvergenceReceiptFixture());
      mutation.apply(receipt);
      assert.throws(
        () => assertAdaptiveDevelopmentConvergenceCanaryReceipt(receipt),
        undefined,
        `${mutation.label} contradiction must be rejected`,
      );
    }
  });

  it('rejects convergence receipts that omit child-session usage', () => {
    const receipt = diagnosticCompleteConvergenceReceiptFixture();
    receipt.result.episode.candidate.executorEpisode.childSessionIds = ['child-session'];
    receipt.result.episode.candidate.executorEpisode.collaborationToolCalls = 1;
    assert.throws(() => assertAdaptiveDevelopmentConvergenceCanaryReceipt(receipt), /executor usage is invalid/);
  });

  it('rejects implementation-shaped and behavior-coupled oracles before a provider canary', () => {
    const behaviorIds = ['remap-runtime-path', 'isolate-filtered-migration'];
    const oracle = (candidateSha, checks) => ({
      candidateSha,
      passed: checks.every((check) => check.passed),
      checks,
    });
    const calibrated = evaluateAdaptiveDevelopmentOracleSpecificity({
      expectedBehaviorIds: behaviorIds,
      baseline: oracle('1'.repeat(40), [
        { id: behaviorIds[0], passed: false },
        { id: behaviorIds[1], passed: false },
      ]),
      goldProjection: oracle('2'.repeat(40), [
        { id: behaviorIds[0], passed: true },
        { id: behaviorIds[1], passed: true },
      ]),
      behaviorEquivalentAlternate: oracle('3'.repeat(40), [
        { id: behaviorIds[0], passed: true },
        { id: behaviorIds[1], passed: true },
      ]),
      singleFaultMutations: [
        {
          id: 'remove-runtime-remap',
          targetBehaviorIds: [behaviorIds[0]],
          oracle: oracle('4'.repeat(40), [
            { id: behaviorIds[0], passed: false },
            { id: behaviorIds[1], passed: true },
          ]),
        },
        {
          id: 'remove-filter-isolation',
          targetBehaviorIds: [behaviorIds[1]],
          oracle: oracle('5'.repeat(40), [
            { id: behaviorIds[0], passed: true },
            { id: behaviorIds[1], passed: false },
          ]),
        },
      ],
    });
    assert.deepEqual(calibrated, { passed: true, failures: [] });

    const overfit = evaluateAdaptiveDevelopmentOracleSpecificity({
      expectedBehaviorIds: behaviorIds,
      baseline: oracle('1'.repeat(40), [
        { id: behaviorIds[0], passed: false },
        { id: behaviorIds[1], passed: false },
      ]),
      goldProjection: oracle('2'.repeat(40), [
        { id: behaviorIds[0], passed: true },
        { id: behaviorIds[1], passed: true },
      ]),
      behaviorEquivalentAlternate: oracle('3'.repeat(40), [
        { id: behaviorIds[0], passed: false },
        { id: behaviorIds[1], passed: true },
      ]),
      singleFaultMutations: [
        {
          id: 'remove-runtime-remap',
          targetBehaviorIds: [behaviorIds[0]],
          oracle: oracle('4'.repeat(40), [
            { id: behaviorIds[0], passed: false },
            { id: behaviorIds[1], passed: true },
          ]),
        },
        {
          id: 'remove-filter-isolation',
          targetBehaviorIds: [behaviorIds[1]],
          oracle: oracle('5'.repeat(40), [
            { id: behaviorIds[0], passed: false },
            { id: behaviorIds[1], passed: false },
          ]),
        },
      ],
    });
    assert.equal(overfit.passed, false);
    assert.ok(overfit.failures.some((failure) => failure.includes('behavior-equivalent alternate')));
    assert.ok(overfit.failures.some((failure) => failure.includes('not isolated')));

    const incompleteMutationCoverage = evaluateAdaptiveDevelopmentOracleSpecificity({
      expectedBehaviorIds: behaviorIds,
      baseline: oracle(
        '1'.repeat(40),
        behaviorIds.map((id) => ({ id, passed: false })),
      ),
      goldProjection: oracle(
        '2'.repeat(40),
        behaviorIds.map((id) => ({ id, passed: true })),
      ),
      behaviorEquivalentAlternate: oracle(
        '3'.repeat(40),
        behaviorIds.map((id) => ({ id, passed: true })),
      ),
      singleFaultMutations: [
        {
          id: 'remove-filter-isolation',
          targetBehaviorIds: [behaviorIds[1]],
          oracle: oracle('4'.repeat(40), [
            { id: behaviorIds[0], passed: true },
            { id: behaviorIds[1], passed: false },
          ]),
        },
      ],
    });
    assert.equal(incompleteMutationCoverage.passed, false);
    assert.ok(incompleteMutationCoverage.failures.some((failure) => failure.includes('missing mutation targets')));

    const partiallyRedBaseline = evaluateAdaptiveDevelopmentOracleSpecificity({
      expectedBehaviorIds: behaviorIds,
      baseline: oracle('1'.repeat(40), [
        { id: behaviorIds[0], passed: false },
        { id: behaviorIds[1], passed: true },
      ]),
      goldProjection: oracle(
        '2'.repeat(40),
        behaviorIds.map((id) => ({ id, passed: true })),
      ),
      behaviorEquivalentAlternate: oracle(
        '3'.repeat(40),
        behaviorIds.map((id) => ({ id, passed: true })),
      ),
      singleFaultMutations: [
        {
          id: 'remove-runtime-remap',
          targetBehaviorIds: [behaviorIds[0]],
          oracle: oracle('4'.repeat(40), [
            { id: behaviorIds[0], passed: false },
            { id: behaviorIds[1], passed: true },
          ]),
        },
        {
          id: 'remove-filter-isolation',
          targetBehaviorIds: [behaviorIds[1]],
          oracle: oracle('5'.repeat(40), [
            { id: behaviorIds[0], passed: true },
            { id: behaviorIds[1], passed: false },
          ]),
        },
      ],
    });
    assert.equal(partiallyRedBaseline.passed, false);
    assert.ok(partiallyRedBaseline.failures.some((failure) => failure.includes('every declared behavior')));
  });

  it('seals grader sources and compiler bytes so later workspace replacement cannot alter an oracle', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-oracle-toolchain-'));
    const repository = join(root, 'repository');
    const snapshotRoot = join(root, 'snapshot');
    mkdirSync(join(repository, 'node_modules', 'esbuild', 'bin'), { recursive: true });
    mkdirSync(join(repository, 'graders'), { recursive: true });
    const compilerPath = join(repository, 'node_modules', 'esbuild', 'bin', 'esbuild');
    writeFileSync(compilerPath, "#!/bin/sh\nprintf 'compiler-v1'");
    writeFileSync(join(repository, 'graders', 'behavior.ts'), 'grader-v1');
    const fakeManifest = {
      tasks: [
        { oraclePolicy: { checks: [{ id: 'behavior', behaviorBundle: { sourcePath: 'graders/behavior.ts' } }] } },
      ],
    };
    try {
      const identity = captureAdaptiveDevelopmentOracleToolchainIdentity(repository, fakeManifest);
      const sealed = sealAdaptiveDevelopmentOracleToolchain(repository, snapshotRoot, identity);
      writeFileSync(compilerPath, "#!/bin/sh\nprintf 'compiler-v2'");
      writeFileSync(join(repository, 'graders', 'behavior.ts'), 'grader-v2');
      assert.equal(execFileSync(sealed.compilerPath, [], { encoding: 'utf8' }), 'compiler-v1');
      assert.equal(readFileSync(sealed.sources[0].sealedPath, 'utf8'), 'grader-v1');
      assert.throws(
        () => sealAdaptiveDevelopmentOracleToolchain(repository, join(root, 'replay'), identity),
        /changed after its exact identity was captured/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps harness-owned tool temporary files outside the candidate workspace', () => {
    const environment = buildAdaptiveDevelopmentLocalToolEnvironment({
      workingDirectory: invocationWorkspace,
      nodeExecutable: process.execPath,
      processContainer: localToolEnvironment.processContainer,
    });
    const expectedTemporaryDirectory = join(
      dirname(localToolEnvironment.processContainer.sandboxProfilePath),
      'tool-tmp',
    );
    assert.equal(environment.TMPDIR, expectedTemporaryDirectory);
    assert.ok(resolve(environment.TMPDIR).startsWith(`${resolve(invocationWorkspace)}${pathSeparator}`) === false);
    assert.deepEqual(
      buildAdaptiveDevelopmentOracleEnvironment({
        workingDirectory: invocationWorkspace,
        processContainer: localToolEnvironment.processContainer,
      }),
      {
        NODE_ENV: 'test',
        LOG_DIR: join(expectedTemporaryDirectory, 'logs', 'api'),
      },
    );

    const controlDirectory = '/private/tmp/executor-control';
    const profile = buildAdaptiveDevelopmentCodexProcessContainerProfile({
      workingDirectory: invocationWorkspace,
      controlDirectory,
      codexExecutable: '/trusted/codex',
      nodeExecutable: process.execPath,
      codexStateDirectory: join(controlDirectory, 'codex-home'),
      writable: true,
      allowNetwork: false,
      allowNestedSandbox: false,
      allowChildProcesses: true,
      allowInterprocessCommunication: true,
    });
    assert.match(profile, new RegExp(join(controlDirectory, 'tool-tmp').replaceAll('/', '\\/')));
    assert.doesNotMatch(profile, /\.benchmark-tmp/);
  });

  it('binds each preflight role to its own writable tool temp and denies the sibling phase', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-preflight-tool-tmp-');
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    const makeRole = (role) => {
      const controlDirectory = join(root, `${role}-control`);
      const codexHome = join(controlDirectory, 'codex-home');
      const sandboxProfilePath = join(controlDirectory, 'codex-container.sb');
      const toolTemporaryDirectory = join(controlDirectory, 'tool-tmp');
      mkdirSync(join(codexHome, 'tmp'), { recursive: true });
      mkdirSync(toolTemporaryDirectory);
      writeFileSync(
        sandboxProfilePath,
        buildAdaptiveDevelopmentCodexProcessContainerProfile({
          workingDirectory: workspace,
          controlDirectory,
          codexExecutable: process.execPath,
          nodeExecutable: process.execPath,
          codexStateDirectory: codexHome,
          ...adaptiveDevelopmentProcessContainerCapabilities(role),
        }),
      );
      return {
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        toolTemporaryDirectory,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
      };
    };
    const executor = makeRole('executor');
    const reviewer = makeRole('reviewer');
    const reviewerSentinel = join(reviewer.toolTemporaryDirectory, 'sibling-sentinel.txt');
    writeFileSync(reviewerSentinel, 'reviewer-only\n');
    try {
      assert.equal(buildAdaptiveDevelopmentLocalToolEnvironment(executor).TMPDIR, executor.toolTemporaryDirectory);
      assert.equal(buildAdaptiveDevelopmentLocalToolEnvironment(reviewer).TMPDIR, reviewer.toolTemporaryDirectory);
      const result = await runAdaptiveDevelopmentProcess(
        buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
          ...executor,
          command: process.execPath,
          args: [
            '-e',
            [
              "const {readFileSync,writeFileSync}=require('node:fs');",
              "const {join}=require('node:path');",
              "const {tmpdir}=require('node:os');",
              "writeFileSync(join(tmpdir(),'executor-owned.txt'),'executor\\n');",
              'try{readFileSync(process.argv[1]);process.exit(91)}',
              'catch{process.stdout.write(tmpdir())}',
            ].join(''),
            reviewerSentinel,
          ],
        }),
        Date.now() + 30_000,
      );
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, executor.toolTemporaryDirectory);
      assert.equal(readFileSync(join(executor.toolTemporaryDirectory, 'executor-owned.txt'), 'utf8'), 'executor\n');
      assert.equal(readFileSync(reviewerSentinel, 'utf8'), 'reviewer-only\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds an ephemeral Codex invocation with the standard local tool surface and a hard workspace boundary', () => {
    const invocation = buildAdaptiveDevelopmentCodexInvocation({
      executable: '/trusted/codex',
      codexHome: '/private/tmp/executor-control/codex-home',
      model: 'gpt-5.6-sol',
      workingDirectory: invocationWorkspace,
      rolloutBudget: {
        kind: 'capped',
        tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
        reminderAtRemainingTokens: 3_000,
      },
      outputSchemaPath: '/tmp/executor.schema.json',
      outputLastMessagePath: '/tmp/executor.json',
      developerInstructions: 'common isolated instructions',
      prompt: '{"task":"same input"}',
      filesystemAccess: 'write',
      agentExecutionMode: 'natural_agent_graph',
      ...localToolEnvironment,
    });

    assert.equal(invocation.command, '/usr/bin/sandbox-exec');
    assert.deepEqual(invocation.args.slice(0, 3), ['-f', '/private/tmp/benchmark-container.sb', '/trusted/codex']);
    assert.equal(invocation.cwd, invocationWorkspace);
    assert.equal(invocation.prompt, '{"task":"same input"}');
    assert.equal(invocation.environmentPolicy, 'inherit-host');
    assert.deepEqual(invocation.env, {
      CODEX_HOME: '/private/tmp/executor-control/codex-home',
      CODEX_CA_CERTIFICATE: '/private/tmp/provider-transport-ca.pem',
      NODE_EXTRA_CA_CERTS: '/private/tmp/provider-transport-ca.pem',
      SSL_CERT_FILE: '/private/tmp/provider-transport-ca.pem',
    });
    assert.ok(invocation.args.includes('--ephemeral'));
    assert.ok(invocation.args.includes('--ignore-user-config'));
    assert.equal(invocation.args.includes('--dangerously-bypass-approvals-and-sandbox'), true);
    assert.equal(
      invocation.args.some((argument) => argument.startsWith('permissions.')),
      false,
    );
    assert.equal(
      invocation.args.some((argument) => argument.startsWith('default_permissions=')),
      false,
    );
    assert.ok(invocation.args.includes('model_catalog_json="/private/tmp/model-catalog.json"'));
    assert.equal(
      invocation.args.some((arg) => arg.startsWith('mcp_servers.')),
      false,
    );
    assert.ok(
      invocation.args.includes(
        'features.rollout_budget={enabled=true,limit_tokens=30000,reminder_at_remaining_tokens=[3000],sampling_token_weight=1.0,prefill_token_weight=1.0}',
      ),
    );
    for (const feature of [
      'shell_snapshot',
      'shell_tool',
      'unified_exec',
      'code_mode',
      'code_mode_only',
      'network_proxy',
      'multi_agent',
      'multi_agent_v2',
    ]) {
      const index = invocation.args.findIndex(
        (arg, candidateIndex) => arg === '--enable' && invocation.args[candidateIndex + 1] === feature,
      );
      assert.notEqual(index, -1, `${feature} must match the standard local Codex surface`);
    }
    for (const feature of ['apps', 'browser_use', 'computer_use', 'remote_models', 'search_tool', 'tool_suggest']) {
      const index = invocation.args.findIndex(
        (arg, candidateIndex) => arg === '--disable' && invocation.args[candidateIndex + 1] === feature,
      );
      assert.notEqual(index, -1, `${feature} must be disabled`);
    }
  });

  it('keeps post-execution evaluator invocations single-agent', () => {
    const invocation = buildAdaptiveDevelopmentCodexInvocation({
      executable: '/trusted/codex',
      codexHome: '/private/tmp/reviewer-control/codex-home',
      model: 'gpt-5.6-sol',
      workingDirectory: invocationWorkspace,
      rolloutBudget: { kind: 'unbounded' },
      outputSchemaPath: '/tmp/reviewer.schema.json',
      outputLastMessagePath: '/tmp/reviewer.json',
      developerInstructions: 'independent evaluation instructions',
      prompt: 'review the frozen candidate',
      filesystemAccess: 'read',
      agentExecutionMode: 'single_agent',
      ...localToolEnvironment,
    });

    for (const feature of ['multi_agent', 'multi_agent_v2']) {
      assert.notEqual(
        invocation.args.findIndex(
          (arg, candidateIndex) => arg === '--disable' && invocation.args[candidateIndex + 1] === feature,
        ),
        -1,
        `${feature} must remain outside the evaluation plane`,
      );
      assert.equal(
        invocation.args.some(
          (arg, candidateIndex) => arg === '--enable' && invocation.args[candidateIndex + 1] === feature,
        ),
        false,
      );
    }
  });

  it('rejects an invalid rollout reminder before launching Codex', () => {
    assert.throws(
      () =>
        buildAdaptiveDevelopmentCodexInvocation({
          executable: '/trusted/codex',
          codexHome: '/private/tmp/executor-control/codex-home',
          model: 'gpt-5.6-sol',
          workingDirectory: invocationWorkspace,
          rolloutBudget: { kind: 'capped', tokenCap: 1_000, reminderAtRemainingTokens: 1_000 },
          outputSchemaPath: '/tmp/executor.schema.json',
          outputLastMessagePath: '/tmp/executor.json',
          developerInstructions: 'instructions',
          prompt: 'task',
          filesystemAccess: 'write',
          agentExecutionMode: 'single_agent',
          ...localToolEnvironment,
        }),
      /rollout reminder/,
    );
  });

  it('omits the harness rollout budget when a bounded canary explicitly selects unbounded tokens', () => {
    const invocation = buildAdaptiveDevelopmentCodexInvocation({
      executable: '/trusted/codex',
      codexHome: '/private/tmp/executor-control/codex-home',
      model: 'gpt-5.6-sol',
      workingDirectory: invocationWorkspace,
      rolloutBudget: { kind: 'unbounded' },
      outputSchemaPath: '/tmp/executor.schema.json',
      outputLastMessagePath: '/tmp/executor.json',
      developerInstructions: 'bounded operational canary instructions',
      prompt: 'task',
      filesystemAccess: 'write',
      agentExecutionMode: 'single_agent',
      ...localToolEnvironment,
    });

    assert.equal(
      invocation.args.some((argument) => argument.startsWith('features.rollout_budget=')),
      false,
    );
    assert.ok(invocation.args.includes('model_reasoning_effort="low"'));
    assert.ok(invocation.args.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.equal(
      invocation.args.some((argument) => argument.startsWith('approval_policy=')),
      false,
    );
    assert.equal(
      invocation.args.some((argument) => argument.startsWith('sandbox_mode=')),
      false,
    );
  });

  it('rejects partial or widened rollout policies instead of silently changing the budget mode', () => {
    assert.throws(
      () =>
        buildAdaptiveDevelopmentCodexInvocation({
          executable: '/trusted/codex',
          codexHome: '/private/tmp/executor-control/codex-home',
          model: 'gpt-5.6-sol',
          workingDirectory: invocationWorkspace,
          rolloutBudget: { kind: 'capped', tokenCap: 1_000 },
          outputSchemaPath: '/tmp/executor.schema.json',
          outputLastMessagePath: '/tmp/executor.json',
          developerInstructions: 'instructions',
          prompt: 'task',
          filesystemAccess: 'write',
          agentExecutionMode: 'single_agent',
          ...localToolEnvironment,
        }),
      /exact policy fields/,
    );
    assert.throws(
      () =>
        buildAdaptiveDevelopmentCodexInvocation({
          executable: '/trusted/codex',
          codexHome: '/private/tmp/executor-control/codex-home',
          model: 'gpt-5.6-sol',
          workingDirectory: invocationWorkspace,
          rolloutBudget: { kind: 'unbounded', tokenCap: 1_000 },
          outputSchemaPath: '/tmp/executor.schema.json',
          outputLastMessagePath: '/tmp/executor.json',
          developerInstructions: 'instructions',
          prompt: 'task',
          filesystemAccess: 'write',
          agentExecutionMode: 'single_agent',
          ...localToolEnvironment,
        }),
      /contain only the explicit policy/,
    );
  });

  it('configures a zero-cost loopback Responses provider without weakening the production invocation', () => {
    const invocation = buildAdaptiveDevelopmentCodexInvocation({
      executable: '/trusted/codex',
      codexHome: '/private/tmp/executor-control/codex-home',
      model: 'gpt-5.6-sol',
      workingDirectory: invocationWorkspace,
      rolloutBudget: {
        kind: 'capped',
        tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
        reminderAtRemainingTokens: 3_000,
      },
      outputSchemaPath: '/tmp/executor.schema.json',
      outputLastMessagePath: '/tmp/executor.json',
      developerInstructions: 'carrier smoke instructions',
      prompt: '{"task":"carrier smoke"}',
      filesystemAccess: 'write',
      agentExecutionMode: 'single_agent',
      localResponsesProviderBaseUrl: 'http://127.0.0.1:43123/v1',
      ...localToolEnvironment,
    });

    assert.ok(invocation.args.includes('model_provider="adaptive_carrier_smoke"'));
    assert.ok(invocation.args.includes('model_providers.adaptive_carrier_smoke.base_url="http://127.0.0.1:43123/v1"'));
    assert.ok(invocation.args.includes('model_providers.adaptive_carrier_smoke.wire_api="responses"'));
    assert.ok(invocation.args.includes('model_providers.adaptive_carrier_smoke.requires_openai_auth=false'));
    assert.deepEqual(invocation.env, {
      CODEX_HOME: '/private/tmp/executor-control/codex-home',
      CODEX_CA_CERTIFICATE: '/private/tmp/provider-transport-ca.pem',
      NODE_EXTRA_CA_CERTS: '/private/tmp/provider-transport-ca.pem',
      SSL_CERT_FILE: '/private/tmp/provider-transport-ca.pem',
      ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_KEY: 'local-zero-cost-provider',
    });
    assert.equal(invocation.args.includes('--dangerously-bypass-approvals-and-sandbox'), true);

    assert.throws(
      () =>
        buildAdaptiveDevelopmentCodexInvocation({
          executable: '/trusted/codex',
          codexHome: '/private/tmp/executor-control/codex-home',
          model: 'gpt-5.6-sol',
          workingDirectory: invocationWorkspace,
          rolloutBudget: {
            kind: 'capped',
            tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
            reminderAtRemainingTokens: 3_000,
          },
          outputSchemaPath: '/tmp/executor.schema.json',
          outputLastMessagePath: '/tmp/executor.json',
          developerInstructions: 'carrier smoke instructions',
          prompt: '{"task":"carrier smoke"}',
          filesystemAccess: 'write',
          agentExecutionMode: 'single_agent',
          localResponsesProviderBaseUrl: 'https://api.openai.com/v1',
          ...localToolEnvironment,
        }),
      /loopback Responses provider/,
    );
  });

  it('builds one deterministic provider trust bundle from public roots plus configured enterprise roots', () => {
    const root = mkdtempSync('/private/var/tmp/lf0001-provider-trust-');
    const extraCertificatePath = join(root, 'enterprise-ca.pem');
    writeFileSync(extraCertificatePath, `${rootCertificates[1]}\n`);
    try {
      const bundle = buildAdaptiveDevelopmentProviderTransportTrustBundle({
        environment: { NODE_EXTRA_CA_CERTS: extraCertificatePath },
        publicRootCertificates: [rootCertificates[0]],
      });
      assert.equal(bundle, `${rootCertificates[0]}\n${rootCertificates[1]}\n`);
      assert.equal(bundle.match(/-----BEGIN CERTIFICATE-----/g)?.length, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds Codex doctor to the same transport trust bundle and rejects a skipped or failed WebSocket probe', () => {
    const invocation = buildAdaptiveDevelopmentCodexDoctorInvocation({
      executable: '/trusted/codex-native',
      codexHome: '/private/tmp/executor-control/codex-home',
      model: 'gpt-5.6-sol',
      workingDirectory: invocationWorkspace,
      ...localToolEnvironment,
    });
    assert.deepEqual(invocation.args.slice(0, 5), [
      '-f',
      '/private/tmp/benchmark-container.sb',
      '/trusted/codex-native',
      'doctor',
      '--json',
    ]);
    assert.equal(invocation.continuousIntegrationEnvironment, 'omitted');
    assert.deepEqual(invocation.env, {
      PATH: `${dirname(process.execPath)}:/Library/Developer/CommandLineTools/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_AUTHOR_NAME: 'Adaptive Development Candidate',
      GIT_AUTHOR_EMAIL: 'adaptive-candidate@invalid',
      GIT_COMMITTER_NAME: 'Adaptive Development Candidate',
      GIT_COMMITTER_EMAIL: 'adaptive-candidate@invalid',
      TMPDIR: '/private/tmp/tool-tmp',
      CODEX_HOME: '/private/tmp/executor-control/codex-home',
      CODEX_CA_CERTIFICATE: '/private/tmp/provider-transport-ca.pem',
      NODE_EXTRA_CA_CERTS: '/private/tmp/provider-transport-ca.pem',
      SSL_CERT_FILE: '/private/tmp/provider-transport-ca.pem',
    });

    const report = (websocketStatus, websocketSummary) => ({
      schemaVersion: 1,
      overallStatus: websocketStatus === 'ok' ? 'warning' : websocketStatus,
      checks: {
        'network.provider_reachability': {
          id: 'network.provider_reachability',
          status: 'ok',
          summary: 'Provider endpoint is reachable',
        },
        'network.websocket_reachability': {
          id: 'network.websocket_reachability',
          status: websocketStatus,
          summary: websocketSummary,
        },
      },
    });
    const processResult = (doctorReport) => ({
      exitCode: 1,
      signal: null,
      timedOut: false,
      elapsedMs: 10,
      stdout: JSON.stringify(doctorReport),
      stderr: '',
    });
    assert.deepEqual(
      assertAdaptiveDevelopmentCodexDoctorProviderTransport(
        processResult(report('ok', 'Responses WebSocket handshake succeeded')),
      ),
      { providerReachable: true, websocketReachable: true },
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCodexDoctorProviderTransport(
          processResult(report('ok', 'Responses WebSocket is not enabled for the active provider')),
        ),
      /did not perform a successful Responses WebSocket handshake/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCodexDoctorProviderTransport(
          processResult(report('warning', 'Responses WebSocket failed; HTTPS fallback may still work')),
        ),
      /did not perform a successful Responses WebSocket handshake/,
    );
  });

  it('persists a redacted Codex doctor diagnostic before a failed transport assertion', () => {
    const root = mkdtempSync('/private/var/tmp/lf0001-doctor-diagnostic-');
    const reportPath = join(root, 'executor-provider-doctor-report.json');
    const providerSecret = 'provider-secret-must-not-persist';
    const stderrSecret = 'Authorization: Bearer stderr-secret-must-not-persist';
    const processResult = {
      exitCode: 1,
      signal: null,
      timedOut: false,
      elapsedMs: 25,
      stdout: JSON.stringify({
        schemaVersion: 1,
        overallStatus: 'warning',
        credential: providerSecret,
        checks: {
          'network.provider_reachability': {
            id: 'network.provider_reachability',
            status: 'error',
            summary: `Provider endpoint returned a diagnostic failure; Authorization: Bearer ${providerSecret}`,
            credential: providerSecret,
          },
          'network.websocket_reachability': {
            id: 'network.websocket_reachability',
            status: 'skipped',
            summary: 'WebSocket probe was skipped',
          },
        },
      }),
      stderr: stderrSecret,
    };
    try {
      const diagnostic = buildAdaptiveDevelopmentCodexDoctorDiagnosticReport(processResult);
      assert.deepEqual(diagnostic, {
        schemaVersion: ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_DIAGNOSTIC_REPORT_VERSION,
        process: {
          exitCode: 1,
          signal: null,
          timedOut: false,
          elapsedMs: 25,
          stdoutSha256: createHash('sha256').update(processResult.stdout).digest('hex'),
          stderrSha256: createHash('sha256').update(processResult.stderr).digest('hex'),
        },
        reportParsed: true,
        overallStatus: 'warning',
        checks: {
          providerReachability: {
            status: 'error',
            summary: '[REDACTED_UNRECOGNIZED]',
          },
          responsesWebsocket: {
            status: 'skipped',
            summary: 'WebSocket probe was skipped',
          },
        },
        rawStdoutPersisted: false,
        rawStderrPersisted: false,
        credentialPersisted: false,
      });

      writeAdaptiveDevelopmentCodexDoctorDiagnosticReport(reportPath, processResult);
      const persisted = readFileSync(reportPath, 'utf8');
      assert.deepEqual(JSON.parse(persisted), diagnostic);
      assert.equal(persisted.includes(providerSecret), false);
      assert.equal(persisted.includes(stderrSecret), false);
      assert.equal(persisted.includes('Authorization'), false);
      assert.throws(
        () => assertAdaptiveDevelopmentCodexDoctorProviderTransport(processResult),
        /did not prove the provider endpoint reachable/,
      );
      assert.equal(existsSync(reportPath), true);

      for (const [index, sentinel] of [
        'OPENAI_API_KEY=sk-secret',
        'token=plain-secret',
        'https://user:password@example.invalid/path',
      ].entries()) {
        const sentinelResult = {
          ...processResult,
          stdout: JSON.stringify({
            overallStatus: sentinel,
            checks: {
              'network.provider_reachability': { status: sentinel, summary: sentinel },
              'network.websocket_reachability': { status: sentinel, summary: sentinel },
            },
          }),
        };
        const sentinelPath = join(root, `sentinel-${index}.json`);
        const sentinelDiagnostic = writeAdaptiveDevelopmentCodexDoctorDiagnosticReport(
          sentinelPath,
          sentinelResult,
        );
        assert.equal(sentinelDiagnostic.overallStatus, '[REDACTED_UNRECOGNIZED]');
        assert.deepEqual(sentinelDiagnostic.checks, {
          providerReachability: {
            status: '[REDACTED_UNRECOGNIZED]',
            summary: '[REDACTED_UNRECOGNIZED]',
          },
          responsesWebsocket: {
            status: '[REDACTED_UNRECOGNIZED]',
            summary: '[REDACTED_UNRECOGNIZED]',
          },
        });
        assert.equal(readFileSync(sentinelPath, 'utf8').includes(sentinel), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('persists both native carrier-readiness doctor reports before transport assertions', () => {
    const readiness = sourceFunction('runCarrierReadiness', 'reserveInitialDurableExecution');
    const executorRunIndex = readiness.indexOf('const doctorResult = await runAdaptiveDevelopmentProcess(');
    const executorReportIndex = readiness.indexOf("'executor-provider-doctor-report.json'", executorRunIndex);
    const executorAssertIndex = readiness.indexOf(
      'assertAdaptiveDevelopmentCodexDoctorProviderTransport(doctorResult)',
      executorReportIndex,
    );
    const reviewerRunIndex = readiness.indexOf(
      'const doctorResult = await runAdaptiveDevelopmentProcess(',
      executorAssertIndex + 1,
    );
    const reviewerReportIndex = readiness.indexOf("'reviewer-provider-doctor-report.json'", reviewerRunIndex);
    const reviewerAssertIndex = readiness.indexOf(
      'assertAdaptiveDevelopmentCodexDoctorProviderTransport(doctorResult)',
      reviewerReportIndex,
    );
    assert.ok(executorRunIndex < executorReportIndex && executorReportIndex < executorAssertIndex);
    assert.ok(reviewerRunIndex < reviewerReportIndex && reviewerReportIndex < reviewerAssertIndex);
    assert.equal(
      (readiness.match(/writeAdaptiveDevelopmentCodexDoctorDiagnosticReport\(/g) ?? []).length,
      2,
    );
  });

  it('runs the real Codex carrier from app-server startup through schema-bound terminal usage without a model call', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-codex-carrier-smoke-');
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'control');
    const codexHome = join(controlDirectory, 'codex-home');
    const modelCatalogPath = join(controlDirectory, 'model-catalog.json');
    const providerTransportTrustPath = join(controlDirectory, 'provider-transport-ca.pem');
    const outputSchemaPath = join(controlDirectory, 'carrier-output.schema.json');
    const outputLastMessagePath = join(controlDirectory, 'carrier-output.json');
    const sandboxProfilePath = join(controlDirectory, 'codex-container.sb');
    const codexWrapper = realpathSync(execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim());
    const codexTarget = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    const codexPlatformPackage = process.arch === 'arm64' ? 'codex-darwin-arm64' : 'codex-darwin-x64';
    const codexExecutable = realpathSync(
      join(
        dirname(dirname(codexWrapper)),
        'node_modules',
        '@openai',
        codexPlatformPackage,
        'vendor',
        codexTarget,
        'bin',
        'codex',
      ),
    );
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(join(codexHome, 'tmp'), { recursive: true });
    writeFileSync(join(workspace, 'package.json'), '{"name":"carrier-smoke"}\n');
    const bundledCatalog = JSON.parse(
      execFileSync(codexExecutable, ['debug', 'models', '--bundled'], { encoding: 'utf8' }),
    );
    const bundledModel = bundledCatalog.models.find((model) => model.slug === 'gpt-5.6-sol');
    assert.ok(bundledModel);
    writeFileSync(
      modelCatalogPath,
      JSON.stringify({
        models: [
          {
            ...bundledModel,
            apply_patch_tool_type: 'freeform',
            web_search_tool_type: 'text',
            supports_search_tool: false,
            experimental_supported_tools: [],
          },
        ],
      }),
    );
    writeFileSync(
      outputSchemaPath,
      JSON.stringify({
        type: 'object',
        additionalProperties: false,
        required: ['carrierReady'],
        properties: { carrierReady: { type: 'boolean', const: true } },
      }),
    );
    writeFileSync(providerTransportTrustPath, buildAdaptiveDevelopmentProviderTransportTrustBundle());
    writeFileSync(
      sandboxProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable,
        nodeExecutable: process.execPath,
        codexStateDirectory: codexHome,
        writable: true,
        allowNetwork: true,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
        providerCertificatePaths: [providerTransportTrustPath],
      }),
    );
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['init', '--initial-branch=carrier-smoke'], {
      cwd: workspace,
      stdio: 'ignore',
    });
    try {
      const result = await runAdaptiveDevelopmentCodexCarrierSmoke({
        invocation: {
          executable: codexExecutable,
          codexHome,
          model: 'gpt-5.6-sol',
          workingDirectory: workspace,
          rolloutBudget: {
            kind: 'capped',
            tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
            reminderAtRemainingTokens: 3_000,
          },
          outputSchemaPath,
          outputLastMessagePath,
          developerInstructions: 'Return the carrier readiness object supplied by the provider.',
          prompt: 'Complete the zero-cost carrier smoke.',
          filesystemAccess: 'write',
          agentExecutionMode: 'natural_agent_graph',
          nodeExecutable: process.execPath,
          modelCatalogPath,
          providerTransportTrustPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        },
        deadlineEpochMs: Date.now() + 60_000,
      });

      assert.equal(result.providerRequestCount, 2);
      assert.deepEqual([...result.providerToolKinds].sort(), [
        'custom:exec',
        'function:wait',
        'namespace:collaboration',
      ]);
      assert.equal(result.toolRoundTripCompleted, true);
      assert.equal(result.controlPlaneLoopbackDenied, true);
      assert.deepEqual(result.structuredOutput, { carrierReady: true });
      assert.equal(result.telemetry.completed, true);
      assert.equal(result.telemetry.usageObserved, true);
      assert.equal(result.telemetry.inputTokens, 16);
      assert.equal(result.telemetry.outputTokens, 10);
      assert.equal(result.telemetry.toolCalls, 1);
      assert.equal(result.telemetry.infrastructureFailedToolCalls, 0);

      const graphOutputPath = join(controlDirectory, 'graph-carrier-output.json');
      const graphCarrier = await runAdaptiveDevelopmentCodexAgentGraphCarrierSmoke({
        invocation: {
          executable: codexExecutable,
          codexHome,
          model: 'gpt-5.6-sol',
          workingDirectory: workspace,
          rolloutBudget: {
            kind: 'capped',
            tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
            reminderAtRemainingTokens: 3_000,
          },
          outputSchemaPath,
          outputLastMessagePath: graphOutputPath,
          developerInstructions: 'Exercise one zero-cost collaboration child and return the carrier object.',
          prompt: 'Complete the zero-cost natural agent graph readiness turn.',
          filesystemAccess: 'write',
          agentExecutionMode: 'natural_agent_graph',
          nodeExecutable: process.execPath,
          modelCatalogPath,
          providerTransportTrustPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        },
        deadlineEpochMs: Date.now() + 60_000,
      });
      assert.equal(graphCarrier.providerRequestCount, 4);
      assert.equal(graphCarrier.graph.childSessionIds.length, 1);
      assert.equal(graphCarrier.graph.accountedSessionIds.length, 2);
      assert.equal(graphCarrier.graph.usageComplete, true);
      assert.equal(graphCarrier.independentReview.source, 'authenticated_runtime_observer');
      assert.equal(graphCarrier.independentReview.verdict.state, 'approved');
      assert.equal(graphCarrier.independentReview.verdict.reviewerSessionId, graphCarrier.graph.childSessionIds[0]);
      assert.deepEqual(graphCarrier.structuredOutput, { carrierReady: true });

      const reviewerControlDirectory = join(root, 'reviewer-control');
      const reviewerCodexHome = join(reviewerControlDirectory, 'codex-home');
      const reviewerModelCatalogPath = join(reviewerControlDirectory, 'model-catalog.json');
      const reviewerOutputSchemaPath = join(reviewerControlDirectory, 'carrier-output.schema.json');
      const reviewerOutputLastMessagePath = join(reviewerControlDirectory, 'carrier-output.json');
      const reviewerSandboxProfilePath = join(reviewerControlDirectory, 'codex-container.sb');
      mkdirSync(join(reviewerCodexHome, 'tmp'), { recursive: true });
      mkdirSync(join(reviewerControlDirectory, 'tool-tmp'), { recursive: true });
      writeFileSync(reviewerModelCatalogPath, readFileSync(modelCatalogPath));
      writeFileSync(reviewerOutputSchemaPath, readFileSync(outputSchemaPath));
      writeFileSync(
        reviewerSandboxProfilePath,
        buildAdaptiveDevelopmentCodexProcessContainerProfile({
          workingDirectory: workspace,
          controlDirectory: reviewerControlDirectory,
          codexExecutable,
          nodeExecutable: process.execPath,
          codexStateDirectory: reviewerCodexHome,
          writable: false,
          allowNetwork: true,
          allowNestedSandbox: false,
          allowChildProcesses: true,
          allowInterprocessCommunication: true,
          providerCertificatePaths: [providerTransportTrustPath],
        }),
      );
      const reviewer = await runAdaptiveDevelopmentCodexCarrierSmoke({
        invocation: {
          executable: codexExecutable,
          codexHome: reviewerCodexHome,
          model: 'gpt-5.6-sol',
          workingDirectory: workspace,
          rolloutBudget: {
            kind: 'capped',
            tokenCap: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP,
            reminderAtRemainingTokens: 3_000,
          },
          outputSchemaPath: reviewerOutputSchemaPath,
          outputLastMessagePath: reviewerOutputLastMessagePath,
          developerInstructions: 'Read the frozen marker and return the carrier readiness object.',
          prompt: 'Complete the zero-cost read-only carrier smoke.',
          filesystemAccess: 'read',
          agentExecutionMode: 'single_agent',
          nodeExecutable: process.execPath,
          modelCatalogPath: reviewerModelCatalogPath,
          providerTransportTrustPath,
          processContainer: {
            sandboxExecutable: '/usr/bin/sandbox-exec',
            sandboxProfilePath: reviewerSandboxProfilePath,
          },
        },
        deadlineEpochMs: Date.now() + 60_000,
      });
      assert.deepEqual(reviewer.providerToolKinds, ['custom:exec', 'function:wait', 'namespace:collaboration']);
      assert.equal(reviewer.toolRoundTripCompleted, true);
      assert.equal(reviewer.controlPlaneLoopbackDenied, true);
      assert.deepEqual(reviewer.structuredOutput, { carrierReady: true });
      assert.equal(reviewer.telemetry.toolCalls, 1);
      assert.equal(reviewer.telemetry.failedToolCalls, 0);
      assert.equal(readFileSync(join(workspace, '.adaptive-carrier-smoke-tool'), 'utf8'), 'carrier-ready\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts terminal usage, thread identity, and tool calls from Codex JSONL', () => {
    const telemetry = parseAdaptiveDevelopmentCodexTelemetry(
      [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-author' }),
        JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }),
        JSON.stringify({
          type: 'item.started',
          item: { type: 'collab_agent_tool_call', tool: 'spawn_agent', receiver_thread_ids: [] },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            type: 'collab_agent_tool_call',
            tool: 'spawn_agent',
            receiver_thread_ids: ['thread-child-b', 'thread-child-a'],
          },
        }),
        JSON.stringify({ type: 'sub_agent_activity', agent_thread_id: 'thread-child-a' }),
        JSON.stringify({ type: 'item.started', item: { type: 'reasoning' } }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 123, cached_input_tokens: 45, output_tokens: 67 },
        }),
      ].join('\n'),
    );

    assert.deepEqual(telemetry, {
      threadId: 'thread-author',
      childThreadIds: ['thread-child-a', 'thread-child-b'],
      collaborationToolCalls: 1,
      inputTokens: 123,
      cachedInputTokens: 45,
      outputTokens: 67,
      toolCalls: 2,
      failedToolCalls: 0,
      behavioralFailedToolCalls: 0,
      infrastructureFailedToolCalls: 0,
      completed: true,
      usageObserved: true,
    });
  });

  it('produces exact Review and complete child usage from the persisted Codex runtime graph', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-codex-graph-'));
    const codexHome = join(root, 'codex-home');
    const rootSessionId = 'runtime-root';
    const reviewerSessionId = 'runtime-reviewer';
    const candidate = {
      finalSha: '5'.repeat(40),
      diffRef: `${'4'.repeat(40)}..${'5'.repeat(40)}`,
      patchSha256: '6'.repeat(64),
    };
    const request = JSON.stringify({
      kind: 'adaptive_development_formal_review_request.v1',
      candidateSha: candidate.finalSha,
      candidateDiffRef: candidate.diffRef,
      candidatePatchSha256: candidate.patchSha256,
    });
    const verdict = JSON.stringify({
      kind: 'adaptive_development_formal_review_verdict.v1',
      candidateSha: candidate.finalSha,
      candidateDiffRef: candidate.diffRef,
      candidatePatchSha256: candidate.patchSha256,
      state: 'approved',
      findings: { p1: 0, p2: 0, p3: 1 },
    });
    const executorJsonl = [
      JSON.stringify({ type: 'thread.started', thread_id: rootSessionId }),
      JSON.stringify({
        type: 'item.started',
        item: { id: 'spawn-review', type: 'collab_agent_tool_call', tool: 'spawn_agent' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'spawn-review',
          type: 'collab_agent_tool_call',
          tool: 'spawn_agent',
          status: 'completed',
          sender_thread_id: rootSessionId,
          receiver_thread_ids: [reviewerSessionId],
          prompt: request,
        },
      }),
      JSON.stringify({
        type: 'item.started',
        item: { id: 'wait-review', type: 'collab_agent_tool_call', tool: 'wait' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'wait-review',
          type: 'collab_agent_tool_call',
          tool: 'wait',
          status: 'completed',
          agents_states: { [reviewerSessionId]: { status: 'completed', message: verdict } },
        },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 },
      }),
    ].join('\n');
    try {
      writePersistedCodexGraph(
        codexHome,
        [
          {
            id: rootSessionId,
            usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 5 },
            toolNames: ['spawn_agent', 'wait_agent'],
          },
          {
            id: reviewerSessionId,
            usage: { inputTokens: 7, cachedInputTokens: 1, outputTokens: 3 },
            toolNames: ['exec'],
          },
        ],
        [{ parent: rootSessionId, child: reviewerSessionId }],
      );
      const graph = observeAdaptiveDevelopmentCodexAgentGraph({
        codexHome,
        rootTelemetry: parseAdaptiveDevelopmentCodexTelemetry(executorJsonl),
      });
      assert.deepEqual(graph, {
        rootSessionId,
        childSessionIds: [reviewerSessionId],
        collaborationToolCalls: 2,
        inputTokens: 17,
        cachedInputTokens: 3,
        outputTokens: 8,
        toolCalls: 3,
        failedToolCalls: 0,
        behavioralFailedToolCalls: 0,
        infrastructureFailedToolCalls: 0,
        usageComplete: true,
        accountedSessionIds: [reviewerSessionId, rootSessionId],
      });
      const review = observeAdaptiveDevelopmentRuntimeIndependentReview({ executorJsonl, graph, candidate });
      assert.equal(review?.request.authorSessionId, rootSessionId);
      assert.equal(review?.verdict.reviewerSessionId, reviewerSessionId);
      assert.equal(review?.verdict.requestEventId, 'spawn-review');
      assert.deepEqual(review?.verdict.findings, { p1: 0, p2: 0, p3: 1 });

      const staleVerdictJsonl = executorJsonl.replace(candidate.patchSha256, '7'.repeat(64));
      assert.equal(
        observeAdaptiveDevelopmentRuntimeIndependentReview({ executorJsonl: staleVerdictJsonl, graph, candidate }),
        undefined,
      );
      const missingWaitJsonl = executorJsonl
        .split('\n')
        .filter((line) => !line.includes('wait-review'))
        .join('\n');
      assert.equal(
        observeAdaptiveDevelopmentRuntimeIndependentReview({ executorJsonl: missingWaitJsonl, graph, candidate }),
        undefined,
      );
      const selfAuthoredJsonl = executorJsonl.replaceAll(reviewerSessionId, rootSessionId);
      assert.equal(
        observeAdaptiveDevelopmentRuntimeIndependentReview({ executorJsonl: selfAuthoredJsonl, graph, candidate }),
        undefined,
      );
      const mismatchedUnitJsonl = executorJsonl.replace(candidate.diffRef, `${'3'.repeat(40)}..${candidate.finalSha}`);
      assert.equal(
        observeAdaptiveDevelopmentRuntimeIndependentReview({ executorJsonl: mismatchedUnitJsonl, graph, candidate }),
        undefined,
      );

      const reviewerRollout = join(codexHome, 'sessions', `rollout-${reviewerSessionId}.jsonl`);
      writeFileSync(
        reviewerRollout,
        readFileSync(reviewerRollout, 'utf8')
          .split('\n')
          .filter((line) => !line.includes('task_complete'))
          .join('\n'),
      );
      assert.throws(
        () =>
          observeAdaptiveDevelopmentCodexAgentGraph({
            codexHome,
            rootTelemetry: parseAdaptiveDevelopmentCodexTelemetry(executorJsonl),
          }),
        /missing exact terminal usage/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects carrier receipts that widen tools or omit either credential-aware role', () => {
    const role = (filesystemAccess) => ({
      filesystemAccess,
      agentExecutionMode: filesystemAccess === 'write' ? 'natural_agent_graph' : 'single_agent',
      systemResolverSocketAccessible: true,
      providerReachable: true,
      websocketReachable: true,
      credentialMounted: true,
      credentialRemoved: true,
      providerRequestCount: 2,
      providerToolKinds: ['custom:exec', 'function:wait', 'namespace:collaboration'],
      toolRoundTripCompleted: true,
      controlPlaneLoopbackDenied: true,
      usage: {
        inputTokens: 16,
        cachedInputTokens: 0,
        outputTokens: 10,
        toolCalls: 1,
        failedToolCalls: 0,
        usageObserved: true,
      },
    });
    const receipt = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION,
      status: 'passed',
      zeroModelProvider: true,
      modelId: 'gpt-5.6-sol',
      postModelControlPlaneLoopbackDenied: true,
      postModelWorkspaceReadOnly: true,
      postModelPhasesIsolated: true,
      postModelProcessStateIsolated: true,
      postModelEnvironmentIsolated: true,
      providerTransportTrust: {
        trustBundleSha256: 'b'.repeat(64),
        executorTrustBundleAccess: 'passed',
        reviewerTrustBundleAccess: 'passed',
        postModelTrustBundleAccess: 'denied',
      },
      roles: {
        executor: {
          ...role('write'),
          postModelCommit: 'a'.repeat(40),
          agentGraph: {
            childSessionCount: 1,
            accountedSessionCount: 2,
            usageComplete: true,
            independentReviewObserved: true,
          },
        },
        reviewer: role('read'),
      },
    };
    assert.doesNotThrow(() => assertAdaptiveDevelopmentCarrierReadinessReceipt(receipt));
    const { postModelControlPlaneLoopbackDenied: _postModelProof, ...receiptWithoutPostModelProof } = receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutPostModelProof),
      /every zero-model control-plane boundary/,
    );
    const { postModelWorkspaceReadOnly: _postModelWorkspaceProof, ...receiptWithoutWorkspaceProof } = receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutWorkspaceProof),
      /every zero-model control-plane boundary/,
    );
    const { postModelPhasesIsolated: _phaseIsolationProof, ...receiptWithoutPhaseIsolationProof } = receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutPhaseIsolationProof),
      /every zero-model control-plane boundary/,
    );
    const { postModelProcessStateIsolated: _processIsolationProof, ...receiptWithoutProcessIsolationProof } = receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutProcessIsolationProof),
      /every zero-model control-plane boundary/,
    );
    const { postModelEnvironmentIsolated: _environmentIsolationProof, ...receiptWithoutEnvironmentIsolationProof } =
      receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutEnvironmentIsolationProof),
      /every zero-model control-plane boundary/,
    );
    const { providerTransportTrust: _providerTrust, ...receiptWithoutProviderTrust } = receipt;
    assert.throws(
      () => assertAdaptiveDevelopmentCarrierReadinessReceipt(receiptWithoutProviderTrust),
      /provider transport trust evidence/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          providerTransportTrust: {
            ...receipt.providerTransportTrust,
            postModelTrustBundleAccess: 'passed',
          },
        }),
      /exact provider trust bundle boundary/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          roles: {
            ...receipt.roles,
            executor: { ...receipt.roles.executor, agentGraph: undefined },
          },
        }),
      /exact-accounted authenticated Review child/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          roles: {
            ...receipt.roles,
            executor: {
              ...receipt.roles.executor,
              providerToolKinds: ['custom:exec', 'function:wait', 'namespace:browser'],
            },
          },
        }),
      /tool contract diverged/,
    );
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          roles: { executor: receipt.roles.executor },
        }),
      /missing the read role/,
    );
    const { controlPlaneLoopbackDenied: _proof, ...roleWithoutControlPlaneProof } = receipt.roles.executor;
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          roles: { ...receipt.roles, executor: roleWithoutControlPlaneProof },
        }),
      /control-plane loopback denial/,
    );
    const { systemResolverSocketAccessible: _resolverProof, ...roleWithoutResolverProof } = receipt.roles.executor;
    assert.throws(
      () =>
        assertAdaptiveDevelopmentCarrierReadinessReceipt({
          ...receipt,
          roles: { ...receipt.roles, executor: roleWithoutResolverProof },
        }),
      /system resolver/,
    );
  });

  it('keeps the frozen post-model candidate read-only and offline through every oracle phase', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-post-model-network-');
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'post-model-control');
    const codexHome = join(controlDirectory, 'codex-home');
    const sandboxProfilePath = join(controlDirectory, 'post-model.sb');
    const hiddenInputPath = join(workspace, 'hidden-input.js');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(join(codexHome, 'tmp'), { recursive: true });
    writeFileSync(hiddenInputPath, 'module.exports = "frozen";\n');
    const sentinel = createTcpServer((socket) => socket.end());
    await new Promise((resolvePromise, reject) => {
      sentinel.once('error', reject);
      sentinel.listen(0, '127.0.0.1', resolvePromise);
    });
    try {
      const address = sentinel.address();
      assert.ok(address && typeof address !== 'string');
      assert.deepEqual(adaptiveDevelopmentProcessContainerCapabilities('post-model-freeze'), {
        writable: true,
        allowGitMetadataWrites: true,
        allowNetwork: false,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
      });
      const oracleCapabilities = adaptiveDevelopmentProcessContainerCapabilities('post-model-oracle');
      assert.deepEqual(oracleCapabilities, {
        writable: false,
        allowGitMetadataWrites: false,
        allowNetwork: false,
        allowNestedSandbox: false,
        allowChildProcesses: false,
        allowInterprocessCommunication: false,
      });
      const profile = buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: process.execPath,
        nodeExecutable: process.execPath,
        codexStateDirectory: codexHome,
        ...oracleCapabilities,
      });
      writeFileSync(sandboxProfilePath, profile);
      assert.doesNotMatch(profile, /\(allow network\*\)/);
      const probe = [
        "const { createConnection } = require('node:net');",
        `const socket = createConnection({ host: '127.0.0.1', port: ${address.port} });`,
        'const timer = setTimeout(() => process.exit(92), 3000);',
        "socket.once('connect', () => { clearTimeout(timer); socket.destroy(); process.stdout.write('CONNECTED'); });",
        "socket.once('error', () => { clearTimeout(timer); process.stdout.write('DENIED'); });",
      ].join(' ');
      assert.equal(
        execFileSync('/usr/bin/sandbox-exec', ['-f', sandboxProfilePath, process.execPath, '-e', probe], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        'DENIED',
      );
      assert.throws(() =>
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            sandboxProfilePath,
            process.execPath,
            '-e',
            "require('node:fs').writeFileSync(process.argv[1], 'module.exports = \\\"mutated\\\";\\n')",
            hiddenInputPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
      assert.equal(readFileSync(hiddenInputPath, 'utf8'), 'module.exports = "frozen";\n');
      assert.throws(() =>
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            sandboxProfilePath,
            '/usr/bin/sandbox-exec',
            '-p',
            '(version 1)\n(allow default)',
            process.execPath,
            '-e',
            probe,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
    } finally {
      await new Promise((resolvePromise, reject) =>
        sentinel.close((error) => (error ? reject(error) : resolvePromise())),
      );
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prevents one post-model oracle phase from handing writable state to another phase', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-post-model-phase-isolation-');
    const makePhase = (phase) => {
      const workspace = join(root, phase, 'workspace');
      const controlDirectory = join(root, `${phase}-control`);
      const codexHome = join(controlDirectory, 'codex-home');
      const sandboxProfilePath = join(controlDirectory, 'post-model.sb');
      mkdirSync(workspace, { recursive: true });
      mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
      mkdirSync(join(codexHome, 'tmp'), { recursive: true });
      const profile = buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: process.execPath,
        nodeExecutable: process.execPath,
        codexStateDirectory: codexHome,
        ...adaptiveDevelopmentProcessContainerCapabilities('post-model-oracle'),
      });
      writeFileSync(sandboxProfilePath, profile);
      return {
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
      };
    };
    try {
      assert.equal(
        await runAdaptiveDevelopmentPostModelPhaseIsolationProbe({
          sourcePhase: makePhase('phase-a'),
          destinationPhase: makePhase('phase-b'),
          deadlineEpochMs: Date.now() + 30_000,
        }),
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prevents a post-model oracle phase from creating retained processes or POSIX IPC state', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-post-model-process-isolation-');
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'control');
    const codexHome = join(controlDirectory, 'codex-home');
    const sandboxProfilePath = join(controlDirectory, 'post-model.sb');
    const testPath = join(workspace, 'oracle.test.js');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(join(codexHome, 'tmp'), { recursive: true });
    writeFileSync(testPath, "const {it}=require('node:test');it('runs in the direct process',()=>{});\n");
    const profile = buildAdaptiveDevelopmentCodexProcessContainerProfile({
      workingDirectory: workspace,
      controlDirectory,
      codexExecutable: process.execPath,
      nodeExecutable: process.execPath,
      codexStateDirectory: codexHome,
      ...adaptiveDevelopmentProcessContainerCapabilities('post-model-oracle'),
    });
    writeFileSync(sandboxProfilePath, profile);
    try {
      const result = execFileSync(
        '/usr/bin/sandbox-exec',
        [
          '-f',
          sandboxProfilePath,
          process.execPath,
          '-e',
          [
            "const {execFileSync,spawnSync}=require('node:child_process');",
            "const child=spawnSync('/usr/bin/true',[],{stdio:'ignore'});",
            "let processListing;try{execFileSync('/bin/ps',['-axo','command='],{stdio:'ignore'});processListing='ALLOWED';}catch(error){processListing=error?.code;}",
            'process.stdout.write(JSON.stringify({status:child.status,error:child.error?.code,processListing}));',
          ].join(''),
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.equal(result, '{"status":null,"error":"EPERM","processListing":"EPERM"}');
      assert.doesNotMatch(profile, /\(allow ipc-posix\*\)/);
      const focused = execFileSync(
        '/usr/bin/sandbox-exec',
        ['-f', sandboxProfilePath, process.execPath, '--test', '--test-isolation=none', testPath],
        { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.match(focused, /pass 1/);
      assert.equal(
        await runAdaptiveDevelopmentPostModelProcessIsolationProbe({
          workingDirectory: workspace,
          nodeExecutable: process.execPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
          deadlineEpochMs: Date.now() + 30_000,
        }),
        true,
      );
      assert.equal(
        await runAdaptiveDevelopmentPostModelEnvironmentIsolationProbe({
          workingDirectory: workspace,
          nodeExecutable: process.execPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
          deadlineEpochMs: Date.now() + 30_000,
        }),
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('grants the auth file only to the exact trusted credential-reader process', () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-codex-credential-filter-');
    const sensitiveRoot = mkdtempSync(join(homedir(), '.lf0001-codex-credential-filter-'));
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'control');
    const siblingWorkspace = join(root, 'sibling-workspace');
    const controlSentinel = join(controlDirectory, 'launch-scope.json');
    const siblingSentinel = join(siblingWorkspace, 'package.json');
    const syntheticCodexHome = join(sensitiveRoot, 'synthetic-codex-home');
    const syntheticAuthPath = join(syntheticCodexHome, 'auth.json');
    const syntheticConfigPath = join(syntheticCodexHome, 'config.toml');
    const trustedReader = join(root, 'trusted-codex-runtime', 'bin', 'codex');
    const sessionCodexHome = join(controlDirectory, 'codex-home');
    const sessionAuthLink = join(sessionCodexHome, 'auth.json');
    const sessionStatePath = join(sessionCodexHome, 'state.sqlite');
    const sandboxProfilePath = join(controlDirectory, 'codex-container.sb');
    const reviewerProfilePath = join(controlDirectory, 'reviewer-container.sb');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(controlDirectory, { recursive: true });
    mkdirSync(siblingWorkspace);
    mkdirSync(syntheticCodexHome);
    mkdirSync(sessionCodexHome);
    mkdirSync(dirname(trustedReader), { recursive: true });
    execFileSync('/usr/bin/clang', ['-x', 'c', '-o', trustedReader, '-'], {
      input:
        '#include <stdio.h>\n#include <string.h>\nint main(int argc,char **argv){if(argc==3&&!strcmp(argv[1],"write")){FILE *f=fopen(argv[2],"w");if(!f)return 2;fputs("session-state",f);return fclose(f);}FILE *f=fopen(argv[1],"r");if(!f)return 2;for(int c;(c=fgetc(f))!=EOF;)putchar(c);return ferror(f);}\n',
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    writeFileSync(syntheticAuthPath, 'synthetic-auth-sentinel\n');
    writeFileSync(syntheticConfigPath, 'synthetic-config-sentinel\n');
    symlinkSync(syntheticAuthPath, sessionAuthLink);
    writeFileSync(controlSentinel, '{"armId":"treatment_new_sop"}\n');
    writeFileSync(siblingSentinel, '{"name":"other-anonymous-workspace"}\n');
    writeFileSync(
      sandboxProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: trustedReader,
        nodeExecutable: process.execPath,
        codexStateDirectory: sessionCodexHome,
        codexCredentialReaderExecutable: trustedReader,
        codexAuthPath: syntheticAuthPath,
        codexConfigPath: syntheticConfigPath,
        writable: true,
        allowNetwork: true,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
      }),
    );
    writeFileSync(
      reviewerProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: trustedReader,
        nodeExecutable: process.execPath,
        codexStateDirectory: sessionCodexHome,
        codexCredentialReaderExecutable: trustedReader,
        codexAuthPath: syntheticAuthPath,
        codexConfigPath: syntheticConfigPath,
        writable: false,
        allowNetwork: true,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
      }),
    );
    const sandboxed = (profilePath, command, args, options = {}) =>
      execFileSync('/usr/bin/sandbox-exec', ['-f', profilePath, command, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
      });
    try {
      assert.equal(
        sandboxed(sandboxProfilePath, trustedReader, [sessionAuthLink], { encoding: 'utf8' }),
        'synthetic-auth-sentinel\n',
      );
      sandboxed(sandboxProfilePath, trustedReader, ['write', sessionStatePath]);
      assert.equal(readFileSync(sessionStatePath, 'utf8'), 'session-state');
      assert.throws(() =>
        sandboxed(sandboxProfilePath, process.execPath, [
          '-e',
          "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
          sessionAuthLink,
        ]),
      );
      assert.throws(() =>
        sandboxed(sandboxProfilePath, process.execPath, [
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], 'model-state')",
          sessionStatePath,
        ]),
      );
      assert.equal(
        sandboxed(
          sandboxProfilePath,
          process.execPath,
          [
            '-e',
            "const {spawnSync}=require('node:child_process');const r=spawnSync(process.argv[1],[process.argv[2]],{encoding:'utf8'});process.stdout.write(r.error?.code??'spawned')",
            trustedReader,
            sessionAuthLink,
          ],
          { encoding: 'utf8' },
        ),
        'EPERM',
      );
      for (const deniedPath of [controlSentinel, siblingSentinel]) {
        assert.throws(
          () =>
            sandboxed(sandboxProfilePath, process.execPath, [
              '-e',
              "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
              deniedPath,
            ]),
          undefined,
          `process container must deny ${deniedPath}`,
        );
      }
      assert.equal(
        sandboxed(sandboxProfilePath, process.execPath, ['-e', "process.stdout.write('node-ok')"], {
          encoding: 'utf8',
          cwd: workspace,
        }),
        'node-ok',
      );
      const lateSiblingSentinel = join(root, 'late-sibling-workspace', 'secret.json');
      mkdirSync(dirname(lateSiblingSentinel));
      writeFileSync(lateSiblingSentinel, '{"secret":true}\n');
      assert.throws(
        () =>
          sandboxed(sandboxProfilePath, process.execPath, [
            '-e',
            "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
            lateSiblingSentinel,
          ]),
        undefined,
        'process container must deny siblings created after the profile is written',
      );
      assert.throws(() =>
        sandboxed(reviewerProfilePath, process.execPath, [
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], 'reviewer-mutation')",
          join(workspace, 'reviewer-mutation.txt'),
        ]),
      );
      assert.throws(() =>
        sandboxed(sandboxProfilePath, '/usr/bin/sandbox-exec', [
          '-p',
          '(version 1)\n(allow default)',
          trustedReader,
          sessionAuthLink,
        ]),
      );
      assert.throws(() =>
        sandboxed(sandboxProfilePath, process.execPath, [
          '-e',
          "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
          syntheticConfigPath,
        ]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(sensitiveRoot, { recursive: true, force: true });
    }
  });

  it('records failed local tool calls without relabeling completed model work as infrastructure failure', () => {
    const telemetry = parseAdaptiveDevelopmentCodexTelemetry(
      [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-author' }),
        JSON.stringify({
          type: 'item.started',
          item: { id: 'item-1', type: 'command_execution', command: 'node --test missing.test.js' },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'item-1',
            type: 'command_execution',
            command: 'node --test missing.test.js',
            status: 'failed',
            error: { message: 'process exited 1' },
          },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 123, cached_input_tokens: 45, output_tokens: 67 },
        }),
      ].join('\n'),
    );

    assert.equal(telemetry.toolCalls, 1);
    assert.equal(telemetry.failedToolCalls, 1);
    assert.equal(telemetry.behavioralFailedToolCalls, 1);
    assert.equal(telemetry.infrastructureFailedToolCalls, 0);
    assert.equal(adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry), true);
  });

  it('fails closed when a non-command tool reports a transport failure', () => {
    const telemetry = parseAdaptiveDevelopmentCodexTelemetry(
      [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-author' }),
        JSON.stringify({
          type: 'item.started',
          item: { id: 'item-1', type: 'mcp_tool_call', server: 'unavailable', tool: 'read_file' },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'item-1',
            type: 'mcp_tool_call',
            server: 'unavailable',
            tool: 'read_file',
            status: 'failed',
            error: { message: 'transport closed' },
          },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 123, cached_input_tokens: 45, output_tokens: 67 },
        }),
      ].join('\n'),
    );

    assert.equal(telemetry.failedToolCalls, 1);
    assert.equal(telemetry.infrastructureFailedToolCalls, 1);
    assert.equal(adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry), false);
  });

  it('builds a model-free probe inside the same outer process container', () => {
    const invocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
      workingDirectory: invocationWorkspace,
      nodeExecutable: process.execPath,
      processContainer: localToolEnvironment.processContainer,
      command: process.execPath,
      args: ['-e', "require('node:fs').readFileSync('package.json')"],
    });

    assert.equal(invocation.command, '/usr/bin/sandbox-exec');
    assert.deepEqual(invocation.args, [
      '-f',
      '/private/tmp/benchmark-container.sb',
      process.execPath,
      '-e',
      "require('node:fs').readFileSync('package.json')",
    ]);
    assert.equal(invocation.cwd, invocationWorkspace);
  });

  it('lets network-enabled roles reach the macOS resolver socket without exposing it to offline roles', async () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-resolver-socket-');
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'control');
    const codexHome = join(controlDirectory, 'codex-home');
    const providerCertificatePath = join(root, 'provider-ca.crt');
    const networkProfilePath = join(controlDirectory, 'network.sb');
    const offlineProfilePath = join(controlDirectory, 'offline.sb');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(join(codexHome, 'tmp'), { recursive: true });
    writeFileSync(providerCertificatePath, 'provider-ca\n');
    const profile = (allowNetwork) =>
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: process.execPath,
        nodeExecutable: process.execPath,
        codexStateDirectory: codexHome,
        writable: true,
        allowNetwork,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
        providerCertificatePaths: [providerCertificatePath],
      });
    const networkProfile = profile(true);
    const offlineProfile = profile(false);
    writeFileSync(networkProfilePath, networkProfile);
    writeFileSync(offlineProfilePath, offlineProfile);
    try {
      assert.match(networkProfile, /\(subpath "\/var"\)/);
      assert.match(networkProfile, /\(subpath "\/private\/var"\)/);
      assert.doesNotMatch(networkProfile, /\(allow file-read\*[^\n]+\(subpath "\/private\/var"\)/);
      assert.doesNotMatch(offlineProfile, /\(subpath "\/var"\)/);
      assert.doesNotMatch(offlineProfile, /\(subpath "\/private\/var"\)/);
      const networkFileReadRule = networkProfile.split('\n').find((line) => line.startsWith('(allow file-read*'));
      const offlineFileReadRule = offlineProfile.split('\n').find((line) => line.startsWith('(allow file-read*'));
      assert.ok(networkFileReadRule?.includes(`(literal ${JSON.stringify(providerCertificatePath)})`));
      assert.equal(offlineFileReadRule?.includes(`(literal ${JSON.stringify(providerCertificatePath)})`), false);
      assert.equal(
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            networkProfilePath,
            process.execPath,
            '-e',
            `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(providerCertificatePath)}, 'utf8'))`,
          ],
          { encoding: 'utf8' },
        ),
        'provider-ca\n',
      );
      assert.throws(() =>
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            offlineProfilePath,
            process.execPath,
            '-e',
            `require('node:fs').readFileSync(${JSON.stringify(providerCertificatePath)})`,
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        ),
      );
      assert.equal(
        await runAdaptiveDevelopmentSystemResolverSocketProbe({
          workingDirectory: workspace,
          nodeExecutable: process.execPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath: networkProfilePath },
          deadlineEpochMs: Date.now() + 10_000,
        }),
        true,
      );
      await assert.rejects(
        runAdaptiveDevelopmentSystemResolverSocketProbe({
          workingDirectory: workspace,
          nodeExecutable: process.execPath,
          processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath: offlineProfilePath },
          deadlineEpochMs: Date.now() + 10_000,
        }),
        /cannot reach the macOS system resolver socket/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs local shell checks inside the assigned workspace and denies source, parent, and sibling reads', () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/tmp/lf0001-codex-sandbox-');
    const workspace = join(root, 'workspace');
    const controlDirectory = join(root, 'control');
    const siblingPath = `/private/tmp/lf0001-codex-sandbox-sibling-${process.pid}.txt`;
    const codexExecutable = realpathSync(execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim());
    const syntheticCodexHome = join(root, 'synthetic-codex-home');
    const syntheticAuthPath = join(syntheticCodexHome, 'auth.json');
    const sandboxProfilePath = join(controlDirectory, 'codex-container.sb');
    const postModelProfilePath = join(controlDirectory, 'post-model-container.sb');
    const nodeEntrypointPath = join(workspace, 'focused-entrypoint.test.cjs');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(controlDirectory, { recursive: true });
    mkdirSync(syntheticCodexHome);
    writeFileSync(join(workspace, 'package.json'), '{}\n');
    writeFileSync(
      nodeEntrypointPath,
      "const { it } = require('node:test'); it('loads through the real Node entrypoint', () => {});\n",
    );
    writeFileSync(syntheticAuthPath, 'synthetic-auth-sentinel\n');
    writeFileSync(siblingPath, 'denied\n');
    writeFileSync(
      sandboxProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable,
        nodeExecutable: process.execPath,
        codexStateDirectory: syntheticCodexHome,
        writable: true,
        allowNetwork: true,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
      }),
    );
    writeFileSync(
      postModelProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable,
        nodeExecutable: process.execPath,
        codexStateDirectory: syntheticCodexHome,
        writable: true,
        allowGitMetadataWrites: true,
        allowNetwork: false,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
      }),
    );
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['init', '--initial-branch=benchmark-run'], {
      cwd: workspace,
      stdio: 'ignore',
    });
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['add', 'package.json'], { cwd: workspace });
    writeFileSync(join(workspace, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
    const invoke = (script, target) => {
      const invocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        command: process.execPath,
        args: ['-e', script, target],
      });
      return execFileSync(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: { ...process.env, ...invocation.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    };
    const readScript = "require('node:fs').readFileSync(process.argv[1]);";
    const listScript = "require('node:fs').readdirSync(process.argv[1]);";
    const writeScript = "require('node:fs').writeFileSync(process.argv[1], 'escaped');";
    try {
      invoke(readScript, join(workspace, 'package.json'));
      const codexVersionInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        command: codexExecutable,
        args: ['--version'],
      });
      assert.match(
        execFileSync(codexVersionInvocation.command, codexVersionInvocation.args, {
          cwd: codexVersionInvocation.cwd,
          env: { ...process.env, ...codexVersionInvocation.env },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        /^codex-cli /,
      );
      const gitInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        command: '/Library/Developer/CommandLineTools/usr/bin/git',
        args: ['diff', '--check'],
      });
      execFileSync(gitInvocation.command, gitInvocation.args, {
        cwd: gitInvocation.cwd,
        env: { ...process.env, ...gitInvocation.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const nodeEntrypointInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        command: process.execPath,
        args: ['--test', '--test-isolation=none', nodeEntrypointPath],
      });
      assert.match(
        execFileSync(nodeEntrypointInvocation.command, nodeEntrypointInvocation.args, {
          cwd: nodeEntrypointInvocation.cwd,
          env: { ...process.env, ...nodeEntrypointInvocation.env },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        /pass 1/,
      );
      const benchmarkCommitInvocation =
        adaptiveDevelopmentBenchmarkRunner.buildAdaptiveDevelopmentBenchmarkCommitInvocation('runner', [
          '-m',
          'sandboxed candidate',
        ]);
      const gitCommitInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath },
        command: '/Library/Developer/CommandLineTools/usr/bin/git',
        args: [
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'core.fsmonitor=false',
          '-c',
          'commit.gpgSign=false',
          ...benchmarkCommitInvocation.args,
        ],
      });
      assert.throws(() =>
        execFileSync(gitCommitInvocation.command, gitCommitInvocation.args, {
          cwd: gitCommitInvocation.cwd,
          env: { ...process.env, ...gitCommitInvocation.env, ...benchmarkCommitInvocation.environment },
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
      const postModelGitCommitInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath: postModelProfilePath },
        command: '/Library/Developer/CommandLineTools/usr/bin/git',
        args: gitCommitInvocation.args.slice(3),
      });
      execFileSync(postModelGitCommitInvocation.command, postModelGitCommitInvocation.args, {
        cwd: postModelGitCommitInvocation.cwd,
        env: { ...process.env, ...postModelGitCommitInvocation.env, ...benchmarkCommitInvocation.environment },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const postModelNodeWriteInvocation = buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: workspace,
        nodeExecutable: process.execPath,
        processContainer: { sandboxExecutable: '/usr/bin/sandbox-exec', sandboxProfilePath: postModelProfilePath },
        command: process.execPath,
        args: [
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], '#!/bin/sh\\nexit 0\\n', {mode:0o755});",
          join(workspace, '.git', 'hooks', 'pre-commit'),
        ],
      });
      assert.throws(() =>
        execFileSync(postModelNodeWriteInvocation.command, postModelNodeWriteInvocation.args, {
          cwd: postModelNodeWriteInvocation.cwd,
          env: { ...process.env, ...postModelNodeWriteInvocation.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
      assert.equal(existsSync(join(workspace, '.git', 'index.lock')), false);
      assert.equal(
        execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['log', '-1', '--format=%s'], {
          cwd: workspace,
          encoding: 'utf8',
        }).trim(),
        'sandboxed candidate',
      );
      assert.throws(() => invoke(writeScript, join(workspace, '.git', 'config')));
      assert.throws(() => invoke(writeScript, siblingPath));
      assert.throws(() => invoke(readScript, syntheticAuthPath));
      assert.throws(() =>
        invoke(
          "require('node:fs').writeFileSync(process.argv[1], '#!/bin/sh\\nexit 0\\n', {mode:0o755});",
          join(workspace, '.git', 'hooks', 'pre-commit'),
        ),
      );
      assert.throws(() => invoke(readScript, resolve('package.json')));
      assert.throws(() => invoke(listScript, dirname(workspace)));
      assert.throws(() => invoke(readScript, siblingPath));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(siblingPath, { force: true });
    }
  });

  it('fails closed when Codex completion omits trustworthy usage', () => {
    assert.deepEqual(parseAdaptiveDevelopmentCodexTelemetry(JSON.stringify({ type: 'turn.completed' })), {
      childThreadIds: [],
      collaborationToolCalls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      failedToolCalls: 0,
      behavioralFailedToolCalls: 0,
      infrastructureFailedToolCalls: 0,
      completed: true,
      usageObserved: false,
    });
  });

  it('does not inherit host environment for isolated candidate processes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-isolated-environment-'));
    const hostSentinel = 'LF0001_HOST_ENVIRONMENT_SENTINEL';
    const phaseSentinel = 'LF0001_PHASE_ENVIRONMENT_SENTINEL';
    const previousHostSentinel = process.env[hostSentinel];
    process.env[hostSentinel] = 'host-secret-shape';
    try {
      const result = await runAdaptiveDevelopmentProcess(
        {
          command: process.execPath,
          args: [
            '-e',
            `process.stdout.write(JSON.stringify({host:process.env.${hostSentinel}??null,phase:process.env.${phaseSentinel}??null}))`,
          ],
          cwd: root,
          prompt: '',
          environmentPolicy: 'isolated',
          env: { [phaseSentinel]: 'phase-only' },
        },
        Date.now() + 5_000,
      );
      assert.equal(result.timedOut, false);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '{"host":null,"phase":"phase-only"}');
    } finally {
      if (previousHostSentinel === undefined) delete process.env[hostSentinel];
      else process.env[hostSentinel] = previousHostSentinel;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('can omit CI for provider diagnostics without widening the isolated environment', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-isolated-doctor-environment-'));
    try {
      const result = await runAdaptiveDevelopmentProcess(
        {
          command: process.execPath,
          args: [
            '-e',
            'process.stdout.write(JSON.stringify({ci:process.env.CI??null,noColor:process.env.NO_COLOR??null}))',
          ],
          cwd: root,
          prompt: '',
          environmentPolicy: 'isolated',
          continuousIntegrationEnvironment: 'omitted',
        },
        Date.now() + 5_000,
      );
      assert.equal(result.timedOut, false);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '{"ci":null,"noColor":"1"}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when a process invocation omits its environment policy', async () => {
    await assert.rejects(
      runAdaptiveDevelopmentProcess(
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: process.cwd(), prompt: '' },
        Date.now() + 5_000,
      ),
      /explicit environment policy/,
    );
  });

  it('kills the active process group when an offline resource guard fails', async () => {
    let checks = 0;
    const result = await runAdaptiveDevelopmentProcess(
      {
        command: process.execPath,
        args: ['--eval', 'setInterval(()=>{}, 1000)'],
        cwd: invocationWorkspace,
        prompt: '',
        environmentPolicy: 'isolated',
        resourceGuard: {
          intervalMs: 10,
          check: () => {
            checks += 1;
            throw new Error('synthetic offline storage budget exceeded');
          },
        },
      },
      Date.now() + 5_000,
    );
    assert.ok(checks >= 1);
    assert.equal(result.resourceGuardFailure, 'synthetic offline storage budget exceeded');
    assert.equal(result.timedOut, false);
    assert.ok(result.elapsedMs < 5_000);
  });

  it('kills a real growing child when the convergence storage footprint exceeds its hard cap', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-growing-storage-'));
    const marker = join(root, 'survived.txt');
    try {
      const guard = buildAdaptiveDevelopmentDirectoryStorageGuard({
        label: 'convergence canary',
        storagePath: root,
        footprintPath: root,
        intervalMs: 10,
        minimumFreeBytes: 0,
        maximumFootprintBytes: 128 * 1024,
      });
      const childScript = [
        "const { appendFileSync, writeFileSync } = require('node:fs');",
        `const path = ${JSON.stringify(join(root, 'growing.bin'))};`,
        `const marker = ${JSON.stringify(marker)};`,
        "const chunk = Buffer.alloc(64 * 1024, 'x');",
        'setInterval(() => appendFileSync(path, chunk), 2);',
        "setTimeout(() => writeFileSync(marker, 'survived'), 700);",
      ].join('\n');
      const result = await runAdaptiveDevelopmentProcess(
        {
          command: process.execPath,
          args: ['--eval', childScript],
          cwd: root,
          prompt: '',
          environmentPolicy: 'isolated',
          resourceGuard: guard,
        },
        Date.now() + 5_000,
      );
      assert.match(result.resourceGuardFailure ?? '', /convergence canary footprint exceeded/);
      assert.equal(result.timedOut, false);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      assert.equal(existsSync(marker), false, 'the killed process group must not write after the guard trips');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const hostSignal of ['SIGINT', 'SIGTERM']) {
    it(`kills the detached process group and cleans samples when the runner host receives ${hostSignal}`, async () => {
      const root = mkdtempSync(join(tmpdir(), `lf0001-host-${hostSignal.toLowerCase()}-`));
      const ready = join(root, 'child-ready.txt');
      const survivor = join(root, 'detached-child-survived.txt');
      const samplesRoot = join(root, 'samples');
      const runnerModuleUrl = pathToFileURL(
        join(
          benchmarkRepositoryRoot,
          'packages/api/dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js',
        ),
      ).href;
      const detachedChild = [
        "const { writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(ready)}, 'ready');`,
        `setTimeout(() => writeFileSync(${JSON.stringify(survivor)}, 'late'), 300);`,
        'setTimeout(() => process.exit(0), 700);',
      ].join('');
      const host = [
        `import { installAdaptiveDevelopmentProcessSignalHandlers, runAdaptiveDevelopmentProcess } from ${JSON.stringify(runnerModuleUrl)};`,
        "import { mkdirSync, rmSync } from 'node:fs';",
        `const samplesRoot = ${JSON.stringify(samplesRoot)};`,
        'mkdirSync(samplesRoot, { recursive: true });',
        'const removeSignalHandlers = installAdaptiveDevelopmentProcessSignalHandlers();',
        'async function main() {',
        '  try {',
        '    await runAdaptiveDevelopmentProcess({',
        '      command: process.execPath,',
        `      args: ['-e', ${JSON.stringify(detachedChild)}],`,
        `      cwd: ${JSON.stringify(root)},`,
        "      prompt: '',",
        "      environmentPolicy: 'isolated',",
        '    }, Date.now() + 10_000);',
        '  } finally {',
        '    rmSync(samplesRoot, { recursive: true, force: true });',
        '    removeSignalHandlers();',
        '  }',
        '}',
        'main().catch(() => { process.exitCode = 1; });',
      ].join('\n');
      const runnerHost = spawn(process.execPath, ['--input-type=module', '--eval', host], {
        cwd: benchmarkRepositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      runnerHost.stdout.on('data', (chunk) => stdout.push(chunk));
      runnerHost.stderr.on('data', (chunk) => stderr.push(chunk));
      try {
        await waitForPath(ready);
        assert.equal(runnerHost.kill(hostSignal), true);
        const closed = await waitForChildClose(runnerHost);
        assert.notEqual(
          closed.exitCode,
          0,
          Buffer.concat(stderr).toString('utf8') || Buffer.concat(stdout).toString('utf8'),
        );
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
        assert.equal(existsSync(survivor), false);
        assert.equal(existsSync(samplesRoot), false);
      } finally {
        if (runnerHost.exitCode === null && runnerHost.signalCode === null) runnerHost.kill('SIGKILL');
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('converges a detached process and stable samples after SIGKILL and a default admission restart', async () => {
    if (process.platform === 'win32') return;
    const root = mkdtempSync(join(tmpdir(), 'lf0001-default-restart-'));
    const repositoryRoot = join(root, 'repository');
    mkdirSync(repositoryRoot, { recursive: true });
    const manifestDirectory = join(repositoryRoot, 'docs/harness-feedback/benchmarks/adaptive-development-v1');
    const stageId = 's1-long-horizon-directional';
    const activeDirectory = adaptiveDevelopmentStageAdmissionActiveDirectory(repositoryRoot, stageId);
    const samplesRoot = join(activeDirectory, 'samples');
    const staleSample = join(samplesRoot, 'stale-sample.txt');
    const ready = join(root, 'stale-child-ready.txt');
    const survivor = join(root, 'detached-child-survived.txt');
    const binDirectory = join(root, 'bin');
    const fakeGit = join(binDirectory, 'git');
    mkdirSync(manifestDirectory, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(
      join(manifestDirectory, 'manifest.json'),
      readFileSync(
        join(benchmarkRepositoryRoot, 'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json'),
      ),
    );
    writeFileSync(
      fakeGit,
      [
        `#!${process.execPath}`,
        "const { mkdirSync, writeFileSync } = require('node:fs');",
        'const command = process.argv[2];',
        "if (command === 'status') {",
        "  if (process.env.LF0001_RECOVERY_TEST_PHASE === 'restart') process.stdout.write(' M synthetic-dirty\\n');",
        '  process.exit(0);',
        '}',
        "if (command === 'rev-parse') {",
        `  mkdirSync(${JSON.stringify(samplesRoot)}, { recursive: true });`,
        `  writeFileSync(${JSON.stringify(staleSample)}, 'stale');`,
        `  writeFileSync(${JSON.stringify(ready)}, 'ready');`,
        `  setTimeout(() => writeFileSync(${JSON.stringify(survivor)}, 'late'), 500);`,
        '  setTimeout(() => process.exit(0), 900);',
        '  return;',
        '}',
        'process.exit(0);',
      ].join('\n'),
    );
    chmodSync(fakeGit, 0o755);
    const args = [benchmarkRunnerScript, '--admit-stage', '--repository-root', repositoryRoot, '--stage-id', stageId];
    const environment = { ...process.env, PATH: `${binDirectory}:${process.env.PATH ?? ''}` };
    const firstHost = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: { ...environment, LF0001_RECOVERY_TEST_PHASE: 'crash' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let restartHost;
    try {
      await waitForPath(ready);
      assert.equal(firstHost.kill('SIGKILL'), true);
      const firstClosed = await waitForChildClose(firstHost);
      assert.equal(firstClosed.signal, 'SIGKILL');
      assert.equal(existsSync(staleSample), true);

      restartHost = spawn(process.execPath, args, {
        cwd: repositoryRoot,
        env: { ...environment, LF0001_RECOVERY_TEST_PHASE: 'restart' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const restartClosed = await waitForChildClose(restartHost);
      assert.notEqual(restartClosed.exitCode, 0);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      assert.equal(existsSync(survivor), false);
      assert.equal(existsSync(samplesRoot), false);
      assert.equal(existsSync(join(activeDirectory, 'active-run.json')), false);
    } finally {
      if (firstHost.exitCode === null && firstHost.signalCode === null) firstHost.kill('SIGKILL');
      if (restartHost && restartHost.exitCode === null && restartHost.signalCode === null) restartHost.kill('SIGKILL');
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows exactly one host to take over the same dead admission record', async () => {
    if (process.platform === 'win32') return;
    const root = mkdtempSync(join(tmpdir(), 'lf0001-concurrent-takeover-'));
    const repositoryRoot = join(root, 'repository');
    const stageId = 's1-long-horizon-directional';
    mkdirSync(repositoryRoot, { recursive: true });
    const activeDirectory = adaptiveDevelopmentStageAdmissionActiveDirectory(repositoryRoot, stageId);
    const statePath = join(activeDirectory, 'active-run.json');
    const samplesRoot = join(activeDirectory, 'samples');
    const winnerBeforeUnlink = join(root, 'winner-before-unlink');
    const loserBeforeUnlink = join(root, 'loser-before-unlink');
    const winnerInstalled = join(root, 'winner-installed');
    const stopHosts = join(root, 'stop-hosts');
    const winnerStatus = join(root, 'winner-status.json');
    const loserStatus = join(root, 'loser-status.json');
    mkdirSync(samplesRoot, { recursive: true });
    writeFileSync(join(samplesRoot, 'stale-sample.txt'), 'stale');
    writeFileSync(
      statePath,
      `${JSON.stringify(
        {
          schemaVersion: 'lf-0001.stage-admission-active-run.v1',
          repositoryRoot: realpathSync(repositoryRoot),
          stageId,
          ownerPid: 2_147_483_647,
          runToken: '00000000-0000-4000-8000-000000000001',
          processGroupIds: [],
        },
        null,
        2,
      )}\n`,
    );

    const runnerModuleUrl = pathToFileURL(
      join(
        benchmarkRepositoryRoot,
        'packages/api/dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js',
      ),
    ).href;
    const host = [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      `const statePath = ${JSON.stringify(statePath)};`,
      `const samplesRoot = ${JSON.stringify(samplesRoot)};`,
      `const winnerBeforeUnlink = ${JSON.stringify(winnerBeforeUnlink)};`,
      `const loserBeforeUnlink = ${JSON.stringify(loserBeforeUnlink)};`,
      `const winnerInstalled = ${JSON.stringify(winnerInstalled)};`,
      `const stopHosts = ${JSON.stringify(stopHosts)};`,
      `const winnerStatus = ${JSON.stringify(winnerStatus)};`,
      `const loserStatus = ${JSON.stringify(loserStatus)};`,
      `const repositoryRoot = ${JSON.stringify(repositoryRoot)};`,
      `const stageId = ${JSON.stringify(stageId)};`,
      `const runnerModuleUrl = ${JSON.stringify(runnerModuleUrl)};`,
      'const role = process.env.LF0001_TAKEOVER_ROLE;',
      'const sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);',
      'const waitForPathSync = (path, timeoutMs) => {',
      '  const deadline = Date.now() + timeoutMs;',
      '  while (!fs.existsSync(path) && Date.now() < deadline) sleep(10);',
      '  return fs.existsSync(path);',
      '};',
      'const originalUnlinkSync = fs.unlinkSync;',
      'fs.unlinkSync = (path, ...args) => {',
      '  if (path === statePath) {',
      "    const beforePath = role === 'winner' ? winnerBeforeUnlink : loserBeforeUnlink;",
      '    fs.writeFileSync(beforePath, String(process.pid));',
      "    if (role === 'winner') waitForPathSync(loserBeforeUnlink, 500);",
      "    else if (!waitForPathSync(winnerInstalled, 2_500)) throw new Error('timed out waiting for winner install');",
      '  }',
      '  return originalUnlinkSync(path, ...args);',
      '};',
      'syncBuiltinESMExports();',
      'const { installAdaptiveDevelopmentStageAdmissionProcessRecovery } = await import(runnerModuleUrl);',
      "const statusPath = role === 'winner' ? winnerStatus : loserStatus;",
      'try {',
      '  const release = await installAdaptiveDevelopmentStageAdmissionProcessRecovery({ repositoryRoot, stageId });',
      '  fs.mkdirSync(samplesRoot, { recursive: true });',
      "  const sampleMarker = samplesRoot + '/host-' + process.pid + '.txt';",
      "  fs.writeFileSync(sampleMarker, 'live');",
      "  if (role === 'winner') fs.writeFileSync(winnerInstalled, String(process.pid));",
      '  fs.writeFileSync(statusPath, JSON.stringify({ success: true, pid: process.pid, sampleMarker }));',
      '  while (!fs.existsSync(stopHosts)) await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));',
      '  await release();',
      '} catch (error) {',
      '  fs.writeFileSync(statusPath, JSON.stringify({',
      '    success: false,',
      '    pid: process.pid,',
      '    error: error instanceof Error ? error.message : String(error),',
      '  }));',
      '}',
    ].join('\n');
    const launchHost = (role) =>
      spawn(process.execPath, ['--input-type=module', '--eval', host], {
        cwd: benchmarkRepositoryRoot,
        env: { ...process.env, LF0001_TAKEOVER_ROLE: role },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    const winnerHost = launchHost('winner');
    const winnerClose = waitForChildClose(winnerHost, 10_000);
    let loserHost;
    let loserClose;
    try {
      await waitForPath(winnerBeforeUnlink);
      loserHost = launchHost('loser');
      loserClose = waitForChildClose(loserHost, 10_000);
      await Promise.all([waitForPath(winnerStatus), waitForPath(loserStatus)]);
      const statuses = [JSON.parse(readFileSync(winnerStatus, 'utf8')), JSON.parse(readFileSync(loserStatus, 'utf8'))];
      const installed = statuses.filter((status) => status.success);
      const rejected = statuses.filter((status) => !status.success);
      assert.equal(installed.length, 1, JSON.stringify(statuses));
      assert.equal(rejected.length, 1, JSON.stringify(statuses));
      assert.match(rejected[0].error, /takeover is already in progress/);
      const persisted = JSON.parse(readFileSync(statePath, 'utf8'));
      assert.equal(persisted.ownerPid, installed[0].pid);
      assert.equal(existsSync(installed[0].sampleMarker), true);
      for (const rejectedStatus of rejected) {
        assert.equal(existsSync(join(samplesRoot, `host-${rejectedStatus.pid}.txt`)), false);
      }
    } finally {
      writeFileSync(stopHosts, 'stop');
      await Promise.allSettled([winnerClose, ...(loserClose ? [loserClose] : [])]);
      if (winnerHost.exitCode === null && winnerHost.signalCode === null) winnerHost.kill('SIGKILL');
      if (loserHost && loserHost.exitCode === null && loserHost.signalCode === null) loserHost.kill('SIGKILL');
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('releases the takeover lease when the recovery host is SIGKILLed before terminating the stale group', async () => {
    if (process.platform === 'win32') return;
    const root = mkdtempSync(join(tmpdir(), 'lf0001-takeover-host-crash-'));
    const repositoryRoot = join(root, 'repository');
    const stageId = 's1-long-horizon-directional';
    mkdirSync(repositoryRoot, { recursive: true });
    const activeDirectory = adaptiveDevelopmentStageAdmissionActiveDirectory(repositoryRoot, stageId);
    const statePath = join(activeDirectory, 'active-run.json');
    const takeoverLeasePath = join(activeDirectory, 'takeover-lease.json');
    const samplesRoot = join(activeDirectory, 'samples');
    const staleSample = join(samplesRoot, 'stale-sample.txt');
    const staleGroupReady = join(root, 'stale-group-ready.txt');
    const staleGroupSurvived = join(root, 'stale-group-survived.txt');
    const recoveryBeforeKill = join(root, 'recovery-before-kill.txt');
    const restartStatus = join(root, 'restart-status.json');
    const runToken = '00000000-0000-4000-8000-000000000002';
    mkdirSync(samplesRoot, { recursive: true });
    writeFileSync(staleSample, 'stale');
    const staleGroupScript = [
      "const { writeFileSync } = require('node:fs');",
      `writeFileSync(${JSON.stringify(staleGroupReady)}, 'ready');`,
      `setTimeout(() => writeFileSync(${JSON.stringify(staleGroupSurvived)}, 'late'), 1_500);`,
      'setTimeout(() => process.exit(0), 4_000);',
    ].join('');
    const staleGroup = spawn(process.execPath, ['--eval', staleGroupScript, runToken], {
      cwd: repositoryRoot,
      detached: true,
      stdio: 'ignore',
    });
    staleGroup.unref();
    assert.ok(staleGroup.pid);
    writeFileSync(
      statePath,
      `${JSON.stringify(
        {
          schemaVersion: 'lf-0001.stage-admission-active-run.v1',
          repositoryRoot: realpathSync(repositoryRoot),
          stageId,
          ownerPid: 2_147_483_647,
          runToken,
          processGroupIds: [staleGroup.pid],
        },
        null,
        2,
      )}\n`,
    );
    const runnerModuleUrl = pathToFileURL(
      join(
        benchmarkRepositoryRoot,
        'packages/api/dist/infrastructure/harness-eval/adaptive-development/adaptive-development-benchmark-runner.js',
      ),
    ).href;
    const recoveryHostScript = [
      "import { writeFileSync } from 'node:fs';",
      `const staleGroupPid = ${staleGroup.pid};`,
      `const recoveryBeforeKill = ${JSON.stringify(recoveryBeforeKill)};`,
      'const originalKill = process.kill.bind(process);',
      'process.kill = (pid, signal) => {',
      "  if (pid === -staleGroupPid && signal === 'SIGKILL') {",
      "    writeFileSync(recoveryBeforeKill, 'ready');",
      '    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000);',
      '  }',
      '  return originalKill(pid, signal);',
      '};',
      `const { installAdaptiveDevelopmentStageAdmissionProcessRecovery } = await import(${JSON.stringify(runnerModuleUrl)});`,
      `await installAdaptiveDevelopmentStageAdmissionProcessRecovery({ repositoryRoot: ${JSON.stringify(repositoryRoot)}, stageId: ${JSON.stringify(stageId)} });`,
    ].join('\n');
    const recoveryHost = spawn(process.execPath, ['--input-type=module', '--eval', recoveryHostScript], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let restartHost;
    try {
      await Promise.all([waitForPath(staleGroupReady), waitForPath(recoveryBeforeKill)]);
      assert.equal(existsSync(takeoverLeasePath), true);
      assert.equal(recoveryHost.kill('SIGKILL'), true);
      const recoveryClosed = await waitForChildClose(recoveryHost);
      assert.equal(recoveryClosed.signal, 'SIGKILL');
      await waitForPathRemoval(takeoverLeasePath, 2_000);
      assert.equal(existsSync(takeoverLeasePath), false, 'takeover lease survived its recovery host');

      const restartHostScript = [
        "import { writeFileSync } from 'node:fs';",
        `const { installAdaptiveDevelopmentStageAdmissionProcessRecovery } = await import(${JSON.stringify(runnerModuleUrl)});`,
        'try {',
        `  const release = await installAdaptiveDevelopmentStageAdmissionProcessRecovery({ repositoryRoot: ${JSON.stringify(repositoryRoot)}, stageId: ${JSON.stringify(stageId)} });`,
        '  await release();',
        `  writeFileSync(${JSON.stringify(restartStatus)}, JSON.stringify({ success: true }));`,
        '} catch (error) {',
        `  writeFileSync(${JSON.stringify(restartStatus)}, JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }));`,
        '}',
      ].join('\n');
      restartHost = spawn(process.execPath, ['--input-type=module', '--eval', restartHostScript], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const restartClosed = await waitForChildClose(restartHost);
      assert.equal(restartClosed.exitCode, 0);
      await waitForPath(restartStatus);
      assert.deepEqual(JSON.parse(readFileSync(restartStatus, 'utf8')), { success: true });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_700));
      assert.equal(existsSync(staleGroupSurvived), false);
      assert.equal(existsSync(staleSample), false);
      assert.equal(existsSync(statePath), false);
      assert.equal(existsSync(takeoverLeasePath), false);
    } finally {
      killChildIfRunning(recoveryHost);
      killChildIfRunning(restartHost);
      const cleanupError = killDetachedProcessGroupIfRunning(staleGroup.pid ?? 0);
      rmSync(root, { recursive: true, force: true });
      assert.equal(cleanupError, undefined);
    }
  });

  it('measures sample storage from logical or allocated bytes inside the sample tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-sample-storage-'));
    try {
      const before = measureAdaptiveDevelopmentDirectoryFootprintBytes(root);
      writeFileSync(join(root, 'sample.bin'), Buffer.alloc(1024 * 1024, 1));
      const after = measureAdaptiveDevelopmentDirectoryFootprintBytes(root);
      assert.ok(after >= before + 1024 * 1024);
      assert.equal(measureAdaptiveDevelopmentDirectoryFootprintBytes(join(root, 'missing')), 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps TERM-to-KILL escalation alive after the direct child exits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-process-tree-'));
    const marker = join(root, 'grandchild-survived.txt');
    const grandchild = [
      "process.on('SIGTERM', () => {});",
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'late'), 2600);`,
      'setInterval(() => {}, 1000);',
    ].join('');
    const parent = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });`,
      "process.on('SIGTERM', () => process.exit(0));",
      'setInterval(() => {}, 1000);',
    ].join('');
    try {
      const result = await runAdaptiveDevelopmentProcess(
        {
          command: process.execPath,
          args: ['-e', parent],
          cwd: root,
          prompt: '',
          environmentPolicy: 'isolated',
        },
        Date.now() + 100,
      );
      assert.equal(result.timedOut, true);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reaps the process group after a direct child exits normally', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-normal-process-tree-'));
    const marker = join(root, 'grandchild-survived.txt');
    const grandchild = [
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'late'), 400);`,
      'setTimeout(() => process.exit(0), 600);',
    ].join('');
    const parent = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }).unref();`,
    ].join('');
    try {
      const result = await runAdaptiveDevelopmentProcess(
        {
          command: process.execPath,
          args: ['-e', parent],
          cwd: root,
          prompt: '',
          environmentPolicy: 'isolated',
        },
        Date.now() + 5_000,
      );
      assert.equal(result.timedOut, false);
      assert.equal(result.exitCode, 0);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes grader, outcome, and benchmark-control data before the anonymous Git snapshot is created', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-snapshot-sanitize-'));
    const replayManifest = join(root, 'packages/api/test/harness-eval/fixtures/adaptive-sop-replay-manifest.json');
    const benchmarkEvidence = join(root, 'docs/harness-feedback/benchmarks/private-outcome.json');
    const taskFile = join(root, 'packages/api/test/telegram-html-formatter.test.js');
    mkdirSync(dirname(replayManifest), { recursive: true });
    mkdirSync(dirname(benchmarkEvidence), { recursive: true });
    mkdirSync(dirname(taskFile), { recursive: true });
    writeFileSync(replayManifest, JSON.stringify({ graderOnly: { outcomeCommit: 'f'.repeat(40) } }));
    writeFileSync(benchmarkEvidence, JSON.stringify({ goldPatch: 'secret' }));
    writeFileSync(taskFile, 'safe task test');
    try {
      sanitizeAdaptiveDevelopmentRuntimeSnapshot(root);
      assert.equal(existsSync(replayManifest), false);
      assert.equal(existsSync(benchmarkEvidence), false);
      assert.equal(readFileSync(taskFile, 'utf8'), 'safe task test');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps runner-provided Judge context immutable while the candidate checkout remains writable', () => {
    if (process.platform !== 'darwin') return;
    const root = mkdtempSync('/private/var/tmp/lf0001-judge-context-');
    const workspace = join(root, 'workspace');
    const judgeContext = join(workspace, '.adaptive-development-judge');
    const checkpoint = join(judgeContext, 'episode-checkpoint.json');
    const candidate = join(workspace, 'candidate.txt');
    const controlDirectory = join(root, 'judge-control');
    const codexHome = join(controlDirectory, 'codex-home');
    const sandboxProfilePath = join(controlDirectory, 'judge.sb');
    mkdirSync(judgeContext, { recursive: true });
    mkdirSync(join(controlDirectory, 'tool-tmp'), { recursive: true });
    mkdirSync(join(codexHome, 'tmp'), { recursive: true });
    writeFileSync(checkpoint, '{"reviewState":"pending"}\n');
    writeFileSync(candidate, 'candidate-before\n');
    const modifyRestoreScript = [
      "const fs=require('node:fs');",
      'const path=process.argv[1];',
      "const original=fs.readFileSync(path,'utf8');",
      'try{fs.writeFileSync(path,\'{\\"reviewState\\":\\"reviewed\\",\\"forged\\":true}\\n\')}finally{try{fs.writeFileSync(path,original)}catch{}}',
    ].join('');
    writeFileSync(
      sandboxProfilePath,
      buildAdaptiveDevelopmentCodexProcessContainerProfile({
        workingDirectory: workspace,
        controlDirectory,
        codexExecutable: process.execPath,
        nodeExecutable: process.execPath,
        codexStateDirectory: codexHome,
        writable: true,
        allowGitMetadataWrites: false,
        allowNetwork: false,
        allowNestedSandbox: false,
        allowChildProcesses: true,
        allowInterprocessCommunication: true,
        writeProtectedPaths: [judgeContext],
      }),
    );
    try {
      assert.throws(() =>
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            sandboxProfilePath,
            process.execPath,
            '-e',
            [
              "const {spawnSync}=require('node:child_process');",
              "const result=spawnSync(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'pipe'});",
              'process.exit(result.status??99);',
            ].join(''),
            modifyRestoreScript,
            checkpoint,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
      assert.equal(readFileSync(checkpoint, 'utf8'), '{"reviewState":"pending"}\n');
      assert.throws(() =>
        execFileSync(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            sandboxProfilePath,
            process.execPath,
            '-e',
            "const path=require('node:path');require('node:fs').renameSync(path.dirname(process.argv[1]), path.dirname(process.argv[1])+'-saved')",
            checkpoint,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
      execFileSync(
        '/usr/bin/sandbox-exec',
        [
          '-f',
          sandboxProfilePath,
          process.execPath,
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], 'candidate-after\\n')",
          candidate,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      assert.equal(readFileSync(candidate, 'utf8'), 'candidate-after\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a complete writable candidate checkout while removing development-review answers and identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-development-review-'));
    const hiddenSource = 'packages/api/test/harness-eval/fixtures/hidden-remap.oracle.ts';
    const retainedSource = 'packages/api/src/routes/threads.ts';
    const retainedTest = 'packages/api/test/threads-endpoint.test.js';
    const episodeCheckpoint = '.adaptive-development-judge/episode-checkpoint.json';
    const agentEpisode = '.adaptive-development-judge/agent-episode.json';
    const privatePaths = [
      '.git',
      '.claude/skills/adaptive-development-sop/SKILL.md',
      'cat-cafe-skills/adaptive-development-sop/SKILL.md',
      'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
      hiddenSource,
    ];
    try {
      for (const path of [...privatePaths, retainedSource, retainedTest, episodeCheckpoint, agentEpisode]) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${path}\n`);
      }
      writeFileSync(join(root, episodeCheckpoint), '{\n  "reviewState": "pending"\n}\n');
      writeFileSync(
        join(root, retainedSource),
        `${Array.from({ length: 500 }, (_, index) => `candidate source line ${index + 1}`).join('\n')}\n`,
      );

      const removed = sanitizeAdaptiveDevelopmentReviewWorkspace(
        root,
        [hiddenSource],
        ['cat-cafe-skills/adaptive-development-sop/SKILL.md'],
      );
      const visibility = buildAdaptiveDevelopmentReviewVisibilityManifest({
        root,
        candidateSha: 'a'.repeat(40),
        candidatePaths: [...privatePaths, retainedSource, retainedTest],
        runnerProvidedPaths: [episodeCheckpoint, agentEpisode],
      });
      const visibilityRoots = { candidateRoot: root, runnerProvidedRoot: root };

      assert.deepEqual(removed, [
        '.git',
        '.claude/skills',
        'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
        'cat-cafe-skills/adaptive-development-sop/SKILL.md',
        hiddenSource,
      ]);
      assert.equal(existsSync(join(root, retainedSource)), true);
      assert.equal(existsSync(join(root, retainedTest)), true);
      assert.equal(existsSync(join(root, hiddenSource)), false);
      assert.equal(existsSync(join(root, '.git')), false);
      assert.equal(existsSync(join(root, '.claude', 'skills')), false);
      assert.equal(existsSync(join(root, 'cat-cafe-skills', 'adaptive-development-sop', 'SKILL.md')), false);
      assert.equal(
        existsSync(join(root, 'docs', 'harness-feedback', 'benchmarks', 'adaptive-development-v1', 'manifest.json')),
        false,
      );
      assert.deepEqual(visibility.paths, [retainedSource, retainedTest]);
      assert.equal(visibility.candidateSha, 'a'.repeat(40));
      assert.match(visibility.pathsSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(
        visibility.candidateArtifacts.map((artifact) => artifact.path),
        visibility.paths,
      );
      assert.match(visibility.candidateArtifactsSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(
        visibility.runnerProvidedArtifacts.map((artifact) => artifact.path),
        [agentEpisode, episodeCheckpoint],
      );
      assert.match(visibility.runnerProvidedArtifactsSha256, /^[a-f0-9]{64}$/);
      assert.equal(visibility.paths.includes(hiddenSource), false);
      assert.equal(visibility.paths.includes('cat-cafe-skills/adaptive-development-sop/SKILL.md'), false);
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:1`, visibilityRoots),
        true,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:454-458`, visibilityRoots),
        true,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:454:2-458:9`, visibilityRoots),
        true,
      );
      assert.equal(adaptiveDevelopmentReviewLocationIsVisible(visibility, `${hiddenSource}:1`, visibilityRoots), false);
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${hiddenSource}:454-458`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:454-`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(
          visibility,
          'cat-cafe-skills/adaptive-development-sop/SKILL.md:1',
          visibilityRoots,
        ),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${episodeCheckpoint}:3`, visibilityRoots),
        true,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${episodeCheckpoint}:999999`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${episodeCheckpoint}:3-2`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${episodeCheckpoint}:2:999`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${episodeCheckpoint}:2:10-2:2`, visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:999999`, visibilityRoots),
        false,
      );
      assert.doesNotThrow(() =>
        assertAdaptiveDevelopmentConvergenceJudgeEvidence({
          findings: [
            {
              severity: 'P2',
              summary: 'The episode deferred a required Formal Review.',
              evidence: {
                kind: 'static_proof',
                command: '',
                expected: '',
                actual: '',
                location: `${episodeCheckpoint}:3`,
                reasoning: 'The trusted checkpoint records reviewState=pending for a non-trivial candidate.',
              },
            },
          ],
          completedCommands: [],
          locationIsVisible: (location) =>
            adaptiveDevelopmentReviewLocationIsVisible(visibility, location, visibilityRoots),
        }),
      );
      assert.doesNotThrow(() => assertAdaptiveDevelopmentReviewVisibilityIntegrity(root, visibility));
      writeFileSync(join(root, 'reviewer-created-proof.txt'), 'not part of the immutable candidate\n');
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, 'reviewer-created-proof.txt:1', visibilityRoots),
        false,
      );
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `../${retainedSource}:1`, visibilityRoots),
        false,
      );
      const locationSchemaPattern = new RegExp(ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN);
      assert.equal(locationSchemaPattern.test(''), true);
      assert.equal(locationSchemaPattern.test(`${retainedSource}:454-458`), true);
      assert.equal(locationSchemaPattern.test(`${retainedSource}:454-`), false);
      assert.doesNotThrow(() =>
        assertAdaptiveDevelopmentConvergenceJudgeEvidence({
          findings: [
            {
              severity: 'P2',
              summary: 'The default-project filter regressed.',
              evidence: {
                kind: 'static_proof',
                command: '',
                expected: '',
                actual: '',
                location: `${retainedSource}:454-458`,
                reasoning: 'The default sentinel is resolved as a filesystem path.',
              },
            },
          ],
          completedCommands: [],
          locationIsVisible: (location) =>
            adaptiveDevelopmentReviewLocationIsVisible(visibility, location, visibilityRoots),
        }),
      );
      assert.throws(
        () =>
          adaptiveDevelopmentReviewLocationIsVisible(
            { ...visibility, paths: [...visibility.paths, 'reviewer-created-proof.txt'] },
            'reviewer-created-proof.txt:1',
            visibilityRoots,
          ),
        /visibility manifest is invalid/,
      );
      assert.throws(
        () => sanitizeAdaptiveDevelopmentReviewWorkspace(root, [], ['../outside-review-root']),
        /escapes root/,
      );
      writeFileSync(join(root, episodeCheckpoint), 'judge-mutated checkpoint\n');
      assert.throws(
        () => assertAdaptiveDevelopmentReviewVisibilityIntegrity(root, visibility),
        /runner-provided artifact changed/,
      );
      writeFileSync(join(root, retainedSource), 'review-only reproduction edit\n');
      assert.equal(readFileSync(join(root, retainedSource), 'utf8'), 'review-only reproduction edit\n');
      assert.equal(
        adaptiveDevelopmentReviewLocationIsVisible(visibility, `${retainedSource}:1`, visibilityRoots),
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses one canonical path order for mixed-case review visibility artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-review-visibility-order-'));
    const upperCasePath = '.claude/hooks/user-level/README.md';
    const lowerCasePath = '.claude/hooks/user-level/claude-settings.template.json';
    const runnerUpperCasePath = '.adaptive-development-judge/README.md';
    const runnerLowerCasePath = '.adaptive-development-judge/scope.json';
    try {
      for (const path of [lowerCasePath, upperCasePath, runnerLowerCasePath, runnerUpperCasePath]) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${path}\n`);
      }

      const visibility = buildAdaptiveDevelopmentReviewVisibilityManifest({
        root,
        candidateSha: 'a'.repeat(40),
        candidatePaths: [lowerCasePath, upperCasePath],
        runnerProvidedPaths: [runnerLowerCasePath, runnerUpperCasePath],
      });

      assert.deepEqual(visibility.paths, [upperCasePath, lowerCasePath]);
      assert.deepEqual(
        visibility.runnerProvidedArtifacts.map((artifact) => artifact.path),
        [runnerUpperCasePath, runnerLowerCasePath],
      );
      assert.doesNotThrow(() => assertAdaptiveDevelopmentReviewVisibilityIntegrity(root, visibility));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('materializes the exact candidate without copying ignored model-controlled oracle inputs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-oracle-snapshot-'));
    const source = join(root, 'model-workspace');
    const destination = join(root, 'oracle-sandbox', 'workspace');
    mkdirSync(join(source, 'dist'), { recursive: true });
    writeFileSync(join(source, '.gitignore'), 'dist/\n');
    writeFileSync(join(source, 'candidate.js'), 'export const candidate = true;\n');
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['init', '--initial-branch=benchmark-run'], {
      cwd: source,
      stdio: 'ignore',
    });
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['config', 'user.name', 'Benchmark Test'], {
      cwd: source,
    });
    execFileSync(
      '/Library/Developer/CommandLineTools/usr/bin/git',
      ['config', 'user.email', 'benchmark@test.invalid'],
      { cwd: source },
    );
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['add', '.'], { cwd: source });
    execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['commit', '-m', 'frozen candidate'], {
      cwd: source,
      stdio: 'ignore',
    });
    const finalSha = execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: source,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(source, 'dist', 'oracle-input.js'), 'model-controlled poison\n');
    try {
      assert.equal(
        execFileSync(
          '/Library/Developer/CommandLineTools/usr/bin/git',
          ['status', '--porcelain=v1', '--untracked-files=all'],
          { cwd: source, encoding: 'utf8' },
        ).trim(),
        '',
      );
      await materializeAdaptiveDevelopmentOracleSnapshot({
        gitExecutable: '/Library/Developer/CommandLineTools/usr/bin/git',
        sourceRepository: source,
        destination,
        finalSha,
        deadlineEpochMs: Date.now() + 30_000,
      });
      assert.equal(existsSync(join(source, 'dist', 'oracle-input.js')), true);
      assert.equal(existsSync(join(destination, 'dist', 'oracle-input.js')), false);
      assert.equal(
        execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['rev-parse', 'HEAD'], {
          cwd: destination,
          encoding: 'utf8',
        }).trim(),
        finalSha,
      );
      assert.equal(
        execFileSync('/Library/Developer/CommandLineTools/usr/bin/git', ['remote'], {
          cwd: destination,
          encoding: 'utf8',
        }).trim(),
        '',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('clones one prepared oracle candidate into independent writable phase views', async () => {
    if (process.platform !== 'darwin') return;
    const cloneOracleSnapshot = adaptiveDevelopmentBenchmarkRunner.cloneAdaptiveDevelopmentOracleSnapshot;
    assert.equal(typeof cloneOracleSnapshot, 'function');
    const root = mkdtempSync(join(tmpdir(), 'lf0001-oracle-clone-'));
    const prepared = join(root, 'prepared');
    const phaseA = join(root, 'phase-a');
    const phaseB = join(root, 'phase-b');
    mkdirSync(join(prepared, 'nested'), { recursive: true });
    writeFileSync(join(prepared, 'nested', 'value.txt'), 'prepared\n');
    try {
      await cloneOracleSnapshot({
        copyExecutable: '/bin/cp',
        source: prepared,
        destination: phaseA,
        deadlineEpochMs: Date.now() + 30_000,
      });
      await cloneOracleSnapshot({
        copyExecutable: '/bin/cp',
        source: prepared,
        destination: phaseB,
        deadlineEpochMs: Date.now() + 30_000,
      });
      writeFileSync(join(phaseA, 'nested', 'value.txt'), 'phase-a\n');
      assert.equal(readFileSync(join(prepared, 'nested', 'value.txt'), 'utf8'), 'prepared\n');
      assert.equal(readFileSync(join(phaseB, 'nested', 'value.txt'), 'utf8'), 'prepared\n');
      writeFileSync(join(prepared, 'nested', 'value.txt'), 'prepared-mutated\n');
      assert.equal(readFileSync(join(phaseA, 'nested', 'value.txt'), 'utf8'), 'phase-a\n');
      assert.equal(readFileSync(join(phaseB, 'nested', 'value.txt'), 'utf8'), 'prepared\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves operator approval from a durable user message and rejects invented references', async () => {
    const launchPlan = launchPlanFixture();
    const scopeSha256 = launchPlan.launchScopeSha256;
    const authority = buildAdaptiveDevelopmentOperatorApprovalAuthority({
      redisUrl: 'redis://localhost:6399',
      redisKeyPrefix: 'cat-cafe:',
      runtimeInstanceIdentitySha256: 'a'.repeat(64),
    });
    const content = buildAdaptiveDevelopmentOperatorApprovalDirective(scopeSha256, launchPlan.stageBudget, authority);
    assert.match(content, /token_policy=unbounded/);
    assert.doesNotMatch(content, /token_cap|token_reservation|token_reserve/);
    const timestamp = Date.parse('2026-08-03T10:00:00.000Z');
    const authorization = {
      kind: 'operator_approval',
      authorizedBy: 'co-creator',
      approvalRef: 'cat-cafe://message/message-real',
      approvalMessageSha256: fingerprintAdaptiveDevelopmentBenchmark(content),
      approvedLaunchScopeSha256: scopeSha256,
      approvedAt: new Date(timestamp).toISOString(),
    };
    const message = {
      id: 'message-real',
      threadId: authority.threadId,
      userId: 'default-user',
      catId: null,
      content,
      mentions: [],
      timestamp,
      deliveryStatus: 'delivered',
    };

    await verifyAdaptiveDevelopmentOperatorApproval({
      authorization,
      stageBudget: launchPlan.stageBudget,
      authority,
      resolver: { getById: async (id) => (id === message.id ? message : null) },
    });
    await assert.rejects(
      verifyAdaptiveDevelopmentOperatorApproval({
        authorization: { ...authorization, approvalRef: 'cat-cafe://message/completely-invented' },
        stageBudget: launchPlan.stageBudget,
        authority,
        resolver: { getById: async () => null },
      }),
      /durable operator approval message not found/,
    );
    await assert.rejects(
      verifyAdaptiveDevelopmentOperatorApproval({
        authorization,
        stageBudget: launchPlan.stageBudget,
        authority,
        resolver: { getById: async () => ({ ...message, userId: 'system' }) },
      }),
      /durable direct user message/,
    );
    await assert.rejects(
      verifyAdaptiveDevelopmentOperatorApproval({
        authorization,
        stageBudget: launchPlan.stageBudget,
        authority,
        resolver: { getById: async () => ({ ...message, content: 'approve something else' }) },
      }),
      /message hash mismatch/,
    );
    await assert.rejects(
      verifyAdaptiveDevelopmentOperatorApproval({
        authorization,
        stageBudget: launchPlan.stageBudget,
        authority,
        resolver: { getById: async () => ({ ...message, userId: 'unrelated-human' }) },
      }),
      /expected operator user/,
    );
    await assert.rejects(
      verifyAdaptiveDevelopmentOperatorApproval({
        authorization,
        stageBudget: launchPlan.stageBudget,
        authority,
        resolver: { getById: async () => ({ ...message, threadId: 'unrelated-thread' }) },
      }),
      /expected authority thread/,
    );
    assert.throws(
      () =>
        buildAdaptiveDevelopmentOperatorApprovalAuthority({
          redisUrl: 'redis://localhost:6380',
          redisKeyPrefix: 'cat-cafe:',
          runtimeInstanceIdentitySha256: 'a'.repeat(64),
        }),
      /trusted Cat Café MessageStore coordinates/,
    );
    assert.throws(
      () =>
        buildAdaptiveDevelopmentOperatorApprovalAuthority({
          redisUrl: 'redis://localhost:6399',
          redisKeyPrefix: 'other-runtime:',
          runtimeInstanceIdentitySha256: 'a'.repeat(64),
        }),
      /trusted Cat Café MessageStore coordinates/,
    );
    const forgedAuthority = { ...authority, operatorUserId: 'unrelated-human' };
    assert.throws(
      () => buildAdaptiveDevelopmentOperatorApprovalDirective(scopeSha256, launchPlan.stageBudget, forgedAuthority),
      /trusted operator authority/,
    );
  });

  it('rejects caller-overridden Redis coordinates before creating a launch scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-untrusted-message-store-test-'));
    const outputRoot = join(root, 'output');
    try {
      const invoke = (env) =>
        execFileSync(
          process.execPath,
          [
            benchmarkRunnerScript,
            '--prepare-canary',
            '--repository-root',
            benchmarkRepositoryRoot,
            '--output-root',
            outputRoot,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, ...env },
            encoding: 'utf8',
            stdio: 'pipe',
          },
        );
      assert.throws(
        () => invoke({ REDIS_URL: 'redis://localhost:6380', REDIS_KEY_PREFIX: 'cat-cafe:' }),
        /not using the reviewed Cat Café runtime configuration/,
      );
      assert.throws(
        () => invoke({ REDIS_URL: 'redis://localhost:6399', REDIS_KEY_PREFIX: 'other-runtime:' }),
        /not using the reviewed Cat Café runtime configuration/,
      );
      assert.equal(existsSync(outputRoot), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires the canary plan ledger identity and rejects caller-supplied receipt files', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-trusted-canary-ledger-test-'));
    const outputRoot = join(root, 'output');
    try {
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [
              benchmarkRunnerScript,
              '--prepare-launch',
              '--repository-root',
              benchmarkRepositoryRoot,
              '--output-root',
              outputRoot,
            ],
            { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
          ),
        /--prepare-launch requires --canary-plan/,
      );
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [
              benchmarkRunnerScript,
              '--prepare-launch',
              '--repository-root',
              benchmarkRepositoryRoot,
              '--canary-receipt',
              join(root, 'handwritten.json'),
            ],
            { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
          ),
        /unknown argument --canary-receipt/,
      );
      assert.equal(existsSync(outputRoot), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs complete live preflight before the durable execution claim or any attempt', () => {
    const live = sourceFunction('prepareLiveBenchmarkExecution', 'completeLiveBenchmarkExecution');
    const preflightIndex = live.indexOf('await runPreflight({');
    const claimIndex = live.indexOf('await claimAuthorizedBenchmarkExecution(');
    assert.notEqual(preflightIndex, -1);
    assert.notEqual(claimIndex, -1);
    assert.ok(preflightIndex < claimIndex);

    const command = sourceFunction('runBenchmarkExecutionCommand', 'claimAuthorizedBenchmarkExecution');
    const launchScopeWriteIndex = command.indexOf("writeJson(join(runRoot, 'launch-scope.json'), scope);");
    const livePreparationIndex = command.indexOf('await prepareLiveBenchmarkExecution({');
    assert.notEqual(launchScopeWriteIndex, -1);
    assert.ok(launchScopeWriteIndex < livePreparationIndex);
    assert.ok(livePreparationIndex < command.indexOf('await executeLaunchPlan({'));

    const processBoundary = sourceFunction('assertCodexProcessContainerBoundary', 'materializeRunWorktree');
    const localEnvironmentStart = processBoundary.indexOf(
      'const localToolEnvironment = buildAdaptiveDevelopmentLocalToolEnvironment({',
    );
    const localEnvironmentEnd = processBoundary.indexOf('  });', localEnvironmentStart);
    assert.notEqual(localEnvironmentStart, -1);
    assert.notEqual(localEnvironmentEnd, -1);
    assert.match(
      processBoundary.slice(localEnvironmentStart, localEnvironmentEnd),
      /processContainer: input\.processContainer/,
    );
  });

  it('keeps long-stage admission model-free, exact-commit-bound, and red/green repeatable', () => {
    const admissionStart = benchmarkRunnerSource.indexOf("type StageAdmissionCandidateKind = 'baseline'");
    const admissionEnd = benchmarkRunnerSource.indexOf('\nfunction executorPrompt(', admissionStart);
    assert.notEqual(admissionStart, -1);
    assert.notEqual(admissionEnd, -1);
    const admission = benchmarkRunnerSource.slice(admissionStart, admissionEnd);
    assert.match(admission, /await assertCleanTrackedTree\(args\.repositoryRoot, 'stage admission'\)/);
    assert.match(admission, /const admissionRepetitions = stage\.admissionRepetitions/);
    assert.match(admission, /candidateKind of \['baseline', 'gold_projection'\]/);
    assert.match(admission, /baselines\.every\(\(sample\) => sample\.oracle\?\.passed === false\)/);
    assert.match(admission, /gold\.every\(\(sample\) => sample\.oracle\?\.passed === true\)/);
    assert.match(admission, /baselineVectors\.size === 1/);
    assert.match(admission, /goldVectors\.size === 1/);
    assert.match(admission, /baselineTrees\.size === 1/);
    assert.match(admission, /goldTrees\.size === 1/);
    assert.match(admission, /candidateTreeSha/);
    assert.match(admission, /candidateIdentitySha256/);
    assert.match(admission, /activeStageAdmissionStorageGuard = buildStageAdmissionStorageGuard/);
    assert.match(admission, /measureAdaptiveDevelopmentDirectoryFootprintBytes\(sampleDirectory\)/);
    assert.match(admission, /error instanceof AdaptiveDevelopmentProcessInterruptedError/);
    assert.match(admission, /finally \{\s+activeStageAdmissionStorageGuard = undefined/);
    assert.match(admission, /rmSync\(input\.samplesRoot, \{ recursive: true, force: true \}\)/);
    assert.match(admission, /adaptiveDevelopmentStageAdmissionActiveDirectory\(args\.repositoryRoot, args\.stageId\)/);
    assert.match(admission, /installAdaptiveDevelopmentStageAdmissionProcessRecovery/);
    assert.match(admission, /rmSync\(samplesRoot, \{ recursive: true, force: true \}\)/);
    assert.doesNotMatch(
      admission,
      /connectApprovalAuthority|runCarrierReadiness|runAdaptiveDevelopmentCodexCarrierSmoke|RedisAdaptiveDevelopmentStageAdmissionStore/,
    );

    const main = benchmarkRunnerSource.slice(benchmarkRunnerSource.indexOf('async function main():'));
    assert.ok(main.indexOf("if (args.mode === 'admit')") < main.indexOf('initializeBenchmarkCommand(args)'));
    assert.ok(
      main.indexOf('installAdaptiveDevelopmentProcessSignalHandlers()') < main.lastIndexOf('main()'),
      'runner signal handlers must be installed before main starts',
    );

    const recoveryInstallIndex = admission.indexOf('await installAdaptiveDevelopmentStageAdmissionProcessRecovery({');
    const staleCleanupIndex = admission.indexOf(
      'rmSync(samplesRoot, { recursive: true, force: true });',
      recoveryInstallIndex,
    );
    const collectionIndex = admission.indexOf('samples = await collectStageAdmissionSamples({');
    assert.notEqual(recoveryInstallIndex, -1);
    assert.notEqual(staleCleanupIndex, -1);
    assert.ok(recoveryInstallIndex < staleCleanupIndex);
    assert.ok(staleCleanupIndex < collectionIndex, 'stale samples must be removed before admission restarts');

    const initialize = sourceFunction('initializeBenchmarkCommand', 'bindOperationalCanaryToEnvironment');
    const admissionIndex = initialize.indexOf(
      'await loadValidatedStageAdmissionBinding(args, manifest, oracleToolchainSha256)',
    );
    const messageStoreIndex = initialize.indexOf('reviewedMessageStoreConfig()');
    assert.notEqual(admissionIndex, -1);
    assert.notEqual(messageStoreIndex, -1);
    assert.ok(admissionIndex < messageStoreIndex);

    const prepare = sourceFunction('runPrepareCommand', 'prepareLiveBenchmarkExecution');
    assert.match(prepare, /buildLaunchScope\(manifest, args\.stageId, environmentSha256, 'live', stageAdmission\)/);

    const root = mkdtempSync(join(tmpdir(), 'lf0001-admission-required-'));
    try {
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [
              benchmarkRunnerScript,
              '--prepare-launch',
              '--stage-id',
              's1-long-horizon-directional',
              '--repository-root',
              benchmarkRepositoryRoot,
              '--output-root',
              join(root, 'run'),
              '--canary-plan',
              join(root, 'unused-canary-plan.json'),
            ],
            { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
          ),
        /requires --admission-result from the exact admitted runner/,
      );
      assert.equal(existsSync(join(root, 'run')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const oracle = sourceFunction('runOracle', 'runIsolatedOracle');
    assert.match(
      oracle,
      /checkWorkingDirectory \? join\(runtime\.worktree, checkWorkingDirectory\) : runtime\.worktree/,
    );
    assert.match(oracle, /\{ \.\.\.runtime\.boundary, workingDirectory \}/);
  });

  it('binds one real SOP episode and non-intervening post-hoc measurement to durable provider authorization', () => {
    assert.match(benchmarkRunnerSource, /--prepare-review-boundary-calibration/);
    assert.match(benchmarkRunnerSource, /--run-review-boundary-calibration/);
    assert.match(benchmarkRunnerSource, /--review-boundary-calibration-plan/);
    assert.match(benchmarkRunnerSource, /--review-boundary-calibration-certificate/);
    assert.match(benchmarkRunnerSource, /--prepare-convergence-canary/);
    assert.match(benchmarkRunnerSource, /--run-convergence-canary/);
    assert.match(benchmarkRunnerSource, /--convergence-canary-plan/);

    const executionStart = benchmarkRunnerSource.indexOf('async function executeProviderBackedConvergenceCanary(');
    const executionEnd = benchmarkRunnerSource.indexOf('\nfunction combineGraphAndJudgeTelemetry(', executionStart);
    assert.notEqual(executionStart, -1);
    assert.notEqual(executionEnd, -1);
    const execution = benchmarkRunnerSource.slice(executionStart, executionEnd);
    assert.match(execution, /await runAdaptiveDevelopmentConvergenceCanary\(/);
    assert.match(execution, /manifest\.convergenceCanary/);
    assert.match(execution, /armId: arm\.id/);
    assert.match(execution, /repetition: 0/);
    assert.doesNotMatch(execution, /assertConvergenceBaseline|convergence-baseline/);
    assert.match(execution, /CONVERGENCE_CANARY_PREPARATION_WALL_TIME_MS_CAP/);
    assert.match(execution, /runConvergenceExecutorEpisode/);
    assert.match(execution, /judge: async \(candidate\)/);
    assert.match(execution, /oracleSetId: 'convergence-episode'/);
    assert.match(execution, /oracleSetId: 'convergence-episode-repeatability'/);
    assert.doesNotMatch(execution, /repairBrief|runConvergenceExecutorRound|runConvergenceReviewerRound/);
    assert.match(execution, /assertConvergenceOracleRepeatability\(oracle, repeatedOracle\)/);
    assert.match(execution, /buildConvergenceCanaryStorageGuard/);
    assert.match(execution, /activeConvergenceCanaryStorageGuard/);
    assert.match(benchmarkRunnerSource, /convergence-storage-guard-failure\.json/);
    assert.match(execution, /cleanupConvergenceCanaryEphemeralWorktrees/);
    assert.match(execution, /deriveAdaptiveDevelopmentConvergenceCandidateDeadlineEpochMs/);
    assert.match(execution, /candidateWallTimeMsCap/);
    assert.match(execution, /deriveAdaptiveDevelopmentConvergenceCanaryAdjudicationDeadlineEpochMs/);
    assert.match(execution, /adjudicationWallTimeMsCap/);
    assert.match(execution, /adjudicationDeadlineEpochMs/);
    assert.equal((execution.match(/deadlineEpochMs: adjudicationDeadlineEpochMs/g) ?? []).length, 3);
    assert.equal((execution.match(/deadlineEpochMs: developmentDeadlineEpochMs/g) ?? []).length, 1);
    assert.doesNotMatch(execution, /let deadlineEpochMs =/);
    assert.doesNotMatch(execution, /evaluateAdaptiveDevelopmentBenchmark/);

    const preparedOracle = sourceFunction('materializePreparedOracleCandidate', 'materializeOraclePhaseWorktree');
    assert.match(preparedOracle, /--package-import-method=clone/);
    assert.doesNotMatch(preparedOracle, /--package-import-method=copy/);
    const oraclePhase = sourceFunction('materializeOraclePhaseWorktree', 'runTaskOracleSetupCommands');
    assert.match(oraclePhase, /cloneAdaptiveDevelopmentOracleSnapshot/);
    assert.doesNotMatch(oraclePhase, /pnpm/);
    const isolatedOracle = sourceFunction('runIsolatedOracle', 'materializeStageAdmissionCandidate');
    assert.match(isolatedOracle, /await materializePreparedOracleCandidate\(/);
    assert.match(isolatedOracle, /prepared\.worktree/);
    assert.match(isolatedOracle, /dispose: \(\) => rmSync\(materialized\.directory/);
    assert.match(isolatedOracle, /rmSync\(prepared\.directory/);

    const calibrationCommand = sourceSection(
      'async function runConvergenceReviewBoundaryCalibrationCommand(',
      '\nfunction buildCurrentConvergenceCanaryScope(',
    );
    const prepareCalibrationIndex = calibrationCommand.indexOf("args.mode === 'prepare-review-boundary-calibration'");
    const calibrationReadinessIndex = calibrationCommand.indexOf('await runCarrierReadiness({');
    const calibrationClaimIndex = calibrationCommand.indexOf('await claimAuthorizedConvergenceReviewBoundaryCalibration({');
    const calibrationProviderIndex = calibrationCommand.indexOf('await runConvergenceReviewBoundaryCalibration(');
    assert.notEqual(prepareCalibrationIndex, -1);
    assert.ok(prepareCalibrationIndex < calibrationReadinessIndex);
    assert.ok(calibrationReadinessIndex < calibrationClaimIndex);
    assert.ok(calibrationClaimIndex < calibrationProviderIndex);
    assert.match(calibrationCommand, /convergence_judge_calibration_scope_ready/);
    assert.match(calibrationCommand, /buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationDirective/);
    assert.match(calibrationCommand, /transitionConvergenceReviewBoundaryCalibrationRecord/);

    const calibrationTrial = sourceSection(
      'async function runConvergenceReviewBoundaryCalibrationCase(',
      '\nasync function runConvergenceReviewBoundaryCalibrationTrial(',
    );
    const calibrationProjectionIndex = calibrationTrial.indexOf(
      'buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationProjection',
    );
    const calibrationMaterializationIndex = calibrationTrial.indexOf(
      'materializeConvergenceReviewBoundaryJudgeContext',
    );
    assert.notEqual(calibrationProjectionIndex, -1);
    assert.ok(calibrationProjectionIndex < calibrationMaterializationIndex);
    assert.match(calibrationTrial, /materializeConvergenceReviewBoundaryJudgeContext/);
    assert.match(calibrationTrial, /CONVERGENCE_JUDGE_OUTPUT_SCHEMA/);
    assert.match(calibrationTrial, /convergenceReviewBoundaryPrompt/);
    assert.match(calibrationTrial, /parseConvergenceJudgeOutput/);
    assert.match(calibrationTrial, /assertConvergenceJudgeEvidence/);
    assert.doesNotMatch(benchmarkRunnerSource, /function convergenceJudgeCalibrationPrompt/);
    assert.doesNotMatch(benchmarkRunnerSource, /blind-cases\.json/);

    const commandStart = benchmarkRunnerSource.indexOf('async function runConvergenceCanaryCommand(');
    const commandEnd = benchmarkRunnerSource.indexOf('\nfunction lifecycleTimestampAfter(', commandStart);
    assert.notEqual(commandStart, -1);
    assert.notEqual(commandEnd, -1);
    const command = benchmarkRunnerSource.slice(commandStart, commandEnd);
    const readinessIndex = command.indexOf('await runCarrierReadiness({');
    const calibrationIndex = command.indexOf('await runConvergenceOracleCalibration(context)');
    const judgeCalibrationIndex = command.indexOf('await loadTrustedConvergenceReviewBoundaryCalibrationCertificate(');
    const scopeIndex = command.indexOf('const scope = buildCurrentConvergenceCanaryScope(');
    const claimIndex = command.indexOf('await claimAuthorizedConvergenceCanaryExecution(');
    const providerIndex = command.indexOf('await executeProviderBackedConvergenceCanary({');
    assert.notEqual(readinessIndex, -1);
    assert.ok(readinessIndex < judgeCalibrationIndex);
    assert.ok(judgeCalibrationIndex < calibrationIndex);
    assert.ok(calibrationIndex < scopeIndex);
    assert.ok(scopeIndex < claimIndex);
    assert.ok(claimIndex < providerIndex);
    assert.doesNotMatch(command, /await runConvergenceReviewBoundaryCalibration\(/);
    assert.match(command, /nonScoring: true/);
    assert.match(command, /effectClaimEligible: false/);
    assert.match(command, /execution\.store\.complete/);
    assert.match(command, /execution\.store\.fail/);

    const executor = sourceFunction('runConvergenceExecutorEpisode', 'runConvergenceJudge');
    assert.match(executor, /convergenceExecutorPrompt/);
    assert.match(executor, /agentExecutionMode: 'natural_agent_graph'/);
    assert.match(executor, /executorEpisode/);
    assert.doesNotMatch(executor, /repairBrief|priorRound|round === 2/);
    assert.match(executor, /executorRoleKey = convergenceRoleKey\(input\.canaryPlanSha256, 'executor'\)/);
    const judge = sourceSection(
      'async function runConvergenceJudge(',
      '\nfunction assertConvergenceCanaryStorageCapacity(',
    );
    assert.match(judge, /agentExecutionMode: 'single_agent'/);
    assert.match(judge, /instanceId: 'convergence-judge'/);
    assert.match(judge, /judgeRoleKey = convergenceRoleKey\(input\.canaryPlanSha256, 'judge'\)/);
    assert.match(judge, /workingDirectory: judgeWorktree/);
    assert.match(judge, /filesystemAccess: 'read'/);
    assert.match(judge, /materializeConvergenceReviewBoundaryJudgeContext/);
    assert.doesNotMatch(judge, /\['install'/);
    assert.doesNotMatch(judge, /runTaskOracleSetupCommands/);
    assert.doesNotMatch(judge, /--package-import-method=clone/);
    assert.doesNotMatch(judge, /terminal-oracle|oracle: input\.oracle|repairBrief/);
    assert.match(judge, /buildAdaptiveDevelopmentReviewVisibilityManifest/);
    const judgeContextMaterializer = sourceSection(
      'function materializeConvergenceReviewBoundaryJudgeContext(',
      '\nfunction sha256File(',
    );
    for (const evidencePath of [
      'candidate-identity.json',
      'candidate.patch',
      'task-input.json',
      'scope.json',
      'episode-checkpoint.json',
      'agent-episode.json',
      'review-evidence.json',
      'review-boundary-rubric.json',
    ]) {
      assert.match(judgeContextMaterializer, new RegExp(evidencePath.replace('.', '\\.')));
    }
    assert.match(judgeContextMaterializer, /input\.rubric/);
    assert.doesNotMatch(judge, /reviewBoundaryGoldSuite|gold-cases/);
    assert.match(judge, /judgeVisibility\.candidateSha !== input\.candidate\.candidateSha/);
    assert.match(judge, /assertConvergenceJudgeEvidence\(\{/);
    assert.match(judge, /candidateRoot: input\.runtime\.worktree/);
    assert.match(judge, /writeProtectedPaths: \[judgeWorktree\]/);
    assert.match(judge, /treatmentArm\.skillSnapshot\.path/);
    assert.match(judge, /sanitizeAdaptiveDevelopmentReviewWorkspace/);

    const convergenceReviewPromptStart = convergenceReviewBoundaryJudgeSource.indexOf(
      'export function buildAdaptiveDevelopmentConvergenceReviewBoundaryJudgePrompt(',
    );
    const convergenceReviewPromptEnd = convergenceReviewBoundaryJudgeSource.indexOf(
      '\nfunction parseFindingEvidence(',
      convergenceReviewPromptStart,
    );
    const convergenceReviewPrompt = convergenceReviewBoundaryJudgeSource.slice(
      convergenceReviewPromptStart,
      convergenceReviewPromptEnd,
    );
    assert.doesNotMatch(convergenceReviewPrompt, /reproduce|reproduction/i);
    assert.match(convergenceReviewPrompt, /static_proof/i);
    assert.match(convergenceReviewPrompt, /Do not judge task correctness/i);
    assert.match(convergenceReviewPrompt, /post-hoc/i);
    assert.match(convergenceReviewPrompt, /canonical arm-independent rubric/i);
    assert.match(convergenceReviewPrompt, /Do not substitute repository-default workflow/i);
    assert.match(convergenceReviewPrompt, /do not fix|do not prescribe or trigger repair/i);
    assert.match(convergenceReviewPrompt, /path:startLine-endLine/);
    assert.match(
      convergenceReviewBoundaryJudgeSource,
      /pattern: ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN/,
    );
    assert.doesNotMatch(convergenceReviewPrompt, /terminal-oracle|oracle result/i);

    const ordinaryExecutor = sourceSection('async function runAttempt(', '\ninterface ConvergenceEpisodeRuntime');
    assert.match(ordinaryExecutor, /agentExecutionMode: 'natural_agent_graph'/);
    assert.match(ordinaryExecutor, /agentExecutionMode: 'single_agent'/);
    assert.match(ordinaryExecutor, /const judge =/);
    assert.doesNotMatch(ordinaryExecutor, /const reviewer =|repairBrief/);
    assert.doesNotMatch(
      sourceSection('async function buildSopJudgeBundle(', '\nfunction commonDeveloperInstructions('),
      /terminal-oracle/,
    );
    assert.doesNotMatch(benchmarkRunnerSource, /Do not spawn subagents/);
    assert.doesNotMatch(
      benchmarkRunnerSource,
      /runAdaptiveSopReplay|AdaptiveSopPlannerPort|AdaptiveSopFactsProviderPort|AdaptiveSopCapabilityResolverPort|AdaptiveSopCapabilityReviewerPort/,
    );
    assert.doesNotMatch(
      sourceSection('async function buildBenchmarkModelCatalog(', '\nfunction assertRuntimeArtifacts('),
      /multi_agent_version: null/,
    );
  });

  it('executes Thread and Hub behavior checks inside the frozen no-fork oracle profile', () => {
    if (process.platform !== 'darwin') return;
    const manifest = JSON.parse(
      readFileSync(
        join(benchmarkRepositoryRoot, 'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json'),
        'utf8',
      ),
    );
    const checks = [
      manifest.tasks
        .find((task) => task.id === 'long-disposable-checkout-writes')
        .oraclePolicy.checks.find((check) => check.id === 'runtime-root-and-descendant-remap'),
      manifest.tasks
        .find((task) => task.id === 'long-provider-native-effort')
        .oraclePolicy.checks.find((check) => check.id === 'provider-effort-hub'),
    ];
    const root = mkdtempSync('/private/var/tmp/lf0001-registered-behavior-');
    try {
      for (const check of checks) executeRegisteredBehaviorCheck(check, root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds Judge files only from non-deleted candidate changes, not every allowed hidden path', () => {
    const bundle = sourceFunction('buildSopJudgeBundle', 'runAttempt');
    assert.match(bundle, /'--diff-filter=d'/);
    assert.match(bundle, /for \(const path of reviewFilePaths\)/);
    assert.doesNotMatch(bundle, /for \(const path of input\.task\.allowedChangedPaths/);
  });

  it('atomically admits all four unbounded initial attempts and limits infrastructure retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'lf0001-budget-ledger-'));
    const launchPlan = launchPlanFixture();
    try {
      const initial = reserveAdaptiveDevelopmentInitialStageAttempts(root, launchPlan);
      assert.equal(initial.length, 4);
      assert.ok(initial.every((reservation) => reservation.tokenPolicy === 'unbounded'));
      assert.ok(initial.every((reservation) => reservation.stageTokenPolicy === 'unbounded'));
      assert.deepEqual(reserveAdaptiveDevelopmentInitialStageAttempts(root, launchPlan), initial);

      const retry = reserveAdaptiveDevelopmentRetryStageAttempt(root, launchPlan, launchPlan.runs[0]);
      assert.ok(retry);
      assert.deepEqual(reserveAdaptiveDevelopmentRetryStageAttempt(root, launchPlan, launchPlan.runs[0]), retry);
      assert.equal(reserveAdaptiveDevelopmentRetryStageAttempt(root, launchPlan, launchPlan.runs[1]), undefined);
      assert.throws(
        () =>
          reserveAdaptiveDevelopmentRetryStageAttempt(root, launchPlan, {
            ...launchPlan.runs[0],
            taskId: 'forged-task',
          }),
        /not bound to an exact launch-plan run/,
      );
      const ledger = JSON.parse(readFileSync(join(root, 'stage-attempt-reservations.json'), 'utf8'));
      assert.equal(ledger.reservations.length, 5);
      assert.equal(ledger.stageTokenPolicy, 'unbounded');
      assert.ok(ledger.reservations.every((reservation) => reservation.tokenPolicy === 'unbounded'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
