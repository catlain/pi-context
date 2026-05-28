/**
 * render.ts 基础测试 — getViewport, renderOverview
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockContainerClear = vi.fn();
const mockContainerAddChild = vi.fn(() => ({}));

vi.mock("@earendil-works/pi-tui", () => ({
	Container: vi.fn(() => ({
		clear: mockContainerClear,
		addChild: mockContainerAddChild,
	})),
	Spacer: vi.fn(() => ({})),
	Text: vi.fn(() => ({})),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	DynamicBorder: vi.fn(() => ({})),
}));

import { getViewport, renderOverview } from "../render.js";
import type { ContextData } from "../types.js";

function createTheme() {
	return {
		bold: vi.fn((s: string) => `B(${s})`),
		fg: vi.fn((_color: string, s: string) => `FG(${_color},${s})`),
	};
}

function createContainer() {
	return { clear: vi.fn(), addChild: vi.fn(() => ({})) };
}

const sampleData: ContextData = {
	categories: [
		{
			label: "System Prompt",
			value: 500,
			color: "muted",
			enterable: true,
			children: [],
		},
		{
			label: "Messages",
			value: 200,
			color: "accent",
			enterable: true,
			children: [],
		},
	],
	totalActual: 700,
	limit: 8192,
	percent: 8.5,
};

// ── getViewport ─────────────────────────────────

describe("getViewport", () => {
	it("使用 tui.terminal.rows 计算 80%", () => {
		expect(getViewport({ terminal: { rows: 50 } })).toBe(40);
	});

	it("最小返回 10", () => {
		expect(getViewport({ terminal: { rows: 5 } })).toBe(10);
	});

	it("无 terminal 时回退到 LINES", () => {
		process.env.LINES = "30";
		expect(getViewport({})).toBe(24);
		delete process.env.LINES;
	});

	it("无 terminal 也无 LINES 时回退到默认 40", () => {
		const vp = getViewport({});
		expect(vp).toBe(32);
	});
});

// ── renderOverview ──────────────────────────────

describe("renderOverview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("清空容器并添加组件", () => {
		const c = createContainer();
		const t = createTheme();
		renderOverview(c as any, sampleData, t as any, 0);
		expect(c.clear).toHaveBeenCalled();
		expect(c.addChild).toHaveBeenCalled();
	});

	it("空 categories 显示占位消息", () => {
		const c = createContainer();
		const t = createTheme();
		const empty: ContextData = {
			categories: [],
			totalActual: 0,
			limit: 8192,
			percent: 0,
		};
		renderOverview(c as any, empty, t as any, 0);
		expect(c.addChild).toHaveBeenCalled();
	});

	it("选中第 1 项", () => {
		const c = createContainer();
		const t = createTheme();
		renderOverview(c as any, sampleData, t as any, 1);
		expect(c.clear).toHaveBeenCalled();
	});
});
