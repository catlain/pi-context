/**
 * payload_analyze 工具注册
 *
 * 注册 1 个 pi 自定义工具：
 * - payload_analyze: 分析 provider payload 录制文件
 *   action: list/single/overview/chain/chain-tcid/stats/diff/budget/expensive/growth/messages
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	doList,
	doSingle,
	doOverview,
	doChain,
	doDiff,
} from "./analyze.js";
import { doChainTcId, doStats } from "./stats.js";
import { doBudget, doGrowth, doExpensive } from "./metrics.js";
import { doMessages } from "./messages.js";
import { DISTILL_DIR } from "../shared.js";
import { getRecordingFiles } from "./files.js";
import { join } from "path";

const LAST_PAYLOAD = join(DISTILL_DIR, "last-payload.json");

export function registerPayloadAnalyzer(pi: ExtensionAPI) {
	pi.registerTool({
		name: "payload_analyze",
		label: "Payload Analyzer",
		description:
			"分析 provider payload 录制文件。" +
			"\nlist: 列出录制文件" +
			"\nsingle: 分析单个 payload（tool result 状态分布）" +
			"\noverview: 详细分析 payload 结构（逐消息 token、distill 事件）" +
			"\nchain: 跨 payload 追踪同一 argsSig 的命运" +
			"\nchain-tcid: 跨 payload 追踪同一 toolCallId 的命运（验证 distill 行为）" +
			"\nstats: 聚合统计 distill/processor 命中率" +
			"\ndiff: 对比两个 payload 差异" +
			"\nbudget: Token 预算分析（每个请求的 system/tools/history 构成）" +
			"\nexpensive: 找出最贵的工具调用（按 token 排序）" +
			"\ngrowth: 上下文增长趋势（token 随请求变化的曲线）" +
			"\nmessages: 按索引/范围/关键词精确定位消息（msgIndex/msgRange/grep/toolName）" +
			"\n需要先开启 record（/record on）产生录制文件。",
		promptSnippet: "分析 payload 录制文件：token 分布、增长趋势、昂贵调用",
		promptGuidelines: [
			"Use payload_analyze to inspect provider payload recordings for debugging token usage and distill behavior.",
			"Use action='budget' for token cost breakdown, action='growth' for context growth trend, action='expensive' to find biggest tool results.",
			"Use action='list' to see available recordings, action='overview' for detailed per-message analysis.",
			"Use action='messages' to precisely locate specific messages by index (msgIndex), range (msgRange='5-10' or 'last:5'), grep (keyword/regex), or toolName filter.",
			"Use action='messages' with msgIndex to see a message's full content with context, instead of reading the raw JSON.",
		],
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("list"),
				Type.Literal("single"),
				Type.Literal("overview"),
				Type.Literal("chain"),
				Type.Literal("chain-tcid"),
				Type.Literal("stats"),
				Type.Literal("diff"),
				Type.Literal("budget"),
				Type.Literal("expensive"),
				Type.Literal("growth"),
				Type.Literal("messages"),
			]),
			payloadPath: Type.Optional(
				Type.String({ description: "Payload 文件路径（single/overview/diff 用）" }),
			),
			payloadPath2: Type.Optional(
				Type.String({ description: "第二个 payload 路径（diff 用）" }),
			),
			verbose: Type.Optional(
				Type.Boolean({ description: "详细模式（overview 用），默认 false" }),
			),
			topN: Type.Optional(
				Type.Number({ description: "expensive 的 Top N，默认 20" }),
			),
			sessionId: Type.Optional(
				Type.String({ description: "会话 ID，用于按会话过滤录制文件" }),
			),
			// messages action 专用参数
			msgIndex: Type.Optional(
				Type.Number({ description: "messages action: 查看第 N 条消息（0-based）" }),
			),
			msgRange: Type.Optional(
				Type.String({ description: "messages action: 消息范围，如 '5-10'、'last:5'" }),
			),
			grep: Type.Optional(
				Type.String({ description: "messages action: 按关键词/正则过滤消息文本" }),
			),
			toolName: Type.Optional(
				Type.String({ description: "messages action: 按工具名过滤 tool result" }),
			),
			context: Type.Optional(
				Type.Number({ description: "messages action: msgIndex 模式的上下文条数（默认 3）" }),
			),
		}),

		async execute(
			_id: string,
			params: any,
			_signal: any,
			_onUpdate: any,
			_ctx: any,
		): Promise<any> {
			try {
				const sid = params.sessionId || undefined;
				switch (params.action) {
					case "list":
						return { content: [{ type: "text", text: doList(sid) }], details: {} };
					case "single":
						return { content: [{ type: "text", text: doSingle(params.payloadPath ?? LAST_PAYLOAD) }], details: {} };
					case "overview":
						return { content: [{ type: "text", text: doOverview(params.payloadPath ?? LAST_PAYLOAD, params.verbose ?? false) }], details: {} };
					case "chain":
						return { content: [{ type: "text", text: doChain(sid) }], details: {} };
					case "chain-tcid":
						return { content: [{ type: "text", text: doChainTcId(sid) }], details: {} };
					case "stats":
						return { content: [{ type: "text", text: doStats(sid) }], details: {} };
					case "diff": {
						if (!params.payloadPath || !params.payloadPath2) {
							return { content: [{ type: "text", text: "❌ diff 需要 payloadPath 和 payloadPath2 两个参数" }], details: {} };
						}
						return { content: [{ type: "text", text: doDiff(params.payloadPath, params.payloadPath2) }], details: {} };
					}
					case "budget":
						return { content: [{ type: "text", text: doBudget(sid) }], details: {} };
					case "expensive": {
						const files = getRecordingFiles(sid);
						if (!files) return { content: [{ type: "text", text: "没有录制文件" }], details: {} };
						return { content: [{ type: "text", text: doExpensive(files, params.topN ?? 10) }], details: {} };
					}
					case "growth":
						return { content: [{ type: "text", text: doGrowth(sid) }], details: {} };
					case "messages": {
						const payloadPath = params.payloadPath ?? LAST_PAYLOAD;
						return {
							content: [{ type: "text", text: doMessages({
								payloadPath,
								msgIndex: params.msgIndex,
								msgRange: params.msgRange,
								grep: params.grep,
								toolName: params.toolName,
								context: params.context,
							}) }],
							details: {},
						};
					}
					default:
						return { content: [{ type: "text", text: `未知 action: ${params.action}` }], details: {} };
				}
			} catch (err: unknown) {
				return {
					content: [{ type: "text", text: `❌ 错误: ${err instanceof Error ? err.message : String(err)}` }],
					details: {},
				};
			}
		},
	});
}
