import type { RedisClient } from '@cat-cafe/shared/utils';
import { fingerprintAdaptiveDevelopmentBenchmark } from './adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_FEEDBACK_SCOPE_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_REVIEW_SCOPE_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION,
  ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
  type AdaptiveDevelopmentConvergenceCanaryPlan,
  type AdaptiveDevelopmentConvergenceCanaryReceipt,
  assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt,
  assertAdaptiveDevelopmentConvergenceCanaryHistoricalReceipt,
  assertAdaptiveDevelopmentConvergenceCanaryPreRubricReceipt,
  parseAdaptiveDevelopmentConvergenceCanaryPlan,
} from './adaptive-development-convergence-canary.js';

export const ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION =
  'lf-0001.development-convergence-canary-execution.v1' as const;

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

export interface AdaptiveDevelopmentConvergenceCanaryAuthorityBinding {
  readonly operatorUserId: string;
  readonly threadId: string;
  readonly messageStoreIdentitySha256: string;
  readonly runtimeInstanceIdentitySha256: string;
}

export interface AdaptiveDevelopmentConvergenceCanaryReservation {
  readonly reservedAt: string;
  readonly tokenPolicy: 'unbounded';
  readonly roles: readonly [
    { readonly role: 'executor'; readonly executions: 1; readonly tokenPolicy: 'unbounded' },
    { readonly role: 'judge'; readonly postHoc: true; readonly feedbackToCandidate: false; readonly tokenPolicy: 'unbounded' },
  ];
}

interface AdaptiveDevelopmentConvergenceCanaryHistoricalReservation {
  readonly reservedAt: string;
  readonly tokenPolicy: 'unbounded';
  readonly roles: readonly [
    { readonly role: 'executor'; readonly rounds: readonly [1, 2]; readonly tokenPolicy: 'unbounded' },
    { readonly role: 'reviewer'; readonly rounds: readonly [1, 2]; readonly tokenPolicy: 'unbounded' },
  ];
}

export interface AdaptiveDevelopmentConvergenceCanaryExecutionRecord {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION;
  readonly state: 'authorized' | 'reserved' | 'running' | 'completed' | 'failed';
  readonly canaryPlanSha256: string;
  readonly plan: AdaptiveDevelopmentConvergenceCanaryPlan;
  readonly authority: AdaptiveDevelopmentConvergenceCanaryAuthorityBinding;
  readonly authorizedAt: string;
  readonly reservation?:
    | AdaptiveDevelopmentConvergenceCanaryReservation
    | AdaptiveDevelopmentConvergenceCanaryHistoricalReservation;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly receipt?: AdaptiveDevelopmentConvergenceCanaryReceipt;
  readonly receiptSha256?: string;
  readonly receiptArtifactSha256?: string;
  readonly failedAt?: string;
  readonly failureSha256?: string;
}

type RedisConvergenceCanaryStoreClient = Pick<RedisClient, 'get' | 'eval'>;

export function adaptiveDevelopmentConvergenceCanaryExecutionKey(canaryPlanSha256: string): string {
  assertSha256(canaryPlanSha256, 'convergence canary plan');
  return `harness-eval:adaptive-development:convergence-canary-execution:v1:${canaryPlanSha256}`;
}

export function adaptiveDevelopmentConvergenceCanaryApprovalClaimKey(approvalRef: string): string {
  const match = /^cat-cafe:\/\/message\/([A-Za-z0-9-]+)$/.exec(approvalRef);
  if (!match) throw new Error('convergence canary approval reference is invalid');
  return `harness-eval:adaptive-development:convergence-canary-approval:v1:${encodeURIComponent(match[1])}`;
}

export class RedisAdaptiveDevelopmentConvergenceCanaryExecutionStore {
  constructor(private readonly redis: RedisConvergenceCanaryStoreClient) {}

