#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAdaptiveDevelopmentOracleSpecificity } from '../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-canary.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifest = JSON.parse(
  readFileSync(join(repositoryRoot, 'docs/harness-feedback/benchmarks/adaptive-development-v1/manifest.json'), 'utf8'),
);
const canary = manifest.convergenceCanary;
const task = manifest.tasks.find((candidate) => candidate.id === canary.taskId);
if (!task) throw new Error(`missing convergence task ${canary.taskId}`);
const sourcePaths = task.oraclePolicy.checks.map((check) => check.behaviorBundle?.sourcePath);
if (sourcePaths.some((sourcePath) => !sourcePath)) {
  throw new Error('disposable-checkout calibration requires source-backed behavior bundles');
}

const configuredCalibrationRoot = process.env.LF0001_CONVERGENCE_CALIBRATION_ROOT;
const calibrationParent = configuredCalibrationRoot ? resolve(configuredCalibrationRoot) : tmpdir();
mkdirSync(calibrationParent, { recursive: true });
const calibrationRoot = mkdtempSync(join(calibrationParent, 'lf0001-disposable-oracle-calibration-'));

function command(executable, args, cwd, options = {}) {
  return execFileSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function replaceExact(path, before, after) {
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) throw new Error(`expected one calibration mutation anchor in ${path}, found ${occurrences}`);
  writeFileSync(path, source.replace(before, after));
}

function installDependencies(worktree) {
  command(
    'pnpm',
    ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--prod=false', '--package-import-method=clone'],
    worktree,
    { capture: true },
  );
}

