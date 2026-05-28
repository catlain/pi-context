/**
 * collect.ts — 基础场景测试
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

function makeCtx(
	usage?: { tokens: number; contextWindow: number; percent: number } | null,
) {
	const u =
		usage === undefined
			? { tokens: 1000, contextWindow: 4000, percent: 25 }
			: usage;
	return {
		getContextUsage: vi.fn(() => u),
		getSystemPrompt: vi.fn(() => "default sys prompt"),
	};
}

const emptyOpts = () => ({
	messages: [],
	payload: undefined,
	agingSnapshot: new Map<string, number>(),
	manuallyDeletedIds: new Set<string>(),
});

describe("collectData — 基础场景", () => {
	beforeEach(() => vi.clearAllMocks());

	it("getContextUsage 返回 null → 返回 null", () => {
		const result = collectData(makePi(), makeCtx(null), emptyOpts());
		expect(result).toBeNull();
	});

	it("getContextUsage 返回 undefined → 返回 null", () => {
		const ctx = makeCtx();
		ctx.getContextUsage = vi.fn(() => undefined);
		const result = collectData(makePi(), ctx, emptyOpts());
		expect(result).toBeNull();
	});

	it("无 payload → categories 空数组", () => {
		const result = collectData(makePi(), makeCtx(), emptyOpts());
		expect(result).toEqual({
			percent: 25,
			categories: [],
			totalActual: 1000,
			limit: 4000,
		});
	});

	it("有 payload 时生成分类", () => {
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: { messages: [] },
		});
		expect(result).not.toBeNull();
		expect(result!.categories.length).toBeGreaterThan(0);
		expect(result!.totalActual).toBe(1000);
		expect(result!.limit).toBe(4000);
	});

	it("payload.system 为字符串", () => {
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: { system: "custom system prompt" },
		});
		const sysCat = result!.categories.find((c) => c.label === "System Prompt");
		expect(sysCat).toBeDefined();
		expect(sysCat!.value).toBeGreaterThan(0);
	});

	it("payload.system 为数组 — 提取 text blocks", () => {
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: {
				system: [
					{ type: "text", text: "block1" },
					{ type: "image" },
					{ type: "text", text: "block2" },
				],
			},
		});
		expect(
			result!.categories.find((c) => c.label === "System Prompt"),
		).toBeDefined();
	});

	it("payload.instructions 提取 system prompt", () => {
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: { instructions: "instruct prompt" },
		});
		expect(
			result!.categories.find((c) => c.label === "System Prompt"),
		).toBeDefined();
	});

	it("messages 中 system/developer 角色提取", () => {
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: {
				messages: [
					{
						role: "developer",
						content: [{ type: "text", text: "dev prompt" }],
					},
				],
			},
		});
		expect(
			result!.categories.find((c) => c.label === "System Prompt"),
		).toBeDefined();
	});

	it("payload 为空 → extractSystem 返回空字符串，回退 getSystemPrompt", () => {
		const pi = makePi();
		const ctx = makeCtx();
		const result = collectData(pi, ctx, {
			...emptyOpts(),
			payload: {} as any,
		});
		expect(result).not.toBeNull();
	});

	it("user 消息 string content", () => {
		const pi = makePi();
		const msgs = [{ role: "user", content: "hello world" }];
		const result = collectData(pi, makeCtx(), {
			...emptyOpts(),
			payload: { messages: msgs },
			messages: msgs,
		});
		expect(result).not.toBeNull();
	});

	it("user 消息 array content", () => {
		const pi = makePi();
		const msgs = [
			{
				role: "user",
				content: [
					{ type: "text", text: "part1" },
					{ type: "image" },
					{ type: "text", text: "part2" },
				],
			},
		];
		const result = collectData(pi, makeCtx(), {
			...emptyOpts(),
			payload: { messages: msgs },
			messages: msgs,
		});
		expect(result).not.toBeNull();
	});

	it("user 消息空 content", () => {
		const pi = makePi();
		const msgs = [{ role: "user", content: "" }];
		const result = collectData(pi, makeCtx(), {
			...emptyOpts(),
			payload: { messages: msgs },
			messages: msgs,
		});
		expect(result).not.toBeNull();
	});

	it("assistant 消息 string content", () => {
		const msgs = [{ role: "assistant", content: "assistant reply" }];
		const result = collectData(makePi(), makeCtx(), {
			...emptyOpts(),
			payload: { messages: msgs },
			messages: msgs,
		});
		expect(result).not.toBeNull();
	});
});
