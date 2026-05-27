/**
 * Import 链路 smoke test
 *
 * 目的：验证 register.ts 能完整加载，且所有 action 对应的处理函数都可用。
 *
 * 方法：创建一个 mock pi 对象，调用 registerPayloadAnalyzer(pi)，
 * 然后对每个 action 调用 execute()，检查返回内容不含 "is not a function"。
 *
 * 如果拆文件后改漏了 import 路径，execute 内部会 catch TypeError
 * 并返回 "❌ 错误: xxx is not a function"。
 */
import { describe, it, expect, vi } from "vitest";

// Mock typebox
vi.mock("typebox", () => ({
	Type: {
		Object: vi.fn((props: Record<string, unknown>) => ({ type: "object", properties: props })),
		String: vi.fn(() => ({ type: "string" })),
		Union: vi.fn((members: unknown[]) => ({ anyOf: members })),
		Literal: vi.fn((val: string) => ({ const: val })),
		Optional: vi.fn((schema: unknown) => schema),
		Number: vi.fn(() => ({ type: "number" })),
		Boolean: vi.fn(() => ({ type: "boolean" })),
	},
}));

/** 从 execute 返回结果中提取文本 */
function getResultText(result: unknown): string {
	const r = result as { content?: Array<{ type: string; text: string }> };
	return r?.content?.[0]?.text ?? "";
}

describe("payload import chain smoke test", () => {
	it("所有 11 个 action 的处理函数都可用（不返回 is not a function）", async () => {
		const { registerPayloadAnalyzer } = await import("../../payload/register.js");

		let registeredTool: { execute: (...args: unknown[]) => Promise<unknown> } | null = null;
		const mockPi = {
			registerTool: vi.fn((tool: unknown) => {
				registeredTool = tool as typeof registeredTool;
			}),
			registerCommand: vi.fn(),
			on: vi.fn(),
		} as unknown as Parameters<typeof registerPayloadAnalyzer>[0];

		registerPayloadAnalyzer(mockPi);
		expect(registeredTool).not.toBeNull();

		const actions = [
			"list", "single", "overview", "chain", "chain-tcid",
			"stats", "diff", "budget", "expensive", "growth", "messages",
		];

		for (const action of actions) {
			const params: Record<string, unknown> = { action };
			if (action === "diff") {
				params.payloadPath = "/tmp/a.json";
				params.payloadPath2 = "/tmp/b.json";
			}

			const result = await registeredTool!.execute("_id", params, undefined, undefined, undefined);
			const text = getResultText(result);

			// 关键断言：返回内容不含 "is not a function"
			expect(
				text,
				`action "${action}" 不应返回 "is not a function"`,
			).not.toContain("is not a function");

			// 也检查未返回 "TypeError"
			expect(
				text,
				`action "${action}" 不应返回 TypeError`,
			).not.toContain("TypeError");
		}
	});
});
