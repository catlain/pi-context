/**
 * expensive.ts 测试 — 最贵工具调用分析
 *
 * 覆盖：
 * - 空 files 列表
 * - 单个文件、单个 tool result
 * - 多文件多 tool result 排序
 * - topN 截断
 * - 无效文件（readJsonFile 返回 null）
 */
import { describe, it, expect, vi } from "vitest";

const mockReadJsonFile = vi.fn(() => null);
vi.mock("../../payload/core.js", () => ({
	estTokens: (s: string) => Math.ceil(s.length / 4),
	fmtTok: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)),
	getText: (c: any) => (typeof c === "string" ? c : ""),
	buildProviderToolCallIndex: (msgs: any[]) => {
		const m = new Map();
		for (const msg of msgs) {
			if (msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					m.set(tc.id, { name: tc.function.name, argsStr: tc.function.arguments });
				}
			}
		}
		return m;
	},
	classifyStatus: (s: string) =>
		s.includes("[processed]") ? "TRUNCATED" : "FULL_KEPT",
	readJsonFile: (...args: any[]) => mockReadJsonFile(...args),
	RECORDINGS_DIR: "/tmp/test-recordings",
}));

import { doExpensive } from "../../payload/expensive.js";

describe("doExpensive", () => {
	it("空 files 列表返回提示信息", () => {
		const result = doExpensive([]);
		expect(result).toContain("共 0 个");
	});

	it("单个文件、单个 tool result", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [
				{
					role: "assistant",
					tool_calls: [
						{ id: "tc1", function: { name: "read", arguments: '{"path":"a.ts"}' } },
					],
				},
				{ role: "tool", tool_call_id: "tc1", content: "x".repeat(400) },
			],
		});
		const result = doExpensive([{ filename: "req-0001-abc", path: "/tmp/a.json" }]);
		expect(result).toContain("read");
		expect(result).toContain("100"); // 400/4 = 100 tokens
		mockReadJsonFile.mockReset();
	});

	it("多文件多 tool result 按 token 降序排列", () => {
		mockReadJsonFile
			.mockReturnValueOnce({
				messages: [
					{ role: "assistant", tool_calls: [
						{ id: "tc1", function: { name: "read", arguments: "{}" } },
					]},
					{ role: "tool", tool_call_id: "tc1", content: "a".repeat(200) },
				],
			})
			.mockReturnValueOnce({
				messages: [
					{ role: "assistant", tool_calls: [
						{ id: "tc2", function: { name: "bash", arguments: "{}" } },
					]},
					{ role: "tool", tool_call_id: "tc2", content: "b".repeat(800) },
				],
			});
		const result = doExpensive([
			{ filename: "req-0001-a", path: "/tmp/a.json" },
			{ filename: "req-0002-b", path: "/tmp/b.json" },
		]);
		// bash (200 tokens) 排在 read (50 tokens) 前面
		const bashIdx = result.indexOf("bash");
		const readIdx = result.indexOf("read");
		expect(bashIdx).toBeLessThan(readIdx);
		mockReadJsonFile.mockReset();
	});

	it("topN 参数截断结果", () => {
		const files = Array.from({ length: 10 }, (_, i) => ({
			filename: `req-${String(i + 1).padStart(4, "0")}-x`,
			path: `/tmp/${i}.json`,
		}));
		mockReadJsonFile.mockImplementation((p: string) => ({
			messages: [
				{ role: "assistant", tool_calls: [
					{ id: "tc1", function: { name: "read", arguments: "{}" } },
				]},
				{ role: "tool", tool_call_id: "tc1", content: "x".repeat(100) },
			],
		}));
		const result = doExpensive(files, 3);
		expect(result).toContain("Top 3 / 共 10 个");
		mockReadJsonFile.mockReset();
	});

	it("无效文件（readJsonFile 返回 null）跳过不崩溃", () => {
		mockReadJsonFile.mockReturnValue(null);
		const result = doExpensive([{ filename: "req-0001-x", path: "/tmp/bad.json" }]);
		expect(result).toContain("共 0 个");
		mockReadJsonFile.mockReset();
	});

	it("按工具汇总包含聚合统计", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [
				{ role: "assistant", tool_calls: [
					{ id: "tc1", function: { name: "read", arguments: "{}" } },
					{ id: "tc2", function: { name: "read", arguments: "{}" } },
				]},
				{ role: "tool", tool_call_id: "tc1", content: "a".repeat(400) },
				{ role: "tool", tool_call_id: "tc2", content: "b".repeat(200) },
			],
		});
		const result = doExpensive([{ filename: "req-0001-x", path: "/tmp/a.json" }]);
		expect(result).toContain("按工具汇总");
		expect(result).toContain("read");
		mockReadJsonFile.mockReset();
	});
});
