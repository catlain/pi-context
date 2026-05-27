/**
 * 会话/录制文件枚举
 *
 * 从 payload-analyzer core.ts 拆出，减少单文件体积。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { RECORDINGS_DIR } from "./core.js";

// ── 类型 ──

export interface SessionInfo {
	sessionId: string;
	fileCount: number;
	totalSize: number;
	firstTs: string;
	lastTs: string;
	model: string;
}

export interface RecordingFile {
	filename: string;
	path: string;
	reqNum: string;
	size: number;
	msgCount: number;
	model: string;
	sessionId: string;
}

// ── 会话枚举 ──

export function listSessions(): SessionInfo[] {
	if (!existsSync(RECORDINGS_DIR)) return [];
	const sessions: SessionInfo[] = [];

	const entries = readdirSync(RECORDINGS_DIR);
	for (const entry of entries) {
		const full = join(RECORDINGS_DIR, entry);
		try {
			if (!statSync(full).isDirectory()) continue;
		} catch { continue; }

		const files = readdirSync(full)
			.filter(f => f.startsWith("req-") && f.endsWith(".json"))
			.sort();
		if (files.length === 0) continue;

		let totalSize = 0;
		let model = "?";
		for (const f of files) {
			try {
				totalSize += statSync(join(full, f)).size;
				if (model === "?") {
					const data = JSON.parse(readFileSync(join(full, f), "utf-8"));
					model = data.model ?? "?";
				}
			} catch {}
		}

		const firstTs = files[0].replace(/^req-\d{4}-/, "").replace(/\.json$/, "");
		const lastTs = files[files.length - 1].replace(/^req-\d{4}-/, "").replace(/\.json$/, "");
		sessions.push({ sessionId: entry, fileCount: files.length, totalSize, firstTs, lastTs, model });
	}

	return sessions.sort((a, b) => a.lastTs.localeCompare(b.lastTs));
}

// ── 录制文件枚举 ──

function collectRecordingFiles(dir: string, sessionId: string): RecordingFile[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter(f => f.startsWith("req-") && f.endsWith(".json"))
		.sort()
		.map(filename => {
			const filepath = join(dir, filename);
			const reqNum = filename.split("-")[1];
			try {
				const stat = statSync(filepath);
				const data = JSON.parse(readFileSync(filepath, "utf-8"));
				return {
					filename, path: filepath, reqNum, size: stat.size,
					msgCount: data.messages?.length ?? 0,
					model: data.model ?? "?",
					sessionId,
				};
			} catch {
				return { filename, path: filepath, reqNum, size: 0, msgCount: 0, model: "?", sessionId };
			}
		});
}

export function listRecordings(sessionId?: string): RecordingFile[] {
	if (!existsSync(RECORDINGS_DIR)) return [];

	if (sessionId) {
		return collectRecordingFiles(join(RECORDINGS_DIR, sessionId), sessionId);
	}

	const all: RecordingFile[] = [];
	const entries = readdirSync(RECORDINGS_DIR);
	let hasFlatFiles = false;
	for (const entry of entries) {
		const full = join(RECORDINGS_DIR, entry);
		try {
			if (statSync(full).isDirectory()) {
				all.push(...collectRecordingFiles(full, entry));
			} else if (entry.startsWith("req-") && entry.endsWith(".json")) {
				hasFlatFiles = true;
			}
		} catch {}
	}
	if (hasFlatFiles) {
		all.push(...collectRecordingFiles(RECORDINGS_DIR, "legacy")
			.filter(f => f.sessionId === "legacy"));
	}
	return all.sort((a, b) => a.path.localeCompare(b.path));
}
