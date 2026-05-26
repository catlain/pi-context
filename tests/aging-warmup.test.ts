/**
 * Warmup 单元测试 — reload/tree 导航后恢复 distill/aging 状态
 *
 * 验证 warmup 逻辑在 seenArgs 为空且存在大量 toolResult 时正确预填，
 * 使 reload/tree 后首次 context 调用就恢复蒸馏/遗忘行为。
 */
import { describe, it, expect } from "vitest";
import {
	createMockPi,
	triggerContext,
} from "./aging-helpers.js";
import {
	setupWarmupAgingHandler,
	buildMixedMessages,
} from "./aging-warmup-helpers.js";

describe("warmup 正常路径", () => {
	it("seenArgs 空 + 15 个 toolResult + agingThreshold>0 → 全部被蒸馏/遗忘删除", () => {
		const { pi, handlers } = createMockPi();
		const seenArgs = new Set<string>();
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 3,
		});

		// 7 个大（~600 token）+ 8 个小 = 15 个 toolResult
		const messages = buildMixedMessages(7, 8, 2400, "small");

		triggerContext(handlers, messages);

		// warmup 后 seenArgs 填满 15 个
		expect(seenArgs.size).toBe(15);
		// 全部删除：大内容被 distill 已见删除，小内容被 aging 达阈值删除
		// agingTracker 被 cleanup 清空（所有条目都不在 activeTcIds 中）
		const remaining = messages.filter((m) => m.role === "toolResult");
		expect(remaining.length).toBe(0);
	});

	it("warmup 后全部静默删除，不发 hint", () => {
		const { pi, handlers, hints } = createMockPi();
		const seenArgs = new Set<string>();
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 99,
		});

		// 12 个大 + 3 个小 = 15 个
		const messages = buildMixedMessages(12, 3, 2400, "x");

		triggerContext(handlers, messages);

		// warmup 后：大内容走 distill 已见删除，小内容 agingThreshold=99 达阈值删除
		const remaining = messages.filter((m) => m.role === "toolResult");
		expect(remaining.length).toBe(0);
		expect(hints.length).toBe(0);
	});
});

describe("warmup 边界", () => {
	it("恰好 10 个 toolResult → 不触发 warmup，现有行为不变", () => {
		const { pi, handlers, hints } = createMockPi();
		const seenArgs = new Set<string>();
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 5,
		});

		// 5 个大 + 5 个小 = 10 个（边界 >10，不触发）
		const messages = buildMixedMessages(5, 5, 2400, "x");

		triggerContext(handlers, messages);

		// 大内容首次见 → 发 hint，保留；小内容 aging 计数=1 < threshold
		expect(hints.length).toBe(5);
		const remaining = messages.filter((m) => m.role === "toolResult");
		expect(remaining.length).toBe(10);
	});

	it("恰好 11 个 toolResult → 触发 warmup", () => {
		const { pi, handlers } = createMockPi();
		const seenArgs = new Set<string>();
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 3,
		});

		// 6 个大 + 5 个小 = 11 个，>10 → 触发 warmup
		const messages = buildMixedMessages(6, 5, 2400, "x");

		triggerContext(handlers, messages);

		// warmup 触发，seenArgs 填满
		expect(seenArgs.size).toBe(11);
	});
});

describe("warmup agingThreshold=0", () => {
	it("15 个 toolResult + agingThreshold=0 → 大内容被蒸馏，小内容不走 aging", () => {
		const { pi, handlers } = createMockPi();
		const seenArgs = new Set<string>();
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 0, // aging 禁用
		});

		const messages = buildMixedMessages(7, 8, 2400, "x");

		triggerContext(handlers, messages);

		// warmup 填 seenArgs，但不填 agingTracker（threshold=0）
		expect(seenArgs.size).toBe(15);
		expect(agingTracker.size).toBe(0);

		// 大内容被蒸馏，小内容不走 aging → 保留
		const remaining = messages.filter((m) => m.role === "toolResult");
		expect(remaining.length).toBe(8);
	});
});

describe("非 warmup 路径", () => {
	it("seenArgs 非空（已有记录）→ 跳过 warmup，现有 distill/aging 不变", () => {
		const { pi, handlers, hints } = createMockPi();
		const seenArgs = new Set<string>(["preexisting-tc"]);
		const agingTracker = new Map<string, number>();

		setupWarmupAgingHandler(pi, handlers, {
			seenArgs, agingTracker,
			distillThreshold: 500, agingThreshold: 3,
		});

		const messages = buildMixedMessages(7, 8, 2400, "x");

		triggerContext(handlers, messages);

		// 大内容首次见 → 发 hint，不删除
		expect(hints.length).toBe(7);
		// seenArgs: 1（预存）+ 7（首次见）= 8
		expect(seenArgs.size).toBe(8);
		// agingTracker: 小内容计数从 0 升至 1
		expect(agingTracker.size).toBe(8);
		for (const [, count] of agingTracker) {
			expect(count).toBe(1);
		}
		// 全部保留
		const remaining = messages.filter((m) => m.role === "toolResult");
		expect(remaining.length).toBe(15);
	});
});
