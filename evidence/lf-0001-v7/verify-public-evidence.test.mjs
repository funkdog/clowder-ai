import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const sourceRoot = resolve(import.meta.dirname);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lf0001-public-evidence-'));
  await cp(sourceRoot, root, { recursive: true });
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [join(root, 'verify-public-evidence.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
}

async function rewriteManifest(root, mutate) {
  const path = join(root, 'PUBLICATION-MANIFEST.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  mutate(manifest);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('accepts the exact publication closure', () => {
  const result = run(sourceRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"verified":true/u);
});

test('rejects an unindexed extra file', async () => {
  const root = await fixture();
  await writeFile(join(root, 'UNINDEXED_SECRET.txt'), 'must not be ignored\n');
  assert.notEqual(run(root).status, 0);
});

test('rejects a symlink even when it is not indexed', async () => {
  const root = await fixture();
  await symlink(join(root, 'README.md'), join(root, 'unindexed-link'));
  assert.equal((await lstat(join(root, 'unindexed-link'))).isSymbolicLink(), true);
  assert.notEqual(run(root).status, 0);
});

test('rejects duplicate and escaping manifest paths', async () => {
  for (const path of ['README.md', '../outside']) {
    const root = await fixture();
    await rewriteManifest(root, (manifest) => {
      manifest.publicSubset.entries.push({
        ...manifest.publicSubset.entries[0],
        path,
      });
      manifest.publicSubset.entryCount += 1;
      manifest.publicSubset.totalBytes += manifest.publicSubset.entries[0].size;
    });
    assert.notEqual(run(root).status, 0);
  }
});

test('rejects a publication overclaim', async () => {
  const root = await fixture();
  await rewriteManifest(root, (manifest) => {
    manifest.claimBounds.candidateTaskSucceeded = true;
    manifest.claimBounds.sopUpliftClaimEligible = true;
  });
  assert.notEqual(run(root).status, 0);
});

test('rejects a broken full-package anchor', async () => {
  const root = await fixture();
  await rewriteManifest(root, (manifest) => {
    manifest.fullLocalPackage.manifestCanonicalSha256 = '0'.repeat(64);
  });
  assert.notEqual(run(root).status, 0);
});
