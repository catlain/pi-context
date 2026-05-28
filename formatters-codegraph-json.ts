/**
 * code-graph JSON 输出 — 嗅探 + 格式化分派
 *
 * 嗅探 code-graph 工具的 JSON 格式输出，分派到具体格式化函数。
 * 格式化函数在 formatters-codegraph-json-fmt.ts 中实现。
 */

import {
	formatSearchJson,
	formatCallGraphJson,
	formatReferencesJson,
	formatModuleOverviewJson,
	formatProjectMapJson,
	formatAstSearchJson,
} from "./formatters-codegraph-json-fmt.js";

const MAX_LINES = 200;

// ── 嗅探 ─────────────────────────────────────────

/**
 * 检测 code-graph 工具的通用 JSON 输出
 *
 * 覆盖：semantic_code_search、get_call_graph、find_references、
 * module_overview、project_map、ast_search
 */
export function sniffCodeGraphJson(text: string): boolean {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;

	let obj: any;
	try { obj = JSON.parse(text); } catch { return false; }

	// semantic_code_search: [{name, file_path, ...}]
	if (Array.isArray(obj)) {
		return (
			obj.length > 0 &&
			typeof obj[0]?.name === "string" &&
			typeof obj[0]?.file_path === "string" &&
			(typeof obj[0]?.type === "string" || typeof obj[0]?.code_content === "string")
		);
	}

	if (typeof obj !== "object" || obj === null) return false;

	// get_call_graph: {function, callers, callees}
	if (typeof obj.function === "string" && Array.isArray(obj.callers) && Array.isArray(obj.callees)) return true;

	// find_references: {symbol, total_references, references}
	if (typeof obj.symbol === "string" && typeof obj.total_references === "number" && Array.isArray(obj.references)) return true;

	// module_overview: {active_exports, files_count, path}
	if (Array.isArray(obj.active_exports) && typeof obj.files_count === "number" && typeof obj.path === "string") return true;

	// project_map: {modules, hot_functions, module_dependencies}
	if (Array.isArray(obj.modules) && Array.isArray(obj.hot_functions) && Array.isArray(obj.module_dependencies)) return true;

	// ast_search: {count, results:[{name, file_path, ...}]}
	if (
		typeof obj.count === "number" &&
		Array.isArray(obj.results) &&
		(typeof obj.results[0]?.name === "string" || obj.results.length === 0)
	) return true;

	return false;
}

// ── 格式化分派 ───────────────────────────────────

/** 分派 code-graph JSON 到对应格式化器 */
export function formatCodeGraphJson(text: string): string {
	let obj: any;
	try { obj = JSON.parse(text); } catch { return text; }

	let formatted: string;

	if (Array.isArray(obj)) {
		formatted = formatSearchJson(obj);
	} else if (Array.isArray(obj.callers) && Array.isArray(obj.callees)) {
		formatted = formatCallGraphJson(obj);
	} else if (typeof obj.symbol === "string" && Array.isArray(obj.references)) {
		formatted = formatReferencesJson(obj);
	} else if (Array.isArray(obj.active_exports)) {
		formatted = formatModuleOverviewJson(obj);
	} else if (Array.isArray(obj.modules) && Array.isArray(obj.module_dependencies)) {
		formatted = formatProjectMapJson(obj);
	} else if (typeof obj.count === "number" && Array.isArray(obj.results)) {
		formatted = formatAstSearchJson(obj);
	} else {
		return text;
	}

	// 截断过长输出
	const lines = formatted.split("\n");
	if (lines.length > MAX_LINES) {
		formatted = lines.slice(0, MAX_LINES).join("\n") + `\n... (${lines.length - MAX_LINES} more lines)`;
	}

	return formatted;
}
