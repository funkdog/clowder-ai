---
name: deep-research
tips_exempt: "2026-09-23：去掉写死猫名/型号——云端审阅席位称谓改为不绑代次、`{cat}` 研究文件命名改为按 catId；未新增用户可直接发起的操作。"
description: >
  多源深度调研管道（Web Deep Research + Coder 合成 + 云端模型咨询）。
  Use when: 技术问题需要多源调查、设计决策需要证据、operator说"调研"/"research"、需要咨询云端模型。
  Not for: 简单搜索（直接用 WebSearch）、已有结论的确认。
  Output: 调研报告 + 证据合成 或 咨询文档（含回填区）。
triggers:
  - "调研"
  - "research"
  - "深度研究"
  - "问一下 GPT Pro"
  - "咨询云端"
renamed-from: deep-research-pipeline
---

# Deep Research

两种模式：
- **Mode A: 多源调研**：一手来源查证 + 本地代码综合；存在重要盲区或分歧时增加独立研究/审阅视角
- **Mode B: 云端模型咨询**：本地猫总结背景 → operator发给云端模型 → 回填结果 → 本地猫综合

默认按问题直接查证并形成用户需要的答案或报告。只有确实要交给另一研究者时才准备交接 Prompt；已有足够证据时不为补齐流程再开研究。下列外部研究、浏览器操作和多文件组织仅用于实际选择的路径。是否形成 ADR 取决于是否作出需要记录的架构决策，不是每次调研的固定终点。

## 两种猫，各有分工

| | Web 猫（Deep Research 模式） | Coder 猫（CLI/Clowder AI） |
|---|---|---|
| 工作范围 | 检索外部来源并保留引用 | 核对本地文档、代码与实际约束 |
| 需要补齐的上下文 | 无权访问的本地资料需提供必要摘要 | 外部事实按当前可用检索能力核实 |
| 用途 | Step 2 并行调研 | Step 4 综合判断 |

**不适用场景：**
- 快速事实查询（直接用 WebSearch）
- 纯代码问题（用 Explore agent）
- 项目文档里已有答案

## 文件组织规范（铁律）

**一个研究课题 = 一个子目录**。只要产出超过 1 个文件，就必须建子目录，禁止在 `project-research/` 平铺散落。

```
project-research/YYYY-MM-DD-{topic}/
├── prompt.md                          # 外部研究交接稿（既有流程需要时保留 docs/prompts 副本）
├── {provider}-response.md             # Step 2 云端 deep research 原文
│   例：claude-response.md / gemini-response.md / gpt-response.md
├── {reviewer}-review.md               # Step 3 独立审阅（按需，记录实际模型）
├── {cat}-synthesis.md                 # Step 4 猫猫独立综合分析
│   例：<catId>-synthesis.md（每只参与猫一份）
├── {cat}-点评.md                      # 非代码猫的风格点评（如Siamese）
└── synthesis.md                       # 最终合并综合（如果有）
```

**命名规则**：
- `{topic}` 用英文 kebab-case（如 `finance-provider-stack`、`memory-architecture`）
- `{provider}` = 云端模型标识：`claude` / `gemini` / `gpt` / `gpt-pro`
- `{cat}` = 参与猫的 catId（避免和 provider 名冲突时加 `-cat`）
- 如果只有 1 个文件（如单次 Mode B 咨询），可以不建子目录，直接放 `project-research/`

**Mode B 咨询归属**：如果咨询是某个已有研究课题的一部分，文件放进该课题子目录（不另建目录）。

## 四步流程

**Step 1 — 确定问题与交付方式**

本地直接调研使用当前问题与已有上下文，按要求在聊天回答或写报告。需要交给独立研究者时，准备自包含 Prompt 并在发送前落盘；沿用已有课题目录，只补本次缺口：
```
project-research/YYYY-MM-DD-{topic}/prompt.md
（已有外部研究流程需要 docs/prompts 副本时保留该兼容入口）
```
模板见下方。写完再发，不要边写边发。

