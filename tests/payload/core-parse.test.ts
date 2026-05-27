import { describe, it, expect } from "vitest";
import { parseDistillHeader, parseArgs, extractReadPath } from "../../payload/core.js";
import { formatToolStats } from "../../payload/format.js";

describe("parseDistillHeader", () => {
	it("完整 header 解析", () => {
		const text = `[distilled read] path/to/file.ts\nOriginal: ~500 tokens, 20 lines\nFull content: /tmp/abc123`;
		const r = parseDistillHeader(text);
		expect(r).not.toBeNull();
		expect(r!.tool).toBe("read");
		expect(r!.origTokens).toBe(500);
		expect(r!.origLines).toBe(20);
		expect(r!.tmpPath).toBe("/tmp/abc123");
	});

	it("无 distill header 返回 null", () => {
		expect(parseDistillHeader("normal text")).toBeNull();
	});
});

describe("parseArgs", () => {
	it("合法 JSON", () => {
		expect(parseArgs('{"path":"a.ts"}')).toEqual({ path: "a.ts" });
	});
	it("非法 JSON 返回空对象", () => {
		expect(parseArgs("not json")).toEqual({});
	});
});

describe("extractReadPath", () => {
	it("提取 path", () => {
		expect(extractReadPath('{"path":"a.ts"}')).toBe("a.ts");
	});
	it("提取 filePath", () => {
		expect(extractReadPath('{"filePath":"b.ts"}')).toBe("b.ts");
	});
	it("都无返回空串", () => {
		expect(extractReadPath('{"cmd":"ls"}')).toBe("");
	});
});

describe("formatToolStats", () => {
	it("空输入返回空串", () => {
		expect(formatToolStats({})).toBe("");
	});
	it("null 返回空串", () => {
		expect(formatToolStats(null as any)).toBe("");
	});
	it("包含工具统计表格", () => {
		const stats = {
			read: { count: 5, callTokens: 100, resultTokens: 2000 },
			bash: { count: 3, callTokens: 50, resultTokens: 500 },
		};
		const out = formatToolStats(stats);
		expect(out).toContain("read");
		expect(out).toContain("bash");
		expect(out).toContain("📊");
	});
});
