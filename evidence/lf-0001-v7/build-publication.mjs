import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const finalFilesPath = join(root, 'records/v7/episode-candidate-final-files.json');
const finalFiles = JSON.parse(await readFile(finalFilesPath, 'utf8'));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const file of finalFiles.files) {
  const target = join(root, 'candidate-final-files', file.path);
  await mkdir(dirname(target), { recursive: true });
  const bytes = Buffer.from(file.content, 'utf8');
  const actual = sha256(bytes);
  if (actual !== file.sha256) {
    throw new Error(`candidate final-file hash mismatch for ${file.path}`);
  }
  await writeFile(target, bytes);
}

const excluded = new Set(['PUBLICATION-MANIFEST.json']);
const entries = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    const absolute = join(directory, name);
    const path = relative(root, absolute).replaceAll('\\', '/');
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) {
      throw new Error(`publication tree contains a symlink: ${path}`);
    }
    if (metadata.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`publication tree contains a special file: ${path}`);
    }
    if (excluded.has(path)) continue;
    const resolved = resolve(root, path);
    if (!resolved.startsWith(`${root}${sep}`)) {
      throw new Error(`publication path escapes root: ${path}`);
    }
    const bytes = await readFile(absolute);
    entries.push({ path, size: bytes.length, sha256: sha256(bytes) });
  }
}

await walk(root);
entries.sort((left, right) => left.path.localeCompare(right.path));

const originalManifest = JSON.parse(await readFile(join(root, 'records/v7/episode-evidence-manifest.json'), 'utf8'));
const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

const publication = {
  schemaVersion: 'lf-0001.v7.public-evidence-subset.v1',
  createdAt: '2026-08-17T09:15:00.000Z',
  source: {
    runnerCommit: '0a4d8eef9a0e17ac0661cc7a401e9f8ee0472f2b',
    candidateSha: originalManifest.candidate.candidateSha,
    candidatePatchSha256: originalManifest.candidate.candidatePatchSha256,
  },
  fullLocalPackage: {
    manifestCanonicalSha256: '9d1c42ec4332e33230dbec10f584ddc2947e7eb9d5c5219c1efa8104ea02b413',
    artifactIndexRawSha256: originalManifest.artifactIndex.rawSha256,
    artifactIndexCanonicalSha256: originalManifest.artifactIndex.canonicalSha256,
    artifactCount: originalManifest.artifactIndex.artifactCount,
    totalBytes: originalManifest.artifactIndex.totalBytes,
    custody: 'local_restricted',
  },
  publicSubset: {
    completeOriginalPackage: false,
    entryCount: entries.length,
    totalBytes,
    entries,
  },
  excludedOriginalArtifactClasses: [
    'runtime-snapshot.tar',
    'codex-home databases, WAL/SHM files, sessions, and installation identifiers',
    'raw provider stdout and environment/model-catalog snapshots',
    'tool caches and compiler binaries',
    'embedded Git object databases and worktree internals',
    'provider CA copies and ephemeral control sandboxes not required by the public record set',
  ],
  claimBounds: {
    structuralPipelineEvidencePublished: true,
    fullOriginalPackagePublic: false,
    candidateTaskSucceeded: false,
    sopUpliftClaimEligible: false,
    overallSopCalibrationComplete: false,
    generalizationClaimEligible: false,
  },
};

await writeFile(join(root, 'PUBLICATION-MANIFEST.json'), `${JSON.stringify(publication, null, 2)}\n`);

const manifestStat = await stat(join(root, 'PUBLICATION-MANIFEST.json'));
console.log(
  JSON.stringify({
    entryCount: entries.length,
    totalBytes,
    manifestBytes: manifestStat.size,
  }),
);
