import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export function parseCheckOptions(argv, defaultBase = 'origin/main') {
  const options = { base: defaultBase || 'origin/main', scope: 'committed' };
  const valued = new Map([
    ['--base', 'base'],
    ['--scope', 'scope'],
    ['--title', 'title'],
    ['--apply-label', 'applyLabel'],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    const key = valued.get(arg);
    if (!key || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Invalid argument: ${arg}`);
    options[key] = argv[++index];
  }
  if (!['committed', 'working-tree'].includes(options.scope))
    throw new Error('scope must be committed or working-tree');
  return options;
}

export function gitOutput(cwd, args) {
  return execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parsePaths(output) {
  const fields = output.split('\0');
  const changes = [];
  for (let index = 0; index < fields.length && fields[index]; ) {
    const status = fields[index++];
    const first = fields[index++];
    const renamed = /^[RC]/.test(status);
    const path = renamed ? fields[index++] : first;
    if (!first || !path) throw new Error('Incomplete git name-status output');
    changes.push({ status, path, ...(renamed ? { oldPath: first } : {}) });
  }
  return changes;
}

/** Read merge-base → HEAD, or merge-base → working tree plus untracked files. */
export function readChangeScope(options, cwd = process.cwd()) {
  const repoRoot = gitOutput(cwd, ['rev-parse', '--show-toplevel']).trim();
  const git = (args) => gitOutput(repoRoot, args);
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const baseCommit = git(['rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`]).trim();
  const mergeBase = git(['merge-base', baseCommit, head]).trim();
  const range = options.scope === 'committed' ? [mergeBase, head] : [mergeBase];
  const diffArgs = ['diff', '--no-ext-diff', '--no-textconv', '-M'];
  const changes = parsePaths(git([...diffArgs, '--name-status', '-z', ...range, '--']));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const pending = parsePaths(git([...diffArgs, '--name-status', '-z', head, '--'])).map((c) => c.path);
  const excludedWorkingTreePaths = [...new Set([...pending, ...untracked])];
  if (options.scope === 'working-tree') {
    const tracked = new Set(changes.map((c) => c.path));
    for (const path of untracked) {
      if (tracked.has(path)) throw new Error(`Untracked path conflicts with an indexed change: ${path}`);
      changes.push({ status: '?', path });
    }
  }
  const code = changes
    .filter((c) => CODE.test(c.path))
    .map((change) => {
      const paths = change.oldPath ? [change.oldPath, change.path] : [change.path];
      const content = readCandidateContent(change, { repoRoot, head, scope: options.scope }, git);
      if (change.status === '?') {
        const lines = content.replace(/\n$/, '').split('\n');
        return {
          ...change,
          content,
          diff: `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}`,
          additions: content ? lines.length : 0,
        };
      }
      const diff = git([...diffArgs, ...range, '--', ...paths]);
      const additions = Number.parseInt(git([...diffArgs, '--numstat', ...range, '--', ...paths]).split('\t')[0], 10);
      if (!Number.isFinite(additions)) throw new Error(`Cannot count code diff: ${change.path}`);
      return { ...change, content, diff, additions };
    });
  return {
    repoRoot,
    scope: options.scope,
    base: options.base,
    baseCommit,
    mergeBase,
    head,
    changes,
    code,
    excludedWorkingTreePaths,
  };
}

function readCandidateContent(change, candidate, git) {
  if (change.status === 'D') return '';
  if (candidate.scope === 'committed') return git(['show', `${candidate.head}:${change.path}`]);
  const absolutePath = resolve(candidate.repoRoot, change.path);
  if (!lstatSync(absolutePath).isFile()) throw new Error(`Cannot scan non-regular code file: ${change.path}`);
  return readFileSync(absolutePath, 'utf8');
}

export function scopeSummary(candidate) {
  return {
    scope: candidate.scope,
    base: candidate.base,
    baseCommit: candidate.baseCommit,
    mergeBase: candidate.mergeBase,
    head: candidate.head,
    files: candidate.code.map((c) => c.path),
    excludedWorkingTreePaths: candidate.scope === 'committed' ? candidate.excludedWorkingTreePaths : [],
  };
}
