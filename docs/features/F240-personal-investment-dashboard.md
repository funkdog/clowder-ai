---
feature_ids: [F240]
related_features: [F226, F207, F192]
topics: [investment-dashboard, stock-advisor, independent-system, agent-adapter, finance]
doc_kind: spec
created: 2026-06-23
---

# F240: Personal Investment Dashboard — 独立投资行情系统

> **Status**: in-progress (Phase 0 kickoff) | **Owner**: 砚砚 [gpt-5.5] | **Priority**: P1

## Why

co-creator 明确否决把投资助手塞进 Hub 的方案，要求做一个**独立系统**：页面化展示每日行情和历史分析，持仓 / ops_log / changelog / 情报 / 投资人 / 权限都由新系统自己的数据库和表单维护；Clowder AI 只作为可复用的猫猫 Agent Runtime，让鸿瑞和 `stock-advisor` skill 提供分析能力。

operator experience（2026-06-23）：
> "我认为我的这个系统不需要与本Hub整合，是一个单独的系统，只是这个系统可以复用猫猫作为分析agent的能力接入。当前的ops_log和changelog可以在新系统中通过表单或者其他方式单独维护。后续也不需要在本hub进行推送，而是单独构建新系统的推送能力。"

这不是 F226 的 UI 面板，而是 F226 的外部消费者：F226 继续沉淀猫猫投资分析能力，F240 负责把能力产品化成独立业务系统。

## Current State / 现状基线

- F226 已有 `stock-advisor` skill、状态文件 schema、投资助手 thread、定时推送和 eval 方向；真相源为 `docs/features/F226-stock-advisor.md` 与 `cat-cafe-skills/stock-advisor/SKILL.md`。
- 设计输入已落盘到 `docs/design/2026-06-23-investment-dashboard.md`，方向为独立 repo / 独立端口 / 复用鸿瑞 Agent。
- 2026-06-23 开工前扫描 `/Users/slipshod/AIBuild`，没有现成 `investment` / `stock` / `advisor` 独立项目目录；F240 需要新建 repo。
- 当前 Hub 真实技术栈是 `packages/web` 的 Next.js + React，以及 `packages/api` 的 Fastify + better-sqlite3 / Redis；执行时以这个实际基线为准，不沿用草案里 Hono / Drizzle 的误写。
- 当前 cat-cafe 仓库状态为 `main...origin/main [ahead 2, behind 1]`，因此本 feature 的本地 kickoff 不执行 push；push / rebase 需单独处理既有未推提交。

## What

### Phase 0: Kickoff + Repo Bootstrap

建立 F240 生命周期真相源和独立 repo 初始骨架，明确 Phase A MVP 分工、技术栈、接口边界和安全边界。

交付：
- `docs/features/F240-personal-investment-dashboard.md`
- `docs/ROADMAP.md` active feature entry
- `/Users/slipshod/AIBuild/personal-investment-dashboard` 独立 Git repo
- repo 内最小 pnpm workspace：`packages/api`、`packages/web`、`packages/shared`
- Phase A 任务拆解与分工（repo 内 `docs/phase-a-plan.md`）

### Phase A: MVP End-to-End

目标：本机独立端口打开页面，能维护持仓，能触发鸿瑞分析，能展示今日 / 历史结果，并通过新系统自建推送发出通知。

范围：
- 投资人、组合、持仓、边界、ops_log、strategy_changelog 的 DB schema 与 CRUD
- 腾讯行情代理 + 30s 缓存 + degraded 状态
- Agent 适配层异步模式：DB -> F226 state/intelligence 文件 -> 投资助手 thread -> 鸿瑞输出 -> 轮询解析 -> DB
- 今日速览、历史分析、持仓管理三个核心页面
- 单一推送通道 MVP（优先 webhook 类通道，如 WxPusher / Server 酱 / 飞书机器人择一）

### Phase B: Intelligence + Charting

目标：情报进入系统真相源，并参与鸿瑞分析；页面支持基础 K 线下钻。

