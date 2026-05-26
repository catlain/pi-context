/** index.ts — context 扩展入口：闭包持有运行时状态，创建 stateRef 传给子模块 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerContextCommand from "./context.js";
import { registerRecordCommand, registerDistillConfigCommand, registerAgingConfigCommand, registerProcessorConfigCommand } from "./commands.js";
import { handleContextEvent, type ContextState } from "./handle-context.js";
import { loadManifest } from "./shared.js";

export default function (pi: ExtensionAPI) {
	// ── 闭包状态 ──
	const agingTracker = new Map<string, number>();
	const agingSnapshot = new Map<string, number>();
	const manuallyDeletedIds = new Set<string>();
	const agingDeletedIds = new Set<string>();
	const seenArgs = new Set<string>();
	const truncatedToolCallIds = new Set<string>();
	let lastMessages: any[] = [];
	let sessionId = "";

	const state: ContextState = {
		agingTracker, agingSnapshot, manuallyDeletedIds, agingDeletedIds,
		seenArgs, truncatedToolCallIds,
		get lastMessages() { return lastMessages; },
		set lastMessages(v) { lastMessages = v; },
		get sessionId() { return sessionId; },
		set sessionId(v) { sessionId = v; },
	};

	// ── stateRef（传给 context.ts） ──
	const stateRef = {
		agingSnapshot,
		manuallyDeletedIds,
		getLastContextMessages: () => lastMessages,
		getLastProviderPayload: () => {
			try {
				const fs = require("fs");
				const path = require("path");
				const cachePath = path.join(require("os").homedir(), ".pi/agent/distill", "last-payload.json");
				if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
			} catch { /* ignore */ }
			return null;
		},
		markManuallyDeleted: (tcId: string) => {
			manuallyDeletedIds.add(tcId);
			const { saveManifest } = require("./shared.js");
			saveManifest(sessionId, { manuallyDeleted: manuallyDeletedIds, agingDeleted: agingDeletedIds });
		},
	};

	// ── 注册事件 ──
	pi.on("context", async (event: any, _ctx: any) => {
		handleContextEvent(event, _ctx, state, pi);
		return { messages: event.messages };
	});

	// ── 注册命令 ──
	registerContextCommand(pi, stateRef);
	registerRecordCommand(pi);
	registerDistillConfigCommand(pi);
	registerAgingConfigCommand(pi);
	registerProcessorConfigCommand(pi);
}
