/**
 * web_read / web_search 工具结果格式化
 *
 * 从 formatters.ts 拆分，保持文件 ≤ 200 行。
 */

import {
	unwrapDoubleEncodedJson,
	truncateAtParagraph,
} from "./formatters-utils.js";

// ── 配置常量 ──────────────────────────────────────

const MAX_CONTENT_CHARS = 15000;
const MAX_SEARCH_RESULTS = 8;

// ── web_read 格式化 ───────────────────────────────

interface WebReaderResult {
	title?: string;
	url?: string;
	content?: string;
	metadata?: unknown;
	external?: unknown;
}

/**
 * 格式化 web_read 工具返回的双重编码 JSON。
 * 提取 title + url + content，去除 metadata/external 噪声。
 */
export function formatWebReadResult(text: string): string {
	const unwrapped = unwrapDoubleEncodedJson(text);
	let parsed: WebReaderResult;
	try {
		parsed = JSON.parse(unwrapped);
	} catch {
		return text;
	}

	const title = parsed.title ?? "";
	const url = parsed.url ?? "";
	const content = parsed.content ?? "";

	if (!title && !url && !content) {
		return text;
	}

	const truncated = truncateAtParagraph(content, MAX_CONTENT_CHARS);

	const header = `标题: ${title}\nURL: ${url}`;
	if (!truncated) return header;
	return `${header}\n\n${truncated}`;
}

// ── web_search 格式化 ─────────────────────────────

interface SearchResult {
	title?: string;
	link?: string;
	content?: string;
	refer?: string;
}

/**
 * 格式化 web_search 工具返回的双重编码 JSON 数组。
 * 输出编号列表（标题 + URL + 摘要）。
 *
 * 语义验证：至少一个条目必须有 link 或 title 字段，
 * 防止其他工具返回的 JSON 数组被误匹配。
 */
export function formatWebSearchResult(text: string): string {
	const unwrapped = unwrapDoubleEncodedJson(text);
	let results: SearchResult[];
	try {
		results = JSON.parse(unwrapped);
	} catch {
		return text;
	}
	if (!Array.isArray(results)) return text;
	if (results.length === 0) {
		return "搜索结果（共 0 条）";
	}

	// 语义验证：至少一个条目必须有 link 或 title（web_search 特征字段）
	// 防止其他工具返回的 JSON 数组被误匹配
	if (!results.some(r => r.link || r.title)) return text;

	const total = results.length;
	const limited = results.slice(0, MAX_SEARCH_RESULTS);
	const lines: string[] = [
		`搜索结果（共 ${total} 条${total > MAX_SEARCH_RESULTS ? `，显示前 ${MAX_SEARCH_RESULTS} 条` : ""}）：\n`,
	];

	for (let i = 0; i < limited.length; i++) {
		const r = limited[i];
		const num = i + 1;
		lines.push(`[${num}] ${r.title ?? ""}`);
		lines.push(`    URL: ${r.link ?? ""}`);
		if (r.content) {
			lines.push(`    ${r.content}`);
		}
		if (i < limited.length - 1) lines.push("");
	}

	return lines.join("\n");
}