范围：
- intelligence CRUD + TTL
- DB -> `.cat-cafe/stock-intelligence.json` 同步
- K 线代理与前端图表
- 结果解析器升级，优先推动鸿瑞输出结构化 JSON block

### Phase C: Multi-Investor + Permissions

目标：多投资人、多角色、多推送目标可用。

范围：
- users + access_control + investor scoped RBAC
- 每个投资人独立 state 视图同步
- 推送目标和投资人权限绑定
- 审计日志与操作可追溯

### Phase D: Runtime API + Eval + Deployment

目标：把异步 thread 适配升级为更稳定的 Agent API，并把分析质量接入 eval。

范围：
- 设计并在 Clowder AI 侧实现 `POST /api/agent/invoke` 或等价结构化调用契约
- F192 / eval:sop 接入投资分析质量检查
- 行情数据归档
- 远端服务器部署方案

## Acceptance Criteria

<!-- 立项愿景硬度自检（F216→F219）：每条 AC 必须 ① trace 回 Why 的某诉求 ② 非作者可复核（命令/数字/截图）。重构/降复杂度类须实测可量（数字下降），不是"提了可测性就算"。详见 feat-lifecycle SKILL.md。 -->

### Phase 0（Kickoff + Repo Bootstrap）

- [x] AC-0.1: F240 spec 存在并链接 F226、设计文档、独立 repo 路径；`docs/ROADMAP.md` 有 active entry。
- [x] AC-0.2: 独立 repo `/Users/slipshod/AIBuild/personal-investment-dashboard` 存在，且包含 pnpm workspace、API/Web/Shared 三包、README、AGENTS、安全边界和 `.env.example`。
- [x] AC-0.3: Phase A 拆解到可执行任务（`docs/phase-a-plan.md`），并记录分工：砚砚主导 repo + API/Web，宪宪支撑 Agent 适配/F226 接口，小红支撑分析输出契约，烁烁支撑 UI 视觉评审。
- [x] AC-0.4: 执行技术栈纠偏写入 truth source：以 Next.js + React、Fastify、better-sqlite3、pnpm、TypeScript 为 Phase A baseline。

### Phase A（MVP End-to-End）

- [ ] AC-A1: 本机 `pnpm install && pnpm dev` 后，API 与 Web 分别在独立端口启动，`GET /health` 返回 ok，Web 首屏可见今日 / 历史 / 持仓入口。
- [ ] AC-A2: 投资人、组合、持仓、boundaries、ops_log、strategy_changelog 可通过表单 CRUD 写入 SQLite；写入后 DB 可查询，页面刷新不丢。
- [ ] AC-A3: DB 数据可导出为 F226 V6-compatible `stock-advisor-state.json`，并通过 adapter 同步到 Clowder AI 可读位置；同步失败有 UI / API degraded 状态。
- [ ] AC-A4: 行情代理支持持仓 codes + `hf_GC` / `hf_HG`，结果带 source/asOf/cache 状态；腾讯接口失败时页面显示 degraded，不编造行情。
- [ ] AC-A5: 手动触发分析后，adapter 能唤醒鸿瑞或等价 F226 分析入口；5 分钟内拿到结果或记录 timeout，且不会阻塞用户继续浏览。
- [ ] AC-A6: 鸿瑞输出被存入 `analysis_results.raw_content`，并至少解析 portfolio verdict、仓位、ACTION/WATCH/NORMAL 计数；解析失败时原文仍可在历史页查看。
- [ ] AC-A7: 今日速览页展示最新分析、持仓实时行情和组合占比；历史页支持日期 / 类型筛选；持仓页支持 CRUD 与操作日志查看。
- [ ] AC-A8: MVP 至少一个自建推送通道可用；触发分析成功后能把速报模板发送到配置目标，并在 `push_log` 记录 sent/failed。

### Phase B（Intelligence + Charting）

- [ ] AC-B1: 情报 CRUD 写入 DB，支持 TTL 过期状态，页面可筛选 active/expired。
- [ ] AC-B2: 情报可同步为 F226-compatible intelligence 文件，鸿瑞分析时能引用匹配 `related_codes` 的情报。
- [ ] AC-B3: K 线代理返回近 20 日数据，页面可查看至少收盘价 / MA5 / MA20。
- [ ] AC-B4: 结构化 JSON 输出契约在 `stock-advisor` skill 或 adapter parser 中落地，analysis_details 解析覆盖 ACTION 票三层 drilldown。

