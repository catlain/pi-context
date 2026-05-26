/**
 * toolCall.arguments 截断 — 基本路径测试
 *
 * 覆盖场景：
 * - 小 arguments 不截断
 * - 大 arguments 被截断
 * - 已截断不重复处理
 * - 同一消息多个 toolCall block
 * - 返回值和 truncatedIds 副作用
 * - 跨多个 assistant 消息
 */
import { describe, it, expect } from "vitest";
import {
	truncateToolCallArgs,
	bigStr,
	makeAssistantMsg,
	makeMessages,
} from "./toolcall-args-helpers.js";

describe("truncateToolCallArgs — 基本路径", () => {
	it("小 arguments 不截断：threshold 以下保持原样", () => {
		const args = { path: "foo.ts", pattern: "TODO" };
		const messages = makeMessages([
			{ id: "tc1", name: "read", args },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 10_000, truncatedIds);

		expect(count).toBe(0);
		const block = messages[0].content[0];
		expect(block.arguments).toEqual(args);
		expect(block.arguments._truncated).toBeUndefined();
	});

	it("大 arguments 被截断：超阈值后 arguments 替换为摘要", () => {
		const args = { path: "big.txt", content: bigStr(3000) };
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(1);
		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.toolName).toBe("write");
		expect(block.arguments.summary).toContain("tokens");
		expect(block.arguments.summary).toContain(".pi/agent/distill/processor/");
	});

	it("同一消息多个 toolCall block：各自独立判断", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "toolCall", id: "tc1", name: "read", arguments: { path: "small.ts" } },
				{ type: "toolCall", id: "tc2", name: "write", arguments: { path: "big.ts", content: bigStr(3000) } },
			],
		};
		const messages = [msg];
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(1);
		// tc1 小参数保持原样
		expect(msg.content[0].arguments._truncated).toBeUndefined();
		// tc2 大参数被截断
		expect(msg.content[1].arguments._truncated).toBe(true);
	});

	it("已截断不重复处理：truncatedIds 防止二次写入", () => {
		const args = { path: "big.txt", content: bigStr(3000) };
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>(["tc1"]);

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(0);
		const block = messages[0].content[0];
		// arguments 保持原样（未被截断），因为已标记为已处理
		expect(block.arguments._truncated).toBeUndefined();
		expect(block.arguments.content).toBe(args.content);
	});

	it("返回值为实际截断的 toolCall 数量", () => {
		const messages = makeMessages([
			{ id: "tc1", name: "read", args: { path: "small.ts" } },
			{ id: "tc2", name: "write", args: { path: "big.ts", content: bigStr(3000) } },
			{ id: "tc3", name: "bash", args: { command: bigStr(3000) } },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(2);
	});

	it("truncatedIds 记录所有被截断的 toolCall ID", () => {
		const messages = makeMessages([
			{ id: "tc1", name: "write", args: { path: "a.ts", content: bigStr(3000) } },
			{ id: "tc2", name: "read", args: { path: "b.ts" } },
			{ id: "tc3", name: "bash", args: { command: bigStr(3000) } },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(truncatedIds.has("tc1")).toBe(true);
		expect(truncatedIds.has("tc2")).toBe(false); // 小参数
		expect(truncatedIds.has("tc3")).toBe(true);
	});

	it("遍历多个 assistant 消息中的所有 toolCall block", () => {
		const messages = makeMessages([
			{ id: "tc1", name: "read", args: { path: "small.ts" } },
		]);
		messages.push(makeAssistantMsg("tc2", "write", {
			path: "big.ts",
			content: bigStr(3000),
		}));
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(1);
		expect(truncatedIds.has("tc1")).toBe(false);
		expect(truncatedIds.has("tc2")).toBe(true);
	});
});
