import { fingerprintAdaptiveDevelopmentBenchmark } from './adaptive-development-benchmark-contract.js';

export const ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_SCOPE_VERSION =
  'lf-0001.adaptive-operational-canary-scope.v2' as const;
export const ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION =
  'lf-0001.adaptive-operational-canary-plan.v2' as const;
export const ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION =
  'lf-0001.adaptive-operational-canary-receipt.v3' as const;
export const ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY = 'unbounded' as const;

export interface AdaptiveDevelopmentOperationalCanaryScope {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_SCOPE_VERSION;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly modelId: string;
  readonly roles: readonly [
    { readonly role: 'executor'; readonly filesystemAccess: 'write'; readonly tokenPolicy: 'unbounded' },
    { readonly role: 'reviewer'; readonly filesystemAccess: 'read'; readonly tokenPolicy: 'unbounded' },
  ];
  readonly tokenPolicy: 'unbounded';
}

export interface AdaptiveDevelopmentOperationalCanaryAuthorization {
  readonly kind: 'operator_approval';
  readonly approvalRef: string;
  readonly approvalMessageSha256: string;
  readonly approvedOperationalCanaryScopeSha256: string;
  readonly approvedAt: string;
}

export interface AdaptiveDevelopmentOperationalCanaryPlan {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION;
  readonly canaryScopeSha256: string;
  readonly scope: AdaptiveDevelopmentOperationalCanaryScope;
  readonly authorization: AdaptiveDevelopmentOperationalCanaryAuthorization;
}

interface AdaptiveDevelopmentOperationalCanaryRoleReceipt {
  readonly filesystemAccess: 'write' | 'read';
  readonly tokenPolicy: 'unbounded';
  readonly credentialMounted: true;
  readonly credentialRemoved: true;
  readonly completed: true;
  readonly usageObserved: true;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
  readonly failedToolCalls: 0;
}

export interface AdaptiveDevelopmentOperationalCanaryReceipt {
  readonly schemaVersion: typeof ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION;
  readonly status: 'passed';
  readonly zeroModelProvider: false;
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly modelId: string;
  readonly canaryScopeSha256: string;
  readonly canaryPlanSha256: string;
  readonly tokenPolicy: 'unbounded';
  readonly completedAt: string;
  readonly roles: {
    readonly executor: AdaptiveDevelopmentOperationalCanaryRoleReceipt & {
      readonly filesystemAccess: 'write';
      readonly markerSha256: string;
      readonly postModelCommit: string;
    };
    readonly reviewer: AdaptiveDevelopmentOperationalCanaryRoleReceipt & {
      readonly filesystemAccess: 'read';
      readonly observedMarkerSha256: string;
      readonly observationCommandSha256: string;
    };
  };
}

export interface AdaptiveDevelopmentOperationalCanaryReviewerObservation {
  readonly command: string;
  readonly aggregatedOutput: string;
  readonly exitCode: 0;
}

export function assertAdaptiveDevelopmentOperationalCanaryReviewerObservation(
  jsonl: string,
  markerSha256: string,
): AdaptiveDevelopmentOperationalCanaryReviewerObservation {
  assertSha256(markerSha256, 'operational canary reviewer marker');
  const expectedCommand = '/usr/bin/shasum -a 256 .adaptive-operational-canary';
  for (const line of jsonl.split(/\r?\n/)) {
    const observation = completedOperationalCanaryCommandExecution(line);
    if (!observation || normalizeOperationalCanaryCommand(observation.command) !== expectedCommand) continue;
    const outputFields = observation.aggregatedOutput.trim().split(/\s+/);
    if (
      outputFields.length === 2 &&
      outputFields[0] === markerSha256 &&
      outputFields[1] === '.adaptive-operational-canary'
    ) {
      return observation;
    }
  }
  throw new Error('operational canary reviewer did not bind the marker hash to the required read command');
}

function completedOperationalCanaryCommandExecution(
  line: string,
): AdaptiveDevelopmentOperationalCanaryReviewerObservation | undefined {
  if (!line.trim()) return undefined;
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return undefined;
  const eventRecord = event as { type?: unknown; item?: unknown };
  if (eventRecord.type !== 'item.completed' || !eventRecord.item || typeof eventRecord.item !== 'object') {
    return undefined;
  }
  const item = eventRecord.item as Record<string, unknown>;
  if (
    item.type !== 'command_execution' ||
    item.status !== 'completed' ||
    item.exit_code !== 0 ||
    typeof item.command !== 'string' ||
    typeof item.aggregated_output !== 'string'
  ) {
    return undefined;
  }
  return { command: item.command, aggregatedOutput: item.aggregated_output, exitCode: 0 };
}

