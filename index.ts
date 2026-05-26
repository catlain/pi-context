/** index.ts — context-manager 扩展入口：上下文管理、distill/aging、录制、分析 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerContextCommand from "./context.js";
import { registerRecordCommand, registerDistillConfigCommand, registerAgingConfigCommand, registerProcessorConfigCommand, registerContextCleanCommand } from "./commands.js";
import { registerPayloadAnalyzeTool } from "./payload-analyze.js";
import { handleContextEvent, type ContextState } from "./handle-context.js";
import { loadManifest, PAYLOAD_CACHE, RECORDINGS_DIR, DISTILL_DIR } from "./shared.js";
import { writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { getSettingsValue } from "@pi-atelier/shared-utils";

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
				const { readFileSync: rf, existsSync: ef } = require("fs");
				if (ef(PAYLOAD_CACHE)) return JSON.parse(rf(PAYLOAD_CACHE, "utf-8"));
			} catch { /* ignore */ }
			return null;
		},
		markManuallyDeleted: (tcId: string) => {
			manuallyDeletedIds.add(tcId);
			const { saveManifest } = require("./shared.js");
			saveManifest(sessionId, { manuallyDeleted: manuallyDeletedIds, agingDeleted: agingDeletedIds });
		},
	};

	// ── context 事件：distill/aging ──
	pi.on("context", async (event: any, _ctx: any) => {
		handleContextEvent(event, _ctx, state, pi);
		return { messages: event.messages };
	});

	// ── before_provider_request：写 last-payload + recordings ──
	pi.on("before_provider_request", async (event, ctx) => {
		const payload = event.payload;
		if (!payload) return;

		try {
			mkdirSync(DISTILL_DIR, { recursive: true });
			writeFileSync(PAYLOAD_CACHE, JSON.stringify(payload));

			// recordings（按 /record on 启用）
			if (getSettingsValue("recording.enabled", false)) {
				const sid = ctx?.sessionManager?.getSessionId?.() ?? "unknown";
				const sessionDir = join(RECORDINGS_DIR, sid);
				mkdirSync(sessionDir, { recursive: true });
				const files = readdirSync(sessionDir).filter(f => f.endsWith(".json"));
				const nextIdx = files.length + 1;
				const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				writeFileSync(
					join(sessionDir, `req-${String(nextIdx).padStart(4, "0")}-${ts}.json`),
					JSON.stringify(payload),
					{ mode: 0o600 },
				);
			}
		} catch { /* ignore */ }
	});

	// ── 注册命令 ──
	registerContextCommand(pi, stateRef);
	registerRecordCommand(pi);
	registerDistillConfigCommand(pi);
	registerAgingConfigCommand(pi);
	registerProcessorConfigCommand(pi);
	registerContextCleanCommand(pi);

	// ── 注册工具 ──
	registerPayloadAnalyzeTool(pi);
}
