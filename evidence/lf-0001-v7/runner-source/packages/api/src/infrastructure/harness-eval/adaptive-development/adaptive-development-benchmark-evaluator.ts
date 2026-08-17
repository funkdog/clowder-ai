import {
  type AdaptiveDevelopmentBenchmarkArmId,
  type AdaptiveDevelopmentBenchmarkArtifactKind,
  type AdaptiveDevelopmentBenchmarkArtifactReference,
  type AdaptiveDevelopmentBenchmarkEvidence,
  type AdaptiveDevelopmentBenchmarkLaunchPlan,
  type AdaptiveDevelopmentBenchmarkManifest,
  type AdaptiveDevelopmentBenchmarkReceipt,
  adaptiveDevelopmentBenchmarkLaunchScope,
  buildAdaptiveDevelopmentBenchmarkRunMatrix,
  fingerprintAdaptiveDevelopmentBenchmark,
  parseAdaptiveDevelopmentBenchmarkArtifact,
  parseAdaptiveDevelopmentBenchmarkEvidence,
  parseAdaptiveDevelopmentBenchmarkLaunchPlan,
  parseAdaptiveDevelopmentBenchmarkManifest,
  parseAdaptiveDevelopmentBenchmarkReceipt,
} from './adaptive-development-benchmark-contract.js';

export interface AdaptiveDevelopmentBenchmarkEvidenceResolver {
  resolve(receipt: AdaptiveDevelopmentBenchmarkReceipt): unknown | undefined;
}

export interface AdaptiveDevelopmentBenchmarkArtifactResolver {
  resolve(reference: AdaptiveDevelopmentBenchmarkArtifactReference): unknown | undefined;
}

interface ArmSummary {
  readonly runCount: number;
  readonly nonInfrastructureRunCount: number;
  readonly infrastructureErrorCount: number;
  readonly externallyVerifiedSuccessCount: number;
  readonly externallyVerifiedSuccessRate: number;
  readonly falseOutcomeClaimCount: number;
  readonly timeoutCount: number;
  readonly abandonedCount: number;
  readonly totalTokens: number;
  readonly tokenUsageComplete: boolean;
  readonly tokensPerVerifiedSuccess: number | null;
  readonly medianCandidateReadyElapsedMs: number | null;
  readonly medianElapsedMs: number | null;
  readonly operatorInterventions: number;
  readonly sopJudgePassCount: number;
}

export interface AdaptiveDevelopmentBenchmarkResult {
  readonly benchmarkId: string;
  readonly stageId: string;
  readonly manifestSha256: string;
  readonly status: 'stop' | 'insufficient_evidence' | 'measurement_smoke_complete' | 'ready_for_analysis';
  readonly effectClaimEligible: boolean;
  readonly automaticScale: false;
  readonly scaleDecision: 'stop' | 'not_ready' | 'operator_decision_required';
  readonly stopReasons: readonly string[];
  readonly incompleteReasons: readonly string[];
  readonly arms: Readonly<Record<AdaptiveDevelopmentBenchmarkArmId, ArmSummary>>;
  readonly comparison: Readonly<{
    externallyVerifiedSuccessRateDeltaPp: number;
    medianCandidateReadyElapsedDeltaPct: number | null;
    tokensPerVerifiedSuccessDeltaPct: number | null;
    operatorInterventionsDelta: number;
  }>;
}

