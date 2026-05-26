import { describe, it, expect } from "vitest";
import { formatMcpError } from "../formatters-errors.js";

describe("formatMcpError", () => {
	it("提取 MCP 错误码和消息", () => {
		// MCP 返回的格式：500 Internal Server Error: "{\"error\":{\"code\":\"1234\",\"message\":\"网络错误\"}}"
		// 在 JavaScript 字符串中需要双重转义
		const result = formatMcpError(
			'MCP error -500: 500 Internal Server Error: "{\"error\":{\"code\":\"1234\",\"message\":\"网络错误\"}}"',
		);
		expect(result).toBe("❌ 错误：网络错误 (错误码: -500)");
	});

	it("错误无 JSON 详情时使用原始消息", () => {
		const result = formatMcpError("MCP error 404: Not Found");
		expect(result).toBe("❌ 错误：Not Found (错误码: 404)");
	});

	it("非 MCP 错误返回原文", () => {
		const result = formatMcpError("This is not an MCP error");
		expect(result).toBe("This is not an MCP error");
	});

	it("JSON 解析失败时清理 HTTP 前缀", () => {
		const result = formatMcpError(
			'MCP error 500: Server Error: "{invalid json}"',
		);
		expect(result).toBe('❌ 错误："{invalid json}" (错误码: 500)');
	});

	it("GLM 网络错误示例", () => {
		const result = formatMcpError(
			'MCP error -500: 500 Internal Server Error: "{\"error\":{\"code\":\"1234\",\"message\":\"网络错误，错误id：202605171616094135cf1c1bde4a1b，请稍后重试\"}}"',
		);
		expect(result).toContain("网络错误，错误id：202605171616094135cf1c1bde4a1b");
	});
});