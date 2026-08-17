import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  type Stats,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo, createConnection, createServer as createTcpServer } from 'node:net';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { rootCertificates } from 'node:tls';
import Database from 'better-sqlite3';
import {
  ADAPTIVE_DEVELOPMENT_BENCHMARK_ARTIFACT_VERSION,
  type AdaptiveDevelopmentBenchmarkArtifactKind,
  type AdaptiveDevelopmentBenchmarkEvidence,
  type AdaptiveDevelopmentBenchmarkLaunchPlan,
  type AdaptiveDevelopmentBenchmarkManifest,
  fingerprintAdaptiveDevelopmentBenchmark,
  parseAdaptiveDevelopmentBenchmarkEvidence,
} from './adaptive-development-benchmark-contract.js';
import { adaptiveDevelopmentBenchmarkArtifactFacts } from './adaptive-development-benchmark-evaluator.js';

export const ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_TOKEN_CAP = 30_000;

const PROCESS_TERMINATION_GRACE_MS = 2_000;
const SNAPSHOT_PRIVATE_PATHS = ['docs/harness-feedback', 'packages/api/test/harness-eval'] as const;
const STAGE_ATTEMPT_LEDGER_VERSION = 'lf-0001.stage-attempt-ledger.v1' as const;
const STAGE_ATTEMPT_RESERVATION_VERSION = 'lf-0001.stage-attempt-reservation.v1' as const;
const OPERATOR_APPROVAL_AUTHORITY_KIND = 'cat_cafe_runtime_message_store.v1' as const;
const COMMAND_LINE_TOOLS_ROOT = '/Library/Developer/CommandLineTools' as const;
const COMMAND_LINE_TOOLS_BIN = `${COMMAND_LINE_TOOLS_ROOT}/usr/bin` as const;
const ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER = 'adaptive_carrier_smoke' as const;
const ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_API_KEY_ENV = 'ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_KEY' as const;
const ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_MARKER = '.adaptive-carrier-smoke-tool' as const;
const ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_CALL_ID = 'call_adaptive_carrier_smoke' as const;
const ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_SPAWN_CALL_ID = 'call_adaptive_graph_spawn' as const;
const ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_WAIT_CALL_ID = 'call_adaptive_graph_wait' as const;
const ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_ROOT_PROMPT =
  'Complete the zero-cost natural agent graph readiness turn.' as const;
const ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER = 'control-plane-loopback-denied' as const;
const ADAPTIVE_DEVELOPMENT_SYSTEM_RESOLVER_READY_MARKER = 'system-resolver-socket-ready' as const;
const MACOS_SYSTEM_RESOLVER_SOCKET_ALIAS = '/var/run/mDNSResponder' as const;
const STAGE_ADMISSION_ACTIVE_RUN_VERSION = 'lf-0001.stage-admission-active-run.v1' as const;
const STAGE_ADMISSION_TAKEOVER_LEASE_VERSION = 'lf-0001.stage-admission-takeover-lease.v1' as const;
const STAGE_ADMISSION_PROCESS_SUPERVISOR_MARKER = 'lf0001-stage-admission-process-supervisor' as const;
const STAGE_ADMISSION_PROCESS_SPEC_ENV = 'LF0001_STAGE_ADMISSION_PROCESS_SPEC' as const;
const STAGE_ADMISSION_RECOVERY_TIMEOUT_MS = 2_000;
const STAGE_ADMISSION_TAKEOVER_LEASE_ACQUIRE_TIMEOUT_MS = 2_000;

export const ADAPTIVE_DEVELOPMENT_BENCHMARK_COMMIT_IDENTITIES = {
  runner: { name: 'Clowder Benchmark Runner', email: 'benchmark@clowder.local' },
  oracle: { name: 'Clowder Benchmark Oracle', email: 'benchmark-oracle@clowder.local' },
  admission: { name: 'Clowder Benchmark Admission', email: 'benchmark-admission@clowder.local' },
  operational_canary: { name: 'Adaptive Operational Canary', email: 'operational-canary@invalid' },
  carrier_readiness: { name: 'Adaptive Carrier Readiness', email: 'carrier-readiness@invalid' },
} as const;

export type AdaptiveDevelopmentBenchmarkCommitRole = keyof typeof ADAPTIVE_DEVELOPMENT_BENCHMARK_COMMIT_IDENTITIES;

