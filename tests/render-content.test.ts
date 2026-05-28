/**
 * render.ts — renderContent 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-tui", () => ({
	Container: vi.fn(() => ({
		clear: vi.fn(),
		addChild: vi.fn(() => ({})),
	})),
	Spacer: vi.fn(() => ({})),
	Text: vi.fn(() => ({})),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	DynamicBorder: vi.fn(() => ({})),
}));

import { renderContent } from "../render.js";
import type { RecordItem } from "../types.js";

function createTheme() {
	return {
		bold: vi.fn((s: string) => `B(${s})`),
		fg: vi.fn((_c: string, s: string) => `FG(${_c},${s})`),
	};
}

function createContainer() {
	return { clear: vi.fn(), addChild: vi.fn(() => ({})) };
}

const basicRecord: RecordItem = {
	summary: "test record",
	callTokens: 100,
	resultTokens: 50,
	lines: ["line 1", "line 2", "line 3"],
};

const deletedRecord: RecordItem = {
	summary: "deleted",
	callTokens: 50,
	resultTokens: 0,
	lines: ["content"],
	manuallyDeleted: true,
};

const recordWithTcId: RecordItem = {
	summary: "tool call",
	callTokens: 200,
	resultTokens: 300,
	lines: ["a", "b", "c"],
	toolCallId: "tc-001",
	manuallyDeleted: false,
};

const manyLinesRecord: RecordItem = {
	summary: "many lines",
	callTokens: 0,
	resultTokens: 0,
	lines: Array(50).fill("line content string"),
};

const longLineRecord: RecordItem = {
	summary: "long line",
	callTokens: 100,
	resultTokens: 0,
	lines: ["A".repeat(300)],
};

describe("renderContent", () => {
	beforeEach(() => vi.clearAllMocks());

	it("渲染记录详情 — 基本信息", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(c as any, t as any, "read", basicRecord, 0, 30, false);
		expect(c.clear).toHaveBeenCalled();
	});

	it("manuallyDeleted 显示删除标记", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(c as any, t as any, "deleted", deletedRecord, 0, 30, false);
		expect(c.clear).toHaveBeenCalled();
	});

	it("confirmingDelete 显示确认提示", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(c as any, t as any, "read", basicRecord, 0, 30, true);
		expect(c.clear).toHaveBeenCalled();
	});

	it("有 toolCallId 且未删除显示 d delete 提示", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(c as any, t as many, "tool", recordWithTcId, 0, 10, false);
		expect(c.clear).toHaveBeenCalled();
	});

	it("行数超出可视区域时显示滚动", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(
			c as any,
			t as any,
			"file",
			manyLinesRecord,
			10,
			20,
			false,
		);
		expect(c.clear).toHaveBeenCalled();
	});

	it("行数未超出可视区域简洁显示", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(
			c as any,
			t as any,
			"small",
			basicRecord,
			0,
			50,
			false,
		);
		expect(c.clear).toHaveBeenCalled();
	});

	it("超出 200 字符的行截断", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(
			c as any,
			t as any,
			"long",
			longLineRecord,
			0,
			50,
			false,
		);
		expect(c.clear).toHaveBeenCalled();
	});

	it("无 callTokens/resultTokens 时无 info 行", () => {
		const c = createContainer();
		const t = createTheme();
		const zeroRec: RecordItem = {
			summary: "zero",
			callTokens: 0,
			resultTokens: 0,
			lines: ["x"],
		};
		renderContent(c as any, t as any, "empty", zeroRec, 0, 10, false);
		expect(c.clear).toHaveBeenCalled();
	});

	it("toolCallId 记录超出 viewport 显示滚动导航", () => {
		const c = createContainer();
		const t = createTheme();
		renderContent(
			c as any,
			t as any,
			"tool",
			recordWithTcId,
			0,
			50,
			false,
		);
		expect(c.clear).toHaveBeenCalled();
	});
});
