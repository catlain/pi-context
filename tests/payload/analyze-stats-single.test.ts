/**
 * analyze.ts 测试 — doStats + doSingle
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TMP = join(tmpdir(), "pi-payload-analyzer-test-stats-single");
const RECORDINGS_TMP = join(TMP, "recordings");

vi.mock("../../payload/core.js", () => {
	const rd = require("path").join(require("os").tmpdir(), "pi-payload-analyzer-test-stats-single", "recordings");
	return {
		estTokens: (s: string) => Math.ceil(s.length / 4),
		fmtTok: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)),
		getText: (c: any) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((p: any) => p.type === "text").map((p: any) => p.text ?? "").join("\n") : ""),
		buildProviderToolCallIndex: (msgs: any[]) => {
			const m = new Map();
			for (const msg of msgs) {
				if (msg.tool_calls) for (const tc of msg.tool_calls) m.set(tc.id, { name: tc.function.name, argsStr: tc.function.arguments });
			}
			return m;
		},
		classifyStatus: (s: string) =>
			s.includes("[processed]") ? "TRUNCATED" : s.length / 4 >= 500 ? "FULL_KEPT" : "SMALL",
		readJsonFile: (p: string) => { try { return JSON.parse(require("fs").readFileSync(p, "utf-8")); } catch { return null; } },
		RECORDINGS_DIR: rd,
		listSessions: () => [],
		listRecordings: () => [],
	};
});

vi.mock("../../payload/files.js", () => {
	const RECORDINGS = require("path").join(require("os").tmpdir(), "pi-payload-analyzer-test-stats-single", "recordings");
	return {
		getRecordingFiles: () => {
			const fs = require("fs"); const path = require("path");
			if (!fs.existsSync(RECORDINGS)) return null;
			const e = fs.readdirSync(RECORDINGS).filter((f: string) => f.startsWith("req-") && f.endsWith(".json")).sort().map((f: string) => ({ filename: f, path: path.join(RECORDINGS, f) }));
			return e.length ? e : null;
		},
		collectTimeline: () => new Map(),
		collectTimelineByTcId: () => new Map(),
	};
});

import { doSingle } from "../../payload/analyze.js";
import { doStats } from "../../payload/stats.js";

beforeEach(() => { mkdirSync(RECORDINGS_TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

function writeReq(filename: string, data: any) {
	writeFileSync(join(RECORDINGS_TMP, filename), JSON.stringify(data));
}

describe("doStats", () => {
	it("无录制文件时提示", () => {
		expect(doStats()).toContain("没找到");
	});

	it("正常统计包含百分比", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "tc1", content: "short" },
			],
		});
		const r = doStats();
		expect(r).toContain("SMALL");
		expect(r).toContain("100%");
	});

	it("多状态混合", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [
					{ id: "tc1", function: { name: "bash", arguments: "{}" } },
					{ id: "tc2", function: { name: "read", arguments: "{}" } },
				]},
				{ role: "tool", tool_call_id: "tc1", content: "[processed] truncated" },
				{ role: "tool", tool_call_id: "tc2", content: "a".repeat(3000) },
			],
		});
		const r = doStats();
		expect(r).toContain("TRUNCATED");
		expect(r).toContain("FULL_KEPT");
	});
});

describe("doSingle", () => {
	it("文件不存在返回错误", () => {
		expect(doSingle("/nonexistent.json")).toContain("文件不存在");
	});

	it("正常分析包含工具名和统计", () => {
		writeReq("test-single.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "bash", arguments: '{"command":"ls"}' } }] },
				{ role: "tool", tool_call_id: "tc1", content: "file1\nfile2\nfile3" },
			],
		});
		const r = doSingle(join(RECORDINGS_TMP, "test-single.json"));
		expect(r).toContain("bash");
		expect(r).toContain("总消息: 2");
		expect(r).toContain("SMALL");
	});

	it("distill 标记内容分类为 SMALL", () => {
		writeReq("test-distill.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "tc1", content: "[distilled read] some/path Original: ~5000 tokens\nPreview..." },
			],
		});
		expect(doSingle(join(RECORDINGS_TMP, "test-distill.json"))).toContain("SMALL");
	});

	it("最后 8 个 tool 结果", () => {
		const tcs = Array.from({ length: 10 }, (_, i) => ({ id: `tc${i}`, function: { name: `tool${i}`, arguments: "{}" } }));
		writeReq("test-many.json", {
			messages: [
				{ role: "assistant", tool_calls: tcs },
				...tcs.map(tc => ({ role: "tool", tool_call_id: tc.id, content: `result-${tc.id}` })),
			],
		});
		expect(doSingle(join(RECORDINGS_TMP, "test-many.json"))).toContain("tool9");
	});
});
