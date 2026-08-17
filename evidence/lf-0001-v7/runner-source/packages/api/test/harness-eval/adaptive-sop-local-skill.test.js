import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '../../../..');
const skillPath = resolve(root, 'cat-cafe-skills/adaptive-development-sop/SKILL.md');
const agentPath = resolve(root, 'cat-cafe-skills/adaptive-development-sop/agents/openai.yaml');
const bootstrapPath = resolve(root, 'cat-cafe-skills/BOOTSTRAP.md');
const manifestPath = resolve(root, 'cat-cafe-skills/manifest.yaml');
const receiptContractPath = resolve(root, 'cat-cafe-skills/adaptive-development-sop/references/trial-receipt.md');
const syncScriptPath = resolve(root, 'scripts/sync-skills.sh');

function read(path) {
  return readFileSync(path, 'utf8');
}

function manifestEntry(manifest, skillName) {
  const start = manifest.indexOf(`\n  ${skillName}:`);
  const tail = start >= 0 ? manifest.slice(start + 1) : '';
  const nextEntryOffset = tail.slice(1).search(/\n {2}[a-z][a-z0-9-]*:/);
  return nextEntryOffset >= 0 ? tail.slice(0, nextEntryOffset + 1) : tail;
}

describe('LF-0001 adaptive development SOP local skill', () => {
  it('registers an explicit local-only free-plan mode without changing the default SOP', () => {
    const skill = read(skillPath);
    const manifest = read(manifestPath);

    assert.match(manifest, /^ {2}adaptive-development-sop:/m);
    assert.match(skill, /explicit opt-in/i);
    assert.match(skill, /local-only/i);
    assert.match(skill, /free_plan_hard_gates/i);
    assert.match(skill, /default development SOP remains unchanged/i);
  });

  it('routes every user-facing opt-in to free_plan_hard_gates', () => {
    const skill = read(skillPath);
    const agent = read(agentPath);
    const manifest = read(manifestPath);
    const adaptiveEntry = manifestEntry(manifest, 'adaptive-development-sop');

    assert.match(skill, /all user-facing opt-ins enter `free_plan_hard_gates`/i);
    assert.match(skill, /do not generate an `AdaptiveSopPlan`/i);
    assert.match(skill, /structured adaptive.*offline research/is);
    assert.doesNotMatch(skill, /independent resolver/i);
    assert.doesNotMatch(skill, /exact plan fingerprint/i);
    assert.match(agent, /free_plan_hard_gates/i);
    assert.match(adaptiveEntry, /free_plan_hard_gates/i);
  });

  it('gives the model control of soft steps while keeping existing hard gates', () => {
    const skill = read(skillPath);

    assert.match(skill, /model-directed/i);
    assert.match(skill, /do not map task classes to fixed steps/i);
    assert.match(skill, /production user data/i);
    assert.match(skill, /permission changes/i);
    assert.match(skill, /destructive or irreversible effects/i);
    assert.match(skill, /public contracts/i);
    assert.match(skill, /cross-individual review/i);
    assert.match(skill, /keep the adaptive strategy active/i);
    assert.match(skill, /need_evidence/i);
    assert.match(skill, /need_authority/i);
    assert.match(skill, /production user data access is denied/i);
    assert.doesNotMatch(skill, /fall back to `full_sop`/i);
    assert.match(skill, /do not.*present a `full_sop` handoff as evidence/is);
    assert.match(skill, /instruction-enforced/i);
    assert.match(skill, /does not turn instructions into hard gates/i);
    assert.match(skill, /existing repository and runtime gates/i);
    assert.match(skill, /structured handoff/i);
  });

  it('applies action-level gates without disabling adaptive mode for sensitive code', () => {
    const skill = read(skillPath);

    assert.match(
      skill,
      /code changes to authentication, persistence, runtime behavior, public contracts, or external-dependency wiring do not end adaptive mode/i,
    );
    assert.match(skill, /actual external-user effects.*require explicit action-level authority/is);
    assert.match(skill, /pause only the unresolved action/i);
    assert.match(skill, /containment failure, not proof that another SOP is safe/i);
    assert.doesNotMatch(skill, /protected surface is changing/i);
  });

  it('optimizes for development speed without hiding missing evidence or publishing remotely', () => {
    const skill = read(skillPath);
    const receiptContract = read(receiptContractPath);

    assert.match(skill, /first meaningful diff/i);
    assert.match(skill, /proportional verification/i);
    assert.match(skill, /do not push, open a PR, or merge/i);
    assert.match(receiptContract, /^timeToFirstMeaningfulDiffMs:/m);
    assert.match(receiptContract, /^reviewReadyElapsedMs:/m);
    assert.match(receiptContract, /missing remains missing/i);
    assert.match(receiptContract, /candidate case/i);
    assert.match(receiptContract, /holdout/i);
  });

  it('requires only activation plus the desired outcome from the operator', () => {
    const skill = read(skillPath);
    const agent = read(agentPath);

    assert.match(skill, /activation is the only operator instruction required/i);
    assert.match(skill, /do not ask the operator to restate/i);
    assert.match(agent, /\$adaptive-development-sop/);
  });

  it('keeps receipt generation out of the development thread and assigns it to the eval collector', () => {
    const skill = read(skillPath);
    const agent = read(agentPath);
    const manifest = read(manifestPath);
    const adaptiveEntry = manifestEntry(manifest, 'adaptive-development-sop');
    const receiptContract = read(receiptContractPath);

    for (const field of [
      'episodeId',
      'modelId',
      'harnessVersion',
      'worktree',
      'baseSha',
      'finalSha',
      'reviewedFinalSha',
      'reviewedDiffRef',
      'reviewRefs',
      'reviewFindingCounts',
      'operatorExperience',
      'harnessFriction',
    ]) {
      assert.match(receiptContract, new RegExp(`^${field}:`, 'm'));
    }
    assert.doesNotMatch(skill, /^## Emit the trial receipt$/m);
    assert.doesNotMatch(skill, /^episodeId:/m);
    assert.doesNotMatch(agent, /emit the receipt/i);
    assert.doesNotMatch(adaptiveEntry, /receipt/i);
    assert.match(skill, /runtime\/harness.*passively collect/is);
    assert.match(skill, /collector is unavailable.*complete the development task/is);
    assert.match(receiptContract, /owner.*F192.*eval collector/is);
    assert.match(skill, /do not load or run the full `quality-gate` merely to end a local trial/i);
  });

  it('returns a pending local task result instead of entering receipt or quality-gate workflows', () => {
    const bootstrap = read(bootstrapPath);
    const manifest = read(manifestPath);
    const adaptiveEntry = manifestEntry(manifest, 'adaptive-development-sop');

    assert.ok(adaptiveEntry, 'adaptive-development-sop manifest entry must exist');
    assert.match(adaptiveEntry, /^ {4}next: \[\]$/m);
    assert.match(
      bootstrap,
      /adaptive-development-sop\s*→\s*free strategy \+ hard gates \+ passive eval\s*→\s*Outcome Checkpoint/i,
    );
    assert.doesNotMatch(bootstrap, /adaptive-development-sop[^\n]*Work Contract/i);
    assert.doesNotMatch(bootstrap, /adaptive-development-sop\s*→\s*local trial receipt/i);
    assert.doesNotMatch(bootstrap, /\[adaptive-development-sop \| tdd\][\s\S]{0,80}→ quality-gate/i);
  });

  it('keeps ordinary local work pending and records review coordination metadata', () => {
    const skill = read(skillPath);
    const agent = read(agentPath);
    const manifest = read(manifestPath);
    const adaptiveEntry = manifestEntry(manifest, 'adaptive-development-sop');

    assert.match(skill, /review_intent:\s*local_result \| formal_review \| delivery/i);
    assert.match(skill, /review_state:\s*pending \| in_review \| changes_requested \| reviewed \| stale/i);
    assert.match(skill, /ordinary local work defaults to `review_intent=local_result` and `review_state=pending`/i);
    assert.match(skill, /human\/team coordination metadata, not machine admission/i);
    assert.match(skill, /pending uncommitted local result.*base SHA.*changed paths/is);
    assert.match(skill, /immutable final SHA or diff identity becomes mandatory only.*stable Review Candidate/is);
    assert.match(agent, /review_state=pending/i);
    assert.match(adaptiveEntry, /review_state=pending/i);
  });

  it('enters formal review only for review demand plus a stable review candidate', () => {
    const skill = read(skillPath);

    assert.match(skill, /Formal Review begins only when both conditions are true/i);
    assert.match(skill, /Review demand exists/i);
    assert.match(skill, /stable Review Candidate exists/i);
    assert.match(
      skill,
      /mutation, commit, iteration, task size, elapsed time, or sensitive category.*do not independently trigger Formal Review/is,
    );
    assert.match(skill, /do not ask the operator to classify review intent/i);
    assert.match(skill, /full `quality-gate`.*`request-review`/is);
    assert.match(skill, /automatically request required cross-individual review only at this Formal Review boundary/i);
    assert.match(skill, /author-side gate preparation remains `review_state=pending`/i);
    assert.match(skill, /`in_review` means that an independent reviewer actually has the frozen candidate/i);
  });

  it('defines review units by independently acceptable outcomes rather than implementation slices', () => {
    const skill = read(skillPath);

    assert.match(skill, /Review Unit is one independently acceptable, verifiable, and recoverable outcome claim/i);
    assert.match(skill, /may span multiple implementation slices, commits, tests, and documentation updates/i);
    assert.match(skill, /not a commit, chat turn, directory, timebox, or file-count threshold/i);
    assert.match(skill, /Split a Review Unit only when/i);
    assert.match(skill, /different reviewer expertise/i);
    assert.match(skill, /authority or ownership boundary/i);
  });

  it('does not invent a lightweight formal review or keep approval after candidate drift', () => {
    const skill = read(skillPath);

    assert.match(skill, /There is no lightweight Formal Review/i);
    assert.match(skill, /consultation, pair thinking, or fresh-context scan.*does not set `review_state=reviewed`/is);
    assert.match(skill, /finding-scoped repair/i);
    assert.match(skill, /original reviewer/i);
    assert.match(skill, /scope expands, the outcome changes, architecture changes, or a new gated effect appears/i);
    assert.match(skill, /mark the old unit `stale`/i);
    assert.match(skill, /exact new SHA or diff identity/i);
    assert.match(skill, /keep `review_state=changes_requested` while.*Red-Green repair/is);
    assert.match(skill, /new or revised unit with `review_state=pending`/i);
  });

  it('provides cat-owned one-time pilot wiring for ordinary local worktrees', () => {
    const skill = read(skillPath);
    const syncScript = read(syncScriptPath);

    assert.match(skill, /pnpm sync:skills --user --source-current --only=adaptive-development-sop/);
    assert.match(skill, /do not ask the operator to run the wiring command/i);
    assert.match(syncScript, /--source-current/);
    assert.match(syncScript, /--only=/);
  });

  it('requires candidate review evidence to match the exact final diff', () => {
    const skill = read(skillPath);
    const receiptContract = read(receiptContractPath);

    assert.match(skill, /automatically request required cross-individual review only at this Formal Review boundary/i);
    assert.doesNotMatch(skill, /candidateCase:/);
    assert.match(receiptContract, /candidateCase: false.*review/is);
    assert.match(receiptContract, /reviewedFinalSha.*exactly match(?:es)?.*finalSha/is);
    assert.match(receiptContract, /reviewedDiffRef.*exactly match(?:es)?.*diffRef/is);
    assert.match(receiptContract, /post-review change.*candidateCase: false/is);
    assert.match(receiptContract, /review request.*reviewer route/is);
    assert.match(skill, /review_unit: outcome=<.+>; base=<sha>; final=<sha>; diff=<diff-ref>/i);
  });

  it('keeps passive evidence trustworthy without adding latency or Work control to development', () => {
    const skill = read(skillPath);
    const receiptContract = read(receiptContractPath);

    assert.match(receiptContract, /off-thread worker/i);
    assert.match(receiptContract, /immutable managed-command receipt/i);
    assert.match(receiptContract, /provider.*tool_result.*never/i);
    assert.match(skill, /missing trusted\s+verification\s+does not\s+block/i);
    assert.match(receiptContract, /not_achieved.*failed/i);
    assert.match(receiptContract, /route-invocation-to-episode binding/i);
    assert.match(receiptContract, /never the thread's latest episode/i);
    assert.match(receiptContract, /route begin is missing.*drops the verdict/is);
  });
});
