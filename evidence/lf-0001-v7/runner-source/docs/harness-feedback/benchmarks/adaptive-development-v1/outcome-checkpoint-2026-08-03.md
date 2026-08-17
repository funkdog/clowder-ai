# LF-0001 Adaptive Development S0 — Outcome Checkpoint

Date: 2026-08-03
Last updated: 2026-08-04

## Verdict

Stop. None of the three real S0 launches produced a valid arm measurement. The first launch failed before controlled
MCP access; the separately authorized second launch reached Codex but every controlled MCP tool call was denied by
missing non-interactive tool approval; the third launch failed before any model usage while the authenticated parent
initialized its in-process app-server state. No launch can support an effect, tie, SOP-failure, cost-efficiency or
scale claim.

The evaluation written by runner SHA `5baa06ce9185bb043715ea6d1455805f2fdf06a0` reported
`insufficient_evidence`. Replaying the same immutable receipts through the repaired fail-closed evaluator reports
`stop`, because all five attempts lack complete terminal token usage. This is a stricter interpretation of the same
evidence, not a post-hoc arm result.

Budget terminology below is historical evidence for the four frozen launches. The current execution contract uses
`tokenPolicy=unbounded`; the old 160,000/240,000 initial reservation figures do not describe or authorize a current
launch.

## Frozen launch

- Launch scope: `c52d6a82d1f0b35dd0459b505af07b7241191f2e18537c3db1140de616ae238d`
- Launch-plan SHA-256: `ca003af1ec20a42580efca7171c2442a9febc8379a79f59247bd10141d37be79`
- Operator approval message: `cat-cafe://message/0001785723026887-001330-97385a73`
- Runner SHA: `5baa06ce9185bb043715ea6d1455805f2fdf06a0`
- Stage ceiling: 200,000 weighted tokens; 160,000 reserved initially plus one 40,000 retry
- Local immutable run root: `/private/tmp/lf0001-live-run-r1-c52d6a82`
- Managed-command receipt: `managed-command:hold-ball-1785723169754-bu8sla`
- Wall time: 284 seconds

The stage ledger contains five reservations totaling the full 200,000-token ceiling: four initial attempts and one
treatment retry for `local-pwa-reconnect-input`. A reservation is not evidence that the provider consumed the same
amount.

### Second frozen launch

- Launch scope: `8b2997b4dac716fdf39944cf8b0835ed3d68c7d6891f090949b2e9e243f620bb`
- Launch-plan SHA-256: `f0d63d95ee1b1bd859258d1df8ef679ec1b1a68070f6a38da57e02b92ca4d1d8`
- Operator approval message: `cat-cafe://message/0001785727243423-001363-196d3376`
- Runner SHA: `93e7ccaafce4c0f210b1e7588e503a459961adf4`
- Stage ceiling: 300,000 weighted tokens; 240,000 reserved initially plus one unused 60,000 retry
- Local immutable run root: `/private/tmp/lf0001-live-run-r2-8b2997b4`
- Wall time: approximately 449 seconds

The second ledger contains only the four initial 60,000-token reservations, totaling 240,000; no infrastructure retry
was consumed. The runner completed with exit code zero, but that process status does not establish measurement
validity.

### Third frozen launch

- Launch scope: `bc78e1925a8331ab487af9d3f8f54cbd0d5c5b50b2b41f3a8f59d21ab5b6c490`
- Launch-plan SHA-256: `c827476702e5fbb89a6f5ac4e805b5950b3e33ee01d6ef0442d9419dc84edae0`
- Operator approval message: `cat-cafe://message/0001785751238668-001532-ea97e81e`
- Runner SHA: `a9c89dbac3f077e7559646d9f4165b8ca52f03d7`
- Stage ceiling: 300,000 weighted tokens; 240,000 reserved initially plus one 60,000 retry
- Local immutable run root: `/private/var/tmp/lf0001-live-run-r3-bc78e192`

The third ledger contains five 60,000-token reservations totaling the full 300,000-token ceiling. All five attempts
failed before provider usage, so the reservation total is a hard authorization ceiling rather than observed token
consumption.

## Observed outcome

