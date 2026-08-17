# LF-0001 real-episode outcome metric contract

This contract treats one genuine Agent SOP invocation graph and its frozen
candidate as the measured unit. The candidate Agent naturally understands,
inspects, plans, uses tools, verifies, replans, and may use A2A inside that one
episode. Formal Review is part of the SOP only when its own demand rule requires
it; the harness never inserts a Reviewer into the candidate workflow.

After candidate freeze, a post-hoc Review-boundary Judge and the sealed behavior
Oracle measure the same immutable candidate. Deterministic runner checks own the
execution/freeze/feedback invariants. These are evaluation-plane sensors: none
may change the candidate, send findings back to the Agent, or open a repair
round.

## Metric birth certificate

```yaml
metric_birth_certificate:
  utility_claim: >-
    Under the same task and hard boundaries, Adaptive SOP should let the Agent
    choose its own understanding, planning, tools, verification and replanning
    steps, preserve correctness and safety, and reduce elapsed time, tokens,
    tool calls, unnecessary steps and workflow friction. Formal Review is a
    conditional guard: no Review without demand, no Review over a moving
    candidate, and independent exact-candidate Review only when demand exists
    after candidate stability.
  estimator:
    unit: one exact scope-bound Agent episode and its frozen candidate
    candidate_result: >-
      The current non-scoring canary emits a diagnostic vector only. It records
      execution completion, every sealed behavior, hard boundaries, exact-one
      candidate/freeze/feedback/repair facts, Review-boundary classification,
      Outcome Checkpoint/Oracle consistency, and structural measurement
      validity. Because overall Semantic Judge calibration is incomplete, it
      emits neither a conjunctive pass bit nor Y.
    retained_shape: >-
      Preserve the Agent invocation graph, candidate checkpoint, ordered
      behavior vector, hard-boundary result, candidate/freeze/feedback/repair
      facts, Review demand/verdict/findings, checkpoint/Oracle consistency,
      input/cached/output tokens, tool calls, elapsed timing, and infrastructure
      validity; never replace them with an abstract weighted score.
    effect_denominator: >-
      Only valid, completed, held-out paired episodes enter an effect estimate,
      and only after the remaining Semantic Judge dimensions are calibrated.
      Compare Adaptive SOP with default SOP on correctness/safety
      non-inferiority and process-cost reduction. Infrastructure-invalid
      attempts and non-scoring canaries are excluded rather than counted as
      candidate failures.
  validity_bounds:
    - Candidate execution is exactly one natural_agent_graph invocation; A2A children remain inside that episode.
    - Formal Review occurs only when the public SOP demands it; the post-hoc Judge is never counted as that review.
    - The frozen Outcome Checkpoint is receipt-bound but is not Review authority. Review demand `required` with a stable achieved candidate passes only with `reviewState=reviewed` plus an authenticated independent Review request/verdict bound to the candidate SHA and patch hash; required-but-moving remains `pending`; `not_required` passes only with `reviewState=pending` and no authenticated Formal Review observation.
    - A Review observation fails closed when its request is absent or stale, its Review Unit differs, its reviewer is the author or outside the observed child graph, its verdict is not approved, or its P1/P2 count is nonzero.
    - Candidate freeze occurs before Judge or Oracle starts.
    - Review-boundary Judge and Oracle receive no write or feedback path to the frozen candidate and cannot trigger a second execution.
    - Review-boundary Judge receives the original public task, candidate snapshot, checkpoint, invocation evidence, and runner-authenticated Review observation, but not the sealed Oracle, gold implementation, treatment identity, or hidden rationale.
    - Review-boundary Judge receives the exact arm-independent, versioned Review rubric bound into the scope. It never receives the human-gold calibration cases or either arm's Skill identity.
    - The rubric, raw gold Review attempts, exact production observer, observer-derived Judge projections, shared Judge prompt/schema/parser/static-proof contract, model/environment, and two complete per-case calibration trials are frozen before a canary scope can be authorized. Rejected attempt subtypes are not disclosed to or claimed as distinguishable by the Judge. A drifted or ledger-unproven certificate fails closed.
    - Every actionable Review-boundary finding is static proof bound to the exact candidate or runner-provided evidence visibility manifest. Task correctness and deterministic facts are not re-judged by the model.
    - Candidate, Judge, scope, manifest, environment, toolchain, and ordered behavior vector remain exact-bound.
    - Usage is complete only when the receipt accounts for root, every observed child, and Judge session exactly once; an unaccounted child invalidates the usage claim.
    - A non-repeatable sealed Oracle result invalidates the episode rather than changing Y.
    - Candidate and post-hoc adjudication deadlines are separate exact-scope safety bounds; exhausting either before completion invalidates the episode. Actual candidate/adjudication durations remain receipt telemetry.
    - `calibrationCoverage=review_boundary_only` and `overallSopCalibrationComplete=false` are scope- and receipt-bound. The current certificate cannot support an overall SOP or improvement claim.
  consumer: >-
    The LF-0001/F192 owner and operator use the retained result vector to decide
    whether the SOP harness is ready for a paired effect trial. A non-scoring
    canary alone cannot support an uplift claim.
  calibration_plan: >-
    On every manifest, runner, environment, toolchain, task, or behavior-contract
    change, rerun the model-free specificity matrix: baseline must be all false;
    gold and behavior-equivalent alternate must be all true; each registered
    single-fault mutation must fail exactly its target. Separately freeze an
    arm-independent Review-boundary rubric and human-gold boundary suite, then
    pass every raw gold Review attempt through the exact production observer,
    materialize the observer-derived production Judge file projection, then require
    two independent arm-blind trials with one isolated Judge session per case to
    reproduce every classification and pass the production static-proof validator.
    The exact approval binds 13 cases per trial and 26 unbounded Judge sessions.
    Both calibrations precede canary authorization and
    are non-scoring. Before any full Semantic Judge or paired-effect claim, add
    production-shaped gold cases for local-only adaptive execution,
    unnecessary fixed ritual/over-Review, false achieved, insufficient
    verification, post-hoc feedback, hidden repair, unauthorized action, and
    reasonable replan versus runaway work.
  repeatability_contract:
    stage: post_hoc_measurement
    frozen: scope, manifest, runner, environment, toolchain, task, candidate, ordered behavior IDs
    oracle_runs: >-
      One exact-bound run when all behaviors pass; two independent exact-bound
      runs when any behavior fails. Aggregate or vector disagreement makes the
      episode infrastructure-invalid.
    allowed_randomness: candidate Agent and post-hoc Review-boundary Judge model sampling
    forbidden_randomness: sealed Oracle semantics, fixtures, order, environment, and candidate
```

