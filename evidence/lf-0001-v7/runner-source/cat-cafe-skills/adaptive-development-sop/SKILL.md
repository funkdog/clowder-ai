---
name: adaptive-development-sop
description: >
  Run an explicit opt-in, local-only free-plan development trial where the model controls strategy and soft steps while existing repository/runtime gates enforce concrete effects. Use for adaptive-development-sop, adaptive-local-trial, free-plan hard-gates, or faster model-directed work on an isolated reversible task. Every user-facing alias activates free_plan_hard_gates; structured AdaptiveSopPlan remains offline research. Ordinary local work stays independent of Work orchestration and ends with proportional verification, an honest Outcome Checkpoint, and review_state=pending handoff. Formal Review starts only for Review demand plus a stable candidate. Not for production user data, external or irreversible effects without action-level authority, remote publication without separate authority, or project-default use. The default development SOP remains unchanged.
---

# Adaptive Development SOP

Optimize for useful software sooner, not for completing a ritual. Let the model choose soft steps, order, tools, and proportional verification while existing hard-enforced boundaries remain authoritative.

## Enter the mode

Enter only after an explicit opt-in in the current thread. All user-facing opt-ins enter `free_plan_hard_gates`. Treat `adaptive-development-sop`, `adaptive-local-trial`, and `free-plan hard-gates` as aliases for this same short-term path.

The structured adaptive plan/admission arm remains offline research. Do not generate an `AdaptiveSopPlan`, `SopAdmissionDecision`, capability-resolution response, plan fingerprint, or another machine admission artifact in ordinary development work.

Activation is the only operator instruction required beyond the desired outcome already present in the task. Do not ask the operator to restate metadata, verification policy, review policy, receipt fields, or the no-publication boundary.

Use the current task request as the outcome. Inspect the project path, worktree, branch, base SHA, diff, and other repository facts directly. Do not ask the operator for evaluation metadata. Do not ask the operator to classify review intent. Infer review intent from the requested outcome and next intended action. Only stop for operator input when an existing hard boundary genuinely requires new authority or a value choice changes the requested outcome.

The mode applies to the current bounded task only. It does not change the repository-wide default.

## Keep the development path thin

The ordinary `free_plan_hard_gates` path does not create or manage a Work identity,
execution lifecycle, claim, acceptance record, or evaluation receipt. Do not ask the
operator for orchestration metadata, and do not make safe local progress depend on a
control-plane write.

Before mutation, inspect repository identity, isolated-worktree containment, baseline
facts, and one-commit recoverability directly. These independent facts protect the
development path even when passive observation is unavailable.

Existing Work-management capabilities remain available as a separate explicit workflow
when the operator requests durable Work tracking. Activating this Skill alone never
selects that workflow and never makes it a prerequisite for local development.

### Local pilot wiring

When this Skill exists only in an unmerged pilot worktree, cats provision its one-time local mount after the operator opts in:

```bash
pnpm sync:skills --user --source-current --only=adaptive-development-sop
```

Run that command from the pilot worktree. It mounts only this Skill into the four supported HOME provider roots and deliberately skips project-level sync. Do not ask the operator to run the wiring command or repeat it per task. Never use the pilot source mode without the operator's local-pilot opt-in.

## Containment and hard gates

Before mutation, inspect independent repository facts and identify the concrete effects implied by the next useful work. Use existing repository and runtime gates at the point of action. Do not use a task category, directory name, protected-surface label, a model-authored risk flag, or the legacy `full_sop` as a safety oracle. Separate changing sensitive code from executing a sensitive effect.

Keep the adaptive strategy active while handling each concrete effect:

- proceed when the required evidence and authority already exist;
- treat unresolved evidence as `need_evidence`, continue other safe work, and do not declare the affected result review-ready;
- treat missing operator authority as `need_authority` and pause only the unresolved action;
- refuse a prohibited effect and replan around it when possible.

Code changes to authentication, persistence, runtime behavior, public contracts, or external-dependency wiring do not end adaptive mode by category. They may proceed when existing gates preserve isolation, compatibility evidence, proportional verification, and required cross-individual review.

