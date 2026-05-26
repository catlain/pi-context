/**
 * Warmup 测试共享工具函数
 *
 * 模拟 index.ts 中 reload/tree 后恢复 distill/aging 状态的行为。
 * 包含 warmup → distill → aging 完整逻辑。
 */
import { createMockPi, buildMessages, estimateTokens } from "./aging-helpers.js";

export interface WarmupHandlerOptions {
	seenArgs: Set<string>;
	agingTracker: Map<string, number>;
	distillThreshold: number;
	agingThreshold: number;
}

/**
 * 注册包含 warmup + distill + aging 完整逻辑的 context handler
 */
export function setupWarmupAgingHandler(
	pi: ReturnType<typeof createMockPi>["pi"],
	handlers: Record<string, Array<(event: any, ctx: any) => any>>,
	opts: WarmupHandlerOptions,
) {
	const { seenArgs, agingTracker, distillThreshold: dt, agingThreshold: at } = opts;

	pi.on("context", (event: any) => {
		const messages = event.messages as any[];

		// ── warmup：reload/tree 后恢复 distill/aging 状态 ──
		if (seenArgs.size === 0) {
			let toolResultCount = 0;
			for (const msg of messages) {
				if (msg.role === "toolResult") toolResultCount++;
			}
			if (toolResultCount > 10) {
				for (const msg of messages) {
					if (msg.role === "toolResult" && msg.toolCallId) {
						seenArgs.add(msg.toolCallId);
						if (at > 0) {
							agingTracker.set(msg.toolCallId, at);
						}
					}
				}
			}
		}

		const toRemove: number[] = [];
		const distillRemovedIds = new Set<string>();

		// ── distill ──
		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (msg.role !== "toolResult") continue;
			const tcId = msg.toolCallId || "";
			if (!tcId) continue;
			const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
			const origText = textParts.map((p: any) => p.text).join("");
			const origTokens = estimateTokens(origText);
			if (origTokens < dt) continue;

			if (seenArgs.has(tcId)) {
				toRemove.push(i);
				distillRemovedIds.add(tcId);
				continue;
			}

			seenArgs.add(tcId);
			pi.events.emit("ephemeral:hint", {
				text: `[auto-distill] 大内容提示`,
				short: `[auto-distill]`,
			});
		}

		// ── aging ──
		const activeTcIds = new Set<string>();
		if (at > 0) {
			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (!tcId) continue;
				if (distillRemovedIds.has(tcId)) continue;
				const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
				const origText = textParts.map((p: any) => p.text).join("");
				const origTokens = estimateTokens(origText);
				if (origTokens >= dt) continue;

				activeTcIds.add(tcId);
				const count = (agingTracker.get(tcId) || 0) + 1;
				agingTracker.set(tcId, count);

				if (count >= at) {
					toRemove.push(i);
				}
			}
		}

		for (const tcId of agingTracker.keys()) {
			if (!activeTcIds.has(tcId)) agingTracker.delete(tcId);
		}

		if (toRemove.length > 0) {
			for (let i = toRemove.length - 1; i >= 0; i--) {
				messages.splice(toRemove[i], 1);
			}
		}
	});
}

/** 构建一组 toolResult 消息（大内容 + 小内容） */
export function buildMixedMessages(
	largeCount: number,
	smallCount: number,
	largeSize: number,
	smallText: string,
	prefix = "tc",
): any[] {
	const msgs: any[] = [];
	for (let i = 0; i < largeCount; i++) {
		msgs.push(...buildMessages("read", "x".repeat(largeSize), `${prefix}-lg-${i}`));
	}
	for (let i = 0; i < smallCount; i++) {
		msgs.push(...buildMessages("read", smallText, `${prefix}-sm-${i}`));
	}
	return msgs;
}
