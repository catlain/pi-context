/**
 * distill-helpers isSkillFilePath 单元测试
 *
 * 注意：AGENT_DIR 是模块级常量（import 时求值），
 * 所以在 import 之前就要设好环境变量。
 */
import { describe, it, expect, afterAll } from "vitest";

const ORIG_PI_AGENT = process.env.PI_AGENT_DIR;

// 必须在 import distill-helpers 前设置 PI_AGENT_DIR
process.env.PI_AGENT_DIR = "/home/user/.pi/agent";

const { isSkillFilePath } = await import("../distill-helpers.js");

afterAll(() => {
	if (ORIG_PI_AGENT) process.env.PI_AGENT_DIR = ORIG_PI_AGENT;
	else delete process.env.PI_AGENT_DIR;
});

describe("isSkillFilePath", () => {
	it("undefined 路径返回 false", () => {
		expect(isSkillFilePath(undefined)).toBe(false);
	});

	it("空字符串返回 false", () => {
		expect(isSkillFilePath("")).toBe(false);
	});

	it("AGENT_DIR 外的路径返回 false", () => {
		expect(isSkillFilePath("/etc/passwd")).toBe(false);
	});

	it("相对路径 skills/ 内文件返回 true", () => {
		expect(isSkillFilePath("skills/code-graph/SKILL.md")).toBe(true);
	});

	it("npm 技能路径返回 true", () => {
		expect(isSkillFilePath("node_modules/pkg/skills/setup/SKILL.md")).toBe(true);
	});

	it("AGENT_DIR 内但非 skills 的路径返回 false", () => {
		expect(isSkillFilePath("memory/foo.md")).toBe(false);
	});

	it("绝对路径匹配 skills/ 返回 true", () => {
		expect(isSkillFilePath("/home/user/.pi/agent/skills/code-graph/SKILL.md")).toBe(true);
	});

	it("绝对路径不匹配 skills/ 返回 false", () => {
		expect(isSkillFilePath("/home/user/.pi/agent/memory/foo.md")).toBe(false);
	});
});
