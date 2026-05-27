import { fmtTok } from "./core.js";

/**
 * 将追踪链中连续相同 (status, tokens, preview) 的 entry 折叠为一行。
 * 单条:  req-0004 [ 382] 📝小 SMALL 454tok preview...
 * 折叠:  req-0004~0022 (19个) 📝小 SMALL 454tok preview...
 */
export function foldChainEntries(entries: Array<{ req: string; idx: number; status: string; tokens: number; preview: string }>): string[] {
	if (entries.length === 0) return [];
	const lines: string[] = [];
	let i = 0;
	while (i < entries.length) {
		const cur = entries[i];
		const marker = ({ FULL_KEPT: "📖全文", TRUNCATED: "✂️截断" } as any)[cur.status] ?? "📝小";
		// 找连续相同的 (status, tokens, preview)
		let j = i + 1;
		while (
			j < entries.length &&
			entries[j].status === cur.status &&
			entries[j].tokens === cur.tokens &&
			entries[j].preview.slice(0, 40) === cur.preview.slice(0, 40)
		) {
			j++;
		}
		const count = j - i;
		if (count === 1) {
			lines.push(`    req-${cur.req} [${String(cur.idx).padStart(4)}] ${marker} ${cur.status.padEnd(12)} ${String(cur.tokens).padStart(5)}tok ${cur.preview.slice(0, 60)}`);
		} else {
			lines.push(`    req-${cur.req}~${entries[j - 1].req} (${count}个) ${marker} ${cur.status.padEnd(12)} ${String(cur.tokens).padStart(5)}tok ${cur.preview.slice(0, 60)}`);
		}
		i = j;
	}
	return lines;
}

// ── 格式化输出 ──

export function formatToolStats(perTool: Record<string, {
	count: number; callTokens: number; resultTokens: number;
}>): string {
	if (!perTool || Object.keys(perTool).length === 0) return "";
	const lines = [
		"\n📊 按工具统计:",
		`   ${"Tool".padEnd(25)} ${"Calls".padStart(5)} ${"CallT".padStart(8)} ${"ResultT".padStart(8)} ${"Total".padStart(8)}`,
		`   ${"─".repeat(25)} ${"─".repeat(5)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)}`,
	];
	const sorted = Object.entries(perTool)
		.sort((a, b) => (b[1].callTokens + b[1].resultTokens) - (a[1].callTokens + a[1].resultTokens));
	for (const [name, s] of sorted) {
		const total = s.callTokens + s.resultTokens;
		lines.push(`   ${name.padEnd(25)} ${String(s.count).padStart(5)} ${fmtTok(s.callTokens).padStart(8)} ${fmtTok(s.resultTokens).padStart(8)} ${fmtTok(total).padStart(8)}`);
	}
	return lines.join("\n");
}
