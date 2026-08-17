import type { VerdictHandoffPacket } from '../verdict-handoff.js';

export function formatAdaptiveDevelopmentLiveVerdictMarkdown(
  verdictId: string,
  packet: VerdictHandoffPacket,
  sourceSnapshotRef: string,
): string {
  return [
    '---',
    'feature_ids: [F192]',
    'topics: [harness-eval, adaptive-development, free-plan, live-verdict]',
    'doc_kind: harness-feedback',
    'feedback_type: live-verdict',
    'domain_id: eval:adaptive-development',
    `packet_id: ${packet.id}`,
    `source_snapshot: "${sourceSnapshotRef}"`,
    '---',
    '',
    `# Live Verdict — ${verdictId}`,
    '',
    `- Verdict: \`${packet.verdict}\``,
    `- Phenomenon: ${packet.phenomenon}`,
    `- Harness: ${packet.harnessUnderEval.featureId}/${packet.harnessUnderEval.componentId} (${packet.harnessUnderEval.name})`,
    `- Owner ask: ${packet.ownerAsk.requestedAction}`,
    `- Re-eval: next eval at ${packet.acceptanceReevalPlan.nextEvalAt}`,
    '',
    'Evidence:',
    ...packet.evidencePacket.snapshotRefs.map((ref) => `- ${ref}`),
    ...packet.evidencePacket.attributionRefs.map((ref) => `- ${ref}`),
    ...packet.evidencePacket.metricRefs.map((ref) => `- ${ref.startsWith('metric:') ? ref : `metric:${ref}`}`),
    '',
    'Counterarguments:',
    ...packet.counterarguments.map((item) => `- ${item}`),
  ].join('\n');
}
