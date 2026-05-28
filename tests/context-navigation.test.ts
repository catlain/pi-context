/**
 * context.ts — 基本层级导航测试（overview → category → records → content, esc 返回）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	DynamicBorder: vi.fn(() => ({})),
}));
const mockContainer = vi.hoisted(() => ({ addChild: vi.fn(), clear: vi.fn(), render: vi.fn(() => []), invalidate: vi.fn() }));
vi.mock("@earendil-works/pi-tui", () => ({
	Container: vi.fn(() => mockContainer),
	Spacer: vi.fn(() => ({})),
	Text: vi.fn(() => ({})),
}));
vi.mock("../collect.js", () => ({ collectData: vi.fn() }));
vi.mock("../shared.js", () => ({ readCachedPayload: vi.fn(() => null) }));
vi.mock("../render.js", () => ({
	renderOverview: vi.fn(),
	renderCategory: vi.fn(),
	renderRecords: vi.fn(),
	renderContent: vi.fn(),
	getViewport: vi.fn(() => ({ rows: 40, cols: 80 })),
}));

import { collectData } from "../collect.js";
import { renderOverview, renderCategory, renderRecords, renderContent } from "../render.js";
import registerContextCommand from "../context.js";

function makeData() {
	return {
		categories: [
			{ label: "System Prompt", value: 100, enterable: false, children: [] },
			{
				label: "System Tools",
				value: 200,
				enterable: true,
				children: [
					{
						label: "read",
						value: 50,
						enterable: true,
						records: [
							{ summary: "file.ts", lines: ["line1", "line2"], toolCallId: "tc1" },
						],
					},
				],
			},
		],
	};
}

function mkTheme() {
	return {
		fg: "white", bg: "black", border: "gray", accent: "cyan", muted: "dim",
		bold: vi.fn((s: string) => s), dim: vi.fn((s: string) => s),
		green: vi.fn((s: string) => s), red: vi.fn((s: string) => s),
		yellow: vi.fn((s: string) => s), blue: vi.fn((s: string) => s),
		cyan: vi.fn((s: string) => s), magenta: vi.fn((s: string) => s),
	};
}

/** 创建一个 kb 对象，matches 能匹配多个 action */
function mkKb() {
	return {
		matches: vi.fn((kd: unknown, action: string) => {
			if (typeof kd !== "string") return false;
			const map: Record<string, string[]> = {
				"tui.select.up": ["up"],
				"tui.select.down": ["down"],
				"tui.select.confirm": ["enter"],
				"tui.select.cancel": ["escape"],
				"tui.editor.pageUp": ["pageup"],
				"tui.editor.pageDown": ["pagedown"],
			};
			return map[action]?.includes(kd) ?? false;
		}),
	};
}

function setup(customData?: any) {
	const data = customData ?? makeData();
	vi.mocked(collectData).mockReturnValue(data as any);
	let capturedCb: any;
	const ctx: any = {
		ui: {
			notify: vi.fn(),
			custom: vi.fn((cb) => { capturedCb = cb; }),
		},
	};
	const pi: any = { registerCommand: vi.fn((_, def) => { (def as any).handler({}, ctx); }) };
	const stateRef: any = { getLastContextMessages: vi.fn(() => []), agingSnapshot: null, manuallyDeletedIds: new Set(), markManuallyDeleted: vi.fn() };
	registerContextCommand(pi, stateRef);
	return { handler: (pi.registerCommand as any).mock.calls[0][1].handler, ctx, capturedCb: () => capturedCb, stateRef, data };
}

describe("层级导航 — overview → category → records → content", () => {
	const t = mkTheme();
	const kb = mkKb();

	beforeEach(() => {
		renderOverview.mockClear();
		renderCategory.mockClear();
		renderRecords.mockClear();
		renderContent.mockClear();
	});

	it("初始渲染 overview", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, vi.fn());
		expect(renderOverview).toHaveBeenCalled();
	});

	it("down 切换选中", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		renderOverview.mockClear();
		ctrl.handleInput("down");
		expect(renderOverview).toHaveBeenCalled();
	});

	it("overview → enterable category", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down"); // to System Tools (index 1, enterable)
		ctrl.handleInput("enter"); // confirm → category
		expect(renderCategory).toHaveBeenCalled();
	});

	it("enterable=false 的分类按确认无反应", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("enter"); // System Prompt — not enterable
		expect(renderCategory).not.toHaveBeenCalled();
	});

	it("category → records (有 records)", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down"); // to System Tools
		ctrl.handleInput("enter"); // → category
		ctrl.handleInput("enter"); // → records (read)
		expect(renderRecords).toHaveBeenCalled();
	});

	it("无 records 的子项进入无反应", async () => {
		const d = makeData();
		d.categories[1].children[0].records = [];
		const s = setup(d);
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down"); // to System Tools
		ctrl.handleInput("enter"); // → category (read has empty records)
		renderRecords.mockClear();
		ctrl.handleInput("enter"); // try to enter
		expect(renderRecords).not.toHaveBeenCalled();
	});

	it("records → content (有 lines)", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down"); // to System Tools
		ctrl.handleInput("enter"); // → category
		ctrl.handleInput("enter"); // → records
		ctrl.handleInput("enter"); // → content
		expect(renderContent).toHaveBeenCalled();
	});

	it("空 lines 的记录进入无反应", async () => {
		const d = makeData();
		d.categories[1].children[0].records[0].lines = [];
		const s = setup(d);
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down");
		ctrl.handleInput("enter"); // → category
		ctrl.handleInput("enter"); // → records
		renderContent.mockClear();
		ctrl.handleInput("enter"); // → content (lines empty → no)
		expect(renderContent).not.toHaveBeenCalled();
	});

	it("esc 逐级返回: content → records → category → overview → done", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("down");
		ctrl.handleInput("enter"); // → category
		ctrl.handleInput("enter"); // → records
		ctrl.handleInput("enter"); // → content
		renderRecords.mockClear();
		ctrl.handleInput("escape"); // esc → records
		expect(renderRecords).toHaveBeenCalled();
		renderCategory.mockClear();
		ctrl.handleInput("escape"); // esc → category
		expect(renderCategory).toHaveBeenCalled();
		renderOverview.mockClear();
		ctrl.handleInput("escape"); // esc → overview
		expect(renderOverview).toHaveBeenCalled();
		ctrl.handleInput("escape"); // esc → done
		expect(done).toHaveBeenCalled();
	});

	it("overview 层 category up/down 切换", async () => {
		const s = setup();
		await s.handler({}, s.ctx);
		const done = vi.fn();
		const ctrl = s.capturedCb()({ requestRender: vi.fn(), terminal: { rows: 40 } }, t, kb, done);
		ctrl.handleInput("up"); // up at index 0 → still 0 (clamped)
		renderOverview.mockClear();
		ctrl.handleInput("down"); // down to index 1
		expect(renderOverview).toHaveBeenCalled();
	});
});
