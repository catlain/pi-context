/**
 * Aging 单元测试 — 核心路径
 *
 * 验证旧内容自动遗忘机制：首次达阈值发提示，下次移除
 */
import { describe, it, expect } from "vitest";
import {
	createMockPi,
	buildMessages,
	triggerContext,
	setupAgingHandler,
} from "./aging-helpers.js";

describe("aging 两阶段（提示→移除）", () => {
	it("count 递增，threshold 时提示，超 threshold 时移除", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 3, 500);

		const content = "small";

		// 第 1 次：count=1，保留
		const m1 = buildMessages("read", content, "tc-n");
		triggerContext(handlers, m1);
		expect(tracker.get("tc-n")).toBe(1);
		expect(m1.filter((m: any) => m.role === "toolResult").length).toBe(1);
		expect(hints.length).toBe(0);

		// 第 2 次：count=2，保留
		const m2 = buildMessages("read", content, "tc-n");
		triggerContext(handlers, m2);
		expect(tracker.get("tc-n")).toBe(2);
		expect(m2.filter((m: any) => m.role === "toolResult").length).toBe(1);
		expect(hints.length).toBe(0);

		// 第 3 次：count=3=threshold，提示
		const m3 = buildMessages("read", content, "tc-n");
		triggerContext(handlers, m3);
		expect(tracker.get("tc-n")).toBe(3);
		expect(hints.length).toBe(1);
		expect(hints[0].text).toContain("即将从上下文中移除");
		expect(hints[0].text).toContain("请无视这条提醒");
		// 提示轮仍然保留内容
		expect(m3.filter((m: any) => m.role === "toolResult").length).toBe(1);

		// 第 4 次：count=4>threshold，已提示过，移除
		const m4 = buildMessages("read", content, "tc-n");
		triggerContext(handlers, m4);
		expect(m4.filter((m: any) => m.role === "toolResult").length).toBe(0);
	});
});

describe("aging threshold 边界", () => {
	it("threshold=1：第 1 次 count=1（提示），第 2 次 count=2>1（移除）", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 1, 500);

		const m1 = buildMessages("read", "x", "tc-t1");
		triggerContext(handlers, m1);
		expect(hints.length).toBe(1);
		expect(m1.filter((m: any) => m.role === "toolResult").length).toBe(1);

		const m2 = buildMessages("read", "x", "tc-t1");
		triggerContext(handlers, m2);
		expect(m2.filter((m: any) => m.role === "toolResult").length).toBe(0);
	});

	it("agingThreshold=0：禁用，永不移除", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 0, 500);

		for (let r = 0; r < 20; r++) {
			triggerContext(handlers, buildMessages("read", "x", "tc-off"));
		}
		expect(hints.length).toBe(0);
		const ml = buildMessages("read", "x", "tc-off");
		triggerContext(handlers, ml);
		expect(ml.filter((m: any) => m.role === "toolResult").length).toBe(1);
	});

	it("每个 tcId 独立计数", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		setupAgingHandler(pi, tracker, hinted, 3, 500);

		const msgs: any[] = [
			{ role: "assistant", content: [{ type: "toolCall", id: "tc-a", name: "read", arguments: {} }, { type: "toolCall", id: "tc-b", name: "bash", arguments: {} }] },
			{ role: "toolResult", toolCallId: "tc-a", toolName: "read", content: [{ type: "text", text: "a" }] },
			{ role: "toolResult", toolCallId: "tc-b", toolName: "bash", content: [{ type: "text", text: "b" }] },
		];
		triggerContext(handlers, msgs);
		expect(tracker.get("tc-a")).toBe(1);
		expect(tracker.get("tc-b")).toBe(1);
		expect(hints.length).toBe(0);
	});
});

describe("aging 动态阈值", () => {
	it("预填充 count=10，设 threshold=5 后立即触发提示+移除", () => {
		const { pi, handlers, hints } = createMockPi();
		const tracker = new Map<string, number>();
		const hinted = new Set<string>();
		tracker.set("tc-dyn", 10);
		setupAgingHandler(pi, tracker, hinted, 5, 500);

		// count=11>=5，首次提示
		const m1 = buildMessages("read", "x", "tc-dyn");
		triggerContext(handlers, m1);
		expect(hints.length).toBe(1);

		// count=12>5，已提示过，移除
		const m2 = buildMessages("read", "x", "tc-dyn");
		triggerContext(handlers, m2);
		expect(m2.filter((m: any) => m.role === "toolResult").length).toBe(0);
	});
});
