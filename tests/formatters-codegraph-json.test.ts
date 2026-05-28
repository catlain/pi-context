/**
 * code-graph JSON 输出格式化器测试
 *
 * 验证所有 code-graph 工具的 JSON 输出被正确嗅探和格式化。
 * code-graph MCP 工具的实际输出全部是 JSON（不是纯文本行模式）：
 * - semantic_code_search: [{name, file_path, code_content, ...}]
 * - get_call_graph: {function, callers:[], callees:[]}
 * - get_ast_node (compact=true): 文本格式，非 JSON
 * - get_ast_node (compact=false): {name, file_path, code_content, ...} ← 已覆盖
 * - find_references: {symbol, total_references, references:[]}
 * - module_overview: {active_exports:[], files_count, summary}
 * - project_map: {modules:[], hot_functions:[], module_dependencies:[]}
 * - ast_search: {count, results:[{name, file_path, ...}]}
 */

import { describe, expect, it } from "vitest";
import {
	formatCodeGraphResult,
	sniffCodeGraph,
} from "./formatters-codegraph.js";

// ═══════════════════════════════════════════════════
// 嗅探测试
// ═══════════════════════════════════════════════════

describe("sniffCodeGraph — JSON 输出", () => {
	// ── semantic_code_search ──────────────────────

	it("识别 semantic_code_search JSON 数组", () => {
		const input = JSON.stringify([
			{
				name: "ruleMatches",
				file_path: "shepherd/rules.ts",
				type: "function",
				signature: "(rule, tool, targets) -> boolean",
				relevance: 1.11,
				code_content: "function ruleMatches(...) { ... }",
				start_line: 254,
				end_line: 272,
			},
		]);
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── get_call_graph ────────────────────────────

	it("识别 get_call_graph JSON", () => {
		const input = JSON.stringify({
			function: "loadRules",
			direction: "both",
			callees: [{ name: "loadRulesFromFile", file_path: "shepherd/rules.ts" }],
			callers: [{ name: "registerToolCall", file_path: "shepherd/tool-hooks.ts" }],
		});
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── find_references ───────────────────────────

	it("识别 find_references JSON", () => {
		const input = JSON.stringify({
			symbol: "pushWarning",
			total_references: 17,
			by_relation: { calls: 8, exports: 1, imports: 8 },
			references: [
				{
					name: "shepherdExtension",
					file_path: "index.ts",
					relation: "calls",
				},
			],
		});
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── module_overview ───────────────────────────

	it("识别 module_overview JSON", () => {
		const input = JSON.stringify({
			active_exports: [
				{ name: "loadRules", type: "function", file: "shepherd/rules.ts" },
			],
			files_count: 1,
			path: "shepherd/rules.ts",
			summary: "Module 'shepherd/rules.ts': 8 active + 3 inactive exports",
		});
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── project_map ───────────────────────────────

	it("识别 project_map JSON", () => {
		const input = JSON.stringify({
			modules: [
				{
					path: "shepherd",
					files: 6,
					functions: 22,
					key_symbols: ["pushWarning", "loadRules"],
				},
			],
			hot_functions: [
				{ name: "pushWarning", file: "shepherd/ephemeral.ts", caller_count: 5 },
			],
			module_dependencies: [{ from: "shepherd", to: "<root>" }],
		});
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── ast_search ────────────────────────────────

	it("识别 ast_search JSON", () => {
		const input = JSON.stringify({
			count: 3,
			results: [
				{
					name: "compileRules",
					file_path: "shepherd/rules.ts",
					type: "function",
					signature: "(rules: Rule[]) -> Rule[]",
				},
			],
		});
		expect(sniffCodeGraph(input)).toBe(true);
	});

	// ── 不误判 ─────────────────────────────────────

	it("不误判普通 JSON 对象", () => {
		const input = JSON.stringify({
			title: "Test",
			url: "https://example.com",
			items: [1, 2, 3],
		});
		expect(sniffCodeGraph(input)).toBe(false);
	});

	it("不误判 web_search JSON", () => {
		const input = JSON.stringify({
			query: "test",
			results: [{ title: "Test", url: "https://x.com", summary: "..." }],
		});
		expect(sniffCodeGraph(input)).toBe(false);
	});

	it("不误判 npm package.json", () => {
		const input = JSON.stringify({
			name: "my-package",
			version: "1.0.0",
			dependencies: { lodash: "^4.0.0" },
		});
		expect(sniffCodeGraph(input)).toBe(false);
	});
});

// ═══════════════════════════════════════════════════
// 格式化测试
// ═══════════════════════════════════════════════════

describe("formatCodeGraphResult — JSON 格式化", () => {
	// ── semantic_code_search ──────────────────────

	it("semantic_code_search: 保留符号名和文件路径", () => {
		const input = JSON.stringify([
			{
				name: "ruleMatches",
				file_path: "shepherd/rules.ts",
				type: "function",
				signature: "(rule, tool, targets) -> boolean",
				relevance: 1.11,
				start_line: 254,
				end_line: 272,
			},
			{
				name: "pushWarning",
				file_path: "shepherd/ephemeral.ts",
				type: "function",
				signature: "(msg: string) -> void",
				relevance: 0.82,
				start_line: 10,
				end_line: 15,
			},
		]);
		const result = formatCodeGraphResult(input);
		expect(result).toContain("ruleMatches");
		expect(result).toContain("shepherd/rules.ts");
		expect(result).toContain("pushWarning");
		expect(result).toContain("shepherd/ephemeral.ts");
		// 应比原始 JSON 短
		expect(result.length).toBeLessThan(input.length);
	});

	it("semantic_code_search: 带 code_content 时保留代码摘要", () => {
		const input = JSON.stringify([
			{
				name: "bigFunc",
				file_path: "src/big.ts",
				type: "function",
				code_content: "function bigFunc() {\n  // 50 lines\n}",
				relevance: 0.9,
				start_line: 1,
				end_line: 50,
			},
		]);
		const result = formatCodeGraphResult(input);
		expect(result).toContain("bigFunc");
		expect(result).toContain("src/big.ts");
	});

	it("semantic_code_search: 空结果返回原文本", () => {
		const input = JSON.stringify([]);
		const result = formatCodeGraphResult(input);
		expect(result).toBe(input);
	});

	// ── get_call_graph ────────────────────────────

	it("get_call_graph: 分组显示 callers 和 callees", () => {
		const input = JSON.stringify({
			function: "loadRules",
			direction: "both",
			callees: [
				{
					name: "loadRulesFromFile",
					file_path: "shepherd/rules.ts",
					depth: 1,
				},
				{
					name: "compileRules",
					file_path: "shepherd/rules.ts",
					depth: 1,
				},
			],
			callers: [
				{
					name: "registerToolCall",
					file_path: "shepherd/tool-hooks.ts",
					depth: 1,
				},
			],
			test_callers_filtered: 2,
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("loadRules");
		expect(result).toContain("CALLERS");
		expect(result).toContain("CALLEES");
		expect(result).toContain("registerToolCall");
		expect(result).toContain("loadRulesFromFile");
		expect(result).toContain("compileRules");
	});

	it("get_call_graph: 只有 callers 没有 callees", () => {
		const input = JSON.stringify({
			function: "main",
			direction: "callees",
			callers: [],
			callees: [
				{ name: "init", file_path: "src/init.ts", depth: 1 },
			],
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("main");
		expect(result).toContain("init");
	});

	// ── find_references ───────────────────────────

	it("find_references: 按类型分组显示引用", () => {
		const input = JSON.stringify({
			symbol: "pushWarning",
			total_references: 17,
			by_relation: { calls: 8, exports: 1, imports: 8 },
			references: [
				{
					name: "shepherdExtension",
					file_path: "index.ts",
					relation: "calls",
					start_line: 58,
					node_id: 229,
				},
				{
					name: "<module>",
					file_path: "shepherd/ephemeral.ts",
					relation: "exports",
					start_line: 1,
				},
				{
					name: "<module>",
					file_path: "index.ts",
					relation: "imports",
					start_line: 1,
				},
			],
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("pushWarning");
		expect(result).toContain("17 references");
		expect(result).toContain("calls: 8");
		expect(result).toContain("exports: 1");
		expect(result).toContain("imports: 8");
		expect(result).toContain("shepherdExtension");
	});

	// ── module_overview ───────────────────────────

	it("module_overview: 显示 summary + 符号表", () => {
		const input = JSON.stringify({
			active_exports: [
				{
					name: "isSubagent",
					type: "function",
					file: "shepherd/rules.ts",
					caller_count: 4,
					signature: "()",
					start_line: 101,
					end_line: 102,
				},
				{
					name: "loadRules",
					type: "function",
					file: "shepherd/rules.ts",
					caller_count: 3,
					signature: "(rulesDir?: string) -> Rule[]",
					start_line: 164,
					end_line: 199,
				},
			],
			inactive_summary: [
				{ type: "interface", count: 3, names: ["Condition", "Rule", "LoadRulesOptions"] },
			],
			files_count: 1,
			hot_paths: [
				{ name: "isSubagent", caller_count: 4, file: "shepherd/rules.ts" },
			],
			path: "shepherd/rules.ts",
			summary: "Module 'shepherd/rules.ts': 8 active + 3 inactive exports across 1 files",
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("shepherd/rules.ts");
		expect(result).toContain("isSubagent");
		expect(result).toContain("loadRules");
		expect(result).toContain("function");
		// 应比原始 JSON 短
		expect(result.length).toBeLessThan(input.length);
	});

	it("module_overview: 目录级（多文件）", () => {
		const input = JSON.stringify({
			active_exports: [
				{ name: "func1", type: "function", file: "a.ts", caller_count: 5 },
				{ name: "func2", type: "function", file: "b.ts", caller_count: 3 },
			],
			files_count: 3,
			path: "src/",
			summary: "Module 'src/': 10 active + 2 inactive exports across 3 files",
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("src/");
		expect(result).toContain("3 files");
	});

	// ── project_map ───────────────────────────────

	it("project_map: 显示模块、依赖、热函数", () => {
		const input = JSON.stringify({
			entry_points: [],
			modules: [
				{
					path: "shepherd",
					files: 6,
					functions: 22,
					key_symbols: ["pushWarning", "loadRules"],
				},
				{
					path: "tests",
					files: 11,
					functions: 17,
					key_symbols: ["makeRule", "makeCondition"],
				},
			],
			hot_functions: [
				{
					name: "pushWarning",
					file: "shepherd/ephemeral.ts",
					caller_count: 5,
					type: "function",
				},
			],
			module_dependencies: [
				{ from: "tests", to: "shepherd" },
				{ from: "shepherd", to: "<root>" },
			],
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("shepherd");
		expect(result).toContain("tests");
		expect(result).toContain("pushWarning");
		expect(result).toContain("6 files");
		expect(result).toContain("DEPENDENCIES");
		// 应比原始 JSON 短
		expect(result.length).toBeLessThan(input.length);
	});

	// ── ast_search ────────────────────────────────

	it("ast_search: 显示结果计数和符号列表", () => {
		const input = JSON.stringify({
			count: 3,
			results: [
				{
					name: "compileRules",
					file_path: "shepherd/rules.ts",
					type: "function",
					signature: "(rules: Rule[]) -> Rule[]",
					start_line: 137,
					end_line: 156,
					node_id: 159,
				},
				{
					name: "ruleMatches",
					file_path: "shepherd/rules.ts",
					type: "function",
					signature: "(rule, tool, targets) -> boolean",
					start_line: 254,
					end_line: 272,
					node_id: 163,
				},
			],
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("compileRules");
		expect(result).toContain("ruleMatches");
		expect(result).toContain("shepherd/rules.ts");
		// 应比原始 JSON 短
		expect(result.length).toBeLessThan(input.length);
	});

	it("ast_search: 空结果返回原文本", () => {
		const input = JSON.stringify({ count: 0, results: [] });
		const result = formatCodeGraphResult(input);
		expect(result).toBe(input);
	});
});

// ═══════════════════════════════════════════════════
// 压缩验证
// ═══════════════════════════════════════════════════

describe("formatCodeGraphResult — JSON 压缩效果", () => {
	it("大 JSON module_overview 压缩后不超过 200 行", () => {
		const exports = Array.from({ length: 50 }, (_, i) => ({
			name: `symbol_${i}`,
			type: "function",
			file: `src/file_${i}.ts`,
			caller_count: i,
			signature: `(arg${i}: Type${i}) -> ReturnType${i}`,
			start_line: i * 10,
			end_line: i * 10 + 9,
			node_id: i,
		}));
		const input = JSON.stringify({
			active_exports: exports,
			files_count: 50,
			path: "src/",
			summary: "Module 'src/': 50 active exports across 50 files",
		});
		const result = formatCodeGraphResult(input);
		const lines = result.split("\n");
		expect(lines.length).toBeLessThanOrEqual(202); // 200 + 头尾
	});
});
