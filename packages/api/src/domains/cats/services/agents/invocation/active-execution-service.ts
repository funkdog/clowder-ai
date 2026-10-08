/**
 * F297 Phase B (PR #3748 R3 P2-1 / R4 P1-1) — domain-owned multi-face execution composition.
 *
 * 为什么存在：`resolveActiveInvocations` 原本长在 `routes/queue.ts` 上，registry 端口写成
 * `QueueRoutesOptions['invocationRegistry']`。于是任何非 queue 的消费者（active-execution 路由、
 * Sidebar C10）都得反向依赖 route 模块，composition 也只能各自手搓一份。本模块把组合收进
 * domain，三个 consumer 共用同一份真相；单执行面的 projection 见
 * `live-invocation-projection.ts`。
 *
 * **语义核心**：“正在跑”在本系统里有三张脸。
 *
 * | 执行面            | 真相源                        | live classifier 认识吗 |
 * |-------------------|-------------------------------|------------------------|
 * | live invocation   | record + tracker + draft      | 认识                   |
 * | managed command   | dynamicTaskStore (F295)       | **不认识**             |
 * | running child     | TurnExecution ledger (F194)   | **只从 running parent 反查** |
 *
 * 旧代码把后两张脸只塞进“候选发现”，定性仍统一走 live classifier —— 于是候选进来、定性落空、
 * presence=null，行被终态回落误报成 done/error。所以本模块的核心是 **positive working
 * projection：谁提名，谁定性**。
 *
 * **R4 P1-1 的形状约束**：owner-truth 两张脸（managed / child）是 **user-scoped 全局枚举**，
 * 每次调用都是一次全量读（Redis 侧是 `SMEMBERS + pipeline HGETALL`）。因此它们每个请求
 * **只允许读一次**，结果物化成 `threadId -> catIds` snapshot；per-candidate 的 O(A) 定性
 * 只留给真正需要按 thread 提问的 live classifier。否则 A 个 candidate 会形成 1+A 次全局
 * 枚举，最坏 O(A²)。
 */

import type { DynamicTaskStore } from '../../../../../infrastructure/scheduler/DynamicTaskStore.js';
import {
  isPendingHoldBallWakeTask,
  isRetiredWakeWithRunningManagedCommand,
  parseManagedCommandWakeTask,
  parseRetiredManagedCommandWakeTask,
} from '../../../../ball-custody/managed-command-wake-lifecycle.js';
import type { IDraftStore } from '../../stores/ports/DraftStore.js';
import type { IInvocationRecordStore } from '../../stores/ports/InvocationRecordStore.js';
import type { ITurnExecutionStore } from '../../stores/ports/TurnExecutionStore.js';
import {
  type ActiveInvocationProjection,
  type InvocationRegistryPort,
  type InvocationTrackerLike,
  resolveActiveInvocationFactsStrict,
  resolveActiveInvocations,
} from './live-invocation-projection.js';
import { classifyManagedCommandActivity } from './managed-command-activity.js';

export {
  type ActiveInvocationProjection,
  getRequestOwnedTrackerExecutionId,
  type InvocationRegistryPort,
  type InvocationTrackerLike,
  type LifecycleProjectionCandidate,
  projectActiveInvocations,
  resolveActiveInvocationFactsStrict,
  resolveActiveInvocations,
  resolveActiveInvocationsStrict,
  trackerProjectionCandidates,
} from './live-invocation-projection.js';

/** 一个 running managed command 的 owner truth 投影（F295 执行面）。 */
export interface ManagedCommandExecution {
  readonly taskId: string;
  readonly threadId: string;
  readonly catId: string;
  readonly userId: string;
  readonly activity: ReturnType<typeof classifyManagedCommandActivity>;
  readonly startedAt: number;
}

/**
 * managed command 执行面的**唯一** owner-truth 枚举器。
 *
 * 判别式与 `active-execution-routes.ts::projectManagedCommandExecution` 同源：active wake 任务，
 * 或"用户撤了 wake 但命令还在跑"的 tombstone（`parseRetiredManagedCommandWakeTask`，等价于
 * `isRetiredWakeWithRunningManagedCommand` 且顺带给出 threadId/catId/userId）。
 *
 * 这里同时产出 threadId（候选发现用）和 catId（定性用），所以 Sidebar 不再需要一个"提名了
 * 却没人能定性"的候选源 —— 那正是 R3 P1-1 的成因。
 *
 * PR #3763（rebase 合流）：枚举器 **principal-blind**——不按 viewer 过滤。trigger
 * ownership 只决定"能不能停"，由消费方用 `execution.userId` 自行判定：route 列表投影
 * foreign 行 not_cancelable + 合成 `occupied:` id（#3763 的"隐形占用者"修复面）；
 * **Sidebar 定性/候选发现走 service 消费面，保持 per-user filter**——是否把 foreign
 * 占用算进 working 是独立设计决策，不在 rebase 合流里夹带（见
 * `createActiveExecutionService` 的 listManaged 与 feature doc）。可见性边界始终是
 * thread access，不在本枚举器。
 */