export function buildAdaptiveDevelopmentBenchmarkCommitInvocation(
  role: AdaptiveDevelopmentBenchmarkCommitRole,
  commitArguments: readonly string[],
): { readonly args: readonly string[]; readonly environment: Readonly<NodeJS.ProcessEnv> } {
  const identity = ADAPTIVE_DEVELOPMENT_BENCHMARK_COMMIT_IDENTITIES[role];
  return {
    args: ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`, 'commit', ...commitArguments],
    environment: {
      GIT_AUTHOR_NAME: identity.name,
      GIT_AUTHOR_EMAIL: identity.email,
      GIT_COMMITTER_NAME: identity.name,
      GIT_COMMITTER_EMAIL: identity.email,
    },
  };
}

const STAGE_ADMISSION_PROCESS_SUPERVISOR_SCRIPT = [
  "const { spawn, spawnSync } = require('node:child_process');",
  `if (process.argv[1] !== ${JSON.stringify(STAGE_ADMISSION_PROCESS_SUPERVISOR_MARKER)}) process.exit(126);`,
  `const encoded = process.env[${JSON.stringify(STAGE_ADMISSION_PROCESS_SPEC_ENV)}];`,
  `delete process.env[${JSON.stringify(STAGE_ADMISSION_PROCESS_SPEC_ENV)}];`,
  'if (!encoded) process.exit(126);',
  "const specification = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));",
  "process.on('SIGINT', () => {});",
  "process.on('SIGTERM', () => {});",
  'let outcome = { code: 127, signal: null };',
  'let childSettled = false;',
  'const groupHasOtherMembers = () => {',
  "  const result = spawnSync('/bin/ps', ['ww', '-axo', 'pid=,pgid='], { encoding: 'utf8', detached: true });",
  '  if (result.error || result.status !== 0) return true;',
  "  return result.stdout.split('\\n').some((line) => {",
  '    const match = /^\\s*(\\d+)\\s+(\\d+)\\s*$/.exec(line);',
  '    return match && Number(match[2]) === process.pid && Number(match[1]) !== process.pid;',
  '  });',
  '};',
  'const finishWhenDrained = () => {',
  '  if (groupHasOtherMembers()) { setTimeout(finishWhenDrained, 25); return; }',
  '  if (outcome.signal) {',
  '    process.removeAllListeners(outcome.signal);',
  '    process.kill(process.pid, outcome.signal);',
  '    return;',
  '  }',
  '  process.exit(outcome.code ?? 1);',
  '};',
  'const child = spawn(specification.command, specification.args, {',
  '  cwd: process.cwd(),',
  '  env: process.env,',
  "  stdio: 'inherit',",
  '});',
  "child.once('error', (error) => {",
  '  if (childSettled) return;',
  '  childSettled = true;',
  "  process.stderr.write(error.name + ': ' + error.message + '\\n');",
  '  outcome = { code: 127, signal: null };',
  '  finishWhenDrained();',
  '});',
  "child.once('close', (code, signal) => {",
  '  if (childSettled) return;',
  '  childSettled = true;',
  '  outcome = { code, signal };',
  '  finishWhenDrained();',
  '});',
].join('\n');

// The pipe closes even when the recovery host is SIGKILLed, so an independent
// custodian can release the exact lease without guessing liveness from a PID.
const STAGE_ADMISSION_TAKEOVER_LEASE_CUSTODIAN_SCRIPT = [
  "const { readFileSync, unlinkSync, writeFileSync } = require('node:fs');",
  'const leasePath = process.argv[1];',
  "const specification = JSON.parse(Buffer.from(process.argv[2] ?? '', 'base64').toString('utf8'));",
  'const lease = { ...specification, custodianPid: process.pid };',
  'let released = false;',
  'const release = () => {',
  '  if (released) return;',
  '  released = true;',
  '  try {',
  "    const persisted = JSON.parse(readFileSync(leasePath, 'utf8'));",
  '    if (',
  '      persisted.schemaVersion !== lease.schemaVersion ||',
  '      persisted.ownerPid !== lease.ownerPid ||',
  '      persisted.custodianPid !== lease.custodianPid ||',
  '      persisted.leaseToken !== lease.leaseToken',
  '    ) {',
  "      process.stderr.write('stage admission takeover lease changed before custodian release\\n');",
  '      process.exitCode = 18;',
  '      return;',
  '    }',
  '    unlinkSync(leasePath);',
  '  } catch (error) {',
  "    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\\n');",
  '    process.exitCode = 18;',
  '  }',
  '};',
  'try {',
  "  writeFileSync(leasePath, JSON.stringify(lease, null, 2) + '\\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });",
  '} catch (error) {',
  "  if (error && error.code === 'EEXIST') process.exit(17);",
  "  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\\n');",
  '  process.exit(19);',
  '}',
  "process.once('SIGINT', () => { release(); process.exit(130); });",
  "process.once('SIGTERM', () => { release(); process.exit(143); });",
  "process.stdin.once('end', release);",
  'process.stdin.resume();',
  "process.stdout.write('acquired\\n');",
].join('\n');

type AdaptiveDevelopmentProcessShutdownHandler = (signal: NodeJS.Signals) => void;

const activeAdaptiveDevelopmentProcessShutdownHandlers = new Set<AdaptiveDevelopmentProcessShutdownHandler>();
let adaptiveDevelopmentProcessShutdownSignal: NodeJS.Signals | undefined;

interface AdaptiveDevelopmentStageAdmissionActiveRunState {
  readonly schemaVersion: typeof STAGE_ADMISSION_ACTIVE_RUN_VERSION;
  readonly repositoryRoot: string;
  readonly stageId: string;
  readonly ownerPid: number;
  readonly runToken: string;
  readonly processGroupIds: readonly number[];
}

interface AdaptiveDevelopmentStageAdmissionProcessTracker {
  readonly activeDirectory: string;
  readonly statePath: string;
  state: AdaptiveDevelopmentStageAdmissionActiveRunState;
}

interface AdaptiveDevelopmentStageAdmissionTakeoverLease {
  readonly schemaVersion: typeof STAGE_ADMISSION_TAKEOVER_LEASE_VERSION;
  readonly ownerPid: number;
  readonly custodianPid: number;
  readonly leaseToken: string;
}

let activeAdaptiveDevelopmentStageAdmissionProcessTracker: AdaptiveDevelopmentStageAdmissionProcessTracker | undefined;

export class AdaptiveDevelopmentProcessInterruptedError extends Error {
  constructor(readonly signal: NodeJS.Signals) {
    super(`adaptive development process interrupted by ${signal}`);
    this.name = 'AdaptiveDevelopmentProcessInterruptedError';
  }
}

export function installAdaptiveDevelopmentProcessSignalHandlers(): () => void {
  const onSigint = (): void => requestAdaptiveDevelopmentProcessShutdown('SIGINT');
  const onSigterm = (): void => requestAdaptiveDevelopmentProcessShutdown('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}

function requestAdaptiveDevelopmentProcessShutdown(signal: NodeJS.Signals): void {
  adaptiveDevelopmentProcessShutdownSignal ??= signal;
  for (const shutdown of activeAdaptiveDevelopmentProcessShutdownHandlers) {
    shutdown(adaptiveDevelopmentProcessShutdownSignal);
  }
}

export function adaptiveDevelopmentStageAdmissionActiveDirectory(repositoryRoot: string, stageId: string): string {
  const canonicalRepositoryRoot = realpathSync(resolve(repositoryRoot));
  const stageKey = createHash('sha256')
    .update(JSON.stringify({ repositoryRoot: canonicalRepositoryRoot, stageId }))
    .digest('hex')
    .slice(0, 24);
  return join(canonicalRepositoryRoot, '.cat-cafe', 'benchmark-admission', '.active', stageKey);
}

export async function installAdaptiveDevelopmentStageAdmissionProcessRecovery(input: {
  readonly repositoryRoot: string;
  readonly stageId: string;
}): Promise<() => Promise<void>> {
  if (activeAdaptiveDevelopmentStageAdmissionProcessTracker) {
    throw new Error('stage admission process recovery is already installed');
  }
  const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
  const activeDirectory = adaptiveDevelopmentStageAdmissionActiveDirectory(repositoryRoot, input.stageId);
  const statePath = join(activeDirectory, 'active-run.json');
  const samplesRoot = join(activeDirectory, 'samples');
  mkdirSync(activeDirectory, { recursive: true });
  const releaseTakeoverLease = await acquireAdaptiveDevelopmentStageAdmissionTakeoverLease(activeDirectory);
  try {
    const staleState = readAdaptiveDevelopmentStageAdmissionActiveRunState(statePath);
    if (staleState) {
      assertAdaptiveDevelopmentStageAdmissionRecoveryCoordinates(staleState, repositoryRoot, input.stageId);
      if (processExists(staleState.ownerPid)) {
        throw new Error(`stage admission already has an active runner host: pid ${staleState.ownerPid}`);
      }
      await terminateAdaptiveDevelopmentStageAdmissionProcessGroups(staleState);
      const stateBeforeReclamation = readAdaptiveDevelopmentStageAdmissionActiveRunState(statePath);
      if (!adaptiveDevelopmentStageAdmissionActiveRunStatesEqual(stateBeforeReclamation, staleState)) {
        throw new Error('stage admission active-run record changed during dead-owner takeover');
      }
      unlinkSync(statePath);
      rmSync(samplesRoot, { recursive: true, force: true });
    } else {
      rmSync(samplesRoot, { recursive: true, force: true });
    }

    const state: AdaptiveDevelopmentStageAdmissionActiveRunState = {
      schemaVersion: STAGE_ADMISSION_ACTIVE_RUN_VERSION,
      repositoryRoot,
      stageId: input.stageId,
      ownerPid: process.pid,
      runToken: randomUUID(),
      processGroupIds: [],
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const tracker: AdaptiveDevelopmentStageAdmissionProcessTracker = { activeDirectory, statePath, state };
    activeAdaptiveDevelopmentStageAdmissionProcessTracker = tracker;
    return async () => {
      if (activeAdaptiveDevelopmentStageAdmissionProcessTracker !== tracker) return;
      if (tracker.state.processGroupIds.length > 0) {
        await terminateAdaptiveDevelopmentStageAdmissionProcessGroups(tracker.state);
      }
      activeAdaptiveDevelopmentStageAdmissionProcessTracker = undefined;
      const persisted = readAdaptiveDevelopmentStageAdmissionActiveRunState(tracker.statePath);
      if (persisted?.runToken === tracker.state.runToken) unlinkSync(tracker.statePath);
      try {
        rmdirSync(tracker.activeDirectory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
      }
    };
  } finally {
    await releaseTakeoverLease();
  }
}

async function acquireAdaptiveDevelopmentStageAdmissionTakeoverLease(
  activeDirectory: string,
): Promise<() => Promise<void>> {
  const leasePath = join(activeDirectory, 'takeover-lease.json');
  const lease: Omit<AdaptiveDevelopmentStageAdmissionTakeoverLease, 'custodianPid'> = {
    schemaVersion: STAGE_ADMISSION_TAKEOVER_LEASE_VERSION,
    ownerPid: process.pid,
    leaseToken: randomUUID(),
  };
  const encodedLease = Buffer.from(JSON.stringify(lease), 'utf8').toString('base64');
  const custodian = spawn(
    process.execPath,
    ['--eval', STAGE_ADMISSION_TAKEOVER_LEASE_CUSTODIAN_SCRIPT, leasePath, encodedLease],
    {
      cwd: activeDirectory,
      env: {},
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const stderr: Buffer[] = [];
  custodian.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const closePromise = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => {
    custodian.once('close', (exitCode, signal) => resolvePromise({ exitCode, signal }));
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let stdout = '';
    let settled = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      settle(() => {
        custodian.kill('SIGTERM');
        rejectPromise(new Error('stage admission takeover lease custodian did not acquire the lease in time'));
      });
    }, STAGE_ADMISSION_TAKEOVER_LEASE_ACQUIRE_TIMEOUT_MS);
    custodian.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('acquired\n')) settle(resolvePromise);
    });
    custodian.once('error', (error) => settle(() => rejectPromise(error)));
    custodian.once('close', (exitCode, signal) => {
      settle(() => {
        if (exitCode === 17) {
          rejectPromise(new Error('stage admission dead-owner takeover is already in progress'));
          return;
        }
        const detail = Buffer.concat(stderr).toString('utf8').trim();
        rejectPromise(
          new Error(
            `stage admission takeover lease custodian exited before acquisition: ${exitCode ?? signal ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          ),
        );
      });
    });
  });
  return async () => {
    custodian.stdin.end();
    const closed = await closePromise;
    if (closed.exitCode !== 0) {
      const detail = Buffer.concat(stderr).toString('utf8').trim();
      throw new Error(
        `stage admission takeover lease custodian failed to release: ${closed.exitCode ?? closed.signal ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
      );
    }
  };
}

function adaptiveDevelopmentStageAdmissionActiveRunStatesEqual(
  left: AdaptiveDevelopmentStageAdmissionActiveRunState | undefined,
  right: AdaptiveDevelopmentStageAdmissionActiveRunState,
): boolean {
  return (
    left?.schemaVersion === right.schemaVersion &&
    left.repositoryRoot === right.repositoryRoot &&
    left.stageId === right.stageId &&
    left.ownerPid === right.ownerPid &&
    left.runToken === right.runToken &&
    left.processGroupIds.length === right.processGroupIds.length &&
    left.processGroupIds.every((processGroupId, index) => processGroupId === right.processGroupIds[index])
  );
}

function readAdaptiveDevelopmentStageAdmissionActiveRunState(
  statePath: string,
): AdaptiveDevelopmentStageAdmissionActiveRunState | undefined {
  if (!existsSync(statePath)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `stage admission active-run record is unreadable: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stage admission active-run record is invalid');
  }
  const candidate = value as Partial<AdaptiveDevelopmentStageAdmissionActiveRunState>;
  if (
    candidate.schemaVersion !== STAGE_ADMISSION_ACTIVE_RUN_VERSION ||
    typeof candidate.repositoryRoot !== 'string' ||
    typeof candidate.stageId !== 'string' ||
    !Number.isInteger(candidate.ownerPid) ||
    (candidate.ownerPid ?? 0) <= 0 ||
    typeof candidate.runToken !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(candidate.runToken) ||
    !Array.isArray(candidate.processGroupIds) ||
    candidate.processGroupIds.some((pid) => !Number.isInteger(pid) || pid <= 0) ||
    new Set(candidate.processGroupIds).size !== candidate.processGroupIds.length
  ) {
    throw new Error('stage admission active-run record is invalid');
  }
  return candidate as AdaptiveDevelopmentStageAdmissionActiveRunState;
}

function assertAdaptiveDevelopmentStageAdmissionRecoveryCoordinates(
  state: AdaptiveDevelopmentStageAdmissionActiveRunState,
  repositoryRoot: string,
  stageId: string,
): void {
  if (state.repositoryRoot !== repositoryRoot || state.stageId !== stageId) {
    throw new Error('stage admission active-run record does not match its repository and stage coordinates');
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

function processGroupExists(processGroupId: number): boolean {
  try {
    if (process.platform === 'win32') process.kill(processGroupId, 0);
    else process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

function adaptiveDevelopmentStageAdmissionOwnedProcessGroups(runToken: string): ReadonlySet<number> {
  if (process.platform === 'win32') return new Set();
  const listing = execFileSync('/bin/ps', ['ww', '-axo', 'pid=,pgid=,command='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const groups = new Set<number>();
  for (const line of listing.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match || !match[3]?.includes(runToken)) continue;
    const processGroupId = Number(match[2]);
    if (Number.isInteger(processGroupId) && processGroupId > 0) groups.add(processGroupId);
  }
  return groups;
}

async function terminateAdaptiveDevelopmentStageAdmissionProcessGroups(
  state: AdaptiveDevelopmentStageAdmissionActiveRunState,
): Promise<void> {
  const ownedGroups = adaptiveDevelopmentStageAdmissionOwnedProcessGroups(state.runToken);
  for (const processGroupId of state.processGroupIds) {
    if (processGroupExists(processGroupId) && !ownedGroups.has(processGroupId)) {
      throw new Error(`refusing to signal unverified stale stage admission process group ${processGroupId}`);
    }
  }
  for (const processGroupId of ownedGroups) signalProcessTree(processGroupId, 'SIGKILL');
  const deadline = Date.now() + STAGE_ADMISSION_RECOVERY_TIMEOUT_MS;
  while ([...ownedGroups].some((processGroupId) => processGroupExists(processGroupId))) {
    if (Date.now() >= deadline) throw new Error('stale stage admission process group did not terminate');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

function writeAdaptiveDevelopmentStageAdmissionTrackerState(
  tracker: AdaptiveDevelopmentStageAdmissionProcessTracker,
  state: AdaptiveDevelopmentStageAdmissionActiveRunState,
): void {
  const temporaryPath = `${tracker.statePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, tracker.statePath);
    tracker.state = state;
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function registerAdaptiveDevelopmentStageAdmissionProcessGroup(processGroupId: number | undefined): number | undefined {
  const tracker = activeAdaptiveDevelopmentStageAdmissionProcessTracker;
  if (!tracker || !processGroupId || processGroupId <= 0) return undefined;
  if (tracker.state.processGroupIds.includes(processGroupId)) return processGroupId;
  writeAdaptiveDevelopmentStageAdmissionTrackerState(tracker, {
    ...tracker.state,
    processGroupIds: [...tracker.state.processGroupIds, processGroupId],
  });
  return processGroupId;
}

function unregisterAdaptiveDevelopmentStageAdmissionProcessGroup(processGroupId: number | undefined): void {
  const tracker = activeAdaptiveDevelopmentStageAdmissionProcessTracker;
  if (!tracker || !processGroupId || !tracker.state.processGroupIds.includes(processGroupId)) return;
  writeAdaptiveDevelopmentStageAdmissionTrackerState(tracker, {
    ...tracker.state,
    processGroupIds: tracker.state.processGroupIds.filter((candidate) => candidate !== processGroupId),
  });
}

export function measureAdaptiveDevelopmentDirectoryFootprintBytes(root: string): number {
  const pending = [root];
  let footprintBytes = 0;
  while (pending.length > 0) {
    const path = pending.pop() as string;
    const stats = lstatIfExists(path);
    if (!stats) continue;
    const pathFootprintBytes = Math.max(stats.blocks * 512, stats.size);
    if (!Number.isSafeInteger(pathFootprintBytes) || !Number.isSafeInteger(footprintBytes + pathFootprintBytes)) {
      throw new Error(`directory-footprint measurement exceeded the safe integer range at ${path}`);
    }
    footprintBytes += pathFootprintBytes;
    if (!stats.isDirectory()) continue;
    const children = readdirIfExists(path);
    if (!children) continue;
    for (const child of children) pending.push(join(path, child));
  }
  return footprintBytes;
}

export interface AdaptiveDevelopmentDirectoryStorageGuard {
  readonly intervalMs: number;
  check(): void;
}

export function buildAdaptiveDevelopmentDirectoryStorageGuard(input: {
  readonly label: string;
  readonly storagePath: string;
  readonly footprintPath: string;
  readonly intervalMs: number;
  readonly minimumFreeBytes: number;
  readonly maximumFootprintBytes: number;
}): AdaptiveDevelopmentDirectoryStorageGuard {
  if (!input.label) throw new Error('directory storage guard requires a label');
  for (const [label, value, allowZero] of [
    ['interval', input.intervalMs, false],
    ['minimum free bytes', input.minimumFreeBytes, true],
    ['maximum footprint bytes', input.maximumFootprintBytes, false],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
      throw new Error(`directory storage guard ${label} must be a safe integer`);
    }
  }
  const check = (): void => {
    const filesystem = statfsSync(input.storagePath);
    const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    if (!Number.isSafeInteger(freeBytes) || freeBytes < input.minimumFreeBytes) {
      throw new Error(`${input.label} free-space floor requires ${input.minimumFreeBytes} bytes; found ${freeBytes}`);
    }
    const footprintBytes = measureAdaptiveDevelopmentDirectoryFootprintBytes(input.footprintPath);
    if (footprintBytes > input.maximumFootprintBytes) {
      throw new Error(
        `${input.label} footprint exceeded ${input.maximumFootprintBytes} bytes; found ${footprintBytes}`,
      );
    }
  };
  return { intervalMs: input.intervalMs, check };
}

function lstatIfExists(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function readdirIfExists(path: string): string[] | undefined {
  try {
    return readdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export const ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT = {
  operatorUserId: 'default-user',
  threadId: 'thread_mrsvt7x42vkz9ua5',
  redisUrl: 'redis://localhost:6399',
  redisKeyPrefix: 'cat-cafe:',
} as const;

const DISABLED_CODEX_FEATURES = [
  'apps',
  'browser_use',
  'computer_use',
  'image_generation',
  'in_app_browser',
  'plugins',
  'plugin_sharing',
  'remote_plugin',
  'unified_exec_zsh_fork',
  'remote_models',
  'web_search_request',
  'web_search_cached',
  'search_tool',
  'request_permissions_tool',
  'tool_suggest',
  'current_time_reminder',
] as const;

const ENABLED_CODEX_FEATURES = [
  'shell_snapshot',
  'shell_tool',
  'unified_exec',
  'code_mode',
  'code_mode_only',
  'network_proxy',
] as const;

const ADAPTIVE_DEVELOPMENT_AGENT_GRAPH_FEATURES = ['multi_agent', 'multi_agent_v2'] as const;

export type AdaptiveDevelopmentAgentExecutionMode = 'natural_agent_graph' | 'single_agent';

const REQUIRED_ARTIFACT_KINDS = [
  'launch_control',
  'execution',
  'oracle',
  'verification',
  'judge',
  'outcome_checkpoint',
  'telemetry',
  'safety',
] as const satisfies readonly AdaptiveDevelopmentBenchmarkArtifactKind[];

export interface AdaptiveDevelopmentCodexInvocationInput {
  readonly executable: string;
  readonly codexHome: string;
  readonly model: string;
  readonly workingDirectory: string;
  readonly rolloutBudget:
    | {
        readonly kind: 'capped';
        readonly tokenCap: number;
        readonly reminderAtRemainingTokens: number;
      }
    | { readonly kind: 'unbounded' };
  readonly outputSchemaPath: string;
  readonly outputLastMessagePath: string;
  readonly developerInstructions: string;
  readonly prompt: string;
  readonly filesystemAccess: 'write' | 'read';
  readonly agentExecutionMode: AdaptiveDevelopmentAgentExecutionMode;
  readonly nodeExecutable: string;
  readonly modelCatalogPath: string;
  readonly providerTransportTrustPath: string;
  readonly localResponsesProviderBaseUrl?: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly skipGitRepositoryCheck?: boolean;
  /** Persist only the isolated candidate thread ledger so graph usage can be audited after exit. */
  readonly persistThreadLedger?: boolean;
}

export interface AdaptiveDevelopmentCodexSandboxProbeInvocationInput {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly command: string;
  readonly args: readonly string[];
}

export interface AdaptiveDevelopmentCodexInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly prompt: string;
  readonly environmentPolicy: 'inherit-host' | 'isolated';
  readonly continuousIntegrationEnvironment?: 'enabled' | 'omitted';
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly resourceGuard?: {
    readonly intervalMs: number;
    check(): void;
  };
}

export interface AdaptiveDevelopmentCodexDoctorInvocationInput {
  readonly executable: string;
  readonly codexHome: string;
  readonly model: string;
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly modelCatalogPath: string;
  readonly providerTransportTrustPath: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
}

export interface AdaptiveDevelopmentProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly elapsedMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly resourceGuardFailure?: string;
}

export const ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_DIAGNOSTIC_REPORT_VERSION =
  'lf-0001.adaptive-codex-doctor-diagnostic-report.v1' as const;

export interface AdaptiveDevelopmentCodexDoctorDiagnosticReport {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_DIAGNOSTIC_REPORT_VERSION;
  readonly process: {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly timedOut: boolean;
    readonly elapsedMs: number;
    readonly stdoutSha256: string;
    readonly stderrSha256: string;
  };
  readonly reportParsed: boolean;
  readonly overallStatus: string | null;
  readonly checks: {
    readonly providerReachability: { readonly status: string | null; readonly summary: string | null };
    readonly responsesWebsocket: { readonly status: string | null; readonly summary: string | null };
  };
  readonly rawStdoutPersisted: false;
  readonly rawStderrPersisted: false;
  readonly credentialPersisted: false;
}

export interface AdaptiveDevelopmentCodexCarrierSmokeResult {
  readonly process: AdaptiveDevelopmentProcessResult;
  readonly telemetry: AdaptiveDevelopmentCodexTelemetry;
  readonly providerRequestCount: number;
  readonly providerToolKinds: readonly string[];
  readonly providerInputItemKinds: readonly string[];
  readonly toolRoundTripCompleted: true;
  readonly controlPlaneLoopbackDenied: true;
  readonly structuredOutput: { readonly carrierReady: true };
}

export interface AdaptiveDevelopmentCodexAgentGraphCarrierSmokeResult {
  readonly process: AdaptiveDevelopmentProcessResult;
  readonly telemetry: AdaptiveDevelopmentCodexTelemetry;
  readonly graph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly independentReview: AdaptiveDevelopmentRuntimeIndependentReview;
  readonly providerRequestCount: number;
  readonly providerToolKinds: readonly string[];
  readonly structuredOutput: { readonly carrierReady: true };
}

export const ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION = 'lf-0001.adaptive-carrier-readiness.v13' as const;

export type AdaptiveDevelopmentProcessContainerRole =
  | 'executor'
  | 'reviewer'
  | 'sop-judge'
  | 'post-hoc-judge'
  | 'development-reviewer'
  | 'preflight'
  | 'post-model-freeze'
  | 'post-model-oracle';

export function adaptiveDevelopmentProcessContainerCapabilities(role: AdaptiveDevelopmentProcessContainerRole): {
  readonly writable: boolean;
  readonly allowGitMetadataWrites: boolean;
  readonly allowNetwork: boolean;
  readonly allowNestedSandbox: boolean;
  readonly allowChildProcesses: boolean;
  readonly allowInterprocessCommunication: boolean;
} {
  if (role === 'post-model-freeze') {
    return {
      writable: true,
      allowGitMetadataWrites: true,
      allowNetwork: false,
      allowNestedSandbox: false,
      allowChildProcesses: true,
      allowInterprocessCommunication: true,
    };
  }
  if (role === 'post-model-oracle') {
    return {
      writable: false,
      allowGitMetadataWrites: false,
      allowNetwork: false,
      allowNestedSandbox: false,
      allowChildProcesses: false,
      allowInterprocessCommunication: false,
    };
  }
  return {
    writable: role !== 'reviewer' && role !== 'sop-judge',
    allowGitMetadataWrites: role === 'executor',
    allowNetwork: true,
    allowNestedSandbox: false,
    allowChildProcesses: true,
    allowInterprocessCommunication: true,
  };
}

export interface AdaptiveDevelopmentCarrierRoleReadiness {
  readonly filesystemAccess: 'write' | 'read';
  readonly agentExecutionMode: AdaptiveDevelopmentAgentExecutionMode;
  readonly systemResolverSocketAccessible: true;
  readonly providerReachable: true;
  readonly websocketReachable: true;
  readonly credentialMounted: true;
  readonly credentialRemoved: true;
  readonly providerRequestCount: 2;
  readonly providerToolKinds: readonly string[];
  readonly toolRoundTripCompleted: true;
  readonly controlPlaneLoopbackDenied: true;
  readonly usage: {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
    readonly toolCalls: number;
    readonly failedToolCalls: number;
    readonly usageObserved: true;
  };
}

export interface AdaptiveDevelopmentCarrierReadinessReceipt {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION;
  readonly status: 'passed';
  readonly zeroModelProvider: true;
  readonly modelId: string;
  readonly postModelControlPlaneLoopbackDenied: true;
  readonly postModelWorkspaceReadOnly: true;
  readonly postModelPhasesIsolated: true;
  readonly postModelProcessStateIsolated: true;
  readonly postModelEnvironmentIsolated: true;
  readonly providerTransportTrust: {
    readonly trustBundleSha256: string;
    readonly executorTrustBundleAccess: 'passed';
    readonly reviewerTrustBundleAccess: 'passed';
    readonly postModelTrustBundleAccess: 'denied';
  };
  readonly roles: {
    readonly executor: AdaptiveDevelopmentCarrierRoleReadiness & {
      readonly filesystemAccess: 'write';
      readonly postModelCommit: string;
      readonly agentGraph: {
        readonly childSessionCount: 1;
        readonly accountedSessionCount: 2;
        readonly usageComplete: true;
        readonly independentReviewObserved: true;
      };
    };
    readonly reviewer: AdaptiveDevelopmentCarrierRoleReadiness & {
      readonly filesystemAccess: 'read';
    };
  };
}

export function assertAdaptiveDevelopmentCarrierReadinessReceipt(
  receipt: unknown,
): asserts receipt is AdaptiveDevelopmentCarrierReadinessReceipt {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('carrier readiness receipt is invalid');
  }
  const record = receipt as Partial<AdaptiveDevelopmentCarrierReadinessReceipt>;
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_CARRIER_READINESS_VERSION ||
    record.status !== 'passed' ||
    record.zeroModelProvider !== true ||
    record.postModelControlPlaneLoopbackDenied !== true ||
    record.postModelWorkspaceReadOnly !== true ||
    record.postModelPhasesIsolated !== true ||
    record.postModelProcessStateIsolated !== true ||
    record.postModelEnvironmentIsolated !== true ||
    typeof record.modelId !== 'string' ||
    !record.modelId ||
    !record.roles ||
    typeof record.roles !== 'object' ||
    Array.isArray(record.roles)
  ) {
    throw new Error('carrier readiness receipt does not bind every zero-model control-plane boundary');
  }
  assertAdaptiveDevelopmentProviderTransportTrust(record.providerTransportTrust);
  assertAdaptiveDevelopmentCarrierRoleReadiness(record.roles.executor, 'write');
  assertAdaptiveDevelopmentCarrierRoleReadiness(record.roles.reviewer, 'read');
  if (!/^[a-f0-9]{40}$/.test(record.roles.executor.postModelCommit)) {
    throw new Error('carrier readiness receipt does not bind the hardened post-model Git commit');
  }
  const agentGraph = record.roles.executor.agentGraph;
  if (
    !agentGraph ||
    agentGraph.childSessionCount !== 1 ||
    agentGraph.accountedSessionCount !== 2 ||
    agentGraph.usageComplete !== true ||
    agentGraph.independentReviewObserved !== true
  ) {
    throw new Error('carrier readiness receipt does not prove an exact-accounted authenticated Review child');
  }
  if ('postModelCommit' in record.roles.reviewer) {
    throw new Error('read-only carrier readiness receipt cannot claim a post-model commit');
  }
}

function assertAdaptiveDevelopmentProviderTransportTrust(
  value: unknown,
): asserts value is AdaptiveDevelopmentCarrierReadinessReceipt['providerTransportTrust'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('carrier readiness receipt is missing provider transport trust evidence');
  }
  const record = value as Partial<AdaptiveDevelopmentCarrierReadinessReceipt['providerTransportTrust']>;
  if (
    !/^[a-f0-9]{64}$/.test(record.trustBundleSha256 ?? '') ||
    record.executorTrustBundleAccess !== 'passed' ||
    record.reviewerTrustBundleAccess !== 'passed' ||
    record.postModelTrustBundleAccess !== 'denied'
  ) {
    throw new Error('carrier readiness receipt does not prove the exact provider trust bundle boundary');
  }
}

function assertAdaptiveDevelopmentCarrierRoleReadiness(
  role: unknown,
  filesystemAccess: 'write' | 'read',
): asserts role is AdaptiveDevelopmentCarrierRoleReadiness {
  if (!role || typeof role !== 'object' || Array.isArray(role)) {
    throw new Error(`carrier readiness receipt is missing the ${filesystemAccess} role`);
  }
  const record = role as Partial<AdaptiveDevelopmentCarrierRoleReadiness>;
  const agentExecutionMode = filesystemAccess === 'write' ? 'natural_agent_graph' : 'single_agent';
  if (
    record.filesystemAccess !== filesystemAccess ||
    record.agentExecutionMode !== agentExecutionMode ||
    record.systemResolverSocketAccessible !== true ||
    record.providerReachable !== true ||
    record.websocketReachable !== true ||
    record.credentialMounted !== true ||
    record.credentialRemoved !== true ||
    record.providerRequestCount !== 2 ||
    record.toolRoundTripCompleted !== true ||
    record.controlPlaneLoopbackDenied !== true ||
    !Array.isArray(record.providerToolKinds)
  ) {
    throw new Error(
      `carrier readiness receipt does not prove the ${filesystemAccess} role lifecycle, system resolver, or control-plane loopback denial`,
    );
  }
  assertAdaptiveDevelopmentCarrierToolKinds(record.providerToolKinds, agentExecutionMode);
  const usage = record.usage;
  if (
    !usage ||
    typeof usage !== 'object' ||
    Array.isArray(usage) ||
    usage.usageObserved !== true ||
    !Number.isInteger(usage.inputTokens) ||
    !Number.isInteger(usage.cachedInputTokens) ||
    !Number.isInteger(usage.outputTokens) ||
    !Number.isInteger(usage.toolCalls) ||
    !Number.isInteger(usage.failedToolCalls) ||
    usage.inputTokens < 0 ||
    usage.cachedInputTokens < 0 ||
    usage.outputTokens < 0 ||
    usage.toolCalls !== 1 ||
    usage.failedToolCalls !== 0
  ) {
    throw new Error(`carrier readiness receipt does not prove ${filesystemAccess} terminal usage`);
  }
}

export interface AdaptiveDevelopmentCodexTelemetry {
  readonly threadId?: string;
  readonly childThreadIds: readonly string[];
  readonly collaborationToolCalls: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  readonly behavioralFailedToolCalls: number;
  readonly infrastructureFailedToolCalls: number;
  readonly completed: boolean;
  readonly usageObserved: boolean;
}

export interface AdaptiveDevelopmentCodexAgentGraphObservation {
  readonly rootSessionId: string;
  readonly childSessionIds: readonly string[];
  readonly collaborationToolCalls: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  readonly behavioralFailedToolCalls: number;
  readonly infrastructureFailedToolCalls: number;
  readonly usageComplete: true;
  readonly accountedSessionIds: readonly string[];
}

export interface AdaptiveDevelopmentRuntimeIndependentReview {
  readonly source: 'authenticated_runtime_observer';
  readonly request: {
    readonly eventId: string;
    readonly authorSessionId: string;
    readonly candidateSha: string;
    readonly candidateDiffRef: string;
    readonly candidatePatchSha256: string;
  };
  readonly verdict: {
    readonly eventId: string;
    readonly requestEventId: string;
    readonly reviewerSessionId: string;
    readonly reviewerPrincipalId: string;
    readonly candidateSha: string;
    readonly candidateDiffRef: string;
    readonly candidatePatchSha256: string;
    readonly state: 'approved' | 'changes_requested';
    readonly findings: { readonly p1: number; readonly p2: number; readonly p3: number };
  };
}

export const ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_REQUEST_KIND = 'adaptive_development_formal_review_request.v1' as const;
export const ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_VERDICT_KIND = 'adaptive_development_formal_review_verdict.v1' as const;

function adaptiveDevelopmentProviderToolKinds(request: Record<string, unknown>): string[] {
  const tools: unknown[] = Array.isArray(request.tools) ? [...request.tools] : [];
  if (Array.isArray(request.input)) {
    for (const item of request.input) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as { type?: unknown; tools?: unknown };
      if (record.type === 'additional_tools' && Array.isArray(record.tools)) tools.push(...record.tools);
    }
  }
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return 'invalid';
    const record = tool as { type?: unknown; name?: unknown };
    return [record.type, record.name].filter((value): value is string => typeof value === 'string').join(':');
  });
}

export const ADAPTIVE_DEVELOPMENT_CARRIER_TOOL_KINDS = [
  'custom:exec',
  'function:wait',
  'namespace:collaboration',
] as const;

export function assertAdaptiveDevelopmentCarrierToolKinds(
  toolKinds: readonly string[],
  agentExecutionMode: AdaptiveDevelopmentAgentExecutionMode = 'single_agent',
): void {
  const expected = [...ADAPTIVE_DEVELOPMENT_CARRIER_TOOL_KINDS];
  const observed = new Set(toolKinds);
  if (
    toolKinds.length !== observed.size ||
    toolKinds.length !== expected.length ||
    expected.some((tool) => !observed.has(tool))
  ) {
    throw new Error(
      `carrier smoke provider tool contract diverged for ${agentExecutionMode}: expected ${expected.join(', ')}, observed ${toolKinds.join(', ')}`,
    );
  }
}

interface AdaptiveDevelopmentCarrierProviderState {
  requests: unknown[];
  error?: string;
}

async function handleAdaptiveDevelopmentCarrierProviderRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: AdaptiveDevelopmentCarrierProviderState,
  workingDirectory: string,
  filesystemAccess: 'write' | 'read',
  nodeExecutable: string,
  controlPlaneProbePort: number,
  agentExecutionMode: AdaptiveDevelopmentAgentExecutionMode,
): Promise<void> {
  try {
    const body = await readAdaptiveDevelopmentCarrierProviderRequest(request);
    state.requests.push(body);
    writeAdaptiveDevelopmentCarrierSmokeResponse(
      response,
      body,
      state.requests.length,
      workingDirectory,
      filesystemAccess,
      nodeExecutable,
      controlPlaneProbePort,
      agentExecutionMode,
    );
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: state.error, type: 'invalid_request_error' } }));
  }
}

async function readAdaptiveDevelopmentCarrierProviderRequest(request: IncomingMessage): Promise<unknown> {
  if (request.method !== 'POST' || request.url !== '/v1/responses') {
    throw new Error('carrier smoke provider requires POST /v1/responses');
  }
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > 1_000_000) throw new Error('carrier smoke provider request exceeded 1 MB');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function adaptiveDevelopmentCarrierRequestRecord(
  request: unknown,
  model: string,
  label: 'initial' | 'follow-up',
): Record<string, unknown> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error(`Codex carrier smoke provider received an invalid ${label} request body`);
  }
  const record = request as Record<string, unknown>;
  if (record.stream !== true || record.model !== model) {
    throw new Error(`Codex carrier smoke ${label} request did not use the expected streaming model`);
  }
  return record;
}

function assertAdaptiveDevelopmentCarrierProcess(
  processResult: AdaptiveDevelopmentProcessResult,
  providerState: AdaptiveDevelopmentCarrierProviderState,
): void {
  if (providerState.error) {
    throw new Error(`carrier smoke provider rejected the Codex request: ${providerState.error}`);
  }
  if (processResult.timedOut) throw new Error('Codex carrier smoke timed out');
  if (processResult.exitCode !== 0) {
    throw new Error(
      `Codex carrier smoke failed: ${(processResult.stderr || processResult.stdout).slice(-4_000).trim()}`,
    );
  }
  if (providerState.requests.length !== 2) {
    throw new Error(`Codex carrier smoke expected two provider requests, observed ${providerState.requests.length}`);
  }
}

function readAdaptiveDevelopmentCarrierStructuredOutput(path: string): { readonly carrierReady: true } {
  const output = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    (output as { carrierReady?: unknown }).carrierReady !== true
  ) {
    throw new Error('Codex carrier smoke did not persist the schema-bound terminal output');
  }
  return { carrierReady: true };
}

export function adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry: AdaptiveDevelopmentCodexTelemetry): boolean {
  return telemetry.completed && telemetry.usageObserved && telemetry.infrastructureFailedToolCalls === 0;
}

export interface AdaptiveDevelopmentBenchmarkArtifactStore {
  write(input: unknown): {
    readonly kind: AdaptiveDevelopmentBenchmarkArtifactKind;
    readonly uri: string;
    readonly sha256: string;
  };
}

export interface AdaptiveDevelopmentOperatorApprovalMessage {
  readonly id: string;
  readonly threadId: string;
  readonly userId: string;
  readonly catId: string | null;
  readonly content: string;
  readonly timestamp: number;
  readonly deliveryStatus?: 'queued' | 'delivered' | 'canceled';
  readonly source?: unknown;
  readonly deletedAt?: number;
  readonly _tombstone?: true;
  readonly extra?: { readonly systemKind?: string };
}

export interface AdaptiveDevelopmentOperatorApprovalResolver {
  getById(
    id: string,
  ): AdaptiveDevelopmentOperatorApprovalMessage | null | Promise<AdaptiveDevelopmentOperatorApprovalMessage | null>;
}

export interface AdaptiveDevelopmentOperatorApprovalAuthority {
  readonly kind: typeof OPERATOR_APPROVAL_AUTHORITY_KIND;
  readonly operatorUserId: typeof ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.operatorUserId;
  readonly threadId: typeof ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.threadId;
  readonly messageStoreIdentitySha256: string;
  readonly runtimeInstanceIdentitySha256: string;
}

export interface AdaptiveDevelopmentStageAttemptReservation {
  readonly schemaVersion: typeof STAGE_ATTEMPT_RESERVATION_VERSION;
  readonly reservationId: string;
  readonly launchPlanSha256: string;
  readonly launchScopeSha256: string;
  readonly stageTokenPolicy: 'unbounded';
  readonly runKey: string;
  readonly attempt: 1 | 2;
  readonly tokenPolicy: 'unbounded';
}

interface AdaptiveDevelopmentStageAttemptLedger {
  readonly schemaVersion: typeof STAGE_ATTEMPT_LEDGER_VERSION;
  readonly launchPlanSha256: string;
  readonly launchScopeSha256: string;
  readonly stageTokenPolicy: 'unbounded';
  readonly reservations: readonly AdaptiveDevelopmentStageAttemptReservation[];
}

function adaptiveDevelopmentThreadLedgerArguments(persistThreadLedger?: boolean): string[] {
  return persistThreadLedger ? [] : ['--ephemeral'];
}

export function buildAdaptiveDevelopmentCodexInvocation(
  input: AdaptiveDevelopmentCodexInvocationInput,
): AdaptiveDevelopmentCodexInvocation {
  assertAdaptiveDevelopmentProviderTransportTrustPath(input.providerTransportTrustPath);
  if (input.agentExecutionMode !== 'natural_agent_graph' && input.agentExecutionMode !== 'single_agent') {
    throw new Error('Codex invocation requires an explicit candidate or evaluation execution plane');
  }
  if (input.agentExecutionMode === 'natural_agent_graph' && input.filesystemAccess !== 'write') {
    throw new Error('natural agent graph execution requires the writable candidate plane');
  }
  const rolloutBudgetArgs = adaptiveDevelopmentRolloutBudgetArguments(input.rolloutBudget);
  const localResponsesProviderArgs = input.localResponsesProviderBaseUrl
    ? adaptiveDevelopmentLocalResponsesProviderArguments(input.localResponsesProviderBaseUrl)
    : [];
  const args = [
    'exec',
    ...adaptiveDevelopmentThreadLedgerArguments(input.persistThreadLedger),
    '--ignore-user-config',
    '--strict-config',
    '--model',
    input.model,
    '--json',
    '--output-schema',
    input.outputSchemaPath,
    '--output-last-message',
    input.outputLastMessagePath,
    '--dangerously-bypass-approvals-and-sandbox',
    '--config',
    'model_reasoning_effort="low"',
    ...rolloutBudgetArgs,
    '--config',
    `model_catalog_json=${JSON.stringify(input.modelCatalogPath)}`,
    '--config',
    'tools.experimental_request_user_input.enabled=false',
    ...localResponsesProviderArgs,
    ...adaptiveDevelopmentShellEnvironmentArguments(input),
    '--config',
    `developer_instructions=${JSON.stringify(input.developerInstructions)}`,
  ];
  if (input.skipGitRepositoryCheck) args.push('--skip-git-repo-check');
  for (const feature of ENABLED_CODEX_FEATURES) args.push('--enable', feature);
  if (input.agentExecutionMode === 'natural_agent_graph') {
    for (const feature of ADAPTIVE_DEVELOPMENT_AGENT_GRAPH_FEATURES) args.push('--enable', feature);
  }
  for (const feature of DISABLED_CODEX_FEATURES) args.push('--disable', feature);
  if (input.agentExecutionMode === 'single_agent') {
    for (const feature of ADAPTIVE_DEVELOPMENT_AGENT_GRAPH_FEATURES) args.push('--disable', feature);
  }
  args.push('-');
  return {
    command: input.processContainer.sandboxExecutable,
    args: ['-f', input.processContainer.sandboxProfilePath, input.executable, ...args],
    cwd: input.workingDirectory,
    prompt: input.prompt,
    environmentPolicy: 'inherit-host',
    env: {
      CODEX_HOME: input.codexHome,
      ...adaptiveDevelopmentProviderTransportEnvironment(input.providerTransportTrustPath),
      ...(input.localResponsesProviderBaseUrl
        ? { [ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_API_KEY_ENV]: 'local-zero-cost-provider' }
        : {}),
    },
  };
}

function adaptiveDevelopmentRolloutBudgetArguments(
  rolloutBudget: AdaptiveDevelopmentCodexInvocationInput['rolloutBudget'],
): readonly string[] {
  if (!rolloutBudget || typeof rolloutBudget !== 'object') {
    throw new Error('Codex rollout budget policy is required');
  }
  const keys = Object.keys(rolloutBudget).sort().join(',');
  if (rolloutBudget.kind === 'unbounded') {
    if (keys !== 'kind') throw new Error('Codex unbounded rollout budget must contain only the explicit policy');
    return [];
  }
  if (rolloutBudget.kind !== 'capped' || keys !== 'kind,reminderAtRemainingTokens,tokenCap') {
    throw new Error('Codex capped rollout budget must contain the exact policy fields');
  }
  if (!Number.isInteger(rolloutBudget.tokenCap) || rolloutBudget.tokenCap <= 0) {
    throw new Error('Codex token cap must be positive');
  }
  if (
    !Number.isInteger(rolloutBudget.reminderAtRemainingTokens) ||
    rolloutBudget.reminderAtRemainingTokens <= 0 ||
    rolloutBudget.reminderAtRemainingTokens >= rolloutBudget.tokenCap
  ) {
    throw new Error('Codex rollout reminder must be positive and below the token cap');
  }
  return [
    '--config',
    `features.rollout_budget={enabled=true,limit_tokens=${rolloutBudget.tokenCap},reminder_at_remaining_tokens=[${rolloutBudget.reminderAtRemainingTokens}],sampling_token_weight=1.0,prefill_token_weight=1.0}`,
  ];
}

export function buildAdaptiveDevelopmentCodexDoctorInvocation(
  input: AdaptiveDevelopmentCodexDoctorInvocationInput,
): AdaptiveDevelopmentCodexInvocation {
  assertAdaptiveDevelopmentProviderTransportTrustPath(input.providerTransportTrustPath);
  return {
    command: input.processContainer.sandboxExecutable,
    args: [
      '-f',
      input.processContainer.sandboxProfilePath,
      input.executable,
      'doctor',
      '--json',
      '--no-color',
      '--disable',
      'remote_models',
      '--config',
      `model_catalog_json=${JSON.stringify(input.modelCatalogPath)}`,
      '--config',
      `model=${JSON.stringify(input.model)}`,
      '--config',
      'model_provider="openai"',
    ],
    cwd: input.workingDirectory,
    prompt: '',
    environmentPolicy: 'isolated',
    continuousIntegrationEnvironment: 'omitted',
    env: {
      ...buildAdaptiveDevelopmentLocalToolEnvironment(input),
      CODEX_HOME: input.codexHome,
      ...adaptiveDevelopmentProviderTransportEnvironment(input.providerTransportTrustPath),
    },
  };
}

const ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_SAFE_STATUSES = new Set(['ok', 'warning', 'error', 'skipped']);
const ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_SAFE_SUMMARIES = new Set([
  'Provider endpoint is reachable',
  'active provider endpoints are reachable over HTTP',
  'Responses WebSocket handshake succeeded',
  'WebSocket probe was skipped',
]);
const ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_UNRECOGNIZED_TEXT = '[REDACTED_UNRECOGNIZED]' as const;

function adaptiveDevelopmentCodexDoctorAllowlistedText(
  value: unknown,
  allowlist: ReadonlySet<string>,
): string | null {
  if (typeof value !== 'string') return null;
  return allowlist.has(value) ? value : ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_UNRECOGNIZED_TEXT;
}

function adaptiveDevelopmentCodexDoctorDiagnosticCheck(
  report: Readonly<Record<string, unknown>> | null,
  checkId: string,
): { readonly status: string | null; readonly summary: string | null } {
  const checks = report?.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return { status: null, summary: null };
  const check = (checks as Readonly<Record<string, unknown>>)[checkId];
  if (!check || typeof check !== 'object' || Array.isArray(check)) return { status: null, summary: null };
  const diagnostic = check as Readonly<Record<string, unknown>>;
  return {
    status: adaptiveDevelopmentCodexDoctorAllowlistedText(
      diagnostic.status,
      ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_SAFE_STATUSES,
    ),
    summary: adaptiveDevelopmentCodexDoctorAllowlistedText(
      diagnostic.summary,
      ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_SAFE_SUMMARIES,
    ),
  };
}

export function buildAdaptiveDevelopmentCodexDoctorDiagnosticReport(
  processResult: AdaptiveDevelopmentProcessResult,
): AdaptiveDevelopmentCodexDoctorDiagnosticReport {
  let report: Readonly<Record<string, unknown>> | null = null;
  try {
    const parsed: unknown = JSON.parse(processResult.stdout);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      report = parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    // The process metadata and digests remain useful even when Codex emits malformed JSON.
  }
  return {
    schemaVersion: ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_DIAGNOSTIC_REPORT_VERSION,
    process: {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      elapsedMs: processResult.elapsedMs,
      stdoutSha256: createHash('sha256').update(processResult.stdout).digest('hex'),
      stderrSha256: createHash('sha256').update(processResult.stderr).digest('hex'),
    },
    reportParsed: report !== null,
    overallStatus: adaptiveDevelopmentCodexDoctorAllowlistedText(
      report?.overallStatus,
      ADAPTIVE_DEVELOPMENT_CODEX_DOCTOR_SAFE_STATUSES,
    ),
    checks: {
      providerReachability: adaptiveDevelopmentCodexDoctorDiagnosticCheck(
        report,
        'network.provider_reachability',
      ),
      responsesWebsocket: adaptiveDevelopmentCodexDoctorDiagnosticCheck(
        report,
        'network.websocket_reachability',
      ),
    },
    rawStdoutPersisted: false,
    rawStderrPersisted: false,
    credentialPersisted: false,
  };
}

export function writeAdaptiveDevelopmentCodexDoctorDiagnosticReport(
  path: string,
  processResult: AdaptiveDevelopmentProcessResult,
): AdaptiveDevelopmentCodexDoctorDiagnosticReport {
  const report = buildAdaptiveDevelopmentCodexDoctorDiagnosticReport(processResult);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    linkSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return report;
}

export function assertAdaptiveDevelopmentCodexDoctorProviderTransport(
  processResult: AdaptiveDevelopmentProcessResult,
): { readonly providerReachable: true; readonly websocketReachable: true } {
  if (processResult.timedOut) throw new Error('Codex doctor provider transport probe timed out');
  if (processResult.signal !== null || (processResult.exitCode !== 0 && processResult.exitCode !== 1)) {
    throw new Error('Codex doctor provider transport probe did not return a diagnostic report');
  }
  let report: unknown;
  try {
    report = JSON.parse(processResult.stdout);
  } catch {
    throw new Error('Codex doctor provider transport probe did not return valid JSON');
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Codex doctor provider transport report is invalid');
  }
  const checks = (report as { checks?: unknown }).checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    throw new Error('Codex doctor provider transport report is missing checks');
  }
  const provider = (checks as Record<string, unknown>)['network.provider_reachability'];
  const websocket = (checks as Record<string, unknown>)['network.websocket_reachability'];
  if (
    !provider ||
    typeof provider !== 'object' ||
    Array.isArray(provider) ||
    (provider as { status?: unknown }).status !== 'ok'
  ) {
    throw new Error('Codex doctor did not prove the provider endpoint reachable');
  }
  if (
    !websocket ||
    typeof websocket !== 'object' ||
    Array.isArray(websocket) ||
    (websocket as { status?: unknown }).status !== 'ok' ||
    (websocket as { summary?: unknown }).summary !== 'Responses WebSocket handshake succeeded'
  ) {
    throw new Error('Codex doctor did not perform a successful Responses WebSocket handshake');
  }
  return { providerReachable: true, websocketReachable: true };
}

function adaptiveDevelopmentLocalResponsesProviderArguments(baseUrl: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('carrier smoke requires a valid loopback Responses provider URL');
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/v1' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('carrier smoke requires an exact http://127.0.0.1:<port>/v1 loopback Responses provider');
  }
  return [
    '--config',
    `model_provider=${JSON.stringify(ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER)}`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.base_url=${JSON.stringify(parsed.href)}`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.name="Adaptive carrier smoke"`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.wire_api="responses"`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.env_key=${JSON.stringify(ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_API_KEY_ENV)}`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.requires_openai_auth=false`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.request_max_retries=0`,
    '--config',
    `model_providers.${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_PROVIDER}.stream_max_retries=0`,
  ];
}

export async function runAdaptiveDevelopmentCodexCarrierSmoke(input: {
  readonly invocation: Omit<AdaptiveDevelopmentCodexInvocationInput, 'localResponsesProviderBaseUrl'>;
  readonly deadlineEpochMs: number;
}): Promise<AdaptiveDevelopmentCodexCarrierSmokeResult> {
  const providerState: AdaptiveDevelopmentCarrierProviderState = { requests: [] };
  const toolMarkerPath = join(input.invocation.workingDirectory, ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_MARKER);
  assertAdaptiveDevelopmentCarrierMarkerPrecondition(input.invocation.filesystemAccess, toolMarkerPath);
  const controlPlaneProbe = await startAdaptiveDevelopmentControlPlaneProbe();
  const server = createServer((request, response) => {
    void handleAdaptiveDevelopmentCarrierProviderRequest(
      request,
      response,
      providerState,
      input.invocation.workingDirectory,
      input.invocation.filesystemAccess,
      input.invocation.nodeExecutable,
      controlPlaneProbe.port,
      input.invocation.agentExecutionMode,
    );
  });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolvePromise());
    });
    const address = server.address() as AddressInfo | null;
    if (!address || typeof address === 'string') throw new Error('carrier smoke provider did not bind a TCP port');
    const processResult = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexInvocation({
        ...input.invocation,
        localResponsesProviderBaseUrl: `http://127.0.0.1:${address.port}/v1`,
      }),
      input.deadlineEpochMs,
    );
    assertAdaptiveDevelopmentCarrierProcess(processResult, providerState);
    const requestRecord = adaptiveDevelopmentCarrierRequestRecord(
      providerState.requests[0],
      input.invocation.model,
      'initial',
    );
    const followUpRequest = adaptiveDevelopmentCarrierRequestRecord(
      providerState.requests[1],
      input.invocation.model,
      'follow-up',
    );
    const toolOutput = adaptiveDevelopmentCarrierToolOutput(followUpRequest);
    if (toolOutput === undefined) {
      throw new Error('Codex carrier smoke did not return the custom exec output to the provider');
    }
    assertAdaptiveDevelopmentCarrierSmokeProof({
      filesystemAccess: input.invocation.filesystemAccess,
      toolOutput,
      toolMarkerPath,
      controlPlaneProbeConnections: controlPlaneProbe.connectionCount(),
    });
    const telemetry = parseAdaptiveDevelopmentCodexTelemetry(processResult.stdout);
    if (!adaptiveDevelopmentCodexTelemetryIsSuccessful(telemetry)) {
      throw new Error('Codex carrier smoke did not produce trustworthy terminal usage');
    }
    const structuredOutput = readAdaptiveDevelopmentCarrierStructuredOutput(input.invocation.outputLastMessagePath);
    return {
      process: processResult,
      telemetry,
      providerRequestCount: providerState.requests.length,
      providerToolKinds: adaptiveDevelopmentProviderToolKinds(requestRecord),
      providerInputItemKinds: Array.isArray(requestRecord.input)
        ? requestRecord.input.map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return 'invalid';
            const record = item as { type?: unknown; role?: unknown };
            return [record.type, record.role].filter((value): value is string => typeof value === 'string').join(':');
          })
        : [],
      toolRoundTripCompleted: true,
      controlPlaneLoopbackDenied: true,
      structuredOutput,
    };
  } finally {
    await Promise.all([closeAdaptiveDevelopmentListener(server), controlPlaneProbe.close()]);
  }
}

function adaptiveDevelopmentFunctionOutput(request: Record<string, unknown>, callId: string): string | undefined {
  if (!Array.isArray(request.input)) return undefined;
  for (const item of request.input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== 'function_call_output' || record.call_id !== callId) continue;
    return typeof record.output === 'string' ? record.output : JSON.stringify(record.output);
  }
  return undefined;
}

function writeAdaptiveDevelopmentGraphFunctionCall(
  response: ServerResponse,
  body: Record<string, unknown>,
  callId: string,
  name: string,
  argumentsValue: Record<string, unknown>,
  usage: { readonly input: number; readonly output: number },
): void {
  const createdAt = Math.floor(Date.now() / 1_000);
  const responseId = `resp_${callId}`;
  const itemId = `fc_${callId}`;
  const argumentsText = JSON.stringify(argumentsValue);
  const base = {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: body.model,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 1,
    text: body.text ?? { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: Array.isArray(body.tools) ? body.tools : [],
    top_p: 1,
    truncation: 'disabled',
    user: null,
    metadata: {},
  };
  const inProgress = { ...base, status: 'in_progress', output: [], usage: null };
  const call = {
    id: itemId,
    type: 'function_call',
    status: 'completed',
    call_id: callId,
    namespace: 'collaboration',
    name,
    arguments: argumentsText,
  };
  writeAdaptiveDevelopmentCarrierSmokeEvents(response, [
    { type: 'response.created', response: inProgress },
    { type: 'response.in_progress', response: inProgress },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...call, status: 'in_progress', arguments: '' },
    },
    {
      type: 'response.function_call_arguments.delta',
      item_id: itemId,
      output_index: 0,
      delta: argumentsText,
    },
    {
      type: 'response.function_call_arguments.done',
      item_id: itemId,
      output_index: 0,
      arguments: argumentsText,
    },
    { type: 'response.output_item.done', output_index: 0, item: call },
    {
      type: 'response.completed',
      response: {
        ...base,
        status: 'completed',
        completed_at: createdAt,
        output: [call],
        usage: {
          input_tokens: usage.input,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: usage.output,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: usage.input + usage.output,
        },
      },
    },
  ]);
}

