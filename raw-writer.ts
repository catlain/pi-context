/**
 * 原文临时文件写入
 *
 * 从 tool-result-processor-core.ts 提取，避免文件超 200 行。
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DISTILL_DIR } from "./shared.js";

/** processor 原文存入持久化目录，重启后路径仍有效 */
export const PROCESSOR_DIR = join(DISTILL_DIR, "processor");

// ── bash 原文路径提取 ────────────────────────────

/** 从 bash details 中提取 pi 的原文临时文件路径 */
export function extractBashSourcePath(details: unknown): string | null {
	if (!details || typeof details !== "object") return null;
	const d = details as Record<string, unknown>;
	const truncation = d.truncation as Record<string, unknown> | undefined;
	if (truncation?.truncated && typeof d.fullOutputPath === "string") {
		return d.fullOutputPath;
	}
	return null;
}

// ── 文件头构建 ───────────────────────────────────

function buildFileHeader(
	toolName: string,
	input: Record<string, unknown>,
	toolCallId?: string,
	sessionId?: string,
): string {
	const lines: string[] = [
		`=== ${toolName} ===`,
		`时间: ${new Date().toISOString()}`,
	];
	if (sessionId) lines.push(`会话: ${sessionId}`);
	if (toolCallId) lines.push(`调用ID: ${toolCallId}`);
	const argsStr = JSON.stringify(input);
	lines.push(`参数: ${argsStr.length > 200 ? argsStr.slice(0, 200) + "..." : argsStr}`);
	lines.push("");
	return lines.join("\n");
}

// ── 写入 ─────────────────────────────────────────

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
		const body = (sourcePath && existsSync(sourcePath))
			? (() => { const f = require("fs"); return f.readFileSync(sourcePath, "utf-8"); })()
			: rawText;
		writeFileSync(tmpPath, header + body, "utf-8");
		return tmpPath;
	} catch (err) {
		console.error(`[tool-result-processor] 写入临时文件失败: ${tmpPath}`, err);
		return null;
	}
}