function normalizeOperationalCanaryCommand(command: string): string {
  const shellPrefix = '/bin/zsh -lc ';
  if (!command.startsWith(shellPrefix)) return command;
  const argument = command.slice(shellPrefix.length);
  if (argument.startsWith('"')) {
    try {
      const parsed = JSON.parse(argument) as unknown;
      return typeof parsed === 'string' ? parsed : command;
    } catch {
      return command;
    }
  }
  if (argument.startsWith("'") && argument.endsWith("'")) return argument.slice(1, -1);
  return command;
}

export function buildAdaptiveDevelopmentOperationalCanaryScope(input: {
  readonly runnerCommit: string;
  readonly environmentSha256: string;
  readonly modelId: string;
}): AdaptiveDevelopmentOperationalCanaryScope {
  const scope: AdaptiveDevelopmentOperationalCanaryScope = {
    schemaVersion: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_SCOPE_VERSION,
    runnerCommit: input.runnerCommit,
    environmentSha256: input.environmentSha256,
    modelId: input.modelId,
    roles: [
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
    ],
    tokenPolicy: ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY,
  };
  assertAdaptiveDevelopmentOperationalCanaryScope(scope);
  return scope;
}

export function buildAdaptiveDevelopmentOperationalCanaryDirective(
  canaryScopeSha256: string,
  authority: {
    readonly operatorUserId: string;
    readonly threadId: string;
    readonly messageStoreIdentitySha256: string;
    readonly runtimeInstanceIdentitySha256: string;
  },
): string {
  assertSha256(canaryScopeSha256, 'operational canary scope');
  return [
    'APPROVE_ADAPTIVE_S0_CANARY',
    `scope_sha256=${canaryScopeSha256}`,
    `operator_user_id=${authority.operatorUserId}`,
    `thread_id=${authority.threadId}`,
    `message_store_identity_sha256=${authority.messageStoreIdentitySha256}`,
    `runtime_instance_identity_sha256=${authority.runtimeInstanceIdentitySha256}`,
    `token_policy=${ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY}`,
  ].join(' ');
}

export function parseAdaptiveDevelopmentOperationalCanaryPlan(
  value: unknown,
): AdaptiveDevelopmentOperationalCanaryPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('operational canary plan must be an object');
  }
  const record = value as Partial<AdaptiveDevelopmentOperationalCanaryPlan>;
  assertExactKeys(record, ['schemaVersion', 'canaryScopeSha256', 'scope', 'authorization'], 'operational canary plan');
  assertAdaptiveDevelopmentOperationalCanaryScope(record.scope);
  const scopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(record.scope);
  if (record.authorization && typeof record.authorization === 'object') {
    assertExactKeys(
      record.authorization,
      ['kind', 'approvalRef', 'approvalMessageSha256', 'approvedOperationalCanaryScopeSha256', 'approvedAt'],
      'operational canary authorization',
    );
  }
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_PLAN_VERSION ||
    record.canaryScopeSha256 !== scopeSha256 ||
    !record.authorization ||
    record.authorization.kind !== 'operator_approval' ||
    record.authorization.approvedOperationalCanaryScopeSha256 !== scopeSha256 ||
    !/^cat-cafe:\/\/message\/[A-Za-z0-9-]+$/.test(record.authorization.approvalRef) ||
    !/^[a-f0-9]{64}$/.test(record.authorization.approvalMessageSha256) ||
    Number.isNaN(Date.parse(record.authorization.approvedAt))
  ) {
    throw new Error('operational canary plan is not bound to one exact approved scope');
  }
  return record as AdaptiveDevelopmentOperationalCanaryPlan;
}

