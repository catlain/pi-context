/**
 * Godot MCP 工具结果格式化器测试
 *
 * 验证 Godot MCP 工具（game_query, scene_snapshot 等）的 JSON 输出
 * 被正确嗅探和压缩。
 *
 * 背景：game_query 的 get_tree 返回 JSON.stringify(sceneTree, null, 2)，
 * 场景树可能包含大量节点数据，需要智能压缩。
 */

import { describe, expect, it } from "vitest";
import {
	formatMcpJsonResult,
	sniffMcpJson,
} from "./formatters-mcp-json.js";

// ── 嗅探 ────────────────────────────────────────

describe("sniffMcpJson", () => {
	it("识别 Godot MCP 场景树 JSON（含 children 递归结构）", () => {
		const sceneTree = JSON.stringify({
			status: "success",
			data: {
				root: {
					type: "Node3D",
					name: "Root",
					children: [
						{ type: "Camera3D", name: "Camera", path: "Root/Camera" },
					],
				},
			},
		});
		expect(sniffMcpJson(sceneTree)).toBe(true);
	});

	it("识别 Godot MCP 节点属性 JSON（含 type + properties）", () => {
		const nodeProps = JSON.stringify({
			status: "success",
			data: {
				type: "CharacterBody3D",
				name: "Player",
				properties: {
					position: { x: 1, y: 2, z: 3 },
					velocity: { x: 0, y: 0, z: 0 },
				},
			},
		});
		expect(sniffMcpJson(nodeProps)).toBe(true);
	});

	it("不误判普通 JSON", () => {
		expect(sniffMcpJson('{"title":"hello","url":"https://example.com"}')).toBe(false);
	});

	it("不误判 code-graph AST JSON", () => {
		const astJson = JSON.stringify({
			name: "myFunc",
			type: "fn",
			file_path: "src/main.ts",
			signature: "() -> void",
			code_content: "function myFunc() {}",
		});
		expect(sniffMcpJson(astJson)).toBe(false);
	});

	it("不误判非 JSON 文本", () => {
		expect(sniffMcpJson("hello world")).toBe(false);
		expect(sniffMcpJson("")).toBe(false);
	});
});

// ── 压缩 ────────────────────────────────────────

describe("formatMcpJsonResult", () => {
	it("短 JSON 保持原样", () => {
		const shortJson = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Root" },
		});
		expect(formatMcpJsonResult(shortJson)).toBe(shortJson);
	});

	it("大型场景树压缩为摘要", () => {
		// 构造一个中型场景树：3 层嵌套
		const deepTree = buildLargeSceneTree(0, 3, 5); // 5*5*5 = 125 nodes
		const json = JSON.stringify({ status: "success", data: deepTree }, null, 2);

		// 确认输入足够大
		expect(json.length).toBeGreaterThan(5000);

		const result = formatMcpJsonResult(json);
		// 结果应比输入短很多
		expect(result.length).toBeLessThan(json.length * 0.5);
		// 应包含节点统计
		expect(result).toContain("nodes");
	});

	it("含 type + properties 的 JSON 保留非默认属性", () => {
		const json = JSON.stringify({
			status: "success",
			data: {
				type: "Node3D",
				name: "Player",
				properties: {
					position: { x: 1, y: 2, z: 3 },
					rotation: { x: 0, y: 0, z: 0 },  // 默认值
					scale: { x: 1, y: 1, z: 1 },      // 默认值
					visible: true,                      // 默认值
				},
			},
		}, null, 2);

		const result = formatMcpJsonResult(json);
		// 非默认值应保留
		expect(result).toContain("position");
	});

	it("非 MCP JSON 原样返回", () => {
		const normal = "this is not json at all";
		expect(formatMcpJsonResult(normal)).toBe(normal);
	});
});

// ── 辅助函数 ─────────────────────────────────────

function buildLargeSceneTree(
	branches: number,
	depth: number,
	width: number,
): any {
	if (depth <= 0) {
		return {
			type: "MeshInstance3D",
			name: "Leaf",
			path: "Root/.../Leaf",
			properties: {
				position: { x: Math.random() * 100, y: 0, z: Math.random() * 100 },
				visible: true,
			},
		};
	}
	return {
		type: "Node3D",
		name: `Branch_L${depth}`,
		path: `Root/.../Branch_L${depth}`,
		children: Array.from({ length: width }, (_, i) =>
			buildLargeSceneTree(branches, depth - 1, Math.max(2, width - 1)),
		),
	};
}
