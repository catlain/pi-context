/**
 * tool-result-processor-helpers.ts 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));
vi.mock("node:path", () => ({ join: (...parts: string[]) => parts.join("/") }));
vi.mock("node:fs", () => mockFs);
vi.mock("../utils.js", () => ({ formatTokens: (n: number) => `${n}t` }));

import {
	extractBashSourcePath,
	formatTimestamp,
	buildFileHeader,
	writeRawToFile,
	handleLargeResult,
	buildSummary,
} from "../tool-result-processor-helpers.js";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("extractBashSourcePath", () => {
	it("null/undefined → null", () => {
		expect(extractBashSourcePath(null)).toBeNull();
		expect(extractBashSourcePath(undefined)).toBeNull();
	});
	it("非对象 → null", () => {
		expect(extractBashSourcePath("s")).toBeNull();
		expect(extractBashSourcePath(42)).toBeNull();
	});
	it("truncation.truncated + fullOutputPath → 返回路径", () => {
		expect(extractBashSourcePath({ fullOutputPath: "/p.txt", truncation: { truncated: true } })).toBe("/p.txt");
	});
	it("truncation.truncated 为 false → null", () => {
		expect(extractBashSourcePath({ fullOutputPath: "/p.txt", truncation: { truncated: false } })).toBeNull();
	});
	it("truncation 不存在 → null", () => {
		expect(extractBashSourcePath({ fullOutputPath: "/p.txt" })).toBeNull();
	});
});

describe("formatTimestamp", () => {
	it("格式化为去除分隔符的时间字符串", () => {
		const r = formatTimestamp(1716000000000);
		expect(r).toMatch(/^\d{14}\./);
		expect(r.length).toBe(15);
	});
});

describe("buildFileHeader", () => {
	it("包含所有字段", () => {
		const h = buildFileHeader("my_tool", { k: "v" }, "tc-1", "sess-a");
		expect(h).toContain("=== my_tool ===");
		expect(h).toContain("调用ID: tc-1");
		expect(h).toContain("会话: sess-a");
		expect(h).toContain("k");
		expect(h).toContain("v");
	});
	it("无 session/toolCallId", () => {
		const h = buildFileHeader("t", { x: 1 });
		expect(h).not.toContain("会话:");
		expect(h).not.toContain("调用ID:");
	});
	it("参数超 200 字符截断", () => {
		const h = buildFileHeader("t", { data: "x".repeat(300) });
		expect(h).toContain("...");
	});
});

describe("writeRawToFile", () => {
	it("成功写入", () => {
		mockFs.mkdirSync.mockReturnThis();
		mockFs.writeFileSync.mockReturnThis();
		const r = writeRawToFile("raw", "my_tool", false, null, { a: 1 }, "tc-1");
		expect(r).toMatch(/\/tmp\/pi-distill\/processor\/my_tool-/);
		expect(mockFs.mkdirSync).toHaveBeenCalled();
		expect(mockFs.writeFileSync).toHaveBeenCalled();
	});
	it("writeFallback=true → null", () => {
		mockFs.mkdirSync.mockReturnThis();
		expect(writeRawToFile("raw", "t", true)).toBeNull();
	});
	it("sourcePath 存在 → 读取原文", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("source");
		mockFs.mkdirSync.mockReturnThis();
		mockFs.writeFileSync.mockReturnThis();
		const r = writeRawToFile("raw", "t", false, "/src.txt");
		expect(r).not.toBeNull();
		expect(mockFs.readFileSync).toHaveBeenCalledWith("/src.txt", "utf-8");
	});
	it("写入异常返回 null", () => {
		mockFs.mkdirSync.mockImplementation(() => { throw new Error("fail"); });
		expect(writeRawToFile("raw", "t", false)).toBeNull();
	});
});

describe("handleLargeResult", () => {
	it("tmpPath null → 降级", () => {
		const r = handleLargeResult("txt", "t", 100, null);
		expect(r.content[0].text).toBe("txt");
	});
	it("tmpPath 存在 → 摘要", () => {
		const r = handleLargeResult("a\nb", "t", 100, "/f.txt");
		expect(r.content[0].text).toContain("[processed]");
	});
});

describe("buildSummary", () => {
	it("短结果无 more lines", () => {
		const s = buildSummary("short\nresult", "t", 50, "/f.txt");
		expect(s).toContain("/f.txt");
		expect(s).not.toContain("more lines");
	});
	it("长结果有 more lines", () => {
		const s = buildSummary(Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n"), "big_t", 500, "/b.txt");
		expect(s).toContain("more lines");
	});
});
