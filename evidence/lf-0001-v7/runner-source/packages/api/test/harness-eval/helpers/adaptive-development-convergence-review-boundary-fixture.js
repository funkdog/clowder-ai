import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite,
  parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric,
} from '../../../dist/infrastructure/harness-eval/adaptive-development/adaptive-development-convergence-review-boundary.js';

const rubricPath = fileURLToPath(
  new URL('../../../../../docs/harness-feedback/benchmarks/adaptive-development-v1/convergence-review-boundary-rubric.json', import.meta.url),
);
const goldSuitePath = fileURLToPath(
  new URL('../../../../../docs/harness-feedback/benchmarks/adaptive-development-v1/convergence-review-boundary-gold-cases.json', import.meta.url),
);

export function adaptiveDevelopmentConvergenceReviewBoundaryCalibrationFixture(input) {
  const reviewBoundaryRubric = parseAdaptiveDevelopmentConvergenceReviewBoundaryRubric(
    JSON.parse(readFileSync(rubricPath, 'utf8')),
  );
  const reviewBoundaryGoldSuite = parseAdaptiveDevelopmentConvergenceReviewBoundaryGoldSuite(
    JSON.parse(readFileSync(goldSuitePath, 'utf8')),
    reviewBoundaryRubric,
  );
  const trial = (sessionPrefix) => ({
    caseRuns: reviewBoundaryGoldSuite.cases.map((entry, index) => ({
      caseId: entry.id,
      sessionId: `${sessionPrefix}-${index + 1}`,
      classification: structuredClone(entry.expected),
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 10,
        toolCalls: 0,
        failedToolCalls: 0,
        usageObserved: true,
      },
    })),
  });
  const reviewBoundaryCalibrationCertificate = buildAdaptiveDevelopmentConvergenceReviewBoundaryCalibrationCertificate({
    runnerCommit: input.runnerCommit,
    environmentSha256: input.environmentSha256,
    manifestSha256: input.manifestSha256,
    modelId: input.modelId,
    calibrationScopeSha256: input.calibrationScopeSha256 ?? 'a'.repeat(64),
    calibrationPlanSha256: input.calibrationPlanSha256 ?? 'b'.repeat(64),
    rubric: reviewBoundaryRubric,
    goldSuite: reviewBoundaryGoldSuite,
    trials: [trial('review-boundary-calibration-session-1'), trial('review-boundary-calibration-session-2')],
  });
  return { reviewBoundaryRubric, reviewBoundaryGoldSuite, reviewBoundaryCalibrationCertificate };
}
