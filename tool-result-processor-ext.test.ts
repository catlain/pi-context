/**
 * tool-result-processor.ts 单元测试（扩展场景：跳过 + session_ 透传）
 *
 * 覆盖：read/edit/write/grep/find/ls 跳过、isError 跳过、session_ 透传
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

describe("跳过场景：返回 undefined", () => {
	it("未识别工具名透传并写文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "unknown_tool_xyz", content: [{ type: "text", text: "data" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("data");
		expect(result.content[0].text).toContain("原文：");
	});

	it("read 工具透传并写文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "read", content: [{ type: "text", text: "content" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("content");
		expect(result.content[0].text).toContain("原文：");
	});

	it("edit 工具跳过", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		expect(triggerToolResult({
			toolName: "edit", content: [{ type: "text", text: "ok" }], input: {}, isError: false,
		})).toBeUndefined();
	});

	it("write 工具跳过", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		expect(triggerToolResult({
			toolName: "write", content: [{ type: "text", text: "ok" }], input: {}, isError: false,
		})).toBeUndefined();
	});

	it("grep 工具透传并写文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "grep", content: [{ type: "text", text: "matches" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("matches");
		expect(result.content[0].text).toContain("原文：");
	});

	it("find 工具透传并写文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "find", content: [{ type: "text", text: "files" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("files");
		expect(result.content[0].text).toContain("原文：");
	});

	it("ls 工具透传并写文件", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "ls", content: [{ type: "text", text: "entries" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("entries");
		expect(result.content[0].text).toContain("原文：");
	});

	it("isError 结果正常处理（不再跳过）", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "web_read", content: [{ type: "text", text: "timeout" }], input: {}, isError: true,
		});
		// isError 不再跳过，小结果直接透传
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("timeout");
	});
});

describe("session_ 工具透传并写文件", () => {
	it("session_analyze 透传", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "session_analyze", content: [{ type: "text", text: "data" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("data");
		expect(result.content[0].text).toContain("原文：");
	});

	it("session_search 透传", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any);
		const result = triggerToolResult({
			toolName: "session_search", content: [{ type: "text", text: "data" }], input: {}, isError: false,
		});
		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("data");
		expect(result.content[0].text).toContain("原文：");
	});
});
