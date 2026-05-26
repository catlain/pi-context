/**
 * 手动删除 单元测试
 *
 * 验证用户在 context 面板标记删除的工具结果被从上下文中移除
 */
import { describe, it, expect } from "vitest";
import {
	createMockPi,
	buildMessages,
	triggerContext,
} from "./aging-helpers.js";

describe("手动删除", () => {
	it("标记删除后，下一轮 context 移除对应 toolResult", () => {
		const { pi, handlers } = createMockPi();
		const manuallyDeletedIds = new Set<string>();

		// 模拟 index.ts 中的手动删除逻辑
		pi.on("context", (event: any) => {
			const messages = event.messages as any[];
			const toRemove: number[] = [];

			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (tcId && manuallyDeletedIds.has(tcId)) {
					toRemove.push(i);
				}
			}

			for (let i = toRemove.length - 1; i >= 0; i--) {
				messages.splice(toRemove[i], 1);
			}
		});

		// 标记 tc-del 为删除
		manuallyDeletedIds.add("tc-del");

		// 构建包含多条 toolResult 的 messages
		const msgs = [
			...buildMessages("read", "保留这个", "tc-keep"),
			...buildMessages("bash", "删除这个", "tc-del"),
		];
		triggerContext(handlers, msgs);

		// tc-del 应被移除，tc-keep 应保留
		const results = msgs.filter((m: any) => m.role === "toolResult");
		expect(results.length).toBe(1);
		expect(results[0].toolCallId).toBe("tc-keep");
	});

	it("删除 toolResult 后，关联的 toolCall block 也应被清理", () => {
		const { pi, handlers } = createMockPi();
		const manuallyDeletedIds = new Set<string>();

		pi.on("context", (event: any) => {
			const messages = event.messages as any[];
			const toRemove: number[] = [];

			// 手动删除 toolResult
			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (tcId && manuallyDeletedIds.has(tcId)) {
					toRemove.push(i);
				}
			}
			for (let i = toRemove.length - 1; i >= 0; i--) {
				messages.splice(toRemove[i], 1);
			}

			// 清理孤立 toolCall block（模拟 removeOrphanedToolCalls）
			const activeToolCallIds = new Set<string>();
			for (const msg of messages) {
				if (msg.role === "toolResult" && msg.toolCallId) {
					activeToolCallIds.add(msg.toolCallId);
				}
			}
			for (const msg of messages) {
				if (msg.role === "assistant" && Array.isArray(msg.content)) {
					msg.content = msg.content.filter(
						(b: any) => b.type !== "toolCall" || activeToolCallIds.has(b.id),
					);
				}
			}
			// 删除内容为空的 assistant 消息
			for (let i = messages.length - 1; i >= 0; i--) {
				const m = messages[i];
				if (m.role === "assistant" && Array.isArray(m.content) && m.content.length === 0) {
					messages.splice(i, 1);
				}
			}
		});

		manuallyDeletedIds.add("tc-del");

		const msgs = [
			...buildMessages("read", "保留", "tc-keep"),
			...buildMessages("bash", "删除", "tc-del"),
		];
		triggerContext(handlers, msgs);

		// 应只剩 tc-keep 的 assistant + toolResult
		expect(msgs.length).toBe(2);
		expect(msgs[0].role).toBe("assistant");
		expect(msgs[0].content.length).toBe(1); // 只有 tc-keep 的 toolCall block
		expect(msgs[0].content[0].id).toBe("tc-keep");
		expect(msgs[1].role).toBe("toolResult");
		expect(msgs[1].toolCallId).toBe("tc-keep");
	});

	it("空集合不影响任何消息", () => {
		const { pi, handlers } = createMockPi();
		const manuallyDeletedIds = new Set<string>();

		pi.on("context", (event: any) => {
			const messages = event.messages as any[];
			if (manuallyDeletedIds.size === 0) return;

			const toRemove: number[] = [];
			for (let i = 0; i < messages.length; i++) {
				const msg = messages[i];
				if (msg.role !== "toolResult") continue;
				const tcId = msg.toolCallId || "";
				if (tcId && manuallyDeletedIds.has(tcId)) toRemove.push(i);
			}
			for (let i = toRemove.length - 1; i >= 0; i--) {
				messages.splice(toRemove[i], 1);
			}
		});

		const msgs = [
			...buildMessages("read", "内容", "tc-1"),
			...buildMessages("bash", "内容2", "tc-2"),
		];
		triggerContext(handlers, msgs);

		expect(msgs.filter((m: any) => m.role === "toolResult").length).toBe(2);
	});

	it("清理已不存在的 tcId（防止集合无限增长）", () => {
		const manuallyDeletedIds = new Set<string>();
		manuallyDeletedIds.add("tc-old-1");
		manuallyDeletedIds.add("tc-old-2");
		manuallyDeletedIds.add("tc-active");

		// 模拟：messages 中只有 tc-active
		const activeTcIds = new Set(["tc-active"]);
		const removedIds = new Set<string>();

		for (const id of manuallyDeletedIds) {
			if (!activeTcIds.has(id)) {
				removedIds.add(id);
			}
		}
		for (const id of removedIds) manuallyDeletedIds.delete(id);

		expect(manuallyDeletedIds.size).toBe(1);
		expect(manuallyDeletedIds.has("tc-active")).toBe(true);
	});
});
