# 低覆盖率文件分析报告

> 基于覆盖率报告和源码分析，列出每个文件中未被测试覆盖的导出函数/方法及其功能简述。

---

## 1. `clean.ts` — 覆盖率 0%（第 9-63 行）

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `listSessionData()` | 19 | `() => { sessionId: string; sizeMB: number }[]` | 枚举所有会话数据，返回会话ID和大小（MB） | 测试中 mock 为 `[]` |
| `cleanContextData(sessionId?)` | 33 | `(sessionId?: string) => { cleaned: number; freedMB: number }` | 清理指定会话或全部 distill 持久化数据。无参时：清理全部会话目录 + processor 目录 + 缓存文件 | 测试中 mock 为 `{ cleaned: 0, freedMB: 0 }` |

### 未覆盖的内部函数

| 函数 | 行号 | 功能简述 |
|------|------|---------|
| `dirSizeBytes(dir)` | 8 | 递归计算目录大小（字节），错误静默忽略 |

### 现状

`listSessionData()` 和 `cleanContextData()` 在 `index.events.test.ts` 和 `index-events-recording.test.ts` 中被 mock，从未以真实文件系统运行。**核心逻辑（枚举、递归统计、清理）完全未测试。**

---

## 2. `formatters.ts` — 覆盖率 0%（第 33-62 行）

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `formatBashResult(text)` | 31 | `(text: string) => string` | bash 结果透传（原样返回） | **实为已覆盖**：`formatters.test.ts` 测试了此函数。覆盖率报告标注可能有误——函数体在第 31-33 行，不在 33-62 范围内 |
| `formatMcpError(text)` | 39 | `(text: string) => string` | 格式化 MCP 错误。提取 `MCP error N: message` 格式，尝试解析 JSON 错误详情 | ⚠️ **死代码**：此函数已在 `formatters-errors.ts` 中有改进版本且被独立测试。`formatters.ts` 中的版本无人引用 |

### 结论

第 33-62 行的未覆盖代码完全对应 **`formatMcpError` 的残留旧实现**。建议：
- ❌ 确认无人引用后，从 `formatters.ts` 中删除旧 `formatMcpError`
- ✅ 现有的新实现在 `formatters-errors.ts` 已被 `tests/formatters-errors.test.ts` 充分覆盖

---

## 3. `payload/files-core.ts` — 覆盖率 10%（第 40-64, 73-119 行）

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `listSessions()` | 34 | `() => SessionInfo[]` | 枚举 `RECORDINGS_DIR` 下所有会话目录，读取每个会话的 `req-*.json` 文件，统计文件数、总大小、第一/最后时间戳、模型名 | 测试中 mock 为 `[]` |
| `listRecordings(sessionId?)` | 95 | `(sessionId?: string) => RecordingFile[]` | 枚举录制文件，支持按 sessionId 过滤。带 sessionId 时只查子目录，不传参时汇总所有会话 + 兼容旧版扁平目录 | 测试中 mock 为 `[]` |

### 未覆盖的内部函数

| 函数 | 行号 | 功能简述 |
|------|------|---------|
| `collectRecordingFiles(dir, sessionId)` | 80 | 递归收集目录中的 `req-*.json` 文件，解析 JSON 获取 msgCount、model 等元数据，错误时容错返回 |

### 现状

**完全被 mock，无真实文件系统测试。** 所有核心逻辑（排序、统计、兼容旧版扁平目录、模型名提取）均未验证。

---

## 4. `payload/files.ts` — 覆盖率 14.28%（第 39-44, 60-107 行）

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `listRecordingFiles(dir)` | 22 | `(dir: string) => RecordingEntry[] \| null` | 列出指定目录下的 `req-*.json` 文件，排序后返回文件名+路径 | |
| `getRecordingFiles(sessionId?)` | 32 | `(sessionId?: string) => RecordingEntry[] \| null` | 按 sessionId 获取录制文件列表。支持会话子目录 + 汇总所有会话 + 旧版扁平目录兼容 | |
| `collectTimeline(files)` | 59 | `(files: RecordingEntry[]) => Map<string, TimelineEntry[]>` | 按 argsSig 跨 payload 追踪——相同工具+参数在多轮请求中的调用历史 | |
| `collectTimelineByTcId(files)` | 85 | `(files: RecordingEntry[]) => Map<string, TimelineEntry[]>` | 按 toolCallId 追踪——同一 tcId 在多轮请求中的出现情况 | |

### 未覆盖的导出类型

| 类型 | 说明 |
|------|------|
| `RecordingEntry` | 文件列表条目（filename + path） |
| `TimelineEntry` | 时间线条目（req, idx, status, tokens, preview） |

### 现状

