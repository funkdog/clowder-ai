import type { RedisClient } from '@cat-cafe/shared/utils';
import { fingerprintAdaptiveDevelopmentBenchmark } from './adaptive-development-benchmark-contract.js';
import {
  ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
  type AdaptiveDevelopmentOperationalCanaryPlan,
  type AdaptiveDevelopmentOperationalCanaryReceipt,
  assertAdaptiveDevelopmentOperationalCanaryReceipt,
  parseAdaptiveDevelopmentOperationalCanaryPlan,
} from './adaptive-development-operational-canary.js';

export const ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_EXECUTION_VERSION =
  'lf-0001.adaptive-operational-canary-execution.v2' as const;

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

export interface AdaptiveDevelopmentOperationalCanaryAuthorityBinding {
  readonly operatorUserId: string;
  readonly threadId: string;
  readonly messageStoreIdentitySha256: string;
  readonly runtimeInstanceIdentitySha256: string;
}

export interface AdaptiveDevelopmentOperationalCanaryReservation {
  readonly reservedAt: string;
  readonly tokenPolicy: 'unbounded';
  readonly roles: readonly [
    { readonly role: 'executor'; readonly tokenPolicy: 'unbounded' },
    { readonly role: 'reviewer'; readonly tokenPolicy: 'unbounded' },
  ];
}

export interface AdaptiveDevelopmentOperationalCanaryExecutionRecord {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_EXECUTION_VERSION;
  readonly state: 'authorized' | 'reserved' | 'running' | 'passed' | 'failed';
  readonly canaryPlanSha256: string;
  readonly plan: AdaptiveDevelopmentOperationalCanaryPlan;
  readonly authority: AdaptiveDevelopmentOperationalCanaryAuthorityBinding;
  readonly authorizedAt: string;
  readonly reservation?: AdaptiveDevelopmentOperationalCanaryReservation;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly receipt?: AdaptiveDevelopmentOperationalCanaryReceipt;
  readonly receiptSha256?: string;
  readonly receiptArtifactSha256?: string;
  readonly failedAt?: string;
  readonly failureSha256?: string;
}

type RedisOperationalCanaryStoreClient = Pick<RedisClient, 'get' | 'eval'>;

export function adaptiveDevelopmentOperationalCanaryExecutionKey(canaryPlanSha256: string): string {
  assertSha256(canaryPlanSha256, 'operational canary plan');
  return `harness-eval:adaptive-development:operational-canary-execution:v2:${canaryPlanSha256}`;
}

export function adaptiveDevelopmentOperationalCanaryApprovalClaimKey(approvalRef: string): string {
  const match = /^cat-cafe:\/\/message\/([A-Za-z0-9-]+)$/.exec(approvalRef);
  if (!match) throw new Error('operational canary approval reference is invalid');
  return `harness-eval:adaptive-development:operational-canary-approval:v1:${encodeURIComponent(match[1])}`;
}

export class RedisAdaptiveDevelopmentOperationalCanaryExecutionStore {
  constructor(private readonly redis: RedisOperationalCanaryStoreClient) {}

