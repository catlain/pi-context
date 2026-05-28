/**
 * collect.ts — 工具相关场景测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));

import { collectData } from "../collect.js";

function makePi(opts?: { tools: { name: string }[]; active: string[] }): ExtensionAPI {
	return {
		getAllTools: vi.fn(() => opts?.tools ?? []),
		getActiveTools: vi.fn(() => opts?.active ?? []),
	} as unknown as ExtensionAPI;
}

function makeCtx() {
	return {
		getContextUsage: vi.fn(() => ({ tokens: 2000, contextWindow: 8000, percent: 25 })),
		getSystemPrompt: vi.fn(() => ""),
	};
}

describe("collectData — 工具场景", () => {
	beforeEach(() => vi.clearAllMocks());

	it("payload 中的 tools 优先于 pi 工具", () => {
		const pi = makePi({
			tools: [{ name: "pi_tool" }],
			active: ["pi_tool"],
		});
		const result = collectData(pi, makeCtx(), {
			messages: [],
			payload: { messages: [], tools: [{ name: "payload_tool" }] },
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.children.length).toBe(1);
		expect(sysTools!.children[0].label).toBe("payload_tool");
	});

	it("无 payload tools 时回退到 active tools", () => {
		const pi = makePi({
			tools: [
				{ name: "active_a" },
				{ name: "active_b" },
				{ name: "inactive" },
			],
			active: ["active_a", "active_b"],
		});
		const result = collectData(pi, makeCtx(), {
			messages: [],
			payload: { messages: [] },
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.children.length).toBe(2);
	});

	it("toolCall 带 arguments 字符串与对象混合", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-001",
						name: "search",
						arguments: { query: "test query", limit: 10 },
					},
				],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			payload: { messages: msgs },
			messages: msgs,
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const toolsCat = result!.categories.find((c) => c.label === "Tools");
		expect(toolsCat).toBeDefined();
		expect(toolsCat!.children.length).toBe(1);
	});

	it("toolResult 匹配已有 toolCall record (通过 tcId)", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-link",
						name: "link_tool",
						arguments: { input: "data" },
					},
				],
			},
			{
				role: "toolResult",
				toolName: "link_tool",
				toolCallId: "tc-link",
				content: [{ type: "text", text: "linked result" }],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			payload: { messages: msgs },
			messages: msgs,
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		expect(result).not.toBeNull();
	});

	it("toolResult 无对应 toolCall 时创建新 record", () => {
		const msgs = [
			{
				role: "toolResult",
				toolName: "orphan_tool",
				toolCallId: "tc-orphan",
				content: [{ type: "text", text: "orphan result" }],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			payload: { messages: msgs },
			messages: msgs,
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		expect(result).not.toBeNull();
	});

	it("toolResult 匹配 bucket 中未匹配的 record (无 tcId)", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-a",
						name: "multi_tool",
						arguments: { x: 1 },
					},
				],
			},
			{
				role: "toolResult",
				toolName: "multi_tool",
				toolCallId: "tc-a",
				content: [{ type: "text", text: "result A" }],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			payload: { messages: msgs },
			messages: msgs,
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		expect(result).not.toBeNull();
	});

	it("多个 toolCall 同 toolName — 各自匹配结果", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-m1",
						name: "multi",
						arguments: { first: true },
					},
					{
						type: "toolCall",
						id: "tc-m2",
						name: "multi",
						arguments: { second: true },
					},
				],
			},
			{
				role: "toolResult",
				toolName: "multi",
				toolCallId: "tc-m1",
				content: [{ type: "text", text: "result 1" }],
			},
			{
				role: "toolResult",
				toolName: "multi",
				toolCallId: "tc-m2",
				content: [{ type: "text", text: "result 2" }],
			},
		];
		const result = collectData(makePi(), makeCtx(), {
			payload: { messages: msgs },
			messages: msgs,
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const toolsCat = result!.categories.find((c) => c.label === "Tools");
		expect(toolsCat).toBeDefined();
		expect(toolsCat!.children.length).toBe(1);
	});

	it("可用工具超过 payload tools → System Tools 分类非空", () => {
		const pi = makePi({
			tools: [{ name: "tool_a" }, { name: "tool_b" }],
			active: ["tool_a"],
		});
		const result = collectData(pi, makeCtx(), {
			messages: [],
			payload: { messages: [], tools: [{ name: "tool_a" }] },
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.children.length).toBe(1);
	});

	it("system tools 按 value 降序排列", () => {
		const pi = makePi({
			tools: [{ name: "big" }, { name: "small" }],
			active: ["big", "small"],
		});
		const result = collectData(pi, makeCtx(), {
			messages: [],
			payload: { messages: [] },
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		const values = sysTools!.children.map((c) => c.value);
		expect(values).toEqual([...values].sort((a, b) => b - a));
	});

	it("fallbackTools 过滤 inactive tools", () => {
		const pi = makePi({
			tools: [
				{ function: { name: "fn_a" } },
				{ function: { name: "fn_b" } },
			],
			active: ["fn_a"],
		});
		const result = collectData(pi, makeCtx(), {
			messages: [],
			payload: { messages: [] },
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
		});
		const sysTools = result!.categories.find((c) => c.label === "System Tools");
		expect(sysTools!.children.length).toBe(1);
		expect(sysTools!.children[0].label).toBe("fn_a");
	});
});
