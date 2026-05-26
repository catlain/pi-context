/**
 * 工具结果后处理器核心逻辑
 *
 * 被 tool-result-processor.ts 调用，分离以避免文件超 200 行。
 */

import { estimateTokens } from "./distill-helpers.js";
import {
	formatGhResult,
	formatWebReadResult,
	formatWebSearchResult,
} from "./formatters.js";
import { formatCodeGraphResult } from "./formatters-codegraph.js";
import { formatMcpJsonResult } from "./formatters-mcp-json.js";
import {
	extractBashSourcePath,
	PROCESSOR_DIR,
	writeRawToFile,
} from "./raw-writer.js";
import { fillTemplate, hintsConfig } from "./shared.js";
import { formatTokens } from "./utils.js";

// ── 类型 ──────────────────────────────────────────

export interface ToolResultEvent {
	toolName: string;
	content: Array<{ type: string; text?: string }>;
	input: Record<string, unknown>;
	isError: boolean;
	details?: unknown;
	toolCallId?: string;
}

export interface ToolResultEventResult {
	content: Array<{ type: string; text: string }>;
}

export interface ProcessorOptions {
	distillThreshold?: number;
	writeFallback?: boolean;
}

// ── 配置常量 ──────────────────────────────────────

const DEFAULT_THRESHOLD = 4000;

// edit/write：结果极短（确认信息），无需处理
// grep/find/ls：不再跳过——大结果需写临时文件以支持 distill 精读
const SKIP_TOOLS = new Set(["edit", "write"]);
const PREVIEW_LINES = 15;

// 字符数硬限制：超过此长度一律进入大结果处理，不管 token 估算结果
// 背景：estimateTokens 用 length/4 低估结构化文本（如 Godot MCP 的 JSON 输出），
// 导致 8K~16K 字符的内容（估算 ~2000~4000 tokens）绕过压缩
const CHAR_HARD_LIMIT = 8000;

// ── 核心处理 ──────────────────────────────────────

export function processToolResult(
	event: ToolResultEvent,
	threshold: number,
	writeFallback: boolean,
	sessionId?: string,
): ToolResultEventResult | undefined {
	// 不跳过 isError 结果——错误输出也可能是大内容，需要压缩
	// 旧代码 if (event.isError) return undefined 会导致 bash exit≠0 的大输出原文直出
	const toolName = event.toolName;

	if (SKIP_TOOLS.has(toolName)) return undefined;

	// 豁免：读 processor 自身临时文件时不再二次处理（避免套娃）
	const inputPath = event.input?.path;
	if (typeof inputPath === "string" && inputPath.startsWith(PROCESSOR_DIR))
		return undefined;

	if (!Array.isArray(event.content) || event.content.length === 0)
		return undefined;

	const textParts = event.content.filter((p) => p.type === "text");
	if (textParts.length === 0) return undefined;
	const rawText = textParts.map((p) => p.text ?? "").join("");

	// 空结果不值得处理
	if (!rawText) return undefined;

	// 内容嗅探格式化：依次尝试所有格式化器，第一个有变化的生效
	// 不再依赖工具名前缀，新增工具无需修改路由表
	const formatters = [
		formatWebSearchResult,
		formatGhResult,
		formatWebReadResult,
		formatCodeGraphResult,
		formatMcpJsonResult,
	] as const;
	let formatted = rawText;
	for (const fn of formatters) {
		const result = fn(rawText);
		if (result !== rawText) {
			formatted = result;
			break;
		}
	}

	// 用原始文本估算 tokens（格式化函数可能做了展示级截断，但原始内容才是真正占上下文的大小）
	const tokens = estimateTokens(rawText);

	// 所有结果都写原文临时文件（AI 可按需精读）
	// bash 如果已被 pi 截断，从 pi 的临时文件复制原文
	const bashSourcePath =
		toolName === "bash" ? extractBashSourcePath(event.details) : null;
	const tmpPath = writeRawToFile(
		rawText,
		toolName,
		writeFallback,
		bashSourcePath,
		event.input,
		event.toolCallId,
		sessionId,
	);

	// 小结果判定：token 阈值 + 字符数硬限制双重检查
	// 字符数硬限制兜底：estimateTokens 用 length/4 低估结构化文本
	// 字符数硬限制：兜底 estimateTokens 用 length/4 低估结构化文本的问题
	// 基于 threshold 放大：默认 4000 → 8000 字符，用户设高阈值时按比例放大
	const charHardLimit = Math.max(CHAR_HARD_LIMIT, threshold * 2);
	const forceLarge = rawText.length > charHardLimit;
	if (tokens < threshold && !forceLarge) {
		let smallResult = fillTemplate(hintsConfig.processorSmallResult, {
			formatted,
			tmpPath: tmpPath ?? "",
		});
		if (!tmpPath) smallResult = formatted; // 无 tmpPath 时不显示原文路径
		return { content: [{ type: "text", text: smallResult }] };
	}

	return handleLargeResult(formatted, toolName, tokens, tmpPath);
}

// ── 大结果处理 ────────────────────────────────────

function handleLargeResult(
	formatted: string,
	toolName: string,
	tokens: number,
	tmpPath: string | null,
): ToolResultEventResult {
	// 写入失败降级：返回格式化结果
	if (!tmpPath) {
		return { content: [{ type: "text", text: formatted }] };
	}

	const summary = buildSummary(formatted, toolName, tokens, tmpPath);
	return { content: [{ type: "text", text: summary }] };
}

// ── 摘要生成 ──────────────────────────────────────

function buildSummary(
	formatted: string,
	toolName: string,
	tokens: number,
	tmpPath: string,
): string {
	const lines = formatted.split("\n");
	const previewLines = lines.slice(0, PREVIEW_LINES);
	const preview = previewLines
		.map((l, i) => `${(i + 1).toString().padStart(3)} ${l}`)
		.join("\n");
	const more =
		lines.length > PREVIEW_LINES
			? `\n... (${lines.length - PREVIEW_LINES} more lines)`
			: "";

	return fillTemplate(hintsConfig.processorSummary, {
		toolName,
		tokens: formatTokens(tokens),
		tmpPath,
		preview,
		more,
	});
}
