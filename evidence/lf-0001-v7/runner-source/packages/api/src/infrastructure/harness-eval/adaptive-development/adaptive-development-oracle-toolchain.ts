import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

const ORACLE_TOOLCHAIN_SCHEMA_VERSION = 'lf-0001.oracle-toolchain.v1' as const;
const ESBUILD_RELATIVE_PATH = 'node_modules/esbuild/bin/esbuild';

interface OracleToolchainManifestShape {
  readonly tasks: readonly {
    readonly oraclePolicy: {
      readonly checks?: readonly {
        readonly id: string;
        readonly behaviorBundle?: { readonly sourcePath?: string; readonly source?: string };
      }[];
    };
  }[];
}

export interface AdaptiveDevelopmentOracleToolchainIdentity {
  readonly schemaVersion: typeof ORACLE_TOOLCHAIN_SCHEMA_VERSION;
  readonly compiler: { readonly sourcePath: typeof ESBUILD_RELATIVE_PATH; readonly sha256: string };
  readonly sources: readonly { readonly sourcePath: string; readonly sha256: string }[];
}

export interface AdaptiveDevelopmentSealedOracleToolchain {
  readonly identity: AdaptiveDevelopmentOracleToolchainIdentity;
  readonly compilerPath: string;
  readonly sources: readonly { readonly sourcePath: string; readonly sealedPath: string; readonly sha256: string }[];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertRepositoryRelativePath(path: string): void {
  if (
    isAbsolute(path) ||
    path.startsWith('\\') ||
    /^[a-z]:/i.test(path) ||
    path.split(/[\\/]/).some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`oracle toolchain path must remain repository-relative: ${path}`);
  }
}

function readRepositoryArtifact(repositoryRoot: string, sourcePath: string): Buffer {
  assertRepositoryRelativePath(sourcePath);
  const root = realpathSync(repositoryRoot);
  const artifactPath = realpathSync(join(root, sourcePath));
  const relativePath = relative(root, artifactPath);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`oracle toolchain artifact escapes the repository: ${sourcePath}`);
  }
  return readFileSync(artifactPath);
}

function readExpectedArtifact(
  repositoryRoot: string,
  artifact: { readonly sourcePath: string; readonly sha256: string },
): Buffer {
  const bytes = readRepositoryArtifact(repositoryRoot, artifact.sourcePath);
  if (sha256(bytes) !== artifact.sha256) {
    throw new Error(`oracle toolchain artifact changed after its exact identity was captured: ${artifact.sourcePath}`);
  }
  return bytes;
}

export function fingerprintAdaptiveDevelopmentOracleToolchain(
  identity: AdaptiveDevelopmentOracleToolchainIdentity,
): string {
  return sha256(Buffer.from(JSON.stringify(identity)));
}

export function captureAdaptiveDevelopmentOracleToolchainIdentity(
  repositoryRoot: string,
  manifest: OracleToolchainManifestShape,
): AdaptiveDevelopmentOracleToolchainIdentity {
  const sourcePaths = [
    ...new Set(
      manifest.tasks.flatMap(
        (task) =>
          task.oraclePolicy.checks?.flatMap((check) =>
            check.behaviorBundle?.sourcePath ? [check.behaviorBundle.sourcePath] : [],
          ) ?? [],
      ),
    ),
  ].sort();
  return {
    schemaVersion: ORACLE_TOOLCHAIN_SCHEMA_VERSION,
    compiler: {
      sourcePath: ESBUILD_RELATIVE_PATH,
      sha256: sha256(readRepositoryArtifact(repositoryRoot, ESBUILD_RELATIVE_PATH)),
    },
    sources: sourcePaths.map((sourcePath) => ({
      sourcePath,
      sha256: sha256(readRepositoryArtifact(repositoryRoot, sourcePath)),
    })),
  };
}

export function sealAdaptiveDevelopmentOracleToolchain(
  repositoryRoot: string,
  snapshotRoot: string,
  identity: AdaptiveDevelopmentOracleToolchainIdentity,
): AdaptiveDevelopmentSealedOracleToolchain {
  const compilerBytes = readExpectedArtifact(repositoryRoot, identity.compiler);
  const compilerPath = join(snapshotRoot, 'compiler', 'esbuild');
  mkdirSync(dirname(compilerPath), { recursive: true });
  writeFileSync(compilerPath, compilerBytes, { flag: 'wx', mode: 0o500 });
  const sources = identity.sources.map((source, index) => {
    const bytes = readExpectedArtifact(repositoryRoot, source);
    const sealedPath = join(snapshotRoot, 'sources', `${String(index).padStart(3, '0')}-${source.sha256}.tsx`);
    mkdirSync(dirname(sealedPath), { recursive: true });
    writeFileSync(sealedPath, bytes, { flag: 'wx', mode: 0o400 });
    return { ...source, sealedPath };
  });
  return { identity, compilerPath, sources };
}

export function assertAdaptiveDevelopmentSealedOracleToolchain(
  toolchain: AdaptiveDevelopmentSealedOracleToolchain,
): void {
  if (sha256(readFileSync(toolchain.compilerPath)) !== toolchain.identity.compiler.sha256) {
    throw new Error('sealed oracle compiler changed after snapshot creation');
  }
  for (const source of toolchain.sources) {
    if (sha256(readFileSync(source.sealedPath)) !== source.sha256) {
      throw new Error(`sealed oracle source changed after snapshot creation: ${source.sourcePath}`);
    }
  }
}

export function readAdaptiveDevelopmentSealedOracleSource(
  toolchain: AdaptiveDevelopmentSealedOracleToolchain,
  sourcePath: string,
): string {
  const source = toolchain.sources.find((candidate) => candidate.sourcePath === sourcePath);
  if (!source) throw new Error(`sealed oracle source is missing: ${sourcePath}`);
  const bytes = readFileSync(source.sealedPath);
  if (sha256(bytes) !== source.sha256) {
    throw new Error(`sealed oracle source changed after snapshot creation: ${sourcePath}`);
  }
  return bytes.toString('utf8');
}
