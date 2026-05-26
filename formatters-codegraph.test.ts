/**
 * code-graph 工具结果格式化器测试
 *
 * 格式化器职责：嗅探识别、搜索排序、截断、空行压缩。
 */

import { describe, it, expect } from "vitest";
import { formatCodeGraphResult, sniffCodeGraph } from "./formatters-codegraph.js";

// ── 嗅探：确认 code-graph 输出被识别 ───────────────

describe("sniffCodeGraph — 嗅探", () => {
	it("search 格式（fn 声明）", () => {
		expect(sniffCodeGraph("fn processToolResult  extensions/context/core.ts:50-105  ((x)) -> void")).toBe(true);
	});
	it("class 声明", () => {
		expect(sniffCodeGraph("class DataStore  lib/storage.ts:10-200")).toBe(true);
	});
	it("callgraph 缩进箭头", () => {
		expect(sniffCodeGraph("myFunc (src/main.ts)\n  ← called by: otherFunc (src/other.ts) [function]")).toBe(true);
	});
	it("Impact 行", () => {
		expect(sniffCodeGraph("Impact: MyFunc — Risk: HIGH\n  10 direct callers")).toBe(true);
	});
	it("references 行", () => {
		expect(sniffCodeGraph("3 references to 'MyFunc':")).toBe(true);
	});
	it("Module overview 行", () => {
		expect(sniffCodeGraph("Module: extensions/context (108 nodes)\n  fn processToolResult  extensions/context/core.ts:50-105")).toBe(true);
	});
	it("Dead code 行", () => {
		expect(sniffCodeGraph("Dead code: 10 results (5 orphan, 5 exported-unused)")).toBe(true);
	});
	it("普通文本不嗅探", () => {
		expect(sniffCodeGraph("这是一段普通输出\nline 2")).toBe(false);
	});
	it("bash 输出不嗅探", () => {
		expect(sniffCodeGraph("drwxr-xr-x  2 user group 4096 Jan 1 .\n-rw-r--r--  1 user group 123 Jan 1 file.ts")).toBe(false);
	});
	it("JSON 不嗅探", () => {
		expect(sniffCodeGraph(JSON.stringify({ title: "Test", url: "https://x.com" }))).toBe(false);
	});
});

// ── 回退：非 code-graph 输出原样返回 ────────────────

describe("formatCodeGraphResult — 回退", () => {
	it("空字符串 → 原样返回", () => {
		expect(formatCodeGraphResult("")).toBe("");
	});
	it("非 code-graph 输出 → 原样返回", () => {
		const input = "这是一段普通的 bash 输出\nline 2\nline 3";
		expect(formatCodeGraphResult(input)).toBe(input);
	});
	it("web_read JSON → 原样返回（不误判）", () => {
		const input = JSON.stringify({ title: "Test", url: "https://x.com", content: "hello" });
		expect(formatCodeGraphResult(input)).toBe(input);
	});
	it("gh CLI 输出 → 原样返回（不误判）", () => {
		const input = "issue\t1\tOpen\tBug title";
		expect(formatCodeGraphResult(input)).toBe(input);
	});
});

// ── 搜索结果排序 ─────────────────────────────────

describe("formatCodeGraphResult — 搜索排序", () => {
	it("class 排在 fn 前面", () => {
		const input = [
			"fn processA  src/a.ts:1-10",
			"class DataStore  src/store.ts:1-100",
			"fn processB  src/b.ts:1-10",
			"var config  src/const.ts:1",
		].join("\n");

		const result = formatCodeGraphResult(input);
		const lines = result.split("\n").filter((l) => l.trim());

		// class 应该排在 fn 前面
		const classIdx = lines.findIndex((l) => l.startsWith("class "));
		const fnIdx = lines.findIndex((l) => l.startsWith("fn "));
		expect(classIdx).toBeLessThan(fnIdx);

		// fn 应该排在 var 前面
		const varIdx = lines.findIndex((l) => l.startsWith("var "));
		expect(fnIdx).toBeLessThan(varIdx);
	});
});

// ── 截断 ─────────────────────────────────────────

describe("formatCodeGraphResult — 截断", () => {
	it("超过 200 行时截断并提示", () => {
		const lines = Array.from({ length: 300 }, (_, i) =>
			`fn func_${i}  src/file_${i}.ts:${i}-${i + 10}  ((x)) -> void`
		);
		const input = lines.join("\n");

		const result = formatCodeGraphResult(input);
		const resultLines = result.split("\n");
		expect(resultLines.length).toBeLessThan(300);
		expect(result).toContain("...");
		expect(result).toContain("more lines");
	});
});

// ── 空行压缩 ─────────────────────────────────────

describe("formatCodeGraphResult — 空行压缩", () => {
	it("连续 3+ 空行压缩为 1 个空行", () => {
		const input = [
			"fn foo  src/a.ts:1-10",
			"",
			"",
			"",
			"fn bar  src/b.ts:1-10",
		].join("\n");

		const result = formatCodeGraphResult(input);
		// 不应有连续 2 个空行
		expect(result).not.toMatch(/\n{3,}/);
	});
});

// ── 各输出类型内容保持 ────────────────────────────

describe("formatCodeGraphResult — 内容保持", () => {
	it("callgraph 输出保留关键信息", () => {
		const input = [
			"processToolResult (extensions/context/tool-result-processor-core.ts)",
			"  ← called by: registerToolResultProcessor (extensions/context/tool-result-processor.ts) [function]",
			"  → calls: estimateTokens (extensions/context/distill-helpers.ts) [function]",
		].join("\n");

		const result = formatCodeGraphResult(input);
		expect(result).toContain("processToolResult");
		expect(result).toContain("registerToolResultProcessor");
		expect(result).toContain("estimateTokens");
		expect(result).toContain("← called by");
		expect(result).toContain("→ calls");
	});

	it("impact 输出保留风险信息", () => {
		const input = [
			"Impact: processToolResult — Risk: LOW",
			"  1 direct callers, 2 total, 2 files, 0 routes",
		].join("\n");

		const result = formatCodeGraphResult(input);
		expect(result).toContain("Risk: LOW");
		expect(result).toContain("1 direct callers");
	});

	it("refs 输出保留引用类型", () => {
		const input = [
			"3 references to 'processToolResult':",
			"  [calls] registerToolResultProcessor (extensions/context/tool-result-processor.ts:19)",
			"  [exports] <module> (extensions/context/tool-result-processor-core.ts:1)",
		].join("\n");

		const result = formatCodeGraphResult(input);
		expect(result).toContain("3 references");
		expect(result).toContain("[calls]");
		expect(result).toContain("[exports]");
	});

	it("map 输出保留模块信息", () => {
		const input = [
			"Module: extensions/context (108 nodes)",
			"  fn processToolResult  extensions/context/core.ts:50-105",
			"  class DataStore  lib/storage.ts:10-200",
		].join("\n");

		const result = formatCodeGraphResult(input);
		expect(result).toContain("extensions/context");
		expect(result).toContain("108 nodes");
		expect(result).toContain("processToolResult");
	});

	it("dead-code 输出保留分类信息", () => {
		const input = [
			"Dead code: 74 results (19 orphan, 55 exported-unused)",
			"",
			"ORPHAN (19) — no references, not exported",
			"  method execute extensions/payload-analyzer/index.ts:80 (47 lines)",
		].join("\n");

		const result = formatCodeGraphResult(input);
		expect(result).toContain("74 results");
		expect(result).toContain("ORPHAN");
		expect(result).toContain("execute");
	});
});
