/**
 * /record 命令测试 — 直接测试 commands.ts 的 registerRecordCommand
 *
 * 覆盖：
 * - /record on → 开启录制 + 清理旧文件
 * - /record off → 关闭录制
 * - /record（无参）→ toggle
 * - setRecording 返回值（之前的 void→boolean bug）
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock recording 模块
vi.mock("../recording.js", () => ({
	setRecording: vi.fn(),
	isRecording: vi.fn(() => false),
	cleanRecordings: vi.fn(() => 0),
	RECORDINGS_DIR: "/tmp/test-recordings",
}));

import { setRecording, isRecording, cleanRecordings } from "../recording.js";
import { registerRecordCommand } from "../commands.js";

function createMockPi() {
	const registered: { name: string; handler: Function }[] = {};
	return {
		registerCommand: vi.fn((name, opts) => {
			registered[name] = opts.handler;
		}),
		handlers: registered,
	};
}

describe("/record 命令", () => {
	let mockPi: ReturnType<typeof createMockPi>;
	let notify: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPi = createMockPi();
		notify = vi.fn();
		registerRecordCommand(mockPi as any);
	});

	it("注册命令名为 record", () => {
		expect(mockPi.registerCommand).toHaveBeenCalledWith(
			"record",
			expect.any(Object),
		);
	});

	it("/record on → setRecording(true) 并通知开启", async () => {
		(setRecording as any).mockReturnValue(true);
		(cleanRecordings as any).mockReturnValue(0);

		const handler = mockPi.handlers["record"];
		await handler("on", { ui: { notify } });

		expect(setRecording).toHaveBeenCalledWith(true);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("录制已开启"),
			"info",
		);
	});

	it("/record on → 清理旧文件时附带清理数量", async () => {
		(setRecording as any).mockReturnValue(true);
		(cleanRecordings as any).mockReturnValue(3);

		const handler = mockPi.handlers["record"];
		await handler("on", { ui: { notify } });

		expect(cleanRecordings).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("已清理 3 个旧文件"),
			"info",
		);
	});

	it("/record off → setRecording(false) 并通知关闭", async () => {
		(setRecording as any).mockReturnValue(false);

		const handler = mockPi.handlers["record"];
		await handler("off", { ui: { notify } });

		expect(setRecording).toHaveBeenCalledWith(false);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("录制已关闭"),
			"info",
		);
	});

	it("/record 无参 → toggle 行为（当前关 → 开）", async () => {
		(isRecording as any).mockReturnValue(false);
		(setRecording as any).mockReturnValue(true);

		const handler = mockPi.handlers["record"];
		await handler("", { ui: { notify } });

		expect(isRecording).toHaveBeenCalled();
		expect(setRecording).toHaveBeenCalledWith(true);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("录制已开启"),
			"info",
		);
	});

	it("/record 无参 → toggle 行为（当前开 → 关）", async () => {
		(isRecording as any).mockReturnValue(true);
		(setRecording as any).mockReturnValue(false);

		const handler = mockPi.handlers["record"];
		await handler(undefined, { ui: { notify } });

		expect(setRecording).toHaveBeenCalledWith(false);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("录制已关闭"),
			"info",
		);
	});

	it("/record ON（大写）→ 正常处理（不区分大小写）", async () => {
		(setRecording as any).mockReturnValue(true);

		const handler = mockPi.handlers["record"];
		await handler("ON", { ui: { notify } });

		expect(setRecording).toHaveBeenCalledWith(true);
	});

	it("setRecording 返回 void 时不会误判为开启（回归 bug）", async () => {
		// 模拟旧的 void 返回值
		(setRecording as any).mockReturnValue(undefined);

		const handler = mockPi.handlers["record"];
		await handler("on", { ui: { notify } });

		// void → falsy → 走 else 分支 → 显示关闭
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("录制已关闭"),
			"info",
		);
	});
});