function writeAdaptiveDevelopmentGraphMessage(
  response: ServerResponse,
  body: Record<string, unknown>,
  textValue: string,
  label: string,
  usage: { readonly input: number; readonly output: number },
): void {
  const createdAt = Math.floor(Date.now() / 1_000);
  const responseId = `resp_adaptive_graph_${label}`;
  const messageId = `msg_adaptive_graph_${label}`;
  const base = {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: body.model,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 1,
    text: body.text ?? { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: Array.isArray(body.tools) ? body.tools : [],
    top_p: 1,
    truncation: 'disabled',
    user: null,
    metadata: {},
  };
  const inProgress = { ...base, status: 'in_progress', output: [], usage: null };
  const message = {
    id: messageId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: textValue, annotations: [] }],
  };
  writeAdaptiveDevelopmentCarrierSmokeEvents(response, [
    { type: 'response.created', response: inProgress },
    { type: 'response.in_progress', response: inProgress },
    { type: 'response.output_item.done', output_index: 0, item: message },
    {
      type: 'response.completed',
      response: {
        ...base,
        status: 'completed',
        completed_at: createdAt,
        output: [message],
        usage: {
          input_tokens: usage.input,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: usage.output,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: usage.input + usage.output,
        },
      },
    },
  ]);
}

async function handleAdaptiveDevelopmentGraphCarrierRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: AdaptiveDevelopmentCarrierProviderState,
): Promise<void> {
  try {
    const value = await readAdaptiveDevelopmentCarrierProviderRequest(request);
    const body = adaptiveDevelopmentCarrierRequestRecord(
      value,
      (value as Record<string, unknown>).model as string,
      'initial',
    );
    state.requests.push(body);
    const serializedInput = JSON.stringify(body.input ?? []);
    const spawnOutput = adaptiveDevelopmentFunctionOutput(body, ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_SPAWN_CALL_ID);
    const waitOutput = adaptiveDevelopmentFunctionOutput(body, ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_WAIT_CALL_ID);
    const reviewRequest = JSON.stringify({
      kind: ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_REQUEST_KIND,
      candidateSha: '1'.repeat(40),
      candidateDiffRef: `${'0'.repeat(40)}..${'1'.repeat(40)}`,
      candidatePatchSha256: '2'.repeat(64),
    });
    const reviewVerdict = JSON.stringify({
      kind: ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_VERDICT_KIND,
      candidateSha: '1'.repeat(40),
      candidateDiffRef: `${'0'.repeat(40)}..${'1'.repeat(40)}`,
      candidatePatchSha256: '2'.repeat(64),
      state: 'approved',
      findings: { p1: 0, p2: 0, p3: 0 },
    });
    if (serializedInput.includes(ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_ROOT_PROMPT) && !spawnOutput && !waitOutput) {
      assertAdaptiveDevelopmentCarrierToolKinds(adaptiveDevelopmentProviderToolKinds(body), 'natural_agent_graph');
      writeAdaptiveDevelopmentGraphFunctionCall(
        response,
        body,
        ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_SPAWN_CALL_ID,
        'spawn_agent',
        { message: reviewRequest, task_name: 'runtime_review', fork_turns: 'none' },
        { input: 5, output: 3 },
      );
      return;
    }
    if ((serializedInput.includes(reviewRequest) || serializedInput.includes('/root/runtime_review')) && !spawnOutput) {
      writeAdaptiveDevelopmentGraphMessage(response, body, reviewVerdict, 'child', { input: 7, output: 4 });
      return;
    }
    if (spawnOutput && !waitOutput) {
      writeAdaptiveDevelopmentGraphFunctionCall(
        response,
        body,
        ADAPTIVE_DEVELOPMENT_GRAPH_SMOKE_WAIT_CALL_ID,
        'wait_agent',
        { timeout_ms: 10_000 },
        { input: 11, output: 5 },
      );
      return;
    }
    if (waitOutput) {
      writeAdaptiveDevelopmentGraphMessage(response, body, '{"carrierReady":true}', 'root', { input: 13, output: 6 });
      return;
    }
    throw new Error(
      `agent graph carrier provider received an unrecognized request state: ${serializedInput.slice(-2_000)}`,
    );
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: state.error, type: 'invalid_request_error' } }));
  }
}