  async authorize(input: {
    readonly plan: AdaptiveDevelopmentConvergenceCanaryPlan;
    readonly authority: AdaptiveDevelopmentConvergenceCanaryAuthorityBinding;
    readonly authorizedAt: string;
  }): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    const plan = parseAdaptiveDevelopmentConvergenceCanaryPlan(input.plan);
    assertCurrentConvergenceCanaryPlan(plan);
    const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    assertAuthority(input.authority);
    assertTimestamp(input.authorizedAt, 'convergence canary authorization');
    assertTimeAfter(input.authorizedAt, plan.authorization.approvedAt, 'convergence canary authorization');
    const record: AdaptiveDevelopmentConvergenceCanaryExecutionRecord = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION,
      state: 'authorized',
      canaryPlanSha256,
      plan,
      authority: input.authority,
      authorizedAt: input.authorizedAt,
    };
    const result = Number(
      await this.redis.eval(
        AUTHORIZE_LUA,
        2,
        adaptiveDevelopmentConvergenceCanaryExecutionKey(canaryPlanSha256),
        adaptiveDevelopmentConvergenceCanaryApprovalClaimKey(plan.authorization.approvalRef),
        JSON.stringify(record),
        canaryPlanSha256,
      ),
    );
    if (result === -1) throw new Error('convergence canary plan has already been consumed');
    if (result === -2) throw new Error('convergence canary approval message has already been consumed');
    if (result !== 1) throw new Error('convergence canary authorization claim failed');
    return record;
  }

  async reserve(
    canaryPlanSha256: string,
    reservedAt: string,
  ): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    assertTimestamp(reservedAt, 'convergence canary reservation');
    return await this.transition(canaryPlanSha256, ['authorized'], (current) => {
      assertTimeAfter(reservedAt, current.authorizedAt, 'convergence canary reservation');
      return {
        ...current,
        state: 'reserved',
        reservation: {
          reservedAt,
          tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
          roles: [
            { role: 'executor', executions: 1, tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY },
            {
              role: 'judge',
              postHoc: true,
              feedbackToCandidate: false,
              tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
            },
          ],
        },
      };
    });
  }

  async start(
    canaryPlanSha256: string,
    startedAt: string,
  ): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    assertTimestamp(startedAt, 'convergence canary execution start');
    return await this.transition(canaryPlanSha256, ['reserved'], (current) => {
      if (!current.reservation) throw new Error('convergence canary execution is missing its reservation');
      assertTimeAfter(startedAt, current.reservation.reservedAt, 'convergence canary execution start');
      return { ...current, state: 'running', startedAt };
    });
  }

  async complete(
    canaryPlanSha256: string,
    input: {
      readonly completedAt: string;
      readonly receipt: AdaptiveDevelopmentConvergenceCanaryReceipt;
      readonly receiptSha256: string;
      readonly receiptArtifactSha256: string;
    },
  ): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    assertTimestamp(input.completedAt, 'convergence canary completion');
    assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(input.receipt);
    assertSha256(input.receiptSha256, 'convergence canary receipt');
    assertSha256(input.receiptArtifactSha256, 'convergence canary receipt artifact');
    if (fingerprintAdaptiveDevelopmentBenchmark(input.receipt) !== input.receiptSha256) {
      throw new Error('convergence canary receipt hash does not match its canonical content');
    }
    return await this.transition(canaryPlanSha256, ['running'], (current) => {
      if (!current.startedAt || !current.reservation) {
        throw new Error('convergence canary completion is missing runtime state');
      }
      assertTimeAfter(input.completedAt, current.startedAt, 'convergence canary completion');
      assertReceiptBinding(input.receipt, current, input.completedAt);
      return {
        ...current,
        state: 'completed',
        completedAt: input.completedAt,
        receipt: input.receipt,
        receiptSha256: input.receiptSha256,
        receiptArtifactSha256: input.receiptArtifactSha256,
      };
    });
  }

  async fail(
    canaryPlanSha256: string,
    input: { readonly failedAt: string; readonly failureSha256: string },
  ): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    assertTimestamp(input.failedAt, 'convergence canary failure');
    assertSha256(input.failureSha256, 'convergence canary failure');
    return await this.transition(canaryPlanSha256, ['authorized', 'reserved', 'running'], (current) => {
      assertTimeAfter(
        input.failedAt,
        current.startedAt ?? current.reservation?.reservedAt ?? current.authorizedAt,
        'convergence canary failure',
      );
      return { ...current, state: 'failed', failedAt: input.failedAt, failureSha256: input.failureSha256 };
    });
  }

  async get(canaryPlanSha256: string): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord | null> {
    const raw = await this.redis.get(adaptiveDevelopmentConvergenceCanaryExecutionKey(canaryPlanSha256));
    if (!raw) return null;
    return parseExecutionRecord(raw, canaryPlanSha256);
  }

  private async transition(
    canaryPlanSha256: string,
    expectedStates: readonly AdaptiveDevelopmentConvergenceCanaryExecutionRecord['state'][],
    build: (
      current: AdaptiveDevelopmentConvergenceCanaryExecutionRecord,
    ) => AdaptiveDevelopmentConvergenceCanaryExecutionRecord,
  ): Promise<AdaptiveDevelopmentConvergenceCanaryExecutionRecord> {
    const key = adaptiveDevelopmentConvergenceCanaryExecutionKey(canaryPlanSha256);
    const raw = await this.redis.get(key);
    if (!raw) throw new Error('convergence canary execution record is missing');
    const current = parseExecutionRecord(raw, canaryPlanSha256);
    assertCurrentConvergenceCanaryPlan(current.plan);
    if (!expectedStates.includes(current.state)) {
      throw new Error(`convergence canary execution cannot transition from ${current.state}`);
    }
    const next = build(current);
    assertAdaptiveDevelopmentConvergenceCanaryExecutionRecord(next, canaryPlanSha256);
    const claimed = Number(await this.redis.eval(CAS_LUA, 1, key, raw, JSON.stringify(next)));
    if (claimed !== 1) throw new Error('convergence canary execution transition lost an atomic race');
    return next;
  }
}