Actual external-user effects, destructive or irreversible effects, credential or permission changes, significant spend, and remote publication require explicit action-level authority before execution. Production user data access is denied in a local trial; use isolated development or test data instead.

Classify enforcement as `hard-enforced`, `instruction-enforced`, or `unknown` when that distinction matters to the next action. This Skill does not turn instructions into hard gates. Unknown enforcement is not authority; investigate or pause the affected action without constructing a structured admission envelope.

Stop adaptive mutation when repository identity, isolated-worktree containment, or one-commit recoverability is lost. This is a containment failure, not proof that another SOP is safe. Preserve the partial work and independently observed evidence before choosing a separately verified recovery workflow.

## Execute model-directed work

State the desired outcome and the next falsifiable check, then act. A low-risk task may use a zero-to-three-line working plan; do not create a planning artifact merely to satisfy this Skill.

Do not map task classes to fixed steps. Select, omit, replace, or reorder soft steps according to the actual repository state. Prefer:

- one focused inspection before editing;
- the first meaningful diff as soon as the failure or contract is understood;
- targeted tests during iteration;
- one appropriately scoped final verification when the local result becomes trial-ready.

Recheck concrete effects after the first meaningful diff, whenever scope expands, and before any gated effect executes. Preserve ball custody, runtime data safety, public-contract ownership, cross-individual review, and exact-SHA gate evidence.

Do not push, open a PR, or merge unless the operator separately and explicitly requests remote publication.

## Plan the Review boundary

Infer one review intent from the task and its next intended action:

- `local_result`: implement, fix, investigate, or try the result locally;
- `formal_review`: obtain a formal Review, approval, a reviewed local artifact, or readiness for a later delivery decision;
- `delivery`: push, open a PR, merge, release, or otherwise publish remotely.

An explicit delivery request implies Formal Review demand, but it does not itself grant remote-publication authority. Publication remains a separate action-level gate.

Formal Review begins only when both conditions are true:

1. **Review demand exists**: the operator explicitly asks for formal review or delivery, or the next intended action explicitly requires reviewed state under the repository contract.
2. **A stable Review Candidate exists**: the outcome is achieved; no planned edits remain in the Review Unit; repository and diff identity are known; targeted verification is green; scope, exclusions, architecture impact, and material risks are explainable; and an exact SHA or equivalent immutable diff identity can be supplied.

Mutation, commit, iteration, task size, elapsed time, or sensitive category do not independently trigger Formal Review. Continue local implementation across small slices until a stable candidate forms, unless an existing hard gate blocks the next concrete effect.

If Review demand exists but the candidate is still moving, keep `review_state=pending`, finish the bounded Review Unit, and do not ask a reviewer to chase a moving diff. If a stable candidate exists but no Review demand exists, return the local result with `review_state=pending`.

## Define the Review Unit

A Review Unit is one independently acceptable, verifiable, and recoverable outcome claim. It may span multiple implementation slices, commits, tests, and documentation updates. It is not a commit, chat turn, directory, timebox, or file-count threshold.

Keep related slices in one Review Unit when a reviewer needs them together to decide whether the outcome is acceptable. Split a Review Unit only when at least one of these is true:

- the parts have independent acceptance and rollback;
- a part serves an unrelated outcome;
- different reviewer expertise is needed;
- an authority or ownership boundary differs;
- one part is stable while another remains experimental or likely to churn;
- the combined diff no longer supports one coherent reviewer mental model.

Name the unit by outcome and immutable identity, for example: `callback replay rejects stale authorization receipts; base=<sha>; final=<sha>`. Do not create formal Review work merely because another implementation slice finished.

## Enter Formal Review

When Review demand and a stable Review Candidate both exist:

1. freeze the Review Unit and its exact SHA or diff identity;
2. run the full `quality-gate`;
3. optionally run `fresh-context-review` when it would reduce reviewer cognitive load;
4. run `request-review` and send the Review Unit, outcome claim, exclusions, verification evidence, risks, and exact identity to an independent reviewer;
5. set `review_state=in_review` only after the request reaches the independent reviewer, and keep it there until a verdict covers that exact candidate.