export async function runAdaptiveDevelopmentCodexAgentGraphCarrierSmoke(input: {
  readonly invocation: Omit<AdaptiveDevelopmentCodexInvocationInput, 'localResponsesProviderBaseUrl'>;
  readonly deadlineEpochMs: number;
}): Promise<AdaptiveDevelopmentCodexAgentGraphCarrierSmokeResult> {
  if (input.invocation.agentExecutionMode !== 'natural_agent_graph') {
    throw new Error('agent graph carrier smoke requires the natural agent execution plane');
  }
  const providerState: AdaptiveDevelopmentCarrierProviderState = { requests: [] };
  const server = createServer((request, response) => {
    void handleAdaptiveDevelopmentGraphCarrierRequest(request, response, providerState);
  });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolvePromise());
    });
    const address = server.address() as AddressInfo | null;
    if (!address || typeof address === 'string') throw new Error('agent graph carrier provider did not bind a port');
    const processResult = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexInvocation({
        ...input.invocation,
        localResponsesProviderBaseUrl: `http://127.0.0.1:${address.port}/v1`,
        persistThreadLedger: true,
      }),
      input.deadlineEpochMs,
    );
    if (providerState.error) throw new Error(`agent graph carrier provider failed: ${providerState.error}`);
    if (processResult.timedOut || processResult.exitCode !== 0) {
      throw new Error(`agent graph carrier failed: ${(processResult.stderr || processResult.stdout).slice(-4_000)}`);
    }
    const telemetry = parseAdaptiveDevelopmentCodexTelemetry(processResult.stdout);
    const graph = observeAdaptiveDevelopmentCodexAgentGraph({
      codexHome: input.invocation.codexHome,
      rootTelemetry: telemetry,
    });
    if (graph.childSessionIds.length !== 1 || graph.accountedSessionIds.length !== 2) {
      throw new Error('agent graph carrier did not prove one exactly-accounted child');
    }
    const independentReview = observeAdaptiveDevelopmentRuntimeIndependentReview({
      executorJsonl: processResult.stdout,
      graph,
      codexHome: input.invocation.codexHome,
      candidate: {
        finalSha: '1'.repeat(40),
        diffRef: `${'0'.repeat(40)}..${'1'.repeat(40)}`,
        patchSha256: '2'.repeat(64),
      },
    });
    if (!independentReview || independentReview.verdict.state !== 'approved') {
      throw new Error('agent graph carrier did not produce an authenticated exact-bound Review verdict');
    }
    return {
      process: processResult,
      telemetry,
      graph,
      independentReview,
      providerRequestCount: providerState.requests.length,
      providerToolKinds: adaptiveDevelopmentProviderToolKinds(providerState.requests[0] as Record<string, unknown>),
      structuredOutput: readAdaptiveDevelopmentCarrierStructuredOutput(input.invocation.outputLastMessagePath),
    };
  } finally {
    await closeAdaptiveDevelopmentListener(server);
  }
}

export async function runAdaptiveDevelopmentPostModelNetworkProbe(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const controlPlaneProbe = await startAdaptiveDevelopmentControlPlaneProbe();
  try {
    const probeScript = [
      `const { createConnection } = require('node:net');`,
      `const socket = createConnection({ host: '127.0.0.1', port: ${controlPlaneProbe.port} });`,
      `const timer = setTimeout(() => { socket.destroy(); process.exit(92); }, 3000);`,
      `socket.once('connect', () => { clearTimeout(timer); socket.destroy(); process.exit(91); });`,
      `socket.once('error', () => { clearTimeout(timer); process.stdout.write(${JSON.stringify(ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER)}); });`,
    ].join(' ');
    const result = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable,
        processContainer: input.processContainer,
        command: input.nodeExecutable,
        args: ['-e', probeScript],
      }),
      input.deadlineEpochMs,
    );
    if (
      result.timedOut ||
      result.exitCode !== 0 ||
      result.stdout !== ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER ||
      controlPlaneProbe.connectionCount() !== 0
    ) {
      throw new Error('post-model runtime can reach the control-plane loopback listener');
    }
    return true;
  } finally {
    await controlPlaneProbe.close();
  }
}

export async function runAdaptiveDevelopmentSystemResolverSocketProbe(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const probeScript = [
    `const { createConnection } = require('node:net');`,
    `const socket = createConnection({ path: ${JSON.stringify(MACOS_SYSTEM_RESOLVER_SOCKET_ALIAS)} });`,
    `const timer = setTimeout(() => { socket.destroy(); process.exit(92); }, 3000);`,
    `socket.once('connect', () => { clearTimeout(timer); socket.destroy(); process.stdout.write(${JSON.stringify(ADAPTIVE_DEVELOPMENT_SYSTEM_RESOLVER_READY_MARKER)}); });`,
    `socket.once('error', () => { clearTimeout(timer); process.exit(91); });`,
  ].join(' ');
  const result = await runAdaptiveDevelopmentProcess(
    buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
      workingDirectory: input.workingDirectory,
      nodeExecutable: input.nodeExecutable,
      processContainer: input.processContainer,
      command: input.nodeExecutable,
      args: ['-e', probeScript],
    }),
    input.deadlineEpochMs,
  );
  if (result.timedOut || result.exitCode !== 0 || result.stdout !== ADAPTIVE_DEVELOPMENT_SYSTEM_RESOLVER_READY_MARKER) {
    throw new Error('network-enabled runtime cannot reach the macOS system resolver socket');
  }
  return true;
}

export async function runAdaptiveDevelopmentPostModelWorkspaceWriteProbe(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly probePath: string;
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const original = readFileSync(input.probePath);
  const result = await runAdaptiveDevelopmentProcess(
    buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
      workingDirectory: input.workingDirectory,
      nodeExecutable: input.nodeExecutable,
      processContainer: input.processContainer,
      command: input.nodeExecutable,
      args: [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1], 'post-model-oracle-mutated\\n')",
        input.probePath,
      ],
    }),
    input.deadlineEpochMs,
  );
  if (result.timedOut || result.exitCode === 0 || !readFileSync(input.probePath).equals(original)) {
    throw new Error('post-model oracle runtime can mutate the frozen workspace');
  }
  return true;
}

export async function runAdaptiveDevelopmentPostModelPhaseIsolationProbe(input: {
  readonly sourcePhase: {
    readonly workingDirectory: string;
    readonly nodeExecutable: string;
    readonly processContainer: {
      readonly sandboxExecutable: string;
      readonly sandboxProfilePath: string;
    };
  };
  readonly destinationPhase: {
    readonly workingDirectory: string;
    readonly nodeExecutable: string;
    readonly processContainer: {
      readonly sandboxExecutable: string;
      readonly sandboxProfilePath: string;
    };
  };
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const markerPath = join(adaptiveDevelopmentToolTemporaryDirectory(input.sourcePhase), 'oracle-phase-handoff.json');
  if (existsSync(markerPath)) throw new Error('post-model phase isolation probe requires an absent marker');
  try {
    const writer = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.sourcePhase.workingDirectory,
        nodeExecutable: input.sourcePhase.nodeExecutable,
        processContainer: input.sourcePhase.processContainer,
        command: input.sourcePhase.nodeExecutable,
        args: ['-e', 'require(\'node:fs\').writeFileSync(process.argv[1], \'{"phase":"source"}\\n\')', markerPath],
      }),
      input.deadlineEpochMs,
    );
    if (
      writer.timedOut ||
      writer.exitCode !== 0 ||
      !existsSync(markerPath) ||
      readFileSync(markerPath, 'utf8') !== '{"phase":"source"}\n'
    ) {
      throw new Error('post-model source phase cannot create its isolated temporary marker');
    }
    const reader = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.destinationPhase.workingDirectory,
        nodeExecutable: input.destinationPhase.nodeExecutable,
        processContainer: input.destinationPhase.processContainer,
        command: input.destinationPhase.nodeExecutable,
        args: [
          '-e',
          [
            "const fs=require('node:fs');",
            "try{fs.readFileSync(process.argv[1]);process.stdout.write('READABLE');process.exit(91);}",
            "catch{process.stdout.write('post-model-phases-isolated');}",
          ].join(''),
          markerPath,
        ],
      }),
      input.deadlineEpochMs,
    );
    if (reader.timedOut || reader.exitCode !== 0 || reader.stdout !== 'post-model-phases-isolated') {
      throw new Error('one post-model oracle phase can read another phase temporary state');
    }
    return true;
  } finally {
    if (existsSync(markerPath)) unlinkSync(markerPath);
  }
}

export async function runAdaptiveDevelopmentPostModelProcessIsolationProbe(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const result = await runAdaptiveDevelopmentProcess(
    buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
      workingDirectory: input.workingDirectory,
      nodeExecutable: input.nodeExecutable,
      processContainer: input.processContainer,
      command: input.nodeExecutable,
      args: [
        '-e',
        [
          "const {execFileSync,spawnSync}=require('node:child_process');",
          "const child=spawnSync('/usr/bin/true',[],{stdio:'ignore'});",
          "let processListing;try{execFileSync('/bin/ps',['-axo','command='],{stdio:'ignore'});processListing='ALLOWED';}catch(error){processListing=error?.code;}",
          'process.stdout.write(JSON.stringify({status:child.status,error:child.error?.code,processListing}));',
        ].join(''),
      ],
    }),
    input.deadlineEpochMs,
  );
  if (
    result.timedOut ||
    result.exitCode !== 0 ||
    result.stdout !== '{"status":null,"error":"EPERM","processListing":"EPERM"}'
  ) {
    throw new Error('post-model oracle runtime can create retained process state');
  }
  return true;
}

export async function runAdaptiveDevelopmentPostModelEnvironmentIsolationProbe(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer: {
    readonly sandboxExecutable: string;
    readonly sandboxProfilePath: string;
  };
  readonly deadlineEpochMs: number;
}): Promise<true> {
  const sentinelKey = 'ADAPTIVE_DEVELOPMENT_READINESS_HOST_SENTINEL';
  const previousSentinel = process.env[sentinelKey];
  process.env[sentinelKey] = 'host-secret-shape';
  try {
    const result = await runAdaptiveDevelopmentProcess(
      buildAdaptiveDevelopmentCodexSandboxProbeInvocation({
        workingDirectory: input.workingDirectory,
        nodeExecutable: input.nodeExecutable,
        processContainer: input.processContainer,
        command: input.nodeExecutable,
        args: [
          '-e',
          `if(Object.prototype.hasOwnProperty.call(process.env,${JSON.stringify(sentinelKey)})){process.exit(91)}process.stdout.write('post-model-environment-isolated')`,
        ],
      }),
      input.deadlineEpochMs,
    );
    if (result.timedOut || result.exitCode !== 0 || result.stdout !== 'post-model-environment-isolated') {
      throw new Error('post-model oracle runtime inherits the host process environment');
    }
    return true;
  } finally {
    if (previousSentinel === undefined) delete process.env[sentinelKey];
    else process.env[sentinelKey] = previousSentinel;
  }
}

function assertAdaptiveDevelopmentCarrierMarkerPrecondition(
  filesystemAccess: 'write' | 'read',
  toolMarkerPath: string,
): void {
  if (filesystemAccess === 'write') {
    if (existsSync(toolMarkerPath)) throw new Error('writable Codex carrier smoke requires an absent tool marker');
    return;
  }
  if (!existsSync(toolMarkerPath) || readFileSync(toolMarkerPath, 'utf8') !== 'carrier-ready\n') {
    throw new Error('read-only Codex carrier smoke requires a frozen tool marker');
  }
}

function assertAdaptiveDevelopmentCarrierSmokeProof(input: {
  readonly filesystemAccess: 'write' | 'read';
  readonly toolOutput: string;
  readonly toolMarkerPath: string;
  readonly controlPlaneProbeConnections: number;
}): void {
  const expectedToolOutput =
    input.filesystemAccess === 'read'
      ? `${ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER}\ncarrier-ready\n`
      : ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER;
  if (input.toolOutput !== expectedToolOutput) {
    throw new Error(
      `Codex carrier smoke did not prove control-plane loopback denial: expected ${JSON.stringify(expectedToolOutput)}, received ${JSON.stringify(input.toolOutput)}`,
    );
  }
  if (input.controlPlaneProbeConnections !== 0) {
    throw new Error('Codex carrier smoke command reached the control-plane loopback listener');
  }
  if (!existsSync(input.toolMarkerPath) || readFileSync(input.toolMarkerPath, 'utf8') !== 'carrier-ready\n') {
    throw new Error(
      `Codex carrier smoke custom exec did not create the expected workspace marker: ${input.toolOutput.slice(-1_000)}`,
    );
  }
}

async function startAdaptiveDevelopmentControlPlaneProbe(): Promise<{
  readonly port: number;
  readonly connectionCount: () => number;
  readonly close: () => Promise<void>;
}> {
  let connections = 0;
  const server = createTcpServer((socket) => {
    connections += 1;
    socket.end();
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    await closeAdaptiveDevelopmentListener(server);
    throw new Error('carrier smoke control-plane probe did not bind a TCP port');
  }
  await new Promise<void>((resolvePromise, reject) => {
    const client = createConnection({ host: '127.0.0.1', port: address.port });
    const onConnection = () => {
      client.destroy();
      resolvePromise();
    };
    server.once('connection', onConnection);
    client.once('error', (error) => {
      server.off('connection', onConnection);
      reject(error);
    });
  });
  connections = 0;
  return {
    port: address.port,
    connectionCount: () => connections,
    close: () => closeAdaptiveDevelopmentListener(server),
  };
}

function closeAdaptiveDevelopmentListener(server: {
  readonly listening: boolean;
  readonly close: (callback: (error?: Error) => void) => unknown;
}): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

function adaptiveDevelopmentCarrierToolOutput(request: Record<string, unknown>): string | undefined {
  if (!Array.isArray(request.input)) return undefined;
  for (const item of request.input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as { type?: unknown; call_id?: unknown; output?: unknown };
    if (record.type !== 'custom_tool_call_output' || record.call_id !== ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_CALL_ID) {
      continue;
    }
    return adaptiveDevelopmentCarrierToolOutputValue(record.output);
  }
  return undefined;
}

function adaptiveDevelopmentCarrierToolOutputValue(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (!Array.isArray(output) || output.length !== 2) return undefined;
  const summary = adaptiveDevelopmentCarrierInputText(output[0]);
  const proof = adaptiveDevelopmentCarrierInputText(output[1]);
  if (!summary?.startsWith('Script completed\n')) return undefined;
  return proof;
}

function adaptiveDevelopmentCarrierInputText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as { type?: unknown; text?: unknown };
  if (record.type !== 'input_text' || typeof record.text !== 'string') return undefined;
  return record.text;
}

function adaptiveDevelopmentHasCarrierToolOutput(request: Record<string, unknown>): boolean {
  return adaptiveDevelopmentCarrierToolOutput(request) !== undefined;
}

