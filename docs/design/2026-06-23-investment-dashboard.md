---
topics: [stock-advisor, investment-dashboard, independent-system, product-design]
related_features: [F226, F240]
doc_kind: design
author: 宪宪 (GLM-5.2[1m])
created: 2026-06-23
updated: 2026-06-23
status: approved-by-cvo
cvo_decisions:
  - "独立系统，不与 Hub 整合（co-creator 2026-06-23 三次确认）"
  - "技术栈参照 Clowder AI（React + Node.js + SQLite）"
  - "本机独立端口部署，后续远端"
  - "独立 repo，交砚砚按 feat-lifecycle 推进"
---

# 个性化投资行情系统 — 独立系统设计方案 v1.0

> **状态**：v1.0，co-creator 已拍板方向 + 技术选型
> **诉求源**：co-creator 2026-06-22/23 原始需求 + 三次确认"独立系统"
> **复用**：F226 鸿瑞 + stock-advisor SKILL V3 作为分析 Agent 服务
> **架构师**：宪宪 [布偶猫/GLM-5.2🐾]
> **执行**：砚砚（@cat-cafe 队友）按 F240 feat-lifecycle 推进
> **执行口径修正**：Phase A 技术栈以当前 Clowder AI 真实代码为准：Next.js + React、Fastify、better-sqlite3 / SQLite、pnpm、TypeScript。本文早稿里的 Hono / Drizzle 口径作为草案历史保留，执行以 `docs/features/F240-personal-investment-dashboard.md` 为准。

---

## 0. 核心决策（co-creator 已拍板）

| # | 决策 | co-creator 确认 |
|---|------|----------------|
| 1 | 独立系统，不与 Hub 整合 | "不需要与本Hub整合，是单独的系统" |
| 2 | 复用猫猫能力作为 Agent 服务接入 | "可以复用猫猫作为分析agent的能力接入" |
| 3 | ops_log/changelog 在新系统独立维护 | "可以在新系统中通过表单或者其他方式单独维护" |
| 4 | 推送由新系统自建 | "不需要在本hub进行推送，单独构建推送能力" |
| 5 | 技术栈参照 Clowder AI | "前后端包括DB的技术栈参考猫猫hub(clowder-ai)" |
| 6 | 本机独立端口部署 | "现在本机独立端口部署，后续考虑远端" |
| 7 | 独立 repo | "项目是独立repo" |
| 8 | 砚砚按 feat-lifecycle 推进 | "交由砚砚后按feat-lifecycle起feat" |

---

## 1. 诉求拆解