The Formal Review workflow begins when Review demand meets a stable candidate, but author-side gate preparation remains `review_state=pending`. `in_review` means that an independent reviewer actually has the frozen candidate, not merely that the author intends to request Review.

Automatically request required cross-individual review only at this Formal Review boundary. There is no lightweight Formal Review: consultation, pair thinking, or fresh-context scan may improve the work, but it does not set `review_state=reviewed` and is not an approval authority.

Formal Review is local unless remote publication was separately authorized. A reviewed local artifact can remain local.

## Handle Review changes

When the reviewer requests changes, set `review_state=changes_requested` and classify the change:

- **Finding-scoped repair**: the outcome, architecture, Review Unit, and authority boundary remain stable. Keep `review_state=changes_requested` while reproducing the finding, making the Red-Green repair, running targeted verification, and refreshing the diff and evidence. Return the new exact identity to the original reviewer, then set `review_state=in_review` when that reviewer receives it. Do not restart the entire development lifecycle or full quality-gate unless the repair changes its assumptions. The reviewer must confirm the exact new SHA or diff identity before `review_state=reviewed`.
- **Material candidate change**: scope expands, the outcome changes, architecture changes, or a new gated effect appears. Mark the old unit `stale`; create a new or revised unit with `review_state=pending`; finish it locally, rerun the full `quality-gate`, and request Formal Review for the new exact candidate. Set the new unit to `in_review` only after the reviewer receives it.

Any post-review mutation that changes the reviewed diff makes the prior approval stale until an independent reviewer covers the new exact identity.

## Replan

Replan when evidence falsifies the task understanding, a new concrete effect appears, targeted verification fails for a new reason, or an action is prohibited. Pause only the unresolved action when the remaining strategy is still contained.

If global containment is lost, stop further adaptive mutation and report the observed failure. Do not silently switch workflows or present a `full_sop` handoff as evidence that the risk has been controlled.

## Keep evaluation collection in the background

Complete the development thread with the normal task result. Do not emit TrialReceipt YAML, `candidateCase`, or an evaluation schema in the thread.

The runtime/harness must passively collect session events and timings. Git supplies diff
identity, an immutable managed-command receipt supplies trusted verification facts, and
an authenticated independent-reviewer route supplies observed review facts.
Provider-authored `tool_result` prose is never verification evidence. The review
observation must bind to a prior exact Review request and its immutable Review Unit; a
verdict-shaped message or a route whose trusted begin binding is missing is insufficient.
Managed-command verification must resolve through the immutable route-invocation binding
captured when that command-launching route began; completion-time "latest episode"
inference is forbidden. These observations are evaluation
evidence, not operational Review authority. The F192/eval collector may asynchronously
join the sources into a TrialReceipt and classify candidate cases. The development cat
must not self-join or self-grade that evidence.

Passive evaluation failure must not block development, review handoff, or delivery. If
the collector is unavailable, a trusted command receipt is missing, or evidence is
otherwise incomplete, complete the development task normally. Missing trusted
verification does not block the task; it only prevents the run from becoming an eval
candidate. Do not reconstruct a receipt from memory, ask the operator for fields, or
delay delivery.

Eval-collector implementers, not development agents, read [references/trial-receipt.md](references/trial-receipt.md) for the join and candidate-classification contract.

## Structured handoff

Keep task handoff structured even though the execution strategy is free. Report the achieved outcome, changed surface or exact diff identity, verification evidence, material remaining risk, next owner or action, and these coordination labels:

```yaml
review_intent: local_result | formal_review | delivery
review_state: pending | in_review | changes_requested | reviewed | stale
review_unit: <outcome + base/final SHA or diff identity>
```

These labels are human/team coordination metadata, not machine admission. Do not turn them into a mandatory pre-execution plan schema or ask the operator to supply them.

For a pending uncommitted local result, `review_unit` may identify the outcome, base SHA, and changed paths without manufacturing a patch hash. An immutable final SHA or diff identity becomes mandatory only when forming a stable Review Candidate for Formal Review.

At the Formal Review boundary use the exact parseable shape:

```yaml
review_unit: outcome=<claim>; base=<sha>; final=<sha>; diff=<diff-ref>
```

