import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentThreadBriefs } from '../useRecentThreadBriefs';

const apiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

describe('useRecentThreadBriefs', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    apiFetch.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps loaded history during background refresh and retains it when that refresh fails', async () => {
    apiFetch
      .mockResolvedValueOnce(
        response(collection([brief('current-1', 0, 'running')], [brief('recent-a', 100)], 'cursor-1')),
      )
      .mockResolvedValueOnce(response(collection([brief('current-1', 0, 'running')], [brief('recent-b', 50)], null)))
      .mockResolvedValueOnce(
        response(
          collection(
            [brief('current-2', 0, 'running')],
            [brief('recent-new', 200), brief('recent-a', 100)],
            'cursor-1',
          ),
        ),
      )
      .mockRejectedValueOnce(new Error('unavailable'));

    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain('current-1|recent-a');

    const loadMore = container.querySelector('[data-testid="load-more"]');
    await act(async () => loadMore?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain('current-1|recent-a,recent-b');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('catcafe:thread-brief-invalidated', { detail: { threadId: 'current-1' } }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="briefs"]')?.textContent).toBe(
      'current-2|recent-new,recent-a,recent-b',
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent('catcafe:thread-brief-invalidated', { detail: { threadId: 'current-2' } }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(container.querySelector('[data-testid="current-state"]')?.textContent).toBe('unknown|partial|degraded');
    expect(container.querySelector('[data-testid="briefs"]')?.textContent).toBe(
      'current-2|recent-new,recent-a,recent-b',
    );
  });

  it('surfaces an incomplete empty collection instead of treating it as a normal empty state', async () => {
    apiFetch.mockResolvedValueOnce(response(collection([], [], null, 'partial')));

    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(container.querySelector('[data-testid="briefs"]')?.textContent).toBe('|');
  });
});

function Probe() {
  const state = useRecentThreadBriefs();
  return (
    <div>
      <span data-testid="status">{state.error ? 'error' : 'ok'}</span>
      <span data-testid="briefs">
        {state.current.map((item) => item.thread.id).join(',')}|{state.recent.map((item) => item.thread.id).join(',')}
      </span>
      <span data-testid="current-state">
        {state.current[0]?.presentationState}|{state.current[0]?.availability}|
        {state.current[0]?.currentExecutions[0]?.confidence}
      </span>
      <button type="button" data-testid="load-more" onClick={state.loadMore}>
        more
      </button>
    </div>
  );
}

function response(body: unknown) {
  return { ok: true, json: async () => body };
}

function collection(
  current: unknown[],
  recent: unknown[],
  nextCursor: string | null,
  availability: 'ok' | 'partial' | 'unavailable' = 'ok',
) {
  return { v: 1, availability, current, recent, nextCursor, generatedAt: Date.now() };
}

function brief(threadId: string, lastProgressAt = 1, presentationState: 'idle' | 'running' = 'idle') {
  return {
    v: 1,
    thread: { id: threadId, title: threadId },
    contextHeading: { label: '会话', text: threadId },
    availability: 'ok',
    presentationState,
    currentExecutions:
      presentationState === 'running' ? [{ catId: 'opus', startedAt: 1, confidence: 'confirmed' as const }] : [],
    attention: [],
    waits: [],
    recentProgress: [],
    lastProgressAt,
    nextStep: null,
    openWorkTaskCount: 0,
    hasHistory: true,
    generatedAt: 1,
  };
}
