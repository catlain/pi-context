/**
 * index.ts 事件注册测试 — 测试 before_provider_request 录制逻辑
 *
 * 覆盖：
 * - 录制关闭时不写文件
 * - 录制开启时按会话目录写 payload
 * - payload 序号递增
 * - 异常不影响主流程
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

// Mock recording 模块
const mockIsRecording = vi.fn(() => false);
vi.mock("../recording.js", () => ({
	isRecording: (...args: any[]) => mockIsRecording(...args),
	setRecording: vi.fn(() => true),
	RECORDINGS_DIR: join(os.tmpdir(), "test-pi-recordings"),
}));

// Mock shared 模块
vi.mock("../shared.js", () => ({
	DISTILL_DIR: join(os.tmpdir(), "test-pi-distill"),
	PAYLOAD_CACHE: join(os.tmpdir(), "test-pi-distill", "last-payload.json"),
	getContextConfig: vi.fn(() => ({ distillThreshold: 1500, processorThreshold: 2000, agingThreshold: 8 })),
	setContextConfig: vi.fn((v) => v),
	loadManifest: vi.fn(() => ({})),
	saveManifest: vi.fn(),
}));

// Mock handle-context
vi.mock("../handle-context.js", () => ({
	handleContextEvent: vi.fn(),
}));

// Mock context 命令（TUI 面板，需要 inquirer 等）
vi.mock("../context.js", () => ({
	default: vi.fn(),
}));

// Mock clean
vi.mock("../clean.js", () => ({
	cleanContextData: vi.fn(() => ({ cleaned: 0, freedMB: 0 })),
	listSessionData: vi.fn(() => []),
}));

import { RECORDINGS_DIR } from "../recording.js";
import { DISTILL_DIR, PAYLOAD_CACHE } from "../shared.js";

// 导入 index（会执行注册逻辑）
import indexModule from "../index.js";

function createMockPi() {
	const events: Record<string, Function> = {};
	return {
		registerCommand: vi.fn(),
		on: vi.fn((name: string, handler: Function) => {
			events[name] = handler;
		}),
		events,
	};
}

describe("before_provider_request 事件", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		// 清理测试目录
		for (const dir of [RECORDINGS_DIR, DISTILL_DIR]) {
			if (existsSync(dir)) rmSync(dir, { recursive: true });
		}
		mockPi = createMockPi();
	});

	afterEach(() => {
		for (const dir of [RECORDINGS_DIR, DISTILL_DIR]) {
			if (existsSync(dir)) rmSync(dir, { recursive: true });
		}
	});

	it("注册了 before_provider_request 事件", () => {
		indexModule(mockPi as any);
		expect(mockPi.on).toHaveBeenCalledWith(
			"before_provider_request",
			expect.any(Function),
		);
	});

	it("录制关闭时不写 recordings 文件", async () => {
		mockIsRecording.mockReturnValue(false);
		indexModule(mockPi as any);

		const handler = mockPi.events["before_provider_request"];
		await handler({ payload: { messages: [{ role: "user", content: "hi" }] } });

		expect(existsSync(RECORDINGS_DIR)).toBe(false);
	});

	it("录制开启时写 payload 到会话目录", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);

		const handler = mockPi.events["before_provider_request"];
		const payload = { messages: [{ role: "user", content: "hi" }] };

		// 先触发 context 事件来设 sessionId（模拟真实流程）
		// 但 context handler 被 mock 了，所以直接通过 before_provider_request 测
		// sessionId 在闭包里初始为 ""，所以会写到 "unknown" 目录
		await handler({ payload });

		// 应该写到 RECORDINGS_DIR/unknown/
		const unknownDir = join(RECORDINGS_DIR, "unknown");
		expect(existsSync(unknownDir)).toBe(true);
		const files = readdirSync(unknownDir).filter((f) => f.endsWith(".json"));
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^req-0001-/);
	});

	it("连续录制时序号递增", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);

		const handler = mockPi.events["before_provider_request"];
		const payload = { messages: [{ role: "user", content: "hi" }] };

		await handler({ payload });
		await handler({ payload });

		const unknownDir = join(RECORDINGS_DIR, "unknown");
		const files = readdirSync(unknownDir).filter((f) => f.endsWith(".json"));
		expect(files.length).toBe(2);
		expect(files[0]).toMatch(/^req-0001-/);
		expect(files[1]).toMatch(/^req-0002-/);
	});

	it("总是写 last-payload.json（不受录制开关影响）", async () => {
		mockIsRecording.mockReturnValue(false);
		indexModule(mockPi as any);

		const handler = mockPi.events["before_provider_request"];
		const payload = { messages: [{ role: "user", content: "hi" }] };
		await handler({ payload });

		expect(existsSync(PAYLOAD_CACHE)).toBe(true);
	});

	it("无 payload 时不崩溃", async () => {
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({}); // 无 payload
		// 不抛异常即通过
	});

	it("录制异常不影响主流程", async () => {
		mockIsRecording.mockReturnValue(true);
		// 让 writeFileSync 抛异常
		const origWrite = writeFileSync;
		vi.doMock("fs", () => ({
			...require("fs"),
			writeFileSync: (...args: any[]) => {
				if (args[0]?.toString().includes("recordings")) {
					throw new Error("disk full");
				}
				return origWrite(...args);
			},
		}));

		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		// 不抛异常即通过
		await handler({ payload: { messages: [] } });
	});
});

describe("事件注册完整性", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPi = createMockPi();
	});

	it("注册了 context 和 before_provider_request 两个事件", () => {
		indexModule(mockPi as any);
		expect(mockPi.on).toHaveBeenCalledWith("context", expect.any(Function));
		expect(mockPi.on).toHaveBeenCalledWith(
			"before_provider_request",
			expect.any(Function),
		);
	});

	it("注册了所有命令", () => {
		indexModule(mockPi as any);
		const commands = mockPi.registerCommand.mock.calls.map((c: any[]) => c[0]);
		expect(commands).toContain("record");
		expect(commands).toContain("distill-config");
		expect(commands).toContain("aging-config");
		expect(commands).toContain("processor-config");
		expect(commands).toContain("context-clean");
	});
});
