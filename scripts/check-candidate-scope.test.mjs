import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = (name) => fileURLToPath(new URL(`./check-${name}.mjs`, import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'candidate-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const write = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const commit = (title) => {
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', title);
  };
  git('init', '-q', '--initial-branch=main');
  mkdirSync(join(cwd, 'scripts/lib'), { recursive: true });
  for (const name of ['fallback-layers', 'hotfix-pattern']) {
    copyFileSync(script(name), join(cwd, `scripts/check-${name}.mjs`));
  }
  const helper = fileURLToPath(new URL('./lib/git-change-scope.mjs', import.meta.url));
  if (existsSync(helper)) copyFileSync(helper, join(cwd, 'scripts/lib/git-change-scope.mjs'));
  write('src/value.js', 'export const value = 1;\n');
  commit('base');
  git('branch', 'baseline');
  return { cwd, git, write, commit };
}
function run(f, name, ...args) {
  const explicitBase = args.lastIndexOf('--base');
  const result = spawnSync(
    process.execPath,
    [join(f.cwd, `scripts/check-${name}.mjs`), '--base', 'baseline', ...args],
    {
      cwd: f.cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOTFIX_BASE: explicitBase < 0 ? 'baseline' : args[explicitBase + 1],
        PR_NUMBER: '',
        ...f.env,
      },
    },
  );
  const last = result.stdout.trim().split('\n').at(-1);
  let json;
  try {
    json = JSON.parse(last);
  } catch {
    /* Failure output is asserted by the caller. */
  }
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

test('working-tree scan includes staged, unstaged and untracked code without changing Git state', (t) => {
  const f = fixture(t);
  f.write('src/staged.js', 'export const a = input ?? 1;\n');
  f.git('add', 'src/staged.js');
  f.write('src/value.js', 'export const value = input ?? 2;\n');
  f.write('src/新 file.js', 'export const b = input || 3;\n');
  const before = f.git('status', '--porcelain');
  const result = run(f, 'fallback-layers', '--scope', 'working-tree');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.status, 'checked');
  assert.equal(result.json.scope, 'working-tree');
  assert.deepEqual(result.json.files.sort(), ['src/staged.js', 'src/value.js', 'src/新 file.js'].sort());
  assert.equal(result.json.totalNet, 3);
  assert.equal(f.git('status', '--porcelain'), before);
});

test('committed scan reads committed contents even when the working tree differs', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = input ?? 2;\n');
  f.commit('feat: configurable value');
  f.write('src/value.js', 'export const value = 3;\n');
  const result = run(f, 'fallback-layers', '--scope', 'committed');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.scope, 'committed');
  assert.equal(result.json.totalNet, 1);
  assert.deepEqual(result.json.excludedWorkingTreePaths, ['src/value.js']);
});

test('invalid Git baseline is an error for both checkers, never an empty passing scan', (t) => {
  const f = fixture(t);
  for (const name of ['fallback-layers', 'hotfix-pattern']) {
    const result = run(f, name, '--base', 'missing-ref');
    assert.equal(result.code, 1, name);
    assert.equal(result.json.status, 'error', name);
  }
});

test('hotfix needs supplied intent for a new uncommitted candidate', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  const unknown = run(f, 'hotfix-pattern', '--scope', 'working-tree');
  assert.equal(unknown.code, 3);
  assert.equal(unknown.json.status, 'unknown');
  assert.equal(unknown.json.hotfix, null);
  const known = run(f, 'hotfix-pattern', '--scope', 'working-tree', '--title', 'fix: missing availability');
  assert.equal(known.code, 2);
  assert.equal(known.json.status, 'checked');
  assert.equal(known.json.hotfix, true);
  assert.equal(known.json.codeFileCount, 1);
});

test('clean no-change candidate is explicitly not applicable', (t) => {
  const f = fixture(t);
  for (const name of ['fallback-layers', 'hotfix-pattern']) {
    const result = run(f, name, '--scope', 'working-tree');
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.status, 'not_applicable');
  }
});

test('committed hotfix and non-hotfix intent remain distinguishable', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  f.commit('feat: configurable value');
  assert.equal(run(f, 'hotfix-pattern', '--scope', 'committed').json.hotfix, false);
  f.write('src/value.js', 'export const value = 3;\n');
  f.commit('fix: value boundary');
  const result = run(f, 'hotfix-pattern', '--scope', 'committed');
  assert.equal(result.code, 2);
  assert.equal(result.json.hotfix, true);
  assert.equal(result.json.autoLabel, true);
});

