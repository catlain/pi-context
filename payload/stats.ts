/**
 * stats action — 聚合统计 distill/processor 命中率
 */

import {
	getText,
	classifyStatus,
	readJsonFile,
} from "./core.js";
import { getRecordingFiles, collectTimelineByTcId } from "./files.js";
import { foldChainEntries } from "./format.js";

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

// chain-tcid: 按 toolCallId 追踪，验证 distill 行为

export function doChainTcId(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const timeline = collectTimelineByTcId(files);
	const chains = [...timeline.entries()]
		.filter(([, entries]) => {
			const maxTok = Math.max(...entries.map(e => e.tokens));
			return entries.length >= 2 && maxTok >= 400;
		})
		.sort((a, b) => Math.max(...b[1].map(e => e.tokens)) - Math.max(...a[1].map(e => e.tokens)));

	if (!chains.length) return "没找到重复出现的超阈值 toolCallId";

	const lines2 = [`tcId 链路追踪 (${chains.length} 个重复超阈值 tcId):`];
	for (const [tcid, entries] of chains) {
		lines2.push(`\n  tcId: ${tcid.slice(0, 24)}... (${entries.length} 次出现)`);
		lines2.push(...foldChainEntries(entries));
		const kept = entries.filter(e => e.status === "FULL_KEPT");
		if (kept.length === entries.length) {
			lines2.push("    ⚠️  全部 FULL_KEPT — distill 未生效（旧 tcId 未被静默删除）");
		} else if (kept.length > 0) {
			lines2.push(`    ✅ 首次保留(req-${kept[0].req}) → 后续 ${entries.length - kept.length} 次正确消失`);
		} else {
			lines2.push(`    ⚠️  无 FULL_KEPT 出现 — tcId 在所有 payload 中都被截断/删除`);
		}
	}
	return lines2.join("\n");
}

