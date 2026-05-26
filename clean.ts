/** clean.ts — distill 数据清理工具 */
import { join } from "path";
import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { DISTILL_DIR } from "./shared.js";

/** 计算目录大小（字节） */
function dirSizeBytes(dir: string): number {
	let total = 0;
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) total += dirSizeBytes(full);
			else if (entry.isFile()) total += statSync(full).size;
		}
	} catch { /* ignore */ }
	return total;
}

/** 列出所有会话数据及其大小 */
export function listSessionData(): { sessionId: string; sizeMB: number }[] {
	if (!existsSync(DISTILL_DIR)) return [];
	return readdirSync(DISTILL_DIR, { withFileTypes: true })
		.filter(d => d.isDirectory() && d.name.length >= 8) // UUID 格式的目录
		.map(d => ({
			sessionId: d.name,
			sizeMB: dirSizeBytes(join(DISTILL_DIR, d.name)) / 1024 / 1024,
		}));
}

/** 清理指定会话或全部的 distill 数据 */
export function cleanContextData(sessionId?: string): { cleaned: number; freedMB: number } {
	if (sessionId) {
		const dir = join(DISTILL_DIR, sessionId);
		if (!existsSync(dir)) return { cleaned: 0, freedMB: 0 };
		const sizeMB = dirSizeBytes(dir) / 1024 / 1024;
		rmSync(dir, { recursive: true, force: true });
		return { cleaned: 1, freedMB: Math.round(sizeMB * 100) / 100 };
	}
	// 全部清理
	if (!existsSync(DISTILL_DIR)) return { cleaned: 0, freedMB: 0 };
	const sessions = listSessionData();
	const totalMB = sessions.reduce((s, x) => s + x.sizeMB, 0);
	// 清理全部会话目录 + processor + 缓存文件
	for (const s of sessions) {
		const dir = join(DISTILL_DIR, s.sessionId);
		rmSync(dir, { recursive: true, force: true });
	}
	// 清理 processor 目录
	const processorDir = join(DISTILL_DIR, "processor");
	if (existsSync(processorDir)) rmSync(processorDir, { recursive: true, force: true });
	// 清理全局缓存文件
	for (const f of ["last-messages.json", "last-payload.json"]) {
		const p = join(DISTILL_DIR, f);
		if (existsSync(p)) rmSync(p);
	}
	return { cleaned: sessions.length, freedMB: Math.round(totalMB * 100) / 100 };
}
