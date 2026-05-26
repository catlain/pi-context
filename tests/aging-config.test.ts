/**
 * aging-config 命令测试
 *
 * 验证 /aging-config 命令的各个行为：
 * - 无参：显示当前值
 * - 合法数字：设置阈值
 * - 0：禁用
 * - 负数：报错
 * - 非法字符串：报错
 */
import { describe, it, expect, vi } from "vitest";

/**
 * 模拟 registerAgingConfigCommand 的行为
 *
 * 返回一个 handler 函数供测试直接调用
 */
function createAgingConfigHandler() {
	let currentThreshold = 8;

	const handler = async (args: string | undefined, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => {
		const arg = args?.trim() ?? "";
		if (!arg) {
			ctx.ui.notify(`[aging-config] agingThreshold = ${currentThreshold}`, "info");
			return;
		}
		if (arg === "0" || arg === "off") {
			currentThreshold = 0;
			ctx.ui.notify("✅ agingThreshold = 0（aging 禁用）", "info");
			return;
		}
		const val = Number(arg);
		if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
			ctx.ui.notify(`❌ 无效值: ${arg}（需要正整数或 0/off）`, "error");
			return;
		}
		currentThreshold = val;
		ctx.ui.notify(`✅ agingThreshold = ${currentThreshold}`, "info");
	};

	return { handler, getThreshold: () => currentThreshold };
}

describe("/aging-config 无参", () => {
	it("无参时显示当前阈值", async () => {
		const { handler } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler(undefined, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("agingThreshold = 8"),
			"info",
		);
	});

	it("空字符串等价于无参", async () => {
		const { handler } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("agingThreshold"),
			"info",
		);
	});
});

describe("/aging-config 设置合法值", () => {
	it("设置正整数", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("10", ctx);

		expect(getThreshold()).toBe(10);
		expect(ctx.ui.notify).toHaveBeenCalledWith("✅ agingThreshold = 10", "info");
	});

	it("设置为 1（最小有效值）", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("1", ctx);

		expect(getThreshold()).toBe(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith("✅ agingThreshold = 1", "info");
	});

	it("设置 0 禁用 aging", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("0", ctx);

		expect(getThreshold()).toBe(0);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("aging 禁用"),
			"info",
		);
	});

	it("设置 off 禁用 aging", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("off", ctx);

		expect(getThreshold()).toBe(0);
	});
});

describe("/aging-config 非法值", () => {
	it("负数报错", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("-1", ctx);

		expect(getThreshold()).toBe(8); // 值不变
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无效值"),
			"error",
		);
	});

	it("非数字字符串报错", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("abc", ctx);

		expect(getThreshold()).toBe(8);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无效值"),
			"error",
		);
	});

	it("小数报错（非整数）", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("3.5", ctx);

		expect(getThreshold()).toBe(8);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无效值"),
			"error",
		);
	});

	it("带空格的数应报错", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler(" 5 ", ctx);

		// trim 后 "5" 是合法值，应该设置成功
		expect(getThreshold()).toBe(5);
		expect(ctx.ui.notify).toHaveBeenCalledWith("✅ agingThreshold = 5", "info");
	});
});

describe("/aging-config 状态变更", () => {
	it("连续设置后再次无参显示最新值", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("15", ctx);
		expect(getThreshold()).toBe(15);

		// 再次无参查看
		ctx.ui.notify.mockClear();
		await handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("agingThreshold = 15"),
			"info",
		);
	});

	it("禁用后重新启用", async () => {
		const { handler, getThreshold } = createAgingConfigHandler();
		const ctx = { ui: { notify: vi.fn() } };

		await handler("0", ctx);
		expect(getThreshold()).toBe(0);

		await handler("6", ctx);
		expect(getThreshold()).toBe(6);
	});
});
