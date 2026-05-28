/**
 * code-graph JSON 格式化 — 各工具的具体格式化函数
 *
 * 纯函数，解析失败时返回 fallback 文本。
 */

// ── semantic_code_search ─────────────────────────

export function formatSearchJson(arr: any[]): string {
	return arr
		.map((item) => {
			const parts: string[] = [];
			parts.push(`${item.type ?? "?"} ${item.name}`);
			parts.push(`  ${item.file_path ?? "?"}:${item.start_line ?? ""}`);
			if (item.signature) parts.push(`  ${item.signature}`);
			return parts.join("\n");
		})
		.join("\n");
}

// ── get_call_graph ───────────────────────────────

export function formatCallGraphJson(obj: any): string {
	const lines: string[] = [obj.function];
	if (obj.callers?.length > 0) {
		lines.push("CALLERS:");
		for (const c of obj.callers)
			lines.push(`  ← ${c.name} (${c.file_path ?? "?"})${c.depth ? ` [depth ${c.depth}]` : ""}`);
	}
	if (obj.callees?.length > 0) {
		lines.push("CALLEES:");
		for (const c of obj.callees)
			lines.push(`  → ${c.name} (${c.file_path ?? "?"})${c.depth ? ` [depth ${c.depth}]` : ""}`);
	}
	if (obj.test_callers_filtered)
		lines.push(`(${obj.test_callers_filtered} test callers filtered)`);
	return lines.join("\n");
}

// ── find_references ──────────────────────────────

export function formatReferencesJson(obj: any): string {
	const lines: string[] = [`${obj.total_references} references to '${obj.symbol}'`];
	if (obj.by_relation && typeof obj.by_relation === "object") {
		const stats = Object.entries(obj.by_relation).map(([k, v]) => `${k}: ${v}`).join(", ");
		lines.push(`  (${stats})`);
	}
	for (const ref of obj.references ?? [])
		lines.push(`  [${ref.relation ?? "?"}] ${ref.name} (${ref.file_path ?? "?"})${ref.start_line ? `:${ref.start_line}` : ""}`);
	return lines.join("\n");
}

// ── module_overview ──────────────────────────────

export function formatModuleOverviewJson(obj: any): string {
	const lines: string[] = [];
	if (obj.summary) lines.push(obj.summary);
	else lines.push(`Module '${obj.path}': ${obj.files_count} files`);

	const exports = obj.active_exports ?? [];
	if (exports.length > 0) {
		lines.push("", `ACTIVE (${exports.length}):`);
		for (const exp of exports) {
			const caller = exp.caller_count != null ? ` callers:${exp.caller_count}` : "";
			const sig = exp.signature ? ` ${exp.signature}` : "";
			lines.push(`  ${exp.type ?? "?"} ${exp.name}  ${exp.file ?? "?"}${exp.start_line ? `:${exp.start_line}` : ""}${caller}${sig}`);
		}
	}

	const inactive = obj.inactive_summary ?? [];
	if (inactive.length > 0) {
		lines.push("", "INACTIVE:");
		for (const cat of inactive)
			lines.push(`  ${cat.type ?? "?"} (${cat.count}): ${cat.names?.join(", ") ?? ""}`);
	}
	return lines.join("\n");
}

// ── project_map ──────────────────────────────────

export function formatProjectMapJson(obj: any): string {
	const lines: string[] = [];
	const modules = obj.modules ?? [];
	if (modules.length > 0) {
		for (const m of modules) {
			const syms = m.key_symbols?.length ? ` | ${m.key_symbols.join(", ")}` : "";
			lines.push(`${m.path} (${m.files ?? "?"} files, ${m.functions ?? "?"} fns${syms})`);
		}
	}
	const deps = obj.module_dependencies ?? [];
	if (deps.length > 0) {
		lines.push("", "DEPENDENCIES:");
		for (const d of deps) lines.push(`  ${d.from} → ${d.to}`);
	}
	const hot = obj.hot_functions ?? [];
	if (hot.length > 0) {
		lines.push("", "HOT:");
		for (const h of hot) lines.push(`  ${h.name} (${h.file ?? "?"}) callers:${h.caller_count ?? "?"}`);
	}
	return lines.join("\n");
}

// ── ast_search ───────────────────────────────────

export function formatAstSearchJson(obj: any): string {
	const results = obj.results ?? [];
	if (results.length === 0) return JSON.stringify(obj);
	const lines: string[] = [`${obj.count ?? results.length} results:`];
	for (const r of results) {
		const sig = r.signature ? `  ${r.signature}` : "";
		lines.push(`  ${r.type ?? "?"} ${r.name}  ${r.file_path ?? "?"}${r.start_line ? `:${r.start_line}` : ""}${sig}`);
	}
	return lines.join("\n");
}
