/**
 * 录制文件列表和内部工具函数
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import {
	estTokens, getText,
	buildProviderToolCallIndex,
	classifyStatus,
	readJsonFile, RECORDINGS_DIR,
} from "./core.js";
import { listSessions } from "./files-core.js";

// ════════════════════════════════════════════════════════════
// 文件列表
// ════════════════════════════════════════════════════════════

export interface RecordingEntry { filename: string; path: string }

/** 列出指定目录下的 req-*.json 文件 */
export function listRecordingFiles(dir: string): RecordingEntry[] | null {
	if (!existsSync(dir)) return null;
	const entries = readdirSync(dir)
		.filter(f => f.startsWith("req-") && f.endsWith(".json"))
		.sort()
		.map(f => ({ filename: f, path: join(dir, f) }));
	return entries.length ? entries : null;
}

/** 根据 sessionId 获取录制文件列表（支持会话子目录 + 旧版兼容） */
export function getRecordingFiles(sessionId?: string): RecordingEntry[] | null {
	if (sessionId) {
		return listRecordingFiles(join(RECORDINGS_DIR, sessionId));
	}
	// 未指定会话：汇总所有会话文件，或 fallback 到旧版扁平目录
	const sessions = listSessions();
	if (sessions.length > 0) {
		const all: RecordingEntry[] = [];
		for (const s of sessions) {
			const files = listRecordingFiles(join(RECORDINGS_DIR, s.sessionId));
			if (files) all.push(...files);
		}
		return all.length ? all : null;
	}
	return listRecordingFiles(RECORDINGS_DIR);
}

// ════════════════════════════════════════════════════════════
// 时间线收集
// ════════════════════════════════════════════════════════════

export interface TimelineEntry {
	req: string; idx: number; status: string; tokens: number;
	preview: string;
}

/** 按 argsSig 跨 payload 追踪 */
export function collectTimeline(files: RecordingEntry[]): Map<string, TimelineEntry[]> {
	const timeline = new Map<string, TimelineEntry[]>();
	for (const { path, filename } of files) {
		const reqNum = filename.split("-")[1];
		const data = readJsonFile(path);
		if (!data) continue;
		const msgs = data.messages ?? [];
		const toolIdx = buildProviderToolCallIndex(msgs);
		for (let i = 0; i < msgs.length; i++) {
			const m = msgs[i];
			if (m.role !== "tool") continue;
			const tcid = m.tool_call_id ?? "";
			const info = toolIdx.get(tcid) ?? { name: "unknown", argsStr: tcid };
			const text = getText(m.content);
			const sig = `${info.name}:${info.argsStr}`;
			if (!timeline.has(sig)) timeline.set(sig, []);
			timeline.get(sig)!.push({
				req: reqNum, idx: i, status: classifyStatus(text),
				tokens: estTokens(text), preview: text.slice(0, 80).replace(/\n/g, "\\n"),
			});
		}
	}
	return timeline;
}

/** 按 toolCallId 追踪：同一个 tcId 在多个 req 中的出现情况 */
export function collectTimelineByTcId(files: RecordingEntry[]): Map<string, TimelineEntry[]> {
	const timeline = new Map<string, TimelineEntry[]>();
	for (const { path, filename } of files) {
		const reqNum = filename.split("-")[1];
		const data = readJsonFile(path);
		if (!data) continue;
		const msgs = data.messages ?? [];
		const toolIdx = buildProviderToolCallIndex(msgs);
		for (let i = 0; i < msgs.length; i++) {
			const m = msgs[i];
			if (m.role !== "tool") continue;
			const tcid = m.tool_call_id ?? "";
			if (!tcid) continue;
			const info = toolIdx.get(tcid) ?? { name: "unknown", argsStr: tcid };
			const text = getText(m.content);
			if (!timeline.has(tcid)) timeline.set(tcid, []);
			timeline.get(tcid)!.push({
				req: reqNum, idx: i, status: classifyStatus(text),
				tokens: estTokens(text), preview: text.slice(0, 80).replace(/\n/g, "\\n"),
			});
		}
	}
	return timeline;
}
