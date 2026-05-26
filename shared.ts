/** shared.ts — 配置、常量、持久化工具函数。不持有运行时可变状态。 */
import { join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";

/** 持久化根目录：重启不丢失，用于 manifest、录制、缓存 */
export const DISTILL_DIR = join(process.env.HOME || "/root", ".pi/agent/distill");

// ── Hints 模板配置 ──
export interface HintsConfig {
	distillWarning: string;
	distillWarningShort: string;
	processorSummary: string;
	processorSmallResult: string;
}

const DEFAULT_HINTS: HintsConfig = {
	distillWarning: "📋 [auto-distill] 「{label}」全文 ~{tokens} tokens，超过上下文阈值。请使用 read(offset,limit)/grep 等精确方法获取所需信息，下轮请求时此结果会被自动移除。",
	distillWarningShort: "📋 大结果「{label}」下轮自动移除",
	processorSummary: "[processed] {toolName} 结果（~{tokens} tokens）\n完整内容：{tmpPath}\n\n{preview}\n{more}",
	processorSmallResult: "{formatted}\n\n原文：{tmpPath}",
};

const USER_HINTS_PATH = join(process.env.HOME || "/root", ".pi/agent/extensions/context/hints.json");

function loadHintsConfig(): HintsConfig {
	try {
		if (existsSync(USER_HINTS_PATH)) {
			const userHints = JSON.parse(readFileSync(USER_HINTS_PATH, "utf-8"));
			return { ...DEFAULT_HINTS, ...userHints };
		}
	} catch { /* ignore */ }
	return { ...DEFAULT_HINTS };
}

export const hintsConfig = loadHintsConfig();

/** 替换模板占位符 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
export const RECORDINGS_DIR = join(DISTILL_DIR, "recordings");
export const MSG_CACHE = join(DISTILL_DIR, "last-messages.json");
export const PAYLOAD_CACHE = join(DISTILL_DIR, "last-payload.json");

export interface DistillEntry {
	toolName: string;
	meta: string;
	tokens: number;
	distilledAt: number;
}

export const distilledMap = new Map<string, DistillEntry>();

import { getSettingsSection, patchSettingsSection, getSettingsValue, setSettingsValue } from "@pi-atelier/shared-utils";

// ── 配置（持久化到 settings.json → context） ──
export interface ContextConfig {
	distillThreshold: number;
	agingThreshold: number;
	processorThreshold: number;
}

const DEFAULT_CONFIG: ContextConfig = {
	distillThreshold: 5000,
	agingThreshold: 10,
	processorThreshold: 500,
};

export const getContextConfig = (): ContextConfig =>
	getSettingsSection<ContextConfig>("context", DEFAULT_CONFIG);

export const setContextConfig = (patch: Partial<ContextConfig>): ContextConfig =>
	patchSettingsSection<ContextConfig>("context", patch, DEFAULT_CONFIG);

// ── 录制 ──
let recording = false;
export function isRecording() { return recording; }
export function setRecording(v: boolean) { recording = v; }
export function cleanRecordings() {
	if (existsSync(RECORDINGS_DIR)) {
		for (const f of readdirSync(RECORDINGS_DIR)) rmSync(join(RECORDINGS_DIR, f), { recursive: true, force: true });
	}
}

// ── 文件缓存读写 ──
function safeReadFileSync(p: string) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

/** 读取最后一次 context messages（文件缓存） */
export function readCachedMessages(): any[] {
	try {
		if (existsSync(MSG_CACHE)) {
			const data = JSON.parse(safeReadFileSync(MSG_CACHE));
			if (Array.isArray(data)) return data;
		}
	} catch { /* ignore */ }
	return [];
}

/** 写入 context messages 到文件缓存 */
export function writeCachedMessages(msgs: any[]) {
	try {
		mkdirSync(DISTILL_DIR, { recursive: true });
		writeFileSync(MSG_CACHE, JSON.stringify(msgs));
	} catch { /* ignore */ }
}

/** 读取最后一次 provider payload（文件缓存） */
export function readCachedPayload(): any {
	try {
		if (existsSync(PAYLOAD_CACHE)) return JSON.parse(safeReadFileSync(PAYLOAD_CACHE));
	} catch { /* ignore */ }
	return null;
}

// ── Manifest 持久化（按会话隔离） ──
function getManifestPath(sessionId: string) {
	if (sessionId) {
		const dir = join(DISTILL_DIR, sessionId);
		mkdirSync(dir, { recursive: true });
		return join(dir, "manifest.json");
	}
	return join(DISTILL_DIR, "manifest.json");
}

interface ManifestData {
	distilled: [string, DistillEntry][];
	manuallyDeleted: string[];
	agingDeleted: string[];
	agingCounts: [string, number][];
}

export function saveManifest(sessionId: string, opts: { manuallyDeleted: Iterable<string>; agingDeleted: Iterable<string>; agingCounts?: Iterable<[string, number]> }) {
	try {
		const data: ManifestData = {
			distilled: [...distilledMap],
			manuallyDeleted: [...opts.manuallyDeleted],
			agingDeleted: [...opts.agingDeleted],
			agingCounts: opts.agingCounts ? [...opts.agingCounts] : [],
		};
		writeFileSync(getManifestPath(sessionId), JSON.stringify(data));
	} catch { /* ignore */ }
}

export function loadManifest(sessionId: string, opts: { manuallyDeleted: Set<string>; agingDeleted: Set<string>; agingTracker?: Map<string, number> }) {
	try {
		const p = getManifestPath(sessionId);
		if (!existsSync(p)) return;
		const data: ManifestData = JSON.parse(safeReadFileSync(p));
		if (data.distilled) distilledMap.clear();
		for (const [k, v] of data.distilled || []) distilledMap.set(k, v);
		opts.manuallyDeleted.clear();
		for (const id of data.manuallyDeleted || []) opts.manuallyDeleted.add(id);
		opts.agingDeleted.clear();
		for (const id of data.agingDeleted || []) opts.agingDeleted.add(id);
		if (opts.agingTracker) {
			opts.agingTracker.clear();
			for (const [k, v] of data.agingCounts || []) opts.agingTracker.set(k, v);
		}
	} catch { /* ignore */ }
}

// 启动时恢复 distilledMap（无 sessionId，用全局路径）
try {
	const globalManifest = join(DISTILL_DIR, "manifest.json");
	if (existsSync(globalManifest)) {
		const data: ManifestData = JSON.parse(safeReadFileSync(globalManifest));
		for (const [k, v] of data.distilled || []) distilledMap.set(k, v);
	}
} catch { /* ignore */ }
