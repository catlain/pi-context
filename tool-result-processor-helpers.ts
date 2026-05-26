/**
 * 工具结果后处理器辅助函数
 *
 * 从 core.ts 拆分，避免文件超 200 行。
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatTokens } from "./utils.js";

const PROCESSOR_DIR = join(tmpdir(), "pi-distill", "processor");
const PREVIEW_LINES = 15;

// ── 写原文临时文件 ───────────────────────────────

/** 从 bash details 中提取 pi 的原文临时文件路径 */
export function extractBashSourcePath(details: unknown): string | null {
	if (!details || typeof details !== "object") return null;
	const d = details as Record<string, unknown>;
	// bash details: { fullOutputPath: string, truncation: { truncated: boolean, ... } }
	const truncation = d.truncation as Record<string, unknown> | undefined;
	if (truncation?.truncated && typeof d.fullOutputPath === "string") {
		return d.fullOutputPath;
	}
	return null;
}

export function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	return d.toISOString().replace(/[-:T]/g, "").slice(0, 15); // 20260514T120000
}

export function buildFileHeader(toolName: string, input: Record<string, unknown>, toolCallId?: string, sessionId?: string): string {
	const lines: string[] = [
		`=== ${toolName} ===`,
		`时间: ${new Date().toISOString()}`,
	];
	if (sessionId) lines.push(`会话: ${sessionId}`);
	if (toolCallId) lines.push(`调用ID: ${toolCallId}`);
	// 参数摘要：截断到一行
	const argsStr = JSON.stringify(input);
	lines.push(`参数: ${argsStr.length > 200 ? argsStr.slice(0, 200) + "..." : argsStr}`);
	lines.push("");
	return lines.join("\n");
}

export function writeRawToFile(
	rawText: string,
	toolName: string,
	writeFallback: boolean,
	sourcePath: string | null = null,
	input: Record<string, unknown> = {},
	toolCallId?: string,
	sessionId?: string,
): string | null {
	const timestamp = Date.now();
	const sidSuffix = sessionId ? sessionId.slice(-8) : "anon";
	const tmpPath = join(PROCESSOR_DIR, `${toolName}-${sidSuffix}-${timestamp}.txt`);
	try {
		mkdirSync(PROCESSOR_DIR, { recursive: true });
		if (writeFallback) throw new Error("simulated write failure");
		const header = buildFileHeader(toolName, input, toolCallId, sessionId);
		// bash 被截断时，从 pi 的临时文件读取完整原文
		const body = (sourcePath && existsSync(sourcePath))
			? readFileSync(sourcePath, "utf-8")
			: rawText;
		writeFileSync(tmpPath, header + body, "utf-8");
		return tmpPath;
	} catch (err) {
		console.error(`[tool-result-processor] 写入临时文件失败: ${tmpPath}`, err);
		return null;
	}
}

// ── 大结果处理 ────────────────────────────────────

import type { ToolResultEventResult } from "./tool-result-processor-core.js";

export function handleLargeResult(
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

export function buildSummary(
	formatted: string,
	toolName: string,
	tokens: number,
	tmpPath: string,
): string {
	const lines = formatted.split("\n");
	const previewLines = lines.slice(0, PREVIEW_LINES);
	const preview = previewLines.map((l, i) => `${(i + 1).toString().padStart(3)} ${l}`).join("\n");
	const more = lines.length > PREVIEW_LINES
		? `\n... (${lines.length - PREVIEW_LINES} more lines)`
		: "";

	return [
		`[processed] ${toolName} 结果（~${formatTokens(tokens)} tokens）`,
		`完整内容：${tmpPath}`,
		"",
		preview,
		more,
	].join("\n");
}