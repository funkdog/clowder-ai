import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { LocalAdaptiveDevelopmentGitFactResolver } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-git-facts.js';
import { resolveAdaptiveDevelopmentHarnessVersion } from '../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-harness-version.js';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop(), { recursive: true, force: true });
});

function createRepo() {
  const root = mkdtempSync(join(tmpdir(), 'adaptive-git-facts-'));
  tempRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Collector Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'collector@example.test'], { cwd: root });
  writeFileSync(join(root, 'tracked.txt'), 'tracked\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
  return root;
}

describe('Adaptive development independent Git facts', () => {
  it('fails closed when a baseline-untracked file changes content', async () => {
    const root = createRepo();
    writeFileSync(join(root, 'draft.md'), 'baseline\n');
    const resolver = new LocalAdaptiveDevelopmentGitFactResolver();
    const baseline = await resolver.resolve(root);
    assert.ok(baseline);

    writeFileSync(join(root, 'draft.md'), 'task mutation\n');
    const final = await resolver.resolve(root, baseline);

    assert.ok(final);
    assert.equal(final.mutating, true);
    assert.equal(final.evidenceComplete, false);
    assert.notEqual(final.diffRef, `commit:${final.finalSha}`);
    assert.match(final.scopeEnvelope, /draft\.md/);
  });

  it('stays fail-closed when baseline tracked dirt disappears before the final snapshot', async () => {
    const root = createRepo();
    writeFileSync(join(root, 'tracked.txt'), 'pre-existing dirty state\n');
    const resolver = new LocalAdaptiveDevelopmentGitFactResolver();
    const baseline = await resolver.resolve(root);
    assert.ok(baseline);
    assert.equal(baseline.trackedDirty, true);

    execFileSync('git', ['checkout', '--', 'tracked.txt'], { cwd: root });
    const final = await resolver.resolve(root, baseline);

    assert.ok(final);
    assert.equal(final.trackedDirty, false);
    assert.equal(final.evidenceComplete, false);
    assert.notEqual(final.diffRef, `commit:${final.finalSha}`);
  });

  it('changes the harness version when collector implementation changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'adaptive-harness-version-'));
    tempRoots.push(root);
    const skillPath = join(root, 'cat-cafe-skills', 'adaptive-development-sop');
    const sourcePath = join(root, 'packages', 'api', 'src', 'infrastructure', 'harness-eval', 'adaptive-development');
    mkdirSync(skillPath, { recursive: true });
    mkdirSync(sourcePath, { recursive: true });
    writeFileSync(join(skillPath, 'SKILL.md'), 'skill-v1\n');
    writeFileSync(join(sourcePath, 'adaptive-development-collector.ts'), 'collector-v1\n');
    const first = resolveAdaptiveDevelopmentHarnessVersion(root);
    writeFileSync(join(sourcePath, 'adaptive-development-collector.ts'), 'collector-v2\n');
    const second = resolveAdaptiveDevelopmentHarnessVersion(root);

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
    assert.equal(readFileSync(join(skillPath, 'SKILL.md'), 'utf8'), 'skill-v1\n');
  });

  it('changes the harness version when the shared local Git resolver changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'work-evidence-harness-version-'));
    tempRoots.push(root);
    const skillPath = join(root, 'cat-cafe-skills', 'adaptive-development-sop');
    const evidencePath = join(root, 'packages', 'api', 'src', 'domains', 'work-ledger', 'evidence');
    mkdirSync(skillPath, { recursive: true });
    mkdirSync(evidencePath, { recursive: true });
    writeFileSync(join(skillPath, 'SKILL.md'), 'skill-v1\n');
    writeFileSync(join(evidencePath, 'LocalGitEvidenceResolver.ts'), 'resolver-v1\n');
    const first = resolveAdaptiveDevelopmentHarnessVersion(root);
    writeFileSync(join(evidencePath, 'LocalGitEvidenceResolver.ts'), 'resolver-v2\n');
    const second = resolveAdaptiveDevelopmentHarnessVersion(root);

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
  });
});
