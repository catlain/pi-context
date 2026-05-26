/**
 * handleContextEvent 集成测试 — aging 删除、distill+aging 统一流程、提示文案
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleContextEvent, ContextState } from "../handle-context.js";

// ── mocks ──
vi.mock("../shared.js", () => ({
	getContextConfig: () => ({ distillThreshold: 100, agingThreshold: 3, processorThreshold: 0 }),
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: {
		distillWarning: "📋 [auto-distill] 「{label}」全文 ~{tokens} tokens，超过上下文阈值。请使用 read(offset,limit)/grep 等精确方法获取所需信息，下轮请求时此结果会被自动移除。",
		distillWarningShort: "📋 大结果「{label}」下轮自动移除",
		processorSummary: "[processed] {toolName} 结果（~{tokens} tokens）\n完整内容：{tmpPath}\n\n{preview}\n{more}",
		processorSmallResult: "{formatted}\n\n原文：{tmpPath}",
	},
	fillTemplate: (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_: string, k: string) => vars[k] ?? `{${k}}`),
}));

vi.mock("../distill-helpers.js", () => ({
	buildToolCallMap: () => new Map(),
	estimateTokens: (t: string) => Math.ceil(t.length / 4),
	toolMeta: () => ({ meta: "" }),
	removeOrphanedToolCalls: (msgs: any[]) => {
		const activeIds = new Set<string>();
		for (const m of msgs) if (m.role === "toolResult" && m.toolCallId) activeIds.add(m.toolCallId);
		for (const msg of msgs) {
			if (msg.role === "assistant" && Array.isArray(msg.content))
				msg.content = msg.content.filter((b: any) => b.type !== "toolCall" || activeIds.has(b.id));
		}
		for (let i = msgs.length - 1; i >= 0; i--) {
			const m = msgs[i];
			if (m.role === "assistant" && Array.isArray(m.content) && m.content.length === 0) msgs.splice(i, 1);
		}
	},
}));

vi.mock("../toolcall-args-truncator.js", () => ({ truncateToolCallArgs: vi.fn() }));

// ── helpers ──
function mkState(): ContextState {
	return {
		agingTracker: new Map(), agingSnapshot: new Map(),
		manuallyDeletedIds: new Set(), agingDeletedIds: new Set(),
		seenArgs: new Set(), truncatedToolCallIds: new Set(),
		lastMessages: [], sessionId: "",
	};
}
function mkPi() { return { events: { emit: vi.fn() } }; }
function mkMsg(tcId: string, text: string, toolName = "bash"): any[] {
	return [
		{ role: "assistant", content: [{ type: "toolCall", id: tcId, name: toolName, arguments: {} }] },
		{ role: "toolResult", toolCallId: tcId, toolName, content: [{ type: "text", text }] },
	];
}
function remaining(msgs: any[]): string[] {
	return msgs.filter((m: any) => m.role === "toolResult").map((m: any) => m.toolCallId);
}

function trigger(state: ContextState, msgs: any[], pi: any, ctx?: any) {
	handleContextEvent({ messages: msgs }, ctx ?? {}, state, pi);
}

// ═══════════════════════════════════════════
// 1. aging 基本递增和删除
// ═══════════════════════════════════════════
describe("aging 基本流程", () => {
	it("每轮 +1，达到阈值后删除并加入 agingDeletedIds", () => {
		const state = mkState();
		const pi = mkPi();
		// 轮 1-2: 保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-1", "hello")];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-1"]);
		}
		// 轮 3: 达到阈值 → 删除
		const msgs3 = [...mkMsg("tc-1", "hello")];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
		// 已加入 agingDeletedIds
		expect(state.agingDeletedIds.has("tc-1")).toBe(true);
	});

	it("agingDeletedIds 中已有 tcId → 直接跳过", () => {
		const state = mkState();
		state.agingDeletedIds.add("tc-old");
		const pi = mkPi();
		const msgs = [...mkMsg("tc-old", "old data"), ...mkMsg("tc-new", "new data")];
		trigger(state, msgs, pi);
		expect(remaining(msgs)).toEqual(["tc-new"]);
	});

	it("达到阈值删除后，下一轮即使消息中还有也跳过", () => {
		const state = mkState();
		const pi = mkPi();
		// 跑 3 轮让 tc-1 达到阈值
		for (let r = 0; r < 3; r++) {
			const msgs = [...mkMsg("tc-1", "hello")];
			trigger(state, msgs, pi);
		}
		expect(state.agingDeletedIds.has("tc-1")).toBe(true);
		// 再一轮，消息中还有 tc-1
		const msgs4 = [...mkMsg("tc-1", "hello"), ...mkMsg("tc-2", "world")];
		trigger(state, msgs4, pi);
		expect(remaining(msgs4)).toEqual(["tc-2"]);
	});
});

// ═══════════════════════════════════════════
// 2. distill + aging 统一流程
// ═══════════════════════════════════════════
describe("distill + aging 统一流程", () => {
	it("大结果（≥distillThreshold）effectiveThreshold=2", () => {
		const state = mkState();
		const pi = mkPi();
		// distillThreshold=100 → 500 字符 ≈ 125 tokens → 大结果
		const bigText = "x".repeat(500);
		// 轮 1: 保留 + 提示
		const msgs1 = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs1, pi);
		expect(remaining(msgs1)).toEqual(["tc-big"]);
		// 轮 2: 删除
		const msgs2 = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs2, pi);
		expect(remaining(msgs2)).toEqual([]);
		expect(state.agingDeletedIds.has("tc-big")).toBe(true);
	});

	it("小结果用 agingThreshold（不经过 distill 通道）", () => {
		const state = mkState();
		const pi = mkPi();
		const smallText = "hi"; // ~1 token, 远小于 distillThreshold=100
		// 轮 1-2: 保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-small", smallText)];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-small"]);
		}
		// 轮 3: 达到 agingThreshold=3 → 删除
		const msgs3 = [...mkMsg("tc-small", smallText)];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
	});

	it("大结果和小结果混合，各自按自己的阈值", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		const smallText = "hi";

		// 轮 1: 两个都在
		const msgs1 = [...mkMsg("tc-big", bigText), ...mkMsg("tc-small", smallText)];
		trigger(state, msgs1, pi);
		expect(remaining(msgs1).sort()).toEqual(["tc-big", "tc-small"]);

		// 轮 2: tc-big 达到阈值 2 → 删, tc-small 还在
		const msgs2 = [...mkMsg("tc-big", bigText), ...mkMsg("tc-small", smallText)];
		trigger(state, msgs2, pi);
		expect(remaining(msgs2)).toEqual(["tc-small"]);

		// 轮 3: tc-small 达到阈值 3 → 删
		const msgs3 = [...mkMsg("tc-small", smallText)];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
	});
});

// ═══════════════════════════════════════════
// 3. distill 首次提示文案
// ═══════════════════════════════════════════
describe("distill 首次提示", () => {
	it("大结果 count=1 时给提示告诉 AI 用精确方法", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		const msgs = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs, pi);
		// 检查 pi.events.emit 被调用的提示
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).toContain("ephemeral:hint");
	});

	it("大结果 count=2 删除时静默（不给提示）", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		// 轮 1
		trigger(state, [...mkMsg("tc-big", bigText)], pi);
		pi.events.emit.mockClear();
		// 轮 2: 删除
		trigger(state, [...mkMsg("tc-big", bigText)], pi);
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).not.toContain("ephemeral:hint");
	});

	it("小结果不给 distill 提示", () => {
		const state = mkState();
		const pi = mkPi();
		const msgs = [...mkMsg("tc-small", "hi")];
		trigger(state, msgs, pi);
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).not.toContain("ephemeral:hint");
	});
});

// ═══════════════════════════════════════════
// 4. manuallyDeletedIds
// ═══════════════════════════════════════════
describe("manuallyDeletedIds", () => {
	it("手动删除的 tcId 不再出现", () => {
		const state = mkState();
		state.manuallyDeletedIds.add("tc-del");
		const pi = mkPi();
		const msgs = [...mkMsg("tc-del", "data"), ...mkMsg("tc-keep", "data")];
		trigger(state, msgs, pi);
		expect(remaining(msgs)).toEqual(["tc-keep"]);
	});
});

// ═══════════════════════════════════════════
// 5. agingSnapshot 更新
// ═══════════════════════════════════════════
describe("agingSnapshot", () => {
	it("每轮更新 agingSnapshot 反映当前计数", () => {
		const state = mkState();
		const pi = mkPi();
		trigger(state, [...mkMsg("tc-1", "hi")], pi);
		expect(state.agingSnapshot.get("tc-1")).toBe(1);
		trigger(state, [...mkMsg("tc-1", "hi")], pi);
		expect(state.agingSnapshot.get("tc-1")).toBe(2);
	});
});

// ═══════════════════════════════════════════
// 6. agingThreshold=0 禁用（需要单独 mock 配置，跳过集成测试）
// ═══════════════════════════════════════════
// 此场景由单元测试覆盖
