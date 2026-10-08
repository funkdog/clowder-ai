/**
 * createAgentMessageCoalescer — clowder-ai#789 + chunked flush fix
 *
 * Coalesces synchronous bursts of agent_message socket events to prevent
 * "Maximum update depth exceeded" under high-frequency streaming.
 *
 * Root cause (original #789): each socket event dispatched synchronously →
 * multiple chatStore.setState per event → useSyncExternalStore bypasses
 * React 18 automatic batching → >50 nested update depth → React throws.
 *
 * Original fix: buffer events from the same macrotask, flush in one microtask.
 *
 * Recurrence root cause: the single-microtask flush processes ALL buffered
 * events synchronously. Each event triggers ~4-8 Zustand set() calls, each
 * of which synchronously fires useSyncExternalStore listeners. When a burst
 * exceeds ~8 events (multi-cat streaming, reconnect gap detection, epoch
 * change), the total set() count within one flush exceeds React's 50 nested
 * update limit → crash recurs.
 *
 * Fix (chunked flush): process at most CHUNK_SIZE events per flush.
 * The first chunk still runs in a microtask so normal streaming remains
 * prompt, but remaining burst chunks continue in future tasks. This keeps
 * each React update batch below the nested-update limit and gives the
 * browser a paint/input opportunity between large burst chunks.
 *
 * Design contract:
 *  - Every event is processed; nothing is dropped or merged.
 *  - Push order within a macrotask is preserved (FIFO flush).
 *  - processThreadSeq runs per-event inside the flush loop, unchanged.
 *    Zustand set() is synchronous — each event's store write is visible to
 *    the next event's getState() call inside the same flush chunk.
 *  - Events arriving across macrotask boundaries each get their own flush.
 *    At normal streaming pace (one event per ~50ms) this is zero overhead.
 */

type AgentMessageHandler = (msg: unknown) => void;

export interface AgentMessageCoalescer {
  push: (msg: unknown) => void;
}

/**
 * Max events processed per microtask flush. Each event triggers ~4-8
 * Zustand set() calls; 6 events × 8 set() = 48, safely under React's
 * 50-nested-update limit. Conservative ceiling avoids flirting with the edge.
 */
const CHUNK_SIZE = 6;

export function createAgentMessageCoalescer(handler: AgentMessageHandler): AgentMessageCoalescer {
  const queue: unknown[] = [];
  let flushScheduled = false;

  function scheduleContinuation(): void {
    // Large reconnect/background bursts should not monopolize the main thread
    // with a long microtask chain. A task boundary lets the browser service
    // input/paint while preserving FIFO processing and the "no dropped event"
    // contract.
    setTimeout(flush, 0);
  }

  function flush(): void {
    // Take at most CHUNK_SIZE events from the front of the queue.
    // Remaining events stay in the queue for the next microtask.
    const chunk = queue.splice(0, CHUNK_SIZE);

    if (queue.length > 0) {
      // More events waiting — continue in a future task so React/browser get
      // a chance to breathe between chunks.
      scheduleContinuation();
    } else {
      // Queue fully drained — allow new pushes to schedule a fresh flush.
      flushScheduled = false;
    }

    for (const msg of chunk) {
      handler(msg);
    }
  }

  return {
    push(msg: unknown): void {
      queue.push(msg);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    },
  };
}
