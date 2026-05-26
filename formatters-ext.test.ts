/**
 * formatters.ts 单元测试（扩展部分）
 *
 * 覆盖：formatGhResult
 */

import { describe, it, expect } from "vitest";
import { formatGhResult } from "./formatters.js";

// ── formatGhResult ─────────────────────────────────

describe("formatGhResult", () => {
	it("gh_search_doc JSON 格式化为编号列表", () => {
		const raw = JSON.stringify({
			results: [
				{ title: "Doc1", url: "https://github.com/docs/1", summary: "第一个文档" },
				{ title: "Doc2", url: "https://github.com/docs/2", summary: "第二个文档" },
			],
		});
		const result = formatGhResult(raw);
		expect(result).toContain("[1] Doc1");
		expect(result).toContain("https://github.com/docs/1");
		expect(result).toContain("第一个文档");
		expect(result).toContain("[2] Doc2");
	});

	it("gh_read_file JSON 格式化为文件路径+内容", () => {
		const raw = JSON.stringify({ content: "文件内容", path: "src/main.ts" });
		const result = formatGhResult(raw);
		expect(result).toContain("src/main.ts");
		expect(result).toContain("文件内容");
	});

	it("gh_repo_structure JSON 格式化为缩进树形", () => {
		const raw = JSON.stringify({
			tree: [
				{ name: "src", type: "directory", children: [
					{ name: "index.ts", type: "file" },
				]},
				{ name: "README.md", type: "file" },
			],
		});
		const result = formatGhResult(raw);
		expect(result).toContain("src/");
		expect(result).toContain("  index.ts");
		expect(result).toContain("README.md");
	});

	it("非 JSON 输入 fallback 返回原始文本", () => {
		const raw = "this is not json";
		expect(formatGhResult(raw)).toBe(raw);
	});

	it("空结果数组正确格式化", () => {
		const raw = JSON.stringify({ results: [] });
		const result = formatGhResult(raw);
		expect(result).toContain("共 0 条");
	});

	it("未知结构 JSON 返回原始文本", () => {
		const raw = JSON.stringify({ foo: "bar", baz: 123 });
		const result = formatGhResult(raw);
		expect(result).toBe(raw);
	});

	it("gh_search_doc 无 results 字段时返回原始文本", () => {
		const raw = JSON.stringify({ other: "data" });
		const result = formatGhResult(raw);
		expect(result).toBe(raw);
	});

	it("gh_read_file 无 content 字段时仍显示路径", () => {
		const raw = JSON.stringify({ path: "file.ts" });
		const result = formatGhResult(raw);
		expect(result).toContain("file.ts");
	});

	it("gh_repo_structure 空 tree 返回原始文本", () => {
		const raw = JSON.stringify({ tree: [] });
		const result = formatGhResult(raw);
		expect(result).toBe(raw);
	});

	// 回归：MCP web_reader 结果是双重编码 JSON，JSON.parse 后是字符串
	// 旧代码 "path" in parsed 会对字符串抛 TypeError
	it("JSON.parse 返回字符串时不抛异常", () => {
		const raw = JSON.stringify(JSON.stringify({ url: "https://example.com", content: "HTML content" }));
		// 不应抛异常
		const result = formatGhResult(raw);
		expect(typeof result).toBe("string");
	});

	it("web_read 格式数据（url+content）不应被 formatGhResult 匹配", () => {
		const raw = JSON.stringify({ url: "https://example.com", content: "Page title\nSome content" });
		const result = formatGhResult(raw);
		// web_read 数据没有 path 字段，不应被 gh_read_file 分支匹配
		expect(result).toBe(raw);
	});

	it("web_read 格式数据（title+url+content）不应被 formatGhResult 匹配", () => {
		const raw = JSON.stringify({ title: "简短标题", url: "https://example.com", content: "简短正文" });
		const result = formatGhResult(raw);
		expect(result).toBe(raw);
	});

	it("gh_read_file 只有 content 没有 path 时返回原文（无 path 不是 gh 数据）", () => {
		const raw = JSON.stringify({ content: "一些内容" });
		const result = formatGhResult(raw);
		expect(result).toBe(raw);
	});
});
