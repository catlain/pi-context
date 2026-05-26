/**
 * handleContextEvent 集成测试 — manifest 会话隔离、agingDeletedIds 持久化
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleContextEvent, ContextState } from "../handle-context.js";

// ── mocks ──
const mockLoadManifest = vi.fn();
const mockSaveManifest = vi.fn();

vi.mock("../shared.js", () => ({
	getContextConfig: () => ({ distillThreshold: 100, agingThreshold: 3, processorThreshold: 0 }),
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: (...a: any[]) => mockSaveManifest(...a),
	loadManifest: (...a: any[]) => mockLoadManifest(...a),
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
function mkMsg(tcId: string, text: string): any[] {
	return [
		{ role: "assistant", content: [{ type: "toolCall", id: tcId, name: "bash", arguments: {} }] },
		{ role: "toolResult", toolCallId: tcId, toolName: "bash", content: [{ type: "text", text }] },
	];
}
function remaining(msgs: any[]): string[] {
	return msgs.filter((m: any) => m.role === "toolResult").map((m: any) => m.toolCallId);
}
function trigger(state: ContextState, msgs: any[], pi: any, ctx?: any) {
	handleContextEvent({ messages: msgs }, ctx ?? {}, state, pi);
}

// ═══════════════════════════════════════════
// 1. manifest 会话隔离
// ═══════════════════════════════════════════
describe("manifest 会话隔离", () => {
	beforeEach(() => {
		mockLoadManifest.mockReset();
		mockSaveManifest.mockReset();
		// 默认不加载任何 manifest 数据
		mockLoadManifest.mockImplementation(() => {});
	});

	it("sessionId 变化时调用 loadManifest", () => {
		const state = mkState();
		const pi = mkPi();
		const ctx1 = { sessionManager: { getSessionId: () => "sess-1" } };
		const ctx2 = { sessionManager: { getSessionId: () => "sess-2" } };

		trigger(state, [...mkMsg("tc-1", "hi")], pi, ctx1);
		expect(mockLoadManifest).toHaveBeenCalledTimes(1);
		expect(mockLoadManifest).toHaveBeenCalledWith("sess-1", expect.anything());

		trigger(state, [...mkMsg("tc-1", "hi")], pi, ctx1);
		// 同一个 sessionId，不再调用
		expect(mockLoadManifest).toHaveBeenCalledTimes(1);

		trigger(state, [...mkMsg("tc-1", "hi")], pi, ctx2);
		expect(mockLoadManifest).toHaveBeenCalledTimes(2);
		expect(mockLoadManifest).toHaveBeenCalledWith("sess-2", expect.anything());
	});

	it("loadManifest 恢复 agingDeletedIds 后，被删除的 tcId 直接跳过", () => {
		const state = mkState();
		const pi = mkPi();
		// 模拟 loadManifest 恢复 agingDeletedIds
		mockLoadManifest.mockImplementation((_sid: string, sets: any) => {
			sets.agingDeleted.add("tc-old-deleted");
		});

		const ctx = { sessionManager: { getSessionId: () => "sess-1" } };
		const msgs = [...mkMsg("tc-old-deleted", "old"), ...mkMsg("tc-alive", "alive")];
		trigger(state, msgs, pi, ctx);

		expect(remaining(msgs)).toEqual(["tc-alive"]);
	});

	it("loadManifest 恢复 manuallyDeletedIds 后，手动删除的 tcId 跳过", () => {
		const state = mkState();
		const pi = mkPi();
		mockLoadManifest.mockImplementation((_sid: string, sets: any) => {
			sets.manuallyDeleted.add("tc-manual");
		});

		const ctx = { sessionManager: { getSessionId: () => "sess-1" } };
		const msgs = [...mkMsg("tc-manual", "manual"), ...mkMsg("tc-alive", "alive")];
		trigger(state, msgs, pi, ctx);

		expect(remaining(msgs)).toEqual(["tc-alive"]);
	});

	it("loadManifest 同时恢复 agingDeleted + manuallyDeleted", () => {
		const state = mkState();
		const pi = mkPi();
		mockLoadManifest.mockImplementation((_sid: string, sets: any) => {
			sets.agingDeleted.add("tc-aged");
			sets.manuallyDeleted.add("tc-man");
		});

		const ctx = { sessionManager: { getSessionId: () => "sess-1" } };
		const msgs = [...mkMsg("tc-aged", "aged"), ...mkMsg("tc-man", "manual"), ...mkMsg("tc-alive", "alive")];
		trigger(state, msgs, pi, ctx);

		expect(remaining(msgs)).toEqual(["tc-alive"]);
	});
});

// ═══════════════════════════════════════════
// 2. toRemove index 排序（splice 顺序 bug 回归测试）
// ═══════════════════════════════════════════
describe("toRemove index 排序", () => {
	beforeEach(() => {
		mockLoadManifest.mockReset();
		mockLoadManifest.mockImplementation(() => {});
	});

	it("多个不同通道的删除（agingDeleted + manuallyDeleted）index 必须正确", () => {
		const state = mkState();
		const pi = mkPi();
		// 直接设置：tc-aged 在 agingDeletedIds，tc-man 在 manuallyDeletedIds
		state.agingDeletedIds.add("tc-aged");
		state.manuallyDeletedIds.add("tc-man");

		const msgs = [
			...mkMsg("tc-man", "manual"),
			...mkMsg("tc-aged", "aged"),
			...mkMsg("tc-alive", "alive"),
		];
		trigger(state, msgs, pi);

		expect(remaining(msgs)).toEqual(["tc-alive"]);
	});

	it("混合 aging 达到阈值 + manuallyDeleted 的 index 排序", () => {
		const state = mkState();
		const pi = mkPi();
		state.manuallyDeletedIds.add("tc-man");

		// 先跑 2 轮让 tc-aging 计数到 2（不包含 tc-alive，避免它也被计数）
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-aging", "hi"), ...mkMsg("tc-man", "manual")];
			trigger(state, msgs, pi);
		}

		// 第 3 轮：tc-aging 达到阈值 3，tc-man 被 manuallyDeleted 删除，tc-alive 首次出现
		const msgs3 = [...mkMsg("tc-aging", "hi"), ...mkMsg("tc-man", "manual"), ...mkMsg("tc-alive", "alive")];
		trigger(state, msgs3, pi);

		expect(remaining(msgs3)).toEqual(["tc-alive"]);
	});
});
