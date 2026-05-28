/**
 * code-graph 工具结果格式化
 *
 * 处理 code-graph MCP server 的输出格式：
 * - 纯文本行模式（搜索结果、callgraph 箭头等）
 * - JSON 格式（委托给 formatters-codegraph-json.ts）
 * - AST JSON（get_ast_node 的 code_content 截断）
 *
 * 纯函数签名：(text: string) => string
 * 解析/格式化失败时 fallback 返回原始文本。
 */

import { sniffCodeGraphJson, formatCodeGraphJson } from "./formatters-codegraph-json.js";

const MAX_LINES = 200;

// ── AST JSON code_content 截断阈值 ────────────────
const CODE_CONTENT_MAX_LINES = 40;
const CODE_CONTENT_HEAD = 15;
const CODE_CONTENT_TAIL = 5;

// ── 嗅探：检测 code-graph 输出 ────────────────────

export function sniffCodeGraph(text: string): boolean {
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
		/^Module:\s+\S+\s*\(\d+\s+nodes?\)/m.test(text) ||
		// AST JSON: get_ast_node 返回的 JSON
		sniffAstJson(text) ||
		// 通用 code-graph JSON 输出
		sniffCodeGraphJson(text)
	);
}

/** 检测 code-graph get_ast_node 的 JSON 输出（非 compact） */
function sniffAstJson(text: string): boolean {
	if (!text.startsWith("{")) return false;
	try {
		const obj = JSON.parse(text);
		return (
			typeof obj.name === "string" &&
			typeof obj.file_path === "string" &&
			(typeof obj.type === "string" || typeof obj.signature === "string")
		);
	} catch {
		return false;
	}
}

// ── 符号类型优先级（搜索结果排序用） ──────────────

const SYMBOL_ORDER: Record<string, number> = {
	class: 0, interface: 1, struct: 2, enum: 3, type: 4,
	fn: 5, method: 6, const: 7, var: 8, module: 9,
};

function sortSearchLines(lines: string[]): string[] {
	return [...lines].sort((a, b) => {
		const orderA = SYMBOL_ORDER[a.split(" ")[0]] ?? 99;
		const orderB = SYMBOL_ORDER[b.split(" ")[0]] ?? 99;
		return orderA - orderB;
	});
}

// ── AST JSON 格式化 ────────────────────────────

function formatAstJson(text: string): string {
	let obj: any;
	try { obj = JSON.parse(text); } catch { return text; }

	const code = obj.code_content as string | undefined;
	if (!code || typeof code !== "string") return formatAstMetadata(obj);

	const codeLines = code.split("\n");
	if (codeLines.length <= CODE_CONTENT_MAX_LINES) return text;

	const head = codeLines.slice(0, CODE_CONTENT_HEAD);
	const tail = codeLines.slice(-CODE_CONTENT_TAIL);
	const truncated =
		head.join("\n") +
		`\n... (${codeLines.length - CODE_CONTENT_HEAD - CODE_CONTENT_TAIL} lines truncated)\n` +
		tail.join("\n");

	return JSON.stringify({ ...obj, code_content: truncated }, null, 2);
}

function formatAstMetadata(obj: any): string {
	const parts: string[] = [];
	if (obj.name) parts.push(`name: ${obj.name}`);
	if (obj.type) parts.push(`type: ${obj.type}`);
	if (obj.file_path) parts.push(`file: ${obj.file_path}`);
	if (obj.start_line) parts.push(`lines: ${obj.start_line}-${obj.end_line ?? "?"}`);
	if (obj.signature) parts.push(`signature: ${obj.signature}`);
	if (obj.node_id) parts.push(`node_id: ${obj.node_id}`);
	if (obj.compact) parts.push(`(compact)`);
	return parts.join("\n");
}

// ── 主格式化 ─────────────────────────────────────

export function formatCodeGraphResult(text: string): string {
	if (!text) return text;

	// AST JSON 格式（get_ast_node 非 compact）
	if (sniffAstJson(text)) return formatAstJson(text);

	// 通用 code-graph JSON 格式（delegate to json module）
	if (sniffCodeGraphJson(text)) return formatCodeGraphJson(text);

	// 纯文本格式
	if (!sniffCodeGraph(text)) return text;

	let lines = text.split("\n");

	const isSearch =
		lines.some((l) => /^(fn |class |struct |enum |interface |type |const |var |method )\S+\s{2,}/.test(l)) &&
		lines.every((l) => !l.trim() || /^(fn |class |struct |enum |interface |type |const |var |method )\S+\s{2,}/.test(l));
	if (isSearch) lines = sortSearchLines(lines);

	let formatted = lines.join("\n").replace(/\n{3,}/g, "\n\n");

	const finalLines = formatted.split("\n");
	if (finalLines.length > MAX_LINES) {
		formatted = finalLines.slice(0, MAX_LINES).join("\n") + `\n... (${finalLines.length - MAX_LINES} more lines)`;
	}

	return formatted;
}