`getRecordingFiles`、`collectTimeline`、`collectTimelineByTcId` 在 `tests/payload/analyze-chain.test.ts` 和 `tests/payload/analyze-stats-single.test.ts` 中被 mock 或重新实现。**真实实现从未被直接测试。** `listRecordingFiles`（基本文件枚举函数）也未被测试。

---

## 5. `formatters-gh.ts` — 覆盖率 21.95%

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `formatGhResult(text)` | 107 | `(text: string) => string` | GH 系列工具结果格式化主入口。嗅探三种结构：`gh_read_file`（有 path）、`gh_search_doc`（有 results）、`gh_repo_structure`（有 tree） | ⚠️ **从 `formatters.ts` 导入的版本已被测试**，但此文件本身的实现覆盖率仅 ~22% |

### 未覆盖的内部函数

| 函数 | 行号 | 功能简述 |
|------|------|---------|
| `formatGhSearchDoc(data)` | 24 | 格式化搜索结果数组→编号列表 |
| `formatGhReadFile(data)` | 36 | 格式化文件读取结果→"文件: path\n\ncontent" |
| `formatGhTree(entries, indent)` | 48 | 递归格式化目录树→缩进列表 |
| `formatGhRepoStructure(data)` | 66 | 格式化仓库结构→树形 |

### 现状

`formatGhResult` 的多种分支（无 content 的 read file、空 tree、混合结构）可能在 `formatters-ext.test.ts` 中已有覆盖，但 `formatters-gh.ts` 内部各 `formatGh*` 辅助函数本身未被直接测试。覆盖率 21.95% 说明大部分分支路径已覆盖但仍有一些遗漏。

---

## 6. `payload/metrics.ts` — 覆盖率 9.67%

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `doBudget(sessionId?)` | 18 | `(sessionId?: string) => string` | Token 预算分析。遍历所有录制文件，按请求统计 System/Tools/History/Total tokens，输出表格 + 合计 | ❌ 完全未测试 |
| `doGrowth(sessionId?)` | 73 | `(sessionId?: string) => string` | 上下文增长趋势。逐请求统计 token 增长量、增量、大跳变检测 | ❌ 完全未测试 |

### 已覆盖的再导出

| 函数 | 来源 | 测试位置 |
|------|------|---------|
| `doExpensive(files, topN?)` | `./expensive.ts` | `tests/payload/expensive.test.ts` ✅ |

### 现状

`doBudget` 和 `doGrowth` 是 `payload_analyze` 工具的 budget/growth 子命令处理函数，**完全无测试**。它们依赖 `getRecordingFiles` 和 `readJsonFile`（mock 可解），核心是格式化逻辑（表格渲染、统计计算、大跳变检测）。

---

## 7. `shared.ts` — 覆盖率 29.31%

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `fillTemplate(template, vars)` | 52 | `(template: string, vars: Record<string, string>) => string` | 替换模板中的 `{key}` 占位符 | 纯函数，易测 |
| `getContextConfig()` | 76 | `() => ContextConfig` | 从 settings 读取 context 配置 | 委托 shared-utils |
| `setContextConfig(patch)` | 79 | `(patch: Partial<ContextConfig>) => ContextConfig` | 写入 context 配置到 settings | 委托 shared-utils |
| `readCachedMessages()` | 93 | `() => any[]` | 从文件缓存读取最后 context messages | 文件 IO |
| `writeCachedMessages(msgs)` | 102 | `(msgs: any[]) => void` | 写入 context messages 到文件缓存 | 文件 IO |
| `readCachedPayload()` | 111 | `() => any` | 读取缓存的 provider payload | 文件 IO |
| `saveManifest(sessionId, opts)` | 137 | `(sessionId: string, opts: { ... }) => void` | 持久化 manifest（distilled map + 删除记录） | 文件 IO |
| `loadManifest(sessionId, opts)` | 148 | `(sessionId: string, opts: { ... }) => void` | 从文件恢复 manifest 到运行时状态 | 文件 IO |

### 未覆盖的导出值

| 符号 | 类型 | 说明 |
|------|------|------|
| `DISTILL_DIR` | `string` | 持久化根目录 |
| `MSG_CACHE` | `string` | last-messages.json 路径 |
| `PAYLOAD_CACHE` | `string` | last-payload.json 路径 |
| `hintsConfig` | `HintsConfig` | 从 hints.json 加载的模板配置 |
| `distilledMap` | `Map<string, DistillEntry>` | 运行时蒸馏条目映射 |

### 未覆盖的导出类型

| 类型 | 说明 |
|------|------|
| `HintsConfig` | 6 个提示模板字符串 |
| `ContextConfig` | distillThreshold, agingThreshold, processorThreshold, firstSeenCap |
| `DistillEntry` | toolName, meta, tokens, distilledAt |

