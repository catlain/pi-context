/**
 * 格式化器链集成测试 — 各工具格式化正确性 + 隔离性
 *
 * 验证：
 * 1. 各工具（web_search, web_read, gh_*）输出格式化正确
 * 2. 格式化器之间互不干扰
 * 3. 混合内容不误判
 */

import { describe, it, expect } from "vitest";
import { formatWebSearchResult, formatWebReadResult, formatGhResult } from "./formatters.js";
import { formatCodeGraphResult, sniffCodeGraph } from "./formatters-codegraph.js";

// ── 辅助 ──────────────────────────────────────────

function makeWebSearchJson(results: Array<{ title?: string; link?: string; content?: string }>): string {
	return JSON.stringify(JSON.stringify(results));
}

function makeWebReadJson(data: { title?: string; url?: string; content?: string }): string {
	return JSON.stringify(JSON.stringify(data));
}

function makeGhJson(data: unknown): string {
	return JSON.stringify(data);
}

// ═══════════════════════════════════════════════════

describe("各工具格式化正确性", () => {
	it("web_search: 编号列表", () => {
		const input = makeWebSearchJson([
			{ title: "Result 1", link: "https://a.com", content: "Summary A" },
			{ title: "Result 2", link: "https://b.com" },
		]);
		const r = formatWebSearchResult(input);
		expect(r).toContain("[1] Result 1");
		expect(r).toContain("https://a.com");
		expect(r).toContain("[2] Result 2");
	});

	it("web_search: 空结果", () => {
		expect(formatWebSearchResult(makeWebSearchJson([]))).toBe("搜索结果（共 0 条）");
	});

	it("web_read: 提取标题+URL+内容，过滤噪声", () => {
		const input = makeWebReadJson({
			title: "Test Page", url: "https://example.com", content: "Hello world",
			metadata: { foo: "bar" }, external: { css: "noise" },
		});
		const r = formatWebReadResult(input);
		expect(r).toContain("标题: Test Page");
		expect(r).toContain("Hello world");
		expect(r).not.toContain("metadata");
	});

	it("gh_search_doc: 格式化搜索结果", () => {
		const r = formatGhResult(makeGhJson({
			results: [{ title: "Issue 1", url: "https://github.com/issue/1", summary: "Fix bug" }],
		}));
		expect(r).toContain("[1] Issue 1");
		expect(r).toContain("Fix bug");
	});

	it("gh_read_file: 路径+内容", () => {
		const r = formatGhResult(makeGhJson({ path: "src/index.ts", content: "console.log('hi')" }));
		expect(r).toContain("文件: src/index.ts");
		expect(r).toContain("console.log('hi')");
	});

	it("gh_repo_structure: 树形", () => {
		const r = formatGhResult(makeGhJson({
			tree: [{ name: "src", type: "directory", children: [{ name: "index.ts", type: "file" }] }],
		}));
		expect(r).toContain("src/");
		expect(r).toContain("index.ts");
	});
});

// ═══════════════════════════════════════════════════

describe("格式化器隔离性", () => {
	// ── web/gh 输出不受 code-graph 影响 ────────────

	it("web_search 输出不被 code-graph 修改", () => {
		const webResult = formatWebSearchResult(makeWebSearchJson([
			{ title: "fn process result", link: "https://example.com", content: "A function" },
		]));
		expect(webResult).not.toBe(makeWebSearchJson([{ title: "fn process result", link: "https://example.com" }]));
		expect(formatCodeGraphResult(webResult)).toBe(webResult);
	});

	it("web_read 输出不被 code-graph 修改", () => {
		const webResult = formatWebReadResult(makeWebReadJson({
			title: "fn processToolResult docs", url: "https://docs.example.com",
			content: "fn processToolResult  extensions/context/core.ts:50-105\nDocs.",
		}));
		expect(formatCodeGraphResult(webResult)).toBe(webResult);
	});

	it("gh_search_doc 输出不被 code-graph 修改", () => {
		const ghResult = formatGhResult(makeGhJson({
			results: [{ title: "fn processToolResult  core.ts:50", url: "https://github.com", summary: "class DataStore  store.ts:10" }],
		}));
		expect(formatCodeGraphResult(ghResult)).toBe(ghResult);
	});

	it("gh_read_file 输出不被 code-graph 修改", () => {
		const ghResult = formatGhResult(makeGhJson({
			path: "src/main.ts", content: "fn processToolResult  extensions/context/core.ts:50-105",
		}));
		expect(formatCodeGraphResult(ghResult)).toBe(ghResult);
	});

	// ── code-graph 输出不受 web/gh 影响 ────────────

	it("code-graph search 不被 web_search 修改", () => {
		const input = "fn processToolResult  extensions/context/core.ts:50-105  ((x)) -> void\nclass DataStore  lib/storage.ts:10-200";
		expect(formatWebSearchResult(input)).toBe(input);
	});

	it("code-graph search 不被 web_read 修改", () => {
		const input = "fn processToolResult  extensions/context/core.ts:50-105  ((x)) -> void";
		expect(formatWebReadResult(input)).toBe(input);
	});

	it("code-graph search 不被 gh 修改", () => {
		const input = "fn processToolResult  extensions/context/core.ts:50-105  ((x)) -> void\nclass DataStore  lib/storage.ts:10-200";
		expect(formatGhResult(input)).toBe(input);
	});

	// ── 混合内容不误判 ────────────────────────────

	it("含 code-graph 关键词的 bash 不被格式化", () => {
		const input = "Running tests...\nfn not_a_real_symbol  just some output\nAll tests passed.";
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("含 code-graph 关键词的 JSON 不被格式化", () => {
		const input = JSON.stringify({
			results: [{ title: "fn processToolResult  core.ts:50", link: "https://x.com" }],
		});
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("web_search 双重编码 JSON 不被 code-graph 嗅探", () => {
		const input = makeWebSearchJson([
			{ title: "fn processToolResult  core.ts:50", link: "https://example.com" },
		]);
		expect(sniffCodeGraph(input)).toBe(false);
	});

	it("gh JSON 不被 code-graph 嗅探", () => {
		const input = makeGhJson({
			results: [{ title: "fn processToolResult  core.ts:50", url: "https://github.com" }],
		});
		expect(sniffCodeGraph(input)).toBe(false);
	});
});
