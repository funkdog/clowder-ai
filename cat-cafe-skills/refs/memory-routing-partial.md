# 记忆系统三入口路由 (F188 Phase F)

> **Single source of truth for memory navigation routing.** Cross-referenced
> from CLAUDE.md / AGENTS.md / GEMINI.md / OPENCODE.md memory sections.
>
> Owner: F188 (Library Stewardship Phase F) | Created: 2026-05-10

## 入口决策表

已有可直接读取的文件路径、消息坐标或 URI 时，使用对应 reader；只有定位来源或补充缺口时才选检索入口。F 号 / ADR 号等实体标识用于定位或看关系，不等同于已经拿到可读原文。

按场景选记忆入口（F188 KD-9 单 PR 策略）：

| 场景 | 入口 | 何时用 |
|------|------|--------|
| **实体定位 / 看关系** | `cat_cafe_graph_resolve(query, depth?, relations?)` | 只有 `F186` / `ADR-019` 等标识需定位原文，或要看周边关系 |
| **零先验 / 扫一眼最近** | `cat_cafe_list_recent(scope, since, limit?)` | 没有可用来源或概念关键词，需按时间找线索 |
| **语义 / 模糊找** | `cat_cafe_search_evidence(query, mode?, scope?)` | 有概念/关键词需要语义召回；跨语言搜索 |

Session hook 与此表保持同一口径。压缩恢复优先读取交接来源和本轮增量，再补缺口；不因发生压缩就把三个入口全跑一遍。

## Clowder AI 7-tool memory family（cross-reference）

每个工具的 MCP description 都互相 cross-reference 这 7 个：

1. `search_evidence` — semantic / fuzzy find（lexical/semantic/hybrid）
2. `graph_resolve` — precise anchor / relations（沿边走）
3. `list_recent` — zero-prior / scan recent
4. `list_session_chain` — 看完整对话链
5. `read_session_digest` — 看会话摘要
6. `read_session_events` — 看会话事件
7. `read_invocation_detail` — 看单次 invocation 全事件

猫的认知成本主要来自"工具间互相找"而非"工具总数"——cross-reference 是缓解膨胀的解药（4.6 review #3 收敛）。

## 自动 nudge（KD-7）

`search_evidence` 在以下情况会在 return payload 末尾自动提示换入口：

- **no_match**: results.length === 0
- **low_hit**: 无 high/mid confidence doc anchor 命中

Nudge 文本指向 `cat_cafe_graph_resolve` 和 `cat_cafe_list_recent`。

**FM-5 measurement**: nudge truly fails iff 猫 ignores AND falls back to Bash grep（4.6 review #4 confound 排除）。

## 隐私边界（KD-8）

`graph_resolve` 和 `list_recent` 的 MCP schema **不接受** `callerCollections` / `collections` / `dimension` 参数。所有 collection 可见性由服务端从 agent identity 派生，client cannot self-grant private collection visibility.

v1 限制：只看 public/internal collections。Private/restricted 需要未来 server-side identity wiring。

## 排序行为（F200 — consumption-weighted ranking 已上线）

`search_evidence` 结果现在融合消费信号排序（`F200_CONSUMPTION_RERANK=on`）：

- 被猫猫实际消费（recall→Read/action）的文档排名提升；长期无人读的文档逐渐下沉
- Constitutional 文档（ADR/lesson/canon）永远不降权——consumption 低不代表不重要
- 新文档 14 天 grace period + Bayesian 先验，不会因缺数据被埋
- 近似重复结果 MMR 去重，前排更多样
- `graph_resolve` 边权重也融合消费频次（常走的路径权重更高）

不需要改变搜索方式——排序自动生效，结果更贴近实际使用价值。

## 参考

- Spec: `docs/features/F188-library-stewardship.md` Phase F
- Implementation plan: *(internal reference removed)*
- Related: F102 (memory system), F148 (navigation), F167 (A2A eval), F186 (library architecture)
