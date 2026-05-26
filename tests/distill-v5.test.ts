/**
 * Context distill v5 — 单元测试
 *
 * 覆盖场景：
 * - 首次超阈值：保留全文 + 推 hint
 * - 已见：彻底删除 toolResult + 关联 toolCall block
 * - 阈值降低后旧大结果的清理
 * - 不同 tcId 独立处理，每个 tcId 首次都给全文 + hint（同参数新 read 也有改正机会）
 * - seenArgs（存 tcId）永不 delete
 */
import { describe, it, expect } from "vitest";
import { processContextMessages } from "./shared-process.js";

/** 生成 toolCall + toolResult 消息对 */
function makeToolPair(
	tcid: string,
	toolName: string,
	args: object,
	resultText: string,
) {
	return [
		{
			role: "assistant",
			content: [{ type: "toolCall", id: tcid, name: toolName, arguments: args }],
		},
		{
			role: "toolResult",
			toolCallId: tcid,
			toolName,
			content: [{ type: "text", text: resultText }],
		},
	];
}

/** 生成 ~N tokens 的文本（1 token ≈ 4 chars） */
function bigText(tokens: number): string {
	return "x".repeat(tokens * 4);
}

describe("distill v5", () => {
	it("首次超阈值：保留全文 + 推 hint", () => {
		const seen = new Set<string>();
		const text = bigText(1000);
		const messages = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "foo.ts" }, text),
		];

		const result = processContextMessages(messages, seen, 500);

		// 全文保留
		const tr = result.messages.find((m: any) => m.role === "toolResult");
		expect(tr).toBeDefined();
		expect(tr.content[0].text).toBe(text);

		// hint 已推
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("~1000 tokens");
		expect(result.hints[0]).toContain("不留痕迹");

		// seen 已标记
		expect(seen.size).toBe(1);
	});

	it("已见：彻底删除 toolResult + toolCall block", () => {
		const seen = new Set<string>();
		const text = bigText(1000);
		const messages = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "foo.ts" }, text),
		];

		// 第1轮：首次
		processContextMessages(messages, seen, 500);
		expect(seen.size).toBe(1);

		// 模拟深拷贝（新一轮）
		const messages2 = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "foo.ts" }, text),
		];

		// 第2轮：已见
		const result = processContextMessages(messages2, seen, 500);

		// toolResult 被删除
		expect(result.messages.find((m: any) => m.role === "toolResult")).toBeUndefined();
		// toolCall block 被清理
		const assistant = result.messages.find((m: any) => m.role === "assistant");
		expect(assistant).toBeUndefined(); // 空 assistant 也被清理
		// 无 hint
		expect(result.hints).toHaveLength(0);
		// removedSigs 记录
		expect(result.removedSigs).toHaveLength(1);
	});

	it("seenArgs 永不 delete：第3轮仍然正确移除", () => {
		const seen = new Set<string>();
		const text = bigText(1000);
		const args = { path: "foo.ts" };

		// 第1轮：首次
		const m1 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", args, text)];
		processContextMessages(m1, seen, 500);

		// 第2轮：已见
		const m2 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", args, text)];
		const r2 = processContextMessages(m2, seen, 500);
		expect(r2.removedSigs).toHaveLength(1);

		// 第3轮：仍然已见（不循环回首次）
		const m3 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", args, text)];
		const r3 = processContextMessages(m3, seen, 500);
		expect(r3.removedSigs).toHaveLength(1);
		expect(r3.hints).toHaveLength(0);
	});

	it("阈值降低后旧大结果被清理", () => {
		const seen = new Set<string>();
		const text = bigText(1000);

		// 阈值 1500：不触发蒸馏
		const m1 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", { path: "foo.ts" }, text)];
		const r1 = processContextMessages(m1, seen, 1500);
		expect(r1.hints).toHaveLength(0);
		expect(seen.size).toBe(0);

		// 阈值降到 500：现在触发（首次）
		const m2 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", { path: "foo.ts" }, text)];
		const r2 = processContextMessages(m2, seen, 500);
		expect(r2.hints).toHaveLength(1);
		expect(seen.size).toBe(1);

		// 第3轮：已见 → 删除
		const m3 = [{ role: "user", content: "hi" }, ...makeToolPair("tc1", "read", { path: "foo.ts" }, text)];
		const r3 = processContextMessages(m3, seen, 500);
		expect(r3.removedSigs).toHaveLength(1);
	});

	it("不同 tcId 独立处理，每个 tcId 首次都给全文 + hint", () => {
		const seen = new Set<string>();
		const text = bigText(1000);

		// 第1轮：两个不同 tcId，都是首次
		const messages = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "a.ts" }, text),
			...makeToolPair("tc2", "read", { path: "b.ts" }, text),
		];

		const r1 = processContextMessages(messages, seen, 500);
		expect(r1.hints).toHaveLength(2);

		// 第2轮：新 tcId（tc3, tc4），每个都是首次 → 保留全文 + hint
		// 旧 tcId（tc1, tc2）如果在同一 messages 中会被静默删除
		const messages2 = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc3", "read", { path: "a.ts" }, text),
			...makeToolPair("tc4", "read", { path: "b.ts" }, text),
		];
		const r2 = processContextMessages(messages2, seen, 500);
		expect(r2.removedSigs).toHaveLength(0); // 新 tcId，都不是已见
		expect(r2.hints).toHaveLength(2); // 每个新 tcId 都给 hint

		// 第3轮：复用旧 tcId（tc1），会被静默删除
		const messages3 = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "a.ts" }, text),
		];
		const r3 = processContextMessages(messages3, seen, 500);
		expect(r3.removedSigs).toHaveLength(1);
		expect(r3.hints).toHaveLength(0);
	});

	it("不超阈值的结果不受影响", () => {
		const seen = new Set<string>();
		const smallText = "small result";

		const messages = [
			{ role: "user", content: "hi" },
			...makeToolPair("tc1", "read", { path: "foo.ts" }, smallText),
		];

		const result = processContextMessages(messages, seen, 500);

		// toolResult 保留
		const tr = result.messages.find((m: any) => m.role === "toolResult");
		expect(tr).toBeDefined();
		expect(result.hints).toHaveLength(0);
	});
});
