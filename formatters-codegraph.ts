/**
 * code-graph 工具结果格式化
 *
 * 处理 code-graph MCP server 的输出格式。
 * code-graph 输出为纯文本，有明确的行模式。
 *
 * 纯函数签名：(text: string) => string
 * 解析/格式化失败时 fallback 返回原始文本。
 *
 * 格式化策略：
 * 1. 嗅探确认是 code-graph 输出
 * 2. 压缩连续空行
 * 3. 超过 200 行截断并标注
 * 4. 对于 search 结果，按符号类型分组排序（class > fn > method > var）
 */

const MAX_LINES = 200;

// ── 符号类型优先级（搜索结果排序用） ──────────────

const SYMBOL_ORDER: Record<string, number> = {
	class: 0,
	interface: 1,
	struct: 2,
	enum: 3,
	type: 4,
	fn: 5,
	method: 6,
	const: 7,
	var: 8,
	module: 9,
};

// ── 嗅探：检测 code-graph 输出 ────────────────────

export function sniffCodeGraph(text: string): boolean {
	// 每条特征都是 code-graph 独有的行模式，单条命中即判定
	return (
		// search: "fn name  file:line-range  ((params)) -> ret"
		/^(fn |class |struct |enum |interface |type |const |var |method )\S+\s{2,}\S+:\d+/.test(text) ||
		// callgraph: 缩进箭头（← callers / → callees）
		/^ {2}[←→]/m.test(text) ||
		// impact: "Impact: xxx — Risk: LOW/MEDIUM/HIGH"
		/^Impact:\s+\S+\s+—\s+Risk:\s*(LOW|MEDIUM|HIGH)/m.test(text) ||
		// references: "3 references to 'symbol'"
		/^\d+\s+references?\s+to\s+['"][^'"]+['"]/m.test(text) ||
		// dead code: "Dead code: 42 results"
		/^Dead code:\s+\d+\s+results?/m.test(text) ||
		// module overview header: "Module: xxx (42 nodes)"
		/^Module:\s+\S+\s*\(\d+\s+nodes?\)/m.test(text)
	);
}

// ── 搜索结果分组排序 ─────────────────────────────

function sortSearchLines(lines: string[]): string[] {
	return [...lines].sort((a, b) => {
		const kindA = a.split(" ")[0];
		const kindB = b.split(" ")[0];
		const orderA = SYMBOL_ORDER[kindA] ?? 99;
		const orderB = SYMBOL_ORDER[kindB] ?? 99;
		return orderA - orderB;
	});
}

// ── 主格式化 ─────────────────────────────────────

export function formatCodeGraphResult(text: string): string {
	if (!text) return text;
	if (!sniffCodeGraph(text)) return text;

	let lines = text.split("\n");

	// 搜索结果（符号列表）→ 按类型分组排序
	const isSearch =
		lines.length >= 1 &&
		lines.some((l) =>
			/^(fn |class |struct |enum |interface |type |const |var |method )\S+\s{2,}/.test(l),
		) &&
		lines.every(
			(l) =>
				!l.trim() ||
				/^(fn |class |struct |enum |interface |type |const |var |method )\S+\s{2,}/.test(l),
		);
	if (isSearch) {
		lines = sortSearchLines(lines);
	}

	// 压缩连续空行
	let formatted = lines.join("\n").replace(/\n{3,}/g, "\n\n");

	// 截断过长输出
	const finalLines = formatted.split("\n");
	if (finalLines.length > MAX_LINES) {
		formatted = finalLines.slice(0, MAX_LINES).join("\n");
		formatted += `\n... (${finalLines.length - MAX_LINES} more lines)`;
	}

	return formatted;
}