### 现状

- 配置读写函数（`getContextConfig`/`setContextConfig`）依赖 shared-utils 的 mock，核心逻辑在委托层
- 文件缓存函数（`readCachedMessages`/`writeCachedMessages`/`readCachedPayload`）需 mock fs
- `saveManifest`/`loadManifest` 涉及多状态同步（distilledMap + manuallyDeleted + agingDeleted + agingCounts），**需边界测试**
- `fillTemplate` 是纯函数，新增测试成本极低
- 模块顶层的 `loadHintsConfig()` 执行路径从未被测试

---

## 8. `recording.ts` — 覆盖率 18.18%

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `isRecording()` | 10 | `() => boolean` | 返回当前录制状态 | 模块级闭包变量 |
| `setRecording(v)` | 14 | `(v: boolean) => boolean` | 设置录制开关，返回新状态 | |
| `cleanRecordings()` | 18 | `() => number` | 清空 `RECORDINGS_DIR` 目录下所有文件/目录，返回清理数 | 文件 IO |

### 未覆盖的导出值

| 符号 | 说明 |
|------|------|
| `RECORDINGS_DIR` | 录制文件存储目录 |

### 现状

**录制状态机完全无直接测试。** `isRecording`/`setRecording` 是纯状态管理（无需 mock），`cleanRecordings` 需 mock fs。状态机对集成测试（如 `before_provider_request` handler 中调用 `isRecording()`）关键但本身未测试。

---

## 9. `commands.ts` — 覆盖率 40%

### 未覆盖的导出函数

| 函数 | 行号 | 签名 | 功能简述 | 备注 |
|------|------|------|---------|------|
| `registerRecordCommand(pi)` | 10 | `(pi: ExtensionAPI) => void` | 注册 `/record` 命令——切换 on/off、清理旧文件、通知 | handler 逻辑（on/off 切换 + 清理）未单独测试 |
| `registerContextCleanCommand(pi)` | 48 | `(pi: ExtensionAPI) => void` | 注册 `/context-clean` 命令——清理指定会话或全部 | handler 逻辑（会话枚举、清理、通知）未单独测试 |
| `registerDistillConfigCommand(pi)` | 84 | `(pi: ExtensionAPI) => void` | 注册 `/distill-config` 命令——查看/设置阈值 | handler 逻辑（--cap 解析、数值验证）未单独测试 |
| `registerAgingConfigCommand(pi)` | 124 | `(pi: ExtensionAPI) => void` | 注册 `/aging-config` 命令——查看/设置 aging 阈值 | handler 逻辑（off 特殊值、整数验证）未单独测试 |
| `registerProcessorConfigCommand(pi)` | 159 | `(pi: ExtensionAPI) => void` | 注册 `/processor-config` 命令——查看/设置 processor 阈值 | handler 逻辑（off/0 特殊值、正数验证）未单独测试 |

### 现状

所有 5 个 command 注册函数在 `index.ts` 中被调用，但它们的 **handler 回调逻辑**从未被独立单元测试。现有 40% 覆盖率可能来自 `index.test.ts` 的基础验证（注册不抛异常）。

每个 handler 涉及：
- 参数解析（`/record on|off`、`/distill-config --cap N`、`/aging-config off` 等）
- 输入验证（正整数、非负整数、`NaN` 检测）
- `ctx.ui.notify` 调用
- 配置写入/读取
- 文件系统操作

---

## 优先级建议

| 优先级 | 文件 | 理由 |
|--------|------|------|
| 🔴 P0 | `clean.ts` | 0% 覆盖，涉及文件系统删除操作，风险最高 |
| 🔴 P0 | `payload/metrics.ts` | 两个导出函数全未测试（doBudget / doGrowth），是 `payload_analyze` 工具的核心功能 |
| 🟡 P1 | `payload/files-core.ts` | 10% 覆盖，全 mock，核心枚举逻辑未验证 |
| 🟡 P1 | `payload/files.ts` | 14.28% 覆盖，时间线追踪逻辑被 mock/重复实现 |
| 🟡 P1 | `shared.ts` | 29.31% 覆盖，`saveManifest`/`loadManifest` 有状态同步风险 |
| 🟢 P2 | `recording.ts` | 状态管理 + 简单文件清理，但未被任何测试验证 |
| 🟢 P2 | `commands.ts` | 40% 覆盖，handler 逻辑较多但覆盖已有基础 |
| 🔵 P3 | `formatters-gh.ts` | 21.95% 但核心功能从 `formatters.ts` 被测试 |
| ⚪ P4 | `formatters.ts` | 未覆盖代码是死代码（旧 `formatMcpError`），建议删除而非测试 |
