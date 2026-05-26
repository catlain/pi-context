/** context.ts — 纯 UI 逻辑：context 面板命令注册 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { collectData } from "./collect.js";
import { renderOverview, renderCategory, renderRecords, renderContent, getViewport } from "./render.js";
import { readCachedPayload } from "./shared.js";
import type { ContextData, CategoryItem, DetailItem, RecordItem, ContextStateRef } from "./types.js";

type Level = "overview" | "category" | "records" | "content";
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function registerContextCommand(pi: ExtensionAPI, stateRef: ContextStateRef) {
	pi.registerCommand("context", {
		description: "Show context usage visualization.",
		handler: async (_args, ctx) => {
			const data = collectData(pi, ctx, {
				messages: stateRef.getLastContextMessages(),
				payload: readCachedPayload(),
				agingSnapshot: stateRef.agingSnapshot,
				manuallyDeletedIds: stateRef.manuallyDeletedIds,
			});
			if (!data) { ctx.ui.notify("Context usage info not available.", "warning"); return; }

			await ctx.ui.custom((tui, theme, kb, done) => {
				const container = new Container();
				let lvl: Level = "overview";
				let oIdx = 0, dIdx = 0, rIdx = 0, scroll = 0, rScroll = 0;
				let curCat: CategoryItem = data.categories[0];
				let curDetail: DetailItem | null = null;
				let curRecord: RecordItem | null = null;
				let confirmingDelete = false;

				const viewport = getViewport(tui);

				const render = () => {
					switch (lvl) {
						case "overview": renderOverview(container, data, theme, oIdx); break;
						case "category": renderCategory(container, data, theme, curCat, dIdx); break;
						case "records": renderRecords(container, data, theme, `${curCat.label} › ${curDetail?.label}`, curDetail?.records || [], rIdx, curCat.label === "Tools", rScroll, viewport); break;
						case "content": if (curRecord) renderContent(container, theme, `${curCat.label} › ${curDetail?.label} › #${rIdx + 1} ${curRecord.summary.slice(0, 30)}`, curRecord, scroll, viewport, confirmingDelete); break;
					}
					tui.requestRender();
				};
				render();

				return {
					render: (w: number) => {
						const lines = container.render(w);
						const termHeight = (tui as any).terminal?.rows || parseInt(process.env.LINES || "40");
						const target = termHeight;
						while (lines.length < target) lines.push("");
						return lines;
					},
					invalidate: () => container.invalidate(),
					handleInput: (kd: any) => {
						const up = kb.matches(kd, "tui.select.up");
						const dn = kb.matches(kd, "tui.select.down");
						const ok = kb.matches(kd, "tui.select.confirm");
						const esc = kb.matches(kd, "tui.select.cancel");
						const pgup = kb.matches(kd, "tui.editor.pageUp");
						const pgdn = kb.matches(kd, "tui.editor.pageDown");
						const keyD = kd === "d" || kd === "D";
						const keyY = kd === "y" || kd === "Y";
						const keyN = kd === "n" || kd === "N";

						// 删除确认状态
						if (confirmingDelete) {
							if (keyY && curRecord?.toolCallId) {
								stateRef.markManuallyDeleted(curRecord.toolCallId);
								curRecord.manuallyDeleted = true;
								confirmingDelete = false;
								ctx.ui.notify(`已标记删除: ${curRecord.summary.slice(0, 40)}`, "info");
								render(); return;
							}
							if (keyN || esc) {
								confirmingDelete = false;
								render(); return;
							}
							return; // 忽略其他键
						}

						// Level 3: 滚动 + 删除操作
						if (lvl === "content" && curRecord) {
							const max = Math.max(0, curRecord.lines.length - viewport);
							if (up) scroll = Math.max(0, scroll - 1);
							else if (dn) scroll = Math.min(max, scroll + 1);
							else if (pgup) scroll = Math.max(0, scroll - viewport);
							else if (pgdn) scroll = Math.min(max, scroll + viewport);
							else if (keyD && curRecord.toolCallId && !curRecord.manuallyDeleted) {
								confirmingDelete = true;
							}
							else if (esc) { lvl = "records"; scroll = 0; }
							else return;
							render(); return;
						}

						// Level 0-2: 选择/导航
						if (up || dn) {
							const dir = up ? -1 : 1;
							if (lvl === "overview") oIdx = clamp(oIdx + dir, 0, data.categories.length - 1);
							else if (lvl === "category") dIdx = clamp(dIdx + dir, 0, (curCat.children?.length ?? 1) - 1);
							else if (lvl === "records") {
								rIdx = clamp(rIdx + dir, 0, (curDetail?.records?.length ?? 1) - 1);
								const recCount = curDetail?.records?.length ?? 1;
								const reserved = 7;
								const visible = Math.max(1, viewport - reserved);
								if (rIdx < rScroll) rScroll = rIdx;
								else if (rIdx >= rScroll + visible) rScroll = rIdx - visible + 1;
							}
							render(); return;
						}
						if (pgup || pgdn) {
							if (lvl === "records") {
								const recCount = curDetail?.records?.length ?? 1;
								const reserved = 7;
								const visible = Math.max(1, viewport - reserved);
								const step = visible;
								const dir = pgup ? -1 : 1;
								rScroll = clamp(rScroll + dir * step, 0, Math.max(0, recCount - visible));
								rIdx = clamp(rIdx + dir * step, 0, recCount - 1);
								render(); return;
							}
						}
						if (ok) {
							if (lvl === "overview") {
								const cat = data.categories[oIdx];
								if (cat?.enterable && cat.children?.length) { curCat = cat; dIdx = 0; lvl = "category"; }
							} else if (lvl === "category") {
								const ch = curCat.children?.[dIdx];
								if (ch?.enterable && ch.records?.length) { curDetail = ch; rIdx = 0; rScroll = 0; lvl = "records"; }
							} else if (lvl === "records" && curDetail) {
								const rec = curDetail.records[rIdx];
								if (rec && rec.lines.length > 0) { curRecord = rec; scroll = 0; lvl = "content"; }
							}
							render(); return;
						}
						if (esc) {
							if (lvl === "records") { lvl = "category"; rScroll = 0; }
							else if (lvl === "category") lvl = "overview";
							else { done(undefined); return; }
							render();
						}
					},
				};
			}, {
				overlay: true,
				overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 },
			});
		},
	});
}
