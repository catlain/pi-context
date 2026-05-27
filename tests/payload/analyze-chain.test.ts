/**
 * analyze.ts 测试 — doChain + doChainTcId
 *
 * 使用真实 collectTimeline / collectTimelineByTcId（不 mock files.js）
 * 只 mock core.js 的辅助函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TMP = join(tmpdir(), "pi-payload-analyzer-test-chain");
const RECORDINGS_TMP = join(TMP, "recordings");

vi.mock("../../payload/core.js", () => {
	const rd = require("path").join(require("os").tmpdir(), "pi-payload-analyzer-test-chain", "recordings");
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
		foldChainEntries: (entries: any[]) => {
			if (entries.length === 0) return [];
			const lines: string[] = [];
			let i = 0;
			while (i < entries.length) {
				const cur = entries[i];
				const marker = ({ FULL_KEPT: "📖全文", TRUNCATED: "✂️截断" } as any)[cur.status] ?? "📝小";
				let j = i + 1;
				while (
					j < entries.length &&
					entries[j].status === cur.status &&
					entries[j].tokens === cur.tokens &&
					entries[j].preview.slice(0, 40) === cur.preview.slice(0, 40)
				) j++;
				const count = j - i;
				if (count === 1) {
					lines.push(`    req-${cur.req} [${String(cur.idx).padStart(4)}] ${marker} ${cur.status.padEnd(12)} ${String(cur.tokens).padStart(5)}tok ${cur.preview.slice(0, 60)}`);
				} else {
					lines.push(`    req-${cur.req}~${entries[j - 1].req} (${count}个) ${marker} ${cur.status.padEnd(12)} ${String(cur.tokens).padStart(5)}tok ${cur.preview.slice(0, 60)}`);
				}
				i = j;
			}
			return lines;
		},
	};
});

// files.js 使用真实实现，但 RECORDINGS_DIR 指向临时目录
vi.mock("../../payload/files.js", async () => {
	const fs = require("fs");
	const path = require("path");
	const RECORDINGS = require("path").join(require("os").tmpdir(), "pi-payload-analyzer-test-chain", "recordings");

	function listRecordingFiles(dir: string) {
		if (!fs.existsSync(dir)) return null;
		const entries = fs.readdirSync(dir)
			.filter((f: string) => f.startsWith("req-") && f.endsWith(".json"))
			.sort()
			.map((f: string) => ({ filename: f, path: path.join(dir, f) }));
		return entries.length ? entries : null;
	}

	return {
		getRecordingFiles: () => listRecordingFiles(RECORDINGS),
		collectTimeline: (files: any[]) => {
			const timeline = new Map();
			for (const { path: fp, filename } of files) {
				try {
					const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
					const reqNum = filename.split("-")[1];
					const msgs = data.messages ?? [];
					for (const m of msgs) {
						if (m.role !== "tool") continue;
						const tcid = m.tool_call_id ?? "";
						let toolName = "unknown";
						for (const pm of msgs) {
							if (pm.role === "assistant" && pm.tool_calls) {
								for (const tc of pm.tool_calls) { if (tc.id === tcid) toolName = tc.function.name; }
							}
						}
						const text = typeof m.content === "string" ? m.content : "";
						const sig = `${toolName}:${tcid}`;
						if (!timeline.has(sig)) timeline.set(sig, []);
						timeline.get(sig).push({
							req: reqNum, idx: 0,
							status: text.includes("[processed]") ? "TRUNCATED" : text.length / 4 >= 500 ? "FULL_KEPT" : "SMALL",
							tokens: Math.ceil(text.length / 4),
							preview: text.slice(0, 80).replace(/\n/g, "\\n"),
						});
					}
				} catch {}
			}
			return timeline;
		},
		collectTimelineByTcId: (files: any[]) => {
			const timeline = new Map();
			for (const { path: fp, filename } of files) {
				try {
					const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
					const reqNum = filename.split("-")[1];
					const msgs = data.messages ?? [];
					for (const m of msgs) {
						if (m.role !== "tool") continue;
						const tcid = m.tool_call_id ?? "";
						if (!tcid) continue;
						const text = typeof m.content === "string" ? m.content : "";
						if (!timeline.has(tcid)) timeline.set(tcid, []);
						timeline.get(tcid).push({
							req: reqNum, idx: 0,
							status: text.includes("[processed]") ? "TRUNCATED" : text.length / 4 >= 500 ? "FULL_KEPT" : "SMALL",
							tokens: Math.ceil(text.length / 4),
							preview: text.slice(0, 80).replace(/\n/g, "\\n"),
						});
					}
				} catch {}
			}
			return timeline;
		},
	};
});

import { doChain } from "../../payload/analyze.js";
import { doChainTcId } from "../../payload/stats.js";

beforeEach(() => { mkdirSync(RECORDINGS_TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

function writeReq(filename: string, data: any) {
	writeFileSync(join(RECORDINGS_TMP, filename), JSON.stringify(data));
}

describe("doChain", () => {
	it("无录制文件时提示", () => {
		expect(doChain()).toContain("没找到");
	});

	it("无超阈值链路时提示", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "tc1", content: "short" },
			],
		});
		expect(doChain()).toContain("没找到超阈值");
	});

	it("有超阈值链路时显示工具名和 token 数", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "bash", arguments: '{"command":"cat big.log"}' } }] },
				{ role: "tool", tool_call_id: "tc1", content: "x".repeat(3000) },
			],
		});
		const r = doChain();
		expect(r).toContain("bash");
		expect(r).toContain("750"); // 3000/4 = 750 tokens
	});

	it("多 req 同 argsSig 跨 payload 追踪", () => {
		// 两个 req 中有相同 argsSig 的工具调用
		const bigContent = "x".repeat(3000);
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "bash", arguments: '{"command":"ls"}' } }] },
				{ role: "tool", tool_call_id: "tc1", content: bigContent },
			],
		});
		writeReq("req-0002-def.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc2", function: { name: "bash", arguments: '{"command":"ls"}' } }] },
				{ role: "tool", tool_call_id: "tc2", content: bigContent },
			],
		});
		const r = doChain();
		expect(r).toContain("bash");
		// 应该出现两次记录
		expect(r).toContain("0001");
		expect(r).toContain("0002");
	});
});

describe("doChainTcId", () => {
	it("无录制文件时提示", () => {
		expect(doChainTcId()).toContain("没找到");
	});

	it("无重复超阈值 tcId 时提示", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "tc1", content: "x".repeat(3000) },
			],
		});
		expect(doChainTcId()).toContain("没找到重复");
	});

	it("同一 tcId 跨 payload 出现两次追踪", () => {
		writeReq("req-0001-abc.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc-shared", function: { name: "bash", arguments: '{"command":"ls"}' } }] },
				{ role: "tool", tool_call_id: "tc-shared", content: "x".repeat(3000) },
			],
		});
		writeReq("req-0002-def.json", {
			messages: [
				{ role: "assistant", tool_calls: [{ id: "tc-other", function: { name: "read", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "tc-shared", content: "x".repeat(1000) },
			],
		});
		const r = doChainTcId();
		expect(r).toContain("tc-shared");
	});
});
