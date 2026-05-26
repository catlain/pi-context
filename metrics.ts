/**
 * payload-analyzer 指标分析: budget / growth
 *
 * expensive 在独立文件 expensive.ts 中。
 */

import {
	estTokens, fmtTok, getText,
	readJsonFile,
} from "./core.js";
import { type RecordingEntry, getRecordingFiles } from "./files.js";
export { doExpensive } from "./expensive.js";

// ════════════════════════════════════════════════════════════
// budget: Token 预算分析
// ════════════════════════════════════════════════════════════

export function doBudget(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const lines = [
		"Token 预算分析",
		"=".repeat(80),
		`   ${"Req".padEnd(6)} ${"Model".padEnd(18)} ${"Total".padStart(8)} ${"System".padStart(8)} ${"Tools".padStart(8)} ${"History".padStart(8)} ${"Msgs".padStart(5)}`,
		`   ${"─".repeat(6)} ${"─".repeat(18)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(5)}`,
	];

	let totalTokens = 0;
	let totalSystem = 0;
	let totalTools = 0;

	for (const { path, filename } of files) {
		const data = readJsonFile(path);
		if (!data) continue;

		const msgs = data.messages ?? [];
		const tools = data.tools ?? [];
		const model = (data.model ?? "?").slice(0, 16);

		const sysMsg = msgs.find((m: any) => m.role === "system" || m.role === "developer");
		const sysTokens = sysMsg ? estTokens(getText(sysMsg.content)) : 0;
		const toolsTokens = tools.reduce((s: number, t: any) => s + estTokens(JSON.stringify(t)), 0);

		let histTokens = 0;
		for (const m of msgs) {
			if (m === sysMsg) continue;
			histTokens += estTokens(getText(m.content));
			if (m.role === "assistant" && m.tool_calls) {
				histTokens += estTokens(JSON.stringify(m.tool_calls));
			}
		}

		const reqTotal = sysTokens + toolsTokens + histTokens;
		totalTokens += reqTotal;
		totalSystem += sysTokens;
		totalTools += toolsTokens;

		const reqNum = filename.split("-")[1];
		lines.push(`   ${reqNum.padEnd(6)} ${model.padEnd(18)} ${fmtTok(reqTotal).padStart(8)} ${fmtTok(sysTokens).padStart(8)} ${fmtTok(toolsTokens).padStart(8)} ${fmtTok(histTokens).padStart(8)} ${String(msgs.length).padStart(5)}`);
	}

	lines.push(`   ${"─".repeat(80)}`);
	lines.push(`   ${"合计".padEnd(6)} ${"".padEnd(18)} ${fmtTok(totalTokens).padStart(8)} ${fmtTok(totalSystem).padStart(8)} ${fmtTok(totalTools).padStart(8)}`);

	return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// growth: 上下文增长趋势
// ════════════════════════════════════════════════════════════

export function doGrowth(sessionId?: string): string {
	const files = getRecordingFiles(sessionId);
	if (!files) return `没找到 req-*.json${sessionId ? ` (session: ${sessionId})` : ""}`;

	const dataPoints: Array<{
		req: string; model: string; totalTokens: number;
		msgCount: number; delta: number;
	}> = [];

	let prevTotal = 0;

	for (const { path, filename } of files) {
		const data = readJsonFile(path);
		if (!data) continue;

		const msgs = data.messages ?? [];
		const model = (data.model ?? "?").slice(0, 12);
		let total = 0;
		for (const m of msgs) {
			total += estTokens(getText(m.content));
			if (m.role === "assistant" && m.tool_calls) {
				total += estTokens(JSON.stringify(m.tool_calls));
			}
		}

		const delta = prevTotal > 0 ? total - prevTotal : 0;
		dataPoints.push({
			req: filename.split("-")[1], model, totalTokens: total,
			msgCount: msgs.length, delta,
		});
		prevTotal = total;
	}

	const maxTok = Math.max(...dataPoints.map(d => d.totalTokens));
	const scale = maxTok > 0 ? 40 / maxTok : 1;

	const lines = [
		"上下文增长趋势",
		"=".repeat(80),
		`   ${"Req".padEnd(6)} ${"Msgs".padStart(5)} ${"Total".padStart(8)} ${"Delta".padStart(8)} ${"Model".padEnd(14)} 趋势`,
		`   ${"─".repeat(6)} ${"─".repeat(5)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(14)} ${"─".repeat(40)}`,
	];

	for (const d of dataPoints) {
		const bar = "█".repeat(Math.max(1, Math.round(d.totalTokens * scale)));
		const deltaStr = d.delta > 0 ? `+${fmtTok(d.delta)}` : d.delta < 0 ? fmtTok(d.delta) : "-";
		lines.push(`   ${d.req.padEnd(6)} ${String(d.msgCount).padStart(5)} ${fmtTok(d.totalTokens).padStart(8)} ${deltaStr.padStart(8)} ${d.model.padEnd(14)} ${bar}`);
	}

	const first = dataPoints[0];
	const last = dataPoints[dataPoints.length - 1];
	const growth = last.totalTokens - first.totalTokens;
	const avgDelta = Math.round(growth / Math.max(dataPoints.length - 1, 1));

	lines.push(`\n   起始: ${fmtTok(first.totalTokens)} → 终止: ${fmtTok(last.totalTokens)}  |  总增长: ${growth > 0 ? "+" : ""}${fmtTok(growth)}  |  平均每请求: ${fmtTok(avgDelta)}`);

	const bigJumps = dataPoints.filter(d => d.delta > avgDelta * 2 && d.delta > 1000);
	if (bigJumps.length > 0) {
		lines.push(`\n   ⚡ 大跳变 (>2x 平均):`);
		for (const j of bigJumps) {
			lines.push(`      req-${j.req}: +${fmtTok(j.delta)} (${j.model})`);
		}
	}

	return lines.join("\n");
}