function writeAdaptiveDevelopmentCarrierSmokeResponse(
  response: ServerResponse,
  request: unknown,
  requestIndex: number,
  workingDirectory: string,
  filesystemAccess: 'write' | 'read',
  nodeExecutable: string,
  controlPlaneProbePort: number,
  agentExecutionMode: AdaptiveDevelopmentAgentExecutionMode,
): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('carrier smoke provider requires a JSON object request');
  }
  const body = request as Record<string, unknown>;
  if (body.stream !== true || typeof body.model !== 'string' || body.model.length === 0) {
    throw new Error('carrier smoke provider requires a streaming model request');
  }
  if (requestIndex !== 1 && requestIndex !== 2) throw new Error('carrier smoke provider received an extra request');
  const responseId = `resp_adaptive_carrier_smoke_${requestIndex}`;
  const outputText = '{"carrierReady":true}';
  const createdAt = Math.floor(Date.now() / 1_000);
  const responseBase = {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: body.model,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 1,
    text: body.text ?? { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: Array.isArray(body.tools) ? body.tools : [],
    top_p: 1,
    truncation: 'disabled',
    user: null,
    metadata: {},
  };
  const inProgressResponse = { ...responseBase, status: 'in_progress', output: [], usage: null };
  if (requestIndex === 1) {
    assertAdaptiveDevelopmentCarrierToolKinds(adaptiveDevelopmentProviderToolKinds(body), agentExecutionMode);
    const toolItemId = 'ctc_adaptive_carrier_smoke';
    const toolInput = buildAdaptiveDevelopmentCarrierSmokeToolInput({
      workingDirectory,
      filesystemAccess,
      nodeExecutable,
      controlPlaneProbePort,
    });
    const toolCall = {
      id: toolItemId,
      type: 'custom_tool_call',
      call_id: ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_CALL_ID,
      name: 'exec',
      input: toolInput,
    };
    const completedResponse = {
      ...responseBase,
      status: 'completed',
      completed_at: createdAt,
      output: [toolCall],
      usage: {
        input_tokens: 5,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 8,
      },
    };
    writeAdaptiveDevelopmentCarrierSmokeEvents(response, [
      { type: 'response.created', response: inProgressResponse },
      { type: 'response.in_progress', response: inProgressResponse },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...toolCall, input: '' },
      },
      {
        type: 'response.custom_tool_call_input.delta',
        item_id: toolItemId,
        output_index: 0,
        delta: toolInput,
      },
      {
        type: 'response.custom_tool_call_input.done',
        item_id: toolItemId,
        output_index: 0,
        input: toolInput,
      },
      { type: 'response.output_item.done', output_index: 0, item: toolCall },
      { type: 'response.completed', response: completedResponse },
    ]);
    return;
  }
  if (!adaptiveDevelopmentHasCarrierToolOutput(body)) {
    throw new Error('carrier smoke provider requires the custom exec output before terminal output');
  }
  const messageId = 'msg_adaptive_carrier_smoke';
  const message = {
    id: messageId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: outputText, annotations: [] }],
  };
  const completedResponse = {
    ...responseBase,
    status: 'completed',
    completed_at: createdAt,
    output: [message],
    usage: {
      input_tokens: 11,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 18,
    },
  };
  const events = [
    { type: 'response.created', response: inProgressResponse },
    { type: 'response.in_progress', response: inProgressResponse },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { id: messageId, type: 'message', status: 'in_progress', role: 'assistant', content: [] },
    },
    {
      type: 'response.content_part.added',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    },
    {
      type: 'response.output_text.delta',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      delta: outputText,
    },
    {
      type: 'response.output_text.done',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    },
    {
      type: 'response.content_part.done',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: outputText, annotations: [] },
    },
    { type: 'response.output_item.done', output_index: 0, item: message },
    { type: 'response.completed', response: completedResponse },
  ];
  writeAdaptiveDevelopmentCarrierSmokeEvents(response, events);
}

function buildAdaptiveDevelopmentCarrierSmokeToolInput(input: {
  readonly workingDirectory: string;
  readonly filesystemAccess: 'write' | 'read';
  readonly nodeExecutable: string;
  readonly controlPlaneProbePort: number;
}): string {
  const workspaceCommand =
    input.filesystemAccess === 'write'
      ? `printf 'carrier-ready\\n' > ${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_MARKER}`
      : `/bin/cat ${ADAPTIVE_DEVELOPMENT_CARRIER_SMOKE_MARKER}`;
  const probeScript = [
    `const { createConnection } = require('node:net');`,
    `const socket = createConnection({ host: '127.0.0.1', port: ${input.controlPlaneProbePort} });`,
    `const timer = setTimeout(() => {`,
    `  socket.destroy();`,
    `  console.error('control-plane loopback probe timed out');`,
    `  process.exit(92);`,
    `}, 3000);`,
    `socket.once('connect', () => {`,
    `  clearTimeout(timer);`,
    `  socket.destroy();`,
    `  console.error('control-plane loopback probe unexpectedly connected');`,
    `  process.exit(91);`,
    `});`,
    `socket.once('error', (error) => {`,
    `  clearTimeout(timer);`,
    `  process.stdout.write(${JSON.stringify(`${ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER}:`)} + (error.code || 'ERROR'));`,
    `  process.exitCode = 0;`,
    `});`,
  ].join(' ');
  const command = `${JSON.stringify(input.nodeExecutable)} -e ${JSON.stringify(probeScript)} && ${workspaceCommand}`;
  const proofOutput =
    input.filesystemAccess === 'read'
      ? `${ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER}\ncarrier-ready\n`
      : ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER;
  return [
    `const result = await tools.exec_command({`,
    `  cmd: ${JSON.stringify(command)},`,
    `  workdir: ${JSON.stringify(input.workingDirectory)},`,
    `  yield_time_ms: 10000,`,
    `  max_output_tokens: 1000,`,
    `});`,
    `if (result.exit_code !== 0) {`,
    `  throw new Error('carrier control-plane probe command failed: ' + JSON.stringify(result));`,
    `}`,
    `if (!result.output.includes(${JSON.stringify(ADAPTIVE_DEVELOPMENT_CONTROL_PLANE_DENIED_MARKER)})) {`,
    `  throw new Error('carrier control-plane probe did not observe network denial');`,
    `}`,
    ...(input.filesystemAccess === 'read'
      ? [
          `if (!result.output.includes('carrier-ready')) {`,
          `  throw new Error('read-only carrier did not return the frozen marker');`,
          `}`,
        ]
      : []),
    `text(${JSON.stringify(proofOutput)});`,
  ].join('\n');
}

function writeAdaptiveDevelopmentCarrierSmokeEvents(
  response: ServerResponse,
  events: readonly Record<string, unknown>[],
): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
}

export function buildAdaptiveDevelopmentCodexSandboxProbeInvocation(
  input: AdaptiveDevelopmentCodexSandboxProbeInvocationInput,
): AdaptiveDevelopmentCodexInvocation {
  return {
    command: input.processContainer.sandboxExecutable,
    args: ['-f', input.processContainer.sandboxProfilePath, input.command, ...input.args],
    cwd: input.workingDirectory,
    prompt: '',
    environmentPolicy: 'isolated',
    env: buildAdaptiveDevelopmentLocalToolEnvironment(input),
  };
}

function adaptiveDevelopmentShellEnvironmentArguments(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer?: { readonly sandboxProfilePath: string };
}): string[] {
  return [
    '--config',
    'shell_environment_policy.inherit="none"',
    '--config',
    `shell_environment_policy.set=${tomlInlineTable(buildAdaptiveDevelopmentLocalToolEnvironment(input))}`,
  ];
}

export function buildAdaptiveDevelopmentLocalToolEnvironment(input: {
  readonly workingDirectory: string;
  readonly nodeExecutable: string;
  readonly processContainer?: { readonly sandboxProfilePath: string };
}): Readonly<Record<string, string>> {
  return {
    PATH: [dirname(input.nodeExecutable), COMMAND_LINE_TOOLS_BIN, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_AUTHOR_NAME: 'Adaptive Development Candidate',
    GIT_AUTHOR_EMAIL: 'adaptive-candidate@invalid',
    GIT_COMMITTER_NAME: 'Adaptive Development Candidate',
    GIT_COMMITTER_EMAIL: 'adaptive-candidate@invalid',
    TMPDIR: adaptiveDevelopmentToolTemporaryDirectory(input),
  };
}

export function buildAdaptiveDevelopmentOracleEnvironment(input: {
  readonly workingDirectory: string;
  readonly processContainer?: { readonly sandboxProfilePath: string };
}): Readonly<Record<string, string>> {
  return {
    NODE_ENV: 'test',
    LOG_DIR: join(adaptiveDevelopmentToolTemporaryDirectory(input), 'logs', 'api'),
  };
}

export function adaptiveDevelopmentToolTemporaryDirectory(input: {
  readonly workingDirectory: string;
  readonly processContainer?: { readonly sandboxProfilePath: string };
}): string {
  const toolTemporaryDirectory = input.processContainer
    ? join(dirname(input.processContainer.sandboxProfilePath), 'tool-tmp')
    : join(dirname(input.workingDirectory), 'tool-tmp');
  assertAdaptiveDevelopmentToolTemporaryDirectory(input.workingDirectory, toolTemporaryDirectory);
  return toolTemporaryDirectory;
}

function assertAdaptiveDevelopmentToolTemporaryDirectory(
  workingDirectory: string,
  toolTemporaryDirectory: string,
): void {
  const workspaceRelativePath = relative(resolve(workingDirectory), resolve(toolTemporaryDirectory));
  if (
    workspaceRelativePath === '' ||
    (workspaceRelativePath !== '..' && !workspaceRelativePath.startsWith(`..${sep}`))
  ) {
    throw new Error('adaptive development tool temporary directory must be outside the candidate workspace');
  }
}

export function adaptiveDevelopmentProviderTransportCertificatePaths(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const configuredPath = environment.NODE_EXTRA_CA_CERTS;
  if (!configuredPath) return [];
  if (!isAbsolute(configuredPath)) {
    throw new Error('NODE_EXTRA_CA_CERTS must be an absolute provider transport trust path');
  }
  const certificatePath = realpathSync(configuredPath);
  if (!statSync(certificatePath).isFile()) {
    throw new Error('NODE_EXTRA_CA_CERTS must resolve to a provider transport trust file');
  }
  return [certificatePath];
}

export function buildAdaptiveDevelopmentProviderTransportTrustBundle(
  input: {
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly publicRootCertificates?: readonly string[];
  } = {},
): string {
  const publicRoots = input.publicRootCertificates ?? rootCertificates;
  if (publicRoots.length === 0) throw new Error('provider transport trust bundle requires public root certificates');
  const sources = [
    ...publicRoots,
    ...adaptiveDevelopmentProviderTransportCertificatePaths(input.environment ?? process.env).map((path) =>
      readFileSync(path, 'utf8'),
    ),
  ];
  const certificates = [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
  if (
    certificates.length === 0 ||
    certificates.some(
      (certificate) =>
        !certificate.includes('-----BEGIN CERTIFICATE-----') || !certificate.includes('-----END CERTIFICATE-----'),
    )
  ) {
    throw new Error('provider transport trust bundle contains an invalid certificate source');
  }
  return `${certificates.join('\n')}\n`;
}

function assertAdaptiveDevelopmentProviderTransportTrustPath(path: string): void {
  if (!isAbsolute(path)) throw new Error('provider transport trust bundle path must be absolute');
}

function adaptiveDevelopmentProviderTransportEnvironment(path: string): Readonly<Record<string, string>> {
  return {
    CODEX_CA_CERTIFICATE: path,
    NODE_EXTRA_CA_CERTS: path,
    SSL_CERT_FILE: path,
  };
}

function adaptiveDevelopmentNetworkSystemMetadataClauses(allowNetwork: boolean): string {
  if (!allowNetwork) return '';
  return ['(subpath "/var")', '(subpath "/private/var")'].join(' ');
}

function adaptiveDevelopmentWriteProtectedPaths(
  workingDirectory: string,
  paths: readonly string[] = [],
): readonly string[] {
  const canonicalWorkingDirectory = realpathSync(workingDirectory);
  return [...new Set(paths)].map((path) => {
    if (!isAbsolute(path)) throw new Error(`write-protected path must be absolute: ${path}`);
    const canonicalPath = realpathSync(path);
    assertContainedPath(canonicalWorkingDirectory, canonicalPath);
    return canonicalPath;
  });
}

export function buildAdaptiveDevelopmentCodexProcessContainerProfile(input: {
  readonly workingDirectory: string;
  readonly controlDirectory: string;
  readonly codexExecutable: string;
  readonly nodeExecutable: string;
  readonly codexStateDirectory: string;
  readonly codexCredentialReaderExecutable?: string;
  readonly codexAuthPath?: string;
  readonly codexConfigPath?: string;
  readonly writable: boolean;
  readonly allowGitMetadataWrites?: boolean;
  readonly allowNetwork: boolean;
  readonly allowNestedSandbox: boolean;
  readonly allowChildProcesses: boolean;
  readonly allowInterprocessCommunication: boolean;
  readonly providerCertificatePaths?: readonly string[];
  readonly writeProtectedPaths?: readonly string[];
}): string {
  const codexRuntime = dirname(dirname(input.codexExecutable));
  const nodeRuntime = dirname(dirname(input.nodeExecutable));
  const codexTemporaryDirectory = join(input.codexStateDirectory, 'tmp');
  const toolTemporaryDirectory = join(input.controlDirectory, 'tool-tmp');
  assertAdaptiveDevelopmentToolTemporaryDirectory(input.workingDirectory, toolTemporaryDirectory);
  if (Boolean(input.codexCredentialReaderExecutable) !== Boolean(input.codexAuthPath)) {
    throw new Error('Codex credential reader and auth path must be supplied together');
  }
  if (input.codexConfigPath && !input.codexCredentialReaderExecutable) {
    throw new Error('Codex config path requires the trusted credential reader');
  }
  const sensitiveCodexPaths = [input.codexAuthPath, input.codexConfigPath].filter(
    (path): path is string => path !== undefined,
  );
  const trustedCodexParentExecutable = input.codexCredentialReaderExecutable;
  const providerCertificatePaths = input.allowNetwork ? [...new Set(input.providerCertificatePaths ?? [])] : [];
  for (const path of providerCertificatePaths) {
    if (!isAbsolute(path)) throw new Error(`provider certificate path must be absolute: ${path}`);
  }
  const writeProtectedPaths = adaptiveDevelopmentWriteProtectedPaths(input.workingDirectory, input.writeProtectedPaths);
  const readableDirectories = [
    '/System',
    '/Library/Apple',
    COMMAND_LINE_TOOLS_ROOT,
    '/Library/Preferences',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/lib',
    '/usr/libexec',
    '/usr/sbin',
    '/usr/share',
    '/etc/codex',
    '/private/etc',
    '/private/var/db',
    '/opt/homebrew',
    codexRuntime,
    nodeRuntime,
    input.workingDirectory,
    toolTemporaryDirectory,
    ...(!trustedCodexParentExecutable ? [input.controlDirectory, codexTemporaryDirectory] : []),
  ];
  const readableClauses = readableDirectories.map((path) => `(subpath ${JSON.stringify(path)})`).join(' ');
  const traversalRoots = new Set<string>();
  for (const path of [...readableDirectories, ...sensitiveCodexPaths, ...providerCertificatePaths]) {
    let parent = dirname(resolve(path));
    while (parent !== sep) {
      traversalRoots.add(parent);
      parent = dirname(parent);
    }
  }
  const traversalClauses = [...traversalRoots].map((path) => `(literal ${JSON.stringify(path)})`).join(' ');
  const networkSystemMetadataClauses = adaptiveDevelopmentNetworkSystemMetadataClauses(input.allowNetwork);
  const providerCertificateReadClauses = providerCertificatePaths
    .map((path) => `(literal ${JSON.stringify(path)})`)
    .join(' ');
  const executableClauses = [
    ...['/System', '/usr/lib', COMMAND_LINE_TOOLS_ROOT, '/opt/homebrew', codexRuntime, nodeRuntime].map(
      (path) => `(subpath ${JSON.stringify(path)})`,
    ),
    ...(input.codexCredentialReaderExecutable
      ? [`(literal ${JSON.stringify(input.codexCredentialReaderExecutable)})`]
      : []),
  ].join(' ');
  const writableClauses = [
    `(subpath ${JSON.stringify(toolTemporaryDirectory)})`,
    ...(!trustedCodexParentExecutable
      ? [`(subpath ${JSON.stringify(input.controlDirectory)})`, `(subpath ${JSON.stringify(codexTemporaryDirectory)})`]
      : []),
    ...(input.writable ? [`(subpath ${JSON.stringify(input.workingDirectory)})`] : []),
    '(literal "/dev/null")',
  ].join(' ');
  const sensitiveCodexReadClauses = sensitiveCodexPaths.map((path) => `(literal ${JSON.stringify(path)})`).join(' ');
  const credentialReadClause =
    input.codexCredentialReaderExecutable && sensitiveCodexReadClauses
      ? `(with-filter (process-path ${JSON.stringify(input.codexCredentialReaderExecutable)}) (allow file-read* ${sensitiveCodexReadClauses}))`
      : '';
  const parentControlReadClause = trustedCodexParentExecutable
    ? `(with-filter (process-path ${JSON.stringify(trustedCodexParentExecutable)}) (allow file-read* (subpath ${JSON.stringify(input.controlDirectory)})))`
    : '';
  const parentControlWriteClause = trustedCodexParentExecutable
    ? `(with-filter (process-path ${JSON.stringify(trustedCodexParentExecutable)}) (allow file-write* (subpath ${JSON.stringify(input.controlDirectory)})))`
    : '';
  const recursiveCodexExecDenyClause = trustedCodexParentExecutable
    ? `(with-filter (require-not (process-path "/usr/bin/sandbox-exec")) (deny process-exec (literal ${JSON.stringify(trustedCodexParentExecutable)})))`
    : '';
  const childLoopbackNetworkDenyClause = input.allowNetwork
    ? `(with-filter (require-not (process-path ${JSON.stringify(input.codexExecutable)})) (deny network-outbound (remote ip "localhost:*")))`
    : '';
  const gitMetadataWriteBoundary = input.allowGitMetadataWrites
    ? `(with-filter (require-not (process-path ${JSON.stringify(`${COMMAND_LINE_TOOLS_BIN}/git`)})) (deny file-write* (subpath ${JSON.stringify(join(input.workingDirectory, '.git'))})))`
    : `(deny file-write* (subpath ${JSON.stringify(join(input.workingDirectory, '.git'))}))`;
  const writeProtectedBoundaries = writeProtectedPaths.map(
    (path) => `(deny file-write* (subpath ${JSON.stringify(path)}))`,
  );
  const processRules = input.allowChildProcesses
    ? ['(allow signal (target same-sandbox))', '(allow process-info* (target same-sandbox))']
    : ['(deny process-fork)', '(deny signal)', '(allow process-info* (target same-sandbox))'];
  const interprocessCommunicationRules = input.allowInterprocessCommunication
    ? ['(allow ipc-posix*)']
    : ['(deny ipc-posix*)'];
  return [
    '(version 1)',
    '(deny default)',
    '(allow process*)',
    recursiveCodexExecDenyClause,
    ...processRules,
    ...(input.allowNestedSandbox ? ['(allow process-exec (with no-sandbox) (literal "/usr/bin/sandbox-exec"))'] : []),
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    ...interprocessCommunicationRules,
    '(allow system-mac-syscall)',
    '(allow iokit-open)',
    '(allow user-preference-read)',
    ...(input.allowNetwork ? ['(allow network*)'] : []),
    childLoopbackNetworkDenyClause,
    `(allow file-read-metadata ${traversalClauses} ${networkSystemMetadataClauses})`,
    `(allow file-read* ${readableClauses} ${providerCertificateReadClauses} (subpath "/dev") (literal "/"))`,
    parentControlReadClause,
    credentialReadClause,
    `(allow file-map-executable ${executableClauses})`,
    `(allow file-write* ${writableClauses})`,
    parentControlWriteClause,
    gitMetadataWriteBoundary,
    ...writeProtectedBoundaries,
  ].join('\n');
}

function adaptiveDevelopmentProcessSpawnSpec(
  invocation: AdaptiveDevelopmentCodexInvocation,
  environment: NodeJS.ProcessEnv,
): { readonly command: string; readonly args: readonly string[]; readonly environment: NodeJS.ProcessEnv } {
  const tracker = activeAdaptiveDevelopmentStageAdmissionProcessTracker;
  if (!tracker || process.platform === 'win32') {
    return { command: invocation.command, args: invocation.args, environment };
  }
  const specification = Buffer.from(
    JSON.stringify({ command: invocation.command, args: [...invocation.args] }),
    'utf8',
  ).toString('base64');
  return {
    command: process.execPath,
    args: [
      '--input-type=commonjs',
      '--eval',
      STAGE_ADMISSION_PROCESS_SUPERVISOR_SCRIPT,
      STAGE_ADMISSION_PROCESS_SUPERVISOR_MARKER,
      tracker.state.runToken,
    ],
    environment: { ...environment, [STAGE_ADMISSION_PROCESS_SPEC_ENV]: specification },
  };
}

export async function runAdaptiveDevelopmentProcess(
  invocation: AdaptiveDevelopmentCodexInvocation,
  deadlineEpochMs: number,
): Promise<AdaptiveDevelopmentProcessResult> {
  if (!Number.isInteger(deadlineEpochMs)) throw new Error('process deadline must be an integer epoch');
  if (invocation.environmentPolicy !== 'inherit-host' && invocation.environmentPolicy !== 'isolated') {
    throw new Error('process invocation must choose an explicit environment policy');
  }
  if (
    invocation.continuousIntegrationEnvironment !== undefined &&
    invocation.continuousIntegrationEnvironment !== 'enabled' &&
    invocation.continuousIntegrationEnvironment !== 'omitted'
  ) {
    throw new Error('process invocation must choose a valid continuous integration environment policy');
  }
  if (
    invocation.resourceGuard &&
    (!Number.isInteger(invocation.resourceGuard.intervalMs) || invocation.resourceGuard.intervalMs <= 0)
  ) {
    throw new Error('process resource guard interval must be a positive integer');
  }
  if (adaptiveDevelopmentProcessShutdownSignal) {
    throw new AdaptiveDevelopmentProcessInterruptedError(adaptiveDevelopmentProcessShutdownSignal);
  }
  const remainingMs = deadlineEpochMs - Date.now();
  if (remainingMs <= 0) throw new Error('process deadline already elapsed');
  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    const environment = {
      ...(invocation.environmentPolicy === 'inherit-host' ? process.env : {}),
      ...invocation.env,
      ...(invocation.continuousIntegrationEnvironment === 'omitted' ? {} : { CI: '1' }),
      NO_COLOR: '1',
    };
    const spawnSpec = adaptiveDevelopmentProcessSpawnSpec(invocation, environment);
    const child = spawn(spawnSpec.command, [...spawnSpec.args], {
      cwd: invocation.cwd,
      env: spawnSpec.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let trackedProcessGroupId: number | undefined;
    try {
      trackedProcessGroupId = registerAdaptiveDevelopmentStageAdmissionProcessGroup(child.pid);
    } catch (error) {
      signalProcessTree(child.pid, 'SIGKILL');
      reject(error);
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let resourceGuardFailure: string | undefined;
    let interruptionSignal: NodeJS.Signals | undefined;
    let escalationComplete = false;
    let closed:
      | {
          readonly exitCode: number | null;
          readonly signal: NodeJS.Signals | null;
        }
      | undefined;
    let escalationTimer: NodeJS.Timeout | undefined;
    let resourceGuardTimer: NodeJS.Timeout | undefined;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timeout);
      if (escalationTimer) clearTimeout(escalationTimer);
      if (resourceGuardTimer) clearInterval(resourceGuardTimer);
      activeAdaptiveDevelopmentProcessShutdownHandlers.delete(interrupt);
      unregisterAdaptiveDevelopmentStageAdmissionProcessGroup(trackedProcessGroupId);
    };
    const resolveIfComplete = (): void => {
      if (!closed || (timedOut && !interruptionSignal && !escalationComplete)) return;
      cleanup();
      if (interruptionSignal) {
        reject(new AdaptiveDevelopmentProcessInterruptedError(interruptionSignal));
        return;
      }
      resolve({
        exitCode: closed.exitCode,
        signal: closed.signal,
        timedOut,
        elapsedMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...(resourceGuardFailure ? { resourceGuardFailure } : {}),
      });
    };
    const interrupt: AdaptiveDevelopmentProcessShutdownHandler = (signal) => {
      interruptionSignal ??= signal;
      signalProcessTree(child.pid, 'SIGKILL');
    };
    activeAdaptiveDevelopmentProcessShutdownHandlers.add(interrupt);
    const timeout = setTimeout(() => {
      timedOut = true;
      signalProcessTree(child.pid, 'SIGTERM');
      escalationTimer = setTimeout(() => {
        signalProcessTree(child.pid, 'SIGKILL');
        escalationComplete = true;
        resolveIfComplete();
      }, PROCESS_TERMINATION_GRACE_MS);
    }, remainingMs);
    if (invocation.resourceGuard) {
      resourceGuardTimer = setInterval(() => {
        if (closed || resourceGuardFailure) return;
        try {
          invocation.resourceGuard?.check();
        } catch (error) {
          resourceGuardFailure = error instanceof Error ? error.message : String(error);
          signalProcessTree(child.pid, 'SIGKILL');
        }
      }, invocation.resourceGuard.intervalMs);
    }
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      if (resourceGuardTimer) clearInterval(resourceGuardTimer);
      if (!timedOut) {
        signalProcessTree(child.pid, 'SIGKILL');
      }
      closed = { exitCode, signal };
      resolveIfComplete();
    });
    if (adaptiveDevelopmentProcessShutdownSignal) interrupt(adaptiveDevelopmentProcessShutdownSignal);
    child.stdin.end(invocation.prompt);
  });
}

