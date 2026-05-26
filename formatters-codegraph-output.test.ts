/**
 * 格式化器链集成测试 — code-graph 各种输出类型 + 边界情况
 *
 * 验证 code-graph 的 7 种工具输出都被正确处理，
 * 以及各种边界输入不会产生异常。
 */

import { describe, it, expect } from "vitest";
import { formatCodeGraphResult } from "./formatters-codegraph.js";

describe("code-graph 各输出类型", () => {
	// ── search_symbols ────────────────────────────

	it("search: 多种符号类型按优先级排序", () => {
		const input = [
			"var config  src/const.ts:1",
			"fn processA  src/a.ts:1-10",
			"class DataStore  src/store.ts:1-100",
			"interface IHandler  src/types.ts:5",
			"enum Status  src/enums.ts:1",
		].join("\n");
		const result = formatCodeGraphResult(input);
		const kinds = result.split("\n").filter(l => l.trim()).map(l => l.split(" ")[0]);
		expect(kinds).toEqual(["class", "interface", "enum", "fn", "var"]);
	});

	it("search: 保持符号名和位置信息", () => {
		const input = "fn processToolResult  extensions/context/core.ts:50-105  ((x)) -> void";
		const result = formatCodeGraphResult(input);
		expect(result).toContain("processToolResult");
		expect(result).toContain("extensions/context/core.ts:50-105");
		expect(result).toContain("((x)) -> void");
	});

	// ── get_call_graph ────────────────────────────

	it("callgraph: 保留完整调用链", () => {
		const input = [
			"processToolResult (extensions/context/tool-result-processor-core.ts)",
			"  ← called by: registerToolResultProcessor (extensions/context/tool-result-processor.ts) [function]",
			"  → calls: estimateTokens (extensions/context/distill-helpers.ts) [function]",
			"    → calls: countTokens (extensions/context/distill-helpers.ts) [function]",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("← called by");
		expect(result).toContain("→ calls");
		expect(result).toContain("estimateTokens");
		const lines = result.split("\n").filter(l => l.trim());
		expect(lines[0]).toContain("processToolResult");
	});

	// ── impact_analysis ───────────────────────────

	it("impact: 保留风险等级和统计", () => {
		const input = [
			"Impact: DataStore — Risk: HIGH",
			"  26 direct callers, 108 total, 49 files, 2 routes",
			"  → DataStore.new (lib/storage.ts:15) [constructor]",
			"  → DataStore.query (lib/storage.ts:30) [method]",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("Risk: HIGH");
		expect(result).toContain("26 direct callers");
		expect(result).toContain("108 total");
		expect(result).toContain("DataStore.new");
	});

	// ── find_references ───────────────────────────

	it("refs: 保留引用类型和位置", () => {
		const input = [
			"3 references to 'processToolResult':",
			"  [calls] registerToolResultProcessor (extensions/context/tool-result-processor.ts:19)",
			"  [exports] <module> (extensions/context/tool-result-processor-core.ts:1)",
			"  [imports] processToolResult (extensions/context/index.ts:2)",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("3 references");
		expect(result).toContain("[calls]");
		expect(result).toContain("[exports]");
		expect(result).toContain("[imports]");
	});

	// ── project_map ───────────────────────────────

	it("map: 保留模块结构", () => {
		const input = [
			"project_map",
			"",
			"extensions/context (108 nodes)",
			"  → lib/shared-utils",
			"  → lib/shepherd",
			"  fn processToolResult  core.ts:50-105",
			"  class DataStore  storage.ts:10-200",
			"",
			"lib/shared-utils (42 nodes)",
			"  fn parseMemoryFile  memory-parser.ts:1",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("extensions/context");
		expect(result).toContain("108 nodes");
		expect(result).toContain("→ lib/shared-utils");
	});

	// ── module_overview ───────────────────────────

	it("module_overview: 保留节点数和依赖", () => {
		const input = [
			"Module: extensions/context (108 nodes)",
			"  Depends on: lib/shared-utils, lib/shepherd",
			"  fn processToolResult  core.ts:50-105  ((x)) -> void",
			"  class DataStore  storage.ts:10-200",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("108 nodes");
		expect(result).toContain("Depends on");
		expect(result).toContain("processToolResult");
	});

	// ── dead_code ─────────────────────────────────

	it("dead_code: 保留分类和详情", () => {
		const input = [
			"Dead code: 74 results (19 orphan, 55 exported-unused)",
			"",
			"ORPHAN (19) — no references, not exported",
			"  method execute  extensions/payload-analyzer/index.ts:80 (47 lines)",
			"  const EXECUTOR_SYSTEM_PROMPT  extensions/plan-verify/index.ts:5 (2 lines)",
			"",
			"EXPORTED-UNUSED (55) — exported but not referenced within project",
			"  fn default  extensions/context/index.ts:1 (200 lines)",
		].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).toContain("74 results");
		expect(result).toContain("ORPHAN");
		expect(result).toContain("EXPORTED-UNUSED");
		expect(result).toContain("execute");
		expect(result).toContain("EXECUTOR_SYSTEM_PROMPT");
	});

	// ── 截断 ──────────────────────────────────────

	it("超长输出被截断并标注", () => {
		const lines = Array.from({ length: 300 }, (_, i) =>
			`fn func_${i}  src/file_${i}.ts:${i}-${i + 10}  ((x)) -> void`
		);
		const input = lines.join("\n");
		const result = formatCodeGraphResult(input);
		expect(result.split("\n").length).toBeLessThan(250);
		expect(result).toContain("more lines");
	});

	// ── 空行压缩 ──────────────────────────────────

	it("连续空行被压缩", () => {
		const input = ["fn foo  src/a.ts:1-10", "", "", "", "", "fn bar  src/b.ts:1-10"].join("\n");
		const result = formatCodeGraphResult(input);
		expect(result).not.toMatch(/\n{3,}/);
		expect(result).toContain("foo");
		expect(result).toContain("bar");
	});
});

// ═══════════════════════════════════════════════════

describe("边界情况", () => {
	it("空字符串", () => {
		expect(formatCodeGraphResult("")).toBe("");
	});

	it("单行非 code-graph", () => {
		expect(formatCodeGraphResult("hello world")).toBe("hello world");
	});

	it("非 code-graph 的 grep 输出", () => {
		const input = "src/file.ts:10:function foo() {\nsrc/other.ts:20:const bar = 1;";
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("非 code-graph 的 payload 分析输出", () => {
		const input = "Token budget: 8000\n  System: 2000\n  Tools: 1500\n  History: 4500";
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("非 code-graph 的 vitest 输出", () => {
		const input = " ✓ extensions/context/formatters.test.ts (12 tests) 15ms\n ✗ extensions/context/broken.ts (1 test) 5ms";
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("非 code-graph 的 git diff 输出", () => {
		const input = "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,5 +1,6 @@\n-fn old() {\n+fn new() {";
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("非 code-graph 的 session 分析输出", () => {
		const input = "Session: abc-123\n  Tool calls: 15\n  Files modified: 3\n  Duration: 5m 30s";
		expect(formatCodeGraphResult(input)).toBe(input);
	});
});