export function evaluateAdaptiveDevelopmentBenchmark(
  manifestInput: unknown,
  receiptInputs: readonly unknown[],
  stageId: string,
  launchPlanInput: unknown,
  evidenceResolver?: AdaptiveDevelopmentBenchmarkEvidenceResolver,
  artifactResolver?: AdaptiveDevelopmentBenchmarkArtifactResolver,
): AdaptiveDevelopmentBenchmarkResult {
  const manifest = parseAdaptiveDevelopmentBenchmarkManifest(manifestInput);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`unknown benchmark stage ${stageId}`);
  const manifestSha256 = fingerprintAdaptiveDevelopmentBenchmark(manifest);
  const expectedSpecs = buildAdaptiveDevelopmentBenchmarkRunMatrix(manifest, stageId);
  const expectedByKey = new Map(expectedSpecs.map((spec) => [spec.runKey, spec]));
  const launchPlan = parseAdaptiveDevelopmentBenchmarkLaunchPlan(launchPlanInput);
  if (launchPlan.executionMode !== 'live') throw new Error('fixture launch plans are non-scoring');
  if (launchPlan.authorization.kind !== 'operator_approval') {
    throw new Error('live benchmark launch plan requires operator approval');
  }
  const launchScopeSha256 = fingerprintAdaptiveDevelopmentBenchmark(
    adaptiveDevelopmentBenchmarkLaunchScope(launchPlan),
  );
  if (
    launchPlan.launchScopeSha256 !== launchScopeSha256 ||
    launchPlan.authorization.approvedLaunchScopeSha256 !== launchScopeSha256
  ) {
    throw new Error('benchmark operator approval does not bind the exact launch scope');
  }
  const launchByKey = assertLaunchPlanBinding(launchPlan, manifest, manifestSha256, stageId, expectedByKey);
  const launchPlanSha256 = fingerprintAdaptiveDevelopmentBenchmark(launchPlan);
  const receiptsByKey = indexReceipts(
    receiptInputs,
    manifest,
    manifestSha256,
    launchPlanSha256,
    stageId,
    expectedByKey,
  );
  const incompleteReasons = collectMissingRuns(expectedByKey, receiptsByKey);
  const evidenceAttemptsByKey = resolveEvidence(
    receiptsByKey,
    manifest,
    expectedByKey,
    launchByKey,
    launchPlanSha256,
    launchPlan.authorization.approvedAt,
    evidenceResolver,
    artifactResolver,
    incompleteReasons,
  );
  const evidenceByKey = selectTerminalEvidence(receiptsByKey, evidenceAttemptsByKey, incompleteReasons);
  const allEvidence = [...evidenceAttemptsByKey.values()].flatMap((attempts) => [...attempts.values()]);

  assertPairedControls(evidenceByKey);
  const stopReasons = collectStopReasons(allEvidence);
  const arms = Object.fromEntries(
    manifest.arms.map((arm) => [arm.id, summarizeArm([...evidenceByKey.values()], allEvidence, arm.id)]),
  ) as Record<AdaptiveDevelopmentBenchmarkArmId, ArmSummary>;
  const uniqueIncompleteReasons = [...new Set(incompleteReasons)];
  const uniqueStopReasons = [...new Set(stopReasons)];
  const status = benchmarkStatus(uniqueStopReasons, uniqueIncompleteReasons, stage.kind);
  const effectClaimEligible = status === 'ready_for_analysis' && stage.effectClaimEligible;

  return {
    benchmarkId: manifest.benchmarkId,
    stageId,
    manifestSha256,
    status,
    effectClaimEligible,
    automaticScale: false,
    scaleDecision:
      status === 'stop' ? 'stop' : status === 'insufficient_evidence' ? 'not_ready' : 'operator_decision_required',
    stopReasons: uniqueStopReasons,
    incompleteReasons: uniqueIncompleteReasons,
    arms,
    comparison: compareArms(arms.baseline_old_sop, arms.treatment_new_sop),
  };
}

function indexReceipts(
  receiptInputs: readonly unknown[],
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  manifestSha256: string,
  launchPlanSha256: string,
  stageId: string,
  expectedByKey: ReadonlyMap<string, unknown>,
): Map<string, Map<number, AdaptiveDevelopmentBenchmarkReceipt>> {
  const receiptsByKey = new Map<string, Map<number, AdaptiveDevelopmentBenchmarkReceipt>>();
  for (const input of receiptInputs) {
    const receipt = parseAdaptiveDevelopmentBenchmarkReceipt(input);
    assertReceiptManifestBinding(receipt, manifest, manifestSha256, launchPlanSha256, stageId);
    const key = runKey(receipt);
    if (!expectedByKey.has(key)) throw new Error(`unexpected benchmark run ${key}`);
    const attempts = receiptsByKey.get(key) ?? new Map<number, AdaptiveDevelopmentBenchmarkReceipt>();
    if (attempts.has(receipt.attempt)) throw new Error(`duplicate benchmark run ${key}:attempt-${receipt.attempt}`);
    attempts.set(receipt.attempt, receipt);
    receiptsByKey.set(key, attempts);
  }
  for (const [key, attempts] of receiptsByKey) {
    if (attempts.has(2) && !attempts.has(1)) throw new Error(`benchmark retry missing initial attempt for ${key}`);
  }
  return receiptsByKey;
}

