import { Container, Text, Spacer } from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { formatTokens } from "./utils.js";
import type { ContextData, CategoryItem, DetailItem, RecordItem } from "./types.js";

const bdr = (c: Container, t: any) => c.addChild(new DynamicBorder((s: string) => t.fg("accent", s)));
const ln = (c: Container, t: any, s: string) => c.addChild(new Text(s, 1, 0));
const sp = (c: Container) => c.addChild(new Spacer(1));
const pct = (v: number, lim: number) => `${((v / lim) * 100).toFixed(1)}%`;

function makeBar(pct: number, w: number, t: any): string {
	const f = Math.round((pct / 100) * w);
	return t.fg("accent", "█".repeat(Math.max(0, f))) + t.fg("borderMuted", "░".repeat(Math.max(0, w - f)));
}

/** Level 0 — 总览 */
export function renderOverview(c: Container, d: ContextData, t: any, sel: number) {
	c.clear(); bdr(c, t);
	ln(c, t, t.fg("accent", t.bold(" Context Usage")));
	sp(c);
	ln(c, t, `  ${makeBar(d.percent, 40, t)}  ${t.fg("text", t.bold(`${d.percent.toFixed(1)}%`))}`);
	ln(c, t, `  ${t.fg("text", `${formatTokens(d.totalActual)} / ${formatTokens(d.limit)}`)}`);
	sp(c);
	if (d.categories.length === 0) {
		ln(c, t, t.fg("dim", "  ⏳ 发送一条消息后显示详细分项"));
		sp(c);
		ln(c, t, t.fg("dim", "  ↑↓ select · Enter drill in · Esc close"));
		bdr(c, t);
		return;
	}
	for (let i = 0; i < d.categories.length; i++) {
		const cat = d.categories[i];
		const ptr = i === sel ? t.fg("accent", "→ ") : "  ";
		const icon = cat.enterable ? t.fg("dim", "…") : " ";
		ln(c, t, `${ptr}${t.fg(cat.color as any, "■")} ${t.fg("text", cat.label.padEnd(14))} ${t.fg("accent", formatTokens(cat.value).padStart(7))} ${t.fg("dim", `(${pct(cat.value, d.limit)})`)} ${icon}`);
	}
	sp(c);
	ln(c, t, t.fg("dim", " ↑↓ select · Enter drill in · Esc close"));
	bdr(c, t);
}

/** Level 1 — 分类细项 (Messages → User/Assistant/…, Tools → read/bash/…) */
export function renderCategory(c: Container, d: ContextData, t: any, cat: CategoryItem, sel: number) {
	c.clear(); bdr(c, t);
	ln(c, t, t.fg("accent", t.bold(` Context › ${cat.label}`)));
	sp(c);
	ln(c, t, `  ${t.fg("text", "Total".padEnd(14))} ${t.fg("accent", formatTokens(cat.value).padStart(7))} ${t.fg("dim", `(${pct(cat.value, d.limit)})`)}`);
	sp(c);
	cat.children.forEach((ch, i) => {
		const ptr = i === sel ? t.fg("accent", "→ ") : "  ";
		const icon = ch.enterable ? t.fg("dim", "…") : " ";
		const cnt = ch.records.length ? t.fg("dim", `×${ch.records.length} `) : "";
		if (ch.callTokens || ch.resultTokens) {
			ln(c, t, `${ptr}${t.fg(ch.color as any, "■")} ${t.fg("text", ch.label.padEnd(14))} ${t.fg("success", formatTokens(ch.callTokens).padStart(6))} ${t.fg("warning", formatTokens(ch.resultTokens).padStart(6))} ${cnt}${icon}`);
		} else {
			ln(c, t, `${ptr}${t.fg(ch.color as any, "■")} ${t.fg("text", ch.label.padEnd(14))} ${t.fg("accent", formatTokens(ch.value).padStart(7))} ${cnt}${icon}`);
		}
	});
	sp(c);
	ln(c, t, t.fg("dim", " ↑↓ select · Enter drill in · Esc back"));
	bdr(c, t);
}

