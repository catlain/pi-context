/**
 * Aging 单元测试 — 互斥与清理
 *
 * 验证 aging 与 distill 的互斥关系，以及 agingTracker 清理行为
 */
import { describe, it, expect } from "vitest";
import {
	createMockPi,
	buildMessages,
	triggerContext,
	setupAgingHandler,
	estimateTokens,
} from "./aging-helpers.js";

describe("aging 与 distill 互斥", () => {
	it("大内容（tokens >= distillThreshold）aging 正常处理", () => {
		const { pi, handlers } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 2, 100);

		const bigContent = "x".repeat(100 * 4);
		for (let r = 0; r < 5; r++) {
			triggerContext(handlers, buildMessages("read", bigContent, "tc-big"));
		}
		// aging 现在处理所有内容，不再跳过大内容
		expect(tracker.has("tc-big")).toBe(true);
	});

	it("大内容也走 aging 计数", () => {
		const { pi, handlers } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 2, 100);

		const bigContent = "x".repeat(100 * 4);
		triggerContext(handlers, buildMessages("bash", bigContent, "tc-big"));
		expect(tracker.has("tc-big")).toBe(true);
		expect(tracker.get("tc-big")).toBe(1);
	});

	it("大内容与正常内容共存时，两者都走 aging", () => {
		const { pi, handlers } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 2, 100);

		const bigContent = "x".repeat(100 * 4);
		const smallContent = "small";

		const msgs: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "tc-big", name: "read", arguments: {} },
					{ type: "toolCall", id: "tc-small", name: "grep", arguments: {} },
				],
			},
			{ role: "toolResult", toolCallId: "tc-big", toolName: "read", content: [{ type: "text", text: bigContent }] },
			{ role: "toolResult", toolCallId: "tc-small", toolName: "grep", content: [{ type: "text", text: smallContent }] },
		];
		triggerContext(handlers, msgs);
		expect(tracker.has("tc-big")).toBe(true);
		expect(tracker.get("tc-small")).toBe(1);
	});
});

describe("aging tracker 清理", () => {
	it("tcId 不在 messages 中 → 从 agingTracker 删除", () => {
		const { pi, handlers } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 5, 500);

		triggerContext(handlers, buildMessages("read", "a", "tc-gone"));
		expect(tracker.has("tc-gone")).toBe(true);

		triggerContext(handlers, buildMessages("read", "b", "tc-other"));
		expect(tracker.has("tc-gone")).toBe(false);
	});

	it("清理不影响本轮计数", () => {
		const { pi, handlers } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 5, 500);

		// 同一轮中两个 tcId
		const m1 = [
			{ role: "assistant", content: [
				{ type: "toolCall", id: "tc-a", name: "read", arguments: {} },
				{ type: "toolCall", id: "tc-b", name: "read", arguments: {} },
			] },
			{ role: "toolResult", toolCallId: "tc-a", toolName: "read", content: [{ type: "text", text: "a" }] },
			{ role: "toolResult", toolCallId: "tc-b", toolName: "read", content: [{ type: "text", text: "b" }] },
		];
		triggerContext(handlers, m1);
		expect(tracker.get("tc-a")).toBe(1);
		expect(tracker.get("tc-b")).toBe(1);

		// 下一轮只有 tc-b，tc-a 被清理
		triggerContext(handlers, buildMessages("read", "b", "tc-b"));
		expect(tracker.has("tc-a")).toBe(false);
		expect(tracker.get("tc-b")).toBe(2);
	});

	it("多轮混合 distill 和 aging 不冲突", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 2, 100);

		const bigContent = "x".repeat(100 * 4);
		const smallContent = "small";

		// 第 1 次：大+小
		triggerContext(handlers, [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "tc-big", name: "read", arguments: {} },
					{ type: "toolCall", id: "tc-sm", name: "grep", arguments: {} },
				],
			},
			{ role: "toolResult", toolCallId: "tc-big", toolName: "read", content: [{ type: "text", text: bigContent }] },
			{ role: "toolResult", toolCallId: "tc-sm", toolName: "grep", content: [{ type: "text", text: smallContent }] },
		]);
		expect(tracker.get("tc-sm")).toBe(1);

		// 第 2 次：小内容 count=2=threshold，提示
		triggerContext(handlers, [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "tc-sm", name: "grep", arguments: {} },
				],
			},
			{ role: "toolResult", toolCallId: "tc-sm", toolName: "grep", content: [{ type: "text", text: smallContent }] },
		]);
		expect(tracker.get("tc-sm")).toBe(2);
		expect(hints.length).toBe(1);

		// 第 3 次：小内容 count=3>threshold，已提示过，移除
		const m3 = [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "tc-sm", name: "grep", arguments: {} },
				],
			},
			{ role: "toolResult", toolCallId: "tc-sm", toolName: "grep", content: [{ type: "text", text: smallContent }] },
		];
		triggerContext(handlers, m3);
		expect(m3.filter((m: any) => m.role === "toolResult").length).toBe(0);
	});
});
