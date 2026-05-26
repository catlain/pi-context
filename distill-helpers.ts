import { formatTokens } from "./utils.js";
import { createHash } from "crypto";
import { join } from "path";
import { tmpdir } from "os";

// ── toolCall 映射 ──

/** 从 assistant 消息中提取 toolCall 映射（pi 内部格式：type="toolCall", id, name, arguments） */
export function buildToolCallMap(messages: any[]): Map<string, { name: string; arguments: any }> {
	const map = new Map<string, { name: string; arguments: any }>();
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		for (const block of (Array.isArray(msg.content) ? msg.content : [])) {
			if (block.type === "toolCall" && block.id) {
				map.set(block.id, { name: block.name, arguments: block.arguments });
			}
		}
	}
	return map;
}

/** 提取工具元信息：优先用 ToolResultMessage 自带的 toolName，再从 toolCallMap 查参数细节 */
export function toolMeta(msg: any, toolCallMap: Map<string, { name: string; arguments: any }>): { name: string; meta: string } {
	const name = msg.toolName || "unknown";
	const callId = msg.toolCallId || "";
	const info = toolCallMap.get(callId);
	const details = info?.arguments;
	switch (name) {
		case "read": return { name, meta: details?.path ? String(details.path) : "" };
		case "write": return { name, meta: details?.path ? String(details.path) : "" };
		case "edit": return { name, meta: details?.path ? String(details.path) : "" };
		case "bash": return { name, meta: details?.command ? String(details.command).split("\n")[0].slice(0, 80) : "" };
		case "grep": return { name, meta: [details?.pattern, details?.path].filter(Boolean).join(" in ") };
		case "find": return { name, meta: details?.pattern ? String(details.pattern) : "" };
		case "ls": return { name, meta: details?.path ? String(details.path) : "" };
		default: return { name, meta: "" };
	}
}

// ── token 估算 ──

/** 估算 token 数（字符数 / 4，向上取整） */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// ── toolCall/toolResult 配对清理 ──

/** 清理孤立的 toolCall block（删除 toolResult 后必须调用） */
export function removeOrphanedToolCalls(messages: any[]): void {
	// 1. 收集所有剩余 toolResult 的 toolCallId
	const activeToolCallIds = new Set<string>();
	for (const msg of messages) {
		if (msg.role === "toolResult" && msg.toolCallId) {
			activeToolCallIds.add(msg.toolCallId);
		}
	}
	// 2. 从 assistant 消息中移除没有对应 toolResult 的 toolCall block
	for (const msg of messages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			if (!msg.content.some((b: any) => b.type === "toolCall")) continue;
			msg.content = msg.content.filter(
				(b: any) => b.type !== "toolCall" || activeToolCallIds.has(b.id)
			);
		}
	}
	// 3. 删除内容为空的 assistant 消息（toolCall 全部移除且无 text/thinking）
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role === "assistant" && Array.isArray(m.content) && m.content.length === 0) {
			messages.splice(i, 1);
		}
	}
}

// ── 以下函数保留供 index.test.ts 使用（旧蒸馏逻辑的辅助函数） ──

/** 按工具类型提取关键参数作为去重签名 */
export function buildArgsSignature(name: string, args: Record<string, any> | undefined): string {
    if (!args) return "";
    switch (name) {
        case "read":
        case "edit":
        case "write":
            return String(args.path || "");
        case "bash":
            return String(args.command || "").split("\n")[0].slice(0, 80);
        case "grep":
            return [args.pattern, args.path].filter(Boolean).join(" in ");
        case "find":
            return String(args.pattern || "");
        case "ls":
            return String(args.path || "");
        default:
            return "";
    }
}

/** 生成固定 tmp 文件路径（按参数签名去重） */
export function buildTmpPath(toolName: string, argsSignature: string, distillDir: string = join(tmpdir(), "pi-distill")): string {
    const hash = argsSignature
        ? createHash("sha256").update(argsSignature).digest("hex").slice(0, 8)
        : "no-sig";
    return join(distillDir, `${toolName}-${hash}.txt`);
}

/** 生成带元信息的 tmp 文件内容 */
export function formatTmpContent(
    meta: { name: string; meta: string },
    origLines: string[],
    origTokens: number,
): string {
    const header = meta.meta
        ? `=== [distilled ${meta.name}] ${meta.meta} ===`
        : `=== [distilled ${meta.name}] ===`;
    const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
    const size = `Original: ~${formatTokens(origTokens)} tokens, ${origLines.length} lines`;
    return `${header}\nUpdated: ${ts}\n${size}\n\n${origLines.join("\n")}`;
}

/** 生成摘要文本：元信息 + 前 N 行预览 + 临时文件路径 */
export function buildSummary(info: { name: string; meta: string }, origLines: string[], tmpPath: string, origTokens: number, previewLines: number): string {
	const header = info.meta ? `[distilled ${info.name}] ${info.meta}` : `[distilled ${info.name}]`;
	const size = `Original: ${origTokens} tokens (~${formatTokens(origTokens)}), ${origLines.length} lines`;
	const preview = origLines.slice(0, previewLines).map((l, i) => `${(i + 1).toString().padStart(3)} ${l}`).join("\n");
	const more = origLines.length > previewLines ? `\n... (${origLines.length - previewLines} more lines)` : "";
	return `${header}\n${size}\nFull content: ${tmpPath}\n\n${preview}${more}`;
}
