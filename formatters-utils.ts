/**
 * 工具结果格式化辅助函数
 *
 * 被 formatters.ts 和 tool-result-processor.ts 共用。
 */



/**
 * 从文本中提取前导 JSON（数组或对象）。
 * 某些 MCP 工具可能返回 "JSON数组\n\nNext: ..." 格式。
 * 如果文本以 [ 或 { 开头，提取到匹配的 ] 或 } 为止。
 * 否则返回原文。
 */
export function extractJsonPrefix(text: string): string {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return text;

	const openChar = trimmed[0];
	const closeChar = openChar === '[' ? ']' : '}';
	let depth = 0;
	let inString = false;
	let escape = false;

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (escape) { escape = false; continue; }
		if (ch === '\\' && inString) { escape = true; continue; }
		if (ch === '"') { inString = !inString; continue; }
		if (inString) continue;
		if (ch === openChar) depth++;
		else if (ch === closeChar) {
			depth--;
			if (depth === 0) return trimmed.slice(0, i + 1);
		}
	}
	return text; // 没有完整闭合，返回原文
}

/**
 * 解包双重编码的 JSON。
 *
 * GLM MCP 工具返回的 text 是 JSON-encoded string：
 *   `"{\"title\":\"test\"}"` → 先 parse 得到 `{"title":"test"}` → 再 parse 得到对象
 * 如果不是双重编码，直接返回原始文本。
 */
export function unwrapDoubleEncodedJson(rawText: string): string {
	if (!rawText.startsWith('"')) return rawText;
	try {
		const inner = JSON.parse(rawText);
		if (typeof inner === "string") return inner;
		return rawText;
	} catch {
		return rawText;
	}
}

/**
 * 按段落边界截断文本。
 * 在 maxChars 范围内找最后一个段落分隔符（\\n\\n），
 * 避免在表格/代码块中间截断。
 *
 * 规则：
 * 1. 文本 ≤ maxChars → 不截断
 * 2. 找到段落边界，且边界后剩余内容很短（≤ maxChars/10） → 返回全文
 * 3. 找到段落边界 → 在边界处截断
 * 4. 无段落边界 → 硬截断
 */
export function truncateAtParagraph(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;

	const searchRange = text.slice(0, maxChars);
	const lastParagraph = searchRange.lastIndexOf("\n\n");

	if (lastParagraph >= 0) {
		// 段落边界后剩余内容很短时，直接返回全文
		const afterBoundary = text.slice(lastParagraph + 2);
		if (afterBoundary.length <= maxChars / 10) {
			return text;
		}
		return text.slice(0, lastParagraph) + `\n\n...(内容已截断，共 ${text.length} 字符)`;
	}

	return text.slice(0, maxChars) + `\n\n...(内容已截断，共 ${text.length} 字符)`;
}


