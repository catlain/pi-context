/**
 * distill-helpers toolMeta 单元测试
 *
 * 覆盖 toolMeta 所有 switch 分支：read, write, edit, bash, grep, find, ls, default
 */
import { describe, it, expect } from "vitest";
import { toolMeta } from "../distill-helpers.js";

function makeToolCallMap(entries: [string, string, unknown][]) {
	const map = new Map<string, { name: string; arguments: unknown }>();
	for (const [id, name, args] of entries) {
		map.set(id, { name, arguments: args });
	}
	return map;
}

describe("toolMeta", () => {
	it("read: 返回 path", () => {
		const map = makeToolCallMap([["tc1", "read", { path: "foo.ts" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "read", content: [] },
			map,
		);
		expect(result).toEqual({ name: "read", meta: "foo.ts" });
	});

	it("read: 无 path 时返回空字符串", () => {
		const map = makeToolCallMap([["tc1", "read", {}]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "read", content: [] },
			map,
		);
		expect(result).toEqual({ name: "read", meta: "" });
	});

	it("write: 返回 path", () => {
		const map = makeToolCallMap([["tc1", "write", { path: "bar.ts" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "write", content: [] },
			map,
		);
		expect(result).toEqual({ name: "write", meta: "bar.ts" });
	});

	it("edit: 返回 path", () => {
		const map = makeToolCallMap([["tc1", "edit", { path: "baz.ts" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "edit", content: [] },
			map,
		);
		expect(result).toEqual({ name: "edit", meta: "baz.ts" });
	});

	it("bash: 返回 command 首行截取 80 字符", () => {
		const map = makeToolCallMap([["tc1", "bash", { command: "ls -la\necho hi" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [] },
			map,
		);
		expect(result).toEqual({ name: "bash", meta: "ls -la" });
	});

	it("bash: 无 command 时返回空字符串", () => {
		const map = makeToolCallMap([["tc1", "bash", {}]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [] },
			map,
		);
		expect(result).toEqual({ name: "bash", meta: "" });
	});

	it("grep: 返回 pattern in path", () => {
		const map = makeToolCallMap([["tc1", "grep", { pattern: "foo", path: "src/" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "grep", content: [] },
			map,
		);
		expect(result).toEqual({ name: "grep", meta: "foo in src/" });
	});

	it("grep: 仅有 pattern 时只返回 pattern", () => {
		const map = makeToolCallMap([["tc1", "grep", { pattern: "foo" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "grep", content: [] },
			map,
		);
		expect(result).toEqual({ name: "grep", meta: "foo" });
	});

	it("find: 返回 pattern", () => {
		const map = makeToolCallMap([["tc1", "find", { pattern: "*.ts" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "find", content: [] },
			map,
		);
		expect(result).toEqual({ name: "find", meta: "*.ts" });
	});

	it("find: 无 pattern 时返回空字符串", () => {
		const map = makeToolCallMap([["tc1", "find", {}]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "find", content: [] },
			map,
		);
		expect(result).toEqual({ name: "find", meta: "" });
	});

	it("ls: 返回 path", () => {
		const map = makeToolCallMap([["tc1", "ls", { path: "src/" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "ls", content: [] },
			map,
		);
		expect(result).toEqual({ name: "ls", meta: "src/" });
	});

	it("ls: 无 path 时返回空字符串", () => {
		const map = makeToolCallMap([["tc1", "ls", {}]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "ls", content: [] },
			map,
		);
		expect(result).toEqual({ name: "ls", meta: "" });
	});

	it("默认（未知工具名）: 返回空字符串", () => {
		const map = makeToolCallMap([["tc1", "custom-tool", { path: "x" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", toolName: "custom-tool", content: [] },
			map,
		);
		expect(result).toEqual({ name: "custom-tool", meta: "" });
	});

	it("无 toolName 时默认 unknown，命中 default 分支返回空 meta", () => {
		const map = makeToolCallMap([["tc1", "read", { path: "x.ts" }]]);
		const result = toolMeta(
			{ role: "toolResult", toolCallId: "tc1", content: [] },
			map,
		);
		expect(result).toEqual({ name: "unknown", meta: "" });
	});

	it("无 toolCallId 时查不到 toolCallMap", () => {
		const result = toolMeta(
			{ role: "toolResult", toolName: "read", toolCallId: "", content: [] },
			new Map(),
		);
		expect(result).toEqual({ name: "read", meta: "" });
	});
});
