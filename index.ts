/** index.ts — context 扩展入口：闭包持有运行时状态，创建 stateRef 传给子模块 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	registerAgingConfigCommand,
	registerContextCleanCommand,
	registerDistillConfigCommand,
	registerProcessorConfigCommand,
	registerRecordCommand,
} from "./commands.js";
import registerContextCommand from "./context.js";
import { type ContextState, handleContextEvent } from "./handle-context.js";
import { isRecording, RECORDINGS_DIR } from "./recording.js";
import { DISTILL_DIR, loadManifest, PAYLOAD_CACHE } from "./shared.js";
import { registerToolResultProcessor } from "./tool-result-processor.js";

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
		agingTracker,
		agingSnapshot,
		manuallyDeletedIds,
		agingDeletedIds,
		seenArgs,
		truncatedToolCallIds,
		get lastMessages() {
			return lastMessages;
		},
		set lastMessages(v) {
			lastMessages = v;
		},
		get sessionId() {
			return sessionId;
		},
		set sessionId(v) {
			sessionId = v;
		},
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
				const cachePath = path.join(
					require("os").homedir(),
					".pi/agent/distill",
					"last-payload.json",
				);
				if (fs.existsSync(cachePath))
					return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
			} catch {
				/* ignore */
			}
			return null;
		},
		markManuallyDeleted: (tcId: string) => {
			manuallyDeletedIds.add(tcId);
			const { saveManifest } = require("./shared.js");
			saveManifest(sessionId, {
				manuallyDeleted: manuallyDeletedIds,
				agingDeleted: agingDeletedIds,
			});
		},
	};

	// ── 注册事件 ──
	pi.on("context", async (event: any, _ctx: any) => {
		handleContextEvent(event, _ctx, state, pi);
		return { messages: event.messages };
	});

	// ── before_provider_request：写 last-payload + recordings ──
	pi.on("before_provider_request", async (event, ctx) => {
		const payload = event.payload;
		if (!payload) return;

		try {
			const { mkdirSync, writeFileSync, readdirSync } = require("fs");
			const { join } = require("path");

			mkdirSync(DISTILL_DIR, { recursive: true });
			writeFileSync(PAYLOAD_CACHE, JSON.stringify(payload));

			// recordings（按 /record on 启用）
			if (isRecording()) {
				// 优先从 ctx.sessionManager 获取 sessionId（闭包变量可能在 context 事件前为空）
				const sid = ctx?.sessionManager?.getSessionId?.() || sessionId || "unknown";
				const sessionDir = join(RECORDINGS_DIR, sid);
				mkdirSync(sessionDir, { recursive: true });
				const files = readdirSync(sessionDir).filter((f: string) => f.endsWith(".json"));
				const nextIdx = files.length + 1;
				const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				writeFileSync(
					join(sessionDir, `req-${String(nextIdx).padStart(4, "0")}-${ts}.json`),
					JSON.stringify(payload),
					{ mode: 0o600 },
				);
			}
		} catch {
			/* ignore — 录制不应影响主流程 */
		}
	});

	// ── 注册 tool_result handler（工具输出后处理/压缩）──
	registerToolResultProcessor(pi);

	// ── 注册命令 ──
	registerContextCommand(pi, stateRef);
	registerRecordCommand(pi);
	registerDistillConfigCommand(pi);
	registerAgingConfigCommand(pi);
	registerProcessorConfigCommand(pi);
	registerContextCleanCommand(pi);
}
