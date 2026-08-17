import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  type AdaptiveDevelopmentTrialProvider,
  type ResolvedAdaptiveDevelopmentWindow,
} from '../adaptive-development/adaptive-development-trial-provider.js';
import { generateAdaptiveDevelopmentLiveVerdict } from '../adaptive-development/eval-adaptive-development-live-verdict.js';
import { loadDomains } from '../hub/eval-hub-read-model.js';
import type { AdaptiveDevelopmentTrialWindowSourceRefs, VerdictGenerator } from './types.js';
import { isAdaptiveDevelopmentSourceRefs, validateAdaptiveDevelopmentSelector } from './validation.js';

export function createAdaptiveDevelopmentGeneratorAdapter(
  provider: AdaptiveDevelopmentTrialProvider,
): VerdictGenerator {
  return async (packet, sourceRefs, deps) => {
    if (!isAdaptiveDevelopmentSourceRefs(sourceRefs)) {
      const kind = (sourceRefs as { kind?: string }).kind;
      throw new Error(
        `adaptive_development_adapter_wrong_kind: received kind='${kind ?? '(omitted)'}'; expected 'adaptive-development-trial-window'`,
      );
    }
    const validationError = validateAdaptiveDevelopmentSelector(sourceRefs);
    if (validationError) throw new Error(`invalid_source_ref: ${validationError}`);
    if (!deps.ownerUserId) {
      throw new Error('owner_user_required: adaptive-development publish requires ownerUserId');
    }

    const sourceWindow: ResolvedAdaptiveDevelopmentWindow = await provider.resolve(selectorForProvider(sourceRefs), {
      ownerUserId: deps.ownerUserId,
    });
    const domains = loadDomains(deps.harnessFeedbackRoot);
    const domain = domains.get(packet.domainId);
    if (!domain) throw new Error(`unknown_domain: ${packet.domainId} not in registry`);

    const artifact = generateAdaptiveDevelopmentLiveVerdict({
      verdictId: packet.id,
      harnessFeedbackRoot: deps.harnessFeedbackRoot,
      domain,
      sourceWindow,
      submittedPacket: packet,
      generatorCommit: resolveGeneratorCommit(deps.harnessFeedbackRoot),
    });
    return { verdictPath: artifact.path, bundleDir: artifact.bundleDir };
  };
}

function resolveGeneratorCommit(harnessFeedbackRoot: string): string {
  const repoRoot = join(harnessFeedbackRoot, '..', '..');
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    if (/^[a-f0-9]{40}$/.test(commit)) return commit;
  } catch {
    // Fail closed below: a publish artifact without implementation provenance is not replayable.
  }
  throw new Error('adaptive_development_generator_commit_unavailable');
}

function selectorForProvider(sourceRefs: AdaptiveDevelopmentTrialWindowSourceRefs): {
  windowStartMs: number;
  windowEndMs: number;
  episodeIds?: string[];
} {
  return {
    windowStartMs: sourceRefs.windowStartMs,
    windowEndMs: sourceRefs.windowEndMs,
    ...(sourceRefs.episodeIds ? { episodeIds: sourceRefs.episodeIds } : {}),
  };
}