## Execution and measurement planes

1. **Candidate execution:** one real provider/Agent invocation receives the
   public `modelInput` and SOP Skill. Planning and replan are internal Agent
   behavior; A2A creates real child invocations in the same episode.
2. **Candidate freeze:** the runner records the final SHA and patch hash,
   receipt-bound checkpoint, authenticated Review observation when one exists,
   root/child sessions, session-accounting telemetry, changed paths, and hard
   invariants.
3. **Post-hoc measurement:** the independent Review-boundary Judge classifies
   only Formal Review demand/state/authenticated evidence, while the sealed
   Oracle evaluates task behaviors and the runner evaluates deterministic
   invariants. They start only after freeze and may run concurrently.
4. **Terminal projection:** successful measurement produces
   `status=diagnostic_complete` and preserves every named dimension without an
   aggregate pass/fail bit. A dimension failure remains visible in that vector;
   it never coaches or reruns the candidate. Final Y is undefined until the
   remaining Semantic Judge dimensions are calibrated.

This is the critical distinction: a Reviewer is a participant in the product
SOP when Review demand exists; a Judge is an external measurement instrument.
Calling the Judge “Reviewer” or always invoking Formal Review changes the system
under test and invalidates the causal claim.

Current scope v7 enforces one candidate execution, `maximumRepairRounds=0`, a
read-only post-hoc Judge with `feedbackToCandidate=false`, the exact canonical
Review-boundary rubric and calibration certificate, and diagnostic-only receipt v4. Review-boundary calibration is a separately
authorized, one-shot, TTL=0-ledger execution. Its v2 gold suite feeds raw Review attempts
through the exact production observer before materializing the same eight
`.adaptive-development-judge/` files used in production, and every case is run through
the same prompt, output schema, parser, visibility manifest, and static-proof validator
in two independent per-case trials. Rejected-attempt subtypes collapse to absent authenticated
evidence, matching production visibility, and the exact approval binds all 26 unbounded Judge
sessions. Canary preparation consumes no Judge provider calls.
Consumed v1–v6 plans and receipts v1–v2 remain readable as
historical ledger evidence only. They cannot be newly authorized as the current
design.

## Timing contract

- `candidateWallTimeMsCap` bounds the single real Agent SOP episode.
- `adjudicationWallTimeMsCap` bounds post-hoc Review-boundary Judge and sealed Oracle
  measurement, including Oracle repeatability after a failure.
- `wallTimeMsCap` is the candidate cap plus adjudication cap because there is no
  harness-induced repair episode.

Both phase deadlines are capped by the lifecycle deadline. The receipt also
records `candidateElapsedMs`, `adjudicationElapsedMs`, and their exact sum. An
incomplete Judge or Oracle is infrastructure-invalid, not a completed diagnostic.

## Intervention card

```yaml
intervention_card:
  observed_loss: >-
    The earlier canary modeled the SOP as Executor→fixed Reviewer→possible
    repair and therefore inserted a workflow participant that the public SOP
    only conditionally requires.
  competing_attributions:
    - Candidate model failed to infer and implement the task boundaries.
    - The harness changed the candidate execution policy by forcing Review.
    - Reviewer or sealed Oracle feedback coached a later candidate.
  key_scientific_question: >-
    Can one genuine Agent SOP episode naturally complete the task, with its
    outcome verified only after freeze by independent sensors?
  intervention_lever: >-
    Remove the fixed Reviewer and all evaluator-triggered repair; retain one
    natural Agent graph, then run an independent Review-boundary Judge and sealed Oracle.
  causal_rationale: >-
    The candidate execution must match the system whose SOP capability we claim
    to measure. Evaluation convenience cannot redefine that execution.
  expected_delta: >-
    A failure can now be attributed to the candidate episode or a named
    measurement validity failure, without hidden coaching or forced workflow.
  falsifier: >-
    More than one candidate execution occurs, Judge or Oracle data reaches the
    candidate, the Judge is counted as Formal Review, or a post-hoc finding
    opens repair.
  replay_cohort: long-disposable-checkout-writes at its frozen local-history base
  holdout: a future task with distinct public AC and sealed behaviors
  cost_and_rollback: one reviewed commit; current v7 scope is never silently downgraded to a historical contract
```
