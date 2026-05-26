/**
 * overview action — 详细分析 provider payload
 */

import {
	estTokens, fmtTok, fmtSize, getText,
	buildProviderToolCallIndex, classifyStatus,
	parseDistillHeader, parseArgs, readJsonFile, formatToolStats,
} from "./payload-core.js";

export function doOverview(payloadPath: string, verbose = false): string {
	const data = readJsonFile(payloadPath);
	if (!data) return `文件不存在: ${payloadPath}`;

	const model = data.model ?? "?";
	const msgs = data.messages ?? [];
	const tools = data.tools ?? [];

	const lines = [
		"=".repeat(70),
		`  Payload 分析  |  Model: ${model}`,
		"=".repeat(70),
	];

	// Tools
	const toolTotalTok = tools.reduce((s: number, t: any) => s + estTokens(JSON.stringify(t)), 0);
	lines.push(`\n📦 Tools: ${tools.length} 个, ~${fmtTok(toolTotalTok)} tokens`);
	if (verbose) {
		for (const t of tools) {
			const name = t.name ?? t.function?.name ?? "?";
			const tText = JSON.stringify(t);
			lines.push(`   ${name.padEnd(30)} ~${fmtTok(estTokens(tText)).padStart(6)}  ${fmtSize(tText.length)}`);
		}
	}

	// System prompt
	const sysMsg = msgs.find((m: any) => m.role === "system" || m.role === "developer");
	if (sysMsg) {
		const sysText = getText(sysMsg.content);
		lines.push(`\n📝 System Prompt: ~${fmtTok(estTokens(sysText))} tokens, ${fmtSize(sysText.length)}`);
	}

	// 逐消息分析
	const perTool: Record<string, { count: number; callTokens: number; resultTokens: number }> = {};
	const distillEvents: Array<{
		idx: number; tool: string; origTok: number; curTok: number;
		saved: number; tmpPath: string;
	}> = [];

	lines.push(`\n📋 消息列表 (${msgs.length} 条):`);
	for (let i = 0; i < msgs.length; i++) {
		const m = msgs[i];
		const role = m.role ?? "?";
		const text = getText(m.content);
		const tokens = estTokens(text);
		const firstLine = text.split("\n")[0]?.slice(0, 60) ?? "";

		if (role === "assistant") {
			const calls: Array<{ name: string; args: any }> = [];
			for (const tc of m.tool_calls ?? []) {
				const name = tc.function?.name ?? "unknown";
				const args = parseArgs(tc.function?.arguments ?? "{}");
				calls.push({ name, args });
				if (!perTool[name]) perTool[name] = { count: 0, callTokens: 0, resultTokens: 0 };
				perTool[name].count++;
				perTool[name].callTokens += estTokens(tc.function?.arguments ?? "");
			}
			const parts: string[] = [];
			if (text.trim()) parts.push(`text ~${fmtTok(tokens)}`);
			if (calls.length) parts.push(`calls: ${calls.map(c => c.name).join(", ")}`);
			lines.push(`\n  [${String(i).padStart(3)}] ${role.padEnd(12)} ~${fmtTok(tokens).padStart(6)}  ${parts.join(" | ")}`);
			for (const c of calls) {
				lines.push(`        ↳ ${c.name}(${JSON.stringify(c.args).slice(0, 80)})`);
			}
		} else if (role === "tool") {
			const tcid = m.tool_call_id ?? "";
			const toolIdx = buildProviderToolCallIndex(msgs);
			const info = toolIdx.get(tcid);
			const toolName = info?.name ?? "unknown";
			if (!perTool[toolName]) perTool[toolName] = { count: 0, callTokens: 0, resultTokens: 0 };
			perTool[toolName].resultTokens += tokens;

			let marker = "";
			const distill = parseDistillHeader(text);
			if (distill) {
				const saved = distill.origTokens - tokens;
				distillEvents.push({ idx: i, tool: toolName, origTok: distill.origTokens, curTok: tokens, saved, tmpPath: distill.tmpPath });
				marker = ` 🔴 DISTILLED (was ~${fmtTok(distill.origTokens)}, saved ~${fmtTok(saved)})`;
			} else if (tokens >= 4000) {
				marker = " 🟡 大文件 (>= 4k tokens)";
			}
			lines.push(`  [${String(i).padStart(3)}] ${role.padEnd(12)} ~${fmtTok(tokens).padStart(6)}  [${toolName}]${marker}`);
			lines.push(`        "${firstLine}"`);
		} else {
			lines.push(`\n  [${String(i).padStart(3)}] ${role.padEnd(12)} ~${fmtTok(tokens).padStart(6)}  ${firstLine}`);
		}
	}

	// Distill 汇总
	if (distillEvents.length) {
		lines.push(`\n${"═".repeat(70)}`);
		lines.push(`  🔴 Auto-Distill 事件 (${distillEvents.length} 次)`);
		lines.push("═".repeat(70));
		let totalSaved = 0;
		for (const e of distillEvents) {
			totalSaved += e.saved;
			lines.push(`   [${String(e.idx).padStart(3)}] ${e.tool.padEnd(20)}  ~${fmtTok(e.origTok).padStart(6)} → ~${fmtTok(e.curTok).padStart(6)}  (saved ~${fmtTok(e.saved)})  → ${e.tmpPath}`);
		}
		lines.push(`   总计节省: ~${fmtTok(totalSaved)} tokens`);
	}

	lines.push(formatToolStats(perTool));
	return lines.join("\n");
}
