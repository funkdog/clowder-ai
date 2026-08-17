import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const manifestName = 'PUBLICATION-MANIFEST.json';
const publication = JSON.parse(await readFile(join(root, manifestName), 'utf8'));

const expectedIdentity = {
  runnerCommit: '0a4d8eef9a0e17ac0661cc7a401e9f8ee0472f2b',
  candidateSha: '0522d5ecbd819f3869460656c6eef4f62bdf5511',
  candidatePatchSha256: 'b21dbd04cfa7a2a96cdf98c5d896059361a440a985239a6dd0936fde00c10345',
};
const expectedFullPackage = {
  manifestCanonicalSha256: '9d1c42ec4332e33230dbec10f584ddc2947e7eb9d5c5219c1efa8104ea02b413',
  artifactIndexRawSha256: '9aa191cc652ccf137ed7ccfc82ad66c8a70235326441f461d6199bc9c6082faf',
  artifactIndexCanonicalSha256: '80fb9e79dc8de18c3940b9d61350fa5c2d9beab802d8797a16955b9820acdae4',
  artifactCount: 412,
  totalBytes: 160360060,
  custody: 'local_restricted',
};
const expectedClaimBounds = {
  structuralPipelineEvidencePublished: true,
  fullOriginalPackagePublic: false,
  candidateTaskSucceeded: false,
  sopUpliftClaimEligible: false,
  overallSopCalibrationComplete: false,
  generalizationClaimEligible: false,
};
const expectedCandidateFiles = {
  'packages/api/src/routes/threads.ts': '0aa483d44afaf9e9733d17f62e359d4222a13344d35a5220a272c7bdb6d421a9',
  'packages/api/src/utils/persistent-project-path.ts':
    '13e61e754320b61318e5419e158389b21491eda422d1b227dea808d25df83d88',
  'packages/api/test/project-path.test.js': 'c476c2b32883f87e7c1b139f835b8929cab1a8032df4459b85b726c1be7241e6',
  'packages/api/test/threads-endpoint.test.js': '7d58a692f392353caa688f9772bdf44022b97818ae1c6aef307984ba13bff3ff',
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

function assertSafeRelativePath(path) {
  assert.equal(typeof path, 'string');
  assert.ok(path.length > 0, 'manifest contains an empty path');
  assert.equal(isAbsolute(path), false, `manifest contains an absolute path: ${path}`);
  assert.equal(path.includes('\\'), false, `manifest path uses a backslash: ${path}`);
  assert.equal(posix.normalize(path), path, `manifest path is not normalized: ${path}`);
  assert.equal(path === '..' || path.startsWith('../'), false, `manifest path escapes root: ${path}`);
  const resolved = resolve(root, path);
  assert.ok(resolved.startsWith(`${root}${sep}`), `manifest path escapes root: ${path}`);
}

async function enumerateActualFiles(directory, files = []) {
  for (const name of await readdir(directory)) {
    const absolute = join(directory, name);
    const path = relative(root, absolute).replaceAll('\\', '/');
    const metadata = await lstat(absolute);
    assert.equal(metadata.isSymbolicLink(), false, `publication contains a symlink: ${path}`);
    if (metadata.isDirectory()) {
      await enumerateActualFiles(absolute, files);
      continue;
    }
    assert.equal(metadata.isFile(), true, `publication contains a special file: ${path}`);
    files.push({ path, size: metadata.size });
  }
  return files;
}

assert.equal(publication.schemaVersion, 'lf-0001.v7.public-evidence-subset.v1');
assert.deepEqual(publication.source, expectedIdentity);
assert.deepEqual(publication.fullLocalPackage, expectedFullPackage);
assert.deepEqual(publication.claimBounds, expectedClaimBounds);
assert.equal(publication.publicSubset.completeOriginalPackage, false);

const manifestEntries = publication.publicSubset.entries;
assert.ok(Array.isArray(manifestEntries), 'publicSubset.entries must be an array');
assert.equal(manifestEntries.length, publication.publicSubset.entryCount);

const manifestPaths = new Set();
let manifestTotalBytes = 0;
for (const entry of manifestEntries) {
  assertSafeRelativePath(entry.path);
  assert.notEqual(entry.path, manifestName, `${manifestName} must be the only explicit exclusion`);
  assert.equal(manifestPaths.has(entry.path), false, `duplicate manifest path: ${entry.path}`);
  manifestPaths.add(entry.path);
  assert.ok(Number.isSafeInteger(entry.size) && entry.size >= 0, `invalid size for ${entry.path}`);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/u, `invalid SHA-256 for ${entry.path}`);
  manifestTotalBytes += entry.size;
}
assert.equal(manifestTotalBytes, publication.publicSubset.totalBytes);