| co-creator 原话 | 设计约束 |
|---|---|
| "thread 中投资助手不便于后续交互" | 交互从 thread 升级为独立页面 |
| "历史推送与行情分析没有很好展示" | 历史分析结果可浏览、筛选、下钻 |
| "以页面形式呈现" | 独立 Web 应用（非 Hub panel / 非 thread） |
| "依赖当前投资助手依赖的 skill" | 复用 stock-advisor SKILL V3 + 鸿瑞 |
| "通过猫猫(鸿瑞)进行行情分析" | 猫是分析引擎，系统是展示 + 管理层 |
| "展示每天的行情结果" | 今日速览 + 历史时间轴 |
| "情报、投资人管理、权限等集成" | 预留 3 个功能模块 |
| "独立系统，复用猫猫能力" | 猫作为微服务接入，不是 Hub 内嵌 |

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│ 独立投资行情系统（独立 repo / 独立端口部署）                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 前端（Next.js + React，参照 Clowder AI packages/web）     │  │
│  │  ├─ 分析 Tab：最新速览 + 历史时间轴 + Drilldown              │  │
│  │  ├─ 持仓 Tab：持仓 CRUD + boundaries + 操作日志              │  │
│  │  ├─ 系统 Tab：推送配置 + 权限 + 账户设置                     │  │
│  │  └─ 情报 Tab：Phase B 起加入 CRUD + TTL 管理                 │  │
│  └───────────────────┬──────────────────────────────────────┘  │
│                      │                                           │
│  ┌───────────────────▼──────────────────────────────────────┐  │
│  │ 后端 API（Node.js + Fastify，参照 Clowder AI）             │  │
│  │  ├─ CRUD：持仓/投资人/边界/策略/情报/推送配置                │  │
│  │  ├─ 行情代理（腾讯 API + Redis/内存缓存 30s）              │  │
│  │  ├─ 分析调度 → Agent 适配层                                 │  │
│  │  ├─ 推送服务（微信/飞书/钉钉，自有身份 + 消息模板）         │  │
│  │  └─ 定时调度（node-cron 或复用 Clowder AI scheduled task）  │  │
│  └─────────┬────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼────────────────────────────────────────────────┐  │
│  │ 数据库（better-sqlite3 + SQLite 开发 / PostgreSQL 生产）    │  │
│  │  ├─ investors（投资人 + boundaries + style + push_config） │  │
│  │  ├─ portfolios + holdings（持仓 + philosophy + strategy）  │  │
│  │  ├─ ops_log（操作日志 — 真相源在 DB）                       │  │
│  │  ├─ strategy_changelog（策略变更日志 — 真相源在 DB）        │  │
│  │  ├─ analysis_results + analysis_details（分析存档）        │  │
│  │  ├─ intelligence（情报 + TTL）                              │  │
│  │  ├─ push_log（推送记录 + 投递状态）                         │  │
│  │  └─ access_control（权限绑定 RBAC）                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Agent 适配层（与 Clowder AI 的唯一集成点）                  │  │
│  │  ├─ 数据同步：DB → state.json（给猫看的输入视角）           │  │
│  │  ├─ 分析触发：写 thread 消息 → 猫唤醒 → 分析               │  │
│  │  ├─ 结果回传：thread 消息 → 解析 → 存 DB                   │  │
│  │  └─ 定时调度：按 cron 触发适配层 → 鸿瑞分析 → 推送          │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │ HTTP API                              │
└─────────────────────────┼──────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Clowder AI（现有，不改动）                                        │
│  ├─ 鸿瑞 (cat-9qxnn39j) + stock-advisor SKILL V3               │
│  ├─ 投资助手 thread (mqaoirycwxwyfjjj)                          │
│  ├─ .cat-cafe/stock-advisor-state.json ← 适配层写入             │
│  ├─ .cat-cafe/stock-intelligence.json ← 适配层写入              │
│  └─ 分析结果 → thread 消息 → 适配层读取解析                      │
│                                                                  │
│  可选复用：                                                       │
│  ├─ Scheduled Task：cron 触发 → 唤醒猫 → 分析                    │
│  └─ Eval 框架：eval:sop → 分析质量评估                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent 适配层设计（核心桥接）

这是独立系统和 Clowder AI 之间的唯一集成点，解决三个方向的数据流。

### 3.1 数据下行：DB → state.json（投资系统是真相源）

**原则**：用户在投资系统表单里做 CRUD → 写 DB → 适配层同步到 state.json → 鸿瑞下次分析读到最新数据。

**不需要再走 thread "@鸿瑞 我买了 XX"**。操作日志由投资系统 DB 维护，猫的 ops_log 只是猫的视角记录。

同步策略：
- 写操作后即时同步（写入 DB 成功 → 触发 state.json 全量覆盖）
- state.json 格式保持与 F226 V6 schema 兼容（猫不感知变化）
- 同步失败 → 重试 3 次 → 告警（不阻塞用户操作）

### 3.2 分析调用：投资系统 → 鸿瑞 → 结果回传

**Phase A（异步模式，零改造）**：

```
投资系统                          Clowder AI
  │                                  │
  │  POST /api/cat-cafe/message      │
  │  (发 thread 消息 "@鸿瑞 分析")   │
  │ ───────────────────────────────► │
  │                                  │  鸿瑞被唤醒
  │                                  │  执行 SKILL V3 分析
  │                                  │  输出速报 + drilldown 到 thread
  │  GET /api/cat-cafe/thread        │
  │  (轮询 thread 新消息)            │
  │ ◄─────────────────────────────── │
  │                                  │
  │  解析结果 → 存 analysis_results   │
  │  同步 state.json (猫可能更新持仓) │
```

- 触发：定时 cron / 手动按钮 / API 调用
- 轮询间隔：5s，超时 5min
- 认证：使用 cat-cafe API token（配置在投资系统的 env 中）

**Phase D（Agent Runtime API，stream 优先）**：

```
投资系统                          Clowder AI
  │                                  │
  │  POST /api/agent/invoke/stream   │
  │  { skill: "stock-advisor",       │
  │    state: { ... },               │
  │    timeoutMs: 300000 }           │
  │ ───────────────────────────────► │
  │                                  │  鸿瑞完整投研（拉行情/K线）
  │  SSE: tool_call/tool_result/...  │
  │ ◄─────────────────────────────── │
  │  done { result: stock_analysis_v1}
```

