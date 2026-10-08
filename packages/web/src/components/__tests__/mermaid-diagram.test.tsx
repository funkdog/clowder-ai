import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MermaidDiagram } from '@/components/MermaidDiagram';

Object.assign(globalThis as Record<string, unknown>, { React, IS_REACT_ACT_ENVIRONMENT: true });

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: mermaidMock,
}));

describe('MermaidDiagram', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  const originalTextLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength');

  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({
      svg: '<svg><script>alert("x")</script><g id="safe-node"></g></svg>',
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    if (originalGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    if (originalTextLength) Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', originalTextLength);
    else Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
  });

  it('renders sanitized SVG with strict Mermaid configuration', async () => {
    await act(async () => {
      root.render(<MermaidDiagram source={'flowchart TD\n  A --> B'} />);
    });

    await vi.waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
      }),
    );
    expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), 'flowchart TD\n  A --> B');
    expect(container.innerHTML).toContain('safe-node');
    expect(container.innerHTML).not.toContain('<script');
  });

  it('uses top-level htmlLabels:false so sanitization does not erase node text', async () => {
    await act(async () => {
      root.render(<MermaidDiagram source={'flowchart TD\n  A["State<br/>读状态"] --> B["Owner<br/>负责"]'} />);
    });

    await vi.waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlLabels: false,
      }),
    );
    // Must NOT have nested flowchart.htmlLabels — that config path is
    // silently ignored in mermaid 11.15.0 under securityLevel:'strict'.
    const initArg = mermaidMock.initialize.mock.calls[0][0];
    expect(initArg).not.toHaveProperty('flowchart');
  });

  it('preserves real Mermaid node and edge labels after SVG sanitization', async () => {
    // JSDOM has no SVG layout. Stub geometry only; use the real rendering and
    // sanitization pipeline so an empty SVG cannot pass as a successful diagram.
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 120, height: 24 }),
    });
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value: function (this: SVGElement) {
        return (this.textContent?.length ?? 0) * 8;
      },
    });
    const mermaid = (await vi.importActual<typeof import('mermaid')>('mermaid')).default;
    mermaidMock.initialize.mockImplementation((config) => mermaid.initialize(config));
    mermaidMock.render.mockImplementation((id, source) => mermaid.render(id, source));

    await act(async () => {
      root.render(
        <MermaidDiagram source={'flowchart TD\n  A["固定 Search v1 契约"] -->|"验收通过"| B["真实页面与服务"]'} />,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).not.toContain('Mermaid 图表渲染失败');
      const labels = Array.from(container.querySelectorAll('svg text'), (node) => node.textContent).join(' ');
      expect(labels).toContain('固定 Search v1 契约');
      expect(labels).toContain('真实页面与服务');
      expect(labels).toContain('验收通过');
    });
    expect(container.querySelector('foreignObject')).toBeNull();
  });
});
