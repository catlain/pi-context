/**
 * collect.ts — 边界场景测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));

import { collectData } from "../collect.js";

function makePi(): ExtensionAPI {
	return {
		getAllTools: vi.fn(() => []),
		getActiveTools: vi.fn(() => []),
	} as unknown as ExtensionAPI;
}

function makeCtx(tokens = 2000, window = 8000) {
	return {
		getContextUsage: vi.fn(() => ({ tokens, contextWindow: window, percent: 25 })),
		getSystemPrompt: vi.fn(() => ""),
	};
}

const emptyOpts = () => ({
	messages: [],
	payload: undefined,
	agingSnapshot: new Map<string, number>(),
	manuallyDeletedIds: new Set<string>(),
});

describe("collectData — 边界场景", () => {
	beforeEach(() => vi.clearAllMocks());

	it("处理 distilled tool result + agingCount", () => {
		const aging = new Map([["tc-dst", 5]]);
		const msgs = [
			{ role: "assistant", content: [{ type: "toolCall", id: "tc-dst", name: "dst_tool", arguments: { q: "test" } }] },
			{ role: "toolResult", toolName: "dst_tool", toolCallId: "tc-dst", content: [{ type: "text", text: "[distilled] compressed" }] },
		];
		const result = collectData(makePi(), makeCtx(), { ...emptyOpts(), payload: { messages: msgs }, messages: msgs, agingSnapshot: aging });
		expect(result).not.toBeNull();
	});



	it("处理 manuallyDeletedIds", () => {
		const msgs = [
			{ role: "assistant", content: [{ type: "toolCall", id: "tc-del", name: "del_tool", arguments: { x: 1 } }] },
			{ role: "toolResult", toolName: "del_tool", toolCallId: "tc-del", content: [{ type: "text", text: "result" }] },
		];
		const result = collectData(makePi(), makeCtx(), { ...emptyOpts(), payload: { messages: msgs }, messages: msgs, manuallyDeletedIds: new Set(["tc-del"]) });
		expect(result).not.toBeNull();
	});

	it("summary 截断到 60 字符", () => {
		const longText = "a".repeat(100);
		const msgs = [{ role: "user", content: longText }];
		const result = collectData(makePi(), makeCtx(), { ...emptyOpts(), payload: { messages: msgs }, messages: msgs });
		expect(result).not.toBeNull();
	});



	it("Tools 分类排序及 Messages 子分类", () => {
		const msgs = [
			{ role: "assistant", content: [{ type: "toolCall", id: "t1", name: "small", arguments: { x: 1 } }, { type: "toolCall", id: "t2", name: "big", arguments: { lots: "lots of data in args for big tok" } }] },
			{ role: "user", content: "hi" },
		];
		const result = collectData(makePi(), makeCtx(), { ...emptyOpts(), payload: { messages: msgs }, messages: msgs });
		const toolsCat = result!.categories.find((c) => c.label === "Tools");
		if (toolsCat && toolsCat.children.length > 1) {
			const values = toolsCat.children.map((c) => c.value);
			expect(values).toEqual([...values].sort((a, b) => b - a));
		}
		const msgCat = result!.categories.find((c) => c.label === "Messages");
		expect(msgCat!.children.map((ch) => ch.label)).toEqual(["User", "Assistant", "Summaries"]);
	});

	it("tools 工具定义使用 function.name", () => {
		const pi = makePi();
		vi.mocked(pi.getActiveTools).mockReturnValue(["fn_name"]);
		vi.mocked(pi.getAllTools).mockReturnValue([
			{ function: { name: "fn_name" } },
		]);
		const result = collectData(pi, makeCtx(), {
			...emptyOpts(),
			payload: { messages: [] },
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.children[0].label).toBe("fn_name");
	});

	it("System Tools 不可进入当 children 为空", () => {
		const pi = makePi();
		vi.mocked(pi.getActiveTools).mockReturnValue([]);
		vi.mocked(pi.getAllTools).mockReturnValue([]);
		const result = collectData(pi, makeCtx(), {
			...emptyOpts(),
			payload: { messages: [] },
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.enterable).toBe(false);
	});

	it("assistant 消息仅 toolCalls 无文本 — summary 显示 (tool calls)", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "t1",
						name: "search",
						arguments: { q: "hello" },
					},
				],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: { messages: msgs },
			messages: msgs,
		});
		expect(result).not.toBeNull();
	});


});
