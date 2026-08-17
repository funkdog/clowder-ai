import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const publication = JSON.parse(
  await readFile(join(root, 'PUBLICATION-MANIFEST.json'), 'utf8'),
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const entry of publication.publicSubset.entries) {
  const path = join(root, entry.path);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size !== entry.size) {
    throw new Error(`size mismatch for ${entry.path}`);
  }
  const actual = sha256(await readFile(path));
  if (actual !== entry.sha256) {
    throw new Error(`SHA-256 mismatch for ${entry.path}`);
  }
}

const originalManifest = JSON.parse(
  await readFile(join(root, 'records/v7/episode-evidence-manifest.json'), 'utf8'),
);
for (const [path, expected] of Object.entries(originalManifest.candidate.finalFileSha256)) {
  const actual = sha256(await readFile(join(root, 'candidate-final-files', path)));
  if (actual !== expected) {
    throw new Error(`candidate final-file binding mismatch for ${path}`);
  }
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
