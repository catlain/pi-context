/**
 * distill-helpers 工具函数测试：buildArgsSignature, buildTmpPath, formatTmpContent, buildSummary
 */
import { describe, it, expect } from "vitest";
import {
	buildArgsSignature,
	buildTmpPath,
	formatTmpContent,
	buildSummary,
} from "../distill-helpers.js";

// ── buildArgsSignature ──

describe("buildArgsSignature", () => {
	it("无 args 时返回空字符串", () => {
		expect(buildArgsSignature("read", undefined)).toBe("");
	});

	it("read: 返回 path", () => {
		expect(buildArgsSignature("read", { path: "foo.ts" })).toBe("foo.ts");
	});

	it("edit: 返回 path", () => {
		expect(buildArgsSignature("edit", { path: "bar.ts" })).toBe("bar.ts");
	});

	it("write: 返回 path", () => {
		expect(buildArgsSignature("write", { path: "baz.ts" })).toBe("baz.ts");
	});

	it("bash: 返回 command 首行截取 80 字符", () => {
		expect(buildArgsSignature("bash", { command: "ls -la\necho hi" })).toBe("ls -la");
	});

	it("bash: 无 command 时返回空字符串", () => {
		expect(buildArgsSignature("bash", {})).toBe("");
	});

	it("grep: 返回 pattern in path", () => {
		expect(buildArgsSignature("grep", { pattern: "foo", path: "src/" })).toBe("foo in src/");
	});

	it("find: 返回 pattern", () => {
		expect(buildArgsSignature("find", { pattern: "*.ts" })).toBe("*.ts");
	});

	it("find: 无 pattern 时返回空字符串", () => {
		expect(buildArgsSignature("find", {})).toBe("");
	});

	it("ls: 返回 path", () => {
		expect(buildArgsSignature("ls", { path: "src/" })).toBe("src/");
	});

	it("ls: 无 path 时返回空字符串", () => {
		expect(buildArgsSignature("ls", {})).toBe("");
	});

	it("默认（未知工具名）: 返回空字符串", () => {
		expect(buildArgsSignature("custom-tool", { path: "x" })).toBe("");
	});
});

// ── buildTmpPath ──

describe("buildTmpPath", () => {
	it("有签名时生成带 hash 的路径", () => {
		const result = buildTmpPath("read", "foo.ts");
		expect(result).toMatch(/\/pi-distill\/read-[a-f0-9]{8}\.txt$/);
	});

	it("无签名时用 no-sig", () => {
		const result = buildTmpPath("bash", "");
		expect(result).toMatch(/\/pi-distill\/bash-no-sig\.txt$/);
	});

	it("自定义 distillDir", () => {
		const result = buildTmpPath("read", "foo.ts", "/custom/dir");
		expect(result).toMatch(/^\/custom\/dir\/read-[a-f0-9]{8}\.txt$/);
	});
});

// ── formatTmpContent ──

describe("formatTmpContent", () => {
	it("有 meta.meta 时生成带路径的 header", () => {
		const result = formatTmpContent(
			{ name: "read", meta: "foo.ts" },
			["line1", "line2"],
			100,
		);
		expect(result).toContain("[distilled read] foo.ts");
		expect(result).toContain("Updated:");
		expect(result).toContain("Original: ~100 tokens, 2 lines");
		expect(result).toContain("line1\nline2");
	});

	it("无 meta.meta 时生成通用 header", () => {
		const result = formatTmpContent(
			{ name: "bash", meta: "" },
			["output"],
			50,
		);
		expect(result).toContain("[distilled bash]");
	});
});

// ── buildSummary ──

describe("buildSummary", () => {
	it("生成完整摘要，包含预览行和 more 提示", () => {
		const lines = ["a", "b", "c", "d", "e", "f"];
		const result = buildSummary(
			{ name: "read", meta: "foo.ts" },
			lines,
			"/tmp/pi-distill/read-abc.txt",
			120,
			3,
		);
		expect(result).toContain("[distilled read] foo.ts");
		expect(result).toContain("120 tokens");
		expect(result).toContain("6 lines");
		expect(result).toContain("/tmp/pi-distill/read-abc.txt");
		expect(result).toContain("  1 a");
		expect(result).toContain("  3 c");
		expect(result).toContain("... (3 more lines)");
	});

	it("无 meta.meta 时无路径描述", () => {
		const result = buildSummary(
			{ name: "bash", meta: "" },
			["output"],
			"/tmp/x.txt",
			5,
			5,
		);
		expect(result).toBe("[distilled bash]\nOriginal: 5 tokens (~5), 1 lines\nFull content: /tmp/x.txt\n\n  1 output");
	});

	it("预览行数 >= 总行数时不显示 more", () => {
		const result = buildSummary(
			{ name: "read", meta: "foo.ts" },
			["a", "b"],
			"/tmp/x.txt",
			10,
			5,
		);
		expect(result).not.toContain("more lines");
	});
});