export async function materializeAdaptiveDevelopmentOracleSnapshot(input: {
  readonly gitExecutable: string;
  readonly sourceRepository: string;
  readonly destination: string;
  readonly finalSha: string;
  readonly deadlineEpochMs: number;
  readonly resourceGuard?: AdaptiveDevelopmentDirectoryStorageGuard;
}): Promise<void> {
  if (!isAbsolute(input.sourceRepository) || !isAbsolute(input.destination)) {
    throw new Error('oracle snapshot paths must be absolute');
  }
  if (!/^[a-f0-9]{40}$/.test(input.finalSha)) throw new Error('oracle snapshot requires an exact candidate SHA');
  if (existsSync(input.destination)) throw new Error('oracle snapshot destination must not already exist');
  mkdirSync(dirname(input.destination), { recursive: true });
  const gitEnvironment = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  } as const;
  const runGit = async (cwd: string, args: readonly string[]): Promise<string> => {
    const result = await runAdaptiveDevelopmentProcess(
      {
        command: input.gitExecutable,
        args,
        cwd,
        prompt: '',
        environmentPolicy: 'isolated',
        env: gitEnvironment,
        ...(input.resourceGuard ? { resourceGuard: input.resourceGuard } : {}),
      },
      input.deadlineEpochMs,
    );
    if (result.resourceGuardFailure) throw new Error(result.resourceGuardFailure);
    input.resourceGuard?.check();
    if (result.timedOut) throw new Error(`oracle snapshot Git command timed out: ${args[0] ?? ''}`);
    if (result.exitCode !== 0) {
      throw new Error(`oracle snapshot Git command failed: ${(result.stderr || result.stdout).slice(-2_000)}`);
    }
    return result.stdout.trim();
  };
  await runGit(dirname(input.destination), [
    'clone',
    '--no-local',
    '--no-checkout',
    '--no-tags',
    '--config',
    'core.hooksPath=/dev/null',
    '--config',
    'core.fsmonitor=false',
    '--',
    input.sourceRepository,
    input.destination,
  ]);
  await runGit(input.destination, ['checkout', '--detach', input.finalSha]);
  await runGit(input.destination, ['remote', 'remove', 'origin']);
  const [head, status, remotes] = await Promise.all([
    runGit(input.destination, ['--no-optional-locks', 'rev-parse', 'HEAD']),
    runGit(input.destination, ['--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all']),
    runGit(input.destination, ['remote']),
  ]);
  if (head !== input.finalSha || status || remotes) {
    throw new Error('oracle snapshot does not contain only the clean exact candidate');
  }
}

export async function cloneAdaptiveDevelopmentOracleSnapshot(input: {
  readonly copyExecutable: string;
  readonly source: string;
  readonly destination: string;
  readonly deadlineEpochMs: number;
  readonly resourceGuard?: AdaptiveDevelopmentDirectoryStorageGuard;
}): Promise<void> {
  if (!isAbsolute(input.copyExecutable) || !isAbsolute(input.source) || !isAbsolute(input.destination)) {
    throw new Error('oracle clone executable and paths must be absolute');
  }
  if (!existsSync(input.source)) throw new Error('oracle clone source does not exist');
  if (existsSync(input.destination)) throw new Error('oracle clone destination must not already exist');
  mkdirSync(dirname(input.destination), { recursive: true });
  const result = await runAdaptiveDevelopmentProcess(
    {
      command: input.copyExecutable,
      args: ['-cR', input.source, input.destination],
      cwd: dirname(input.destination),
      prompt: '',
      environmentPolicy: 'isolated',
      ...(input.resourceGuard ? { resourceGuard: input.resourceGuard } : {}),
    },
    input.deadlineEpochMs,
  );
  if (result.resourceGuardFailure) throw new Error(result.resourceGuardFailure);
  input.resourceGuard?.check();
  if (result.timedOut) throw new Error('oracle clone exceeded the attempt deadline');
  if (result.exitCode !== 0) {
    throw new Error(`oracle clone failed: ${(result.stderr || result.stdout).slice(-2_000)}`);
  }
}

export function sanitizeAdaptiveDevelopmentRuntimeSnapshot(root: string): readonly string[] {
  const canonicalRoot = resolve(root);
  const removed: string[] = [];
  for (const relativePath of SNAPSHOT_PRIVATE_PATHS) {
    const target = resolve(canonicalRoot, relativePath);
    assertContainedPath(canonicalRoot, target);
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(relativePath);
  }
  return removed;
}

const DEVELOPMENT_REVIEW_PRIVATE_PATHS = [
  '.git',
  '.claude/skills',
  'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json',
] as const;

export const ADAPTIVE_DEVELOPMENT_REVIEW_VISIBILITY_VERSION = 'lf-0001.development-review-visibility.v3' as const;
const ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_PATTERN_BODY =
  '(.+?):([1-9][0-9]*)(?::([1-9][0-9]*))?(?:-([1-9][0-9]*)(?::([1-9][0-9]*))?)?' as const;
export const ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_PATTERN =
  `^${ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_PATTERN_BODY}$` as const;
export const ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_OR_EMPTY_PATTERN =
  `^(?:${ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_PATTERN_BODY})?$` as const;

export interface AdaptiveDevelopmentReviewVisibilityManifest {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_REVIEW_VISIBILITY_VERSION;
  readonly candidateSha: string;
  readonly paths: readonly string[];
  readonly pathsSha256: string;
  readonly candidateArtifacts: readonly AdaptiveDevelopmentReviewVisibleArtifact[];
  readonly candidateArtifactsSha256: string;
  readonly runnerProvidedArtifacts: readonly AdaptiveDevelopmentReviewVisibleArtifact[];
  readonly runnerProvidedArtifactsSha256: string;
}

interface AdaptiveDevelopmentReviewVisibleArtifact {
  readonly path: string;
  readonly sha256: string;
}

export interface AdaptiveDevelopmentReviewVisibilityRoots {
  readonly candidateRoot: string;
  readonly runnerProvidedRoot: string;
}

interface AdaptiveDevelopmentReviewLocation {
  readonly path: string;
  readonly startLine: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

function parseAdaptiveDevelopmentReviewLocation(location: string): AdaptiveDevelopmentReviewLocation | null {
  const match = new RegExp(ADAPTIVE_DEVELOPMENT_REVIEW_LOCATION_PATTERN).exec(location);
  if (!match?.[1] || !match[2]) return null;
  return {
    path: match[1],
    startLine: Number(match[2]),
    ...(match[3] ? { startColumn: Number(match[3]) } : {}),
    ...(match[4] ? { endLine: Number(match[4]) } : {}),
    ...(match[5] ? { endColumn: Number(match[5]) } : {}),
  };
}

function adaptiveDevelopmentReviewLocationCoordinatesExist(
  content: Buffer,
  location: AdaptiveDevelopmentReviewLocation,
): boolean {
  const text = content.toString('utf8');
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  const lineLengths = lines.map((line) => Array.from(line.endsWith('\r') ? line.slice(0, -1) : line).length);
  const endLine = location.endLine ?? location.startLine;
  if (location.startLine > lineLengths.length || endLine > lineLengths.length || endLine < location.startLine) {
    return false;
  }
  const startLength = lineLengths[location.startLine - 1];
  const endLength = lineLengths[endLine - 1];
  if (startLength === undefined || endLength === undefined) return false;
  if (location.startColumn !== undefined && location.startColumn > Math.max(1, startLength)) return false;
  if (location.endColumn !== undefined && location.endColumn > Math.max(1, endLength)) return false;
  if (
    endLine === location.startLine &&
    location.startColumn !== undefined &&
    location.endColumn !== undefined &&
    location.endColumn < location.startColumn
  ) {
    return false;
  }
  return true;
}

function adaptiveDevelopmentReviewVisibleArtifactIsValid(
  artifact: AdaptiveDevelopmentReviewVisibleArtifact,
  previousPath: string | undefined,
): boolean {
  return Boolean(
    artifact.path &&
      !isAbsolute(artifact.path) &&
      normalize(artifact.path) === artifact.path &&
      /^[a-f0-9]{64}$/.test(artifact.sha256) &&
      (!previousPath || artifact.path > previousPath),
  );
}

function compareAdaptiveDevelopmentReviewVisibleArtifacts(
  left: AdaptiveDevelopmentReviewVisibleArtifact,
  right: AdaptiveDevelopmentReviewVisibleArtifact,
): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function adaptiveDevelopmentReviewArtifactAtPath(
  canonicalRoot: string,
  path: string,
): AdaptiveDevelopmentReviewVisibleArtifact | null {
  const target = resolve(canonicalRoot, path);
  assertContainedPath(canonicalRoot, target);
  if (!existsSync(target)) return null;
  const canonicalTarget = realpathSync(target);
  assertContainedPath(canonicalRoot, canonicalTarget);
  if (!statSync(canonicalTarget).isFile()) return null;
  return Object.freeze({ path, sha256: adaptiveDevelopmentReviewArtifactSha256(canonicalTarget) });
}

function readAdaptiveDevelopmentReviewArtifact(
  root: string,
  artifact: AdaptiveDevelopmentReviewVisibleArtifact,
): Buffer | null {
  const canonicalRoot = realpathSync(root);
  const target = resolve(canonicalRoot, artifact.path);
  assertContainedPath(canonicalRoot, target);
  if (!existsSync(target)) return null;
  const canonicalTarget = realpathSync(target);
  assertContainedPath(canonicalRoot, canonicalTarget);
  if (!statSync(canonicalTarget).isFile()) return null;
  const content = readFileSync(canonicalTarget);
  return createHash('sha256').update(content).digest('hex') === artifact.sha256 ? content : null;
}

function adaptiveDevelopmentReviewArtifactSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertAdaptiveDevelopmentReviewVisibilityManifest(
  manifest: AdaptiveDevelopmentReviewVisibilityManifest,
): void {
  if (
    manifest.schemaVersion !== ADAPTIVE_DEVELOPMENT_REVIEW_VISIBILITY_VERSION ||
    !/^[a-f0-9]{40}$/.test(manifest.candidateSha) ||
    manifest.pathsSha256 !== fingerprintAdaptiveDevelopmentBenchmark(manifest.paths) ||
    manifest.paths.some(
      (path, index) =>
        !path || isAbsolute(path) || normalize(path) !== path || (index > 0 && path <= manifest.paths[index - 1]),
    ) ||
    manifest.candidateArtifactsSha256 !== fingerprintAdaptiveDevelopmentBenchmark(manifest.candidateArtifacts) ||
    manifest.candidateArtifacts.length !== manifest.paths.length ||
    manifest.candidateArtifacts.some(
      (artifact, index) =>
        !adaptiveDevelopmentReviewVisibleArtifactIsValid(
          artifact,
          index > 0 ? manifest.candidateArtifacts[index - 1]?.path : undefined,
        ) || artifact.path !== manifest.paths[index],
    ) ||
    manifest.runnerProvidedArtifactsSha256 !==
      fingerprintAdaptiveDevelopmentBenchmark(manifest.runnerProvidedArtifacts) ||
    manifest.runnerProvidedArtifacts.some(
      (artifact, index) =>
        !adaptiveDevelopmentReviewVisibleArtifactIsValid(
          artifact,
          index > 0 ? manifest.runnerProvidedArtifacts[index - 1]?.path : undefined,
        ) || manifest.paths.includes(artifact.path),
    )
  ) {
    throw new Error('development review visibility manifest is invalid');
  }
}

export function sanitizeAdaptiveDevelopmentReviewWorkspace(
  root: string,
  hiddenOracleSourcePaths: readonly string[],
  hiddenRoleInputPaths: readonly string[],
): readonly string[] {
  const canonicalRoot = resolve(root);
  const removed: string[] = [];
  for (const relativePath of [
    ...DEVELOPMENT_REVIEW_PRIVATE_PATHS,
    ...hiddenRoleInputPaths,
    ...hiddenOracleSourcePaths,
  ]) {
    const target = resolve(canonicalRoot, relativePath);
    assertContainedPath(canonicalRoot, target);
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(relativePath);
  }
  return removed;
}

export function buildAdaptiveDevelopmentReviewVisibilityManifest(input: {
  readonly root: string;
  readonly candidateSha: string;
  readonly candidatePaths: readonly string[];
  readonly runnerProvidedPaths?: readonly string[];
}): AdaptiveDevelopmentReviewVisibilityManifest {
  if (!/^[a-f0-9]{40}$/.test(input.candidateSha)) {
    throw new Error('development review visibility must bind an exact candidate');
  }
  const canonicalRoot = realpathSync(input.root);
  const candidateArtifacts: AdaptiveDevelopmentReviewVisibleArtifact[] = [];
  for (const candidatePath of input.candidatePaths) {
    if (!candidatePath || isAbsolute(candidatePath) || normalize(candidatePath) !== candidatePath) {
      throw new Error('development review visibility contains an invalid candidate path');
    }
    const artifact = adaptiveDevelopmentReviewArtifactAtPath(canonicalRoot, candidatePath);
    if (artifact) candidateArtifacts.push(artifact);
  }
  candidateArtifacts.sort(compareAdaptiveDevelopmentReviewVisibleArtifacts);
  if (
    candidateArtifacts.some((artifact, index) => index > 0 && artifact.path === candidateArtifacts[index - 1]?.path)
  ) {
    throw new Error('development review visibility contains duplicate candidate paths');
  }
  const frozenCandidateArtifacts = Object.freeze(candidateArtifacts);
  const paths = Object.freeze(frozenCandidateArtifacts.map((artifact) => artifact.path));
  const runnerProvidedArtifacts = Object.freeze(
    (input.runnerProvidedPaths ?? [])
      .map((runnerProvidedPath) => {
        if (
          !runnerProvidedPath ||
          isAbsolute(runnerProvidedPath) ||
          normalize(runnerProvidedPath) !== runnerProvidedPath ||
          paths.includes(runnerProvidedPath)
        ) {
          throw new Error('development review visibility contains an invalid runner-provided path');
        }
        const artifact = adaptiveDevelopmentReviewArtifactAtPath(canonicalRoot, runnerProvidedPath);
        if (!artifact) {
          throw new Error('development review visibility is missing a runner-provided artifact');
        }
        return artifact;
      })
      .sort(compareAdaptiveDevelopmentReviewVisibleArtifacts),
  );
  if (
    runnerProvidedArtifacts.some(
      (artifact, index) => index > 0 && artifact.path === runnerProvidedArtifacts[index - 1].path,
    )
  ) {
    throw new Error('development review visibility contains duplicate runner-provided paths');
  }
  return Object.freeze({
    schemaVersion: ADAPTIVE_DEVELOPMENT_REVIEW_VISIBILITY_VERSION,
    candidateSha: input.candidateSha,
    paths,
    pathsSha256: fingerprintAdaptiveDevelopmentBenchmark(paths),
    candidateArtifacts: frozenCandidateArtifacts,
    candidateArtifactsSha256: fingerprintAdaptiveDevelopmentBenchmark(frozenCandidateArtifacts),
    runnerProvidedArtifacts,
    runnerProvidedArtifactsSha256: fingerprintAdaptiveDevelopmentBenchmark(runnerProvidedArtifacts),
  });
}

export function assertAdaptiveDevelopmentReviewVisibilityIntegrity(
  root: string,
  manifest: AdaptiveDevelopmentReviewVisibilityManifest,
): void {
  assertAdaptiveDevelopmentReviewVisibilityManifest(manifest);
  const canonicalRoot = realpathSync(root);
  for (const artifact of manifest.runnerProvidedArtifacts) {
    const target = resolve(canonicalRoot, artifact.path);
    assertContainedPath(canonicalRoot, target);
    if (!existsSync(target)) {
      throw new Error('development review runner-provided artifact changed after visibility binding');
    }
    const canonicalTarget = realpathSync(target);
    assertContainedPath(canonicalRoot, canonicalTarget);
    if (
      !statSync(canonicalTarget).isFile() ||
      adaptiveDevelopmentReviewArtifactSha256(canonicalTarget) !== artifact.sha256
    ) {
      throw new Error('development review runner-provided artifact changed after visibility binding');
    }
  }
}

export function adaptiveDevelopmentReviewLocationIsVisible(
  manifest: AdaptiveDevelopmentReviewVisibilityManifest,
  location: string,
  roots: AdaptiveDevelopmentReviewVisibilityRoots,
): boolean {
  assertAdaptiveDevelopmentReviewVisibilityManifest(manifest);
  const parsed = parseAdaptiveDevelopmentReviewLocation(location);
  if (!parsed || isAbsolute(parsed.path) || normalize(parsed.path) !== parsed.path) return false;
  const candidateArtifact = manifest.candidateArtifacts.find((artifact) => artifact.path === parsed.path);
  const runnerProvidedArtifact = manifest.runnerProvidedArtifacts.find((artifact) => artifact.path === parsed.path);
  const artifact = candidateArtifact ?? runnerProvidedArtifact;
  if (!artifact) return false;
  const content = readAdaptiveDevelopmentReviewArtifact(
    candidateArtifact ? roots.candidateRoot : roots.runnerProvidedRoot,
    artifact,
  );
  return content ? adaptiveDevelopmentReviewLocationCoordinatesExist(content, parsed) : false;
}

function assertAdaptiveDevelopmentOperatorApprovalAuthority(
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
): void {
  const expectedMessageStoreIdentity = fingerprintAdaptiveDevelopmentBenchmark({
    redisUrl: ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisUrl,
    redisKeyPrefix: ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisKeyPrefix,
  });
  if (
    authority.kind !== OPERATOR_APPROVAL_AUTHORITY_KIND ||
    authority.operatorUserId !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.operatorUserId ||
    authority.threadId !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.threadId ||
    authority.messageStoreIdentitySha256 !== expectedMessageStoreIdentity ||
    !/^[a-f0-9]{64}$/.test(authority.runtimeInstanceIdentitySha256)
  ) {
    throw new Error('operator approval does not bind the trusted operator authority');
  }
}

export function buildAdaptiveDevelopmentOperatorApprovalAuthority(input: {
  readonly redisUrl: string;
  readonly redisKeyPrefix: string;
  readonly runtimeInstanceIdentitySha256: string;
}): AdaptiveDevelopmentOperatorApprovalAuthority {
  if (
    input.redisUrl !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisUrl ||
    input.redisKeyPrefix !== ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.redisKeyPrefix
  ) {
    throw new Error('benchmark runner is not connected to the trusted Cat Café MessageStore coordinates');
  }
  const authority = {
    kind: OPERATOR_APPROVAL_AUTHORITY_KIND,
    operatorUserId: ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.operatorUserId,
    threadId: ADAPTIVE_DEVELOPMENT_S0_APPROVAL_TRUST_ROOT.threadId,
    messageStoreIdentitySha256: fingerprintAdaptiveDevelopmentBenchmark({
      redisUrl: input.redisUrl,
      redisKeyPrefix: input.redisKeyPrefix,
    }),
    runtimeInstanceIdentitySha256: input.runtimeInstanceIdentitySha256,
  } satisfies AdaptiveDevelopmentOperatorApprovalAuthority;
  assertAdaptiveDevelopmentOperatorApprovalAuthority(authority);
  return authority;
}

export function buildAdaptiveDevelopmentOperatorApprovalDirective(
  launchScopeSha256: string,
  stageBudget: AdaptiveDevelopmentBenchmarkLaunchPlan['stageBudget'],
  authority: AdaptiveDevelopmentOperatorApprovalAuthority,
): string {
  if (!/^[a-f0-9]{64}$/.test(launchScopeSha256)) throw new Error('approval scope must be a SHA-256 digest');
  assertAdaptiveDevelopmentOperatorApprovalAuthority(authority);
  return [
    'APPROVE_ADAPTIVE_S0',
    `scope_sha256=${launchScopeSha256}`,
    `operator_user_id=${authority.operatorUserId}`,
    `thread_id=${authority.threadId}`,
    `message_store_identity_sha256=${authority.messageStoreIdentitySha256}`,
    `runtime_instance_identity_sha256=${authority.runtimeInstanceIdentitySha256}`,
    `token_policy=${stageBudget.tokenPolicy}`,
    `maximum_infrastructure_retry_attempts=${stageBudget.maximumInfrastructureRetryAttempts}`,
  ].join(' ');
}

export async function verifyAdaptiveDevelopmentOperatorApproval(input: {
  readonly authorization: Extract<
    AdaptiveDevelopmentBenchmarkLaunchPlan['authorization'],
    { kind: 'operator_approval' }
  >;
  readonly stageBudget: AdaptiveDevelopmentBenchmarkLaunchPlan['stageBudget'];
  readonly authority: AdaptiveDevelopmentOperatorApprovalAuthority;
  readonly resolver: AdaptiveDevelopmentOperatorApprovalResolver;
}): Promise<void> {
  const directive = buildAdaptiveDevelopmentOperatorApprovalDirective(
    input.authorization.approvedLaunchScopeSha256,
    input.stageBudget,
    input.authority,
  );
  await verifyAdaptiveDevelopmentOperatorDirective({
    authorization: input.authorization,
    authority: input.authority,
    resolver: input.resolver,
    directive,
  });
}

export async function verifyAdaptiveDevelopmentOperatorDirective(input: {
  readonly authorization: {
    readonly approvalRef: string;
    readonly approvalMessageSha256: string;
    readonly approvedAt: string;
  };
  readonly authority: AdaptiveDevelopmentOperatorApprovalAuthority;
  readonly resolver: AdaptiveDevelopmentOperatorApprovalResolver;
  readonly directive: string;
}): Promise<void> {
  assertAdaptiveDevelopmentOperatorApprovalAuthority(input.authority);
  const match = /^cat-cafe:\/\/message\/([A-Za-z0-9-]+)$/.exec(input.authorization.approvalRef);
  if (!match) throw new Error('operator approval reference is invalid');
  const message = await input.resolver.getById(match[1]);
  if (!message) throw new Error('durable operator approval message not found');
  if (
    message.id !== match[1] ||
    message.catId !== null ||
    message.userId === 'scheduler' ||
    message.userId === 'system' ||
    message.source !== undefined ||
    message.deletedAt !== undefined ||
    message._tombstone ||
    message.deliveryStatus === 'queued' ||
    message.deliveryStatus === 'canceled' ||
    message.extra?.systemKind !== undefined
  ) {
    throw new Error('operator approval reference does not resolve to a durable direct user message');
  }
  if (message.userId !== input.authority.operatorUserId) {
    throw new Error('operator approval message was not authored by the expected operator user');
  }
  if (message.threadId !== input.authority.threadId) {
    throw new Error('operator approval message does not belong to the expected authority thread');
  }
  if (fingerprintAdaptiveDevelopmentBenchmark(message.content) !== input.authorization.approvalMessageSha256) {
    throw new Error('operator approval message hash mismatch');
  }
  if (!message.content.split(/\r?\n/).some((line) => line.trim() === input.directive)) {
    throw new Error('operator approval message does not authorize the exact launch scope and budget');
  }
  if (
    !Number.isInteger(message.timestamp) ||
    new Date(message.timestamp).toISOString() !== input.authorization.approvedAt
  ) {
    throw new Error('operator approval timestamp does not match the durable message');
  }
}

export function reserveAdaptiveDevelopmentInitialStageAttempts(
  runRoot: string,
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): readonly AdaptiveDevelopmentStageAttemptReservation[] {
  return withStageAttemptLock(runRoot, () => {
    const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
    const expected = launchPlan.runs.map((launch) =>
      stageAttemptReservation(launchPlan, launchPlanSha256, launch.runKey, 1),
    );
    if (new Set(expected.map(reservationKey)).size !== expected.length) {
      throw new Error('initial stage attempts contain duplicate run reservation keys');
    }
    const ledger = readStageAttemptLedger(runRoot, launchPlan, launchPlanSha256);
    if (!ledger) {
      writeStageAttemptLedger(runRoot, stageAttemptLedger(launchPlan, launchPlanSha256, expected));
      return expected;
    }
    const byKey = new Map(ledger.reservations.map((reservation) => [reservationKey(reservation), reservation]));
    for (const reservation of expected) {
      const existing = byKey.get(reservationKey(reservation));
      if (!existing || JSON.stringify(existing) !== JSON.stringify(reservation)) {
        throw new Error(`initial stage attempt reservation conflict for ${reservation.runKey}`);
      }
    }
    return expected.map(
      (reservation) => byKey.get(reservationKey(reservation)) as AdaptiveDevelopmentStageAttemptReservation,
    );
  });
}

export function reserveAdaptiveDevelopmentRetryStageAttempt(
  runRoot: string,
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
  launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number],
): AdaptiveDevelopmentStageAttemptReservation | undefined {
  return withStageAttemptLock(runRoot, () => {
    const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
    const ledger = readStageAttemptLedger(runRoot, launchPlan, launchPlanSha256);
    if (!ledger) throw new Error('initial stage attempts must be atomically reserved before any retry');
    const authorizedLaunch = launchPlan.runs.find((candidate) => candidate.runKey === launch.runKey);
    if (
      !authorizedLaunch ||
      fingerprintAdaptiveDevelopmentBenchmark(authorizedLaunch) !== fingerprintAdaptiveDevelopmentBenchmark(launch)
    ) {
      throw new Error('retry stage attempt is not bound to an exact launch-plan run');
    }
    const initialReservationKeys = new Set(
      ledger.reservations.filter((candidate) => candidate.attempt === 1).map(reservationKey),
    );
    if (
      launchPlan.runs.some(
        (candidate) => !initialReservationKeys.has(reservationKey({ runKey: candidate.runKey, attempt: 1 })),
      )
    ) {
      throw new Error('retry stage attempt requires the complete atomic initial reservation set');
    }
    const reservation = stageAttemptReservation(launchPlan, launchPlanSha256, launch.runKey, 2);
    const existing = ledger.reservations.find((candidate) => reservationKey(candidate) === reservationKey(reservation));
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(reservation)) {
        throw new Error(`retry stage attempt reservation conflict for ${launch.runKey}`);
      }
      return existing;
    }
    const retryCount = ledger.reservations.filter((candidate) => candidate.attempt === 2).length;
    if (retryCount >= launchPlan.stageBudget.maximumInfrastructureRetryAttempts) return undefined;
    const nextLedger = { ...ledger, reservations: [...ledger.reservations, reservation] };
    writeStageAttemptLedger(runRoot, nextLedger);
    return reservation;
  });
}

