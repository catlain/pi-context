/**
 * code-graph AST JSON 输出格式化器测试
 *
 * 验证 code-graph get_ast_node / module_overview 等工具的 JSON 输出
 * 被正确嗅探和压缩。
 *
 * 背景：get_ast_node 返回带 code_content 的 JSON，可能包含几百行源码，
 * 当前 sniffCodeGraph 只识别纯文本行模式，JSON 格式被忽略。
 */

import { describe, expect, it } from "vitest";
import {
	formatCodeGraphResult,
	sniffCodeGraph,
} from "./formatters-codegraph.js";

// ── 嗅探：AST JSON 格式 ──────────────────────────

describe("sniffCodeGraph — AST JSON", () => {
	it("识别 get_ast_node 的 JSON 输出（含 code_content）", () => {
		const astJson = JSON.stringify({
			name: "processToolResult",
			type: "function",
			file_path: "extensions/context/core.ts",
			start_line: 50,
			end_line: 105,
			signature: "((event) -> ToolResultEventResult | undefined",
			code_content: "function processToolResult(event) { ... }",
		});
		expect(sniffCodeGraph(astJson)).toBe(true);
	});

	it("识别带 qualified_name 的 AST JSON", () => {
		const astJson = JSON.stringify({
			name: "DataStore",
			qualified_name: "DataStore",
			type: "class",
			file_path: "lib/storage.ts",
			node_id: 42,
			code_content: "class DataStore { ... }",
		});
		expect(sniffCodeGraph(astJson)).toBe(true);
	});

	it("不误判普通 JSON（无 code-graph 特征字段）", () => {
		const normalJson = JSON.stringify({
			title: "Test",
			url: "https://example.com",
			content: "hello world",
		});
		expect(sniffCodeGraph(normalJson)).toBe(false);
	});
});

// ── 压缩：AST JSON code_content 截断 ─────────────

describe("formatCodeGraphResult — AST JSON 压缩", () => {
	it("长 code_content 被截断为签名 + 头尾几行", () => {
		const longCode = Array.from(
			{ length: 100 },
			(_, i) => `  line ${i}: const x${i} = ${i};`,
		).join("\n");
		const astJson = JSON.stringify({
			name: "bigFunction",
			type: "fn",
			file_path: "src/big.ts",
			start_line: 1,
			end_line: 100,
			signature: "(x: number) -> string",
			code_content: longCode,
		});

		const result = formatCodeGraphResult(astJson);
		// 结果应比原始 JSON 短
		expect(result.length).toBeLessThan(astJson.length);
		// 应保留关键元信息
		expect(result).toContain("bigFunction");
		expect(result).toContain("src/big.ts");
		expect(result).toContain("signature");
		expect(result).toContain("truncated");
	});

	it("短 code_content 保持完整", () => {
		const astJson = JSON.stringify({
			name: "smallFunc",
			type: "fn",
			file_path: "src/small.ts",
			signature: "() -> void",
			code_content: "function smallFunc() { return; }",
		});

		const result = formatCodeGraphResult(astJson);
		// 短内容不应该被截断
		expect(result).toContain("smallFunc");
		expect(result).toContain("function smallFunc");
	});

	it("无 code_content 的 AST JSON 保留元信息", () => {
		const astJson = JSON.stringify({
			name: "compactFunc",
			type: "fn",
			file_path: "src/compact.ts",
			signature: "() -> void",
			compact: true,
		});

		const result = formatCodeGraphResult(astJson);
		expect(result).toContain("compactFunc");
		expect(result).toContain("src/compact.ts");
	});
});
