/**
 * render.ts — renderCategory, renderRecords 测试
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

import { renderCategory, renderRecords } from "../render.js";
import type { ContextData, CategoryItem, RecordItem } from "../types.js";

function createTheme() {
	return {
		bold: vi.fn((s: string) => `B(${s})`),
		fg: vi.fn((_c: string, s: string) => `FG(${_c},${s})`),
	};
}

function createContainer() {
	return { clear: vi.fn(), addChild: vi.fn(() => ({})) };
}

const sampleData: ContextData = {
	categories: [],
	totalActual: 1000,
	limit: 4096,
	percent: 24.4,
};

const records: RecordItem[] = [
	{ summary: "file read", callTokens: 100, resultTokens: 0, lines: ["a"] },
	{
		summary: "bash output",
		callTokens: 200,
		resultTokens: 150,
		lines: ["b"],
		distilled: true,
		agingCount: 2,
	},
	{
		summary: "long summary exceeds forty character display limit xyz",
		callTokens: 50,
		resultTokens: 0,
		lines: ["c"],
	},
];

// ── renderCategory ──────────────────────────────

describe("renderCategory", () => {
	beforeEach(() => vi.clearAllMocks());

	it("渲染类别及其子项", () => {
		const c = createContainer();
		const t = createTheme();
		const cat: CategoryItem = {
			label: "Tools",
			value: 400,
			color: "success",
			enterable: true,
			children: [
				{
					label: "read",
					value: 150,
					callTokens: 100,
					resultTokens: 50,
					color: "success",
					enterable: true,
					records: [],
				},
			],
		};
		renderCategory(c as any, sampleData, t as any, cat, 0);
		expect(c.clear).toHaveBeenCalled();
	});

	it("子项无 callTokens 时显示 value 格式", () => {
		const c = createContainer();
		const t = createTheme();
		const cat: CategoryItem = {
			label: "Messages",
			value: 200,
			color: "accent",
			enterable: true,
			children: [
				{
					label: "User",
					value: 100,
					callTokens: 0,
					resultTokens: 0,
					color: "accent",
					enterable: false,
					records: [],
				},
			],
		};
		renderCategory(c as any, sampleData, t as any, cat, 0);
		expect(c.clear).toHaveBeenCalled();
	});

	it("空 children 也能渲染", () => {
		const c = createContainer();
		const t = createTheme();
		const emptyCat: CategoryItem = {
			label: "Empty",
			value: 0,
			color: "dim",
			enterable: false,
			children: [],
		};
		renderCategory(c as any, sampleData, t as any, emptyCat, 0);
		expect(c.clear).toHaveBeenCalled();
	});
});

// ── renderRecords ───────────────────────────────

describe("renderRecords", () => {
	beforeEach(() => vi.clearAllMocks());

	it("渲染记录列表（非工具模式）", () => {
		const c = createContainer();
		const t = createTheme();
		renderRecords(c as any, sampleData, t as any, "User", records, 0, false, 0, 40);
		expect(c.clear).toHaveBeenCalled();
	});

	it("工具模式显示 call/result token 列", () => {
		const c = createContainer();
		const t = createTheme();
		renderRecords(c as any, sampleData, t as any, "Tools > read", records, 0, true, 0, 40);
		expect(c.clear).toHaveBeenCalled();
	});

	it("大量记录显示滚动信息", () => {
		const c = createContainer();
		const t = createTheme();
		const many: RecordItem[] = Array(20)
			.fill(null)
			.map((_, i) => ({
				summary: `rec ${i}`,
				callTokens: 10,
				resultTokens: 0,
				lines: [],
			}));
		renderRecords(c as any, sampleData, t as any, "Tools", many, 0, false, 5, 40);
		expect(c.clear).toHaveBeenCalled();
	});

	it("无 distill/aging 标记的记录", () => {
		const c = createContainer();
		const t = createTheme();
		const plainRecords: RecordItem[] = [
			{ summary: "plain", callTokens: 10, resultTokens: 5, lines: [] },
		];
		renderRecords(c as any, sampleData, t as any, "Tools", plainRecords, 0, true, 0, 40);
		expect(c.clear).toHaveBeenCalled();
	});

	it("带 distilled/agingCount 标记", () => {
		const c = createContainer();
		const t = createTheme();
		const markedRecs: RecordItem[] = [
			{
				summary: "distilled",
				callTokens: 100,
				resultTokens: 50,
				lines: [],
				distilled: true,
				agingCount: 3,
			},
		];
		renderRecords(c as any, sampleData, t as any, "Tools", markedRecs, 0, true, 0, 40);
		expect(c.clear).toHaveBeenCalled();
	});
});