function applyGoldProjection(worktree) {
  for (const path of task.oraclePolicy.goldProjectionPaths) {
    const content = command('git', ['show', `${task.oraclePolicy.goldOutcomeCommit}:${path}`], repositoryRoot, {
      capture: true,
    });
    const destination = join(worktree, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
}

function mutateAlternate(worktree) {
  const utility = join(worktree, 'packages/api/src/utils/persistent-project-path.ts');
  const routes = join(worktree, 'packages/api/src/routes/threads.ts');
  for (const path of [utility, routes]) {
    const source = readFileSync(path, 'utf8')
      .replaceAll('resolvePersistentProjectPathDetailed', 'resolveDurableProjectPath')
      .replaceAll('migrateStoredProjectPath', 'migrateObservedProjectPath');
    writeFileSync(path, source);
  }
}

function mutateRuntimeRemap(worktree) {
  replaceExact(
    join(worktree, 'packages/api/src/utils/persistent-project-path.ts'),
    'return { ok: true, path: mapped.path, remappedFrom: targetPath };',
    'return { ok: true, path: workspaceRoot, remappedFrom: targetPath };',
  );
}

function mutateContainment(worktree) {
  replaceExact(
    join(worktree, 'packages/api/src/utils/persistent-project-path.ts'),
    'if (!mapped.ok || !isPathUnderRoots(mapped.path, [workspaceRoot]) || isPathUnderRoots(mapped.path, [runtimeRoot])) {',
    'if (!mapped.ok || isPathUnderRoots(mapped.path, [runtimeRoot])) {',
  );
}

function mutateFilteredRead(worktree) {
  replaceExact(
    join(worktree, 'packages/api/src/routes/threads.ts'),
    `let threads = projectPathMatches
      ? [...new Map(projectPathMatches.flat().map((thread) => [thread.id, thread] as const)).values()]
      : await threadStore.list(userId);`,
    `let threads = projectPathMatches
      ? await threadStore.list(userId)
      : await threadStore.list(userId);`,
  );
}

function mutateStaleFallback(worktree) {
  replaceExact(
    join(worktree, 'packages/api/src/routes/threads.ts'),
    "const projectPath = migratedProjectPath ?? 'default';",
    'const projectPath = migratedProjectPath ?? previousProjectPath;',
  );
}

function buildCandidate(worktree) {
  command('pnpm', ['--filter', '@cat-cafe/api', 'build'], worktree, { capture: true });
  const materializedPaths = task.oraclePolicy.goldProjectionPaths.filter((path) => existsSync(join(worktree, path)));
  if (materializedPaths.length > 0) command('git', ['add', '--', ...materializedPaths], worktree, { capture: true });
  return command('git', ['write-tree'], worktree, { capture: true }).trim();
}

function runBehaviorCheck(worktree, check) {
  const toolRoot = join(worktree, '.oracle-tools', check.id);
  mkdirSync(toolRoot, { recursive: true });
  const source = readFileSync(join(repositoryRoot, check.behaviorBundle.sourcePath), 'utf8').replaceAll(
    '$CANDIDATE_ROOT',
    worktree.replaceAll('\\', '/'),
  );
  const entryPath = join(toolRoot, `${check.id}.tsx`);
  const bundlePath = join(toolRoot, `${check.id}.mjs`);
  writeFileSync(entryPath, source);
  command(
    join(repositoryRoot, 'node_modules', '.bin', 'esbuild'),
    [
      entryPath,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundlePath}`,
      `--tsconfig=${join(worktree, check.behaviorBundle.tsconfigPath)}`,
      '--log-level=warning',
    ],
    worktree,
    { capture: true },
  );
  try {
    command(process.execPath, [bundlePath], worktree, { capture: true });
    return { id: check.id, passed: true };
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr ?? '');
    return { id: check.id, passed: false, diagnostic: stderr.slice(-2_000) };
  }
}

function runCandidate(label, input = {}) {
  const worktree = join(calibrationRoot, label);
  command('git', ['worktree', 'add', '--detach', worktree, task.source.baseCommit], repositoryRoot, { capture: true });
  try {
    if (input.gold) applyGoldProjection(worktree);
    input.mutate?.(worktree);
    installDependencies(worktree);
    const candidateSha = buildCandidate(worktree);
    const rawChecks = task.oraclePolicy.checks.map((check) => runBehaviorCheck(worktree, check));
    return {
      candidateSha,
      passed: rawChecks.every((check) => check.passed),
      checks: rawChecks.map(({ id, passed }) => ({ id, passed })),
      diagnostics: rawChecks.filter((check) => !check.passed),
    };
  } finally {
    command('git', ['worktree', 'remove', '--force', worktree], repositoryRoot, { capture: true });
  }
}

try {
  const baseline = runCandidate('baseline');
  const goldProjection = runCandidate('gold-projection', { gold: true });
  const behaviorEquivalentAlternate = runCandidate('behavior-equivalent-alternate', {
    gold: true,
    mutate: mutateAlternate,
  });
  const mutations = [
    {
      id: 'collapse-runtime-descendant-remap',
      targetBehaviorIds: ['runtime-root-and-descendant-remap'],
      mutate: mutateRuntimeRemap,
    },
    {
      id: 'allow-workspace-symlink-escape',
      targetBehaviorIds: ['workspace-containment'],
      mutate: mutateContainment,
    },
    {
      id: 'migrate-unrelated-filtered-records',
      targetBehaviorIds: ['filtered-read-isolation'],
      mutate: mutateFilteredRead,
    },
    {
      id: 'expose-stale-runtime-descendant',
      targetBehaviorIds: ['stale-runtime-fail-closed'],
      mutate: mutateStaleFallback,
    },
  ].map((mutation) => ({
    id: mutation.id,
    targetBehaviorIds: mutation.targetBehaviorIds,
    oracle: runCandidate(`mutation-${mutation.id}`, { gold: true, mutate: mutation.mutate }),
  }));
  const verdict = evaluateAdaptiveDevelopmentOracleSpecificity({
    expectedBehaviorIds: task.oraclePolicy.observableBehaviors.map((behavior) => behavior.id),
    baseline,
    goldProjection,
    behaviorEquivalentAlternate,
    singleFaultMutations: mutations,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: verdict.passed ? 'calibrated' : 'rejected',
        nonScoring: true,
        taskId: task.id,
        calibration: {
          expectedBehaviorIds: task.oraclePolicy.observableBehaviors.map((behavior) => behavior.id),
          baseline: {
            candidateSha: baseline.candidateSha,
            passed: baseline.passed,
            checks: baseline.checks,
          },
          goldProjection: {
            candidateSha: goldProjection.candidateSha,
            passed: goldProjection.passed,
            checks: goldProjection.checks,
          },
          behaviorEquivalentAlternate: {
            candidateSha: behaviorEquivalentAlternate.candidateSha,
            passed: behaviorEquivalentAlternate.passed,
            checks: behaviorEquivalentAlternate.checks,
          },
          singleFaultMutations: mutations.map((mutation) => ({
            id: mutation.id,
            targetBehaviorIds: mutation.targetBehaviorIds,
            oracle: {
              candidateSha: mutation.oracle.candidateSha,
              passed: mutation.oracle.passed,
              checks: mutation.oracle.checks,
            },
          })),
        },
        vectors: {
          baseline: baseline.checks,
          goldProjection: goldProjection.checks,
          behaviorEquivalentAlternate: behaviorEquivalentAlternate.checks,
          singleFaultMutations: mutations.map((mutation) => ({
            id: mutation.id,
            targetBehaviorIds: mutation.targetBehaviorIds,
            checks: mutation.oracle.checks,
          })),
        },
        failures: verdict.failures,
        diagnostics: {
          baseline: baseline.diagnostics,
          goldProjection: goldProjection.diagnostics,
          behaviorEquivalentAlternate: behaviorEquivalentAlternate.diagnostics,
          singleFaultMutations: mutations.map((mutation) => ({
            id: mutation.id,
            diagnostics: mutation.oracle.diagnostics,
          })),
        },
      },
      null,
      2,
    )}\n`,
  );
  if (!verdict.passed) process.exitCode = 1;
} finally {
  rmSync(calibrationRoot, { recursive: true, force: true });
}