  async authorize(input: {
    readonly plan: AdaptiveDevelopmentOperationalCanaryPlan;
    readonly authority: AdaptiveDevelopmentOperationalCanaryAuthorityBinding;
    readonly authorizedAt: string;
  }): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    const plan = parseAdaptiveDevelopmentOperationalCanaryPlan(input.plan);
    const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
    assertAuthority(input.authority);
    assertTimestamp(input.authorizedAt, 'operational canary authorization');
    if (Date.parse(input.authorizedAt) <= Date.parse(plan.authorization.approvedAt)) {
      throw new Error('operational canary execution authorization must follow the durable operator approval');
    }
    const record = {
      schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_EXECUTION_VERSION,
      state: 'authorized',
      canaryPlanSha256,
      plan,
      authority: input.authority,
      authorizedAt: input.authorizedAt,
    } satisfies AdaptiveDevelopmentOperationalCanaryExecutionRecord;
    const result = Number(
      await this.redis.eval(
        AUTHORIZE_LUA,
        2,
        adaptiveDevelopmentOperationalCanaryExecutionKey(canaryPlanSha256),
        adaptiveDevelopmentOperationalCanaryApprovalClaimKey(plan.authorization.approvalRef),
        JSON.stringify(record),
        canaryPlanSha256,
      ),
    );
    if (result === -1) throw new Error('operational canary plan has already been consumed');
    if (result === -2) throw new Error('operational canary approval message has already been consumed');
    if (result !== 1) throw new Error('operational canary execution authorization claim failed');
    return record;
  }

  async reserve(
    canaryPlanSha256: string,
    reservedAt: string,
  ): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    assertTimestamp(reservedAt, 'operational canary reservation');
    return await this.transition(canaryPlanSha256, ['authorized'], (current) => {
      assertTimeAfter(reservedAt, current.authorizedAt, 'operational canary reservation');
      return {
        ...current,
        state: 'reserved',
        reservation: {
          reservedAt,
          tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
          roles: [
            { role: 'executor', tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY },
            { role: 'reviewer', tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY },
          ],
        },
      };
    });
  }

  async start(
    canaryPlanSha256: string,
    startedAt: string,
  ): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    assertTimestamp(startedAt, 'operational canary execution start');
    return await this.transition(canaryPlanSha256, ['reserved'], (current) => {
      if (!current.reservation) throw new Error('operational canary execution is missing its reservation');
      assertTimeAfter(startedAt, current.reservation.reservedAt, 'operational canary execution start');
      return { ...current, state: 'running', startedAt };
    });
  }

  async pass(
    canaryPlanSha256: string,
    input: {
      readonly completedAt: string;
      readonly receipt: AdaptiveDevelopmentOperationalCanaryReceipt;
      readonly receiptSha256: string;
      readonly receiptArtifactSha256: string;
    },
  ): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    assertTimestamp(input.completedAt, 'operational canary completion');
    assertAdaptiveDevelopmentOperationalCanaryReceipt(input.receipt);
    assertSha256(input.receiptSha256, 'operational canary receipt');
    assertSha256(input.receiptArtifactSha256, 'operational canary receipt artifact');
    if (fingerprintAdaptiveDevelopmentBenchmark(input.receipt) !== input.receiptSha256) {
      throw new Error('operational canary receipt hash does not match its canonical content');
    }
    return await this.transition(canaryPlanSha256, ['running'], (current) => {
      if (!current.startedAt || !current.reservation) {
        throw new Error('operational canary passing execution is missing runtime state');
      }
      assertTimeAfter(input.completedAt, current.startedAt, 'operational canary completion');
      if (
        input.receipt.canaryPlanSha256 !== current.canaryPlanSha256 ||
        input.receipt.canaryScopeSha256 !== current.plan.canaryScopeSha256 ||
        input.receipt.runnerCommit !== current.plan.scope.runnerCommit ||
        input.receipt.environmentSha256 !== current.plan.scope.environmentSha256 ||
        input.receipt.modelId !== current.plan.scope.modelId ||
        input.receipt.completedAt !== input.completedAt
      ) {
        throw new Error('operational canary passing receipt does not bind the claimed execution');
      }
      return {
        ...current,
        state: 'passed',
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
  ): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    assertTimestamp(input.failedAt, 'operational canary failure');
    assertSha256(input.failureSha256, 'operational canary failure');
    return await this.transition(canaryPlanSha256, ['authorized', 'reserved', 'running'], (current) => {
      assertTimeAfter(
        input.failedAt,
        current.startedAt ?? current.reservation?.reservedAt ?? current.authorizedAt,
        'operational canary failure',
      );
      return {
        ...current,
        state: 'failed',
        failedAt: input.failedAt,
        failureSha256: input.failureSha256,
      };
    });
  }

  async get(canaryPlanSha256: string): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord | null> {
    const raw = await this.redis.get(adaptiveDevelopmentOperationalCanaryExecutionKey(canaryPlanSha256));
    if (!raw) return null;
    return parseAdaptiveDevelopmentOperationalCanaryExecutionRecord(raw, canaryPlanSha256);
  }

  private async transition(
    canaryPlanSha256: string,
    expectedStates: readonly AdaptiveDevelopmentOperationalCanaryExecutionRecord['state'][],
    build: (
      current: AdaptiveDevelopmentOperationalCanaryExecutionRecord,
    ) => AdaptiveDevelopmentOperationalCanaryExecutionRecord,
  ): Promise<AdaptiveDevelopmentOperationalCanaryExecutionRecord> {
    const key = adaptiveDevelopmentOperationalCanaryExecutionKey(canaryPlanSha256);
    const raw = await this.redis.get(key);
    if (!raw) throw new Error('operational canary execution record is missing');
    const current = parseAdaptiveDevelopmentOperationalCanaryExecutionRecord(raw, canaryPlanSha256);
    if (!expectedStates.includes(current.state)) {
      throw new Error(`operational canary execution cannot transition from ${current.state}`);
    }
    const next = build(current);
    assertAdaptiveDevelopmentOperationalCanaryExecutionRecord(next, canaryPlanSha256);
    const claimed = Number(await this.redis.eval(CAS_LUA, 1, key, raw, JSON.stringify(next)));
    if (claimed !== 1) throw new Error('operational canary execution transition lost an atomic race');
    return next;
  }
}