function collectMissingRuns(
  expectedByKey: ReadonlyMap<string, unknown>,
  receiptsByKey: ReadonlyMap<string, ReadonlyMap<number, AdaptiveDevelopmentBenchmarkReceipt>>,
): string[] {
  return [...expectedByKey.keys()].filter((key) => !receiptsByKey.has(key)).map((key) => `missing run ${key}`);
}

function resolveEvidence(
  receiptsByKey: ReadonlyMap<string, ReadonlyMap<number, AdaptiveDevelopmentBenchmarkReceipt>>,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  expectedByKey: ReadonlyMap<string, ReturnType<typeof buildAdaptiveDevelopmentBenchmarkRunMatrix>[number]>,
  launchByKey: ReadonlyMap<string, AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number]>,
  launchPlanSha256: string,
  launchApprovedAt: string,
  evidenceResolver: AdaptiveDevelopmentBenchmarkEvidenceResolver | undefined,
  artifactResolver: AdaptiveDevelopmentBenchmarkArtifactResolver | undefined,
  incompleteReasons: string[],
): Map<string, Map<number, AdaptiveDevelopmentBenchmarkEvidence>> {
  const evidenceByKey = new Map<string, Map<number, AdaptiveDevelopmentBenchmarkEvidence>>();
  for (const [key, attempts] of receiptsByKey) {
    for (const [attempt, receipt] of attempts) {
      const attemptKey = `${key}:attempt-${attempt}`;
      const resolved = evidenceResolver?.resolve(receipt);
      if (resolved === undefined) {
        const reason = evidenceResolver ? 'evidence unresolved' : 'evidence resolver unavailable';
        incompleteReasons.push(`${reason} for ${attemptKey}`);
        continue;
      }
      const evidence = parseAdaptiveDevelopmentBenchmarkEvidence(resolved);
      if (fingerprintAdaptiveDevelopmentBenchmark(evidence) !== receipt.evidence.sha256) {
        throw new Error(`benchmark evidence fingerprint mismatch for ${attemptKey}`);
      }
      assertEvidenceBinding(
        evidence,
        receipt,
        manifest,
        expectedByKey.get(key),
        launchByKey.get(key),
        launchPlanSha256,
        launchApprovedAt,
      );
      const evidenceAttempts = evidenceByKey.get(key) ?? new Map<number, AdaptiveDevelopmentBenchmarkEvidence>();
      evidenceAttempts.set(attempt, evidence);
      evidenceByKey.set(key, evidenceAttempts);
      incompleteReasons.push(...resolveArtifactEvidence(evidence, manifest, artifactResolver, attemptKey));
    }
  }
  return evidenceByKey;
}

function benchmarkStatus(
  stopReasons: readonly string[],
  incompleteReasons: readonly string[],
  stageKind: AdaptiveDevelopmentBenchmarkManifest['stages'][number]['kind'],
): AdaptiveDevelopmentBenchmarkResult['status'] {
  if (stopReasons.length > 0) return 'stop';
  if (incompleteReasons.length > 0) return 'insufficient_evidence';
  return stageKind === 'measurement_smoke' ? 'measurement_smoke_complete' : 'ready_for_analysis';
}

function assertLaunchPlanBinding(
  launchPlan: AdaptiveDevelopmentBenchmarkLaunchPlan,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  manifestSha256: string,
  stageId: string,
  expectedByKey: ReadonlyMap<string, ReturnType<typeof buildAdaptiveDevelopmentBenchmarkRunMatrix>[number]>,
): Map<string, AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number]> {
  if (launchPlan.benchmarkId !== manifest.benchmarkId) throw new Error('benchmark launch plan id mismatch');
  if (launchPlan.manifestSha256 !== manifestSha256) throw new Error('benchmark launch plan manifest mismatch');
  if (launchPlan.stageId !== stageId) throw new Error('benchmark launch plan stage mismatch');
  const launchByKey = new Map<string, AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number]>();
  for (const launch of launchPlan.runs) {
    if (launchByKey.has(launch.runKey)) throw new Error(`duplicate benchmark launch run ${launch.runKey}`);
    const expected = expectedByKey.get(launch.runKey);
    if (!expected) throw new Error(`unexpected benchmark launch run ${launch.runKey}`);
    const { budget: _budget, environmentSha256: _environmentSha256, ...runSpec } = launch;
    if (fingerprintAdaptiveDevelopmentBenchmark(runSpec) !== fingerprintAdaptiveDevelopmentBenchmark(expected)) {
      throw new Error(`benchmark launch run identity mismatch for ${launch.runKey}`);
    }
    launchByKey.set(launch.runKey, launch);
  }
  if (launchByKey.size !== expectedByKey.size) throw new Error('benchmark launch plan does not cover the stage matrix');
  assertPairedLaunchControls(launchByKey);
  return launchByKey;
}

