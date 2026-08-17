# TrialReceipt collector contract

Owner: **F192 eval collector**. This is a background evaluation entity, not a development-thread output or an operational acceptance record.

The collector joins passive runtime/session telemetry with independently resolved Git and verification facts, authenticated reviewer-route observations, and explicit operator-experience feedback. Development agents must not emit this schema, invent missing values, or classify their own work.

```yaml
episodeId: <stable-passive-evaluation-id>
mode: free_plan_hard_gates
collectorContractVersion: adaptive-development-collector.v3
outcome: success | corrected_success | failed | abandoned
startedAt: <timestamp-or-missing>
modelId: <observed-model-or-missing>
harnessVersion: <skill-or-runtime-version-or-missing>
projectPath: <absolute-path-or-missing>
worktree: <absolute-path-or-missing>
branch: <branch-or-missing>
baseSha: <sha-or-missing>
finalSha: <sha-or-missing>
diffRef: <commit-sha-or-worktree-diff-hash-or-missing>
scopeEnvelope: <short-observed-summary>
timeToFirstMeaningfulDiffMs: <number-or-missing>
reviewReadyElapsedMs: <number-or-missing>
omittedOrReplacedSoftSteps: []
replans: []
verificationRefs: []
reviewRefs: []
reviewedFinalSha: <sha-covered-by-review-observation-or-missing>
reviewedDiffRef: <diff-ref-covered-by-review-observation-or-missing>
reviewFindingCounts: { p1: <number-or-missing>, p2: <number-or-missing>, p3: <number-or-missing> }
strategyResult: continue | stopped
actionGateSummary: { satisfied: <count>, needEvidence: <count>, needAuthority: <count>, denied: <count> }
operatorExperience: accepted | rejected | deferred | not_assessed
harnessFriction:
  routeFailures: <count>
  invocationTimeouts: <count>
  recoveryNudges: <count>
  controlPlaneFailures: <count>
stopReason: <reason-or-not-applicable>
missingFields: []
candidateCase: true | false
candidateCaseReason: <short-reason>
```

Missing remains missing; it is never coerced to zero, pass, accepted, or not-applicable. If the collector cannot independently resolve the required sources, it derives no receipt yet or keeps the receipt from becoming a candidate case (`candidateCase: false`).

The runtime creates a durable episode only after an explicit public-alias activation. Episode identity is evaluation-local and never appears in the development prompt. It does not authorize an effect, admit Work, select an execution, publish a delivery claim, or gate completion. Production route hooks only project bounded facts into an off-thread worker; SQLite, Git resolution, receipt joins, and collection do not run on the API event loop. Observer/store/collector failure is fail-isolated: the development route, Review handoff, and separately authorized delivery continue normally.

A complete Outcome Checkpoint plus coordination labels is the terminal engineering handoff signal. The observer requires every request/result alignment axis defined by the Skill; a title plus Review labels is not a checkpoint. Structural completeness does not imply success: `achieved: none` or a non-empty `not_achieved` maps the engineering terminal to `failed`. Tests, Review, merge, a confident summary, and silence do not create operator acceptance. `operatorExperience` changes only from an explicit operator accept/reject/defer statement; otherwise it remains `not_assessed` and appears in `missingFields`.

Verification is accepted only from an immutable managed-command receipt owned by the runtime. When an observed route begins, the observer persists an immutable outer-route-invocation-to-episode binding. The receipt carries that opaque route invocation ID alongside its source-event ID, child invocation/tool identity, structured exit code, command kind, and command/output digests; it never persists raw command or output. On completion the observer resolves only through the persisted binding—never the thread's latest episode. A legacy or incomplete receipt without this binding is ignored by passive evaluation. Provider or model `tool_result` content is never trusted, even when its prose contains `exit_code: 0`. A missing receipt only keeps the episode out of the candidate set; it never blocks development.

For mutating work, exact Review binding requires:

- a prior exact Review request containing the Review Unit, base SHA, final SHA, and diff ref;
- a different authenticated reviewer route from the author route;
- a trusted route-begin observation proving that the reviewer was actually targeted;
- an explicit `APPROVE` or `REQUEST CHANGES` observation;
- an explicitly labeled 40-character reviewed final SHA;
- an explicitly labeled reviewed diff ref;
- observed P1/P2/P3 counts;
- the verdict to reference the exact prior Review request;
- `reviewedFinalSha` exactly matches `finalSha`, and `reviewedDiffRef` exactly matches `diffRef`.

This reviewer-route observation is evaluation evidence, not the operational Review or acceptance authority. If route begin is missing, the observer drops the verdict instead of inferring reviewer authority from the responding cat. The observer re-resolves Git when the operator later records experience; any post-review change invalidates the exact binding and forces `candidateCase: false` until an independent reviewer covers the new final identity.

Baseline-untracked paths are content-fingerprinted. A content change, addition, deletion, unreadable file, or pre-existing tracked dirt fails closed instead of being described as `commit:HEAD`.

The local receipt may contain local identity needed for replay. A remotely publishable eval bundle uses a versioned publish-safe projection: opaque episode references and aggregate evidence only, with local paths, cat/model identifiers, branches, SHAs, diff/source refs, and activation text omitted. Provenance binds the collector contract version and exact generator commit.

A daily episode is only a candidate evaluation case. Once used to tune the harness it becomes a regression case; reserve unseen holdout cases for comparative evaluation.