**Step 2 — 按问题选择研究路径**
```
先使用与问题匹配的一手来源。复杂度、来源分歧或验证盲区需要时，
再将同一基础 prompt 交给已选择的独立研究路径；记录各路追加上下文。
```
外部研究的实际返回存为 `project-research/YYYY-MM-DD-{topic}/{provider}-response.md`；没有该路返回时不创建占位结果。

**Step 3 — 独立审阅（按需）**
重要决策、弱证据或来源分歧需要独立判断时，选择当前可用且合适的审阅者；输入实际取得的报告，找逻辑漏洞、弱证据与竞争解释
选用独立审阅时，存为 `project-research/YYYY-MM-DD-{topic}/{reviewer}-review.md` 并注明实际模型与版本。新增查证必须附来源，不能把审阅者意见当作外部事实。

**Step 4 — Coder 猫综合 + 决策**
读本次取得的证据与审阅结果 → 对照实际 codebase 验证 → 标注"直接可用/需验证/项目特殊约束"
如果多只猫并行综合，每只猫存自己的：`{cat}-synthesis.md`
按约定交付答案或综合报告。形成架构决策时按现有决策流程记录 ADR；尚有影响结论的关键分歧时再讨论。

## Prompt 模板（Step 1）

**需要外部研究交接时**使用 `../.cat-cafe-shared-refs/research-prompt-template.md` 的 8 槽位骨架；本地直接查证不加载这份交接模板。只附任务相关且获准发送的材料；模板中的数量要求不能替代证据质量判断。

8 个槽位：
1. `Problem Frame` — 任务边界 + 非目标
2. `Current Hypotheses` — 我们的假设 + 证据缺口
3. `Disconfirm First` — 先找反例（反确认偏误）
4. `Source Mix Quota` — 来源配额（论文/工程/开源/竞品）
5. `Local Constraints` — 我们的约束（多引擎/人在环/知识在 repo）
6. `Output Schema` — 支持/反对/未定 + 置信度
7. `Decision Interface` — 映射到 采纳/试点/搁置
8. `Risk Register` — 如果结论错了炸在哪

**发送前选取必要上下文**（模板底部有候选清单）：相关 Feature spec、ADR、教训或 BACKLOG 关系；与问题无关或不可外发的内容不附。

**收到后 Quality Gate**（模板底部有标准）：反例覆盖、来源多样性、约束对齐、可行动、风险意识。

实战范例：*(internal reference removed)*

## Quota 意识

| 资源 | 策略 |
|------|------|
| 外部 Deep Research | 使用前核对当前可用额度与成本，按当前授权决定是否调用 |
| 独立模型审阅 | 按问题风险与盲区选择模型，不默认绑定某个旧型号 |

**独立视角的适用性：** 当单路证据不足或分歧会改变决策时增加独立视角；记录贡献和剩余盲区，不把固定路数当质量证明。用户要求独立回答时遵守该边界。外部发送与显著成本仍受当前授权约束。

## Chrome MCP 自动化（Step 2）

执行猫可用 `mcp__claude-in-chrome__*` 工具自动发送 prompt + 附件 + 提取回复。

**详细 DOM 选择器和代码片段见各平台 ref**：
- **ChatGPT** → `../.cat-cafe-shared-refs/chatgpt-browser-automation.md`（2026-03-10 实测验证 ✅）
- **Claude.ai** → `../.cat-cafe-shared-refs/claude-ai-browser-automation.md`（2026-03-10 实测验证 ✅）
- **Gemini** → `../.cat-cafe-shared-refs/gemini-browser-automation.md`（2026-03-10 实测验证 ✅）

### ChatGPT 自动化摘要（已验证）