export function listManagedCommandExecutions(
  tasks: readonly Parameters<typeof parseManagedCommandWakeTask>[0][],
): ManagedCommandExecution[] {
  const executions: ManagedCommandExecution[] = [];
  for (const task of tasks) {
    // **两支都必须先过任务身份判别**（R5 P1-1）。
    //
    // R4 P2-1 只给 retired 分支补了判别，因为当时把"与旧 predicate 等价"当成了目标。
    // 那个参照系是错的：旧代码的 active 分支从来不校验身份，而
    // `active-execution-routes` 会无条件把枚举结果标成 `cancelable`，DELETE 路径却经
    // `isPendingHoldBallTask`（含身份判别）拒绝。于是投影说"在跑且可取消"、取消路径说
    // "这不是我的任务"——用户点了取消却取消不掉。判据是**取消路径认不认**，
    // 不是有没有忠实复刻旧行为。
    if (!task) continue;
    const parsed = isPendingHoldBallWakeTask(task)
      ? parseManagedCommandWakeTask(task)
      : isRetiredWakeWithRunningManagedCommand(task)
        ? parseRetiredManagedCommandWakeTask(task)
        : null;
    if (!parsed || parsed.command.state !== 'command_running') continue;
    executions.push({
      taskId: parsed.task.id,
      threadId: parsed.threadId,
      catId: parsed.catId,
      userId: parsed.userId,
      activity: classifyManagedCommandActivity(parsed.command.command),
      startedAt: parsed.command.startedAt,
    });
  }
  return executions;
}

/** 一个 running child TurnExecution 的 owner truth 投影（F194 执行面）。 */
export interface RunningChildExecutionProjection {
  readonly invocationId: string;
  readonly threadId: string;
  readonly catId: string;
  readonly startedAt: number;
}

/** One cat-level execution fact spanning all three F297 execution faces. */
export interface ThreadExecutionProjection {
  readonly catId: string;
  readonly startedAt: number;
  readonly turnInvocationId?: string;
  readonly degraded: boolean;
}

/** Positive execution facts plus whether all three sources were readable. */
export interface ThreadExecutionResolution {
  readonly executions: readonly ThreadExecutionProjection[];
  readonly complete: boolean;
}

interface OwnerTruthExecutionProjection {
  readonly catId: string;
  readonly startedAt: number;
  readonly turnInvocationId?: string;
  readonly turnStartedAt?: number;
}

/** 定性结果 + 完整性。`complete=false` ⇒ 调用方必须 fail-closed。 */
export interface WorkingPresence {
  readonly catIds: readonly string[];
  /** Earliest canonical start across every active execution face. */
  readonly activeSince?: number;
  readonly complete: boolean;
}

/**
 * 一个请求内的 owner-truth 物化视图（R4 P1-1）。
 *
 * managed / child 两张脸都是 **user-scoped 全局枚举**，读一次的成本与 candidate 数无关。
 * 因此每请求只读一次，把结果摊平成 `threadId -> catIds`；随后 A 个 candidate 的定性
 * 各自 O(1) 查表。没有这层物化，per-candidate 定性会把全局枚举重复 A 次
 * （Redis 侧 = A 次 `SMEMBERS + pipeline HGETALL`），最坏 O(A²)。
 */
export interface ActiveExecutionSnapshot {
  /** 四源并集的稀疏候选。 */
  readonly threadIds: readonly string[];
  /** 是否所有候选源都成功贡献。`false` ⇒ union 可能漏报，调用方必须 fail-closed。 */
  readonly complete: boolean;
  /** owner-truth 两张脸是否都读成功。`false` ⇒ 逐 thread 定性同样不完整。 */
  readonly ownerTruthComplete: boolean;
  /** managed command + standalone running child 的 request-scoped materialized facts。 */
  ownerTruthExecutions(threadId: string): readonly ThreadExecutionProjection[];
}

/** F295 project scan 只需要 live/child 候选；managed command 会由自己的投影枚举器读取。 */
export interface LiveExecutionCandidateSnapshot {
  readonly threadIds: readonly string[];
  readonly complete: boolean;
}

export interface ActiveExecutionServiceDeps {
  readonly invocationTracker: InvocationTrackerLike;
  readonly recordStore?: IInvocationRecordStore;
  readonly draftStore?: IDraftStore;
  readonly turnExecutionStore?: Pick<ITurnExecutionStore, 'listByParent' | 'listRunningByUser'>;
  readonly invocationRegistry?: InvocationRegistryPort;
  readonly dynamicTaskStore?: Pick<DynamicTaskStore, 'getAll'> &
    Partial<Pick<DynamicTaskStore, 'listManagedCommandCandidates'>>;
  readonly log: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}

