import type { ThreadBriefAttentionItem, ThreadBriefAvailability, ThreadBriefWaitItem } from '@cat-cafe/shared';
import type { ThreadBriefCurrentFacts, ThreadBriefLiveExecutionSnapshot } from './ThreadBriefAssembler.js';

export interface ThreadScopedAttention {
  readonly threadId: string;
  readonly item: ThreadBriefAttentionItem;
}

export interface ThreadScopedWait {
  readonly threadId: string;
  readonly item: ThreadBriefWaitItem;
}

export interface ThreadBriefCurrentDiscoveryDeps {
  readonly readExecutionDiscovery: (ownerUserId: string) => Promise<{
    readonly threadIds: readonly string[];
    /** Completeness of the sparse candidate union, not any one candidate's qualification. */
    readonly complete: boolean;
    readonly readThread: (threadId: string) => Promise<ThreadBriefLiveExecutionSnapshot>;
  }>;
  readonly listAttention: (ownerUserId: string) => Promise<readonly ThreadScopedAttention[]>;
  readonly listWaits: (ownerUserId: string) => Promise<readonly ThreadScopedWait[]>;
}

interface MutableCurrentFacts {
  live: ThreadBriefLiveExecutionSnapshot | null;
  attention: ThreadBriefAttentionItem[] | null;
  waits: ThreadBriefWaitItem[] | null;
}

export interface ThreadBriefCurrentDiscoveryResult {
  readonly availability: ThreadBriefAvailability;
  readonly facts: ReadonlyMap<string, ThreadBriefCurrentFacts>;
  /** Facts for recent-only rows. Incomplete sparse discovery must remain unknown here. */
  readonly fallbackFacts: ThreadBriefCurrentFacts;
}

type Settled<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

async function settle<T>(read: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

/** Discovers owner-scoped current candidates and qualifies only that sparse set. */
export class ThreadBriefCurrentDiscovery {
  constructor(private readonly deps: ThreadBriefCurrentDiscoveryDeps) {}

  async discover(ownerUserId: string): Promise<ThreadBriefCurrentDiscoveryResult> {
    const [executionDiscovery, attentionEntries, waitEntries] = await Promise.all([
      settle(() => this.deps.readExecutionDiscovery(ownerUserId)),
      settle(() => this.deps.listAttention(ownerUserId)),
      settle(() => this.deps.listWaits(ownerUserId)),
    ]);
    const fallbackFacts: ThreadBriefCurrentFacts = {
      live: executionDiscovery.ok ? { executions: [], complete: executionDiscovery.value.complete } : null,
      attention: attentionEntries.ok ? [] : null,
      waits: waitEntries.ok ? [] : null,
    };
    const facts = new Map<string, MutableCurrentFacts>();
    const ensure = (threadId: string) => {
      const existing = facts.get(threadId);
      if (existing) return existing;
      const created: MutableCurrentFacts = {
        live: fallbackFacts.live,
        attention: fallbackFacts.attention === null ? null : [],
        waits: fallbackFacts.waits === null ? null : [],
      };
      facts.set(threadId, created);
      return created;
    };

    if (attentionEntries.ok) {
      for (const entry of attentionEntries.value) ensure(entry.threadId).attention?.push(entry.item);
    }
    if (waitEntries.ok) {
      for (const entry of waitEntries.value) ensure(entry.threadId).waits?.push(entry.item);
    }

    const liveThreadIds = executionDiscovery.ok ? [...new Set(executionDiscovery.value.threadIds)] : [];
    let qualificationComplete = true;
    if (executionDiscovery.ok) {
      await Promise.all(
        liveThreadIds.map(async (threadId) => {
          const target = ensure(threadId);
          const read = await settle(() => executionDiscovery.value.readThread(threadId));
          target.live = read.ok ? read.value : null;
          if (!read.ok || !read.value.complete) qualificationComplete = false;
        }),
      );
    }

    for (const threadId of liveThreadIds) {
      const value = facts.get(threadId);
      if (value && isConfirmedEmpty(value.live) && value.attention?.length === 0 && value.waits?.length === 0) {
        facts.delete(threadId);
      }
    }
    return {
      availability: deriveAvailability(executionDiscovery, attentionEntries, waitEntries, qualificationComplete),
      facts,
      fallbackFacts,
    };
  }
}

function deriveAvailability(
  executionDiscovery: Settled<{ readonly complete: boolean }>,
  attentionEntries: Settled<unknown>,
  waitEntries: Settled<unknown>,
  qualificationComplete: boolean,
): ThreadBriefAvailability {
  const readableSourceCount = [executionDiscovery.ok, attentionEntries.ok, waitEntries.ok].filter(Boolean).length;
  if (readableSourceCount === 0) return 'unavailable';
  if (
    readableSourceCount < 3 ||
    !executionDiscovery.ok ||
    !executionDiscovery.value.complete ||
    !qualificationComplete
  ) {
    return 'partial';
  }
  return 'ok';
}

function isConfirmedEmpty(read: ThreadBriefLiveExecutionSnapshot | null): boolean {
  if (read === null) return false;
  return read.complete && read.executions.length === 0;
}
