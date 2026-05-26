/**
 * tool-result-processor.ts 单元测试（异常兜底 + 阈值边界）
 *
 * 覆盖：格式化异常兜底、路由错误不崩溃、空内容、阈值边界
 */

import { describe, expect, it, vi } from "vitest";
import { registerToolResultProcessor } from "./tool-result-processor.js";

function createMockPi() {
	const handlers: Array<{
		event: string;
		handler: (event: any, ctx: any) => any;
	}> = [];

	const pi = {
		on: vi.fn((event: string, handler: (event: any, ctx: any) => any) => {
			handlers.push({ event, handler });
		}),
		events: { emit: vi.fn() },
	};

	function triggerToolResult(event: any): any {
		const trHandler = handlers.find((h) => h.event === "tool_result");
		if (!trHandler) throw new Error("tool_result handler not registered");
		return trHandler.handler(event, {});
	}

	return { pi, triggerToolResult };
}

describe("异常兜底", () => {
	it("格式化函数抛异常时返回原始文本", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: "not json at all" }],
			input: {},
			isError: false,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		// 格式化失败 fallback 原文，但会追加临时文件路径
		expect(text).toContain("not json at all");
		expect(text).toContain("原文：");
	});

	it("非 JSON 格式 web_search 返回原始文本", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "web_search",
			content: [{ type: "text", text: "broken {json" }],
			input: {},
			isError: false,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("broken {json");
		expect(text).toContain("原文：");
	});

	it("handler 内部路由出错不崩溃", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "web_read",
			content: null,
			input: {},
			isError: false,
		});

		expect(result).toBeUndefined();
	});

	it("空 content 数组返回 undefined", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "web_read",
			content: [],
			input: {},
			isError: false,
		});

		expect(result).toBeUndefined();
	});

	it("非文本类型 content 被跳过", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "image", data: "base64..." }],
			input: {},
			isError: false,
		});

		expect(result).toBeUndefined();
	});
});

describe("阈值边界", () => {
	it("小内容接近但不超阈值时保留全文", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });
		// 注意：字符数必须 < CHAR_HARD_LIMIT (8000)，否则会触发字符数硬限制
		const nearThreshold = "N".repeat(3500); // ~875 tokens < 4000
		const rawText = JSON.stringify({
			title: "接近阈值",
			url: "https://x.com",
			content: nearThreshold,
		});

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toContain("接近阈值");
		expect(text).not.toContain("[processed]");
	});

	it("恰好等于阈值时触发大结果处理", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });
		const items = Array.from({ length: 200 }, (_, i) => ({
			name: `function_${i}_${"x".repeat(40)}`,
			kind: "function",
			startLine: i * 10,
			endLine: i * 10 + 9,
		}));
		const rawText = JSON.stringify(items);

		const result = triggerToolResult({
			toolName: "search_symbols",
			content: [{ type: "text", text: rawText }],
			input: { query: "f" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toContain("[processed]");
	});
});
