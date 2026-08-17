import type { RedisClient } from '@cat-cafe/shared/utils';
import {
  type AdaptiveDevelopmentBenchmarkLaunchPlan,
  fingerprintAdaptiveDevelopmentBenchmark,
  parseAdaptiveDevelopmentBenchmarkLaunchPlan,
} from './adaptive-development-benchmark-contract.js';

export const ADAPTIVE_DEVELOPMENT_BENCHMARK_EXECUTION_VERSION = 'lf-0001.development-benchmark-execution.v1' as const;

const AUTHORIZE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return -1
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return -2
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return 1
`;

const CAS_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

export interface AdaptiveDevelopmentBenchmarkExecutionAuthority {
  readonly operatorUserId: string;
  readonly threadId: string;
  readonly messageStoreIdentitySha256: string;
  readonly runtimeInstanceIdentitySha256: string;
}

export interface AdaptiveDevelopmentBenchmarkAttemptBinding {
  readonly runKey: string;
  readonly attempt: 1 | 2;
  readonly reservationSha256: string;
}

interface ReservedAttempt extends AdaptiveDevelopmentBenchmarkAttemptBinding {
  readonly state: 'reserved';
  readonly reservedAt: string;
}

interface RunningAttempt extends AdaptiveDevelopmentBenchmarkAttemptBinding {
  readonly state: 'running';
  readonly reservedAt: string;
  readonly runId: string;
  readonly startedAt: string;
}

interface ReceiptAttempt extends AdaptiveDevelopmentBenchmarkAttemptBinding {
  readonly state: 'terminal';
  readonly terminalKind: 'receipt';
  readonly reservedAt: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly receiptSha256: string;
  readonly infrastructureError: boolean;
  readonly stopStage: boolean;
}

interface NotStartedAttempt extends AdaptiveDevelopmentBenchmarkAttemptBinding {
  readonly state: 'terminal';
  readonly terminalKind: 'not_started';
  readonly reservedAt: string;
  readonly completedAt: string;
}

export type AdaptiveDevelopmentBenchmarkExecutionAttempt =
  | ReservedAttempt
  | RunningAttempt
  | ReceiptAttempt
  | NotStartedAttempt;

export interface AdaptiveDevelopmentBenchmarkExecutionRecord {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_BENCHMARK_EXECUTION_VERSION;
  readonly state: 'authorized' | 'running' | 'completed' | 'failed';
  readonly launchPlanSha256: string;
  readonly plan: AdaptiveDevelopmentBenchmarkLaunchPlan;
  readonly authority: AdaptiveDevelopmentBenchmarkExecutionAuthority;
  readonly authorizedAt: string;
  readonly attempts: readonly AdaptiveDevelopmentBenchmarkExecutionAttempt[];
  readonly completedAt?: string;
  readonly evaluationSha256?: string;
  readonly resultStatus?: 'stop' | 'insufficient_evidence' | 'measurement_smoke_complete' | 'ready_for_analysis';
  readonly failedAt?: string;
  readonly failureSha256?: string;
}

type RedisBenchmarkExecutionStoreClient = Pick<RedisClient, 'get' | 'eval'>;

export function adaptiveDevelopmentBenchmarkExecutionKey(launchPlanSha256: string): string {
  assertSha256(launchPlanSha256, 'benchmark launch plan');
  return `harness-eval:adaptive-development:benchmark-execution:v1:${launchPlanSha256}`;
}

export function adaptiveDevelopmentBenchmarkApprovalClaimKey(approvalRef: string): string {
  const match = /^cat-cafe:\/\/message\/([A-Za-z0-9-]+)$/.exec(approvalRef);
  if (!match) throw new Error('benchmark approval reference is invalid');
  return `harness-eval:adaptive-development:benchmark-approval:v1:${encodeURIComponent(match[1])}`;
}

export class RedisAdaptiveDevelopmentBenchmarkExecutionStore {
  constructor(private readonly redis: RedisBenchmarkExecutionStoreClient) {}

  async authorize(input: {
    readonly plan: AdaptiveDevelopmentBenchmarkLaunchPlan;
    readonly authority: AdaptiveDevelopmentBenchmarkExecutionAuthority;
    readonly authorizedAt: string;
  }): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    const plan = parseAdaptiveDevelopmentBenchmarkLaunchPlan(input.plan);
    if (plan.executionMode !== 'live' || plan.authorization.kind !== 'operator_approval') {
      throw new Error('benchmark execution store accepts only operator-approved live plans');
    }
    assertAuthority(input.authority);
    assertTimestamp(input.authorizedAt, 'benchmark execution authorization');
    assertTimeAfter(input.authorizedAt, plan.authorization.approvedAt, 'benchmark execution authorization');
    const record = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_EXECUTION_VERSION,
      state: 'authorized',
      launchPlanSha256: fingerprintAdaptiveDevelopmentBenchmark(plan),
      plan,
      authority: input.authority,
      authorizedAt: input.authorizedAt,
      attempts: [],
    } satisfies AdaptiveDevelopmentBenchmarkExecutionRecord;
    assertAdaptiveDevelopmentBenchmarkExecutionRecord(record, record.launchPlanSha256);
    const claimed = Number(
      await this.redis.eval(
        AUTHORIZE_LUA,
        2,
        adaptiveDevelopmentBenchmarkExecutionKey(record.launchPlanSha256),
        adaptiveDevelopmentBenchmarkApprovalClaimKey(plan.authorization.approvalRef),
        JSON.stringify(record),
        record.launchPlanSha256,
      ),
    );
    if (claimed === -1) throw new Error('benchmark launch plan has already been consumed');
    if (claimed === -2) throw new Error('benchmark approval message has already been consumed');
    if (claimed !== 1) throw new Error('benchmark execution authorization claim failed');
    return record;
  }

  async reserveInitialAttempts(
    launchPlanSha256: string,
    input: { readonly attempts: readonly AdaptiveDevelopmentBenchmarkAttemptBinding[]; readonly reservedAt: string },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.reservedAt, 'benchmark initial attempt reservation');
    return await this.transition(launchPlanSha256, ['authorized'], (current) => {
      assertTimeAfter(input.reservedAt, current.authorizedAt, 'benchmark initial attempt reservation');
      assertInitialAttemptSet(input.attempts, current.plan);
      return {
        ...current,
        state: 'running',
        attempts: input.attempts.map((attempt) => ({ ...attempt, state: 'reserved', reservedAt: input.reservedAt })),
      };
    });
  }

  async reserveRetry(
    launchPlanSha256: string,
    input: { readonly attempt: AdaptiveDevelopmentBenchmarkAttemptBinding; readonly reservedAt: string },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.reservedAt, 'benchmark retry reservation');
    assertAttemptBinding(input.attempt);
    if (input.attempt.attempt !== 2) throw new Error('benchmark retry must be attempt 2');
    return await this.transition(launchPlanSha256, ['running'], (current) => {
      if (!current.plan.runs.some((run) => run.runKey === input.attempt.runKey)) {
        throw new Error('benchmark retry is not bound to an authorized run');
      }
      if (current.attempts.some((attempt) => sameAttempt(attempt, input.attempt))) {
        throw new Error('benchmark retry attempt is already reserved');
      }
      if (
        current.attempts.filter((attempt) => attempt.attempt === 2).length >=
        current.plan.stageBudget.maximumInfrastructureRetryAttempts
      ) {
        throw new Error('benchmark execution retry limit is exhausted');
      }
      const first = current.attempts.find(
        (attempt) => attempt.runKey === input.attempt.runKey && attempt.attempt === 1,
      );
      if (!first || first.state !== 'terminal' || first.terminalKind !== 'receipt' || !first.infrastructureError) {
        throw new Error('benchmark retry requires a terminal infrastructure-error first attempt');
      }
      assertTimeAfter(input.reservedAt, first.completedAt, 'benchmark retry reservation');
      return {
        ...current,
        attempts: [...current.attempts, { ...input.attempt, state: 'reserved', reservedAt: input.reservedAt }],
      };
    });
  }

  async startAttempt(
    launchPlanSha256: string,
    input: { readonly runKey: string; readonly attempt: 1 | 2; readonly runId: string; readonly startedAt: string },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.startedAt, 'benchmark attempt start');
    assertRunId(input.runId);
    return await this.transition(launchPlanSha256, ['running'], (current) => {
      const index = current.attempts.findIndex(
        (attempt) => attempt.runKey === input.runKey && attempt.attempt === input.attempt,
      );
      const selected = current.attempts[index];
      if (!selected || selected.state !== 'reserved') {
        throw new Error('benchmark attempt is not reserved or is already running');
      }
      if (
        current.attempts.some(
          (attempt) =>
            (attempt.state === 'running' || (attempt.state === 'terminal' && attempt.terminalKind === 'receipt')) &&
            attempt.runId === input.runId,
        )
      ) {
        throw new Error('benchmark run id is already consumed');
      }
      assertTimeAfter(input.startedAt, selected.reservedAt, 'benchmark attempt start');
      const attempts = [...current.attempts];
      attempts[index] = { ...selected, state: 'running', runId: input.runId, startedAt: input.startedAt };
      return { ...current, attempts };
    });
  }

  async finishAttempt(
    launchPlanSha256: string,
    input: {
      readonly runKey: string;
      readonly attempt: 1 | 2;
      readonly runId: string;
      readonly completedAt: string;
      readonly receiptSha256: string;
      readonly infrastructureError: boolean;
      readonly stopStage: boolean;
    },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.completedAt, 'benchmark attempt completion');
    assertSha256(input.receiptSha256, 'benchmark attempt receipt');
    return await this.transition(launchPlanSha256, ['running'], (current) => {
      const index = current.attempts.findIndex(
        (attempt) => attempt.runKey === input.runKey && attempt.attempt === input.attempt,
      );
      const selected = current.attempts[index];
      if (!selected || selected.state !== 'running' || selected.runId !== input.runId) {
        throw new Error('benchmark attempt is not the claimed running attempt');
      }
      assertTimeAfter(input.completedAt, selected.startedAt, 'benchmark attempt completion');
      const attempts = [...current.attempts];
      attempts[index] = {
        ...selected,
        state: 'terminal',
        terminalKind: 'receipt',
        completedAt: input.completedAt,
        receiptSha256: input.receiptSha256,
        infrastructureError: input.infrastructureError,
        stopStage: input.stopStage,
      };
      return { ...current, attempts };
    });
  }

  async complete(
    launchPlanSha256: string,
    input: {
      readonly completedAt: string;
      readonly evaluationSha256: string;
      readonly resultStatus: NonNullable<AdaptiveDevelopmentBenchmarkExecutionRecord['resultStatus']>;
    },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.completedAt, 'benchmark execution completion');
    assertSha256(input.evaluationSha256, 'benchmark execution evaluation');
    return await this.transition(launchPlanSha256, ['running'], (current) => {
      if (current.attempts.some((attempt) => attempt.state === 'running')) {
        throw new Error('benchmark execution cannot complete with an indeterminate running attempt');
      }
      const attempts = current.attempts.map((attempt) =>
        attempt.state === 'reserved'
          ? ({ ...attempt, state: 'terminal', terminalKind: 'not_started', completedAt: input.completedAt } as const)
          : attempt,
      );
      return {
        ...current,
        state: 'completed',
        attempts,
        completedAt: input.completedAt,
        evaluationSha256: input.evaluationSha256,
        resultStatus: input.resultStatus,
      };
    });
  }

  async fail(
    launchPlanSha256: string,
    input: { readonly failedAt: string; readonly failureSha256: string },
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    assertTimestamp(input.failedAt, 'benchmark execution failure');
    assertSha256(input.failureSha256, 'benchmark execution failure');
    return await this.transition(launchPlanSha256, ['authorized', 'running'], (current) => ({
      ...current,
      state: 'failed',
      failedAt: input.failedAt,
      failureSha256: input.failureSha256,
    }));
  }

  async get(launchPlanSha256: string): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord | null> {
    const raw = await this.redis.get(adaptiveDevelopmentBenchmarkExecutionKey(launchPlanSha256));
    if (!raw) return null;
    return parseExecutionRecord(raw, launchPlanSha256);
  }

  private async transition(
    launchPlanSha256: string,
    expectedStates: readonly AdaptiveDevelopmentBenchmarkExecutionRecord['state'][],
    build: (current: AdaptiveDevelopmentBenchmarkExecutionRecord) => AdaptiveDevelopmentBenchmarkExecutionRecord,
  ): Promise<AdaptiveDevelopmentBenchmarkExecutionRecord> {
    const key = adaptiveDevelopmentBenchmarkExecutionKey(launchPlanSha256);
    const raw = await this.redis.get(key);
    if (!raw) throw new Error('benchmark execution record is missing');
    const current = parseExecutionRecord(raw, launchPlanSha256);
    if (!expectedStates.includes(current.state)) {
      throw new Error(`benchmark execution cannot transition from ${current.state}`);
    }
    const next = build(current);
    assertAdaptiveDevelopmentBenchmarkExecutionRecord(next, launchPlanSha256);
    const claimed = Number(await this.redis.eval(CAS_LUA, 1, key, raw, JSON.stringify(next)));
    if (claimed !== 1) throw new Error('benchmark execution transition lost an atomic race');
    return next;
  }
}

export function assertAdaptiveDevelopmentBenchmarkExecutionRecord(
  value: unknown,
  expectedLaunchPlanSha256?: string,
): asserts value is AdaptiveDevelopmentBenchmarkExecutionRecord {
  const { record, plan } = assertExecutionRecordIdentity(value, expectedLaunchPlanSha256);
  assertExecutionRecordAttempts(record, plan);
  assertExecutionRecordLifecycle(record, plan);
}

function assertExecutionRecordIdentity(
  value: unknown,
  expectedLaunchPlanSha256?: string,
): {
  readonly record: Partial<AdaptiveDevelopmentBenchmarkExecutionRecord>;
  readonly plan: AdaptiveDevelopmentBenchmarkLaunchPlan;
} {
  if (!isRecord(value)) throw new Error('benchmark execution record must be an object');
  const record = value as Partial<AdaptiveDevelopmentBenchmarkExecutionRecord>;
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_BENCHMARK_EXECUTION_VERSION ||
    !['authorized', 'running', 'completed', 'failed'].includes(record.state ?? '')
  ) {
    throw new Error('benchmark execution record has an invalid lifecycle state');
  }
  const plan = parseAdaptiveDevelopmentBenchmarkLaunchPlan(record.plan);
  if (plan.executionMode !== 'live' || plan.authorization.kind !== 'operator_approval') {
    throw new Error('benchmark execution record does not contain a live operator plan');
  }
  const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  assertSha256(record.launchPlanSha256, 'benchmark execution launch plan');
  if (
    record.launchPlanSha256 !== launchPlanSha256 ||
    (expectedLaunchPlanSha256 !== undefined && record.launchPlanSha256 !== expectedLaunchPlanSha256)
  ) {
    throw new Error('benchmark execution record does not bind its exact launch plan');
  }
  assertAuthority(record.authority);
  assertTimestamp(record.authorizedAt, 'benchmark execution authorization');
  assertTimeAfter(record.authorizedAt, plan.authorization.approvedAt, 'benchmark execution authorization');
  return { record, plan };
}

function assertExecutionRecordAttempts(
  record: Partial<AdaptiveDevelopmentBenchmarkExecutionRecord>,
  plan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): void {
  if (!Array.isArray(record.attempts)) throw new Error('benchmark execution attempts are missing');
  const keys = new Set<string>();
  for (const attempt of record.attempts) {
    assertExecutionAttempt(attempt, plan);
    const key = `${attempt.runKey}:${attempt.attempt}`;
    if (keys.has(key)) throw new Error('benchmark execution contains a duplicate attempt');
    keys.add(key);
  }
}

function assertExecutionRecordLifecycle(
  record: Partial<AdaptiveDevelopmentBenchmarkExecutionRecord>,
  plan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): void {
  if (!Array.isArray(record.attempts)) throw new Error('benchmark execution attempts are missing');
  if (record.state === 'authorized') {
    if (record.attempts.length !== 0) throw new Error('authorized benchmark execution already contains attempts');
  } else if (record.state === 'running') {
    assertInitialAttemptSet(
      record.attempts.filter((attempt) => attempt.attempt === 1),
      plan,
    );
  } else if (record.state === 'completed') {
    if (record.attempts.some((attempt) => attempt.state !== 'terminal')) {
      throw new Error('completed benchmark execution contains a non-terminal attempt');
    }
    assertTimestamp(record.completedAt, 'benchmark execution completion');
    assertSha256(record.evaluationSha256, 'benchmark execution evaluation');
    if (
      !['stop', 'insufficient_evidence', 'measurement_smoke_complete', 'ready_for_analysis'].includes(
        record.resultStatus ?? '',
      )
    ) {
      throw new Error('benchmark execution result status is invalid');
    }
  } else {
    assertTimestamp(record.failedAt, 'benchmark execution failure');
    assertSha256(record.failureSha256, 'benchmark execution failure');
  }
}

function parseExecutionRecord(
  raw: string,
  expectedLaunchPlanSha256: string,
): AdaptiveDevelopmentBenchmarkExecutionRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('benchmark execution record is corrupt');
  }
  assertAdaptiveDevelopmentBenchmarkExecutionRecord(value, expectedLaunchPlanSha256);
  return value;
}

function assertInitialAttemptSet(
  attempts: readonly AdaptiveDevelopmentBenchmarkAttemptBinding[],
  plan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): void {
  if (attempts.length !== plan.runs.length) throw new Error('benchmark initial attempt set is incomplete');
  const runKeys = new Set<string>();
  for (const attempt of attempts) {
    assertAttemptBinding(attempt);
    if (
      attempt.attempt !== 1 ||
      !plan.runs.some((run) => run.runKey === attempt.runKey) ||
      runKeys.has(attempt.runKey)
    ) {
      throw new Error('benchmark initial attempt set does not bind every exact plan run once');
    }
    runKeys.add(attempt.runKey);
  }
}

function assertExecutionAttempt(
  value: unknown,
  plan: AdaptiveDevelopmentBenchmarkLaunchPlan,
): asserts value is AdaptiveDevelopmentBenchmarkExecutionAttempt {
  assertAttemptBinding(value);
  if (!plan.runs.some((run) => run.runKey === value.runKey)) {
    throw new Error('benchmark execution attempt is not bound to a plan run');
  }
  if (!isRecord(value) || !['reserved', 'running', 'terminal'].includes(String(value.state))) {
    throw new Error('benchmark execution attempt state is invalid');
  }
  assertTimestamp(value.reservedAt, 'benchmark attempt reservation');
  if (value.state === 'reserved') return;
  if (value.state === 'running') {
    assertRunId(value.runId);
    assertTimestamp(value.startedAt, 'benchmark attempt start');
    assertTimeAfter(value.startedAt, value.reservedAt, 'benchmark attempt start');
    return;
  }
  assertTimestamp(value.completedAt, 'benchmark attempt terminal state');
  if (value.terminalKind === 'not_started') return;
  if (value.terminalKind !== 'receipt') throw new Error('benchmark terminal attempt kind is invalid');
  assertRunId(value.runId);
  assertTimestamp(value.startedAt, 'benchmark attempt start');
  assertTimeAfter(value.completedAt, value.startedAt, 'benchmark attempt terminal state');
  assertSha256(value.receiptSha256, 'benchmark attempt receipt');
  if (typeof value.infrastructureError !== 'boolean' || typeof value.stopStage !== 'boolean') {
    throw new Error('benchmark terminal attempt result flags are invalid');
  }
}

function assertAttemptBinding(value: unknown): asserts value is AdaptiveDevelopmentBenchmarkAttemptBinding {
  if (!isRecord(value) || typeof value.runKey !== 'string' || !value.runKey) {
    throw new Error('benchmark attempt binding is invalid');
  }
  if (value.attempt !== 1 && value.attempt !== 2) throw new Error('benchmark attempt number is invalid');
  assertSha256(value.reservationSha256, 'benchmark attempt reservation');
}

function assertAuthority(value: unknown): asserts value is AdaptiveDevelopmentBenchmarkExecutionAuthority {
  if (
    !isRecord(value) ||
    typeof value.operatorUserId !== 'string' ||
    !value.operatorUserId ||
    typeof value.threadId !== 'string' ||
    !value.threadId
  ) {
    throw new Error('benchmark execution authority is invalid');
  }
  assertSha256(value.messageStoreIdentitySha256, 'benchmark execution MessageStore identity');
  assertSha256(value.runtimeInstanceIdentitySha256, 'benchmark execution runtime identity');
}

function sameAttempt(
  left: AdaptiveDevelopmentBenchmarkExecutionAttempt,
  right: AdaptiveDevelopmentBenchmarkAttemptBinding,
): boolean {
  return left.runKey === right.runKey && left.attempt === right.attempt;
}

function assertRunId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^run-[A-Za-z0-9-]+$/.test(value)) throw new Error('benchmark run id is invalid');
}

function assertTimeAfter(value: string, earlier: string, label: string): void {
  if (Date.parse(value) <= Date.parse(earlier)) throw new Error(`${label} must follow the prior lifecycle state`);
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} timestamp is invalid`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
