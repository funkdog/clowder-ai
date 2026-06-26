---
feature_ids: [F226]
related_features: [F240]
topics: [agent-invoke, sse, streaming, stock-advisor, tool-events]
doc_kind: plan
created: 2026-06-26
owner_design: 宪宪 [claude-opus-4-8]
owner_impl: 小小舟 [GLM-5.2]
---

# Clowder Agent Invoke — 真 SSE 流式 + tool_call/tool_result 事件

> **设计**：宪宪 [claude-opus-4-8]（本文）  **实现**：小小舟 [GLM-5.2]  **方向拍板**：co-creator 2026-06-26（完整投研流程）

## 1. 背景与真相源

| 项 | 真相源 |
|----|--------|
| 需求拍板 | `thread_mqrp1yysrzhwspi5`（F240 Phase D）co-creator msg `0001782385551267`："stream event 粒度要暴露 tool_call/tool_result" + 本 thread 2026-06-26："完整投研流程，指定开发计划让小小舟执行" |
| F240 在等这个 contract | `personal-investment-dashboard/.../routes/analysis-sessions.ts:100` 注释明写 "True token-level streaming **waits for the Clowder `/api/agent/invoke/stream` contract**" |
| 现有同步 route | `packages/api/src/routes/agent-invoke.ts`（`POST /api/agent/invoke`，一次性返回最终 `stock_analysis_v1`） |
| 底层已 emit tool 事件 | `invoke-single-cat.ts:393`（text/tool_use/tool_result）；`route-serial.ts:1165 toStreamEvent` 原样透传，`:1557 yield streamEvent` |
| SSE 范本 | `packages/api/src/routes/tts.ts:234-252`（writeHead text/event-stream + sendEvent + 客户端断连检测） |

**一句话**：底层 `routeExecution` 已经吐 `tool_use`/`tool_result`，现有同步 route 只是在消费端丢了。这一刀 = **加一个 SSE 出口 + 对外事件 taxonomy + 完整投研 prompt**，不改底层 stream contract。

## 2. Scope

**做（F226/Clowder runtime 侧，clowder-ai 仓库）**：
- 新增 `POST /api/agent/invoke/stream`，真 SSE，逐事件推送。
- 对外 event taxonomy：`session_init` / `text` / `tool_call` / `tool_result` / `error` / `done`（+ heartbeat）。
- 完整投研 prompt（区别于同步 route 的 strict-fast）。
- capabilities 端点登记 stream route，并把 stream 标为默认/推荐入口。

**不做（本次 scope 外）**：
- ❌ 不改 F240（personal-investment-dashboard）。F240 怎么接 SSE 是 F240 后续单独排期。本次只交付 Clowder 侧能力 + 契约。
- ❌ 不改底层 `routeExecution` / `invoke-single-cat`（已支持，别动）。
- ❌ 不接交易、不碰生产数据边界。

## 3. Stream Event Taxonomy（对外契约 — 定死）

**Wire format**：`data: <json>\n\n`，json 含 `type` 字段（参考 tts.ts，不用 `event:` 行，F240 单个 `onmessage` 按 `type` 分发）。heartbeat 用 SSE 注释行 `: ping\n\n`（不触发 onmessage）。

| 对外 type | 来源（内部 AgentMessage） | payload 字段 |
|-----------|--------------------------|--------------|
| `session_init` | system_info=`invocation_created` 提取 | `{ type, invocationId, threadId, investorId, correlationId }` |
| `text` | `text` | `{ type, delta, textMode: 'append'\|'replace', invocationId }`（content→delta） |
| `tool_call` | `tool_use` ← **术语映射** | `{ type, toolName, toolInput, toolUseId, invocationId }` |
| `tool_result` | `tool_result` | `{ type, toolName, toolUseId, status: 'ok'\|'error'\|'unknown', content, invocationId }` |
| `error` | `error` / 路由失败 | `{ type, error, code, invocationId }` |
| `done` | `done(isFinal)` + `extractStockAnalysisPayload` | `{ type, ok, invocationId, result?: stock_analysis_v1, rawContent?, code? }` |

**白名单纪律**：只输出上表 6 类。内部遥测事件 **不外泄**：`system_info`（除 invocation_created）/ `provider_signal` / `liveness_signal` / `agent_loop` / `status` / `a2a_handoff` / 内部 `session_init(sessionId)`。这些对 F240 消费者无意义。