export function assertAdaptiveDevelopmentOperationalCanaryExecutionRecord(
  value: unknown,
  expectedCanaryPlanSha256?: string,
): asserts value is AdaptiveDevelopmentOperationalCanaryExecutionRecord {
  if (!isRecord(value)) throw new Error('operational canary execution record must be an object');
  const record = value as Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>;
  const plan = assertExecutionRecordIdentity(record, expectedCanaryPlanSha256);
  const baseKeys = ['schemaVersion', 'state', 'canaryPlanSha256', 'plan', 'authority', 'authorizedAt'];
  switch (record.state) {
    case 'authorized':
      assertExactKeys(record, baseKeys, 'authorized operational canary execution');
      return;
    case 'reserved':
      assertReservedExecution(record, baseKeys);
      return;
    case 'running':
      assertRunningExecution(record, baseKeys);
      return;
    case 'passed':
      assertPassedExecution(record, plan, baseKeys);
      return;
    case 'failed':
      assertFailedExecution(record, baseKeys);
      return;
    default:
      throw new Error('operational canary execution record has an invalid lifecycle state');
  }
}

function assertExecutionRecordIdentity(
  record: Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>,
  expectedCanaryPlanSha256?: string,
): AdaptiveDevelopmentOperationalCanaryPlan {
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_EXECUTION_VERSION ||
    !['authorized', 'reserved', 'running', 'passed', 'failed'].includes(record.state ?? '')
  ) {
    throw new Error('operational canary execution record has an invalid lifecycle state');
  }
  const plan = parseAdaptiveDevelopmentOperationalCanaryPlan(record.plan);
  const canaryPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(plan);
  assertSha256(record.canaryPlanSha256, 'operational canary execution plan');
  if (
    record.canaryPlanSha256 !== canaryPlanSha256 ||
    (expectedCanaryPlanSha256 !== undefined && record.canaryPlanSha256 !== expectedCanaryPlanSha256)
  ) {
    throw new Error('operational canary execution record does not bind its exact plan');
  }
  assertAuthority(record.authority);
  assertTimestamp(record.authorizedAt, 'operational canary execution authorization');
  assertTimeAfter(record.authorizedAt, plan.authorization.approvedAt, 'operational canary execution authorization');
  return plan;
}

function assertReservedExecution(
  record: Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>,
  baseKeys: readonly string[],
): void {
  assertReservation(record.reservation, record.authorizedAt as string);
  assertExactKeys(record, [...baseKeys, 'reservation'], 'reserved operational canary execution');
}

function assertRunningExecution(
  record: Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>,
  baseKeys: readonly string[],
): void {
  assertReservation(record.reservation, record.authorizedAt as string);
  assertTimestamp(record.startedAt, 'operational canary execution start');
  assertTimeAfter(record.startedAt, record.reservation.reservedAt, 'operational canary execution start');
  assertExactKeys(record, [...baseKeys, 'reservation', 'startedAt'], 'running operational canary execution');
}

function assertPassedExecution(
  record: Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>,
  plan: AdaptiveDevelopmentOperationalCanaryPlan,
  baseKeys: readonly string[],
): void {
  assertReservation(record.reservation, record.authorizedAt as string);
  assertTimestamp(record.startedAt, 'operational canary execution start');
  assertTimeAfter(record.startedAt, record.reservation.reservedAt, 'operational canary execution start');
  assertTimestamp(record.completedAt, 'operational canary completion');
  assertTimeAfter(record.completedAt, record.startedAt, 'operational canary completion');
  assertAdaptiveDevelopmentOperationalCanaryReceipt(record.receipt);
  assertSha256(record.receiptSha256, 'operational canary receipt');
  assertSha256(record.receiptArtifactSha256, 'operational canary receipt artifact');
  if (
    fingerprintAdaptiveDevelopmentBenchmark(record.receipt) !== record.receiptSha256 ||
    record.receipt.canaryPlanSha256 !== record.canaryPlanSha256 ||
    record.receipt.canaryScopeSha256 !== plan.canaryScopeSha256 ||
    record.receipt.runnerCommit !== plan.scope.runnerCommit ||
    record.receipt.environmentSha256 !== plan.scope.environmentSha256 ||
    record.receipt.modelId !== plan.scope.modelId ||
    record.receipt.completedAt !== record.completedAt
  ) {
    throw new Error('operational canary passed execution does not bind its receipt');
  }
  assertExactKeys(
    record,
    [...baseKeys, 'reservation', 'startedAt', 'completedAt', 'receipt', 'receiptSha256', 'receiptArtifactSha256'],
    'passed operational canary execution',
  );
}