export function assertAdaptiveDevelopmentOperationalCanaryReceipt(
  value: unknown,
): asserts value is AdaptiveDevelopmentOperationalCanaryReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('operational canary receipt must be an object');
  }
  const record = value as Partial<AdaptiveDevelopmentOperationalCanaryReceipt>;
  assertExactKeys(
    record,
    [
      'schemaVersion',
      'status',
      'zeroModelProvider',
      'runnerCommit',
      'environmentSha256',
      'modelId',
      'canaryScopeSha256',
      'canaryPlanSha256',
      'tokenPolicy',
      'completedAt',
      'roles',
    ],
    'operational canary receipt',
  );
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_RECEIPT_VERSION ||
    record.status !== 'passed' ||
    record.zeroModelProvider !== false ||
    record.tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    typeof record.completedAt !== 'string' ||
    Number.isNaN(Date.parse(record.completedAt)) ||
    typeof record.modelId !== 'string' ||
    !record.modelId ||
    !record.roles ||
    typeof record.roles !== 'object' ||
    Array.isArray(record.roles)
  ) {
    throw new Error('operational canary receipt does not prove the authorized real-provider lifecycle');
  }
  assertSha1(record.runnerCommit, 'operational canary runner commit');
  assertSha256(record.environmentSha256, 'operational canary environment');
  assertSha256(record.canaryScopeSha256, 'operational canary scope');
  assertSha256(record.canaryPlanSha256, 'operational canary plan');
  assertAdaptiveDevelopmentOperationalCanaryRoleReceipt(record.roles.executor, 'write');
  assertAdaptiveDevelopmentOperationalCanaryRoleReceipt(record.roles.reviewer, 'read');
  assertSha256(record.roles.executor.markerSha256, 'operational canary executor marker');
  assertSha1(record.roles.executor.postModelCommit, 'operational canary post-model commit');
  assertSha256(record.roles.reviewer.observedMarkerSha256, 'operational canary reviewer marker');
  assertSha256(record.roles.reviewer.observationCommandSha256, 'operational canary reviewer command evidence');
  if (record.roles.executor.markerSha256 !== record.roles.reviewer.observedMarkerSha256) {
    throw new Error('operational canary reviewer did not observe the executor marker');
  }
}

function assertAdaptiveDevelopmentOperationalCanaryScope(
  value: unknown,
): asserts value is AdaptiveDevelopmentOperationalCanaryScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('operational canary scope must be an object');
  }
  const record = value as Partial<AdaptiveDevelopmentOperationalCanaryScope>;
  assertExactKeys(
    record,
    ['schemaVersion', 'runnerCommit', 'environmentSha256', 'modelId', 'roles', 'tokenPolicy'],
    'operational canary scope',
  );
  if (
    record.schemaVersion !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_SCOPE_VERSION ||
    typeof record.modelId !== 'string' ||
    !record.modelId ||
    record.tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    !Array.isArray(record.roles) ||
    record.roles.length !== 2 ||
    record.roles[0]?.role !== 'executor' ||
    record.roles[0].filesystemAccess !== 'write' ||
    record.roles[0].tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    record.roles[1]?.role !== 'reviewer' ||
    record.roles[1].filesystemAccess !== 'read' ||
    record.roles[1].tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY
  ) {
    throw new Error('operational canary scope must contain the fixed two-role unbounded token policy');
  }
  assertExactKeys(record.roles[0], ['role', 'filesystemAccess', 'tokenPolicy'], 'operational canary executor scope');
  assertExactKeys(record.roles[1], ['role', 'filesystemAccess', 'tokenPolicy'], 'operational canary reviewer scope');
  assertSha1(record.runnerCommit, 'operational canary runner commit');
  assertSha256(record.environmentSha256, 'operational canary environment');
}

function assertAdaptiveDevelopmentOperationalCanaryRoleReceipt(
  value: unknown,
  filesystemAccess: 'write' | 'read',
): asserts value is AdaptiveDevelopmentOperationalCanaryRoleReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`operational canary receipt is missing the ${filesystemAccess} role`);
  }
  const record = value as Partial<AdaptiveDevelopmentOperationalCanaryRoleReceipt>;
  assertExactKeys(
    record,
    [
      'filesystemAccess',
      'tokenPolicy',
      'credentialMounted',
      'credentialRemoved',
      'completed',
      'usageObserved',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'toolCalls',
      'failedToolCalls',
      ...(filesystemAccess === 'write'
        ? ['markerSha256', 'postModelCommit']
        : ['observedMarkerSha256', 'observationCommandSha256']),
    ],
    `operational canary ${filesystemAccess} receipt`,
  );
  if (
    record.filesystemAccess !== filesystemAccess ||
    record.tokenPolicy !== ADAPTIVE_DEVELOPMENT_OPERATIONAL_CANARY_TOKEN_POLICY ||
    record.credentialMounted !== true ||
    record.credentialRemoved !== true ||
    record.completed !== true ||
    record.usageObserved !== true ||
    record.failedToolCalls !== 0 ||
    !Number.isInteger(record.inputTokens) ||
    !Number.isInteger(record.cachedInputTokens) ||
    !Number.isInteger(record.outputTokens) ||
    !Number.isInteger(record.toolCalls) ||
    (record.inputTokens as number) < 0 ||
    (record.cachedInputTokens as number) < 0 ||
    (record.outputTokens as number) < 0 ||
    (record.toolCalls as number) < 1
  ) {
    throw new Error(`operational canary receipt does not prove the ${filesystemAccess} real-provider role`);
  }
}

function assertSha1(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new Error(`${label} is invalid`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`);
}

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains an unexpected field`);
  }
}