function assertCurrentConvergenceCanaryPlan(plan: AdaptiveDevelopmentConvergenceCanaryPlan): void {
  if (plan.scope.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    throw new Error('convergence canary durable writes require a current rubric-calibrated scope');
  }
}

export function assertAdaptiveDevelopmentConvergenceCanaryExecutionRecord(
  value: unknown,
  expectedCanaryPlanSha256?: string,
): asserts value is AdaptiveDevelopmentConvergenceCanaryExecutionRecord {
  if (!isRecord(value)) throw new Error('convergence canary execution record must be an object');
  const record = value as Partial<AdaptiveDevelopmentConvergenceCanaryExecutionRecord>;
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_EXECUTION_VERSION ||
    !['authorized', 'reserved', 'running', 'completed', 'failed'].includes(record.state ?? '')
  ) {
    throw new Error('convergence canary execution record has an invalid lifecycle state');
  }
  const plan = parseAdaptiveDevelopmentConvergenceCanaryPlan(record.plan);
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  if (
    record.canaryPlanSha256 !== canaryPlanSha256 ||
    (expectedCanaryPlanSha256 !== undefined && record.canaryPlanSha256 !== expectedCanaryPlanSha256)
  ) {
    throw new Error('convergence canary execution record does not bind its exact plan');
  }
  assertAuthority(record.authority);
  assertTimestamp(record.authorizedAt, 'convergence canary authorization');
  assertTimeAfter(record.authorizedAt, plan.authorization.approvedAt, 'convergence canary authorization');
  assertExecutionRuntimeState(
    record,
    plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION ||
      plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION,
  );
  if (record.state === 'completed') assertCompletedExecution(record, plan);
  if (record.state === 'failed') assertFailedExecution(record);
  assertLifecycleKeys(record);
}