export interface ActiveExecutionService {
  /** live-invocation 面的 canonical 投影（queue / active-execution 两个 consumer 用）。 */
  resolveActiveInvocations(threadId: string, userId: string): Promise<ActiveInvocationProjection[]>;
  /** managed command 面的 owner truth。 */
  listManagedCommandExecutions(userId: string): ManagedCommandExecution[];
  /** running child 面的 owner truth（user-scoped，不经 parent 反查）。 */
  listRunningChildExecutions(userId: string): Promise<RunningChildExecutionProjection[]>;
  /** **每请求一次**：候选发现 + owner truth 物化。 */
  buildSnapshot(userId: string): Promise<ActiveExecutionSnapshot>;
  /**
   * 三执行面的 cat-level 当前执行视图。`complete=false` 时，空数组不是 authoritative empty；
   * 已知的正向事实仍会保留，供调用方展示 partial 而不是误报 idle。
   */
  resolveThreadExecutions(
    threadId: string,
    userId: string,
    snapshot?: ActiveExecutionSnapshot,
  ): Promise<ThreadExecutionResolution>;
  /** F295 project scan 的窄读：不重复读取随后必然要投影的 managed-command 表。 */
  buildLiveCandidateSnapshot(userId: string): Promise<LiveExecutionCandidateSnapshot>;
  /**
   * **正向** working 定性：live 面按 thread 提问（O(A) 且不可避免），
   * owner-truth 两面从 snapshot 查表。`snapshot` 省略时退化成单 thread 自建（非批量路径）。
   */
  resolveWorkingPresence(
    threadId: string,
    userId: string,
    snapshot?: ActiveExecutionSnapshot,
  ): Promise<WorkingPresence>;
}

/** 单源失败只丢该源，但必须记账：静默缩小结果会让"没查到"被误读成"没在跑"（R3 P1-3）。 */
async function collect<T>(
  into: Set<string>,
  produce: () => Promise<readonly T[]> | readonly T[],
  key: (item: T) => string,
): Promise<boolean> {
  try {
    for (const item of await produce()) {
      const value = key(item);
      if (value) into.add(value);
    }
    return true;
  } catch {
    return false;
  }
}

function earliestExecutionStart(current: number | undefined, candidate: number): number | undefined {
  if (!Number.isFinite(candidate) || candidate < 0) return current;
  return current === undefined ? candidate : Math.min(current, candidate);
}

