import { describe, it, expect } from "vitest";
import { buildArgsSignature, buildTmpPath, formatTmpContent } from "./distill-helpers.js";

describe("buildArgsSignature", () => {
    it("read 工具用 path", () => {
        expect(buildArgsSignature("read", { path: "/home/user/file.ts" })).toBe("/home/user/file.ts");
    });

    it("edit 工具用 path", () => {
        expect(buildArgsSignature("edit", { path: "src/index.ts" })).toBe("src/index.ts");
    });

    it("write 工具用 path", () => {
        expect(buildArgsSignature("write", { path: "out.txt" })).toBe("out.txt");
    });

    it("bash 工具用 command 第一行前 80 字符", () => {
        const longCmd = "echo 'a'.repeat(1000)\necho second line";
        expect(buildArgsSignature("bash", { command: longCmd })).toBe("echo 'a'.repeat(1000)");
        expect(buildArgsSignature("bash", { command: "ls -la" })).toBe("ls -la");
    });

    it("grep 工具用 pattern in path", () => {
        expect(buildArgsSignature("grep", { pattern: "TODO", path: "src/" })).toBe("TODO in src/");
        expect(buildArgsSignature("grep", { pattern: "FIXME" })).toBe("FIXME");
    });

    it("find 工具用 pattern", () => {
        expect(buildArgsSignature("find", { pattern: "*.ts" })).toBe("*.ts");
    });

    it("ls 工具用 path", () => {
        expect(buildArgsSignature("ls", { path: "/tmp" })).toBe("/tmp");
    });

    it("未知工具返回空字符串", () => {
        expect(buildArgsSignature("unknown", { foo: "bar" })).toBe("");
    });

    it("undefined args 返回空字符串", () => {
        expect(buildArgsSignature("read", undefined)).toBe("");
    });

    it("空参数返回空字符串", () => {
        expect(buildArgsSignature("bash", {})).toBe("");
    });
});

describe("buildTmpPath", () => {
    it("同工具同参数生成同路径", () => {
        const a = buildTmpPath("read", "/home/user/file.ts");
        const b = buildTmpPath("read", "/home/user/file.ts");
        expect(a).toBe(b);
    });

    it("同工具不同参数生成不同路径", () => {
        const a = buildTmpPath("read", "/file-a.ts");
        const b = buildTmpPath("read", "/file-b.ts");
        expect(a).not.toBe(b);
    });

    it("不同工具同参数生成不同路径", () => {
        const a = buildTmpPath("read", "/file.ts");
        const b = buildTmpPath("edit", "/file.ts");
        expect(a).not.toBe(b);
    });

    it("空签名生成 no-sig 路径", () => {
        const p = buildTmpPath("unknown", "");
        expect(p).toContain("unknown-no-sig.txt");
    });

    it("路径在 distillDir 下", () => {
        const p = buildTmpPath("read", "/file.ts", "/custom/dir");
        expect(p).toMatch(/^\/custom\/dir\/read-[a-f0-9]{8}\.txt$/);
    });
});

describe("formatTmpContent", () => {
    it("包含 [distilled toolName] 标记", () => {
        const content = formatTmpContent({ name: "read", meta: "/file.ts" }, ["line1", "line2"], 5000);
        expect(content).toContain("[distilled read]");
        expect(content).toContain("/file.ts");
    });

    it("包含 Updated 时间戳", () => {
        const content = formatTmpContent({ name: "bash", meta: "ls -la" }, ["output"], 100);
        expect(content).toMatch(/Updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it("包含 Original 行数和 token 估算", () => {
        const content = formatTmpContent({ name: "read", meta: "" }, Array(100).fill("x"), 4000);
        expect(content).toContain("100 lines");
    });

    it("无 meta 时不显示路径", () => {
        const content = formatTmpContent({ name: "unknown", meta: "" }, ["data"], 100);
        expect(content).toContain("=== [distilled unknown] ===");
    });

    it("原始内容完整包含", () => {
        const lines = ["line 1", "line 2", "line 3"];
        const content = formatTmpContent({ name: "read", meta: "" }, lines, 100);
        for (const l of lines) {
            expect(content).toContain(l);
        }
    });
});

describe("buildArgsSignature — 同路径返回同签名", () => {
    it("read 同路径（无 offset/limit vs 有 offset/limit）返回同签名", () => {
        const sig1 = buildArgsSignature("read", { path: "/home/user/file.ts" });
        const sig2 = buildArgsSignature("read", { path: "/home/user/file.ts", offset: 10, limit: 5 });
        expect(sig1).toBe(sig2);
    });

    it("read 同路径不同 offset 返回同签名", () => {
        const sig1 = buildArgsSignature("read", { path: "/home/user/file.ts", offset: 10, limit: 5 });
        const sig2 = buildArgsSignature("read", { path: "/home/user/file.ts", offset: 20, limit: 10 });
        expect(sig1).toBe(sig2);
    });

    it("read 不同路径返回不同签名", () => {
        const sig1 = buildArgsSignature("read", { path: "/a.ts" });
        const sig2 = buildArgsSignature("read", { path: "/b.ts" });
        expect(sig1).not.toBe(sig2);
    });
});
