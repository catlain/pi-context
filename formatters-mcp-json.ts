/**
 * MCP JSON 工具结果格式化
 *
 * 处理 MCP 工具（Godot MCP 等）返回的大型 JSON 输出。
 * Godot MCP 的 game_query 返回 JSON.stringify(result, null, 2) 格式，
 * 场景树可能包含大量节点数据。
 *
 * 纯函数签名：(text: string) => string
 * 解析/格式化失败时 fallback 返回原始文本。
 *
 * 格式化策略：
 * 1. 嗅探确认是 MCP 工具的 JSON 输出
 * 2. 场景树（含 children 递归结构）→ 只保留前 2 层 + 统计深层节点数
 * 3. 节点属性（含 properties）→ 保留非默认属性
 * 4. 大型 JSON → 行数截断 + 标注
 */

const MAX_JSON_LINES = 80;
const SCENE_TREE_MAX_DEPTH = 2;
const PREVIEW_HEAD = 30;
const PREVIEW_TAIL = 10;

// ── 嗅探：检测 MCP 工具的 JSON 输出 ──────────────

export function sniffMcpJson(text: string): boolean {
	if (!text.startsWith("{")) return false;
	try {
		const obj = JSON.parse(text);
		// Godot MCP 输出特征：status + data，data 含场景树或节点属性
		if (obj.status !== "success" && obj.status !== "error") return false;
		if (typeof obj.data !== "object" || !obj.data) return false;
		// 排除 code-graph AST JSON（有 file_path + type + signature）
		if (
			typeof obj.data.file_path === "string" &&
			typeof obj.data.signature === "string"
		) {
			return false;
		}
		// 必须有 Godot 场景特征：children 或 type+properties
		return !!(obj.data.children || obj.data.root?.children || obj.data.properties || obj.data.type);
	} catch {
		return false;
	}
}

// ── 主格式化 ─────────────────────────────────────

export function formatMcpJsonResult(text: string): string {
	if (!text) return text;
	if (!sniffMcpJson(text)) return text;

	let obj: any;
	try {
		obj = JSON.parse(text);
	} catch {
		return text;
	}

	// 短 JSON 直接返回
	if (text.length <= 2000) return text;

	// 场景树压缩
	if (obj.data?.root || obj.data?.children) {
		return formatSceneTree(obj);
	}

	// 节点属性压缩
	if (obj.data?.properties) {
		return formatNodeProperties(obj);
	}

	// 通用大 JSON 截断
	return truncateLargeJson(text);
}

// ── 场景树压缩 ───────────────────────────────────

function formatSceneTree(obj: any): string {
	const root = obj.data.root || obj.data;
	const stats = { nodes: 0, maxDepth: 0, types: {} as Record<string, number> };
	const pruned = pruneTree(root, 0, stats);

	const summary = [
		`[Scene Tree Summary]`,
		`Total nodes: ${stats.nodes}`,
		`Max depth: ${stats.maxDepth}`,
		`Node types: ${Object.entries(stats.types)
			.sort(([, a], [, b]) => b - a)
			.map(([k, v]) => `${k}(${v})`)
			.join(", ")}`,
		"",
		"[Tree Structure (depth ≤ 2)]",
		JSON.stringify(pruned, null, 2),
	];

	return summary.join("\n");
}

/** 递归剪裁场景树：只保留前 SCENE_TREE_MAX_DEPTH 层，统计深层节点 */
function pruneTree(
	node: any,
	depth: number,
	stats: { nodes: number; maxDepth: number; types: Record<string, number> },
): any {
	stats.nodes++;
	if (depth > stats.maxDepth) stats.maxDepth = depth;
	const t = node.type || "Unknown";
	stats.types[t] = (stats.types[t] || 0) + 1;

	const result: any = { name: node.name || "?", type: t };
	if (node.path) result.path = node.path;

	if (Array.isArray(node.children) && node.children.length > 0) {
		if (depth < SCENE_TREE_MAX_DEPTH) {
			result.children = node.children.map((c: any) =>
				pruneTree(c, depth + 1, stats),
			);
		} else {
			const childStats = { nodes: 0 };
			countNodes(node, childStats);
			result.children = `... (${childStats.nodes} nodes hidden)`;
		}
	}

	return result;
}

/** 递归统计子节点数 */
function countNodes(node: any, stats: { nodes: number }): void {
	stats.nodes++;
	if (Array.isArray(node.children)) {
		for (const c of node.children) countNodes(c, stats);
	}
}

// ── 节点属性压缩 ─────────────────────────────────

function formatNodeProperties(obj: any): string {
	const data = obj.data;
	const props = data.properties || {};

	// 分离非默认属性和默认属性
	const nonDefault: Record<string, any> = {};
	const defaultKeys: string[] = [];

	for (const [key, value] of Object.entries(props)) {
		if (isDefaultValue(value)) {
			defaultKeys.push(key);
		} else {
			nonDefault[key] = value;
		}
	}

	const lines = [
		`[Node: ${data.name || "?"}]`,
		`Type: ${data.type || "?"}"`,
		"",
		"[Properties (non-default)]",
		JSON.stringify(nonDefault, null, 2),
	];

	if (defaultKeys.length > 0) {
		lines.push("", `[Default properties omitted: ${defaultKeys.join(", ")}]`);
	}

	return lines.join("\n");
}

/** 判断值是否为 Godot 默认值 */
function isDefaultValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === "boolean") return value === true; // visible: true 是默认
	if (typeof value === "number") return value === 0 || value === 1;
	if (typeof value === "object") {
		// { x: 0, y: 0, z: 0 } 是默认位置/旋转
		const vals = Object.values(value as Record<string, unknown>);
		return vals.every(
			(v) => v === 0 || v === 1 || (typeof v === "number" && Math.abs(v as number) < 0.001),
		);
	}
	return false;
}

// ── 通用大 JSON 截断 ─────────────────────────────

function truncateLargeJson(text: string): string {
	const lines = text.split("\n");
	if (lines.length <= MAX_JSON_LINES) return text;

	const head = lines.slice(0, PREVIEW_HEAD);
	const tail = lines.slice(-PREVIEW_TAIL);
	return (
		head.join("\n") +
		`\n... (${lines.length - PREVIEW_HEAD - PREVIEW_TAIL} lines truncated)\n` +
		tail.join("\n")
	);
}