export function createActiveExecutionService(deps: ActiveExecutionServiceDeps): ActiveExecutionService {
  // PR #3763 合流：底层枚举器 principal-blind（route 列表要显示 foreign 占用）；
  // service 消费面（Sidebar 定性/候选发现）保持 per-user 语义不变——是否把 foreign
  // 占用算进 working 是独立设计决策，不在 rebase 合流里夹带。
  const listManaged = (userId: string): ManagedCommandExecution[] =>
    deps.dynamicTaskStore
      ? listManagedCommandExecutions(
          deps.dynamicTaskStore.listManagedCommandCandidates?.() ?? deps.dynamicTaskStore.getAll(),
        ).filter((e) => e.userId === userId)
      : [];

  const listRunningChildren = async (userId: string): Promise<RunningChildExecutionProjection[]> => {
    if (!deps.turnExecutionStore?.listRunningByUser) return [];
    const records = await deps.turnExecutionStore.listRunningByUser(userId);
    return records
      .filter((record) => record.status === 'running' && record.userId === userId)
      .map((record) => ({
        invocationId: record.invocationId,
        threadId: record.threadId,
        catId: record.catId as string,
        startedAt: record.startedAt,
      }));
  };

  const liveExecutions = (threadId: string, userId: string) =>
    resolveActiveInvocationFactsStrict(
      threadId,
      userId,
      deps.invocationTracker,
      deps.recordStore,
      deps.draftStore,
      deps.turnExecutionStore,
      deps.log,
      deps.invocationRegistry,
    );

  const buildCandidateSnapshot = async (userId: string, includeManaged: boolean): Promise<ActiveExecutionSnapshot> => {
    const union = new Set<string>();
    const ownerTruth = new Map<string, Map<string, OwnerTruthExecutionProjection>>();
    const remember = (threadId: string, catId: string, startedAt: number, turnInvocationId?: string) => {
      if (!threadId || !catId) return;
      const truth = ownerTruth.get(threadId) ?? new Map();
      const previous = truth.get(catId);
      let rememberedTurnId = previous?.turnInvocationId;
      let rememberedTurnStartedAt = previous?.turnStartedAt;
      if (
        turnInvocationId !== undefined &&
        (rememberedTurnStartedAt === undefined || startedAt > rememberedTurnStartedAt)
      ) {
        rememberedTurnId = turnInvocationId;
        rememberedTurnStartedAt = startedAt;
      }
      truth.set(catId, {
        catId,
        startedAt: earliestExecutionStart(previous?.startedAt, startedAt) ?? startedAt,
        ...(rememberedTurnId && rememberedTurnStartedAt !== undefined
          ? { turnInvocationId: rememberedTurnId, turnStartedAt: rememberedTurnStartedAt }
          : {}),
      });
      ownerTruth.set(threadId, truth);
    };
    const [trackerOk, recordOk, managedOk, childOk] = await Promise.all([
      collect(
        union,
        () => deps.invocationTracker.listActiveThreadIds?.() ?? [],
        (id) => id,
      ),
      collect(
        union,
        () => deps.recordStore?.listRunningThreadIds(userId) ?? [],
        (id) => id,
      ),
      includeManaged
        ? collect(
            union,
            () => listManaged(userId),
            (execution) => {
              remember(execution.threadId, execution.catId, execution.startedAt);
              return execution.threadId;
            },
          )
        : true,
      collect(
        union,
        () => listRunningChildren(userId),
        (execution) => {
          remember(execution.threadId, execution.catId, execution.startedAt, execution.invocationId);
          return execution.threadId;
        },
      ),
    ]);
    const ownerTruthComplete = managedOk && childOk;
    return {
      threadIds: [...union],
      complete: trackerOk && recordOk && ownerTruthComplete,
      ownerTruthComplete,
      ownerTruthExecutions: (threadId) =>
        [...(ownerTruth.get(threadId)?.values() ?? [])].map(({ turnStartedAt: _turnStartedAt, ...execution }) => ({
          ...execution,
          degraded: false,
        })),
    };
  };

  const service: ActiveExecutionService = {
    resolveActiveInvocations: (threadId, userId) =>
      resolveActiveInvocations(
        threadId,
        userId,
        deps.invocationTracker,
        deps.recordStore,
        deps.draftStore,
        deps.turnExecutionStore,
        deps.log,
        deps.invocationRegistry,
      ),

    listManagedCommandExecutions: listManaged,
    listRunningChildExecutions: listRunningChildren,

    async buildLiveCandidateSnapshot(userId) {
      const snapshot = await buildCandidateSnapshot(userId, false);
      return { threadIds: snapshot.threadIds, complete: snapshot.complete };
    },

    buildSnapshot: (userId) => buildCandidateSnapshot(userId, true),

    async resolveThreadExecutions(threadId, userId, snapshot) {
      const owner = snapshot ?? (await service.buildSnapshot(userId));
      const byCatId = new Map<string, ThreadExecutionProjection>();
      const merge = (execution: ThreadExecutionProjection) => {
        const previous = byCatId.get(execution.catId);
        if (!previous) {
          byCatId.set(execution.catId, execution);
          return;
        }
        byCatId.set(execution.catId, {
          catId: execution.catId,
          startedAt: earliestExecutionStart(previous.startedAt, execution.startedAt) ?? execution.startedAt,
          degraded: previous.degraded && execution.degraded,
          ...(execution.turnInvocationId
            ? { turnInvocationId: execution.turnInvocationId }
            : previous.turnInvocationId
              ? { turnInvocationId: previous.turnInvocationId }
              : {}),
        });
      };
      for (const execution of owner.ownerTruthExecutions(threadId)) merge(execution);

      let liveComplete = true;
      try {
        for (const execution of await liveExecutions(threadId, userId)) {
          merge({
            catId: execution.catId,
            startedAt: execution.startedAt,
            degraded: execution.degraded === true,
            ...(execution.turnInvocationId ? { turnInvocationId: execution.turnInvocationId } : {}),
          });
        }
      } catch {
        liveComplete = false;
      }
      return {
        executions: [...byCatId.values()].sort(
          (left, right) => left.startedAt - right.startedAt || left.catId.localeCompare(right.catId),
        ),
        complete: liveComplete && owner.ownerTruthComplete,
      };
    },

    async resolveWorkingPresence(threadId, userId, snapshot) {
      const resolution = await service.resolveThreadExecutions(threadId, userId, snapshot);
      let activeSince: number | undefined;
      for (const execution of resolution.executions) {
        activeSince = earliestExecutionStart(activeSince, execution.startedAt);
      }
      return {
        catIds: resolution.executions.map((execution) => execution.catId),
        ...(resolution.executions.length > 0 && activeSince !== undefined ? { activeSince } : {}),
        complete: resolution.complete,
      };
    },
  };

  return service;
}
