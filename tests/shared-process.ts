/**
 * 测试工具函数：模拟 context 蒸馏钩子处理逻辑
 *
 * v5 逻辑：
 * - 首次超阈值 → 保留全文 + 标记 seen + 推 hint（唯一精读机会）
 * - 已见（第2次+）→ 从 messages 中彻底删除 toolResult + removeOrphanedToolCalls 清理关联
 * - seenArgs 永不 delete（once seen, forever seen）
 */
import {
	estimateTokens,
	toolMeta,
	buildToolCallMap,
	removeOrphanedToolCalls,
} from "../distill-helpers.js";

export interface DistillResult {
	messages: any[];
	hints: string[];
	removedSigs: string[];
}

export function processContextMessages(
	messages: any[],
	seenArgs: Set<string>,
	distillThreshold: number,
): DistillResult {
	const toolCallMap = buildToolCallMap(messages);
	const hints: string[] = [];
	const removedSigs: string[] = [];
	const toRemove: number[] = [];

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role !== "toolResult") continue;

		const tcId = msg.toolCallId || "";
		if (!tcId) continue;

		const toolName = msg.toolName || "unknown";

		const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
		const origText = textParts.map((p: any) => p.text).join("");
		const origTokens = estimateTokens(origText);
		if (origTokens < distillThreshold) continue;

		// 已见（同 toolCallId）：静默删除旧内容
		if (seenArgs.has(tcId)) {
			toRemove.push(i);
			removedSigs.push(tcId);
			continue;
		}

		// 首次：保留全文 + 标记 + 推 hint
		seenArgs.add(tcId);
		const meta = toolMeta(msg, toolCallMap);
		const label = meta.meta || toolName;
		hints.push(`📋 [auto-distill] 「${label}」~${origTokens} tokens，全文将在下轮完全消失（不留痕迹）。`);
	}

	// 反向删除 + 清理孤立
	if (toRemove.length > 0) {
		for (let i = toRemove.length - 1; i >= 0; i--) {
			messages.splice(toRemove[i], 1);
		}
		removeOrphanedToolCalls(messages);
	}

	return { messages, hints, removedSigs };
}
