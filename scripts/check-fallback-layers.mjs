#!/usr/bin/env node

/**
 * F177 Phase D — Fallback layer detection for quality-gate / PR review.
 * Scans git diff for fallback-pattern growth per file.
 * Exits 0 (info only) — this is a diagnostic tool, not a hard gate.
 * The quality-gate skill decides whether to block based on output.
 */

import process from 'node:process';
import { parseCheckOptions, readChangeScope, scopeSummary } from './lib/git-change-scope.mjs';

const FALLBACK_PATTERNS = [
  { pattern: /\bcatch\s*(\(|{)/, label: 'try/catch' },
  { pattern: /\?\?\s/, label: '?? nullish coalesce' },
  { pattern: /\|\|\s/, label: '|| fallback' },
  { pattern: /\belse\s+if\b/, label: 'else if' },
  { pattern: /\bcatch\b.*\bfallback\b/i, label: 'catch+fallback' },
  { pattern: /\bdefault\s*:/, label: 'switch default' },
];

function countFallbacksInFile(file) {
  return file.content
    .split('\n')
    .reduce((total, line) => total + FALLBACK_PATTERNS.filter(({ pattern }) => pattern.test(line)).length, 0);
}

function countFallbacksInDiff(diff) {
  const added = [];
  const removed = [];

  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      const content = line.slice(1);
      for (const { pattern, label } of FALLBACK_PATTERNS) {
        if (pattern.test(content)) {
          added.push({ label, line: content.trim() });
        }
      }
    } else if (line.startsWith('-')) {
      const content = line.slice(1);
      for (const { pattern, label } of FALLBACK_PATTERNS) {
        if (pattern.test(content)) {
          removed.push({ label, line: content.trim() });
        }
      }
    }
  }

  return { added: added.length, removed: removed.length, net: added.length - removed.length, details: added };
}

function main() {
  const options = parseCheckOptions(process.argv.slice(2));
  if (options.title !== undefined || options.applyLabel !== undefined)
    throw new Error('Title/label options apply only to the hotfix checker');
  if (options.help) {
    console.log('Usage: node scripts/check-fallback-layers.mjs [--base ref] [--scope committed|working-tree]');
    return;
  }
  const candidate = readChangeScope(options);
  const files = candidate.code;
  console.log(`Fallback scan scope: ${candidate.scope}`);
  if (options.scope === 'committed' && candidate.excludedWorkingTreePaths.length)
    console.log('Pending working-tree changes are excluded from this committed-scope result.');
  const emit = (status, results = [], totalNet = 0) =>
    console.log(
      JSON.stringify({
        status,
        ...scopeSummary(candidate),
        totalNet,
        details: results,
      }),
    );
  if (files.length === 0) {
    console.log('ℹ️ No code files changed in diff.');
    emit('not_applicable');
    return;
  }

  const results = [];
  let totalNet = 0;

  for (const file of files) {
    const diff = file.diff;
    if (!diff) continue;
    const counts = countFallbacksInDiff(diff);
    if (counts.added > 0 || counts.removed > 0) {
      results.push({ file: file.path, ...counts, totalInFile: countFallbacksInFile(file) });
      totalNet += counts.net;
    }
  }

  if (results.length === 0) {
    console.log('✅ No fallback pattern changes detected.');
    emit('checked');
    return;
  }

  const NEW_LAYER_THRESHOLD = 3;
  const CUMULATIVE_THRESHOLD = 5;
  const warnings = results.filter((r) => r.added >= NEW_LAYER_THRESHOLD);

  const cumulativeWarnings = [];
  for (const r of results) {
    const total = r.totalInFile;
    if (total >= CUMULATIVE_THRESHOLD && !warnings.some((w) => w.file === r.file)) {
      cumulativeWarnings.push(r);
    }
  }

  console.log(`📊 Fallback layer analysis (${results.length} files with changes):`);
  console.log('');
  for (const r of results) {
    const perFileHit = r.added >= NEW_LAYER_THRESHOLD;
    const cumulativeHit = (r.totalInFile ?? 0) >= CUMULATIVE_THRESHOLD;
    const flag = perFileHit ? '⚠️ ' : cumulativeHit ? '⚡ ' : '  ';
    const totalTag = r.totalInFile != null ? ` [total=${r.totalInFile}]` : '';
    console.log(`${flag}${r.file}: +${r.added} -${r.removed} (net ${r.net >= 0 ? '+' : ''}${r.net})${totalTag}`);
    if (perFileHit || cumulativeHit) {
      for (const d of r.details.slice(0, 5)) {
        console.log(`     [${d.label}] ${d.line.slice(0, 80)}`);
      }
    }
  }
  console.log('');
  console.log(`Total net fallback change: ${totalNet >= 0 ? '+' : ''}${totalNet}`);

  if (warnings.length > 0 || cumulativeWarnings.length > 0) {
    console.log('');
    console.log('⚠️ Coordinate-system self-check triggered:');
    if (warnings.length > 0)
      console.log(`  Per-file threshold: ${warnings.length} file(s) added ≥${NEW_LAYER_THRESHOLD} layers`);
    if (cumulativeWarnings.length > 0)
      console.log(
        `  Cumulative threshold: ${cumulativeWarnings.length} file(s) have ≥${CUMULATIVE_THRESHOLD} total layers`,
      );
    console.log('  1. Is this fix repairing the coordinate system, or patching the wrong one?');
    console.log('  2. Could a coordinate transform (different problem decomposition) eliminate these layers?');
    console.log('  3. For each layer: why can it not be removed?');
  }

  if (process.env.F153_TELEMETRY === '1') {
    const metric = {
      event: 'fallback_layer_check',
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      filesWithChanges: results.length,
      totalNet,
      warnings: warnings.length,
      cumulativeWarnings: cumulativeWarnings.length,
      details: results.map((r) => ({ file: r.file, added: r.added, removed: r.removed, net: r.net })),
    };
    console.log('');
    console.log(`[telemetry] ${JSON.stringify(metric)}`);
  }

  emit('checked', results, totalNet);
}

try {
  main();
} catch (error) {
  console.error(`Fallback check failed: ${error.message}`);
  console.log(JSON.stringify({ status: 'error', error: error.message }));
  process.exitCode = 1;
}