需 cat-cafe 新增 `/api/agent/invoke/stream` 路由。`/api/agent/invoke` 只保留为 strict-fast state-only fallback，不作为完整投资分析入口。

### 3.3 结果解析：猫输出 → 结构化 DB

鸿瑞输出是自然语言消息（速报 + drilldown）。适配层需要解析为结构化数据：

**速报解析 → `analysis_results` 表**：
- `portfolio_verdict`（组合结论，🧭 行）
- `position_pct` / `cash`（仓位% + 现金）
- `signals`：`{ action: N, watch: N, normal: N }`（信号统计）
- `timestamp` + `investor_id`

**Drilldown 解析 → `analysis_details` 表**：
- 每只票一行：`code / name / level(ACTION|WATCH|NORMAL)`
- `technical`：均线/MACD/量比/密集区
- `logic_check`：持有逻辑验证结果
- `portfolio_impact`：组合影响
- `suggestion`：建议操作 + 触发条件 + 置信度

**原文存档 → `analysis_raw` 表**：
- 存储猫的原文消息（用于历史查看和 fallback）

> 解析器第一阶段可用正则 + 关键词匹配，精度不需要 100%（展示为主）；
> 第二阶段可让鸿瑞输出 JSON block（SKILL 改造），但这不影响 Phase A。

---

## 4. 数据库 Schema

```sql
-- 投资人
CREATE TABLE investors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  style TEXT,                    -- 投资风格（自然语言）
  total_asset REAL,              -- 总资产
  boundaries TEXT,               -- JSON array，红线列表
  correlation_groups TEXT,       -- JSON object，相关性分组
  push_config TEXT,              -- JSON object，推送配置
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 组合
CREATE TABLE portfolios (
  id TEXT PRIMARY KEY,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  name TEXT NOT NULL,
  style TEXT,
  cash REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 持仓
CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
  code TEXT NOT NULL,            -- 股票代码
  name TEXT NOT NULL,
  shares INTEGER,                -- 股数
  amount REAL,                   -- 金额
  avg_cost REAL,                 -- 平均成本
  target_pct REAL,               -- 目标占比
  philosophy TEXT,               -- 持有逻辑
  strategy TEXT,                 -- JSON，结构化策略
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 操作日志（真相源在 DB）
CREATE TABLE ops_log (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
  date TEXT NOT NULL,            -- YYYY-MM-DD
  code TEXT NOT NULL,
  action TEXT NOT NULL,          -- buy/sell/add/remove/adjust
  shares_delta INTEGER,
  amount_delta REAL,
  price REAL,
  reason TEXT,
  source TEXT NOT NULL,          -- investor/agent_suggestion/agent_auto
  created_at INTEGER NOT NULL
);

-- 策略变更日志（真相源在 DB）
CREATE TABLE strategy_changelog (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
  date TEXT NOT NULL,
  code TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 分析结果
CREATE TABLE analysis_results (
  id TEXT PRIMARY KEY,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  kind TEXT NOT NULL,            -- open/close/intraday/manual
  portfolio_verdict TEXT,        -- 组合结论
  position_pct REAL,
  cash REAL,
  signals_action INTEGER DEFAULT 0,
  signals_watch INTEGER DEFAULT 0,
  signals_normal INTEGER DEFAULT 0,
  raw_content TEXT,              -- 原文存档
  thread_msg_id TEXT,            -- 对应的 cat-cafe 消息 ID
  analyzed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 分析明细（逐票）
CREATE TABLE analysis_details (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analysis_results(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL,           -- ACTION/WATCH/NORMAL
  technical TEXT,                -- JSON：均线/MACD/量比
  logic_check TEXT,              -- JSON：逻辑验证结果
  portfolio_impact TEXT,         -- JSON：组合影响
  suggestion TEXT,               -- 建议操作
  trigger_condition TEXT,        -- 触发条件
  confidence TEXT,               -- 高/中/低
  drilldown_raw TEXT             -- drilldown 原文
);

-- 情报
CREATE TABLE intelligence (
  id TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  source TEXT,
  impact TEXT,                   -- 影响描述
  related_codes TEXT,            -- JSON array：关联标的
  ttl_days INTEGER DEFAULT 30,
  expires_at INTEGER,            -- 过期时间
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 推送记录
CREATE TABLE push_log (
  id TEXT PRIMARY KEY,
  analysis_id TEXT REFERENCES analysis_results(id),
  channel TEXT NOT NULL,         -- wechat/feishu/dingtalk
  target TEXT NOT NULL,          -- 投递目标（群/用户 ID）
  status TEXT NOT NULL,          -- pending/sent/failed
  content_summary TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);

-- 权限
CREATE TABLE access_control (
  id TEXT PRIMARY KEY,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  user_id TEXT NOT NULL,         -- 系统用户 ID
  role TEXT NOT NULL,            -- owner/member/viewer
  created_at INTEGER NOT NULL
);

-- 系统用户（简单 auth，不依赖 Hub session）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',  -- admin/member/viewer
  created_at INTEGER NOT NULL
);
```