const actualFiles = await enumerateActualFiles(root);
const actualPaths = actualFiles.map((entry) => entry.path).sort();
const expectedPaths = [...manifestPaths, manifestName].sort();
assert.deepEqual(actualPaths, expectedPaths, 'actual publication file set is not manifest-closed');

for (const entry of publication.publicSubset.entries) {
  const path = join(root, entry.path);
  const metadata = await lstat(path);
  assert.equal(metadata.isFile(), true, `not a regular file: ${entry.path}`);
  assert.equal(metadata.size, entry.size, `size mismatch for ${entry.path}`);
  const actual = sha256(await readFile(path));
  assert.equal(actual, entry.sha256, `SHA-256 mismatch for ${entry.path}`);
}

const originalManifest = JSON.parse(await readFile(join(root, 'records/v7/episode-evidence-manifest.json'), 'utf8'));
const originalIndexBytes = await readFile(join(root, 'records/v7/episode-artifact-index.json'));
const originalIndex = JSON.parse(originalIndexBytes.toString('utf8'));

assert.equal(canonicalSha256(originalManifest), expectedFullPackage.manifestCanonicalSha256);
assert.equal(sha256(originalIndexBytes), expectedFullPackage.artifactIndexRawSha256);
assert.equal(canonicalSha256(originalIndex), expectedFullPackage.artifactIndexCanonicalSha256);
assert.deepEqual(originalManifest.candidate.finalFileSha256, expectedCandidateFiles);
assert.equal(originalManifest.identity.runnerCommit, expectedIdentity.runnerCommit);
assert.equal(originalManifest.candidate.candidateSha, expectedIdentity.candidateSha);
assert.equal(originalManifest.candidate.candidatePatchSha256, expectedIdentity.candidatePatchSha256);
assert.deepEqual(originalManifest.artifactIndex, {
  path: 'episode-artifact-index.json',
  artifactCount: expectedFullPackage.artifactCount,
  totalBytes: expectedFullPackage.totalBytes,
  canonicalSha256: expectedFullPackage.artifactIndexCanonicalSha256,
  rawSha256: expectedFullPackage.artifactIndexRawSha256,
});
assert.equal(originalIndex.artifactCount, expectedFullPackage.artifactCount);
assert.equal(originalIndex.totalBytes, expectedFullPackage.totalBytes);

const finalFilesRecord = JSON.parse(
  await readFile(join(root, 'records/v7/episode-candidate-final-files.json'), 'utf8'),
);
assert.equal(finalFilesRecord.files.length, Object.keys(expectedCandidateFiles).length);
const finalRecordPaths = finalFilesRecord.files.map((file) => file.path);
assert.equal(new Set(finalRecordPaths).size, finalRecordPaths.length, 'duplicate final-file record');
assert.deepEqual([...finalRecordPaths].sort(), Object.keys(expectedCandidateFiles).sort());

const publishedCandidatePaths = actualPaths
  .filter((path) => path.startsWith('candidate-final-files/'))
  .map((path) => path.slice('candidate-final-files/'.length));
assert.deepEqual(publishedCandidatePaths.sort(), Object.keys(expectedCandidateFiles).sort());

for (const file of finalFilesRecord.files) {
  const expected = expectedCandidateFiles[file.path];
  assert.equal(file.sha256, expected, `final-file record hash mismatch for ${file.path}`);
  assert.equal(sha256(Buffer.from(file.content, 'utf8')), expected);
  const actual = sha256(await readFile(join(root, 'candidate-final-files', file.path)));
  assert.equal(actual, expected, `candidate final-file binding mismatch for ${file.path}`);
}

console.log(
  JSON.stringify({
    verified: true,
    publicEntryCount: publication.publicSubset.entryCount,
    publicTotalBytes: publication.publicSubset.totalBytes,
    fullOriginalPackagePublic: publication.claimBounds.fullOriginalPackagePublic,
    candidateTaskSucceeded: publication.claimBounds.candidateTaskSucceeded,
  }),
);