**`done` 语义**：
- 解析出 `stock_analysis_v1` → `{ ok: true, result }`（= F240 的 `structured_final` 锚点，直接入库）。
- 解析失败 → `{ ok: false, code: 'CONTRACT_MISMATCH', rawContent }`（degraded，原文保留，F240 fallback 展示）。
- 复用现有 `extractStockAnalysisPayload`（agent-invoke.ts:362），别重写。

**字段依据**：`types.ts:124-213` AgentMessage（toolName/toolInput/toolUseId/toolResultStatus 都是现成字段）。`tool_result.content` 可能很大（命令输出）→ 单事件截断上限（建议 8KB，超出加 `truncated: true`）。

## 4. 实现骨架

加进**同一个** `agentInvokeRoutes` plugin（agent-invoke.ts），复用现有 opts（router / messageStore / invocationRecordStore / invocationTracker / threadStore / queueProcessor），**不改注册**（index.ts:3009 已传齐）。

```
app.post('/api/agent/invoke/stream', async (request, reply) => {
  // ── hijack 之前：所有 fail-closed 前置检查走 JSON status（和同步 route 一致）──
  // 1. zod 校验 body（复用 invokeSchema） → 400 INVALID_REQUEST
  // 2. threadStore.get → 404 THREAD_NOT_FOUND
  // 3. invocationTracker.tryStartThreadAll → 409 THREAD_BUSY
  // 4. invocationRecordStore.create → 409 DUPLICATE_REQUEST

  // ── 开流：reply.raw.writeHead(200, text/event-stream) ── 参考 tts.ts:234
  //    一旦 hijack，HTTP status 固定 200；之后所有错误走 `error` event，不能再改 code
  const sendEvent = (e) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);

  // ── 消费 routeExecution，逐事件映射→SSE flush ──
  //    复用 consumeRouteExecutionWithHardTimeout(agent-invoke.ts:306) 的硬超时骨架，
  //    但 onMessage 回调从「累积 rawContent」改成「mapToStreamEvent + sendEvent」
  //    同时仍累积 rawContent 供最后 extractStockAnalysisPayload
  //    - 客户端断连检测：每次 flush 前 if (reply.raw.destroyed || reply.raw.writableEnded) → controller.abort + break（参考 tts.ts:249）
  //    - heartbeat：setInterval 15s 写 `: ping\n\n`（destroyed 时清掉）

  // ── 收尾 ──
  //    done event（ok/result/code）→ reply.raw.end()
  //    invocationRecordStore.update(succeeded/failed) + invocationTracker.completeAll(finally)
});
```

**关键复用点**（别重造轮子）：
- 硬超时：`consumeRouteExecutionWithHardTimeout` + `InvokeTimeoutError`（agent-invoke.ts:299-337）已是正确实现（`Promise.race(iterator.next(), timeout)`）。抽出来共享，onMessage 行为参数化。
- payload 提取：`extractStockAnalysisPayload`（:362）原样复用。
- fail-closed：`failClosed`（:283）用于 hijack **之前**的前置错误。

## 5. Prompt 模式（完整投研 — co-creator 拍板）

**不复用** strict-fast prompt（`buildStockAdvisorPrompt`:339 明令禁工具，会导致零 tool_call，流式无意义）。

新增 `buildStreamingStockAdvisorPrompt`：要求鸿瑞按 **stock-advisor SKILL 完整流程**跑（拉腾讯行情 / 拉 20 日 K 线 / 算 MA·量比·MACD / boundary 自检），过程中的 Bash/MCP 工具调用正是要流式暴露的 tool_call/tool_result，最后输出 `stock_analysis_v1` JSON 供 `done` 提取。

- timeout 默认放大到 **300s**（maxTimeoutMs 已是 300_000）。
- ⚠️ **prompt 措辞需与小红/鸿瑞对齐**（他们是 stock-advisor 分析 owner）——见 Open Questions OQ-2。
- 安全：走标准 routeExecution，继承所有现有 invocation guard（不新开绕过路径）。鸿瑞跑 curl 行情是 stock-advisor 既有能力，非新授权。

## 6. TDD 测试点（红→绿）

参考现有 `test/agent-invoke-route.test.js`（同步 route 的卡死/超时用例）。stream 侧至少覆盖：

