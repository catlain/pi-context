/**
 * aging 技能文件豁免测试
 *
 * 覆盖：内联技能 / npm 技能 / 参考文件 / 非技能文件 / 非 read 工具 / path 缺失 / 混合场景
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "../handle-context.js";

// ── Mocks ──
let mockConfig: Record<string, number>;

vi.mock("@earendil-works/pi-coding-agent", () => ({
	registerExtension: vi.fn(),
	registerCommand: vi.fn(),
	registerTool: vi.fn(),
}));

vi.mock("../shared.js", () => ({
	getContextConfig: () => mockConfig,
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: {
		distillWarning: "📋 「{label}」~{tokens} tokens，下轮移除。",
		distillWarningShort: "📋 「{label}」下轮移除",
		distillOverCapWarning: "⚠️ 「{label}」~{tokens} > {cap}，已直接移除。",
		distillOverCapWarningShort: "⚠️ 「{label}」已移除",
		agingWarning: "[aging] {label} 轮数={count}",
		agingWarningShort: "[aging] {label}",
	},
	fillTemplate: (t: string, v: Record<string, string>) =>
		t.replace(/\{(\w+)\}/g, (_: string, k: string) => v[k] ?? `{${k}}`),
}));

vi.mock("../distill-helpers.js", async (orig) => ({
	...(await orig<typeof import("../distill-helpers.js")>()),
	estimateTokens: () => 500, // < distillThreshold → 走 aging 路径
}));

vi.mock("../toolcall-args-truncator.js", () => ({
	truncateToolCallArgs: vi.fn(),
}));

// ── Helpers ──
const AGENT_DIR = "/home/lain/.pi/agent";

const mkState = (): ContextState => ({
	agingTracker: new Map(), agingSnapshot: new Map(),
	manuallyDeletedIds: new Set(), agingDeletedIds: new Set(),
	seenArgs: new Set(), truncatedToolCallIds: new Set(),
	lastMessages: [], sessionId: "",
});
const mkPi = () => ({ events: { emit: vi.fn() } });

const mkReadMsg = (tcId: string, path: string, text: string) => [
	{ role: "assistant", content: [{ type: "toolCall", id: tcId, name: "read", arguments: { path } }] },
	{ role: "toolResult", toolCallId: tcId, toolName: "read", content: [{ type: "text", text }] },
];
const mkToolMsg = (tcId: string, toolName: string, args: any, text: string) => [
	{ role: "assistant", content: [{ type: "toolCall", id: tcId, name: toolName, arguments: args }] },
	{ role: "toolResult", toolCallId: tcId, toolName, content: [{ type: "text", text }] },
];
const rem = (msgs: any[]) => msgs.filter((m: any) => m.role === "toolResult").map((m: any) => m.toolCallId);

async function trigger(s: ContextState, msgs: any[], pi: any) {
	const { handleContextEvent } = await import("../handle-context.js");
	handleContextEvent({ messages: msgs }, {}, s, pi);
}

// ── Tests ──
describe("aging 技能文件豁免", () => {
	beforeEach(() => {
		mockConfig = { distillThreshold: 1000, agingThreshold: 3, processorThreshold: 0, firstSeenCap: 15000 };
	});

	it("内联技能 SKILL.md 豁免 aging", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkReadMsg("tc1", `${AGENT_DIR}/skills/code-graph/SKILL.md`, "x".repeat(200));
		for (let i = 0; i < 5; i++) await trigger(mkState(), [...mkReadMsg("tc1", `${AGENT_DIR}/skills/code-graph/SKILL.md`, "x".repeat(200))], mkPi());
		// 单独验证：同一个 state 跑多轮
		const s2 = mkState(), pi2 = mkPi();
		const msgs2 = mkReadMsg("s1", `${AGENT_DIR}/skills/code-graph/SKILL.md`, "x".repeat(200));
		for (let i = 0; i < 5; i++) await trigger(s2, [...msgs2], pi2);
		expect(rem(s2.lastMessages)).toContain("s1");
	});

	it("内联技能参考文件（references/*.md）豁免", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkReadMsg("s2", `${AGENT_DIR}/skills/frontend-test/references/echarts-events.md`, "x".repeat(200));
		for (let i = 0; i < 5; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("s2");
	});

	it("npm 技能文件豁免", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkReadMsg("s3", `${AGENT_DIR}/npm/node_modules/pi-agent-codebase-workflows/skills/safe-change/SKILL.md`, "x".repeat(200));
		for (let i = 0; i < 5; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("s3");
	});

	it("非技能文件正常 aging 删除", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkReadMsg("n1", "/home/lain/project/src/index.ts", "x".repeat(200));
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("n1");
	});

	it("非 read 工具不豁免", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkToolMsg("g1", "grep", { pattern: "test", path: `${AGENT_DIR}/skills/` }, "x".repeat(200));
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("g1");
	});

	it("path 为 undefined 不豁免", async () => {
		const s = mkState(), pi = mkPi();
		const msgs = mkToolMsg("np1", "read", {}, "x".repeat(200));
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("np1");
	});

	it("技能 + 非技能混合：技能保留、非技能删除", async () => {
		const s = mkState(), pi = mkPi();
		const skillMsg = mkReadMsg("sk", `${AGENT_DIR}/skills/code-graph/SKILL.md`, "x".repeat(200));
		const otherMsg = mkReadMsg("ns", "/tmp/other.txt", "x".repeat(200));
		for (let i = 0; i < 4; i++) {
			await trigger(s, [...skillMsg, ...otherMsg], pi);
		}
		const remaining = rem(s.lastMessages);
		expect(remaining).toContain("sk");
		expect(remaining).not.toContain("ns");
	});
});
