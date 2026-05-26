/**
 * 单元测试：removeOrphanedToolCalls — 孤立 toolCall block 清理
 *
 * 覆盖场景：
 * - 正常删除孤立 toolCall block
 * - 保留有对应 toolResult 的 toolCall
 * - 全部 toolCall 被移除后空 assistant 消息删除
 * - 有 text/thinking 时 assistant 消息保留
 */
import { describe, it, expect } from "vitest";
import { removeOrphanedToolCalls } from "./distill-helpers.js";

describe("removeOrphanedToolCalls", () => {
	it("删除孤立 toolCall block 后 messages 正确", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "让我先看看文件" },
					{ type: "toolCall", id: "call-coarse", name: "read", arguments: '{"path":"/file.ts"}' },
					{ type: "toolCall", id: "call-precision", name: "read", arguments: '{"path":"/file.ts","offset":10,"limit":5}' },
				],
			},
			{ role: "toolResult", toolName: "read", toolCallId: "call-coarse", content: "very long content here".repeat(500) },
			{ role: "toolResult", toolName: "read", toolCallId: "call-precision", content: "short" },
		];

		const filtered = messages.filter((m: any) => m.toolCallId !== "call-coarse");
		removeOrphanedToolCalls(filtered);

		const assistant = filtered.find((m: any) => m.role === "assistant");
		const toolCallIds = assistant.content
			.filter((b: any) => b.type === "toolCall")
			.map((b: any) => b.id);
		expect(toolCallIds).toEqual(["call-precision"]);
		expect(assistant.content.some((b: any) => b.type === "text")).toBe(true);
	});

	it("保留有对应 toolResult 的 toolCall block", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "call-keep", name: "read", arguments: '{"path":"/file.ts","offset":10}' },
					{ type: "toolCall", id: "call-keep2", name: "bash", arguments: '{"command":"ls"}' },
				],
			},
			{ role: "toolResult", toolName: "read", toolCallId: "call-keep", content: "short content" },
			{ role: "toolResult", toolName: "bash", toolCallId: "call-keep2", content: "file.ts\nfile2.ts" },
		];

		removeOrphanedToolCalls(messages);

		const assistant = messages.find((m: any) => m.role === "assistant");
		expect(assistant.content).toHaveLength(2);
	});

	it("toolCall 全部被移除后若 content 为空则删除该 assistant 消息", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [{ type: "toolCall", id: "call-orphan", name: "read", arguments: '{"path":"/x.ts"}' }],
			},
		];

		removeOrphanedToolCalls(messages);

		expect(messages.some((m: any) => m.role === "assistant")).toBe(false);
	});

	it("assistant 有 text+thinking 时 toolCall 全部移除后保留消息", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Let me check the file" },
					{ type: "thinking", thinking: "I need to read this file" },
					{ type: "toolCall", id: "call-orphan", name: "read", arguments: '{"path":"/x.ts"}' },
				],
			},
		];

		removeOrphanedToolCalls(messages);

		const assistant = messages.find((m: any) => m.role === "assistant");
		expect(assistant).toBeDefined();
		expect(assistant.content).toHaveLength(2);
		expect(assistant.content.every((b: any) => b.type !== "toolCall")).toBe(true);
	});

	it("孤立 toolCall + 有 text block — 保留 assistant 消息，只删 toolCall", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Here's what I found" },
					{ type: "toolCall", id: "call-orphan", name: "read", arguments: '{"path":"/x.ts"}' },
				],
			},
		];

		removeOrphanedToolCalls(messages);

		const assistant = messages.find((m: any) => m.role === "assistant");
		expect(assistant).toBeDefined();
		expect(assistant.content).toHaveLength(1);
		expect(assistant.content[0].type).toBe("text");
	});

	it("多个 assistant 消息，只删除有孤立 toolCall 的那个", () => {
		const messages: any[] = [
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "call-orphan", name: "read", arguments: '{"path":"/x.ts"}' },
				],
			},
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "call-valid", name: "read", arguments: '{"path":"/y.ts"}' },
				],
			},
			{ role: "toolResult", toolName: "read", toolCallId: "call-valid", content: "data" },
		];

		removeOrphanedToolCalls(messages);

		expect(messages.filter((m: any) => m.role === "assistant")).toHaveLength(1);
		expect(messages.some((m: any) => m.role === "assistant" && m.content[0]?.id === "call-valid")).toBe(true);
	});
});
