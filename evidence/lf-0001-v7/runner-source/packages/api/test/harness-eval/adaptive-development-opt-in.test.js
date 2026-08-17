import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectAdaptiveDevelopmentOptIn } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-opt-in.js';

describe('adaptive development explicit opt-in detector', () => {
  it('recognizes every public alias when it is used as an activation instruction', () => {
    const samples = [
      '这个任务启用 adaptive-development-sop。',
      '请按 adaptive-local-trial 完成。',
      '后续需要按 Free Plan + Hard Gates 来推进。',
      'Use free_plan_hard_gates for this bounded task.',
    ];

    for (const text of samples) {
      const result = detectAdaptiveDevelopmentOptIn(text);
      assert.equal(result.activated, true, text);
      assert.equal(result.mode, 'free_plan_hard_gates');
    }
  });

  it('does not activate from discussion, comparison, or negation', () => {
    const samples = [
      'adaptive-development-sop 是什么？',
      'free plan 和 structured adaptive 有什么区别？',
      '这个任务不要启用 free-plan hard-gates。',
      'Do not use adaptive-local-trial here.',
      '文档里提到了 free_plan_hard_gates。',
    ];

    for (const text of samples) {
      assert.equal(detectAdaptiveDevelopmentOptIn(text).activated, false, text);
    }
  });

  it('does not activate without a public alias', () => {
    assert.equal(detectAdaptiveDevelopmentOptIn('请自由规划这个任务。').activated, false);
  });
});
