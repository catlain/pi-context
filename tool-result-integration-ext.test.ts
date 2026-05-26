/**
 * 集成测试：后处理高级场景
 *
 * 场景：
 * - 后处理器输出的短摘要不被 context distill 二次蒸馏
 * - 临时文件目录共存
 * - 格式化函数抛异常时 handler 不中断
 */

import { describe, it, expect, vi } from "vitest";
import { registerToolResultProcessor } from "./tool-result-processor.js";

function createHandler() {
	const handlers: Array<(e: any, ctx: any) => any> = [];
	const mockPi = {
		on: vi.fn((_evt: string, h: any) => { handlers.push(h); }),
		events: { emit: vi.fn() },
	};
	registerToolResultProcessor(mockPi as any);
	return handlers[0];
}

// ── 后处理器输出不被 context distill 二次蒸馏 ─────

describe("后处理器输出不被 distill 二次蒸馏", () => {
	it("小结果输出格式简洁，不含蒸馏标记", () => {
		const handler = createHandler();
		const rawText = JSON.stringify({ title: "简洁", url: "https://x.com", content: "内容" });

		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" }, isError: false,
		}, {});

		const text = result.content[0].text;
		expect(text).not.toContain("[distilled]");
		expect(text).not.toContain("[auto-distill]");
	});

	it("大结果摘要简短，不会被 distill 阈值触发二次处理", () => {
		const handler = createHandler();
		const bigText = "X".repeat(20000);
		const rawText = JSON.stringify({ title: "大文件", url: "https://x.com", content: bigText });

		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" }, isError: false,
		}, {});

		const text = result.content[0].text;
		// 摘要文本应远小于 4000 tokens（distillThreshold）
		const tokens = Math.ceil(text.length / 4);
		expect(tokens).toBeLessThan(4000);
	});
});

// ── 临时文件目录共存 ───────────────────────────────

describe("临时文件目录共存", () => {
	it("大结果后处理写 .pi/agent/distill/processor/ 子目录", () => {
		const handler = createHandler();
		const bigText = "X".repeat(20000);
		const rawText = JSON.stringify({ title: "大文件", url: "https://x.com", content: bigText });

		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: rawText }],
			input: { url: "https://x.com" }, isError: false,
		}, {});

		const text = result.content[0].text;
		// processor 子目录与 context distill 的 /tmp/pi-distill/ 不冲突
		expect(text).toContain(".pi/agent/distill/processor/");
	});
});

// ── 格式化函数异常时 handler 不中断 ────────────────

describe("格式化函数异常时 handler 不中断", () => {
	it("web_read 格式化失败返回原始文本", () => {
		const handler = createHandler();
		const result = handler({
			toolName: "web_read", content: [{ type: "text", text: "invalid json" }],
			input: {}, isError: false,
		}, {});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("invalid json");
		expect(result.content[0].text).toContain("原文：");
	});

	it("web_search 格式化失败返回原始文本", () => {
		const handler = createHandler();
		const result = handler({
			toolName: "web_search", content: [{ type: "text", text: "not an array" }],
			input: {}, isError: false,
		}, {});

		expect(result).not.toBeUndefined();
		expect(result.content[0].text).toContain("not an array");
		expect(result.content[0].text).toContain("原文：");
	});
});
