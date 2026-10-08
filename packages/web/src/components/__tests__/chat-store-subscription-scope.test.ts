import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOT_PATHS = [
  'src/components/ChatContainer.tsx',
  'src/components/ThreadSidebar/ThreadSidebar.tsx',
  'src/components/SplitPaneView.tsx',
  'src/components/MiniThreadSidebar.tsx',
  'src/hooks/useAgentMessages.ts',
  'src/hooks/useChatHistory.ts',
  'src/hooks/useSendMessage.ts',
  'src/hooks/useChatCommands.ts',
  'src/hooks/useChatSocketCallbacks.ts',
];

describe('chat store subscription scope', () => {
  it('keeps hot chat paths off whole-store useChatStore subscriptions', () => {
    const offenders = HOT_PATHS.filter((relPath) => {
      const source = readFileSync(join(process.cwd(), relPath), 'utf8');
      return /\buseChatStore\s*\(\s*\)/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