| Arm | Attempts | Terminal non-infrastructure runs | Verified successes | Known raw tokens | Known weighted tokens |
|---|---:|---:|---:|---:|---:|
| baseline old SOP | 2 | 0 | 0 | 64,780 | 24,076 |
| treatment new SOP | 3 | 0 | 0 | 97,063 | 47,143 |

Known weighted tokens are `input - cached_input + output`, matching the configured rollout-budget weights. Both raw
and weighted totals are lower bounds: every reviewer ended with `shared rollout token budget exhausted` before a
terminal usage event. The run therefore did not observe complete provider usage. Tokens per verified success and
arm cost deltas are undefined.

All five executors reached a terminal response, made no file changes and left the hidden oracle red. Their only tool
calls were the generic MCP resource/template listings, both empty. No executor called the intended controlled file
or check tools. Every blind reviewer then failed before terminal completion.

### Second-launch observed outcome

| Arm | Attempts | Valid non-infrastructure runs | Verified successes | Raw input + output tokens | Weighted tokens |
|---|---:|---:|---:|---:|---:|
| baseline old SOP | 2 | 0 | 0 | 252,286 | 77,438 |
| treatment new SOP | 2 | 0 | 0 | 263,321 | 77,465 |

Weighted tokens are again `input - cached_input + output`. All eight model sessions emitted complete terminal usage:
511,567 input, 360,704 cached input and 4,040 output tokens, for 154,903 weighted tokens in total. This cost is
observed infrastructure waste, not tokens per valid benchmark outcome.

All four executors returned truthful deferred checkpoints and made zero changed files. Across executor and reviewer
JSONL, 39 controlled MCP calls started and then failed with `user cancelled MCP tool call`. Consequently all four
hidden oracles failed and all four blind reviews requested changes. No hard invariant miss or false achieved claim
occurred. The runner-produced aggregate reported four completed non-infrastructure runs and a 0% rate in each arm;
this checkpoint overrides that interpretation because the identical tool-transport failure prevented either Skill
from attempting its task.

### Third-launch observed outcome

| Arm | Attempts | Valid non-infrastructure runs | Verified successes | Observed weighted tokens |
|---|---:|---:|---:|---:|
| baseline old SOP | 2 | 0 | 0 | 0 |
| treatment new SOP | 3 | 0 | 0 | 0 |

Every executor stderr contains the same terminal error:
`failed to initialize in-process app-server client: Operation not permitted (os error 1)`. No reviewer started, no
candidate was created and no terminal usage event existed. The evaluator therefore reports `status=stop`,
`effectClaimEligible=false`, five infrastructure errors and incomplete token usage. The numeric 0% rates in the arm
objects have an empty effect denominator and are not arm performance estimates.

## First-launch root causes

1. The real controlled MCP server never started. Node resolved the copied server entry through `/private`, but the
   Seatbelt profile allowed the final workspace/control subpaths without allowing metadata traversal of their parent
   directories. Startup failed with `EPERM: operation not permitted, lstat '/private'`.
2. Preflight tested isolated `node -e` file reads rather than starting the copied MCP server and requesting
   `tools/list`, so it incorrectly reported isolation as passed.
3. The model instructions described “controlled MCP tools” without enumerating them or distinguishing tools from
   MCP resources/templates, reinforcing an unusable discovery path after server startup failed.
4. The blind-reviewer rollout cap was 10,000 weighted tokens. All five reviewer sessions exhausted it; the original
   evidence path combined absent reviewer usage as numeric zero and made the aggregate look complete.
5. The evaluator compared raw input tokens to a weighted rollout ceiling. The repaired evaluator uses
   `input - cached_input + output` for the hard-ceiling metric while retaining raw counters in evidence.

## Second-launch root cause

Production preflight proved that the Seatbelt-wrapped MCP server could initialize, list tools, read a file and run
`diff_check`, but it spoke to the server directly. The actual non-interactive Codex invocation set
`approval_policy="never"` without setting `mcp_servers.controlled.default_tools_approval_mode="approve"`. Codex CLI
0.146.0 therefore rejected each otherwise permitted MCP call as `user cancelled MCP tool call`. The repository's
normal Codex carrier already sets this server-level approval mode; the benchmark invocation had not copied that
required runtime contract.