1. **前置 fail-closed**（hijack 前）：bad body→400、thread busy→409、duplicate→409，均为 JSON 非 SSE。
2. **事件映射**：mock routeExecution 吐 text/tool_use/tool_result/done → SSE 流按序输出 `text`/`tool_call`/`tool_result`/`done`，且 tool_use→tool_call 映射正确。
3. **白名单过滤**：mock 吐 system_info/provider_signal/liveness_signal → **不出现**在 SSE 流。
4. **done 双路**：合法 payload→`done{ok:true,result}`；垃圾输出→`done{ok:false,code:CONTRACT_MISMATCH,rawContent}`。
5. **硬超时**：routeExecution 永不 resolve → 到 timeout 发 `error{code:INVOKE_TIMEOUT}` + `done{ok:false}` + 关流 + `controller.abort` 被调用。
6. **客户端断连**：模拟 reply.raw.destroyed → 中止消费 + completeAll 被调用（不泄漏 invocation）。

## 7. Acceptance Criteria

- [ ] AC-1：`POST /api/agent/invoke/stream` 返回 `text/event-stream`，curl 能看到逐事件 `data:` 流。
- [ ] AC-2：完整投研模式下，流中出现真实 `tool_call`（拉行情/K线）+ 配对 `tool_result`，带 toolName/toolUseId。
- [ ] AC-3：流以 `done` 收尾；成功带 `result: stock_analysis_v1`，失败带 `code` + `rawContent`。
- [ ] AC-4：内部遥测事件（system_info/provider_signal/liveness/agent_loop/status）不出现在流中。
- [ ] AC-5：前置错误（400/404/409）在 hijack 前以 JSON 返回；流中错误走 `error` event。
- [ ] AC-6：硬超时 300s 生效，超时关流且 abort agent；客户端断连不泄漏 invocation。
- [ ] AC-7：`/api/agent/invoke/capabilities` 登记 stream route（path/method/event taxonomy），且 `route` / `preferredRoute` 指向 `/api/agent/invoke/stream`；同步 `/api/agent/invoke` 只保留为 strict-fast state-only fallback。
- [ ] AC-8：`pnpm check` + `pnpm lint` 通过；文件 ≤350 行（超了拆 helper）；无 `any`。

## 8. Git 基线现状（开干第一步 — 必读）

上个 session（宪宪+鸿瑞）做的**同步** route 这套 **至今未提交，裸在 main 工作区**：
- `?? packages/api/src/routes/agent-invoke.ts`（未跟踪）
- `?? packages/api/test/agent-invoke-route.test.js`（未跟踪）
- `M packages/api/src/index.ts` / `M packages/api/src/routes/index.ts`（agent-invoke 接线）

⚠️ **git worktree 不带未跟踪文件**——若直接 `worktree add`，agent-invoke.ts 不会进新 worktree。建议开干第一步：
1. 在 main 先把这套**同步 route 收进一个 commit**（`feat: structured agent-invoke route`；已经鸿瑞跨个体复核过，见 thread `0001782296934070` 前后），push。
2. 再从该 commit 拉 worktree 做 stream route（stream 加在 agent-invoke.ts 同文件）。
3. 其余未跟踪文件（`designs/`、`docs/study/*.md`、`packages/api/AGENTS.md` 等）**不是这条线的**，别 commit，留给各自 owner。

> 若对 commit 同步 route 这步有顾虑（怕和 co-creator 重启验收冲突），先在 thread 确认——但源码 commit 与 dist 验收不冲突，commit 只是纳入版本控制防丢。

## 9. Review / Handoff

- 实现：小小舟 [GLM-5.2]
- Review：@砚砚 [gpt-5.5]（跨个体，重点看 SSE 生命周期/断连泄漏/白名单/超时 abort）
- 愿景守护：宪宪（merge 后对照 F240 contract 是否真的可被消费）

## 10. Open Questions

| # | 问题 | 建议 |
|---|------|------|
| OQ-1 | F226 编号 ambiguity：ROADMAP `F226`=Presentation Surface，但 stock-advisor 也叫 `F226-stock-advisor.md`，且有 `f230-stock-advisor-renumber` 迹象 | 不阻塞实现；handoff 后请 feat-lifecycle 澄清 stock-advisor 归 F226 还是 F230，doc/ROADMAP 对齐 |
| OQ-2 | 完整投研 prompt 措辞 | 小小舟开干前与 @小红/@鸿瑞 对齐（stock-advisor 分析 owner），确保 prompt 触发完整 SKILL 流程且尾部稳定输出 stock_analysis_v1 |
| OQ-3 | SSE wire 是否要 `event:` 命名行 | 默认 data:+type 字段（最简）；若 F240 接入时要选择性监听再加，不提前过度设计 |
