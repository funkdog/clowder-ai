#!/usr/bin/env node

// Intent classification plus explicitly scoped diff analysis. No shell interpolation.
// Exit: 0 checked-negative/not-applicable; 2 hotfix; 3 unknown intent; 1 error.
// --scope committed (default) scans merge-base..HEAD; working-tree includes pending/untracked files.
// --title supplies the current task/proposed commit intent for an uncommitted candidate.
// --apply-label <PR> remains opt-in and only accepts the committed scope.
import { execFileSync } from 'node:child_process';
import { gitOutput, parseCheckOptions, readChangeScope, scopeSummary } from './lib/git-change-scope.mjs';

const HOTFIX_KEYWORDS = [
  /\bfix:/i,
  /\bhotfix:/i,
  /\bquick\s*fix\b/i,
  /\bminimal\s*fix\b/i,
  /\bband[- ]?aid\b/i,
  /\btemp(orary)?\s*(fix|patch|workaround|solution|hack)\b/i,
  /\bworkaround\b/i,
];
const matchesHotfix = (text) => HOTFIX_KEYWORDS.some((re) => re.test(text));
const gh = (args) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  }).trim();

function readIntent(candidate, suppliedTitle, prNumber) {
  const commits = gitOutput(candidate.repoRoot, ['log', `${candidate.mergeBase}..${candidate.head}`, '--format=%s'])
    .trim()
    .split('\n')
    .filter(Boolean);
  let prTitle = '';
  let labelPresent = false;
  if (prNumber) {
    const pr = JSON.parse(gh(['pr', 'view', prNumber, '--json', 'title,headRefOid,labels']));
    if (typeof pr.title !== 'string' || !pr.title.trim()) throw new Error('PR title was not returned');
    if (pr.headRefOid !== candidate.head) throw new Error('Local candidate HEAD does not match the current PR HEAD');
    if (!Array.isArray(pr.labels)) throw new Error('PR labels were not returned');
    prTitle = pr.title;
    labelPresent = pr.labels.some((label) => label.name === 'hotfix');
  }
  const hotfix = [...commits, prTitle, suppliedTitle].some(matchesHotfix);
  return {
    hotfix,
    labelPresent,
    commitCount: commits.length,
    prTitle: Boolean(prTitle),
    suppliedTitle: Boolean(suppliedTitle),
  };
}

function intentStatus(candidate, intent) {
  if (intent.hotfix) return 'checked';
  const hasIntent = intent.commitCount > 0 || intent.prTitle || intent.suppliedTitle;
  if (!candidate.changes.length && !hasIntent) return 'not_applicable';
  const pendingIntentMissing =
    candidate.scope === 'working-tree' &&
    candidate.excludedWorkingTreePaths.length > 0 &&
    !intent.prTitle &&
    !intent.suppliedTitle;
  return !hasIntent || pendingIntentMissing ? 'unknown' : 'checked';
}

function applyLabel(prNumber, labelPresent) {
  if (!prNumber || labelPresent) return { labelApplied: null, labelError: null, labelPresent };
  try {
    gh(['pr', 'edit', prNumber, '--add-label', 'hotfix']);
    return { labelApplied: true, labelError: null, labelPresent: true };
  } catch (error) {
    return { labelApplied: false, labelError: String(error.stderr || error.message).trim(), labelPresent: false };
  }
}

function main() {
  const options = parseCheckOptions(process.argv.slice(2), process.env.HOTFIX_BASE);
  if (options.help) {
    console.log(
      'Usage: node scripts/check-hotfix-pattern.mjs [--base ref] [--scope committed|working-tree] [--title text] [--apply-label PR]',
    );
    return;
  }
  const prNumber = options.applyLabel ?? process.env.PR_NUMBER;
  if (prNumber && !/^[1-9]\d*$/.test(prNumber)) throw new Error('PR number must be a positive integer');
  if (options.applyLabel && options.scope !== 'committed')
    throw new Error('Label application requires committed scope');
  const candidate = readChangeScope(options);
  const intent = readIntent(candidate, options.title?.trim() ?? '', prNumber);
  const { hotfix, labelPresent, ...intentSources } = intent;
  const status = intentStatus(candidate, intent);
  const totalAdditions = candidate.code.reduce((sum, file) => sum + file.additions, 0);
  const autoLabel = hotfix && candidate.code.length === 1 && totalAdditions <= 50;
  const result = {
    status,
    ...scopeSummary(candidate),
    hotfix: status === 'unknown' ? null : hotfix,
    autoLabel,
    ...applyLabel(autoLabel ? options.applyLabel : null, labelPresent),
    codeFileCount: candidate.code.length,
    totalAdditions,
    intentSources,
  };
  console.log(`Hotfix scope: ${candidate.scope}; code files: ${candidate.code.length}; intent: ${status}`);
  if (status === 'unknown')
    console.log('Current intent is not established; supply --title or PR context. No risk exemption is implied.');
  if (hotfix) console.log('HOTFIX DETECTED: independent review and applicable hotfix governance remain required.');
  if (options.scope === 'committed' && candidate.excludedWorkingTreePaths.length)
    console.log('Pending working-tree changes are excluded from this committed-scope result.');
  if (process.env.F153_TELEMETRY === '1')
    console.log(JSON.stringify({ metric: 'hotfix_pattern', isHotfix: result.hotfix, ...result }));
  console.log(JSON.stringify(result));
  process.exitCode = result.labelError ? 1 : status === 'unknown' ? 3 : hotfix ? 2 : 0;
}

try {
  main();
} catch (error) {
  console.error(`Hotfix check failed: ${error.message}`);
  console.log(
    JSON.stringify({
      status: 'error',
      hotfix: null,
      autoLabel: false,
      labelApplied: null,
      labelError: null,
      error: error.message,
    }),
  );
  process.exitCode = 1;
}