| 步骤 | 方法 | 关键选择器 |
|------|------|-----------|
| 注入文本 | `execCommand('insertText')` | `#prompt-textarea` |
| 上传文件 | DataTransfer API 注入 file input | `querySelectorAll('input[type="file"]')[0]` |
| 切换深度研究 | 点击侧栏或 `+` 菜单 | `[data-testid="deep-research-sidebar-item"]` |
| 发送 | 点击发送按钮 / 按 Enter | 输入框右侧圆形按钮 |
| 等待完成 | 轮询停止按钮是否消失 | `button[aria-label="停止生成"]` |
| 复制回复 | 点击复制按钮 → 读剪贴板 | `[data-testid="copy-turn-action-button"]` |

### 文件上传工作流（提示词在输入框，ref 文档用文件上传）

```
1. 猫本地读取 ref .md 文件内容
2. JS: new File([content], 'filename.md', {type: 'text/markdown'})
3. JS: DataTransfer → fileInput.files = dt.files → dispatch 'change'
4. 文件卡片出现在输入框上方
5. 同时 execCommand 注入提示词文本
6. 发送
```

### Gemini 自动化摘要（已验证）

| 步骤 | 方法 | 关键选择器 |
|------|------|-----------|
| 注入文本 | `execCommand('insertText')` ✅ | `.ql-editor[contenteditable="true"]`（Quill） |
| 切换 Deep Research | 工具菜单 | 点击「工具」→「Deep Research」 |
| 发送 | 点击发送按钮 | 输入框右侧蓝色箭头 |
| 确认计划 | 点击「开始研究」 | ← Gemini 独有！ChatGPT/Claude 无此步骤 |
| 等待完成 | 轮询停止按钮消失 | 或检查「分享和导出」按钮出现 |
| 导出 | 分享和导出 → 导出到 Google 文档 | 报告面板顶部按钮 |
| 下载 MD | Google Docs: 文件 → 下载 → Markdown | 标准 Google Docs 操作 |

> **重要更正**：之前记录的"contenteditable 不接受 execCommand"是错误的。Gemini Quill 编辑器完全支持。

### 报告提取（2026-03-10 实测确认）

- **GPT Pro 回复**：`copy-turn-action-button` + `clipboard.readText()` ✅ 全自动
- **✅ GPT 深度研究报告**：API 提取法（`backend-api/conversation/{id}` + Bearer token）
  - 报告在 widget state JSON → `report_message.content.parts[0]` = 完整 Markdown
  - Blob 下载 → `cp` 归档（详见 `../.cat-cafe-shared-refs/chatgpt-browser-automation.md`）
- **✅ Claude.ai 报告**：Artifact 面板原生 "Download as Markdown" 按钮（blob URL，同源 DOM）
  - 点击 Copy options → Download as Markdown → 自动下载 .md 文件
  - 比 ChatGPT 简单得多——无需 API 提取（详见 `../.cat-cafe-shared-refs/claude-ai-browser-automation.md`）
- **✅ Gemini 报告**：导出到 Google Docs → 文件 → 下载 → Markdown (.md)
  - 两跳路径（Gemini → Google Docs → 本地），比 ChatGPT/Claude 多一步
  - 下载文件名 = Google Docs 文档标题 + `.md`（详见 `../.cat-cafe-shared-refs/gemini-browser-automation.md`）

## 常见错误

| 错误 | 修正 |
|------|------|
| 已选择外部研究但未保存发送内容 | 发送前保存实际 Prompt；本地直接调研不为此额外生成文件 |
| 多路比较却未记录输入差异 | 共享基础问题，并记录每路新增上下文和来源 |
| 角色固定绑定旧型号 | 按当前可用能力选择研究者与审阅者，保留各自来源 |
| 忽略来源或审阅分歧 | 记录竞争解释，判断是否需要进一步查证 |
| Coder 猫盲信 web 报告 | 必须对照实际 codebase 验证 |

## Step 5 — 在交接前持久化调研产出

如果调研结果需要被后续 session、其他猫、或人类继续使用，就保存实际报告；已授权在仓库落盘时按当前交付边界 commit。仅聊天回答不为满足本节额外建文件。
- 在 worktree 里：commit 到当前分支
- 在共享 main worktree：按已授权范围 commit；远程发布遵守当前授权，本地交付不自动 push
- 多次 Edit 更新：每次重大更新后追加 commit