---

## 5. 产品形态（Phase A 3 Tab）

### 5.1 页面骨架

```
┌─────────────────────────────────────────────────────────────┐
│ 📈 投资行情中心   [👤 投资人 ▼]                    [⚙️]     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────── Hero 速览 ────────────────────────────────────┐  │
│  │  L1  🧭 黄金逼近红线不加，优先补券商+科创                │  │
│  │  L2  仓位 70% ▓▓▓▓▓▓▓░░░  现金 ¥9万                  │  │
│  │      黄金 18.3%▓▓░⚠️  券商 9.2%▓░⬇️  科创 6%░⬇️       │  │
│  │  L3  ACTION：华泰三维度3/3；紫金触止损                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [分析]  [持仓]  [系统]                                      │
│  ────────────────────────────────────────                    │
│  （各 Tab 内容区）                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Tab 对照

| Tab | 内容 | 数据源 | 写入方式 |
|---|---|---|---|
| **分析** | 最新分析速报 + Drilldown + 持仓实时行情 + 历史时间轴 / 日期筛选 / 信号搜索 | analysis_results + analysis_details + 行情代理 | ❌ 只读 |
| **持仓** | holdings 表 + boundaries + ops_log + strategy_changelog；浏览表格 + 编辑 Drawer | portfolios + holdings + ops_log + strategy_changelog | ✅ 表单 CRUD → DB → 同步 state.json |
| **系统** | 推送配置 + 权限绑定 + 账户设置；投资人管理从顶栏投资人菜单进入 | investors + access_control + users + push_config | ✅ 表单 CRUD → DB |
| **情报（Phase B）** | intelligence CRUD + TTL 管理 + 可选 RSS 导入 | intelligence | ✅ 表单 CRUD → DB → 同步 intelligence.json |

**关键哲学**：持仓/边界/策略变更**直接走表单** → 写 DB → 同步 state.json。不需要 @鸿瑞。鸿瑞只负责"分析"这件猫擅长的事。

### 5.3 UI 信息架构原则（烁烁 Design Gate）

- Phase A 首屏只显示 **分析 / 持仓 / 系统** 三个 Tab；不放 coming soon 空壳。情报到 Phase B 再加入。
- 今日与历史合并为 **分析**：最新分析置顶，历史作为同一 Tab 内的时间筛选和时间轴。
- Boundaries / 红线属于投资数据，不属于系统设置；入口放在 **持仓** Tab 的可展开面板。
- 投资人切换放顶栏；投资人管理作为下拉菜单里的管理入口，不占独立 Tab。
- Hero 速览必须有三层视觉层级：L1 组合结论、L2 仓位/分组可视化、L3 ACTION 摘要直接展开。
- 持仓页分浏览模式和编辑模式：默认紧凑表格，编辑用右侧 Drawer；加仓/减仓快操作不超过 3 步。
- 视觉调性采用数据驱动 dashboard：暖灰暗色主题、等宽数字、8px 间距基数；信号色（琥珀/蓝/灰）与涨跌色（绿涨红跌）分开。

---

## 6. API 契约

### 6.1 投资人

```
GET    /api/investors                    -- 列表
POST   /api/investors                    -- 新增
GET    /api/investors/:id                -- 详情
PATCH  /api/investors/:id                -- 更新（boundaries/style/push_config）
DELETE /api/investors/:id                -- 删除
```

### 6.2 组合 + 持仓

```
GET    /api/investors/:id/portfolios               -- 列表
POST   /api/investors/:id/portfolios               -- 新增组合
GET    /api/portfolios/:id/holdings                 -- 持仓列表
POST   /api/portfolios/:id/holdings                 -- 新增持仓
PATCH  /api/holdings/:id                            -- 编辑持仓
DELETE /api/holdings/:id                            -- 删除持仓
GET    /api/portfolios/:id/ops-log                  -- 操作日志
GET    /api/portfolios/:id/strategy-changelog       -- 策略变更日志
```

### 6.3 行情代理

```
GET    /api/quotes?codes=sh601179,sz002155,hf_GC    -- 实时行情（30s 缓存）
GET    /api/kline?code=sh601179&count=20            -- K 线数据
```

### 6.4 分析

```
GET    /api/analysis?investor_id=&from=&to=&kind=   -- 历史分析列表
GET    /api/analysis/:id                             -- 分析详情（含明细）
POST   /api/analysis/trigger                         -- 手动触发分析
```

### 6.5 情报

```
GET    /api/intelligence?status=active               -- 活跃情报
POST   /api/intelligence                             -- 新增
PATCH  /api/intelligence/:id                         -- 编辑
DELETE /api/intelligence/:id                         -- 删除
```

### 6.6 推送

```
GET    /api/push/log?investor_id=&from=&to=          -- 推送记录
POST   /api/push/config                              -- 配置推送通道
POST   /api/push/send                                -- 手动推送
```

### 6.7 权限

```
GET    /api/access?investor_id=                      -- 权限列表
POST   /api/access                                   -- 新增绑定
DELETE /api/access/:id                               -- 移除绑定
```

---

## 7. 推送服务设计

**独立推送，不走 Hub IM 通道**。

### 通道优先级

| 阶段 | 通道 | 协议 |
|------|------|------|
| Phase A | 微信（Server酱 / WxPusher） | HTTP webhook |
| Phase B | 飞书机器人 | HTTP webhook |
| Phase C | 钉钉机器人 | HTTP webhook |

### 消息模板

```text
📈 {投资人名}｜{开盘/盘后/异动}
🧭 {组合结论}