function stageAttemptReservation(
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
  launchPlanSha256: string,
  runKey: string,
  attempt: 1 | 2,
): AdaptiveDevelopmentStageAttemptReservation {
  const tokenPolicy = 'unbounded' as const;
  const identity = { launchPlanSha256, runKey, attempt, tokenPolicy };
  return {
    schemaVersion: STAGE_ATTEMPT_RESERVATION_VERSION,
    reservationId: fingerprintAdaptiveDevelopmentBenchmark(identity),
    launchPlanSha256,
    launchScopeSha256: launchPlan.launchScopeSha256,
    stageTokenPolicy: launchPlan.stageBudget.tokenPolicy,
    runKey,
    attempt,
    tokenPolicy,
  };
}

function stageAttemptLedger(
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
  launchPlanSha256: string,
  reservations: readonly AdaptiveDevelopmentStageAttemptReservation[],
): AdaptiveDevelopmentStageAttemptLedger {
  return {
    schemaVersion: STAGE_ATTEMPT_LEDGER_VERSION,
    launchPlanSha256,
    launchScopeSha256: launchPlan.launchScopeSha256,
    stageTokenPolicy: launchPlan.stageBudget.tokenPolicy,
    reservations,
  };
}

function withStageAttemptLock<T>(runRoot: string, action: () => T): T {
  mkdirSync(runRoot, { recursive: true });
  const lockPath = join(runRoot, 'stage-attempts.lock');
  let lock: number;
  try {
    lock = openSync(lockPath, 'wx');
  } catch {
    throw new Error('stage attempt reservation lock is already held');
  }
  try {
    return action();
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function readStageAttemptLedger(
  runRoot: string,
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
  launchPlanSha256: string,
): AdaptiveDevelopmentStageAttemptLedger | undefined {
  const path = join(runRoot, 'stage-attempt-reservations.json');
  if (!existsSync(path)) return undefined;
  const ledger = JSON.parse(readFileSync(path, 'utf8')) as AdaptiveDevelopmentStageAttemptLedger;
  if (
    ledger.schemaVersion !== STAGE_ATTEMPT_LEDGER_VERSION ||
    ledger.launchPlanSha256 !== launchPlanSha256 ||
    ledger.launchScopeSha256 !== launchPlan.launchScopeSha256 ||
    ledger.stageTokenPolicy !== launchPlan.stageBudget.tokenPolicy ||
    !Array.isArray(ledger.reservations)
  ) {
    throw new Error('stage attempt ledger does not bind the exact launch plan');
  }
  if (new Set(ledger.reservations.map(reservationKey)).size !== ledger.reservations.length) {
    throw new Error('stage attempt ledger contains duplicate reservation keys');
  }
  const launchByRunKey = new Map(launchPlan.runs.map((launch) => [launch.runKey, launch]));
  for (const reservation of ledger.reservations) {
    const launch = launchByRunKey.get(reservation.runKey);
    const expected = launch
      ? stageAttemptReservation(launchPlan, launchPlanSha256, launch.runKey, reservation.attempt)
      : undefined;
    if (
      (reservation.attempt !== 1 && reservation.attempt !== 2) ||
      !expected ||
      JSON.stringify(reservation) !== JSON.stringify(expected)
    ) {
      throw new Error(`stage attempt ledger contains an invalid reservation for ${reservation.runKey}`);
    }
  }
  if (
    ledger.reservations.filter((reservation) => reservation.attempt === 2).length >
    launchPlan.stageBudget.maximumInfrastructureRetryAttempts
  ) {
    throw new Error('stage attempt ledger exceeds the authorized retry count');
  }
  return ledger;
}

function writeStageAttemptLedger(runRoot: string, ledger: AdaptiveDevelopmentStageAttemptLedger): void {
  const path = join(runRoot, 'stage-attempt-reservations.json');
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function reservationKey(reservation: Pick<AdaptiveDevelopmentStageAttemptReservation, 'runKey' | 'attempt'>): string {
  return `${reservation.runKey}:attempt-${reservation.attempt}`;
}

function assertContainedPath(root: string, path: string): void {
  const fromRoot = relative(root, path);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) throw new Error('snapshot private path escapes root');
}

function signalProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid || pid <= 0) return;
  try {
    if (process.platform === 'win32') process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') throw error;
  }
}

export function parseAdaptiveDevelopmentCodexTelemetry(jsonl: string): AdaptiveDevelopmentCodexTelemetry {
  const telemetry: {
    threadId?: string;
    childThreadIds: Set<string>;
    collaborationToolCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    toolCalls: number;
    failedToolCalls: number;
    behavioralFailedToolCalls: number;
    infrastructureFailedToolCalls: number;
    completed: boolean;
    usageObserved: boolean;
  } = {
    childThreadIds: new Set<string>(),
    collaborationToolCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    behavioralFailedToolCalls: 0,
    infrastructureFailedToolCalls: 0,
    completed: false,
    usageObserved: false,
  };

  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    applyCodexTelemetryEvent(telemetry, parseJsonLine(line));
  }

  return {
    ...(telemetry.threadId ? { threadId: telemetry.threadId } : {}),
    childThreadIds: [...telemetry.childThreadIds].filter((id) => id !== telemetry.threadId).sort(),
    collaborationToolCalls: telemetry.collaborationToolCalls,
    inputTokens: telemetry.inputTokens,
    cachedInputTokens: telemetry.cachedInputTokens,
    outputTokens: telemetry.outputTokens,
    toolCalls: telemetry.toolCalls,
    failedToolCalls: telemetry.failedToolCalls,
    behavioralFailedToolCalls: telemetry.behavioralFailedToolCalls,
    infrastructureFailedToolCalls: telemetry.infrastructureFailedToolCalls,
    completed: telemetry.completed,
    usageObserved: telemetry.usageObserved,
  };
}

interface PersistedCodexThreadRow {
  readonly id: string;
  readonly rollout_path: string;
  readonly tokens_used: number;
}

interface PersistedCodexSpawnEdgeRow {
  readonly parent_thread_id: string;
  readonly child_thread_id: string;
}

interface PersistedCodexSessionUsage {
  readonly sessionId: string;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: number;
  readonly behavioralFailedToolCalls: number;
  readonly infrastructureFailedToolCalls: number;
  readonly collaborationToolCalls: number;
}

function persistedCodexStateDatabase(codexHome: string): string {
  const candidates = readdirSync(codexHome)
    .filter((name) => /^state_[1-9][0-9]*\.sqlite$/.test(name))
    .sort((left, right) => Number(right.slice(6, -7)) - Number(left.slice(6, -7)));
  if (candidates.length !== 1) {
    throw new Error(`isolated Codex thread ledger requires exactly one state database; found ${candidates.length}`);
  }
  const databaseName = candidates[0];
  if (!databaseName) throw new Error('isolated Codex thread ledger database disappeared');
  return join(codexHome, databaseName);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass validates the coupled terminal, token, and tool records in the append-only Codex rollout
function persistedCodexRolloutUsage(codexHome: string, row: PersistedCodexThreadRow): PersistedCodexSessionUsage {
  const home = realpathSync(codexHome);
  const rolloutPath = realpathSync(row.rollout_path);
  if (!rolloutPath.startsWith(`${home}${sep}`)) {
    throw new Error(`Codex rollout escaped its isolated thread ledger: ${row.id}`);
  }
  let sessionId: string | undefined;
  let taskCompleted = false;
  let inputTokens: number | undefined;
  let cachedInputTokens: number | undefined;
  let outputTokens: number | undefined;
  const toolCalls = new Map<
    string,
    {
      readonly failed: boolean;
      readonly behavioralFailure: boolean;
      readonly collaboration: boolean;
      readonly requiresOutput: boolean;
    }
  >();
  const toolOutputs = new Set<string>();
  for (const line of readFileSync(rolloutPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = parseJsonLine(line);
    if (!record) continue;
    const payload = objectField(record, 'payload');
    if (!payload) continue;
    if (record.type === 'session_meta') {
      sessionId = stringField(payload, 'id') ?? sessionId;
      continue;
    }
    if (record.type === 'event_msg' && payload.type === 'task_complete') {
      taskCompleted = true;
      continue;
    }
    if (record.type === 'event_msg' && payload.type === 'token_count') {
      const total = objectField(objectField(payload, 'info') ?? {}, 'total_token_usage');
      if (!total) continue;
      inputTokens = numberField(total, 'input_tokens');
      cachedInputTokens = numberField(total, 'cached_input_tokens');
      outputTokens = numberField(total, 'output_tokens');
      continue;
    }
    if (record.type !== 'response_item') continue;
    const callId = stringField(payload, 'call_id') ?? stringField(payload, 'id');
    if (!callId) continue;
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      toolOutputs.add(callId);
      continue;
    }
    if (!['function_call', 'custom_tool_call', 'local_shell_call'].includes(String(payload.type))) continue;
    const name = stringField(payload, 'name') ?? String(payload.type);
    toolCalls.set(callId, {
      failed: payload.status === 'failed',
      behavioralFailure:
        payload.status === 'failed' &&
        (payload.type === 'local_shell_call' || ['exec', 'exec_command', 'apply_patch'].includes(name)),
      collaboration: [
        'spawn_agent',
        'send_message',
        'followup_task',
        'wait_agent',
        'interrupt_agent',
        'list_agents',
      ].includes(name),
      requiresOutput: payload.type !== 'local_shell_call',
    });
  }
  if (
    sessionId !== row.id ||
    !taskCompleted ||
    inputTokens === undefined ||
    cachedInputTokens === undefined ||
    outputTokens === undefined ||
    row.tokens_used !== inputTokens + outputTokens
  ) {
    throw new Error(`Codex thread ledger is missing exact terminal usage for ${row.id}`);
  }
  for (const [callId, call] of toolCalls) {
    if (call.requiresOutput && !toolOutputs.has(callId)) {
      throw new Error(`Codex thread ledger contains an incomplete tool call for ${row.id}`);
    }
  }
  return {
    sessionId: row.id,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    toolCalls: toolCalls.size,
    failedToolCalls: [...toolCalls.values()].filter((call) => call.failed).length,
    behavioralFailedToolCalls: [...toolCalls.values()].filter((call) => call.behavioralFailure).length,
    infrastructureFailedToolCalls: [...toolCalls.values()].filter((call) => call.failed && !call.behavioralFailure)
      .length,
    collaborationToolCalls: [...toolCalls.values()].filter((call) => call.collaboration).length,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fail-closed reachability and exact aggregate checks must share one immutable ledger snapshot
export function observeAdaptiveDevelopmentCodexAgentGraph(input: {
  readonly codexHome: string;
  readonly rootTelemetry: AdaptiveDevelopmentCodexTelemetry;
}): AdaptiveDevelopmentCodexAgentGraphObservation {
  const rootSessionId = input.rootTelemetry.threadId;
  if (!rootSessionId || !input.rootTelemetry.completed || !input.rootTelemetry.usageObserved) {
    throw new Error('Codex agent graph observation requires exact root terminal telemetry');
  }
  const database = new Database(persistedCodexStateDatabase(input.codexHome), {
    readonly: true,
    fileMustExist: true,
  });
  let threads: PersistedCodexThreadRow[];
  let edges: PersistedCodexSpawnEdgeRow[];
  try {
    threads = database
      .prepare('SELECT id, rollout_path, tokens_used FROM threads ORDER BY id')
      .all() as unknown as PersistedCodexThreadRow[];
    edges = database
      .prepare('SELECT parent_thread_id, child_thread_id FROM thread_spawn_edges ORDER BY child_thread_id')
      .all() as unknown as PersistedCodexSpawnEdgeRow[];
  } finally {
    database.close();
  }
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  if (!threadById.has(rootSessionId)) throw new Error('Codex thread ledger does not contain the executor root');
  const reachable = new Set([rootSessionId]);
  for (;;) {
    let changed = false;
    for (const edge of edges) {
      if (!reachable.has(edge.parent_thread_id) || reachable.has(edge.child_thread_id)) continue;
      if (!threadById.has(edge.child_thread_id)) {
        throw new Error(`Codex thread ledger spawn edge has no child thread: ${edge.child_thread_id}`);
      }
      reachable.add(edge.child_thread_id);
      changed = true;
    }
    if (!changed) break;
  }
  if (reachable.size !== threads.length || threads.some((thread) => !reachable.has(thread.id))) {
    throw new Error('isolated Codex thread ledger contains a session outside the executor graph');
  }
  const directChildren = edges
    .filter((edge) => edge.parent_thread_id === rootSessionId)
    .map((edge) => edge.child_thread_id)
    .sort();
  if (
    input.rootTelemetry.childThreadIds.length > 0 &&
    (directChildren.some((id) => !input.rootTelemetry.childThreadIds.includes(id)) ||
      input.rootTelemetry.childThreadIds.some((id) => !directChildren.includes(id)))
  ) {
    throw new Error(
      `Codex JSONL and persisted thread ledger disagree about a direct child session: JSONL=${input.rootTelemetry.childThreadIds.join(',')} ledger=${directChildren.join(',')}`,
    );
  }
  const sessionUsages = [...reachable].sort().map((sessionId) => {
    const thread = threadById.get(sessionId);
    if (!thread) throw new Error(`Codex thread ledger lost reachable session ${sessionId}`);
    return persistedCodexRolloutUsage(input.codexHome, thread);
  });
  const rootUsage = sessionUsages.find((usage) => usage.sessionId === rootSessionId);
  if (!rootUsage) throw new Error('Codex thread ledger lost executor root usage');
  if (
    rootUsage.inputTokens !== input.rootTelemetry.inputTokens ||
    rootUsage.cachedInputTokens !== input.rootTelemetry.cachedInputTokens ||
    rootUsage.outputTokens !== input.rootTelemetry.outputTokens
  ) {
    throw new Error('Codex JSONL and persisted thread ledger disagree about root terminal usage');
  }
  const children = sessionUsages.filter((usage) => usage.sessionId !== rootSessionId);
  return {
    rootSessionId,
    childSessionIds: children.map((usage) => usage.sessionId),
    collaborationToolCalls:
      input.rootTelemetry.collaborationToolCalls +
      children.reduce((sum, usage) => sum + usage.collaborationToolCalls, 0),
    inputTokens: sessionUsages.reduce((sum, usage) => sum + usage.inputTokens, 0),
    cachedInputTokens: sessionUsages.reduce((sum, usage) => sum + usage.cachedInputTokens, 0),
    outputTokens: sessionUsages.reduce((sum, usage) => sum + usage.outputTokens, 0),
    toolCalls: input.rootTelemetry.toolCalls + children.reduce((sum, usage) => sum + usage.toolCalls, 0),
    failedToolCalls:
      input.rootTelemetry.failedToolCalls + children.reduce((sum, usage) => sum + usage.failedToolCalls, 0),
    behavioralFailedToolCalls:
      input.rootTelemetry.behavioralFailedToolCalls +
      children.reduce((sum, usage) => sum + usage.behavioralFailedToolCalls, 0),
    infrastructureFailedToolCalls:
      input.rootTelemetry.infrastructureFailedToolCalls +
      children.reduce((sum, usage) => sum + usage.infrastructureFailedToolCalls, 0),
    usageComplete: true,
    accountedSessionIds: sessionUsages.map((usage) => usage.sessionId),
  };
}

function parseExactRuntimeReviewPayload(value: unknown, expectedKind: string): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    return record.kind === expectedKind ? record : undefined;
  } catch {
    return undefined;
  }
}

function exactRuntimeReviewUnit(
  value: Record<string, unknown>,
  candidate: { readonly finalSha: string; readonly diffRef: string; readonly patchSha256: string },
): boolean {
  return (
    value.candidateSha === candidate.finalSha &&
    value.candidateDiffRef === candidate.diffRef &&
    value.candidatePatchSha256 === candidate.patchSha256
  );
}

function runtimeReviewFindings(
  value: unknown,
): { readonly p1: number; readonly p2: number; readonly p3: number } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const findings = { p1: record.p1, p2: record.p2, p3: record.p3 };
  if (!Object.values(findings).every((count) => typeof count === 'number' && Number.isInteger(count) && count >= 0)) {
    return undefined;
  }
  return findings as { readonly p1: number; readonly p2: number; readonly p3: number };
}

