/**
 * tool-result-processor.ts 单元测试（核心路径）
 *
 * 覆盖：注册校验、小结果路径、大结果路径
 */

import { describe, it, expect, vi } from "vitest";
import { registerToolResultProcessor } from "./tool-result-processor.js";

/** 构造最小化 MockExtensionAPI */
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
		const trHandler = handlers.find(h => h.event === "tool_result");
		if (!trHandler) throw new Error("tool_result handler not registered");
		return trHandler.handler(event, {});
	}

	return { pi, triggerToolResult, handlers };
}

// ── 注册 ───────────────────────────────────────────

describe("registerToolResultProcessor", () => {
	it("注册 tool_result handler", () => {
		const { pi } = createMockPi();
		registerToolResultProcessor(pi as any);
		expect(pi.on).toHaveBeenCalledWith("tool_result", expect.any(Function));
	});
});

// ── 小结果路径 ─────────────────────────────────────

describe("小结果（< 阈值）", () => {
	it("返回格式化内容，不写临时文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const rawText = JSON.stringify({
			title: "简短标题",
			url: "https://example.com",
			content: "简短正文",
		});

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://example.com" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("标题: 简短标题");
	});

	it("web_search 小结果格式化", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const rawText = JSON.stringify([
			{ title: "结果1", link: "https://a.com", content: "摘要" },
		]);

		const result = triggerToolResult({
			toolName: "web_search",
			content: [{ type: "text", text: rawText }],
			input: {},
			isError: false,
		});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("[1] 结果1");
	});
});

// ── 大结果路径 ─────────────────────────────────────

describe("大结果（≥ 阈值）", () => {
	it("返回摘要，写临时文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const bigText = "A".repeat(20000);
		const rawText = JSON.stringify({
			title: "超长文档", url: "https://example.com/long", content: bigText,
		});

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://example.com/long" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("[processed]");
		expect(text).toContain("web_read");
		expect(text).toContain(".pi/agent/distill/processor/");
		expect(text).toContain("tokens");
	});

	it("大结果摘要格式包含全部字段", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		// 生成足够大的数据（需要 >= 4000 tokens = 16000 chars）
		const bigText = "B".repeat(20000);
		const rawText = JSON.stringify({ title: "超长文档", url: "https://example.com/big", content: bigText });

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://example.com/big" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toMatch(/\[processed\]/);
		expect(text).toMatch(/web_read/);
		expect(text).toContain(".pi/agent/distill/processor/");
		expect(text).toMatch(/\d+k? tokens/);
	});

	it("大结果摘要包含正确文件路径", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const bigText = "X".repeat(20000);
		const rawText = JSON.stringify({ title: "大文件", url: "https://x.com", content: bigText });

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toContain(".pi/agent/distill/processor/web_read-");
		expect(text).toContain(".txt");
	});
});
