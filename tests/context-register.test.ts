/**
 * context.ts — 注册与 handler 基本测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({}));

const mockContainer = vi.hoisted(() => ({
	addChild: vi.fn(() => ({})),
	clear: vi.fn(),
	render: vi.fn(() => []),
	invalidate: vi.fn(),
}));

vi.mock("@earendil-works/pi-tui", () => ({
	Container: vi.fn(() => mockContainer),
}));

vi.mock("../collect.js", () => ({ collectData: vi.fn() }));
vi.mock("../render.js", () => ({
	getViewport: vi.fn(() => 20),
	renderOverview: vi.fn(),
	renderCategory: vi.fn(),
	renderRecords: vi.fn(),
	renderContent: vi.fn(),
}));
vi.mock("../shared.js", () => ({ readCachedPayload: vi.fn(() => null) }));

import { collectData } from "../collect.js";
import { renderOverview, renderCategory, renderRecords, renderContent } from "../render.js";

// Re-import after mocks
import registerContextCommand from "../context.js";

describe("registerContextCommand — 注册与基础 handler", () => {
	let pi: any, stateRef: any, handler: Function;

	beforeEach(() => {
		vi.clearAllMocks();
		pi = { registerCommand: vi.fn() };
		stateRef = {
			getLastContextMessages: vi.fn(() => []),
			agingSnapshot: new Map(),
			manuallyDeletedIds: new Set(),
			markManuallyDeleted: vi.fn(),
		};
		registerContextCommand(pi, stateRef);

		const call = vi.mocked(pi.registerCommand).mock.calls[0];
		handler = call[1].handler;
	});

	it("注册 /context 命令", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith("context", expect.objectContaining({
			description: expect.any(String),
		}));
	});

	it("handler: 无 data 时 notify warning", async () => {
		vi.mocked(collectData).mockReturnValue(null);
		const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
		await handler({}, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("Context usage info not available.", "warning");
	});

	it("handler: 有 data 时打开 custom 面板", async () => {
		vi.mocked(collectData).mockReturnValue({
			categories: [{ label: "System Prompt", value: 100, enterable: false, children: [] }],
			totalActual: { tokens: 100, contextWindow: 8000, percent: 1.25 },
			limit: { tokens: 8000, contextWindow: 8000, percent: 100 },
		});
		const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
		await handler({}, ctx);
		expect(ctx.ui.custom).toHaveBeenCalled();
		expect(ctx.ui.custom.mock.calls[0][1]).toEqual({
			overlay: true,
			overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 },
		});
	});



	it("custom 回调返回 render/invalidate/handleInput", async () => {
		vi.mocked(collectData).mockReturnValue({
			categories: [{ label: "Sys", value: 100, enterable: false, children: [] }],
			totalActual: { tokens: 100, contextWindow: 8000, percent: 1.25 },
			limit: { tokens: 8000, contextWindow: 8000, percent: 100 },
		});
		let capturedCb: Function | undefined;
		const ctx = {
			ui: {
				notify: vi.fn(),
				custom: vi.fn((cb: Function) => {
					capturedCb = cb;
				}),
			},
		};
		await handler({}, ctx);
		expect(capturedCb).toBeDefined();

		const tui = { requestRender: vi.fn(), terminal: { rows: 40 } };
		const theme = {};
		const kb = { matches: vi.fn(() => false) };
		const done = vi.fn();
		const ctrl = capturedCb!(tui, theme, kb, done);

		expect(ctrl).toHaveProperty("render");
		expect(ctrl).toHaveProperty("invalidate");
		expect(ctrl).toHaveProperty("handleInput");

		// render 被调用时 container.render(w) 被调
		ctrl.render(80);
		expect(mockContainer.render).toHaveBeenCalledWith(80);

		// invalidate 调用 container.invalidate
		ctrl.invalidate();
		expect(mockContainer.invalidate).toHaveBeenCalled();
	});

	it("render 输出填满终端高度", async () => {
		vi.mocked(collectData).mockReturnValue({
			categories: [{ label: "Sys", value: 100, enterable: false, children: [] }],
			totalActual: { tokens: 100, contextWindow: 8000, percent: 1.25 },
			limit: { tokens: 8000, contextWindow: 8000, percent: 100 },
		});
		let capturedCb: Function | undefined;
		const ctx = {
			ui: {
				notify: vi.fn(),
				custom: vi.fn((cb: Function) => { capturedCb = cb; }),
			},
		};
		await handler({}, ctx);

		mockContainer.render.mockReturnValue(["line1", "line2"]);
		const tui = { requestRender: vi.fn(), terminal: { rows: 5 } };
		const ctrl = capturedCb!({ requestRender: vi.fn(), terminal: { rows: 5 } }, {}, { matches: vi.fn(() => false) }, vi.fn());
		const lines = ctrl.render(80);
		expect(lines.length).toBe(5);
		expect(lines[2]).toBe("");
	});

	it("render 调用时调用 renderOverview（初始状态）", async () => {
		vi.mocked(collectData).mockReturnValue({
			categories: [{ label: "Sys", value: 100, enterable: false, children: [] }],
			totalActual: { tokens: 100, contextWindow: 8000, percent: 1.25 },
			limit: { tokens: 8000, contextWindow: 8000, percent: 100 },
		});
		let capturedCb: Function | undefined;
		const ctx = {
			ui: {
				notify: vi.fn(),
				custom: vi.fn((cb: Function) => { capturedCb = cb; }),
			},
		};
		await handler({}, ctx);

		const ctrl = capturedCb!(
			{ requestRender: vi.fn(), terminal: { rows: 40 } },
			{}, { matches: vi.fn(() => false) }, vi.fn()
		);
		expect(renderOverview).toHaveBeenCalled();
	});

	it("kb.matches 默认返回 false（无操作）", async () => {
		vi.mocked(collectData).mockReturnValue({
			categories: [{ label: "Sys", value: 100, enterable: false, children: [] }],
			totalActual: { tokens: 100, contextWindow: 8000, percent: 1.25 },
			limit: { tokens: 8000, contextWindow: 8000, percent: 100 },
		});
		let capturedCb: Function | undefined;
		const ctx = {
			ui: {
				notify: vi.fn(),
				custom: vi.fn((cb: Function) => { capturedCb = cb; }),
			},
		};
		await handler({}, ctx);

		const done = vi.fn();
		const kb = { matches: vi.fn(() => false) };
		const ctrl = capturedCb!({ requestRender: vi.fn(), terminal: { rows: 40 } }, {}, kb, done);

		// 按一个不认识的键 — 无操作
		ctrl.handleInput("unknown_key");
		expect(done).not.toHaveBeenCalled();
	});
});
