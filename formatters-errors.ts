/**
 * MCP 错误格式化器
 *
 * 提取错误码和错误消息，提供友好提示。
 */

/**
 * 格式化 MCP 错误消息。
 * 格式："MCP error -500: 500 Internal Server Error: \"{...}\""
 */
export function formatMcpError(text: string): string {
	// 第一步：提取错误码和消息（外层）
	const mcpErrorMatch = text.match(/^MCP error\s+(-?\d+):\s+(.+)$/s);
	if (!mcpErrorMatch) return text;

	const code = mcpErrorMatch[1];
	let message = mcpErrorMatch[2];

	// 第二步：提取 JSON 中的错误消息（内层）
	// 格式：500 Internal Server Error: "{\"error\":{\"message\":\"...\"}}"
	const jsonMatch = message.match(/:\s*"(\{.+?\})"$/s);
	if (jsonMatch) {
		try {
			// 反转义：\" → "
			const jsonStr = jsonMatch[1].replace(/\\"/g, '"');
			const errorJson = JSON.parse(jsonStr);
			if (errorJson.error?.message) {
				return `❌ 错误：${errorJson.error.message} (错误码: ${code})`;
			}
		} catch {
			// JSON 解析失败，继续处理
		}
	}

	// 第三步：清理 HTTP 前缀，返回原始消息
	// 匹配：（可选）数字空格 + HTTP 错误消息 + 冒号空格
	const httpPrefixMatch = message.match(/^(?:\d+\s+)?(?:Internal Server Error|[A-Z][a-z]+ Error):\s*/);
	if (httpPrefixMatch) {
		message = message.slice(httpPrefixMatch[0].length);
	}

	return `❌ 错误：${message} (错误码: ${code})`;
}