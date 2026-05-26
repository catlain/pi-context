/**
 * toolCall.arguments 截断模块
 *
 * 在 context handler 中截断 assistant 消息里过大的 toolCall.arguments，
 * 写临时文件并替换为摘要对象。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "path";
import { DISTILL_DIR } from "./shared.js";
import { estimateTokens } from "./distill-helpers.js";

const TOOLCALL_PROCESSOR_DIR = join(DISTILL_DIR, "processor");

/** 小字段保留阈值（字符数），超过此值的字段不保留 */
const SMALL_FIELD_CHAR_LIMIT = 200;

/** 构建截断后的摘要对象：保留所有 ≤200 字符的小值字段，丢弃其余大值 */
function buildTruncatedArgs(
	toolName: string,
	args: Record<string, any>,
	totalTokens: number,
	tmpPath: string,
): Record<string, any> {
	const result: Record<string, any> = {
		_truncated: true,
		toolName,
		summary: `~${totalTokens} tokens, 详见 ${tmpPath}`,
	};
	for (const [key, value] of Object.entries(args)) {
		const str = typeof value === "string" ? value : JSON.stringify(value);
		if (str && str.length <= SMALL_FIELD_CHAR_LIMIT) {
			result[key] = value;
		}
	}
	return result;
}

/** 写 toolCall arguments 到临时文件，返回文件路径 */
function writeArgsTmpFile(
	toolName: string,
	args: Record<string, any>,
	tcId: string,
): string | null {
	const timestamp = Date.now();
	const sidSuffix = tcId.length >= 8 ? tcId.slice(-8) : "anon";
	const tmpPath = join(TOOLCALL_PROCESSOR_DIR, `toolcall-${sidSuffix}-${timestamp}.txt`);
	try {
		mkdirSync(TOOLCALL_PROCESSOR_DIR, { recursive: true });
		const header = `=== ${toolName} toolCall.arguments ===\n时间: ${new Date().toISOString()}\n调用ID: ${tcId}\n`;
		writeFileSync(tmpPath, header + JSON.stringify(args, null, 2), "utf-8");
		return tmpPath;
	} catch {
		return null;
	}
}

/** 截断 toolCall.arguments 中超阈值的大字段，写临时文件，替换为摘要
 *  @param messages - 消息数组（会被就地修改）
 *  @param threshold - token 阈值
 *  @param truncatedIds - 已截断的 toolCall ID 集合（纯函数，由调用方管理）
 *  @returns 实际截断的数量
 */
export function truncateToolCallArgs(
	messages: any[],
	threshold: number,
	truncatedIds: Set<string>,
): number {
	let count = 0;
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		if (!Array.isArray(msg.content)) continue;
		for (const block of msg.content) {
			if (block.type !== "toolCall") continue;
			if (!block.id) continue;
			if (truncatedIds.has(block.id)) continue;

			// arguments 为空时跳过
			const args = block.arguments;
			if (args == null || typeof args !== "object") continue;
			if (Object.keys(args).length === 0) continue;

			// 已被截断过（_truncated 标志）→ 跳过
			if (args._truncated) continue;

			// 估算整个 arguments 的 token 数
			const argsJson = JSON.stringify(args);
			const tokens = estimateTokens(argsJson);
			if (tokens < threshold) continue;

			// 写临时文件
			const tmpPath = writeArgsTmpFile(block.name || "unknown", args, block.id);
			if (!tmpPath) continue;

			// 替换为摘要
			block.arguments = buildTruncatedArgs(block.name || "unknown", args, tokens, tmpPath);
			truncatedIds.add(block.id);
			count++;
		}
	}
	return count;
}
