/**
 * tool-result-processor.ts 单元测试（配置读取 + 写入降级）
 *
 * 覆盖：阈值配置读取、临时文件写入失败降级
 *
 * 这些场景需要修改配置或 mock 文件系统，独立于基础路径测试。
 * registerToolResultProcessor 接收第二个参数作为配置覆盖，便于测试不同阈值。
 * 写入失败通过 writeFallback 标志模拟（handler 内部捕获 writeFileSync 异常时返回原始内容）。
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

// ── 阈值配置读取 ───────────────────────────────────

describe("阈值配置读取", () => {
	it("自定义更低阈值时较早触发大结果路径", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 100 });

		const rawText = JSON.stringify({ title: "短小但超阈值", url: "https://x.com", content: "X".repeat(500) });

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toContain("[processed]");
		expect(text).toContain(".pi/agent/distill/processor/");
	});

	it("自定义更高阈值时小内容保留全文", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 100000 });

		const bigText = "B".repeat(20000);
		const rawText = JSON.stringify({ title: "高阈值保留全文", url: "https://x.com", content: bigText });

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		// 20000 chars ≈ 5000 tokens，低于 100000 阈值，保留全文
		const text = result.content[0].text;
		expect(text).toContain("高阈值保留全文");
		expect(text).not.toContain("[processed]");
	});

	it("低阈值使小结果也触发大结果路径", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 50 });

		// 生成足够大的 JSON 数据（需要 >= 50 tokens = 200 chars）
		const items = Array.from({ length: 20 }, (_, i) => ({
			name: `func_${i}`, kind: "function", startLine: i * 10, endLine: i * 10 + 9,
		}));
		const rawText = JSON.stringify(items);

		const result = triggerToolResult({
			toolName: "search_symbols",
			content: [{ type: "text", text: rawText }],
			input: { query: "tiny" },
			isError: false,
		});

		const text = result.content[0].text;
		expect(text).toContain("[processed]");
		expect(text).toContain("search_symbols");
	});

	it("显式阈值 = 4000 时正常工作", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { distillThreshold: 4000 });

		const smallRaw = JSON.stringify({ title: "默认", url: "https://x.com", content: "ABC" });
		const smallResult = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: smallRaw }],
			input: { url: "https://x.com" },
			isError: false,
		});
		expect(smallResult.content[0].text).not.toContain("[processed]");

		const bigText = "A".repeat(20000);
		const bigRaw = JSON.stringify({ title: "大结果", url: "https://x.com", content: bigText });
		const bigResult = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: bigRaw }],
			input: { url: "https://x.com" },
			isError: false,
		});
		expect(bigResult.content[0].text).toContain("[processed]");
	});
});

// ── 临时文件写入失败降级 ───────────────────────────

describe("临时文件写入失败降级", () => {
	it("writeFileSync 抛异常时降级返回完整格式化内容", () => {
		const { pi, triggerToolResult } = createMockPi();
		// writeFallback: true 表示 handler 应捕获 writeFileSync 异常，返回完整格式化内容
		registerToolResultProcessor(pi as any, { writeFallback: true });

		const bigText = "X".repeat(20000);
		const rawText = JSON.stringify({
			title: "写入失败降级测试",
			url: "https://x.com",
			content: bigText,
		});

		const result = triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		// 降级后返回格式化内容（web_read 会截断到 15000 字符），不含 [processed]
		const text = result.content[0].text;
		expect(text).toContain("标题: 写入失败降级测试");
		expect(text).toContain("URL: https://x.com");
		expect(text).not.toContain("[processed]");
	});

	it("写入失败降级仍返回正确的 content 数组结构", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { writeFallback: true });

		const rawText = JSON.stringify([{ name: "bigFunc", kind: "function", startLine: 1, endLine: 500 }]);

		const result = triggerToolResult({
			toolName: "search_symbols",
			content: [{ type: "text", text: rawText }],
			input: { query: "bigFunc" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		expect(Array.isArray(result.content)).toBe(true);
		expect(result.content[0].type).toBe("text");
		expect(typeof result.content[0].text).toBe("string");
		expect(result.content[0].text).toContain("bigFunc");
	});

	it("写入失败时 console.error 被调用", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, { writeFallback: true });

		const rawText = JSON.stringify({ title: "错误日志", url: "https://x.com", content: "X".repeat(20000) });

		triggerToolResult({
			toolName: "web_read",
			content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" },
			isError: false,
		});

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
