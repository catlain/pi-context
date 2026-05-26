/**
 * 工具结果格式化纯函数
 *
 * 所有函数为纯函数签名：(text: string) => string
 * 输入原始文本，输出 AI 友好格式。
 * 解析/格式化失败时 fallback 返回原始文本。
 */

import {
	unwrapDoubleEncodedJson,
	truncateAtParagraph,
	extractJsonPrefix,
} from "./formatters-utils.js";
import { formatGhResult } from "./formatters-gh.js";
import { formatWebReadResult, formatWebSearchResult } from "./formatters-web.js";

export { unwrapDoubleEncodedJson, truncateAtParagraph, formatGhResult, formatWebReadResult, formatWebSearchResult };
// ── bash 格式化 ───────────────────────────────────

/**
 * bash 结果透传（bash 结果通常已由 truncateHead 截断）。
 */
export function formatBashResult(text: string): string {
	return text;
}

/**
 * MCP 错误格式化。
 * 提取错误码和错误消息，提供友好提示。
 */
export function formatMcpError(text: string): string {
	// MCP 错误格式："MCP error -500: 500 Internal Server Error: \"{...}\""
	const mcpErrorMatch = text.match(/^MCP error\s+(-?\d+):\s+(.+)$/s);
	if (!mcpErrorMatch) return text;

	const code = mcpErrorMatch[1];
	const message = mcpErrorMatch[2];

	// 尝试提取 JSON 错误详情
	let errorDetail = "";
	const jsonMatch = message.match(/\"\{(.+)\}\"$/s);
	if (jsonMatch) {
		try {
			const errorJson = JSON.parse(`{${jsonMatch[1]}}`);
			if (errorJson.error?.message) {
				errorDetail = errorJson.error.message;
			}
		} catch {
			// JSON 解析失败，使用原始消息
		}
	}

	return `❌ 错误：${errorDetail || message} (错误码: ${code})`;
}
