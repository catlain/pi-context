/**
 * 字符数硬限制测试
 *
 * 验证：即使 token 估算低于阈值，字符数超过 CHAR_THRESHOLD 时
 * 仍然进入大结果处理路径。
 *
 * 背景：estimateTokens 用 length/4 低估结构化文本，
 * 导致 11K 字符的 Godot MCP 输出（~2750 estimated tokens < 4000 阈值）
 * 被判定为"小结果"直接放行。
 */

import { describe, expect, it, vi } from "vitest";
import { registerToolResultProcessor } from "../tool-result-processor.js";

function createMockPi() {
	const handlers: Array<{
		event: string;
		handler: (event: any, ctx: any) => any;
	}> = [];

	const pi = {
		on: vi.fn((event: string, handler: (event: any, ctx: any) => any) => {
			handlers.push({ event, handler });
		}),
		events: { emit: vi.fn() },
	};

	function triggerToolResult(event: any): any {
		const trHandler = handlers.find((h) => h.event === "tool_result");
		if (!trHandler) throw new Error("tool_result handler not registered");
		return trHandler.handler(event, {});
	}

	return { pi, triggerToolResult };
}

describe("字符数硬限制", () => {
	it("8K+ 字符的非格式化内容进入大结果处理", () => {
		const { pi, triggerToolResult } = createMockPi();
		// 使用默认阈值 4000 → charHardLimit = max(8000, 4000*2) = 8000
		registerToolResultProcessor(pi as any, {});

		// 9000 字符 → estimateTokens = 2250 < 4000 阈值
		// 但字符数超过 8000 硬限制，应进入大结果
		const rawText = "X".repeat(9000);

		const result = triggerToolResult({
			toolName: "bash",
			content: [{ type: "text", text: rawText }],
			input: { command: "cat bigfile.txt" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("[processed]");
		expect(text).toContain("tokens");
	});

	it("6K 字符内容不触发字符数硬限制（token 阈值也够低）", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, {});

		// 6000 字符 → 1500 tokens < 4000，且 < 8000 字符限制
		const rawText = "Y".repeat(6000);

		const result = triggerToolResult({
			toolName: "bash",
			content: [{ type: "text", text: rawText }],
			input: { command: "echo test" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		// 小结果不应该有 [processed] 标记
		expect(result.content[0].text).not.toContain("[processed]");
	});

	it("Godot MCP 风格 JSON（11K 字符）进入大结果处理", () => {
		const { pi, triggerToolResult } = createMockPi();
		registerToolResultProcessor(pi as any, {});

		// 模拟 Godot game_query get_tree 返回的场景树 JSON
		const godotTree = {
			root: {
				type: "Node3D",
				name: "Root",
				children: Array.from({ length: 50 }, (_, i) => ({
					type: "Node3D",
					name: `Node_${i}`,
					path: `Root/Node_${i}`,
					children: Array.from({ length: 5 }, (_, j) => ({
						type: "MeshInstance3D",
						name: `Mesh_${i}_${j}`,
						path: `Root/Node_${i}/Mesh_${i}_${j}`,
						properties: {
							position: { x: i, y: j, z: 0 },
							rotation: { x: 0, y: 0, z: 0 },
							scale: { x: 1, y: 1, z: 1 },
							visible: true,
						},
					})),
				})),
			},
		};
		const rawText = JSON.stringify(godotTree, null, 2);
		// 确认长度 > 8K
		expect(rawText.length).toBeGreaterThan(8000);

		const result = triggerToolResult({
			toolName: "game_query",
			content: [{ type: "text", text: rawText }],
			input: { method: "get_tree" },
			isError: false,
		});

		expect(result).not.toBeUndefined();
		const text = result.content[0].text;
		expect(text).toContain("[processed]");
	});
});
