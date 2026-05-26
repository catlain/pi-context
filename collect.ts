/** collect.ts — 纯计算函数：从 messages + payload 构建面板数据 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatTokens } from "./utils.js";
import type { ContextData, RecordItem, DetailItem, CategoryItem, CollectOpts } from "./types.js";

const est = (s: string) => Math.ceil(s.length / 4);

/** 从 provider payload 中提取 system prompt 文本 */
function extractSystemFromPayload(payload: any): string {
	if (!payload) return "";
	if (payload.system != null) {
		if (typeof payload.system === "string") return payload.system;
		if (Array.isArray(payload.system)) {
			return payload.system
				.filter((b: any) => b.type === "text")
				.map((b: any) => b.text)
				.join("\n");
		}
	}
	if (typeof payload.instructions === "string") return payload.instructions;
	if (Array.isArray(payload.messages)) {
		const sysMsg = payload.messages.find((m: any) => m.role === "system" || m.role === "developer");
		if (sysMsg?.content) {
			if (typeof sysMsg.content === "string") return sysMsg.content;
			if (Array.isArray(sysMsg.content)) {
				return sysMsg.content
					.filter((p: any) => p.type === "text")
					.map((p: any) => p.text)
					.join("\n");
		}
		}
	}
	return "";
}

/** 从 provider payload 中提取 tools 定义 */
function extractToolsFromPayload(payload: any): any[] {
	if (!payload?.tools) return [];
	return payload.tools;
}