仓位 {x}% 现金 ¥{n}万

{逐票信号，格式与 SKILL V3 速报一致}

⚠️ 不构成投资建议
```

### 推送触发

- **定时**：cron 9:35 / 15:35 / 9:05-14:35 每 30min
- **手动**：设置页 "立即推送" 按钮
- **异动**：适配层检测到鸿瑞输出了 🚨 异动消息 → 自动推送

---

## 8. 技术栈（参照 Clowder AI）

| 层 | Clowder AI 用 | 投资系统用 | 说明 |
|---|---|---|---|
| 前端 | Next.js + React | Next.js + React | 参照 `packages/web` 实际栈 |
| UI 库 | 自制组件 + CSS tokens | 自制组件起步，必要时再引入数据表格库 | 先避免重依赖，保持可控 |
| 后端 | Fastify | Fastify | 参照 `packages/api` 实际栈 |
| ORM | better-sqlite3 直接访问为主 | better-sqlite3 直接访问为主 | 当前 Hub 未使用 Drizzle；Phase A 先少一层抽象 |
| DB(开发) | SQLite | SQLite | 零配置本地开发 |
| DB(生产) | PostgreSQL | PostgreSQL | 生产级 |
| 缓存 | Redis | Redis（可选内存缓存） | Phase A 可先用内存缓存 |
| 鉴权 | Hub session | JWT + 本地 users 表 | 独立 auth |
| 测试 | Vitest | Vitest | 同生态 |
| Lint | Biome | Biome | 同生态 |

---

## 9. Phase 划分

### Phase A — MVP（2-3 周）

> 目标：独立前端 + DB + 行情展示 + 定时分析 + 推送，端到端跑通

- [ ] AC-A1: 项目脚手架（独立 repo 初始化 + 前后端 + DB schema + 鉴权）
- [ ] AC-A2: 持仓管理 CRUD（表单 → DB → 同步 state.json）
- [ ] AC-A3: 投资人 + boundaries + 组合管理
- [ ] AC-A4: 行情代理（腾讯 API + 30s 缓存）+ 持仓行情面板
- [ ] AC-A5: Agent 适配层（异步模式）：DB → state.json 同步 + thread 消息触发 + 结果轮询 + 解析存 DB
- [ ] AC-A6: 分析 Tab（最新速览 + 历史时间轴 + Drilldown + 筛选）
- [ ] AC-A7: 持仓 Tab（浏览表格 + 编辑 Drawer + boundaries 面板）
- [ ] AC-A8: 推送服务（至少微信一个通道）
- [ ] AC-A9: 定时分析（cron 触发适配层 → 鸿瑞分析 → 结果入 DB → 推送）

**验收标准**：本机 `localhost:PORT` 打开 → 看到分析 / 持仓 / 系统三入口 + Hero 速览 + 持仓表格 → 手动触发分析 → 鸿瑞出结果 → 页面刷新看到 → 微信收到推送。

### Phase B — 情报 + K 线（1.5-2 周）

- [ ] AC-B1: 情报 CRUD（DB 存储 + 同步 intelligence.json）
- [ ] AC-B2: K 线图表（腾讯 K 线 API + Recharts 渲染）
- [ ] AC-B3: 情报 → 鸿瑞分析时自动加载（适配层同步）
- [ ] AC-B4: 飞书推送通道
- [ ] AC-B5: TTL 过期自动清理

### Phase C — 投资人 + 权限（2 周）

- [ ] AC-C1: 多投资人切换和管理
- [ ] AC-C2: RBAC（owner / member / viewer）
- [ ] AC-C3: 每个投资人独立 state.json 同步
- [ ] AC-C4: 推送权限绑定
- [ ] AC-C5: 钉钉推送通道

### Phase D — 高级能力（远期）

- [ ] Agent Runtime API：cat-cafe 新增 `POST /api/agent/invoke/stream` → 投资系统直调完整投研；`POST /api/agent/invoke` 仅作 state-only fallback
- [ ] Eval 集成：分析质量接入 eval:sop 管线
- [ ] 自建行情数据归档
- [ ] 移动端适配
- [ ] 远端服务器部署

---

## 10. 与 Clowder AI 的接口契约

### 10.1 投资系统 → Clowder AI（写）

| 动作 | API | 说明 |
|------|-----|------|
| 同步 state.json | `PUT /api/files/cat-cafe/.cat-cafe/stock-advisor-state.json` | DB 变更后全量覆盖 |
| 同步 intelligence.json | `PUT /api/files/cat-cafe/.cat-cafe/stock-intelligence.json` | 情报变更后全量覆盖 |
| 触发分析 | `POST /api/cat-cafe/message` → thread `mqaoirycwxwyfjjj` | 发 "@鸿瑞 {指令}" |

> 具体接口取决于 cat-cafe 对外暴露的 API。Phase A 可用 `shell_exec` 调用 cat-cafe CLI 作为 fallback。

### 10.2 Clowder AI → 投资系统（读）

| 动作 | 方式 | 说明 |
|------|------|------|
| 读取分析结果 | 轮询 thread 新消息 | 适配层 GET thread → 解析 → 存 DB |
| 读取 state.json 变更 | 分析后同步回 DB | 猫可能修改持仓/策略 → 适配层反向同步 |

### 10.3 认证

投资系统通过 cat-cafe API token 访问 Clowder AI。Token 配置在投资系统的 `.env` 中：
```
CAT_CAFE_API_URL=http://localhost:3000
CAT_CAFE_API_TOKEN=<token>
CAT_CAFE_THREAD_ID=mqaoirycwxwyfjjj
CAT_CAFE_CAT_ID=cat-9qxnn39j
```

---

## 11. 风险

| 风险 | 缓解 |
|---|---|
| 鸿瑞输出是自然语言，解析不完美 | Phase A 用正则 + 关键词，精度 ≥80% 即可用；Phase B 让 SKILL 输出 JSON block |
| state.json 同步延迟 → 鸿瑞读到旧数据 | 写 DB 后即时同步，失败重试 3 次 + 告警 |
| 腾讯行情 API 是非官方接口 | 服务端 30s 缓存 + 接口挂了 → degraded 提示 |
| 猫分析超时（5min） | 适配层设超时 → 告警 + 降级为"分析暂不可用" |
| 定时触发时猫未唤醒 | cron 机制依赖 cat-cafe scheduled task，需验证稳定性 |
| 跨 repo 协作成本 | 接口契约文档化（本文档 §10），双方按契约开发 |

---

## 12. 立项 + 交接

- [x] 砚砚接收本设计文档
- [x] 按 feat-lifecycle 创建 F240 + 独立 repo
- [x] 拆解 Phase A 为具体任务
- [x] 确认分工（砚砚主导开发，宪宪支撑 Agent 适配层 + F226 侧接口，小红支撑输出契约，烁烁支撑 UI 视觉评审）
- [ ] Phase A 开工

---

**文档签名**：宪宪 [布偶猫/GLM-5.2🐾]
**真相源**：本文件 + F240-personal-investment-dashboard.md + F226-stock-advisor.md + SKILL.md
