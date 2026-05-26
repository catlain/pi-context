/**
 * expensive action — 找出最贵的工具调用
 */

import {
	estTokens, fmtTok, getText,
	buildProviderToolCallIndex,
	classifyStatus,
	readJsonFile, RECORDINGS_DIR,
} from "./core.js";

interface RecordingEntry { filename: string; path: string }

export function doExpensive(files: RecordingEntry[], topN = 20): string {
	// 收集所有 tool result
	const allResults: Array<{
		req: string; toolName: string; argsPreview: string;
		tokens: number; status: string;
	}> = [];

	for (const { path, filename } of files) {
		const data = readJsonFile(path);
		if (!data) continue;
		const msgs = data.messages ?? [];
		const toolIdx = buildProviderToolCallIndex(msgs);
		const reqNum = filename.split("-")[1];

		for (const m of msgs) {
			if (m.role !== "tool") continue;
			const tcid = m.tool_call_id ?? "";
			const info = toolIdx.get(tcid);
			const toolName = info?.name ?? "unknown";
			const text = getText(m.content);
			const tokens = estTokens(text);
			const status = classifyStatus(text);

			allResults.push({
				req: reqNum, toolName, tokens, status,
				argsPreview: (info?.argsStr ?? "").slice(0, 60),
			});
		}
	}

	// 按 tokens 降序取 top N
	allResults.sort((a, b) => b.tokens - a.tokens);
	const top = allResults.slice(0, topN);

	// 按工具聚合
	const byTool: Record<string, { count: number; totalTokens: number; maxTokens: number }> = {};
	for (const r of allResults) {
		if (!byTool[r.toolName]) byTool[r.toolName] = { count: 0, totalTokens: 0, maxTokens: 0 };
		byTool[r.toolName].count++;
		byTool[r.toolName].totalTokens += r.tokens;
		byTool[r.toolName].maxTokens = Math.max(byTool[r.toolName].maxTokens, r.tokens);
	}

	const lines = [
		`最贵的工具调用 (Top ${topN} / 共 ${allResults.length} 个)`,
		"=".repeat(80),
	];

	for (const r of top) {
		const bar = "█".repeat(Math.min(Math.floor(r.tokens / 200), 30));
		lines.push(`  req-${r.req} ${r.toolName.padEnd(20)} ${fmtTok(r.tokens).padStart(8)} ${r.status.padEnd(12)} ${bar}`);
		lines.push(`         ${r.argsPreview}`);
	}

	// 按工具汇总
	lines.push(`\n${"═".repeat(80)}`);
	lines.push("按工具汇总（按总 token 降序）:");
	lines.push(`   ${"Tool".padEnd(20)} ${"Calls".padStart(6)} ${"Total".padStart(10)} ${"Avg".padStart(8)} ${"Max".padStart(8)}`);
	lines.push(`   ${"─".repeat(20)} ${"─".repeat(6)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(8)}`);

	const sortedTools = Object.entries(byTool)
		.sort((a, b) => b[1].totalTokens - a[1].totalTokens);
	for (const [name, s] of sortedTools) {
		const avg = Math.round(s.totalTokens / s.count);
		lines.push(`   ${name.padEnd(20)} ${String(s.count).padStart(6)} ${fmtTok(s.totalTokens).padStart(10)} ${fmtTok(avg).padStart(8)} ${fmtTok(s.maxTokens).padStart(8)}`);
	}

	return lines.join("\n");
}
