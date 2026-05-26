/**
 * Aging 测试共享工具函数
 */
import { vi } from "vitest";

export interface MockPi {
	on: ReturnType<typeof vi.fn>;
	events: { emit: ReturnType<typeof vi.fn> };
	registerCommand: ReturnType<typeof vi.fn>;
}

export function createMockPi() {
	const handlers: Record<string, Array<(event: any, ctx: any) => any>> = {};
	const hints: Array<{ text: string; short: string }> = [];
	const pi: MockPi = {
		on: vi.fn((event: string, handler: (event: any, ctx: any) => any) => {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		}),
		events: {
			emit: vi.fn((event: string, data: any) => {
				if (event === "ephemeral:hint") hints.push(data);
			}),
		},
		registerCommand: vi.fn(),
	};
	return { pi, handlers, hints };
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function buildMessages(
	toolName: string,
	content: string,
	tcId = "tc1",
	args: Record<string, any> = {},
): any[] {
	return [
		{
			role: "assistant",
			content: [{ type: "toolCall", id: tcId, name: toolName, arguments: args }],
			toolCallId: tcId,
		},
		{
			role: "toolResult",
			toolCallId: tcId,
			toolName,
			content: [{ type: "text", text: content }],
		},
	];
}

export function triggerContext(
	handlers: Record<string, Array<(event: any, ctx: any) => any>>,
	messages: any[],
) {
	const ctxHandler = handlers["context"];
	if (!ctxHandler?.length) return;
	ctxHandler[0]({ messages }, {});
}

/**
 * 注册包含 aging 逻辑的 context handler
 *
 * 模拟 index.ts 中的 aging 逻辑：
 * - agingTracker 是模块级 Map<tcId, number>（请求次数计数）
 * - agingHinted 是模块级 Set<tcId>（已发过提示的）
 * - count >= threshold 且未提示 → 发提示
 * - count > threshold 且已提示 → 移除
 * - 跳过 distill 已处理的大内容
 * - 清理不在 messages 中的 tcId
 */
export function setupAgingHandler(
	pi: MockPi,
	agingTracker: Map<string, number>,
	agingHinted: Set<string>,
	agingThreshold: number,
	distillThreshold: number,
) {
	pi.on("context", (event: any) => {
		const messages = event.messages as any[];
		const toRemove: number[] = [];
		const distillRemovedIds = new Set<string>();

		// distill 扫描：在新逻辑中，aging 不再依赖 distillThreshold
		// distill 仍然管理“已见”内容的删除，但不影响 aging 对大内容的处理
		// （测试简化：不预标记大内容到 distillRemovedIds）

		// aging 逻辑
		const activeTcIds = new Set<string>();

		if (agingThreshold > 0) {
			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (msg.role !== "toolResult") continue;

				const tcId = msg.toolCallId || "";
				if (!tcId) continue;
				if (distillRemovedIds.has(tcId)) continue;

				// aging 不再跳过大内容，统一处理所有 toolResult

				activeTcIds.add(tcId);

				const count = (agingTracker.get(tcId) || 0) + 1;
				agingTracker.set(tcId, count);

				if (count >= agingThreshold && !agingHinted.has(tcId)) {
					agingHinted.add(tcId);
					const toolName = msg.toolName || "unknown";
					const label = toolName;
					pi.events.emit("ephemeral:hint", {
						text: `📋 [aging] 「${label}」即将从上下文中移除。如需保留，请重新调用相关工具。如与当前任务无关，请无视这条提醒。`,
						short: `📋 [aging] 「${label}」`,
					});
				} else if (count > agingThreshold && agingHinted.has(tcId)) {
					toRemove.push(i);
				}
			}
		}

		if (toRemove.length > 0) {
			for (let i = toRemove.length - 1; i >= 0; i--) {
				messages.splice(toRemove[i], 1);
			}
		}

		for (const tcId of agingTracker.keys()) {
			if (!activeTcIds.has(tcId)) agingTracker.delete(tcId);
		}
	});
}
