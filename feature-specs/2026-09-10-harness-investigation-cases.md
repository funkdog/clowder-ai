---
doc_kind: note
created: 2026-09-10
topics: [harness, investigation, evaluation, source-audit]
---

# 调查案例选材：网络研究与社区报告

目标：选择能检验“观察异常 → 多种解释 → 输入关联 → 验证/排除”的材料，而非预选一定能证明 skill 有害的故事。用户来源：thread_mtpy51ha5te3mznf，0001789023039589-000156-72a3b430。以下为选材建议，本轮没有运行新模型实验、修改配置或下载执行第三方代码。

## 推荐材料与判题

| 材料 | 具体调查对象 | 为什么选 | 证据限度 |
|---|---|---|---|
| [Evaluating AGENTS.md v2](https://arxiv.org/html/2602.11988v2)，2026-06-23 | 相同任务带/不带仓库指令时，测试、文件探索和指定工具使用发生变化 | 最直接连接输入与行为；可进一步隔离具体条款，而不是只看成功率 | 研究比较的主要是整份 context file，不证明每次新增测试无价值；测试模型不是当前 GPT-6；成功率差异在 v2 中不显著 |
| 同论文 Appendix B.1 的无其他文档条件；辅以 [AGENTS.md 效率研究](https://arxiv.org/html/2601.20404v1)，2026-01 | 指令提供此前缺失的项目知识，可能减少无效探索 | 必须有“应该保留规则”的案例，防止调查器把删规则当默认目标 | 无文档条件为人为消融；另一效率论文使用 GPT-5.2-Codex、小范围 PR，未做完整正确性评估，不能把更快等同更好 |
| [SlopCodeBench code_search](https://github.com/gabeorlanski/scb-problems/tree/ef6a9dd13911566b6b01075ca121758c9f7b5c5f/code_search) | 五阶段：基础搜索 → 多语言 → 结构模式 → 自动修复与 dry-run → 更多语言 | 需求变化、代码结构、回归、读写副作用都有明确对象，适合测试统一调查流程能否跨阶段工作 | 作者编写的 benchmark，不是自然生产事故；复杂度指标是代理，不能把正常功能增长判为坏设计；各 checkpoint 保留代码，不延续此前对话 |
| [Codex #21269](https://github.com/openai/codex/issues/21269)，2026-05-05 | 压缩后旧的 AGENTS/developer/memory/skill 包保留在历史中，又与当前指令叠加 | 能检验“输入内容有问题”与“同一内容被重复投递”的区分 | 报告给出 JSONL 字段与脱敏复现步骤，完整私有轨迹未公开；维护者后续说明压缩实现变更并关闭问题，不把关闭当成本报告全部归因已独立证实 |
| [Claude Code #63912](https://github.com/anthropics/claude-code/issues/63912)，2026-05-30 | 报告称 DokuWiki 认证方法已在 reference_dokuwiki.md 中，但压缩后尝试了错误方案而未读取参考 | 覆盖遗漏必要动作；区分“资料存在”“可发现”“进入上下文”“实际采用” | 社区 feature request，无公开完整运行记录，当前 closed/duplicate。只是候选问题，不是已确定的记忆机制失败标签 |
| [Codex #13568 维护者回复](https://github.com/openai/codex/issues/13568#issuecomment-4050697702)，2026-03-12 | 用量突然下降/不同页面不一致，部分原因是跨区域用量同步 | 必备排除案例：成本看起来异常，不等于规则让模型多做事 | 维护者明确该同步问题只能解释部分报告；其余原因与当时模型/配置相关，不外推当前定价或 GPT-6 |

最贴近输入影响的是第一组；最完整、当前可直接读到任务规格的是 code_search；压缩、遗漏与用量同步用来挑战错误归因和“不知道”的处理。

## code_search 的具体取材方式

已通过 gh 读取 checkpoint_4.md 与 checkpoint_5.md 原文，核对第 4 阶段引入只预览/实际写入、重叠修复冲突和排序，第 5 阶段增加 Rust/Java/Go/Haskell，并保留此前行为。前三阶段也与论文 Appendix A.1 对应。

它可以同时提出多种不同的问题：必要的新增回归是否被误判为重复测试；新增语言是否只是正常复杂度增长；dry-run 是否意外写文件；早期设计是否使后续修改集中堆入同一函数。是否真的发生、是否与某条输入有关，必须由执行和对照决定，不在选题时预填答案。

## 来源与工件核对

- AGENTS.md 论文 v1（2026-02-12）称 AGENTbench；v2（2026-06-23）称 CTXbench，不能混用版本、图编号与统计结论。作者来自 ETH Zurich 与 LogicStar.ai，后者有商业背景；本建议依据论文方法和工件，不使用其营销主张。
- 已读 [旧实验仓库](https://github.com/eth-sri/agentbench) 与 final_scripts/README.md，冻结 HEAD `da299c4c6b14a9abad2ceef8c751f6c45c543656`。仓库包含生成、验收与轨迹分析入口，需要 Docker/模型访问；本轮未安装或执行。
- README 列出的 `https://files.sri.inf.ethz.ch/agentbench/agentbench_traces.tar.zst` 经 HEAD 请求返回 404。不能声称已拿到历史完整轨迹；后续若不能取得兼容工件，使用公开任务重新采集，并明确不是论文原 run 重放。Hugging Face 数据页面可见，但本轮行预览 API 读取失败，未选出具体 dataset instance。
- 已读 [SlopCodeBench 论文](https://arxiv.org/html/2603.24755)、主仓 README 与 [已知问题](https://github.com/SprocketLab/slop-code-bench/blob/main/docs/KNOWN_ISSUES.md)。旧文常见 20 个问题/93 checkpoints，当前论文已扩展为 36/196；本建议以固定 code_search 五阶段规格为对象，不混版本报成绩。
- 题目仓库当前坐标为 `gabeorlanski/scb-problems`，冻结 HEAD `ef6a9dd13911566b6b01075ca121758c9f7b5c5f`。其他镜像仍提 SprocketLab/scb-problems，该路径本轮返回 404。已知问题文档还提醒部分参考解有缺陷，因此未来复现仍需核测试与规格，不能盲信“参考解”。
- GitHub issue 正文和评论用 `/opt/homebrew/bin/gh` 只读核对；没有写评论、联系作者或提交 issue。

## 不作为已确认案例的材料

- [Codex #2927](https://github.com/openai/codex/issues/2927)：2025 年 Codex 0.27/GPT-5 报告压缩后忽略指令，维护者 2025-12-25 以已过时关闭。可作历史检索线索，不能描述为当前 GPT-6 缺陷。
- [Claude Code #64539](https://github.com/anthropics/claude-code/issues/64539)：讨论控制提示与工具返回的来源混淆，有结构论证和社区自述，后来因不活跃关闭；未取得独立端到端复现，不将其结构性解释当既定因果真相。
- 泛泛“模型越来越笨”“写太多测试”及无轨迹的费用抱怨不作 gold label。闭合 issue、模型自述和点赞数均不等于根因证明。

## 建议的抽样与验收

从已冻结的任务/运行中先抽样，再观察是否有疑点；保留随机正常任务、合理重复、规则有帮助、来源/工具故障与无法归因的样本。用于开发调查器的案例不得又作为独立验收集。所有外部材料已对本次研究者曝光，不能声称其对研究者盲测。

最终评价调查器是否能给出可追溯的候选解释、寻找区分证据、撤销误报并诚实保留未知；不以它找出多少“坏 skill”为成功目标。当前只完成资料核验与选材，尚未证明上述社区问题在咱们环境中可复现。