function assertExecutionRuntimeState(
  record: Partial<AdaptiveDevelopmentConvergenceCanaryExecutionRecord>,
  currentScope: boolean,
): void {
  assertTimestamp(record.authorizedAt, 'convergence canary authorization');
  if (record.reservation) assertReservation(record.reservation, record.authorizedAt, currentScope);
  if (record.startedAt) {
    if (!record.reservation) throw new Error('convergence canary started execution is missing its reservation');
    assertTimestamp(record.startedAt, 'convergence canary execution start');
    assertTimeAfter(record.startedAt, record.reservation.reservedAt, 'convergence canary execution start');
  }
}

function assertCompletedExecution(
  record: Partial<AdaptiveDevelopmentConvergenceCanaryExecutionRecord>,
  plan: AdaptiveDevelopmentConvergenceCanaryPlan,
): void {
  if (!record.startedAt || !record.completedAt) throw new Error('convergence canary completion is incomplete');
  assertTimestamp(record.completedAt, 'convergence canary completion');
  assertTimeAfter(record.completedAt, record.startedAt, 'convergence canary completion');
  if (plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION) {
    assertAdaptiveDevelopmentConvergenceCanaryCurrentReceipt(record.receipt);
  } else if (plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_PRE_RUBRIC_SCOPE_VERSION) {
    assertAdaptiveDevelopmentConvergenceCanaryPreRubricReceipt(record.receipt);
  } else {
    const progressionPolicy =
      plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_REVIEW_SCOPE_VERSION ||
      plan.scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_FEEDBACK_SCOPE_VERSION
        ? 'review_feedback'
        : 'oracle_feedback';
    assertAdaptiveDevelopmentConvergenceCanaryHistoricalReceipt(record.receipt, progressionPolicy);
  }
  assertSha256(record.receiptSha256, 'convergence canary receipt');
  assertSha256(record.receiptArtifactSha256, 'convergence canary receipt artifact');
  if (fingerprintAdaptiveDevelopmentBenchmark(record.receipt) !== record.receiptSha256) {
    throw new Error('convergence canary completed execution has a corrupt receipt');
  }
  assertReceiptBinding(
    record.receipt,
    record as AdaptiveDevelopmentConvergenceCanaryExecutionRecord,
    record.completedAt,
  );
}

function assertFailedExecution(record: Partial<AdaptiveDevelopmentConvergenceCanaryExecutionRecord>): void {
  assertTimestamp(record.authorizedAt, 'convergence canary authorization');
  assertTimestamp(record.failedAt, 'convergence canary failure');
  assertSha256(record.failureSha256, 'convergence canary failure');
  assertTimeAfter(
    record.failedAt,
    record.startedAt ?? record.reservation?.reservedAt ?? record.authorizedAt,
    'convergence canary failure',
  );
}

function assertReceiptBinding(
  receipt: AdaptiveDevelopmentConvergenceCanaryReceipt,
  record: AdaptiveDevelopmentConvergenceCanaryExecutionRecord,
  completedAt: string,
): void {
  const scope = record.plan.scope;
  if (
    receipt.canaryPlanSha256 !== record.canaryPlanSha256 ||
    receipt.canaryScopeSha256 !== record.plan.canaryScopeSha256 ||
    receipt.runnerCommit !== scope.runnerCommit ||
    receipt.environmentSha256 !== scope.environmentSha256 ||
    receipt.manifestSha256 !== scope.manifestSha256 ||
    receipt.modelId !== scope.modelId ||
    receipt.canaryId !== scope.canaryId ||
    receipt.taskId !== scope.taskId ||
    receipt.armId !== scope.armId ||
    JSON.stringify(receipt.behaviorIds) !== JSON.stringify(scope.behaviorIds) ||
    (scope.schemaVersion === ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_SCOPE_VERSION &&
      (receipt.reviewBoundaryRubricSha256 !== scope.reviewBoundaryRubricSha256 ||
        receipt.reviewBoundaryCalibrationCertificateSha256 !== scope.reviewBoundaryCalibrationCertificateSha256 ||
        receipt.calibrationCoverage !== scope.calibrationCoverage ||
        receipt.overallSopCalibrationComplete !== scope.overallSopCalibrationComplete)) ||
    receipt.completedAt !== completedAt
  ) {
    throw new Error('convergence canary receipt does not bind the claimed execution');
  }
}

