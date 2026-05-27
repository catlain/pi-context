/**
 * payload-analyzer actions: list / single / chain / stats / chain-tcid
 *
 * overview 和 diff 在独立文件中。
 */

import { join, basename } from "path";
import {
	estTokens, fmtTok, getText,
	buildProviderToolCallIndex,
	classifyStatus,
	readJsonFile, RECORDINGS_DIR,
} from "./core.js";
import { listSessions, listRecordings } from "./files-core.js";
import {
	listRecordingFiles, getRecordingFiles,
	collectTimeline, collectTimelineByTcId,
	type RecordingEntry,
} from "./files.js";

export { doOverview } from "./overview.js";
export { doDiff } from "./diff.js";

// ════════════════════════════════════════════════════════════
// list: 列出 recordings
// ════════════════════════════════════════════════════════════

export function doList(sessionId?: string): string {
	const sessions = listSessions();

	// 有会话子目录时，按会话分组展示
	if (sessions.length > 0) {
		const lines = [`录制会话 (${sessions.length} 个):`];
		for (const s of sessions) {
			const mark = sessionId && s.sessionId === sessionId ? " ◀" : "";
			lines.push(`\n  📁 ${s.sessionId}${mark}`);
			lines.push(`     ${s.fileCount} 文件  ${(s.totalSize / 1024).toFixed(0)}KB  ${s.model}  ${s.firstTs}~${s.lastTs}`);

			// 如果指定了 sessionId 或只有一个会话，展示文件列表
			if (s.sessionId === sessionId || (!sessionId && sessions.length === 1)) {
				const files = listRecordings(s.sessionId);
				for (const f of files) {
					lines.push(`     ${f.filename.padEnd(40)}  ${(f.size / 1024).toFixed(1).padStart(6)}KB  ${f.msgCount} msgs  ${f.model}`);
				}
			}
		}
		return lines.join("\n");
	}

	// 兼容旧版扁平文件
	const files = listRecordingFiles(RECORDINGS_DIR);
	if (!files) return "没有录制文件";
	const lines = [`录制文件 (${files.length} 个):`];
	for (const { filename, path } of files) {
		let msgCount = 0;
		let model = "?";
		let size = 0;
		try {
			const stat = require("fs").statSync(path);
			size = stat.size;
			const data = readJsonFile(path);
			msgCount = data?.messages?.length ?? 0;
			model = data?.model ?? "?";
		} catch { /* ignore */ }
		lines.push(`  ${filename.padEnd(40)}  ${(size / 1024).toFixed(1).padStart(6)}KB  ${msgCount} msgs  ${model}`);
	}
	return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// single: 分析单个 payload
// ════════════════════════════════════════════════════════════

export function doSingle(payloadPath: string, threshold = 500): string {
	const data = readJsonFile(payloadPath);
	if (!data) return `文件不存在: ${payloadPath}`;

	const msgs = data.messages ?? [];
	const toolIdx = buildProviderToolCallIndex(msgs);

	const stats: Record<string, number> = { FULL_KEPT: 0, TRUNCATED: 0, SMALL: 0, _total: 0 };
	const results: Array<{
		idx: number; tool: string; status: string; tokens: number;
		preview: string; argsStr: string;
	}> = [];

	for (let i = 0; i < msgs.length; i++) {
		const m = msgs[i];
		if (m.role !== "tool") continue;
		const tcid = m.tool_call_id ?? "";
		const info = toolIdx.get(tcid) ?? { name: "unknown", argsStr: tcid };
		const text = getText(m.content);
		const tokens = estTokens(text);
		const status = classifyStatus(text, threshold);

		stats[status]++;
		stats._total++;
		results.push({ idx: i, tool: info.name, status, tokens, preview: text.slice(0, 80).replace(/\n/g, "\\n"), argsStr: info.argsStr });
	}

	const lines = [
		`分析: ${basename(payloadPath)}`,
		`总消息: ${msgs.length}`,
		"=".repeat(70),
		"\n📊 统计:",
		`  tool 结果: ${stats._total}`,
	];
	for (const s of ["FULL_KEPT", "TRUNCATED", "SMALL"]) {
		if (stats[s]) lines.push(`  ${s.padEnd(15)}: ${stats[s]}`);
	}

	// 追踪链（同 argsSig 出现多次的超阈值结果）
	const bySig = new Map<string, typeof results>();
	for (const r of results) {
		const sig = `${r.tool}:${r.argsStr}`;
		if (!bySig.has(sig)) bySig.set(sig, []);
		bySig.get(sig)!.push(r);
	}

	lines.push("\n📋 追踪链（同 argsSig 超阈值结果）:");
	let found = 0;
	for (const [sig, entries] of bySig) {
		const maxTok = Math.max(...entries.map(e => e.tokens));
		if (maxTok < 400) continue;
		const tool = entries[0].tool;
		lines.push(`\n  ${tool.padEnd(15)} args=${sig.slice(tool.length + 1, 61)}`);
		for (const e of entries) {
			lines.push(`    [${String(e.idx).padStart(4)}] ${e.status.padEnd(12)} ${String(e.tokens).padStart(5)}tok ${e.preview.slice(0, 70)}`);
		}
		found++;
	}
	if (!found) lines.push("  （无超阈值结果）");

	lines.push("\n📝 最后 8 个 tool 结果:");
	for (const r of results.slice(-8)) {
		lines.push(`  [${String(r.idx).padStart(4)}] ${r.tool.padEnd(20)} ${r.status.padEnd(12)} ${String(r.tokens).padStart(5)}tok`);
	}
	return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// chain: 跨 payload 追踪 argsSig
// ════════════════════════════════════════════════════════════

export function doChain(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const timeline = collectTimeline(files);
	const chains = [...timeline.entries()]
		.filter(([, entries]) => Math.max(...entries.map(e => e.tokens)) >= 400)
		.sort((a, b) => Math.max(...b[1].map(e => e.tokens)) - Math.max(...a[1].map(e => e.tokens)));

	if (!chains.length) return "没找到超阈值的链路";

	const lines = [`链路追踪 (${chains.length} 个超阈值 argsSig):`];
	for (const [sig, entries] of chains) {
		const tool = sig.split(":")[0];
		const preview = sig.slice(tool.length + 1, 61);
		lines.push(`\n  ${tool.padEnd(15)} | ${preview}`);
		for (const e of entries) {
			const marker = ({ FULL_KEPT: "📖全文", TRUNCATED: "✂️截断" } as any)[e.status] ?? "📝小";
			lines.push(`    req-${e.req} [${String(e.idx).padStart(4)}] ${marker} ${e.status.padEnd(12)} ${String(e.tokens).padStart(5)}tok ${e.preview.slice(0, 60)}`);
		}
		const statuses = entries.map(e => e.status);
		if (statuses.includes("FULL_KEPT")) {
			const fulls = entries.filter(e => e.status === "FULL_KEPT");
			if (fulls.length === entries.length) {
				lines.push("    ⚠️  全部 FULL_KEPT，等下一轮验证是否消失");
			} else {
				lines.push(`    ✅ 首次保留(req-${fulls[fulls.length - 1].req}) → 后续正确消失`);
			}
		}
	}
	return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// stats: 聚合统计
// ════════════════════════════════════════════════════════════

export function doStats(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const counts: Record<string, number> = { TRUNCATED: 0, FULL_KEPT: 0, SMALL: 0 };
	for (const { path } of files) {
		const data = readJsonFile(path);
		if (!data) continue;
		for (const m of data.messages ?? []) {
			if (m.role !== "tool") continue;
			const s = classifyStatus(getText(m.content));
			counts[s] = (counts[s] ?? 0) + 1;
		}
	}
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	const lines = [`统计: ${files.length} 个 payload, ${total} 个 tool 结果`];
	for (const s of ["TRUNCATED", "FULL_KEPT", "SMALL"]) {
		const pct = Math.round((counts[s] ?? 0) * 100 / Math.max(total, 1));
		lines.push(`  ${s.padEnd(20)}: ${String(counts[s] ?? 0).padStart(4)} (${pct}%)`);
	}
	return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// chain-tcid: 按 toolCallId 追踪，验证 distill 行为
// ════════════════════════════════════════════════════════════

export function doChainTcId(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const timeline = collectTimelineByTcId(files);
	// 只保留出现 >= 2 次、且有超阈值内容的 tcId
	const chains = [...timeline.entries()]
		.filter(([, entries]) => {
			const maxTok = Math.max(...entries.map(e => e.tokens));
			return entries.length >= 2 && maxTok >= 400;
		})
		.sort((a, b) => Math.max(...b[1].map(e => e.tokens)) - Math.max(...a[1].map(e => e.tokens)));

	if (!chains.length) return "没找到重复出现的超阈值 toolCallId";

	const lines = [`tcId 链路追踪 (${chains.length} 个重复超阈值 tcId):`];
	for (const [tcid, entries] of chains) {
		lines.push(`\n  tcId: ${tcid.slice(0, 24)}... (${entries.length} 次出现)`);
		for (const e of entries) {
			const marker = ({ FULL_KEPT: "📖全文", TRUNCATED: "✂️截断" } as any)[e.status] ?? "📝小";
			lines.push(`    req-${e.req} [${String(e.idx).padStart(4)}] ${marker} ${e.status.padEnd(12)} ${String(e.tokens).padStart(5)}tok ${e.preview.slice(0, 60)}`);
		}
		// 诊断：首次应该是 FULL_KEPT，后续应该消失
		const kept = entries.filter(e => e.status === "FULL_KEPT");
		if (kept.length === entries.length) {
			lines.push("    ⚠️  全部 FULL_KEPT — distill 未生效（旧 tcId 未被静默删除）");
		} else if (kept.length > 0) {
			lines.push(`    ✅ 首次保留(req-${kept[0].req}) → 后续 ${entries.length - kept.length} 次正确消失`);
		} else {
			lines.push(`    ⚠️  无 FULL_KEPT 出现 — tcId 在所有 payload 中都被截断/删除`);
		}
	}
	return lines.join("\n");
}