The attempt classifier trusted process exit, terminal usage and structured output. It did not inspect failed tool-call
events, so a model that truthfully returned `claimed=deferred` after total tool failure was persisted as `completed`
instead of `infrastructure_error`. That explains why no retry was taken and why the runner aggregate is not the final
measurement-validity verdict.

## Third-launch root cause

The standard-tool candidate correctly separated the authenticated parent from role-native inner permission profiles,
but its main `codex exec` invocation did not set `CODEX_HOME`. The parent inherited the real `~/.codex`; the outer
Seatbelt profile granted exact native-Codex reads of `auth.json` and writes to `~/.codex/tmp`, but app-server startup
also initializes writable SQLite/log/state files at the state-directory root. Production preflight verified
`--version`, login status and inner tool permissions without exercising that parent state-write contract, so all four
initial attempts and the sole retry failed before model usage.

## Repair and next gate

The first local candidate:

- grants only `file-read-metadata` on the workspace/control ancestor chain, while the existing source, parent and
  sibling escape tests remain denied;
- starts the real Seatbelt-wrapped server during preflight, performs `initialize`, verifies the exact six-tool
  surface, reads the assigned workspace and requires `diff_check` to return exit code zero;
- invokes the fixed CommandLineTools Git binary with system/global configuration disabled and grants only the
  toolchain read/execute paths needed by that approved check;
- tells executor/reviewer sessions which controlled tools are callable and forbids resource/template discovery;
- records `usageComplete=false` when any model session lacks terminal usage and stops scale evaluation;
- keeps the proven 30,000 executor cap and calibrates the reviewer to 30,000, producing a proposed 300,000-token S0
  stage ceiling (240,000 initial plus one 60,000 retry).

The second local repair, frozen at `d8d17e41ba38a7f4b92faed9d2daec4ad379b260`, then:

- pins `mcp_servers.controlled.default_tools_approval_mode="approve"` in every executor and reviewer invocation;
- records failed Codex tool-call events in telemetry;
- classifies a session with any failed tool call as infrastructure failure even if Codex exits zero, emits terminal
  usage and writes schema-valid output;
- keeps the existing direct MCP preflight and all Seatbelt escape denials unchanged.

That candidate was independently approved but never launched. Operator review then rejected the custom MCP/tool
permission architecture as unlike normal local development, so any scope derived from it is stale.

The active local redesign now:

- deletes the benchmark-specific MCP server, catalog and automatic approval path;
- gives executor and reviewer sessions the standard local Codex shell, edit and test surface;
- disables Codex's nested sandbox/approval layer only inside one runner-owned macOS Seatbelt process container, so
  there is no second tool-permission protocol to cancel calls;
- keeps the source repository, workspace parent and sibling temporary paths unreadable, gives the executor its
  anonymous workspace as writable and gives the blind reviewer a separate read-only bundle;
- records network access as enabled, matching the local development environment instead of claiming offline tools;
- makes production preflight run the actual Codex binary without a model request plus workspace read/write, Git and
  focused-test probes through the same outer profile;
- retains failed tool-call counts as telemetry but treats ordinary shell/test failures as model behavior. Only an
  incomplete process, terminal-usage or structured-output contract is infrastructure failure; the hidden oracle,
  scope invariants and blind review decide task success.

Formal review rejected the first standard-tool candidate at runner SHA
`700b5a310b7054908c84e9a90343e35d1068f725`: its shared Seatbelt profile let shell children read plaintext Codex
credentials, let the executor write `.git` before runner-owned Git/oracle work occurred outside containment, and did
not preserve a trustworthy behavioral-versus-infrastructure failed-call classification. Its prepared scope
`20f3461f32b4c3f7a77658c53c77317575e139910fbe381f7959b77d10e6d800` is stale and was never authorized.

The finding-scoped repair now:

- pins the native Codex executable separately from its JavaScript wrapper and grants only that exact process read
  access to `auth.json`; a synthetic sentinel test proves ordinary Node cannot read it, while production preflight
  requires an authenticated `codex login status` without a model request;