**实际 commit 时的验证**：在总结 / handoff 里记录并核对 commit SHA。仅聊天交付不为取得 SHA 创建文件或提交。

## Next Step

问题已回答且约定产物已交付时结束；仍需讨论会改变决策的分歧时进入 `collaborative-thinking`。

---

# Mode B: 云端模型咨询

**场景**：需要咨询无法访问本地文件的云端模型（如 GPT Pro、Claude Pro 等）。

**问题**：云端模型不知道我们的现状，也访问不到本地文件。直接问容易得到泛泛的回答。

**解决**：本地猫先总结背景，生成自包含的 prompt + 回填文档。

## 适用场景

- 需要 GPT Pro 帮忙审阅/补充观点
- 需要外部专家视角
- 本地调研完成后，想要第三方验证
- operator说"问一下云端的 xxx"

## 三步流程

**Step 1 — 本地猫创建咨询文档**

```
project-research/YYYY-MM-DD-{topic}-{model}-consult.md
```

文档结构（三部分）：
```markdown
## Part 1: 发给云端模型的提示词
> 直接复制发送

{自包含的背景 + 我们的现状 + 已有结论 + 请求}

## Part 2: 云端模型回答（待回填）
> operator粘贴回答到这里

[待回填]

## Part 3: 综合后的最终版本（待撰写）
> 本地猫综合后撰写

[待撰写]
```

**Step 2 — operator发送 + 回填**

1. 复制 Part 1 发给云端模型
2. 把回答粘贴到 Part 2
3. @ 本地猫继续

**Step 3 — 本地猫综合**

1. 读 Part 2 的回答
2. 对照本地 codebase 验证
3. 综合写 Part 3（最终版本）

## Part 1 Prompt 模板

```markdown
你好，我们是 {团队简介}，正在 {做什么}。

### 背景
{简要说明项目现状，重点是云端模型需要知道的上下文}

### 我们的核心结论
{已有的结论/共识，用表格或列表清晰呈现}

### 请求
**请帮我们 {具体请求}**，例如：
- 补充 3-5 个业界案例
- 指出我们结论的盲区
- 给出更好的表述方式

理想的输出特征：
- {特征1，如：知名公司/产品}
- {特征2，如：有公开数据}

可以考虑的方向（不限于）：
- {方向1}
- {方向2}

**额外请求**：
- 如果你觉得我们的结论有盲区，请指出
- 如果有更好的 {比喻/表述/方案}，欢迎建议
```

## 关键原则

| 原则 | 说明 |
|------|------|
| **自包含** | Part 1 必须让云端模型仅凭这段 prompt 就能理解全部上下文 |
| **结构化** | 用表格/列表呈现已有结论，便于云端模型快速理解 |
| **明确请求** | 说清楚要什么（案例/审阅/建议），不要让模型猜 |
| **留回填区** | Part 2 和 Part 3 结构清晰，方便后续操作 |
| **追溯链** | 文档放在 `project-research/`，关联到原始 thread |

## 常见错误

| 错误 | 修正 |
|------|------|
| Prompt 假设云端模型知道我们的项目 | 必须写明背景，不能省略 |
| 只丢问题不给上下文 | 先总结我们已有的结论，再请求补充 |
| 忘记创建回填区 | Part 2 和 Part 3 必须预留，结构化便于操作 |
| 本地猫直接用云端结论 | 必须 Step 3 对照 codebase 验证后再综合 |

## 文件命名规范

**独立咨询**（不属于某个研究课题）：
```
project-research/YYYY-MM-DD-{topic}-{model}-consult.md
```
例如：`2026-03-08-model-agent-platform-gpt-pro-consult.md`

**属于已有课题的咨询**：放进课题子目录
```
project-research/YYYY-MM-DD-{topic}/{model}-consult.md
```
例如：*(internal reference removed)*