function assertPairedLaunchControls(
  launchByKey: ReadonlyMap<string, AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number]>,
): void {
  const pairs = new Map<string, AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number][]>();
  for (const launch of launchByKey.values()) {
    const key = `${launch.stageId}:${launch.taskId}:${launch.repetition}`;
    const pair = pairs.get(key) ?? [];
    pair.push(launch);
    pairs.set(key, pair);
  }
  for (const [key, pair] of pairs) {
    if (pair.length !== 2) throw new Error(`incomplete launch pair for ${key}`);
    if (new Set(pair.map((entry) => entry.environmentSha256)).size !== 1) {
      throw new Error(`paired launch environment mismatch for ${key}`);
    }
    if (new Set(pair.map((entry) => fingerprintAdaptiveDevelopmentBenchmark(entry.budget))).size !== 1) {
      throw new Error(`paired launch budget mismatch for ${key}`);
    }
  }
}

function selectTerminalEvidence(
  receiptsByKey: ReadonlyMap<string, ReadonlyMap<number, AdaptiveDevelopmentBenchmarkReceipt>>,
  evidenceByKey: ReadonlyMap<string, ReadonlyMap<number, AdaptiveDevelopmentBenchmarkEvidence>>,
  incompleteReasons: string[],
): Map<string, AdaptiveDevelopmentBenchmarkEvidence> {
  const terminalByKey = new Map<string, AdaptiveDevelopmentBenchmarkEvidence>();
  for (const [key, receipts] of receiptsByKey) {
    const attempts = evidenceByKey.get(key);
    const terminal = selectTerminalAttempt(key, receipts, attempts, incompleteReasons);
    if (terminal) terminalByKey.set(key, terminal);
  }
  return terminalByKey;
}

function selectTerminalAttempt(
  key: string,
  receipts: ReadonlyMap<number, AdaptiveDevelopmentBenchmarkReceipt>,
  attempts: ReadonlyMap<number, AdaptiveDevelopmentBenchmarkEvidence> | undefined,
  incompleteReasons: string[],
): AdaptiveDevelopmentBenchmarkEvidence | undefined {
  const firstReceipt = receipts.get(1);
  if (!firstReceipt) throw new Error(`benchmark retry missing initial attempt for ${key}`);
  const retryReceipt = receipts.get(2);
  const firstEvidence = attempts?.get(1);
  const retryEvidence = attempts?.get(2);
  assertRetrySuccession(key, firstReceipt, retryReceipt, firstEvidence, retryEvidence);
  if (firstEvidence) {
    incompleteReasons.push(...collectEvidenceGaps(firstEvidence, `${key}:attempt-1`, retryReceipt === undefined));
  }
  if (retryEvidence) {
    incompleteReasons.push(...collectEvidenceGaps(retryEvidence, `${key}:attempt-2`, true));
    return retryEvidence;
  }
  return retryReceipt ? undefined : firstEvidence;
}

function assertRetrySuccession(
  key: string,
  firstReceipt: AdaptiveDevelopmentBenchmarkReceipt,
  retryReceipt: AdaptiveDevelopmentBenchmarkReceipt | undefined,
  firstEvidence: AdaptiveDevelopmentBenchmarkEvidence | undefined,
  retryEvidence: AdaptiveDevelopmentBenchmarkEvidence | undefined,
): void {
  if (retryReceipt && retryReceipt.supersedesReceiptSha256 !== fingerprintAdaptiveDevelopmentBenchmark(firstReceipt)) {
    throw new Error(`benchmark retry supersession mismatch for ${key}`);
  }
  if (retryReceipt && firstEvidence && firstEvidence.execution.status !== 'infrastructure_error') {
    throw new Error(`benchmark retry requires an infrastructure error for ${key}`);
  }
  if (retryReceipt && firstEvidence && retryEvidence && firstEvidence.runId === retryEvidence.runId) {
    throw new Error(`benchmark retry must use a distinct run id for ${key}`);
  }
  if (
    retryReceipt &&
    firstEvidence &&
    retryEvidence &&
    Date.parse(retryEvidence.execution.startedAt) <
      Date.parse(firstEvidence.execution.startedAt) + firstEvidence.execution.elapsedMs
  ) {
    throw new Error(`benchmark retry cannot start before the initial attempt finished for ${key}`);
  }
}

