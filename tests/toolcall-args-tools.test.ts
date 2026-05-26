/**
 * toolCall.arguments 截断 — 按工具类型截断测试
 *
 * 覆盖场景：
 * - bash command 截断
 * - write content 截断
 * - edit oldText+newText 截断
 * - edit 只有 oldText 大
 * - 保留小字段（两个场景）
 */
import { describe, it, expect } from "vitest";
import {
	truncateToolCallArgs,
	bigStr,
	makeMessages,
} from "./toolcall-args-helpers.js";

describe("truncateToolCallArgs — 按工具类型截断", () => {
	// ── bash ──

	it("bash command 截断：只截断 command 字段，其他小字段保留", () => {
		const args = {
			command: bigStr(3000),
			description: "build project",
		};
		const messages = makeMessages([
			{ id: "tc1", name: "bash", args },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 1000, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.toolName).toBe("bash");
		// description 是小字段（≤200 字符），应保留
		expect(block.arguments.description).toBe("build project");
		// command 是大字段，应移除
		expect(block.arguments.command).toBeUndefined();
	});

	it("bash 全部小字段不截断", () => {
		const args = { command: "ls -la", description: "list files" };
		const messages = makeMessages([
			{ id: "tc1", name: "bash", args },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(0);
		expect(messages[0].content[0].arguments.command).toBe("ls -la");
	});

	// ── write ──

	it("write content 截断：只截断 content 字段，path 保留", () => {
		const args = {
			path: "output.txt",
			content: bigStr(3000),
		};
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 1000, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.path).toBe("output.txt");
		expect(block.arguments.content).toBeUndefined();
	});

	it("write 只有 path 小字段不截断", () => {
		const args = { path: "readme.md", content: "hello" };
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(0);
		expect(messages[0].content[0].arguments.content).toBe("hello");
	});

	// ── edit ──

	it("edit oldText+newText 截断：两个大字段合并截断", () => {
		const args = {
			path: "src/index.ts",
			oldText: bigStr(2000),
			newText: bigStr(2000),
		};
		const messages = makeMessages([
			{ id: "tc1", name: "edit", args },
		]);
		const truncatedIds = new Set<string>();

		// threshold 较小以使 arguments 超阈值
		truncateToolCallArgs(messages, 500, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.toolName).toBe("edit");
		// path 是小字段，保留
		expect(block.arguments.path).toBe("src/index.ts");
		// oldText 和 newText 是大字段，移除
		expect(block.arguments.oldText).toBeUndefined();
		expect(block.arguments.newText).toBeUndefined();
	});

	it("edit 只有 oldText 大：只截断 oldText，保留 newText（如果小）", () => {
		const args = {
			path: "src/index.ts",
			oldText: bigStr(3000),
			newText: "console.log('fixed');",
		};
		const messages = makeMessages([
			{ id: "tc1", name: "edit", args },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 500, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.path).toBe("src/index.ts");
		// oldText 是大字段（~3000 tokens），移除
		expect(block.arguments.oldText).toBeUndefined();
		// newText 是小字段（短字符串 ≤200 字符），保留
		expect(block.arguments.newText).toBe("console.log('fixed');");
	});

	it("edit 全部小字段不截断", () => {
		const args = {
			path: "src/index.ts",
			oldText: "old line",
			newText: "new line",
		};
		const messages = makeMessages([
			{ id: "tc1", name: "edit", args },
		]);
		const truncatedIds = new Set<string>();

		const count = truncateToolCallArgs(messages, 1000, truncatedIds);

		expect(count).toBe(0);
		expect(messages[0].content[0].arguments.oldText).toBe("old line");
		expect(messages[0].content[0].arguments.newText).toBe("new line");
	});

	// ── 保留小字段 ──

	it("保留小字段：path/pattern 等小字段保留在摘要中", () => {
		const args = {
			path: "src/main.ts",
			pattern: "TODO",
			content: bigStr(3000),
		};
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 1000, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments.path).toBe("src/main.ts");
		expect(block.arguments.pattern).toBe("TODO");
		expect(block.arguments.content).toBeUndefined();
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.toolName).toBe("write");
		expect(block.arguments.summary).toContain("tokens");
	});

	it("保留小字段：多个小字段均保留，仅大字段被移除", () => {
		const args = {
			path: "config.json",
			glob: "*.json",
			limit: "50",
			content: bigStr(5000),
		};
		const messages = makeMessages([
			{ id: "tc1", name: "write", args },
		]);
		const truncatedIds = new Set<string>();

		truncateToolCallArgs(messages, 1000, truncatedIds);

		const block = messages[0].content[0];
		expect(block.arguments.path).toBe("config.json");
		expect(block.arguments.glob).toBe("*.json");
		expect(block.arguments.limit).toBe("50");
		expect(block.arguments.content).toBeUndefined();
		expect(block.arguments._truncated).toBe(true);
	});
});
