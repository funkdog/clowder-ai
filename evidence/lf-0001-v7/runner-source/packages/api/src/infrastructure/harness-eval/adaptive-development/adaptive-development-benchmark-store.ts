import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  ADAPTIVE_DEVELOPMENT_BENCHMARK_RECEIPT_VERSION,
  type AdaptiveDevelopmentBenchmarkArtifact,
  type AdaptiveDevelopmentBenchmarkArtifactReference,
  type AdaptiveDevelopmentBenchmarkEvidence,
  type AdaptiveDevelopmentBenchmarkReceipt,
  fingerprintAdaptiveDevelopmentBenchmark,
  normalizeAdaptiveDevelopmentBenchmarkForJson,
  parseAdaptiveDevelopmentBenchmarkArtifact,
  parseAdaptiveDevelopmentBenchmarkEvidence,
} from './adaptive-development-benchmark-contract.js';
import type {
  AdaptiveDevelopmentBenchmarkArtifactResolver,
  AdaptiveDevelopmentBenchmarkEvidenceResolver,
} from './adaptive-development-benchmark-evaluator.js';

const SAFE_RELATIVE_EVIDENCE_PATH = /^benchmark-evidence\/[0-9a-f]{64}\/[0-9a-f]{40}\.json$/;
const SAFE_RELATIVE_ARTIFACT_PATH = /^benchmark-artifacts\/[0-9a-f]{64}\/[0-9a-f]{40}\.json$/;

export class LocalAdaptiveDevelopmentBenchmarkEvidenceStore implements AdaptiveDevelopmentBenchmarkEvidenceResolver {
  private readonly root: string;

  constructor(root: string) {
    if (!root.trim()) throw new Error('benchmark evidence root is required');
    this.root = resolve(root);
  }

  write(input: unknown): AdaptiveDevelopmentBenchmarkReceipt {
    const evidence = parseAdaptiveDevelopmentBenchmarkEvidence(
      normalizeAdaptiveDevelopmentBenchmarkForJson(parseAdaptiveDevelopmentBenchmarkEvidence(input)),
    );
    const contentSha256 = fingerprintAdaptiveDevelopmentBenchmark(evidence);
    const uri = evidenceUri(evidence);
    const path = this.resolvePath(uri);
    mkdirSync(dirname(path), { recursive: true });

    if (existsSync(path)) {
      const existing = parseAdaptiveDevelopmentBenchmarkEvidence(JSON.parse(readFileSync(path, 'utf8')));
      if (fingerprintAdaptiveDevelopmentBenchmark(existing) !== contentSha256) {
        throw new Error(`benchmark evidence collision for ${evidence.runId}`);
      }
    } else {
      writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }

    return {
      schemaVersion: ADAPTIVE_DEVELOPMENT_BENCHMARK_RECEIPT_VERSION,
      benchmarkId: evidence.benchmarkId,
      manifestSha256: evidence.manifestSha256,
      runId: evidence.runId,
      stageId: evidence.stageId,
      taskId: evidence.taskId,
      armId: evidence.armId,
      repetition: evidence.repetition,
      attempt: evidence.attempt,
      launchPlanSha256: evidence.launchPlanSha256,
      ...(evidence.supersedesReceiptSha256 === undefined
        ? {}
        : { supersedesReceiptSha256: evidence.supersedesReceiptSha256 }),
      evidence: { uri, sha256: contentSha256 },
    };
  }

  resolve(receipt: AdaptiveDevelopmentBenchmarkReceipt): unknown | undefined {
    const path = this.resolvePath(receipt.evidence.uri);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  private resolvePath(uri: string): string {
    if (isAbsolute(uri) || !SAFE_RELATIVE_EVIDENCE_PATH.test(uri)) {
      throw new Error('benchmark evidence URI must be a safe store-relative path');
    }
    const path = resolve(this.root, uri);
    const fromRoot = relative(this.root, path);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('benchmark evidence URI escaped the configured root');
    }
    return path;
  }
}

export class LocalAdaptiveDevelopmentBenchmarkArtifactStore implements AdaptiveDevelopmentBenchmarkArtifactResolver {
  private readonly root: string;

  constructor(root: string) {
    if (!root.trim()) throw new Error('benchmark artifact root is required');
    this.root = resolve(root);
  }

  write(input: unknown): AdaptiveDevelopmentBenchmarkArtifactReference {
    const artifact = parseAdaptiveDevelopmentBenchmarkArtifact(
      normalizeAdaptiveDevelopmentBenchmarkForJson(parseAdaptiveDevelopmentBenchmarkArtifact(input)),
    );
    const contentSha256 = fingerprintAdaptiveDevelopmentBenchmark(artifact);
    const uri = artifactUri(artifact);
    const path = this.resolvePath(uri);
    mkdirSync(dirname(path), { recursive: true });

    if (existsSync(path)) {
      const existing = parseAdaptiveDevelopmentBenchmarkArtifact(JSON.parse(readFileSync(path, 'utf8')));
      if (fingerprintAdaptiveDevelopmentBenchmark(existing) !== contentSha256) {
        throw new Error(`benchmark artifact collision for ${artifact.runId}:${artifact.kind}`);
      }
    } else {
      writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }

    return { kind: artifact.kind, uri, sha256: contentSha256 };
  }

  resolve(reference: AdaptiveDevelopmentBenchmarkArtifactReference): unknown | undefined {
    const path = this.resolvePath(reference.uri);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  private resolvePath(uri: string): string {
    if (isAbsolute(uri) || !SAFE_RELATIVE_ARTIFACT_PATH.test(uri)) {
      throw new Error('benchmark artifact URI must be a safe store-relative path');
    }
    const path = resolve(this.root, uri);
    const fromRoot = relative(this.root, path);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('benchmark artifact URI escaped the configured root');
    }
    return path;
  }
}

function evidenceUri(evidence: AdaptiveDevelopmentBenchmarkEvidence): string {
  const runObjectId = createHash('sha1')
    .update(
      [
        evidence.benchmarkId,
        evidence.stageId,
        evidence.taskId,
        evidence.armId,
        evidence.repetition,
        evidence.attempt,
        evidence.runId,
      ].join('\0'),
    )
    .digest('hex');
  return `benchmark-evidence/${evidence.manifestSha256}/${runObjectId}.json`;
}

function artifactUri(artifact: AdaptiveDevelopmentBenchmarkArtifact): string {
  const artifactObjectId = createHash('sha1')
    .update(
      [
        artifact.benchmarkId,
        artifact.stageId,
        artifact.taskId,
        artifact.armId,
        artifact.repetition,
        artifact.attempt,
        artifact.runId,
        artifact.kind,
      ].join('\0'),
    )
    .digest('hex');
  return `benchmark-artifacts/${artifact.manifestSha256}/${artifactObjectId}.json`;
}