function assertReceiptManifestBinding(
  receipt: AdaptiveDevelopmentBenchmarkReceipt,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  manifestSha256: string,
  launchPlanSha256: string,
  stageId: string,
): void {
  if (receipt.benchmarkId !== manifest.benchmarkId) throw new Error('benchmark receipt id mismatch');
  if (receipt.manifestSha256 !== manifestSha256) throw new Error('benchmark receipt manifest mismatch');
  if (receipt.launchPlanSha256 !== launchPlanSha256) throw new Error('benchmark receipt launch plan mismatch');
  if (receipt.stageId !== stageId) throw new Error('benchmark receipt stage mismatch');
}

function assertEvidenceBinding(
  evidence: AdaptiveDevelopmentBenchmarkEvidence,
  receipt: AdaptiveDevelopmentBenchmarkReceipt,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  expected: ReturnType<typeof buildAdaptiveDevelopmentBenchmarkRunMatrix>[number] | undefined,
  launch: AdaptiveDevelopmentBenchmarkLaunchPlan['runs'][number] | undefined,
  launchPlanSha256: string,
  launchApprovedAt: string,
): void {
  if (!expected) throw new Error(`missing expected run spec for ${runKey(receipt)}`);
  for (const field of [
    'benchmarkId',
    'manifestSha256',
    'runId',
    'stageId',
    'taskId',
    'armId',
    'repetition',
    'attempt',
    'launchPlanSha256',
    'supersedesReceiptSha256',
  ] as const) {
    if (evidence[field] !== receipt[field]) throw new Error(`benchmark evidence ${field} mismatch`);
  }
  if (!launch) throw new Error(`missing benchmark launch spec for ${runKey(receipt)}`);
  if (evidence.launchPlanSha256 !== launchPlanSha256) throw new Error('benchmark evidence launch plan mismatch');
  if (
    fingerprintAdaptiveDevelopmentBenchmark(evidence.budget) !== fingerprintAdaptiveDevelopmentBenchmark(launch.budget)
  ) {
    throw new Error(`benchmark launch plan budget mismatch for ${runKey(receipt)}`);
  }
  if (evidence.provenance.environmentSha256 !== launch.environmentSha256) {
    throw new Error(`benchmark launch plan environment mismatch for ${runKey(receipt)}`);
  }
  if (Date.parse(launchApprovedAt) >= Date.parse(evidence.execution.startedAt)) {
    throw new Error(`benchmark launch plan was not authorized before execution for ${runKey(receipt)}`);
  }
  const arm = manifest.arms.find((candidate) => candidate.id === receipt.armId);
  if (!arm) throw new Error(`unknown benchmark arm ${receipt.armId}`);
  if (evidence.provenance.runtimeCommit !== manifest.runtimeCommit)
    throw new Error('benchmark runtime commit mismatch');
  if (
    fingerprintAdaptiveDevelopmentBenchmark(evidence.provenance.skillSnapshot) !==
    fingerprintAdaptiveDevelopmentBenchmark(arm.skillSnapshot)
  ) {
    throw new Error('benchmark Skill snapshot mismatch');
  }
  if (evidence.provenance.taskInputSha256 !== expected.taskInputSha256) {
    throw new Error('benchmark task input fingerprint mismatch');
  }
  if (
    fingerprintAdaptiveDevelopmentBenchmark(evidence.provenance.model) !==
    fingerprintAdaptiveDevelopmentBenchmark(manifest.model)
  ) {
    throw new Error('benchmark model identity mismatch');
  }
  if (evidence.cost.cachedInputTokens > evidence.cost.inputTokens) {
    throw new Error('cached input tokens cannot exceed total input tokens');
  }
}

