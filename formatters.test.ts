/**
 * formatters.ts 单元测试（基础格式化）
 *
 * 覆盖：unwrapDoubleEncodedJson, truncateAtParagraph, formatBashResult
 */

import { describe, it, expect } from "vitest";
import {
	unwrapDoubleEncodedJson,
	truncateAtParagraph,
	formatBashResult,
} from "./formatters.js";

// ── unwrapDoubleEncodedJson ────────────────────────

describe("unwrapDoubleEncodedJson", () => {
	it("解包双重编码的 JSON 对象", () => {
		const raw = JSON.stringify(JSON.stringify({ title: "test" }));
		expect(unwrapDoubleEncodedJson(raw)).toBe(JSON.stringify({ title: "test" }));
	});

	it("解包双重编码的 JSON 数组", () => {
		const raw = JSON.stringify(JSON.stringify([{ title: "a" }]));
		expect(unwrapDoubleEncodedJson(raw)).toBe(JSON.stringify([{ title: "a" }]));
	});

	it("非双重编码时原样返回", () => {
		const raw = JSON.stringify({ title: "test" });
		expect(unwrapDoubleEncodedJson(raw)).toBe(raw);
	});

	it("非 JSON 文本原样返回", () => {
		expect(unwrapDoubleEncodedJson("hello")).toBe("hello");
	});

	it("空字符串原样返回", () => {
		expect(unwrapDoubleEncodedJson("")).toBe("");
	});
});

// ── truncateAtParagraph ────────────────────────────

describe("truncateAtParagraph", () => {
	it("不截断短文本", () => {
		expect(truncateAtParagraph("hello", 100)).toBe("hello");
	});

	it("在段落边界截断", () => {
		const text = "A".repeat(8000) + "\n\n" + "B".repeat(8000);
		const result = truncateAtParagraph(text, 10000);
		expect(result.endsWith(`...(内容已截断，共 ${text.length} 字符)`)).toBe(true);
		expect(result.includes("BBBBB")).toBe(false);
	});

	it("无段落边界时硬截断", () => {
		const text = "A".repeat(20000);
		const result = truncateAtParagraph(text, 10000);
		expect(result.includes("...(内容已截断")).toBe(true);
		expect(result.length).toBeLessThan(10100);
	});

	it("刚好不超过时完整返回", () => {
		expect(truncateAtParagraph("short", 15000)).toBe("short");
	});

	it("段落边界在限制的前半段时仍正确截断", () => {
		const text = "short first\n\n" + "B".repeat(10000);
		const result = truncateAtParagraph(text, 8000);
		expect(result.includes("...(内容已截断")).toBe(true);
		expect(result.includes("short first")).toBe(true);
		expect(result.includes("BBBBB")).toBe(false);
	});

	it("段落边界恰好在限制位置时完整保留", () => {
		const part1 = "A".repeat(5000);
		const text = part1 + "\n\n" + "B".repeat(500);
		const result = truncateAtParagraph(text, 5100);
		expect(result).toBe(text);
	});
});

// ── formatBashResult ───────────────────────────────

describe("formatBashResult", () => {
	it("透传原始文本", () => {
		expect(formatBashResult("hello world")).toBe("hello world");
	});

	it("空字符串透传", () => {
		expect(formatBashResult("")).toBe("");
	});

	it("多行文本透传", () => {
		const text = "line1\nline2\nline3";
		expect(formatBashResult(text)).toBe(text);
	});
});
