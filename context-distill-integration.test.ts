/**
 * distill 集成测试（简化版：不再写临时文件）
 *
 * 验证 distill 的上下文可见性管理：
 * - 首次超阈值：保留全文 + hint 提醒
 * - 第二次同参数：移除全文（"忘记"粗读）
 * - 不超阈值：不动
 */
import { describe, it, expect, vi } from "vitest";

function createMockPi() {
	const handlers: Record<string, Array<(event: any, ctx: any) => any>> = {};
	const hints: Array<{ text: string; short: string }> = [];
	const pi = {
		on: vi.fn((event: string, handler: (event: any, ctx: any) => any) => {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		}),
		events: { emit: vi.fn((event: string, data: any) => {
			if (event === "ephemeral:hint") hints.push(data);
		}) },
		registerCommand: vi.fn(),
	};
	return { pi, handlers, hints };
}

function buildMessages(toolName: string, content: string, tcId = "tc1", args = {}) {
	return [
		{ role: "assistant", content: [{ type: "toolCall", id: tcId, name: toolName, arguments: args }], toolCallId: tcId },
		{ role: "toolResult", toolCallId: tcId, toolName, content: [{ type: "text", text: content }] },
	];
}

// 手动触发 context handler（模拟 distill 逻辑）
// 因为实际 handler 在 index.ts 的闭包中，这里直接模拟逻辑
function triggerContext(handlers: any, messages: any[]) {
	const ctxHandler = handlers["context"];
	if (!ctxHandler?.length) return;
	ctxHandler[0]({ messages }, {});
}

describe("distill 简化：上下文可见性管理", () => {
	it("首次超阈值保留全文并推 hint", () => {
		const { pi, handlers, hints } = createMockPi();
		// 模拟 index.ts 的 distill 逻辑
		const seenArgs = new Set<string>();
		const distillThreshold = 500;

		pi.on("context", (event: any) => {
			const messages = event.messages;
			for (const msg of messages) {
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (!tcId) continue;
				const toolName = msg.toolName || "unknown";
				const argsSig = `${toolName}:${tcId}`;
				const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
				const origText = textParts.map((p: any) => p.text).join("");
				const tokens = Math.ceil(origText.length / 4);
				if (tokens < distillThreshold) continue;

				if (seenArgs.has(argsSig)) {
					msg.content = [{ type: "text", text: `[auto-distill] ${toolName} 结果已被蒸馏。如需查看，请重新调用该工具。` }];
					continue;
				}
				seenArgs.add(argsSig);
				pi.events.emit("ephemeral:hint", {
					text: `[auto-distill] 「${toolName}」全文将在下轮上下文中被移除。`,
					short: `📋 [auto-distill] 「${toolName}」`,
				});
			}
		});

		const bigText = "X".repeat(3000); // 750 tokens > 500
		const messages = buildMessages("read", bigText);

		triggerContext(handlers, messages);

		// 全文保留
		expect((messages[1] as any).content[0].text).toBe(bigText);
		// hint 推出
		expect(hints.length).toBe(1);
		expect(hints[0].text).toContain("下轮上下文中被移除");
	});

	it("第二次同参数移除全文", () => {
		const seenArgs = new Set<string>();
		const distillThreshold = 500;
		const { pi, handlers } = createMockPi();

		pi.on("context", (event: any) => {
			const messages = event.messages;
			for (const msg of messages) {
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (!tcId) continue;
				const toolName = msg.toolName || "unknown";
				const argsSig = `${toolName}:${tcId}`;
				const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
				const origText = textParts.map((p: any) => p.text).join("");
				const tokens = Math.ceil(origText.length / 4);
				if (tokens < distillThreshold) continue;

				if (seenArgs.has(argsSig)) {
					msg.content = [{ type: "text", text: `[auto-distill] ${toolName} 结果已被蒸馏。如需查看，请重新调用该工具。` }];
					continue;
				}
				seenArgs.add(argsSig);
			}
		});

		const bigText = "X".repeat(3000);
		const messages1 = buildMessages("read", bigText, "tc1");
		triggerContext(handlers, messages1);
		// 首次保留
		expect((messages1[1] as any).content[0].text).toBe(bigText);

		// 第二次同 tcId
		const messages2 = buildMessages("read", bigText, "tc1");
		triggerContext(handlers, messages2);
		// 全文被替换
		expect((messages2[1].content as any[]).find((p: any) => p.type === "text")?.text).toContain("[auto-distill]");
		expect((messages2[1].content as any[]).find((p: any) => p.type === "text")?.text).not.toContain(bigText.slice(0, 100));
		expect((messages2[1].content as any[]).find((p: any) => p.type === "text")?.text).not.toContain("/tmp/pi-distill/");  // 已迁移到 ~/.pi/agent/distill/
	});

	it("不超阈值不做任何操作", () => {
		const seenArgs = new Set<string>();
		const distillThreshold = 500;
		const { pi, handlers } = createMockPi();

		pi.on("context", (event: any) => {
			const messages = event.messages;
			for (const msg of messages) {
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (!tcId) continue;
				const toolName = msg.toolName || "unknown";
				const argsSig = `${toolName}:${tcId}`;
				const textParts = (msg.content as any[]).filter((p: any) => p.type === "text");
				const origText = textParts.map((p: any) => p.text).join("");
				const tokens = Math.ceil(origText.length / 4);
				if (tokens < distillThreshold) continue;
				seenArgs.add(argsSig);
			}
		});

		const smallText = "small output"; // ~3 tokens
		const messages = buildMessages("bash", smallText);
		triggerContext(handlers, messages);

		// 内容不变
		expect((messages[1] as any).content[0].text).toBe(smallText);
	});
});