function exactRuntimeReviewPayloadFromAgentMessage(
  payload: Record<string, unknown>,
  expectedKind: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(payload.content)) return undefined;
  for (const item of payload.content) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const candidate = stringField(record, 'text') ?? stringField(record, 'encrypted_content');
    if (!candidate) continue;
    const parsed = parseExactRuntimeReviewPayload(
      candidate.replace(/^Message Type:[\s\S]*?Payload:\s*/m, ''),
      expectedKind,
    );
    if (parsed) return parsed;
  }
  return undefined;
}

interface AdaptiveDevelopmentRuntimeReviewObservationInput {
  readonly executorJsonl: string;
  readonly graph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly candidate: { readonly finalSha: string; readonly diffRef: string; readonly patchSha256: string };
  readonly codexHome?: string;
}

function authenticatedRuntimeReviewObservation(input: {
  readonly graph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly candidate: AdaptiveDevelopmentRuntimeReviewObservationInput['candidate'];
  readonly requestEventId: string;
  readonly reviewerSessionId: string;
  readonly verdictEventId: string;
  readonly verdict: Record<string, unknown>;
}): AdaptiveDevelopmentRuntimeIndependentReview | undefined {
  const findings = runtimeReviewFindings(input.verdict.findings);
  if (
    !findings ||
    !exactRuntimeReviewUnit(input.verdict, input.candidate) ||
    !['approved', 'changes_requested'].includes(String(input.verdict.state))
  ) {
    return undefined;
  }
  return {
    source: 'authenticated_runtime_observer',
    request: {
      eventId: input.requestEventId,
      authorSessionId: input.graph.rootSessionId,
      candidateSha: input.candidate.finalSha,
      candidateDiffRef: input.candidate.diffRef,
      candidatePatchSha256: input.candidate.patchSha256,
    },
    verdict: {
      eventId: input.verdictEventId,
      requestEventId: input.requestEventId,
      reviewerSessionId: input.reviewerSessionId,
      reviewerPrincipalId: fingerprintAdaptiveDevelopmentBenchmark({
        kind: 'codex-runtime-independent-reviewer.v1',
        rootSessionId: input.graph.rootSessionId,
        reviewerSessionId: input.reviewerSessionId,
        requestEventId: input.requestEventId,
      }),
      candidateSha: input.candidate.finalSha,
      candidateDiffRef: input.candidate.diffRef,
      candidatePatchSha256: input.candidate.patchSha256,
      state: input.verdict.state as 'approved' | 'changes_requested',
      findings,
    },
  };
}

function completedRuntimeCollaborationItems(executorJsonl: string): Array<{
  readonly item: Record<string, unknown>;
  readonly lineIndex: number;
}> {
  return executorJsonl
    .split(/\r?\n/)
    .map((line, lineIndex) => ({ event: line.trim() ? parseJsonLine(line) : undefined, lineIndex }))
    .flatMap(({ event, lineIndex }) => {
      const item = event?.type === 'item.completed' ? objectField(event, 'item') : undefined;
      const collaborationItem = ['collab_agent_tool_call', 'collab_tool_call'].includes(String(item?.type));
      return item && collaborationItem && item.status === 'completed' ? [{ item, lineIndex }] : [];
    });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: supports both authenticated collaboration envelope versions and causal request/wait matching
function observeRuntimeReviewFromExecutorJsonl(
  input: AdaptiveDevelopmentRuntimeReviewObservationInput,
): AdaptiveDevelopmentRuntimeIndependentReview[] {
  const requests: Array<{ eventId: string; reviewerSessionId: string; lineIndex: number }> = [];
  const waits: Array<{ eventId: string; states: Record<string, unknown>; lineIndex: number }> = [];
  for (const { item, lineIndex } of completedRuntimeCollaborationItems(input.executorJsonl)) {
    const eventId = stringField(item, 'id');
    if (!eventId) continue;
    if (item.tool === 'wait') {
      const states = objectField(item, 'agents_states');
      if (states) waits.push({ eventId, states, lineIndex });
      continue;
    }
    if (item.tool !== 'spawn_agent' || stringField(item, 'sender_thread_id') !== input.graph.rootSessionId) continue;
    const receivers = Array.isArray(item.receiver_thread_ids)
      ? item.receiver_thread_ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
    const fallback = input.graph.childSessionIds.length === 1 ? input.graph.childSessionIds[0] : undefined;
    const reviewerSessionId = receivers.length === 1 ? receivers[0] : receivers.length === 0 ? fallback : undefined;
    const request = parseExactRuntimeReviewPayload(
      stringField(item, 'prompt'),
      ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_REQUEST_KIND,
    );
    if (
      reviewerSessionId &&
      reviewerSessionId !== input.graph.rootSessionId &&
      input.graph.childSessionIds.includes(reviewerSessionId) &&
      request &&
      exactRuntimeReviewUnit(request, input.candidate)
    ) {
      requests.push({ eventId, reviewerSessionId, lineIndex });
    }
  }
  const observations: AdaptiveDevelopmentRuntimeIndependentReview[] = [];
  for (const request of requests) {
    for (const wait of waits.filter((candidate) => candidate.lineIndex > request.lineIndex)) {
      const state = objectField(wait.states, request.reviewerSessionId);
      const verdict =
        state?.status === 'completed'
          ? parseExactRuntimeReviewPayload(
              stringField(state, 'message'),
              ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_VERDICT_KIND,
            )
          : undefined;
      if (!verdict) continue;
      const observation = authenticatedRuntimeReviewObservation({
        graph: input.graph,
        candidate: input.candidate,
        requestEventId: request.eventId,
        reviewerSessionId: request.reviewerSessionId,
        verdictEventId: wait.eventId,
        verdict,
      });
      if (observation) observations.push(observation);
    }
  }
  return observations;
}

interface PersistedRuntimeReviewerEvidence {
  readonly reviewerAgentPath: string;
  readonly requestEventId: string;
  readonly childVerdict: Record<string, unknown>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: correlates the child spawn identity, delivered request, and terminal child verdict in one rollout pass
function readPersistedRuntimeReviewerEvidence(input: {
  readonly reviewerRow: PersistedCodexThreadRow;
  readonly rootSessionId: string;
  readonly candidate: AdaptiveDevelopmentRuntimeReviewObservationInput['candidate'];
}): PersistedRuntimeReviewerEvidence | undefined {
  let reviewerAgentPath: string | undefined;
  let requestAuthorPath: string | undefined;
  let requestEventId: string | undefined;
  let request: Record<string, unknown> | undefined;
  let childVerdict: Record<string, unknown> | undefined;
  for (const line of readFileSync(input.reviewerRow.rollout_path, 'utf8').split(/\r?\n/)) {
    const row = parseJsonLine(line);
    const payload = row && objectField(row, 'payload');
    if (!payload) continue;
    if (row?.type === 'session_meta') {
      const source = objectField(payload, 'source');
      const subagent = source && objectField(source, 'subagent');
      const spawn = subagent && objectField(subagent, 'thread_spawn');
      if (spawn?.parent_thread_id === input.rootSessionId) reviewerAgentPath = stringField(spawn, 'agent_path');
    }
    if (row?.type === 'response_item' && payload.type === 'agent_message') {
      const parsed = exactRuntimeReviewPayloadFromAgentMessage(
        payload,
        ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_REQUEST_KIND,
      );
      if (parsed) {
        request = parsed;
        requestEventId = stringField(payload, 'id');
        requestAuthorPath = stringField(payload, 'author');
      }
    }
    if (row?.type === 'event_msg' && payload.type === 'agent_message') {
      const parsed = parseExactRuntimeReviewPayload(
        stringField(payload, 'message'),
        ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_VERDICT_KIND,
      );
      if (parsed) childVerdict = parsed;
    }
  }
  if (
    !reviewerAgentPath ||
    !requestAuthorPath ||
    !reviewerAgentPath.startsWith(`${requestAuthorPath}/`) ||
    !requestEventId ||
    !request ||
    !exactRuntimeReviewUnit(request, input.candidate) ||
    !childVerdict
  ) {
    return undefined;
  }
  return { reviewerAgentPath, requestEventId, childVerdict };
}

function observeDeliveredRuntimeReview(input: {
  readonly rootRow: PersistedCodexThreadRow;
  readonly reviewerSessionId: string;
  readonly reviewer: PersistedRuntimeReviewerEvidence;
  readonly graph: AdaptiveDevelopmentCodexAgentGraphObservation;
  readonly candidate: AdaptiveDevelopmentRuntimeReviewObservationInput['candidate'];
}): AdaptiveDevelopmentRuntimeIndependentReview[] {
  const observations: AdaptiveDevelopmentRuntimeIndependentReview[] = [];
  for (const line of readFileSync(input.rootRow.rollout_path, 'utf8').split(/\r?\n/)) {
    const row = parseJsonLine(line);
    const payload = row && objectField(row, 'payload');
    if (row?.type !== 'response_item' || payload?.type !== 'agent_message') continue;
    if (payload.author !== input.reviewer.reviewerAgentPath) continue;
    const verdict = exactRuntimeReviewPayloadFromAgentMessage(payload, ADAPTIVE_DEVELOPMENT_FORMAL_REVIEW_VERDICT_KIND);
    const verdictEventId = stringField(payload, 'id');
    if (
      !verdict ||
      !verdictEventId ||
      fingerprintAdaptiveDevelopmentBenchmark(verdict) !==
        fingerprintAdaptiveDevelopmentBenchmark(input.reviewer.childVerdict)
    ) {
      continue;
    }
    const observation = authenticatedRuntimeReviewObservation({
      graph: input.graph,
      candidate: input.candidate,
      requestEventId: input.reviewer.requestEventId,
      reviewerSessionId: input.reviewerSessionId,
      verdictEventId,
      verdict,
    });
    if (observation) observations.push(observation);
  }
  return observations;
}

function observeRuntimeReviewFromPersistedLedger(
  input: AdaptiveDevelopmentRuntimeReviewObservationInput & { readonly codexHome: string },
): AdaptiveDevelopmentRuntimeIndependentReview[] {
  const database = new Database(persistedCodexStateDatabase(input.codexHome), { readonly: true, fileMustExist: true });
  let rows: PersistedCodexThreadRow[];
  try {
    rows = database
      .prepare('SELECT id, rollout_path, tokens_used FROM threads ORDER BY id')
      .all() as unknown as PersistedCodexThreadRow[];
  } finally {
    database.close();
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const rootRow = rowById.get(input.graph.rootSessionId);
  if (!rootRow) return [];
  return input.graph.childSessionIds.flatMap((reviewerSessionId) => {
    const reviewerRow = rowById.get(reviewerSessionId);
    if (!reviewerRow) return [];
    const reviewer = readPersistedRuntimeReviewerEvidence({
      reviewerRow,
      rootSessionId: input.graph.rootSessionId,
      candidate: input.candidate,
    });
    return reviewer
      ? observeDeliveredRuntimeReview({
          rootRow,
          reviewerSessionId,
          reviewer,
          graph: input.graph,
          candidate: input.candidate,
        })
      : [];
  });
}

/**
 * Converts only authenticated Codex collaboration envelopes into Formal Review evidence.
 * Root checkpoint prose is intentionally not an input to this producer.
 */
export function observeAdaptiveDevelopmentRuntimeIndependentReview(
  input: AdaptiveDevelopmentRuntimeReviewObservationInput,
): AdaptiveDevelopmentRuntimeIndependentReview | undefined {
  const stdoutObservations = observeRuntimeReviewFromExecutorJsonl(input);
  const observations =
    stdoutObservations.length > 0
      ? stdoutObservations
      : input.codexHome
        ? observeRuntimeReviewFromPersistedLedger({ ...input, codexHome: input.codexHome })
        : [];
  if (observations.length > 1) throw new Error('Codex runtime emitted ambiguous exact Formal Review verdicts');
  return observations[0];
}

function parseJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function applyCodexTelemetryEvent(
  telemetry: {
    threadId?: string;
    childThreadIds: Set<string>;
    collaborationToolCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    toolCalls: number;
    failedToolCalls: number;
    behavioralFailedToolCalls: number;
    infrastructureFailedToolCalls: number;
    completed: boolean;
    usageObserved: boolean;
  },
  event: Record<string, unknown> | undefined,
): void {
  if (!event) return;
  if (event.type === 'thread.started') {
    telemetry.threadId = stringField(event, 'thread_id') ?? stringField(event, 'threadId') ?? telemetry.threadId;
  }
  collectAdaptiveDevelopmentChildThreadIds(event, telemetry.childThreadIds);
  if (event.type === 'item.started' && objectField(event, 'item')?.type === 'collab_agent_tool_call') {
    telemetry.collaborationToolCalls += 1;
  }
  if (event.type === 'item.started' && isToolItem(event.item)) telemetry.toolCalls += 1;
  if (event.type === 'item.completed' && isFailedToolItem(event.item)) {
    telemetry.failedToolCalls += 1;
    if (isBehavioralToolFailure(event.item)) telemetry.behavioralFailedToolCalls += 1;
    else telemetry.infrastructureFailedToolCalls += 1;
  }
  if (event.type !== 'turn.completed') return;
  telemetry.completed = true;
  const usage = objectField(event, 'usage');
  if (!usage) return;
  const inputTokens = numberField(usage, 'input_tokens');
  const cachedInputTokens = numberField(usage, 'cached_input_tokens');
  const outputTokens = numberField(usage, 'output_tokens');
  if (inputTokens === undefined || cachedInputTokens === undefined || outputTokens === undefined) return;
  telemetry.inputTokens = inputTokens;
  telemetry.cachedInputTokens = cachedInputTokens;
  telemetry.outputTokens = outputTokens;
  telemetry.usageObserved = true;
}

function collectAdaptiveDevelopmentChildThreadIds(value: unknown, threadIds: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      collectAdaptiveDevelopmentChildThreadIds(entry, threadIds);
    });
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    'new_thread_id',
    'newThreadId',
    'child_thread_id',
    'childThreadId',
    'agent_thread_id',
    'agentThreadId',
  ]) {
    const threadId = record[key];
    if (typeof threadId === 'string' && threadId) threadIds.add(threadId);
  }
  for (const key of ['receiver_thread_ids', 'receiverThreadIds', 'thread_ids', 'threadIds']) {
    const values = record[key];
    if (!Array.isArray(values)) continue;
    for (const threadId of values) {
      if (typeof threadId === 'string' && threadId) threadIds.add(threadId);
    }
  }
  Object.values(record).forEach((entry) => {
    collectAdaptiveDevelopmentChildThreadIds(entry, threadIds);
  });
}

export function readAdaptiveDevelopmentStructuredOutput(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Codex structured output must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function writeAdaptiveDevelopmentProcessLogs(
  directory: string,
  prefix: string,
  result: AdaptiveDevelopmentProcessResult,
): void {
  writeFileSync(`${directory}/${prefix}.stdout.jsonl`, result.stdout, { encoding: 'utf8', flag: 'wx' });
  writeFileSync(`${directory}/${prefix}.stderr.log`, result.stderr, { encoding: 'utf8', flag: 'wx' });
}

export function attachAdaptiveDevelopmentBenchmarkArtifacts(
  evidenceInput: Omit<AdaptiveDevelopmentBenchmarkEvidence, 'artifacts'>,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  store: AdaptiveDevelopmentBenchmarkArtifactStore,
): AdaptiveDevelopmentBenchmarkEvidence {
  const evidenceForFacts = { ...evidenceInput, artifacts: [] } as AdaptiveDevelopmentBenchmarkEvidence;
  const artifacts = REQUIRED_ARTIFACT_KINDS.map((kind) =>
    store.write({
      schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_ARTIFACT_VERSION,
      benchmarkId: evidenceInput.benchmarkId,
      manifestSha256: evidenceInput.manifestSha256,
      runId: evidenceInput.runId,
      stageId: evidenceInput.stageId,
      taskId: evidenceInput.taskId,
      armId: evidenceInput.armId,
      repetition: evidenceInput.repetition,
      attempt: evidenceInput.attempt,
      launchPlanSha256: evidenceInput.launchPlanSha256,
      kind,
      factsSha256: fingerprintAdaptiveDevelopmentBenchmark(
        adaptiveDevelopmentBenchmarkArtifactFacts(evidenceForFacts, manifest, kind),
      ),
    }),
  );
  return parseAdaptiveDevelopmentBenchmarkEvidence({ ...evidenceInput, artifacts });
}

function objectField(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value ? value : undefined;
}

function numberField(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function tomlInlineTable(entries: Readonly<Record<string, string>>): string {
  return `{${Object.entries(entries)
    .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join(',')}}`;
}

function isToolItem(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const type = (value as Record<string, unknown>).type;
  return typeof type === 'string' && type !== 'agent_message' && type !== 'reasoning';
}

function isFailedToolItem(value: unknown): boolean {
  return isToolItem(value) && (value as Record<string, unknown>).status === 'failed';
}

function isBehavioralToolFailure(value: unknown): boolean {
  if (!isFailedToolItem(value)) return false;
  const type = (value as Record<string, unknown>).type;
  return type === 'command_execution' || type === 'file_change';
}
