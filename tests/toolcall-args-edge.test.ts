/**
 * toolCall.arguments 截断 — 边界值和错误路径测试
 *
 * 覆盖场景：
 * - 空 arguments（undefined/null/空对象）不崩溃
 * - messages 为空数组、无 assistant 消息
 * - assistant content 不是数组
 * - toolCall 无 id 时跳过
 * - truncateToolCallArgs 纯函数行为
 */
import { describe, it, expect } from "vitest";
import {
	truncateToolCallArgs,
	bigStr,
	makeAssistantMsg,
	makeMessages,
} from "./toolcall-args-helpers.js";

describe("truncateToolCallArgs — 边界值", () => {
	it("空 arguments（undefined）不崩溃", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "toolCall", id: "tc1", name: "read", arguments: undefined },
			],
		};
		const messages = [msg];
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs(messages, 1000, truncatedIds)).not.toThrow();
	});

	it("空 arguments（null）不崩溃", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "toolCall", id: "tc1", name: "read", arguments: null as any },
			],
		};
		const messages = [msg];
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs(messages, 1000, truncatedIds)).not.toThrow();
	});

	it("空 arguments（空对象）不崩溃且不截断", () => {
		const messages = makeMessages([
			{ id: "tc1", name: "read", args: {} },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(0);
		expect(messages[0].content[0].arguments._truncated).toBeUndefined();
	});

	it("messages 为空数组不崩溃", () => {
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs([], 1000, truncatedIds)).not.toThrow();
	});

	it("messages 中没有 assistant 消息不崩溃", () => {
		const messages = [
			{ role: "user", content: "hello" },
			{ role: "toolResult", toolCallId: "tc1", content: [{ type: "text", text: "ok" }] },
		];
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs(messages, 1000, truncatedIds)).not.toThrow();
	});

	it("assistant 消息 content 不是数组时不崩溃", () => {
		const messages = [
			{ role: "assistant", content: "plain text" },
		];
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs(messages, 1000, truncatedIds)).not.toThrow();
	});

	it("toolCall block 无 id 时跳过不崩溃", () => {
		const msg = {
			role: "assistant",
			content: [
				{ type: "toolCall", name: "read", arguments: { path: "test.ts" } },
			],
		};
		const messages = [msg];
		const truncatedIds = new Set<string>();

		expect(() => truncateToolCallArgs(messages, 1000, truncatedIds)).not.toThrow();
	});
});

describe("truncateToolCallArgs — 纯函数行为", () => {
	it("传入不同 Set 实例：第二次因 arguments 已被截断（_truncated 标志）而跳过", () => {
		const args = { path: "big.txt", content: bigStr(3000) };
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const ids1 = new Set<string>();
		const ids2 = new Set<string>();

		const count1 = truncateToolCallArgs(messages, 1000, ids1);
		const count2 = truncateToolCallArgs(messages, 1000, ids2);

		expect(count1).toBe(1);
		// block.arguments 已被就地修改为带 _truncated 的摘要对象
		// 即使 ids2 是空 Set，函数也会通过 _truncated 标志跳过
		expect(count2).toBe(0);
		expect(ids1.has("tc1")).toBe(true);
		expect(ids2.has("tc1")).toBe(false); // 第二次未截断
		// 两个 Set 独立，互不影响
		expect(ids1).not.toBe(ids2);
	});

	it("传入已有 tcId 的 Set：不再重复截断", () => {
		const args = { path: "big.txt", content: bigStr(3000) };
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		const count1 = truncateToolCallArgs(messages, 1000, truncatedIds);
		expect(count1).toBe(1);

		// 第二次调用，truncatedIds 已有 tc1 → 跳过
		const count2 = truncateToolCallArgs(messages, 1000, truncatedIds);
		expect(count2).toBe(0);
	});

	it("纯函数不依赖函数外部的全局状态", () => {
		// 构造两组完全独立的输入，验证结果只取决于参数
		const args1 = { path: "a.ts", content: bigStr(3000) };
		const args2 = { path: "b.ts", content: bigStr(2000) };
		const messages1 = makeMessages([{ id: "tc1", name: "write", args: args1 }]);
		const messages2 = makeMessages([{ id: "tc2", name: "write", args: args2 }]);
		const ids1 = new Set<string>();
		const ids2 = new Set<string>();

		const c1 = truncateToolCallArgs(messages1, 1000, ids1);
		const c2 = truncateToolCallArgs(messages2, 1000, ids2);

		expect(c1).toBe(1);
		expect(c2).toBe(1);
		// 互相不影响
		expect(ids1.has("tc2")).toBe(false);
		expect(ids2.has("tc1")).toBe(false);
	});
});
