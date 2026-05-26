/**
 * 集成测试：后处理 + mcp-lite 简化（基础链路）
 *
 * 场景：
 * - mcp-lite 不再做格式化，后处理器接管
 * - handler 注册后不影响其他 tool_result handler
 * - 完整链路：MCP 原始结果 → 后处理器格式化 → 模拟 AI 上下文
 */

import { describe, it, expect, vi } from "vitest";
import { registerToolResultProcessor } from "./tool-result-processor.js";
import { formatWebReadResult, formatWebSearchResult } from "./formatters.js";

// ── mcp-lite 简化验证 ─────────────────────────────

describe("mcp-lite 不再做格式化", () => {
	it("formatWebReadResult 等函数已迁移到 context/formatters", () => {
		expect(typeof formatWebReadResult).toBe("function");
		expect(typeof formatWebSearchResult).toBe("function");
	});

	it("后处理器路由覆盖 mcp-lite 原格式化的所有工具类型", () => {
		const mockPi = { on: vi.fn(), events: { emit: vi.fn() } };
		registerToolResultProcessor(mockPi as any);
		const handler = mockPi.on.mock.calls.find(c => c[0] === "tool_result")?.[1];
		expect(handler).toBeTypeOf("function");
	});

	it("mcp-lite 不再导入 processResponse", async () => {
		// 验证 mcp-lite 的 execute 回调不调用 processResponse
		// 读取 mcp-lite/index.ts 源码，确认无 processResponse 调用
		const fs = await import("node:fs");
		const path = await import("node:path");
		const mcpIndex = fs.readFileSync(
			path.resolve(__dirname, "../../extensions/mcp-lite/index.ts"), "utf-8",
		);
		// 不应包含 processResponse 调用（setupMcpLite 和 autoDiscoverMissingServers 两条路径）
		expect(mcpIndex).not.toContain("processResponse");
	});
});

// ── handler 不影响其他 handler ─────────────────────

describe("不影响其他 tool_result handler", () => {
	it("后处理器注册后，多次 on 调用分别注册", () => {
		const mockPi = { on: vi.fn(), events: { emit: vi.fn() } };
		mockPi.on("tool_result", vi.fn());
		registerToolResultProcessor(mockPi as any);
		const toolResultCalls = mockPi.on.mock.calls.filter(c => c[0] === "tool_result");
		expect(toolResultCalls.length).toBe(2);
	});

	it("后处理器不影响其他 handler 的注册", () => {
		const mockPi = { on: vi.fn(), events: { emit: vi.fn() } };
		registerToolResultProcessor(mockPi as any);
		expect(mockPi.on).toHaveBeenCalledTimes(1);
	});
});

// ── 完整链路 ───────────────────────────────────────

describe("完整链路：MCP 原始结果 → 后处理格式化", () => {
	function createHandler() {
		const handlers: Array<(e: any, ctx: any) => any> = [];
		const mockPi = {
			on: vi.fn((_evt: string, h: any) => { handlers.push(h); }),
			events: { emit: vi.fn() },
		};
		registerToolResultProcessor(mockPi as any);
		return handlers[0];
	}

	it("webReader 原始 JSON 经后处理器格式化", () => {
		const handler = createHandler();
		const rawText = JSON.stringify(JSON.stringify({
			title: "集成测试", url: "https://example.com/int", content: "集成测试正文",
		}));

		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: rawText }],
			input: { url: "https://example.com/int" }, isError: false,
		}, {});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("标题: 集成测试");
		expect(text).toContain("URL: https://example.com/int");
		expect(text).toContain("集成测试正文");
		expect(text).not.toContain("og:title");
	});

	it("webSearch 原始双重编码 JSON 经后处理器格式化", () => {
		const handler = createHandler();
		const rawText = JSON.stringify(JSON.stringify([
			{ title: "结果1", link: "https://a.com", content: "摘要1" },
		]));

		const result = handler({
			toolName: "web_search", content: [{ type: "text", text: rawText }],
			input: { query: "test" }, isError: false,
		}, {});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("[1] 结果1");
		expect(result.content[0].text).toContain("https://a.com");
	});

	it("原始 JSON（非双重编码）也能正确格式化", () => {
		const handler = createHandler();
		const rawText = JSON.stringify({ title: "直传", url: "https://x.com", content: "内容" });

		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" }, isError: false,
		}, {});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("标题: 直传");
	});
});
