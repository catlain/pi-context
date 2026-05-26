/**
 * 工具结果后处理器入口
 *
 * 注册 tool_result handler，委托核心逻辑到 tool-result-processor-core。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { processToolResult, type ProcessorOptions } from "./tool-result-processor-core.js";
import { getContextConfig } from "./shared.js";

const DEFAULT_THRESHOLD = 4000;

/**
 * 注册 tool_result handler。
 *
 * @param pi - ExtensionAPI 实例
 * @param options - 可选配置覆盖（主要用于测试）
 */
export function registerToolResultProcessor(
	pi: ExtensionAPI,
	options?: ProcessorOptions,
): void {
	// 每次调用时从 settings 读阈值（支持 /processor-config 热更新）
	const writeFallback = options?.writeFallback ?? false;

	(pi as any).on("tool_result", (event: any, ctx: any) => {
		try {
			const threshold = options?.distillThreshold ?? getContextConfig().processorThreshold;
			if (threshold <= 0) return undefined; // 0 = 禁用
			const sessionId = ctx?.sessionManager?.getSessionId?.();
			const result = processToolResult(event, threshold, writeFallback, sessionId);

			return result;
		} catch {
			return undefined;
		}
	});
}