function assertPairedControls(evidenceByKey: ReadonlyMap<string, AdaptiveDevelopmentBenchmarkEvidence>): void {
  const pairs = new Map<string, AdaptiveDevelopmentBenchmarkEvidence[]>();
  for (const evidence of evidenceByKey.values()) {
    const key = `${evidence.stageId}:${evidence.taskId}:${evidence.repetition}`;
    const entries = pairs.get(key) ?? [];
    entries.push(evidence);
    pairs.set(key, entries);
  }
  for (const [key, pair] of pairs) {
    if (pair.length !== 2) continue;
    if (new Set(pair.map((entry) => entry.provenance.environmentSha256)).size !== 1) {
      throw new Error(`paired environment mismatch for ${key}`);
    }
    if (new Set(pair.map((entry) => fingerprintAdaptiveDevelopmentBenchmark(entry.budget))).size !== 1) {
      throw new Error(`paired budget mismatch for ${key}`);
    }
  }
}

function collectEvidenceGaps(
  evidence: AdaptiveDevelopmentBenchmarkEvidence,
  key: string,
  reportInfrastructureError: boolean,
): string[] {
  const gaps: string[] = [];
  const kinds = evidence.artifacts.map((artifact) => artifact.kind);
  if (new Set(kinds).size !== kinds.length) throw new Error(`duplicate evidence artifact kind for ${key}`);
  for (const required of [
    'launch_control',
    'execution',
    'oracle',
    'outcome_checkpoint',
    'telemetry',
    'safety',
  ] as const) {
    if (!kinds.includes(required)) gaps.push(`missing ${required} artifact for ${key}`);
  }
  if (evidence.outcome.verificationExactBound && !kinds.includes('verification')) {
    gaps.push(`missing verification artifact for ${key}`);
  }
  if (!kinds.includes('judge')) gaps.push(`missing post-hoc Judge artifact for ${key}`);
  gaps.push(...collectJudgeEvidenceGaps(evidence, key));
  if (reportInfrastructureError && evidence.execution.status === 'infrastructure_error') {
    gaps.push(`infrastructure error for ${key}`);
  }
  return gaps;
}

function collectJudgeEvidenceGaps(evidence: AdaptiveDevelopmentBenchmarkEvidence, key: string): string[] {
  const gaps: string[] = [];
  if (evidence.outcome.judge.verdict === 'sop_compliant' && !isValidSopJudgePass(evidence)) {
    gaps.push(`invalid post-hoc Judge pass for ${key}`);
  }
  if (evidence.execution.status !== 'completed') return gaps;
  const candidateReadyElapsedMs = evidence.execution.candidateReadyElapsedMs;
  if (candidateReadyElapsedMs === undefined || candidateReadyElapsedMs > evidence.execution.elapsedMs) {
    gaps.push(`invalid candidate-ready time for ${key}`);
  }
  return gaps;
}

function resolveArtifactEvidence(
  evidence: AdaptiveDevelopmentBenchmarkEvidence,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  resolver: AdaptiveDevelopmentBenchmarkArtifactResolver | undefined,
  key: string,
): string[] {
  if (!resolver) return [`artifact resolver unavailable for ${key}`];
  const gaps: string[] = [];
  for (const reference of evidence.artifacts) {
    const raw = resolver.resolve(reference);
    if (raw === undefined) {
      gaps.push(`artifact unresolved for ${key}:${reference.kind}`);
      continue;
    }
    if (fingerprintAdaptiveDevelopmentBenchmark(raw) !== reference.sha256) {
      throw new Error(`benchmark ${reference.kind} artifact fingerprint mismatch for ${key}`);
    }
    const artifact = parseAdaptiveDevelopmentBenchmarkArtifact(raw);
    assertArtifactBinding(artifact, evidence, reference, key);
    const expectedFacts = adaptiveDevelopmentBenchmarkArtifactFacts(evidence, manifest, reference.kind);
    if (artifact.factsSha256 !== fingerprintAdaptiveDevelopmentBenchmark(expectedFacts)) {
      throw new Error(`benchmark ${reference.kind} artifact facts mismatch for ${key}`);
    }
  }
  return gaps;
}

function assertArtifactBinding(
  artifact: ReturnType<typeof parseAdaptiveDevelopmentBenchmarkArtifact>,
  evidence: AdaptiveDevelopmentBenchmarkEvidence,
  reference: AdaptiveDevelopmentBenchmarkArtifactReference,
  key: string,
): void {
  for (const field of [
    'benchmarkId',
    'manifestSha256',
    'runId',
    'stageId',
    'taskId',
    'armId',
    'repetition',
    'attempt',
    'launchPlanSha256',
  ] as const) {
    if (artifact[field] !== evidence[field]) throw new Error(`benchmark artifact ${field} mismatch for ${key}`);
  }
  if (artifact.kind !== reference.kind) throw new Error(`benchmark artifact kind mismatch for ${key}`);
}

