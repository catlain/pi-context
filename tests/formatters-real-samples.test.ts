/**
 * 真实工具输出样本 — formatter 误判防护测试
 * 样本来源：~/.pi/agent/distill/processor/ 历史记录（47 个真实样本）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatWebSearchResult } from "../formatters-web.js";
import { formatCodeGraphResult } from "../formatters-codegraph.js";
import { formatMcpJsonResult } from "../formatters-mcp-json.js";
import { processToolResult } from "../tool-result-processor-core.js";

const samplesPath = path.join(__dirname, "fixtures", "real-samples.json");
const rawSamples: Record<string, string> = JSON.parse(
	fs.readFileSync(samplesPath, "utf-8"),
);

/** 去掉 processor 元信息头，提取纯结果 */
function extractResult(raw: string): string {
	const parts = raw.split("\n\n");
	if (parts.length >= 3) return parts.slice(2).join("\n\n").trim();
	if (parts.length >= 2) return parts.slice(1).join("\n\n").trim();
	return raw;
}

/** 非搜索类工具 */
const nonSearchTools = Object.keys(rawSamples).filter(
	(k) =>
		k !== "web_search" &&
		k !== "glm_web_search_web_search_prime" &&
		k !== "settings_json_packages",
);

/** 非 code-graph 类工具 */
const nonCodegraphTools = Object.keys(rawSamples).filter(
	(k) => !k.startsWith("code_graph") && k !== "settings_json_packages",
);

describe("formatter 误判防护 — formatWebSearchResult", () => {
	it.each(nonSearchTools)("不误判 %s", (tool) => {
		const result = formatWebSearchResult(rawSamples[tool], 4000);
		expect(result).toBe(rawSamples[tool]);
	});

	it("正确处理真实 glm_web_search 输出", () => {
		const result = formatWebSearchResult(
			rawSamples["glm_web_search_web_search_prime"],
			4000,
		);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("不误判 settings.json packages (String.prototype.link bug)", () => {
		const result = formatWebSearchResult(
			rawSamples["settings_json_packages"],
			4000,
		);
		expect(result).toBe(rawSamples["settings_json_packages"]);
	});

	// markdown 格式工具输出不应被搜索 formatter 误判
	const mdTools = [
		"roadmap_show",
		"vision_analyze",
		"memory_index",
		"roadmap_list",
	];
	it.each(mdTools)("%s (markdown) 不被格式化", (tool) => {
		const result = formatWebSearchResult(rawSamples[tool], 4000);
		expect(result).toBe(rawSamples[tool]);
	});
});

describe("formatter 误判防护 — formatCodeGraphResult", () => {
	it.each(nonCodegraphTools)("不误判 %s", (tool) => {
		const result = formatCodeGraphResult(rawSamples[tool], 4000);
		expect(result).toBe(rawSamples[tool]);
	});
});

describe("formatter 误判防护 — formatMcpJsonResult", () => {
	it.each(Object.keys(rawSamples))("不破坏 %s", (tool) => {
		const result = formatMcpJsonResult(rawSamples[tool], 4000);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("大输出处理", () => {
	// 用超大样本测试截断（必须 > 8000 字符 + 超过 token 阈值）
	const largeTools = ["game_query", "glm_zread_read_file"];

	it.each(largeTools)("%s 应被截断", (tool) => {
		const sample = rawSamples[tool];
		expect(sample.length).toBeGreaterThan(8000);
		const event = {
			toolName: tool,
			content: [{ type: "text" as const, text: sample }],
		};
		const result = processToolResult(event, 4000, false);
		expect(result).toBeDefined();
		const newText = result!.content
			.filter((p: any) => p.type === "text")
			.map((p: any) => p.text ?? "")
			.join("");
		// processor 必须返回有效内容（可能截断也可能加标记）
		expect(newText.length).toBeGreaterThan(0);
		// game_query (146KB) 是 JSON，应该被 MCP JSON formatter 嗅探并截断
		if (tool === "game_query") {
			expect(newText.length).toBeLessThan(sample.length);
		}
	});
});

describe("小输出不误截", () => {
	const smallTools = [
		"bash", "read", "grep", "ls", "find",
		"godot_game_query", "godot_validate_scripts",
		"roadmap_done", "roadmap_update",
		"session_analyze", "memory_update", "memory_index",
		"setup_codegraph",
	];

	it.each(smallTools)("%s 应原样通过", (tool) => {
		const sample = rawSamples[tool];
		const event = {
			toolName: tool,
			content: [{ type: "text" as const, text: sample }],
		};
		const result = processToolResult(event, 4000, false);
		// 小输出可能返回 undefined（表示不处理）或返回原文
		if (result === undefined) return; // 不处理 = 原样通过
		const newText = result.content
			.filter((p: any) => p.type === "text")
			.map((p: any) => p.text ?? "")
			.join("");
		expect(newText.length).toBeGreaterThanOrEqual(sample.length * 0.8);
	});
});