test('renamed code keeps cumulative fallback accounting at the selected revision', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const a = x ?? 1;\nexport const b = y ?? 2;\n');
  f.commit('feat: existing defaults');
  f.git('branch', '-f', 'baseline');
  f.git('mv', 'src/value.js', 'src/renamed value.js');
  f.write('src/renamed value.js', 'export const a = x ?? 1;\nexport const b = y ?? 2;\nexport const c = z ?? 3;\n');
  const result = run(f, 'fallback-layers', '--scope', 'working-tree');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.details[0].totalInFile, 3);
  assert.equal(result.json.totalNet, 1);
});

test('hotfix baseline and title are data, not shell commands', (t) => {
  const f = fixture(t);
  const marker = join(f.cwd, 'injected');
  const result = run(f, 'hotfix-pattern', '--base', `missing; touch ${marker}`, '--title', 'fix: $(touch injected)');
  assert.equal(result.code, 1);
  assert.equal(result.json.status, 'error');
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(readFileSync(join(f.cwd, 'src/value.js'), 'utf8'), 'export const value = 1;\n');
});

function fakeGh(f, { failRead = false, failEdit = false, head = f.git('rev-parse', 'HEAD'), labels = [] } = {}) {
  const bin = join(f.cwd, '.test-bin');
  const log = join(f.cwd, 'gh-calls.jsonl');
  f.write(
    '.test-bin/gh',
    `#!${process.execPath}\nconst fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');
if ((${failRead} && process.argv[3] === 'view') || (${failEdit} && process.argv[3] === 'edit')) { process.stderr.write('offline fixture failure'); process.exit(1); }
process.stdout.write(JSON.stringify(${JSON.stringify({ title: 'fix: availability', headRefOid: head, labels })}));\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  f.env = { PATH: `${bin}:${process.env.PATH}` };
  return log;
}

test('failed PR intent lookup fails closed and does not attempt labeling', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  f.commit('fix: value');
  const log = fakeGh(f, { failRead: true });
  const result = run(f, 'hotfix-pattern', '--scope', 'committed', '--apply-label', '17');
  assert.equal(result.code, 1);
  assert.equal(result.json.status, 'error');
  assert.equal(result.json.hotfix, null);
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls, [['pr', 'view', '17', '--json', 'title,headRefOid,labels']]);
});

test('labeling remains opt-in for committed candidates and forbidden for working-tree candidates', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  f.commit('fix: value');
  const log = fakeGh(f);
  const prohibited = run(f, 'hotfix-pattern', '--scope', 'working-tree', '--apply-label', '17');
  assert.equal(prohibited.code, 1);
  assert.equal(existsSync(log), false);
  const result = run(f, 'hotfix-pattern', '--scope', 'committed', '--apply-label', '17');
  assert.equal(result.code, 2);
  assert.equal(result.json.labelApplied, true);
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls, [
    ['pr', 'view', '17', '--json', 'title,headRefOid,labels'],
    ['pr', 'edit', '17', '--add-label', 'hotfix'],
  ]);
});

test('a PR HEAD mismatch cannot classify or label the wrong local candidate', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  f.commit('feat: value');
  const log = fakeGh(f, { head: f.git('rev-parse', 'baseline') });
  const result = run(f, 'hotfix-pattern', '--scope', 'committed', '--apply-label', '17');
  assert.equal(result.code, 1);
  assert.equal(result.json.status, 'error');
  assert.equal(result.json.hotfix, null);
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
});

test('required label failure is an error, but a verified existing label needs no write', (t) => {
  const f = fixture(t);
  f.write('src/value.js', 'export const value = 2;\n');
  f.commit('fix: value');
  const log = fakeGh(f, { failEdit: true });
  const failed = run(f, 'hotfix-pattern', '--scope', 'committed', '--apply-label', '17');
  assert.equal(failed.code, 1);
  assert.equal(failed.json.labelPresent, false);
  assert.equal(failed.json.labelApplied, false);
  assert.ok(failed.json.labelError);
  fakeGh(f, { failEdit: true, labels: [{ name: 'hotfix' }] });
  const previousCalls = readFileSync(log, 'utf8').trim().split('\n').length;
  const existing = run(f, 'hotfix-pattern', '--scope', 'committed', '--apply-label', '17');
  assert.equal(existing.code, 2);
  assert.equal(existing.json.labelPresent, true);
  assert.equal(existing.json.labelApplied, null);
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, previousCalls + 1);
});

test('index deletion colliding with an untracked replacement is reported, not silently skipped', (t) => {
  const f = fixture(t);
  f.git('rm', '--cached', 'src/value.js');
  f.write('src/value.js', 'export const value = x ?? 2;\n');
  const result = run(f, 'fallback-layers', '--scope', 'working-tree');
  assert.equal(result.code, 1);
  assert.equal(result.json.status, 'error');
});
