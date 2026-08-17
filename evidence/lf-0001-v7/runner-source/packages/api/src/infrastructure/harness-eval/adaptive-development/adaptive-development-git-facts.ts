import {
  type GitEvidenceResolver,
  LocalGitEvidenceResolver,
  type LocalGitEvidenceSnapshot,
} from '../../../domains/work-ledger/evidence/LocalGitEvidenceResolver.js';

/**
 * Compatibility aliases for the F192 collector during the LF-0001 migration.
 * The implementation is a generic local Git fact resolver. Reusing it here
 * does not give the Work workflow control over passive episode collection.
 */
export { LocalGitEvidenceResolver as LocalAdaptiveDevelopmentGitFactResolver };
export type AdaptiveDevelopmentGitFactResolver = GitEvidenceResolver;
export type AdaptiveDevelopmentGitSnapshot = LocalGitEvidenceSnapshot;