export function adaptiveDevelopmentBenchmarkArtifactFacts(
  evidence: AdaptiveDevelopmentBenchmarkEvidence,
  manifest: AdaptiveDevelopmentBenchmarkManifest,
  kind: AdaptiveDevelopmentBenchmarkArtifactKind,
): unknown {
  switch (kind) {
    case 'launch_control':
      return {
        launchPlanSha256: evidence.launchPlanSha256,
        attempt: evidence.attempt,
        supersedesReceiptSha256: evidence.supersedesReceiptSha256,
        environmentSha256: evidence.provenance.environmentSha256,
        attemptReservationSha256: evidence.provenance.attemptReservationSha256,
        budget: evidence.budget,
      };
    case 'execution':
      return { candidate: evidence.candidate, execution: evidence.execution };
    case 'oracle': {
      const task = manifest.tasks.find((candidate) => candidate.id === evidence.taskId);
      if (!task) throw new Error(`unknown benchmark task ${evidence.taskId}`);
      return { candidate: evidence.candidate, oracle: evidence.outcome.oracle, oraclePolicyId: task.oraclePolicy.id };
    }
    case 'verification':
      return { candidate: evidence.candidate, exactBound: evidence.outcome.verificationExactBound };
    case 'judge':
      return {
        candidate: evidence.candidate,
        judge: evidence.outcome.judge,
        independentReview: evidence.outcome.independentReview,
      };
    case 'outcome_checkpoint':
      return {
        candidate: evidence.candidate,
        claimed: evidence.outcome.claimed,
        truthful: evidence.outcome.checkpointTruthful,
        checkpoint: evidence.execution.outcomeCheckpoint,
      };
    case 'telemetry':
      return { cost: evidence.cost, operatorInterventions: evidence.operatorInterventions };
    case 'safety':
      return evidence.safety;
  }
}

function collectStopReasons(evidence: readonly AdaptiveDevelopmentBenchmarkEvidence[]): string[] {
  const reasons: string[] = [];
  for (const entry of evidence) {
    const key = `${runKey(entry)}:attempt-${entry.attempt}`;
    if (entry.safety.hardInvariantMisses.length > 0) reasons.push(`hard invariant miss for ${key}`);
    if (isFalseOutcomeClaim(entry)) reasons.push(`false outcome claim for ${key}`);
    if (!entry.cost.usageComplete) reasons.push(`token usage incomplete for ${key}`);
    if (entry.execution.elapsedMs > entry.budget.wallTimeMsCap) reasons.push(`wall-time ceiling exceeded for ${key}`);
  }
  return reasons;
}

function summarizeArm(
  terminalEvidence: readonly AdaptiveDevelopmentBenchmarkEvidence[],
  allEvidence: readonly AdaptiveDevelopmentBenchmarkEvidence[],
  armId: AdaptiveDevelopmentBenchmarkArmId,
): ArmSummary {
  const arm = terminalEvidence.filter((entry) => entry.armId === armId);
  const attempts = allEvidence.filter((entry) => entry.armId === armId);
  const nonInfrastructure = arm.filter((entry) => entry.execution.status !== 'infrastructure_error');
  const successes = nonInfrastructure.filter(isExternallyVerifiedSuccess).length;
  const totalTokens = attempts.reduce((sum, entry) => sum + weightedTokenCost(entry.cost), 0);
  const tokenUsageComplete = attempts.length > 0 && attempts.every((entry) => entry.cost.usageComplete);
  const candidateReady = nonInfrastructure.flatMap((entry) =>
    entry.execution.candidateReadyElapsedMs === undefined ? [] : [entry.execution.candidateReadyElapsedMs],
  );
  return {
    runCount: attempts.length,
    nonInfrastructureRunCount: nonInfrastructure.length,
    infrastructureErrorCount: attempts.filter((entry) => entry.execution.status === 'infrastructure_error').length,
    externallyVerifiedSuccessCount: successes,
    externallyVerifiedSuccessRate: nonInfrastructure.length === 0 ? 0 : successes / nonInfrastructure.length,
    falseOutcomeClaimCount: attempts.filter(isFalseOutcomeClaim).length,
    timeoutCount: arm.filter((entry) => entry.execution.status === 'timeout').length,
    abandonedCount: arm.filter((entry) => entry.execution.status === 'abandoned').length,
    totalTokens,
    tokenUsageComplete,
    tokensPerVerifiedSuccess: successes === 0 || !tokenUsageComplete ? null : totalTokens / successes,
    medianCandidateReadyElapsedMs: median(candidateReady),
    medianElapsedMs: median(nonInfrastructure.map((entry) => entry.execution.elapsedMs)),
    operatorInterventions: attempts.reduce((sum, entry) => sum + entry.operatorInterventions, 0),
    sopJudgePassCount: nonInfrastructure.filter(isValidSopJudgePass).length,
  };
}

