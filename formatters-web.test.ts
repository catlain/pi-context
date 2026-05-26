/**
 * formatters.ts 单元测试（网页相关）
 *
 * 覆盖：formatWebReadResult, formatWebSearchResult
 */

import { describe, it, expect } from "vitest";
import { formatWebReadResult, formatWebSearchResult } from "./formatters.js";

// ── formatWebReadResult ────────────────────────────

describe("formatWebReadResult", () => {
	it("提取 title+url+content，去掉 metadata 和 external", () => {
		const raw = JSON.stringify({
			title: "测试网页标题",
			url: "https://example.com/test",
			content: "这是网页正文内容。",
			metadata: { "og:title": "噪声" },
			external: { stylesheet: { "/style.css": {} } },
		});
		const result = formatWebReadResult(raw);
		expect(result).toContain("标题: 测试网页标题");
		expect(result).toContain("URL: https://example.com/test");
		expect(result).toContain("这是网页正文内容。");
		expect(result).not.toContain("og:title");
		expect(result).not.toContain("stylesheet");
	});

	it("content 超过上限时按段落边界截断", () => {
		const longContent = "A".repeat(16000) + "\n\n" + "B".repeat(5000);
		const raw = JSON.stringify({
			title: "长文",
			url: "https://example.com/long",
			content: longContent,
		});
		const result = formatWebReadResult(raw);
		expect(result).toContain("...(内容已截断");
		expect(result).not.toContain("BBBBB");
	});

	it("content 为空字符串", () => {
		const raw = JSON.stringify({ title: "空页", url: "https://x.com", content: "" });
		const result = formatWebReadResult(raw);
		expect(result).toContain("标题: 空页");
		expect(result).toContain("URL: https://x.com");
		expect(result.split("\n").length).toBe(2);
	});

	it("缺少 content 字段时不崩溃", () => {
		const raw = JSON.stringify({ title: "无内容", url: "https://x.com" });
		const result = formatWebReadResult(raw);
		expect(result).toContain("标题: 无内容");
		expect(result).toContain("URL: https://x.com");
	});

	it("缺少 title 字段时不崩溃", () => {
		const raw = JSON.stringify({ url: "https://x.com", content: "正文" });
		const result = formatWebReadResult(raw);
		expect(result).toContain("URL: https://x.com");
		expect(result).toContain("正文");
	});

	it("非 JSON 输入返回原始文本", () => {
		const raw = "this is not json";
		expect(formatWebReadResult(raw)).toBe(raw);
	});

	it("双重编码解包后正确格式化", () => {
		const inner = JSON.stringify({ title: "双层", url: "https://e.com", content: "内容" });
		const raw = JSON.stringify(inner);
		const result = formatWebReadResult(raw);
		expect(result).toContain("标题: 双层");
		expect(result).toContain("内容");
	});

	it("无有效字段时返回原始文本", () => {
		const raw = JSON.stringify({ metadata: { og: "x" } });
		const result = formatWebReadResult(raw);
		expect(result).toBe(raw);
	});
});

// ── formatWebSearchResult ──────────────────────────

describe("formatWebSearchResult", () => {
	it("格式化搜索结果", () => {
		const raw = JSON.stringify([
			{ title: "结果1", link: "https://a.com", content: "摘要1" },
			{ title: "结果2", link: "https://b.com", content: "摘要2" },
		]);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("搜索结果（共 2 条）");
		expect(result).toContain("[1] 结果1");
		expect(result).toContain("URL: https://a.com");
		expect(result).toContain("摘要1");
		expect(result).toContain("[2] 结果2");
	});

	it("超过 8 条时只显示前 8 条", () => {
		const results = Array.from({ length: 12 }, (_, i) => ({
			title: `结果${i + 1}`,
			link: `https://${i}.com`,
			content: `摘要${i + 1}`,
		}));
		const raw = JSON.stringify(results);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("共 12 条");
		expect(result).toContain("显示前 8 条");
		expect(result).toContain("[8]");
		expect(result).not.toContain("[9]");
	});

	it("空数组返回 0 条提示", () => {
		const result = formatWebSearchResult("[]");
		expect(result).toContain("共 0 条");
	});

	it("结果缺少 link 字段时不崩溃", () => {
		const raw = JSON.stringify([{ title: "无链接", content: "摘要" }]);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("[1] 无链接");
		expect(result).toContain("URL: ");
	});

	it("结果缺少 title 字段时不崩溃", () => {
		const raw = JSON.stringify([{ link: "https://x.com", content: "摘要" }]);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("URL: https://x.com");
	});

	it("结果缺少 content 字段时省略摘要行", () => {
		const raw = JSON.stringify([{ title: "无摘要", link: "https://x.com" }]);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("[1] 无摘要");
		expect(result).toContain("URL: https://x.com");
	});

	it("非数组 JSON 返回原始文本", () => {
		const raw = JSON.stringify({ not: "array" });
		expect(formatWebSearchResult(raw)).toBe(raw);
	});

	it("非 JSON 输入返回原始文本", () => {
		const raw = "broken {json";
		expect(formatWebSearchResult(raw)).toBe(raw);
	});

	it("双重编码解包后正确格式化", () => {
		const inner = JSON.stringify([{ title: "双层结果", link: "https://d.com", content: "摘要" }]);
		const raw = JSON.stringify(inner);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("[1] 双层结果");
		expect(result).toContain("https://d.com");
	});

	// ── 交叉匹配防护（回归测试） ───────────────────────

	it("outline 数据（无 link/title）不应被 formatWebSearchResult 匹配", () => {
		const raw = JSON.stringify([
			{ name: "hello", kind: "function", startLine: 1, endLine: 42 },
			{ name: "main", kind: "class", startLine: 50, endLine: 120 },
		]);
		const result = formatWebSearchResult(raw);
		// 应返回原文，不应输出 "搜索结果" / "URL:" 等误导格式
		expect(result).toBe(raw);
	});

	it("refs/callees 数据（无 link/title）不应被 formatWebSearchResult 匹配", () => {
		const raw = JSON.stringify([
			{ target_name: "fnA", kind: "function", file_path: "src/a.ts", line: 10 },
			{ target_name: "fnB", kind: "method", file_path: "src/b.ts", line: 20 },
		]);
		const result = formatWebSearchResult(raw);
		expect(result).toBe(raw);
	});

	it("无 link/title 的任意 JSON 数组不应被匹配", () => {
		const raw = JSON.stringify([
			{ foo: 1, bar: 2 },
			{ foo: 3, bar: 4 },
		]);
		expect(formatWebSearchResult(raw)).toBe(raw);
	});

	it("混合数组（部分有 link）仍被正确格式化", () => {
		const raw = JSON.stringify([
			{ title: "有效结果", link: "https://a.com", content: "摘要" },
			{ foo: 1, bar: 2 }, // 无 web_search 字段的条目
		]);
		const result = formatWebSearchResult(raw);
		expect(result).toContain("搜索结果（共 2 条）");
		expect(result).toContain("[1] 有效结果");
		expect(result).toContain("URL: https://a.com");
	});
});