- denies `.git` writes to every process for the entire model session, including model-invoked Git; only after that
  process exits does a separate post-model profile allow the frozen CommandLineTools Git executable to update
  repository metadata;
- runs all post-model changed-path inspection, staging, commit, candidate diff/materialization and terminal-oracle
  commands inside that hardened profile, with hooks, fsmonitor and commit signing disabled, system/global Git
  configuration and replace objects ignored, and external diff/text conversion disabled;
- proves a pre-existing failing hook cannot affect the sandboxed commit and proves candidate code cannot write a
  sibling path;
- classifies failed shell commands and file edits as behavioral evidence, while an unknown/non-command failed item
  is infrastructure-fatal; total, behavioral and infrastructure failed-call counts are persisted in receipt-bound
  evidence and must satisfy an exact sum invariant.

The current finding-scoped repair gives each executor and reviewer a synthetic `control/codex-home`, passes it to the
parent invocation as `CODEX_HOME`, and keeps real `auth.json` reachable through an absolute symlink only while that
parent process is running. The link is removed in `finally`; fixture sessions receive no credential link. The outer
profile permits state writes only inside the session control directory, while the inner executor/reviewer profiles
continue to deny the full run/control root. Production preflight now binds the same synthetic home and verifies parent
startup, state-directory writes and authenticated status without a model request. Synthetic macOS tests prove the
trusted reader can follow the link while ordinary outer Node and both inner role profiles cannot.

At that checkpoint the repair was locally verified but still required independent formal review of a frozen exact
SHA. The third 300,000-token `bc78…` authority was fully spent and did not authorize another attempt. A future live
attempt required an approved exact runner SHA plus a new co-creator message binding its generated scope and execution
policy.

### Fourth frozen launch

- Launch scope: `048d885d646647a8bc187814eb4102969d11ee9674873528cb9b212094922b9b`
- Launch-plan SHA-256: `ab6baff6504a59f9e05be771082ffa13b0211de25eb6118a4fd7ea238febdf57`
- Operator approval message: `cat-cafe://message/0001785853474884-002178-474c7ca9`
- Runner SHA: `f2120c75ca1862a40bf396b6a57e7fe0d9b247db`
- Stage ceiling: 300,000 weighted tokens; four initial 60,000 reservations plus one treatment retry
- Local immutable run root: `/private/var/tmp/lf0001-f212-s0-live-bajMKu`

All five executor turns performed task work but exhausted their 30,000-token rollout share before terminal usage;
no reviewer started and no attempt entered the effect denominator. At least three turns also exposed a real tool
boundary defect: Node entry-point resolution failed with `EPERM` while traversing the denied
`/private/var/tmp/lf0001-f212-s0-live-bajMKu` ancestor. The immutable evaluator reports `stop` with five incomplete
usage reasons and no effect, tie, cost-efficiency or scale claim.

The operator then selected completion-first execution with no model-token limit. The current local repair changes the
formal manifest, launch scope, launch plan, attempt ledger and evidence contracts to bind `tokenPolicy=unbounded`,
while keeping the 600-second per-attempt deadline, complete terminal usage, one infrastructure retry, exact
authorization and all isolation invariants. The 30,000-token cap remains only on the zero-inference carrier-readiness
probe. The current runner removes the snapshot-expanded inner permission profile and invokes frozen native Codex
inside one runner-owned outer Seatbelt profile. Exact ancestor metadata makes Node entry-point resolution work without
granting ancestor file reads; source, parent, control and both existing and late-created sibling paths remain denied.
Process-filtered rules reserve credentials, control state and loopback provider transport for the trusted parent,
while model children cannot read those surfaces or recursively launch native Codex. Real `node --test` and two-request
carrier regressions prove both the usable tool path and control-plane denial. The spent `048d…` approval does not
authorize this changed runner. The live path now reruns the complete dynamic preflight before admission and uses a
trusted TTL=0 Redis lifecycle to consume one exact plan/approval once. All initial and retry attempt admissions are
persisted as `reserved`, `running` or `terminal`; a running attempt left by a crash cannot be replayed.

```yaml
outcome: not_achieved
review_state: pending
effect_claim_eligible: false
automatic_scale: false
rerun_authorized: false
```