### Phase C（Multi-Investor + Permissions）

- [ ] AC-C1: 支持多投资人切换；不同投资人的组合、持仓、分析结果、推送配置互相隔离。
- [ ] AC-C2: RBAC 支持 owner/member/viewer；viewer 无法写持仓、情报、推送配置。
- [ ] AC-C3: 操作审计可追溯到 user_id、action、before/after 和时间。
- [ ] AC-C4: 推送目标按投资人和角色绑定，未授权用户不会收到对应投资人的分析。

### Phase D（Runtime API + Eval + Deployment）

- [ ] AC-D1: Clowder AI 侧存在结构化 Agent invoke contract 或明确替代方案，投资系统无需依赖自然语言 thread 轮询即可获取结构化结果。
- [ ] AC-D2: 投资分析质量进入 eval/sop 或等价周期评估，至少覆盖 K 线必拉、boundary 自检、ACTION drilldown 完整性。
- [ ] AC-D3: 有远端部署方案，包含数据备份、密钥管理、端口/域名、HTTPS、日志与回滚。

## 需求点 Checklist

| ID | 需求点（operator experience/转述） | AC 编号 | 验证方式 | 状态 |
|----|---------------------------|---------|----------|------|
| R1 | "不需要与本Hub整合，是一个单独的系统" | AC-0.2, AC-A1 | repo path + independent ports | [x] for Phase 0 |
| R2 | "复用猫猫作为分析agent的能力接入" | AC-A3, AC-A5, AC-D1 | adapter e2e + invoke contract | [ ] |
| R3 | "ops_log和changelog可以在新系统中通过表单维护" | AC-A2 | browser CRUD + DB query | [ ] |
| R4 | "单独构建新系统的推送能力" | AC-A8, AC-C4 | push_log + received message proof | [ ] |
| R5 | "历史推送与行情分析展示" | AC-A6, AC-A7 | screenshots + DB records | [ ] |
| R6 | "情报、投资人管理、权限等功能集成" | AC-B1, AC-B2, AC-C1, AC-C2 | CRUD tests + screenshots | [ ] |

### 覆盖检查

- [x] 每个需求点都能映射到至少一个 AC
- [x] 每个 AC 都有验证方式
- [ ] 前端需求已准备需求→证据映射表（Phase A quality-gate 前补）

## Dependencies

- **Evolved from**: F226（Stock Advisor 提供鸿瑞 + `stock-advisor` skill + 状态 schema；F240 是独立消费者）
- **Related**: F207（个人投资学习 / finance data 基建，后续行情 provider 与来源审计可复用方法论）
- **Related**: F192（后续分析质量 eval / sop contract）
- **Blocked by**: 无（Phase A 先走异步 adapter，不等待 Clowder AI 新 API）

## Risk

| 风险 | 缓解 |
|------|------|
| 把独立系统又做成 Hub 插件 | repo 独立、端口独立、DB 真相源独立；Clowder AI 只通过 adapter 被调用 |
| 自然语言解析不稳定 | Phase A 存 raw_content 保底；Phase B 推结构化 JSON block；parser 失败不丢原文 |
| 误用不存在的 Clowder AI API | Phase A adapter 先做探针，所有调用写成能力探测 + fallback；spec 禁止假定 `/api/files` 已存在 |
| 投资数据/密钥泄漏 | `.env*` gitignore；SQLite 本地路径默认 `data/`；不接交易 API；推送 token 只进 env |
| 行情接口非官方、可能漂移 | response parser 有 fixture；接口失败显示 degraded；后续接 F207 finance-data 思路 |
| Agent 分析超时 | adapter timeout + retry policy；页面展示 last_success + current_status |
| 过早做同步 invoke API 扩大 Clowder scope | Phase D 再做；Phase A/B 不修改 Clowder Runtime 主链路 |

## Open Questions