function assertLifecycleKeys(record: Partial<AdaptiveDevelopmentConvergenceCanaryExecutionRecord>): void {
  const base = ['schemaVersion', 'state', 'canaryPlanSha256', 'plan', 'authority', 'authorizedAt'];
  const byState: Record<string, string[]> = {
    authorized: base,
    reserved: [...base, 'reservation'],
    running: [...base, 'reservation', 'startedAt'],
    completed: [
      ...base,
      'reservation',
      'startedAt',
      'completedAt',
      'receipt',
      'receiptSha256',
      'receiptArtifactSha256',
    ],
    failed: [
      ...base,
      ...(record.reservation ? ['reservation'] : []),
      ...(record.startedAt ? ['startedAt'] : []),
      'failedAt',
      'failureSha256',
    ],
  };
  assertExactKeys(
    record as Record<string, unknown>,
    byState[record.state as string],
    `${record.state} convergence canary execution`,
  );
}

function assertReservation(
  value: unknown,
  authorizedAt: string,
  currentScope: boolean,
): asserts value is
  | AdaptiveDevelopmentConvergenceCanaryReservation
  | AdaptiveDevelopmentConvergenceCanaryHistoricalReservation {
  if (!isRecord(value)) throw new Error('convergence canary reservation is missing');
  assertExactKeys(value, ['reservedAt', 'tokenPolicy', 'roles'], 'convergence canary reservation');
  assertTimestamp(value.reservedAt, 'convergence canary reservation');
  assertTimeAfter(value.reservedAt, authorizedAt, 'convergence canary reservation');
  const expectedRoles = currentScope
    ? [
        { role: 'executor', executions: 1, tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY },
        {
          role: 'judge',
          postHoc: true,
          feedbackToCandidate: false,
          tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY,
        },
      ]
    : [
        { role: 'executor', rounds: [1, 2], tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY },
        { role: 'reviewer', rounds: [1, 2], tokenPolicy: ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY },
      ];
  if (
    value.tokenPolicy !== ADAPTIVE_DEVELOPMENT_CONVERGENCE_CANARY_TOKEN_POLICY ||
    JSON.stringify(value.roles) !== JSON.stringify(expectedRoles)
  ) {
    throw new Error('convergence canary reservation does not bind its exact execution and measurement roles');
  }
}

function assertAuthority(value: unknown): asserts value is AdaptiveDevelopmentConvergenceCanaryAuthorityBinding {
  if (!isRecord(value)) throw new Error('convergence canary authority binding is missing');
  assertExactKeys(
    value,
    ['operatorUserId', 'threadId', 'messageStoreIdentitySha256', 'runtimeInstanceIdentitySha256'],
    'convergence canary authority binding',
  );
  if (
    typeof value.operatorUserId !== 'string' ||
    !value.operatorUserId ||
    typeof value.threadId !== 'string' ||
    !value.threadId
  ) {
    throw new Error('convergence canary authority identity is invalid');
  }
  assertSha256(value.messageStoreIdentitySha256, 'convergence canary MessageStore identity');
  assertSha256(value.runtimeInstanceIdentitySha256, 'convergence canary runtime identity');
}

function parseExecutionRecord(
  raw: string,
  expectedCanaryPlanSha256: string,
): AdaptiveDevelopmentConvergenceCanaryExecutionRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('convergence canary execution record is corrupt');
  }
  assertAdaptiveDevelopmentConvergenceCanaryExecutionRecord(value, expectedCanaryPlanSha256);
  return value;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains an unexpected field`);
  }
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