/** Level 2 — 记录列表 */
export function renderRecords(c: Container, d: ContextData, t: any, breadcrumb: string, records: RecordItem[], sel: number, isTool: boolean, scroll: number, viewport: number) {
	c.clear(); bdr(c, t);
	ln(c, t, t.fg("accent", t.bold(` Context › ${breadcrumb}`)));
	sp(c);
	ln(c, t, `  ${t.fg("dim", `${records.length} records`)}`);
	sp(c);
	// 计算可见窗口
	const reserved = 7; // header(4) + footer(3)
	const visible = Math.max(1, viewport - reserved);
	const maxScroll = Math.max(0, records.length - visible);
	const start = Math.min(scroll, maxScroll);
	const end = Math.min(start + visible, records.length);
	for (let i = start; i < end; i++) {
		const r = records[i];
		const ptr = i === sel ? t.fg("accent", "→ ") : "  ";
		const idx = t.fg("dim", `#${(i + 1).toString().padStart(2)} `);
		const sum = (r.summary.length > 40 ? r.summary.slice(0, 37) + "..." : r.summary).padEnd(40);
		const distilledTag = r.distilled ? " " + t.fg("warning", "✂") : "";
		const agingTag = r.agingCount != null ? " " + t.fg("muted", `⏳${r.agingCount}`) : "";
		if (isTool) {
			const cv = r.callTokens > 0 ? formatTokens(r.callTokens).padStart(6) : "     -";
			const rv = r.resultTokens > 0 ? formatTokens(r.resultTokens).padStart(6) : "     -";
			ln(c, t, `${ptr}${idx}${t.fg("text", sum)} ${t.fg("success", cv)} ${t.fg("warning", rv)}${distilledTag}${agingTag} ${t.fg("dim", "…")}`);
		} else {
			ln(c, t, `${ptr}${idx}${t.fg("text", sum)} ${t.fg("accent", formatTokens(r.callTokens).padStart(6))}${distilledTag}${agingTag} ${t.fg("dim", "…")}`);
		}
	}
	sp(c);
	if (records.length > visible) {
		ln(c, t, t.fg("dim", ` ${start + 1}-${end}/${records.length}  ↑↓ pgUp/pgDn · Enter detail · Esc back`));
	} else {
		ln(c, t, t.fg("dim", " ↑↓ select · Enter detail · Esc back"));
	}
	bdr(c, t);
}

export function getViewport(tui: any): number {
	const termHeight = (tui as any)?.terminal?.rows || parseInt(process.env.LINES || "40");
	return Math.max(10, Math.floor(termHeight * 0.8));
}

export function renderContent(c: Container, t: any, breadcrumb: string, record: RecordItem, scroll: number, viewport: number, confirmingDelete: boolean) {
	c.clear(); bdr(c, t);
	ln(c, t, t.fg("accent", t.bold(` Context › ${breadcrumb}`)));
	const info = [record.callTokens > 0 ? `call: ${formatTokens(record.callTokens)}` : "", record.resultTokens > 0 ? `result: ${formatTokens(record.resultTokens)}` : ""].filter(Boolean).join("  ");
	ln(c, t, `  ${t.fg("dim", info)}`);
	sp(c);
	if (record.manuallyDeleted) {
		ln(c, t, `  ${t.fg("warning", "✗ 已标记删除 — 下轮对话起不再发送给 LLM")}`);
		sp(c);
	}
	const lines = record.lines;
	const maxScroll = Math.max(0, lines.length - viewport);
	const start = Math.min(scroll, maxScroll);
	const end = Math.min(start + viewport, lines.length);
	for (let i = start; i < end; i++) {
		const num = t.fg("dim", `${(i + 1).toString().padStart(4)} `);
		const content = lines[i].length > 200 ? lines[i].slice(0, 197) + "..." : lines[i];
		ln(c, t, `${num}${t.fg("text", content)}`);
	}
	sp(c);
	// Footer — 根据状态显示不同提示
	if (confirmingDelete) {
		ln(c, t, t.fg("warning", " 确认删除此工具结果？ y 确认 · n/Esc 取消"));
	} else if (record.toolCallId && !record.manuallyDeleted) {
		if (lines.length > viewport) {
			ln(c, t, t.fg("dim", ` ${start + 1}-${end}/${lines.length}  ↑↓ pgUp/pgDn · d delete · Esc back`));
		} else {
			ln(c, t, t.fg("dim", ` ${lines.length} lines · d delete · Esc back`));
		}
	} else {
		if (lines.length > viewport) {
			ln(c, t, t.fg("dim", ` ${start + 1}-${end}/${lines.length}  ↑↓ pgUp/pgDn · Esc back`));
		} else {
			ln(c, t, t.fg("dim", ` ${lines.length} lines · Esc back`));
		}
	}
	bdr(c, t);
}