| # | 问题 | 状态 |
|---|------|------|
| OQ-1 | Phase A 首选推送通道用 WxPusher / Server 酱 / 飞书机器人哪一个？ | ⬜ Phase A Design Gate 决定；默认选配置成本最低的 webhook 通道 |
| OQ-2 | 独立 repo 是否需要远端 Git remote / 名称 / GitHub 可见性？ | ⬜ 本地 repo 已建，远端由 co-creator 后续决定 |
| OQ-3 | Clowder AI 暴露给外部系统的长期 Agent invoke contract 应落在哪个 architecture cell？ | ⬜ Phase D 前走架构讨论；Phase A 不阻塞 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | F240 独立立项，不并入 F226 | co-creator 明确要求独立系统；F226 是分析能力，F240 是业务产品 | 2026-06-23 |
| KD-2 | 投资系统 DB 是用户可见真相源，state.json 是给猫看的投影 | 表单 CRUD、权限、历史筛选和推送审计都需要关系型真相源 | 2026-06-23 |
| KD-3 | Phase A 走异步 thread/adapter，不等待新增 Agent invoke API | 能最短端到端验证产品闭环，避免先改 Runtime 扩大 scope | 2026-06-23 |
| KD-4 | 执行技术栈以当前 Hub 真实基线为准：Next.js + React、Fastify、better-sqlite3 | 设计草案中的 Hono/Drizzle 与仓库事实不符；参考 Hub 应参考真实代码 | 2026-06-23 |
| KD-5 | F240 不接任何交易 API | 系统只做展示、分析和提醒；交易仍由人类在券商/银行 App 中执行 | 2026-06-23 |

## Architecture cell

```markdown
Architecture cell: finance-data + dispatch (external consumer boundary)
Map delta: none for Phase 0/A
Why: F240 是独立 repo，Phase A 只消费 F226/finance-data 思路和现有 thread dispatch，不改变 cat-cafe ownership map；Phase D 若新增 Agent invoke API 再开 map delta。
```

## Eval / Tracking Contract

- **Primary Users**: co-creator / 投资人，用独立页面管理持仓并阅读鸿瑞分析。
- **Activation Signal**: 每日分析生成次数、手动触发次数、页面查看历史分析次数、推送投递成功率。
- **Friction Metric**: 从打开页面到完成一次"新增/调整持仓 -> 触发分析 -> 看到结果"的步骤数和失败率。
- **Regression Fixture**:
  - F240-A: seed DB -> export F226 state -> fixture JSON 与 schema snapshot 匹配。
  - F240-B: canned 鸿瑞速报 + drilldown -> parser 产出 analysis_result + details。
  - F240-C: quote provider failure -> API/Web 显示 degraded，不生成伪行情。
  - F240-D: viewer role -> write API returns 403。
- **Sunset Signal**: co-creator 决定投资系统不再独立运行，或 F226 被新的结构化投资 agent runtime 完全取代。

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-06-23 | co-creator 拍板独立系统；宪宪重写设计方案；砚砚接球立 F240 并创建独立 repo |

## Review Gate

- Phase 0: 宪宪 review 架构和 F226 边界；小红确认鸿瑞输出契约方向。
- Phase A Design Gate: 烁烁评审页面信息架构 + co-creator 确认 wireframe；宪宪评审 Agent adapter contract。
- Phase A Implementation: 跨个体 review，重点看数据安全、RBAC、adapter timeout、行情 degraded 和不接交易 API。

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Design** | `docs/design/2026-06-23-investment-dashboard.md` | 宪宪 v1.0 独立系统设计输入 |
| **Feature** | `docs/features/F226-stock-advisor.md` | 鸿瑞 + stock-advisor 能力真相源 |
| **Skill** | `cat-cafe-skills/stock-advisor/SKILL.md` | 分析流程、输出格式、状态文件契约 |
| **Repo** | `/Users/slipshod/AIBuild/personal-investment-dashboard` | F240 独立系统代码仓库 |
| **Plan** | `/Users/slipshod/AIBuild/personal-investment-dashboard/docs/phase-a-plan.md` | Phase A 执行拆解与分工 |
