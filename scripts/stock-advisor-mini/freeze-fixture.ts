/**
 * stock-advisor-mini · freeze-fixture.ts
 *
 * 一次性冻结一个真实行情快照，供 base/current/optimized 三档共用。
 * 这是 GDPevo deterministic-seed 的对应物：解决"实时行情变动 + 腾讯限流"导致
 * 三档对比不可复现的问题——冻结一次，后面所有档读同一份。
 *
 * 安全：curl 腾讯公开行情接口，不带 token/key/凭证，不触"外发敏感数据"红线。
 * 腾讯 API 限流风险（F226 Risk#2 已记）——本脚本一次只跑一遍存快照。
 *
 * Usage:  pnpm tsx scripts/stock-advisor-mini/freeze-fixture.ts
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/stock-advisor-mini/fixture');
const RAW_DIR = join(OUT_DIR, 'raw');
const STATE_FILE = join(ROOT, '.cat-cafe/stock-advisor-state.json');

// inv_01 持仓 code（来自 state 文件，运行时读，不全硬编码）
function readInv01Codes(): { codes: string[]; investor: unknown; portfolio: unknown } {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  const inv = state.investors[0];
  const pf = inv.portfolios[0];
  const codes = pf.holdings.map((h: { code: string }) => h.code);
  return { codes, investor: inv, portfolio: pf };
}

function curl(url: string, gbk = false): string {
  const out = execSync(`curl -sS --max-time 15 "${url}"`, { encoding: gbk ? 'buffer' : 'utf-8' });
  if (gbk) {
    // 腾讯实时行情是 GBK，转 UTF-8
    return execSync(`echo "${out.toString('base64')}" | base64 -d | iconv -f GBK -t UTF-8`, { encoding: 'utf-8' });
  }
  return out;
}

function parseRealtime(raw: string): Record<string, unknown> {
  const rt: Record<string, unknown> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^v_(\w+)="(.*)"\s*;?\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    const f = val.split('~');
    rt[key] = { raw: val, name: f[1] ?? key, code: f[2] ?? key, price: f[3] ?? null, prev_close: f[4] ?? null, open: f[5] ?? null };
  }
  return rt;
}

function parseKline(raw: string, code: string): unknown[] {
  const d = JSON.parse(raw);
  const inner = d.data[code];
  const rows = inner.qfqday ?? inner.day ?? []; // ETF 用 day，个股用 qfqday
  return rows.slice(-20).map((r: string[]) => ({ date: r[0], open: r[1], close: r[2], high: r[3], low: r[4], vol: r[5] }));
}

function anonymize(state: unknown): Record<string, unknown> {
  const inv = state as { style: string; boundaries: string[]; correlation_groups: unknown; push_config: unknown };
  const pf = (state as { portfolios: { name: string; cash: number; holdings: unknown[] }[] }).portfolios?.[0] ?? (state as { portfolios: unknown }).portfolios;
  return {
    id: 'investor_fixture',
    name: 'Investor A',
    style: inv.style,
    boundaries: inv.boundaries,
    correlation_groups: inv.correlation_groups,
    push_config: inv.push_config,
    portfolio: { name: (pf as { name: string }).name, cash: (pf as { cash: number }).cash, holdings: (pf as { holdings: unknown[] }).holdings },
  } as Record<string, unknown>;
}

function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const { codes, investor, portfolio } = readInv01Codes();
  console.log(`codes: ${codes.join(', ')}`);

  // 1. 实时行情（含金铜 hf_GC/hf_HG）
  const realtimeUrl = `https://qt.gtimg.cn/q=${codes.join(',')},hf_GC,hf_HG`;
  const realtimeRaw = curl(realtimeUrl, true);
  writeFileSync(join(RAW_DIR, 'realtime.txt'), realtimeRaw);
  const realtime = parseRealtime(realtimeRaw);
  console.log(`realtime: ${Object.keys(realtime).length} entries`);

  // 2. 逐只 K 线
  const klines: Record<string, unknown[]> = {};
  for (const c of codes) {
    const klineUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${c},day,,2026-06-26,20,qfq`;
    const raw = curl(klineUrl);
    writeFileSync(join(RAW_DIR, `kline_${c}.json`), raw);
    klines[c] = parseKline(raw, c);
    console.log(`kline ${c}: ${klines[c].length} days`);
  }

  // 3. 匿名化 state（脱身份，保留投资语义）
  const fixture = {
    frozen_at: new Date().toISOString(),
    source: 'inv_01/main portfolio (anonymized). 一次性冻结的真实行情快照.',
    note: 'GDPevo deterministic-seed analog: 三档(base/current/optimized)共用此快照保证可比性.',
    investor: anonymize({ ...investor, portfolios: [portfolio] }),
    market_snapshot: { realtime, klines },
  };
  writeFileSync(join(OUT_DIR, 'fixture.json'), JSON.stringify(fixture, null, 2));
  console.log(`fixture.json saved -> ${join(OUT_DIR, 'fixture.json')}`);
}

if (existsSync(join(OUT_DIR, 'fixture.json'))) {
  console.log('fixture.json 已存在，如需重新冻结请先删除。');
  process.exit(0);
}
main();
