/**
 * stock-advisor-mini · sa-check.ts
 *
 * SA-H rule-based checker —— GDPevo evaluate.py 对应物。
 * 消费一次 run 的三类产物（tool_events / final_text / final_json），
 * 输出可复现、可追溯"哪条没过"的分数。零 LLM，纯规则。
 *
 * 规则（H2=B 口径，与宪宪对齐：评输出逻辑段，不查真 post_message）：
 *   SA-H1   blocker w3  K线必拉   tool_result 含 ifzq.gtimg.cn / fqkline
 *   SA-H1b  blocker w2  行情必拉   tool_result 含 qt.gtimg.cn
 *   SA-H2   blocker w3  速报+drilldown  final_text 含两个逻辑段
 *   SA-H3   blocker w2  投资人分层 final_text 含 "📊 投资人"
 *   SA-H3b  warn   w1  动作+触发  ACTION/WATCH 条目含"动作"+"触发"
 *   SA-H4   warn   w2  依据标签   final_text 含 "依据"
 *   SA-H6   warn   w1  自检输出   final_text 含 "📋 推送合规自检"
 *   SA-H7   blocker w3  ACTION三层 ACTION 票含技术+逻辑+组合
 *   contract blocker w3  JSON契约  final_json 合法 stock_analysis_v1
 *
 * Usage:
 *   pnpm tsx scripts/stock-advisor-mini/sa-check.ts <run-product.json>
 *   run-product.json = { mode, tool_events, final_text, final_json }
 */

import { readFileSync } from 'node:fs';

interface ToolEvent {
  type: 'tool_call' | 'tool_result';
  input?: string;
  output?: string;
  url?: string;
}
interface RunProduct {
  mode: string;
  tool_events: ToolEvent[];
  final_text: string;
  final_json: unknown | null;
}
interface ScoringPoint {
  id: string;
  label: string;
  weight: number;
  severity: 'blocker' | 'warn';
  passed: boolean;
  score: number;
  max_score: number;
}

const RULES = [
  { id: 'SA-H1', label: 'K线必拉(ifzq/fqkline)', weight: 3, severity: 'blocker' as const },
  { id: 'SA-H1b', label: '行情必拉(qt.gtimg)', weight: 2, severity: 'blocker' as const },
  { id: 'SA-H2', label: '速报+drilldown两段', weight: 3, severity: 'blocker' as const },
  { id: 'SA-H3', label: '投资人分层(📊 投资人)', weight: 2, severity: 'blocker' as const },
  { id: 'SA-H3b', label: '动作+触发字段', weight: 1, severity: 'warn' as const },
  { id: 'SA-H4', label: '依据标签', weight: 2, severity: 'warn' as const },
  { id: 'SA-H7', label: 'ACTION技术+逻辑+组合三层', weight: 3, severity: 'blocker' as const },
  { id: 'SA-H6', label: '推送合规自检', weight: 1, severity: 'warn' as const },
  { id: 'contract', label: 'stock_analysis_v1契约', weight: 3, severity: 'blocker' as const },
];

function toolBlob(events: ToolEvent[]): string {
  return events.map((e) => `${e.type}:${e.url ?? ''} ${e.input ?? ''} ${e.output ?? ''}`).join('\n');
}

// contract 最小校验（内联，不跨包 import）
function checkContract(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const j = json as Record<string, unknown>;
  if (j.type !== 'stock_analysis_v1') return false;
  return Boolean(j.timestamp && j.investor_id && j.portfolio_verdict);
}

function hasAction(text: string): boolean {
  return /ACTION|行动|加仓|减仓|买入|卖出/i.test(text);
}

export function evaluate(product: RunProduct): {
  mode: string;
  total_score: number;
  earned_score: number;
  max_score: number;
  points: ScoringPoint[];
  failed_rules: string[];
  contract_ok: boolean;
  notes: string;
} {
  const toolText = toolBlob(product.tool_events);
  const text = product.final_text ?? '';
  const hasKline = /ifzq\.gtimg\.cn|fqkline/i.test(toolText);
  const hasRealtime = /qt\.gtimg\.cn/i.test(toolText);
  const hasBrief = /速报|brief/i.test(text);
  const hasDrill = /drilldown|详细|分析详情|逐票/i.test(text);
  const hasInvestorLayer = /📊 投资人/.test(text);
  const hasActionTrigger = !hasAction(text) || (/动作|触发/i.test(text));
  const hasBasis = /依据/.test(text);
  const hasSelfCheck = /📋 推送合规自检|推送合规自检/.test(text);
  const contractOk = checkContract(product.final_json);
  // H7: 有 ACTION 时，含技术/逻辑/组合三层；无 ACTION 时放行（没机会违规）
  const hasThreeLayers = !hasAction(text) || (/技术|量价|MA|MACD/i.test(text) && /逻辑|驱动|基本面/i.test(text) && /组合|仓位|占比/i.test(text));

  const checks: Record<string, boolean> = {
    'SA-H1': hasKline,
    'SA-H1b': hasRealtime,
    'SA-H2': hasBrief && hasDrill,
    'SA-H3': hasInvestorLayer,
    'SA-H3b': hasActionTrigger,
    'SA-H4': hasBasis,
    'SA-H7': hasThreeLayers,
    'SA-H6': hasSelfCheck,
    contract: contractOk,
  };

  let earned = 0;
  let max = 0;
  const points: ScoringPoint[] = [];
  const failed: string[] = [];
  for (const r of RULES) {
    const passed = checks[r.id];
    const score = passed ? r.weight : 0;
    earned += score;
    max += r.weight;
    points.push({ id: r.id, label: r.label, weight: r.weight, severity: r.severity, passed, score, max_score: r.weight });
    if (!passed) failed.push(r.id);
  }

  const notes: string[] = [];
  if (!hasAction(text)) notes.push('no ACTION signal — H7/H3b 软规则放行');
  if (failed.length === 0) notes.push('all rules passed');

  return {
    mode: product.mode,
    total_score: Number((earned / max).toFixed(4)),
    earned_score: earned,
    max_score: max,
    points,
    failed_rules: failed,
    contract_ok: contractOk,
    notes: notes.join('; '),
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: sa-check.ts <run-product.json>');
    process.exit(1);
  }
  const product = JSON.parse(readFileSync(file, 'utf-8')) as RunProduct;
  const result = evaluate(product);
  console.log(JSON.stringify(result, null, 2));
}