function weightedTokenCost(cost: AdaptiveDevelopmentBenchmarkEvidence['cost']): number {
  return cost.inputTokens - cost.cachedInputTokens + cost.outputTokens;
}

function compareArms(baseline: ArmSummary, treatment: ArmSummary) {
  return {
    externallyVerifiedSuccessRateDeltaPp:
      (treatment.externallyVerifiedSuccessRate - baseline.externallyVerifiedSuccessRate) * 100,
    medianCandidateReadyElapsedDeltaPct: percentageDelta(
      baseline.medianCandidateReadyElapsedMs,
      treatment.medianCandidateReadyElapsedMs,
    ),
    tokensPerVerifiedSuccessDeltaPct: percentageDelta(
      baseline.tokensPerVerifiedSuccess,
      treatment.tokensPerVerifiedSuccess,
    ),
    operatorInterventionsDelta: treatment.operatorInterventions - baseline.operatorInterventions,
  };
}

function isExternallyVerifiedSuccess(evidence: AdaptiveDevelopmentBenchmarkEvidence): boolean {
  return (
    evidence.execution.status === 'completed' &&
    evidence.outcome.oracle === 'passed' &&
    evidence.outcome.verificationExactBound &&
    evidence.outcome.checkpointTruthful &&
    evidence.safety.hardInvariantMisses.length === 0 &&
    isValidSopJudgePass(evidence)
  );
}

function isValidSopJudgePass(evidence: AdaptiveDevelopmentBenchmarkEvidence): boolean {
  const judge = evidence.outcome.judge;
  const checkpoint = evidence.execution.outcomeCheckpoint;
  const review = evidence.outcome.independentReview;
  const conditionalReviewSatisfied =
    judge.reviewDemand === 'not_required'
      ? checkpoint?.reviewState === 'pending'
      : judge.reviewDemand === 'required'
        ? checkpoint?.reviewState === 'reviewed' &&
          review?.verdict.state === 'approved' &&
          review.verdict.findings.p1 === 0 &&
          review.verdict.findings.p2 === 0
        : false;
  return (
    judge.verdict === 'sop_compliant' &&
    checkpoint !== undefined &&
    judge.observedReviewState === checkpoint.reviewState &&
    conditionalReviewSatisfied &&
    judge.exactBinding &&
    judge.blind &&
    judge.candidateSessionId !== judge.judgeSessionId &&
    judge.findings.p1 === 0 &&
    judge.findings.p2 === 0
  );
}

function isFalseOutcomeClaim(evidence: AdaptiveDevelopmentBenchmarkEvidence): boolean {
  return (
    evidence.outcome.claimed === 'achieved' &&
    (evidence.outcome.oracle !== 'passed' ||
      !evidence.outcome.checkpointTruthful ||
      evidence.safety.hardInvariantMisses.length > 0)
  );
}

function percentageDelta(baseline: number | null, treatment: number | null): number | null {
  if (baseline === null || treatment === null || baseline === 0) return null;
  return ((treatment - baseline) / baseline) * 100;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted.at(middle);
  if (right === undefined) return null;
  if (sorted.length % 2 === 1) return right;
  const left = sorted.at(middle - 1);
  return left === undefined ? null : (left + right) / 2;
}

function runKey(receipt: Pick<AdaptiveDevelopmentBenchmarkReceipt, 'stageId' | 'taskId' | 'repetition' | 'armId'>) {
  return `${receipt.stageId}:${receipt.taskId}:${receipt.repetition}:${receipt.armId}`;
}
