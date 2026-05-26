/**
 * processor 对 read 工具的处理测试
 *
 * 验证 read 不再被 SKIP，走通用透传+写文件路径
 */
import { describe, it, expect, vi } from "vitest";
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
		const trHandler = handlers.find(h => h.event === "tool_result");
		if (!trHandler) throw new Error("tool_result handler not registered");
		return trHandler.handler(event, {});
	}

	return { pi, triggerToolResult };
}

describe("processor read 处理", () => {
	it("read 小结果透传并写文件+追加路径", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const result = triggerToolResult({
			toolName: "read",
			content: [{ type: "text", text: "file content here" }],
			input: { path: "/some/file.txt" },
			isError: false,
			details: undefined,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("file content here");
		expect(text).toContain("原文：");
		expect(text).toContain(".pi/agent/distill/processor/");
	});

	it("read 大结果走摘要+精读提示", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 500 });

		const bigContent = "X".repeat(3000); // 750 tokens > 500
		const result = triggerToolResult({
			toolName: "read",
			content: [{ type: "text", text: bigContent }],
			input: { path: "/big/file.txt" },
			isError: false,
			details: undefined,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("[processed]");
		expect(text).toContain("read");
		expect(text).toContain(".pi/agent/distill/processor/");
		expect(text).toContain("完整内容：");
	});

	it("read 不在 SKIP_TOOLS 中（不返回 undefined）", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);

		const result = triggerToolResult({
			toolName: "read",
			content: [{ type: "text", text: "some content" }],
			input: { path: "/file.txt" },
			isError: false,
			details: undefined,
		});

		// read 不应该被跳过
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("some content");
	});
});