The independent verdict must repeat the same final SHA and diff ref plus explicit
P1/P2/P3 counts. A later Git snapshot that differs from this request makes the observed
approval stale.

Ordinary local work defaults to `review_intent=local_result` and `review_state=pending`. Tests, author self-checks, informal opinions, consultation, and fresh-context scans cannot set `review_state=reviewed`. Only an independent Formal Review verdict covering the exact Review Unit can do that.

End every bounded iteration with an **Outcome Checkpoint**:

- restate the original desired outcome and the final scope;
- distinguish achieved, not achieved, and explicitly deferred outcomes;
- name the exact changed surface or candidate identity;
- list verification and independent Review evidence actually observed;
- state material remaining risks and the next real owner/action;
- keep engineering, review, delivery, and operator experience acceptance separate.

Use this concise terminal shape so the operator can compare the request with the result
without reconstructing the iteration from chat history:

```yaml
Outcome Checkpoint
original_outcome: <the operator's requested outcome>
final_scope: <what this bounded iteration actually covered>
achieved: <verified outcomes, or none>
not_achieved: <unmet outcomes, or none>
deferred: <explicitly deferred outcomes, or none>
changed_surface: <paths, behavior, or exact candidate identity>
verification_evidence: <checks actually observed, or none>
review_evidence: <independent Review actually observed, or none>
remaining_risks: <material risks, or none known>
next_owner_or_action: <the next real owner/action>
operator_experience: pending
review_intent: local_result | formal_review | delivery
review_state: pending | in_review | changes_requested | reviewed | stale
review_unit: <outcome + base/final SHA or diff identity>
```

The terminal checkpoint is incomplete when any of these fields is omitted. Use `none`
where the truthful value is empty; do not omit the axis. `operator_experience` in an
agent-authored checkpoint is always `pending`: only an explicit operator message can
change the separately observed experience assessment.

Completeness is not success. If `achieved` is `none`, or `not_achieved` contains an
unmet part of the original outcome, the passive collector records a failed engineering
outcome even though every checkpoint field is present.

The checkpoint is coordination evidence, not acceptance authority. It must not infer
`accepted` from tests, Review, merge, a confident summary, or operator silence. Operator
experience acceptance remains pending until the operator explicitly accepts, rejects, or
defers the outcome.

## Common mistakes

- **Review per slice**: asking for Formal Review after every small commit or implementation slice makes free-plan execution as costly as the full lifecycle. Batch coherent work into one Review Unit.
- **Moving-target review**: requesting Review before the candidate is stable wastes reviewer context and invalidates evidence.
- **Lightweight approve**: an informal peer check or fresh-context scan is useful input, not Formal Review.
- **Unstructured handoff**: free strategy does not mean vague ownership or missing evidence. Preserve a concise structured handoff.
- **Shadow-only work**: generating a decorative plan while still performing every soft step does not improve speed. Use active model-directed execution.
- **Category fallback**: treating auth, persistence, runtime, or public-contract code as an automatic reason to abandon adaptive strategy preserves the old workflow instead of enforcing the real effect boundary.
- **Schema bureaucracy**: generating structured plan/admission artifacts on the user-facing path recreates the heavy protocol that is intentionally offline.
- **Handwritten eval receipt**: making the development cat copy timing, provenance, or candidate fields into the thread adds harness tax and self-report bias. Leave collection to the runtime/eval path.
- **Silent publication**: local-only does not mean “locally enabled but remotely merged.” Remote publication requires a separate operator instruction.

## Exit

For `review_intent=local_result`, run targeted, diff-proportional final verification and return the structured handoff with `review_state=pending`. Do not load or run the full `quality-gate` merely to end a local trial.

For `review_intent=formal_review` or `review_intent=delivery`, enter Formal Review only after the Review Unit is stable. Run the full `quality-gate`, optionally use `fresh-context-review`, then use `request-review`. Do not call the result reviewed until the independent verdict covers the exact candidate.

Never enter `merge-gate` or execute remote publication without a separate remote-publication instruction.

Always include the Outcome Checkpoint before yielding the iteration back to the operator.
