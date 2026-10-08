import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const setOpenFile = vi.fn();

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (
    selector: (state: {
      currentProjectPath: string;
      currentThreadId: string;
      setWorkspaceOpenFile: typeof setOpenFile;
    }) => unknown,
  ) =>
    selector({
      currentProjectPath: '/Users/example/Projects/example-project',
      currentThreadId: 'thread-links',
      setWorkspaceOpenFile: setOpenFile,
    }),
}));

const { MarkdownContent, toWorkspaceRelativePath } = await import('@/components/MarkdownContent');

describe('toWorkspaceRelativePath', () => {
  it('only converts paths contained by the active project root', () => {
    expect(
      toWorkspaceRelativePath(
        '/Users/example/Projects/example-project/docs/model.md',
        '/Users/example/Projects/example-project',
      ),
    ).toBe('docs/model.md');
    expect(
      toWorkspaceRelativePath(
        '/Users/example/Projects/example-project-copy/docs/model.md',
        '/Users/example/Projects/example-project',
      ),
    ).toBeNull();
    expect(
      toWorkspaceRelativePath(
        '/Users/slipshod/IdeaProjects/other/docs/model.md',
        '/Users/example/Projects/example-project',
      ),
    ).toBeNull();
    expect(
      toWorkspaceRelativePath(
        '/Users/example/Projects/example-project/../other/docs/model.md',
        '/Users/example/Projects/example-project',
      ),
    ).toBeNull();
  });

  it('normalizes Windows separators without weakening the root boundary', () => {
    expect(toWorkspaceRelativePath('C:\\work\\repo\\docs\\model.md', 'c:\\work\\repo')).toBe('docs/model.md');
    expect(toWorkspaceRelativePath('C:\\work\\repo-copy\\docs\\model.md', 'c:\\work\\repo')).toBeNull();
  });
});

describe('MarkdownContent absolute workspace links', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as { React?: typeof React }).React = undefined;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  beforeEach(() => {
    setOpenFile.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderAndClick(content: string) {
    act(() => {
      root.render(<MarkdownContent content={content} disableCommandPrefix />);
    });
    const link = container.querySelector('a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    return link;
  }

  it('opens an absolute non-Markdown file link inside the current project in Workspace', () => {
    const link = renderAndClick('[数据服务实现](/Users/example/Projects/example-project/src/data-service.ts)');

    expect(link?.target).not.toBe('_blank');
    expect(setOpenFile).toHaveBeenCalledWith('src/data-service.ts', null, null, 'thread-links', undefined);
  });

  it('normalizes a bare absolute file path before opening it in Workspace', () => {
    renderAndClick('绝对路径： /Users/example/Projects/example-project/docs/data-service-domain-model.md');

    expect(setOpenFile).toHaveBeenCalledWith(
      'docs/data-service-domain-model.md',
      null,
      null,
      'thread-links',
      undefined,
    );
  });
});