function assertFailedExecution(
  record: Partial<AdaptiveDevelopmentOperationalCanaryExecutionRecord>,
  baseKeys: readonly string[],
): void {
  assertTimestamp(record.failedAt, 'operational canary failure');
  assertSha256(record.failureSha256, 'operational canary failure');
  if (record.reservation !== undefined) assertReservation(record.reservation, record.authorizedAt as string);
  if (record.startedAt !== undefined) {
    if (!record.reservation) throw new Error('operational canary failed start is missing its reservation');
    assertTimestamp(record.startedAt, 'operational canary execution start');
    assertTimeAfter(record.startedAt, record.reservation.reservedAt, 'operational canary execution start');
  }
  assertTimeAfter(
    record.failedAt,
    record.startedAt ?? record.reservation?.reservedAt ?? (record.authorizedAt as string),
    'operational canary failure',
  );
  assertExactKeys(
    record,
    [
      ...baseKeys,
      ...(record.reservation ? ['reservation'] : []),
      ...(record.startedAt ? ['startedAt'] : []),
      'failedAt',
      'failureSha256',
    ],
    'failed operational canary execution',
  );
}

function parseAdaptiveDevelopmentOperationalCanaryExecutionRecord(
  raw: string,
  expectedCanaryPlanSha256?: string,
): AdaptiveDevelopmentOperationalCanaryExecutionRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('operational canary execution record is corrupt');
  }
  assertAdaptiveDevelopmentOperationalCanaryExecutionRecord(value, expectedCanaryPlanSha256);
  return value;
}

function assertReservation(
  value: unknown,
  authorizedAt: string,
): asserts value is AdaptiveDevelopmentOperationalCanaryReservation {
  if (!isRecord(value)) throw new Error('operational canary reservation is missing');
  assertExactKeys(value, ['reservedAt', 'tokenPolicy', 'roles'], 'operational canary reservation');
  assertTimestamp(value.reservedAt, 'operational canary reservation');
  assertTimeAfter(value.reservedAt, authorizedAt, 'operational canary reservation');
  if (
    value.tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    !Array.isArray(value.roles) ||
    value.roles.length !== 2 ||
    !isRecord(value.roles[0]) ||
    !isRecord(value.roles[1])
  ) {
    throw new Error('operational canary reservation does not contain the exact unbounded token policy');
  }
  assertExactKeys(value.roles[0], ['role', 'tokenPolicy'], 'operational canary executor reservation');
  assertExactKeys(value.roles[1], ['role', 'tokenPolicy'], 'operational canary reviewer reservation');
  if (
    value.roles[0].role !== 'executor' ||
    value.roles[0].tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    value.roles[1].role !== 'reviewer' ||
    value.roles[1].tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY
  ) {
    throw new Error('operational canary reservation does not contain the exact role token policies');
  }
}

function assertAuthority(value: unknown): asserts value is AdaptiveDevelopmentOperationalCanaryAuthorityBinding {
  if (!isRecord(value)) throw new Error('operational canary authority binding is missing');
  assertExactKeys(
    value,
    ['operatorUserId', 'threadId', 'messageStoreIdentitySha256', 'runtimeInstanceIdentitySha256'],
    'operational canary authority binding',
  );
  if (
    typeof value.operatorUserId !== 'string' ||
    !value.operatorUserId ||
    typeof value.threadId !== 'string' ||
    !value.threadId
  ) {
    throw new Error('operational canary authority identity is invalid');
  }
  assertSha256(value.messageStoreIdentitySha256, 'operational canary MessageStore identity');
  assertSha256(value.runtimeInstanceIdentitySha256, 'operational canary runtime identity');
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
