/**
 * diff action — 对比两个 payload 差异
 */

import { estTokens, fmtTok, getText, readJsonFile } from "./payload-core.js";
import { basename } from "path";

// ════════════════════════════════════════════════════════════

export function doDiff(path1: string, path2: string): string {
	const p1 = readJsonFile(path1);
	const p2 = readJsonFile(path2);
	if (!p1) return `文件不存在: ${path1}`;
	if (!p2) return `文件不存在: ${path2}`;

	const m1 = p1.messages ?? [];
	const m2 = p2.messages ?? [];

	const lines = [
		"=".repeat(70),
		`  Payload Diff  |  A: ${basename(path1)} (${m1.length})  |  B: ${basename(path2)} (${m2.length})`,
		"=".repeat(70),
	];

	// 找共同前缀
	let common = 0;
	for (let i = 0; i < Math.min(m1.length, m2.length); i++) {
		if (JSON.stringify(m1[i]) === JSON.stringify(m2[i])) common = i + 1;
		else break;
	}
	lines.push(`\n  共同前缀: ${common}  |  A 独有: ${m1.length - common}  |  B 独有: ${m2.length - common}`);

	for (const [label, msgs, start] of [["A", m1, common], ["B", m2, common]] as const) {
		if (start < msgs.length) {
			lines.push(`\n  ── ${label} 尾部 ──`);
			for (let i = start; i < msgs.length; i++) {
				const text = getText(msgs[i].content);
				const tokens = estTokens(text);
				lines.push(`  [${String(i).padStart(3)}] ${(msgs[i].role ?? "?").padEnd(12)} ~${fmtTok(tokens).padStart(6)}  ${text.split("\n")[0]?.slice(0, 50) ?? ""}`);
			}
		}
	}

	// 第一个不同的消息
	for (let i = 0; i < Math.min(m1.length, m2.length); i++) {
		if (JSON.stringify(m1[i]) !== JSON.stringify(m2[i])) {
			const t1 = getText(m1[i].content);
			const t2 = getText(m2[i].content);
			if (t1 !== t2) {
				lines.push(`\n  ⚡ [${i}] 不同:\n     A: ${t1.slice(0, 80)}\n     B: ${t2.slice(0, 80)}`);
			}
			break;
		}
	}
	return lines.join("\n");
}