export function collectData(
	pi: ExtensionAPI,
	ctx: { getContextUsage(): any; getSystemPrompt(): string },
	opts: CollectOpts,
): ContextData | null {
	const usage = ctx.getContextUsage() as { tokens: number; contextWindow: number; percent: number } | undefined;
	if (!usage || usage.tokens == null || usage.contextWindow == null) return null;

	const { messages: msgs, payload, agingSnapshot, manuallyDeletedIds } = opts;
	const hasPayload = !!payload;

	const sysPrompt = extractSystemFromPayload(payload) || ctx.getSystemPrompt();
	const payloadTools = extractToolsFromPayload(payload);
	const fallbackTools = pi.getAllTools().filter((t: any) => pi.getActiveTools().includes(t.name));
	const toolsSource = payloadTools.length > 0 ? payloadTools : fallbackTools;

	// System Prompt
	const sysLines = sysPrompt.split("\n");

	// System Tools
	const toolChildren: DetailItem[] = toolsSource.map((t: any) => {
		const defText = JSON.stringify(t, null, 2);
		const tName = t.name || t.function?.name || "unknown";
		return {
			label: tName, value: est(defText), callTokens: 0, resultTokens: 0,
			color: "dim", enterable: true,
			records: [{ summary: `Tool: ${tName}`, callTokens: est(defText), resultTokens: 0, lines: defText.split("\n") }],
		};
	}).sort((a, b) => b.value - a.value);

	// 从 messages 收集
	let msgRaw = 0, callRaw = 0, resultRaw = 0;
	const userMsgs: RecordItem[] = [], asstMsgs: RecordItem[] = [], sumMsgs: RecordItem[] = [];

	interface Bucket { callT: number; resultT: number; records: RecordItem[] }
	const buckets = new Map<string, Bucket>();
	const getBucket = (n: string) => {
		if (!buckets.has(n)) buckets.set(n, { callT: 0, resultT: 0, records: [] });
		return buckets.get(n)!;
	};

	const tcIdToRecords = new Map<string, RecordItem[]>();

	for (const m of msgs) {
		if (m.role === "user") {
			let text = "", sz = 0;
			if (typeof m.content === "string") { text = m.content; sz = est(text); }
			else if (Array.isArray(m.content)) {
				const parts: string[] = [];
				for (const p of m.content) if (p.type === "text") { parts.push(p.text); sz += est(p.text); }
				text = parts.join("\n");
			}
			msgRaw += sz;
			userMsgs.push({ summary: text.split("\n")[0].slice(0, 60) || "(empty)", callTokens: sz, resultTokens: 0, lines: text.split("\n") });
		} else if (m.role === "assistant") {
			let txtSz = 0; const textParts: string[] = [];
			if (typeof m.content === "string") { txtSz = est(m.content); textParts.push(m.content); }
			else if (Array.isArray(m.content)) for (const p of m.content) {
				if (p.type === "text") { txtSz += est(p.text); textParts.push(p.text); }
				if (p.type === "toolCall") {
					const cs = est(JSON.stringify(p)); callRaw += cs;
					const name = p.name || "unknown";
					const tcId = (p as any).id || "";
					const b = getBucket(name); b.callT += cs;
					const args = (p as any).arguments || {};
					const summary = Object.entries(args).map(([k, v]) => typeof v === "string" ? v : JSON.stringify(v)).join(" ").slice(0, 60);
					const rec: RecordItem = { summary, callTokens: cs, resultTokens: 0, lines: [...Object.entries(args).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`), "────────"], toolCallId: tcId || undefined };
					b.records.push(rec);
					if (tcId) {
						if (!tcIdToRecords.has(tcId)) tcIdToRecords.set(tcId, []);
						tcIdToRecords.get(tcId)!.push(rec);
					}
				}
			}
			msgRaw += txtSz;
			asstMsgs.push({ summary: textParts.join("").split("\n")[0].slice(0, 60) || "(tool calls)", callTokens: txtSz, resultTokens: 0, lines: textParts.join("\n").split("\n") });
		} else if (m.role === "toolResult") {
			const toolName = (m as any).toolName || "unknown";
			const tcId = (m as any).toolCallId || "";
			let rs = 0;
			const textParts: string[] = [];
			if (Array.isArray(m.content)) for (const p of m.content) if (p.type === "text") { rs += est(p.text); textParts.push(p.text); }
			resultRaw += rs;
			const rText = textParts.join("");
			const rLines = rText.split("\n");
			const isDistilled = rText.startsWith("[distilled");
			const b = getBucket(toolName); b.resultT += rs;
			const agingCount = tcId ? agingSnapshot.get(tcId) : undefined;
			// 通过 tcId 关联到已有的 toolCall record
			const linkedRecs = tcId ? tcIdToRecords.get(tcId) : undefined;
			const matched = linkedRecs?.find(r => r.resultTokens === 0) || b.records.find(r => r.resultTokens === 0);
			if (matched) {
				matched.resultTokens = rs;
				matched.lines.push("────────", ...rLines);
				matched.distilled = isDistilled;
				if (tcId && !matched.toolCallId) matched.toolCallId = tcId;
				if (agingCount !== undefined) matched.agingCount = agingCount;
			} else {
				const rec: RecordItem = { summary: rLines[0]?.slice(0, 60) || "(result)", callTokens: 0, resultTokens: rs, lines: rLines, distilled: isDistilled, toolCallId: tcId || undefined, agingCount };
				b.records.push(rec);
				if (tcId) {
					if (!tcIdToRecords.has(tcId)) tcIdToRecords.set(tcId, []);
					tcIdToRecords.get(tcId)!.push(rec);
				}
			}
		}
	}

	const sysRaw = est(sysPrompt);
	const total = usage.tokens, limit = usage.contextWindow;

	if (!hasPayload) {
		return { categories: [], totalActual: total, limit, percent: usage.percent };
	}

	const toolDefText = JSON.stringify(toolsSource);
	const toolDefTokens = est(toolDefText);
	const ratio = (sysRaw + toolDefTokens + msgRaw + callRaw + resultRaw) > 0
		? total / (sysRaw + toolDefTokens + msgRaw + callRaw + resultRaw) : 1;
	const cal = (r: number) => Math.round(r * ratio);

	const cats: CategoryItem[] = [
		{
			label: "System Prompt", value: cal(sysRaw), color: "muted", enterable: true,
			children: [{ label: "Full content", value: cal(sysRaw), callTokens: 0, resultTokens: 0, color: "muted", enterable: true, records: [{ summary: `${sysLines.length} lines`, callTokens: cal(sysRaw), resultTokens: 0, lines: sysLines }] }],
		},
		{
			label: "System Tools", value: cal(toolDefTokens), color: "dim", enterable: toolChildren.length > 0,
			children: toolChildren,
		},
		{
			label: "Messages", value: cal(msgRaw), color: "accent", enterable: true,
			children: [
				{ label: "User", value: cal(userMsgs.reduce((s, r) => s + r.callTokens, 0)), callTokens: 0, resultTokens: 0, color: "accent", enterable: userMsgs.length > 0, records: [...userMsgs].reverse() },
				{ label: "Assistant", value: cal(asstMsgs.reduce((s, r) => s + r.callTokens, 0)), callTokens: 0, resultTokens: 0, color: "accent", enterable: asstMsgs.length > 0, records: [...asstMsgs].reverse() },
				{ label: "Summaries", value: 0, callTokens: 0, resultTokens: 0, color: "dim", enterable: false, records: sumMsgs },
			],
		},
		{
			label: "Tools", value: cal(callRaw + resultRaw), color: "success", enterable: true,
			children: [...buckets.entries()]
				.map(([n, v]) => {
					v.records.reverse();
					if (manuallyDeletedIds.size > 0) {
						for (const r of v.records) {
							if (r.toolCallId && manuallyDeletedIds.has(r.toolCallId)) r.manuallyDeleted = true;
						}
					}
					return {
						label: n, value: cal(v.callT + v.resultT), callTokens: cal(v.callT), resultTokens: cal(v.resultT),
						color: "success", enterable: v.records.length > 0, records: v.records,
					};
				})
				.sort((a, b) => b.value - a.value),
		},
	];
	const accounted = cats.reduce((s, c) => s + c.value, 0);
	if (total - accounted > 10) cats.push({ label: "Available", value: Math.max(0, total - accounted), color: "dim", enterable: false, children: [] });

	return { categories: cats, totalActual: total, limit, percent: usage.percent };
}
