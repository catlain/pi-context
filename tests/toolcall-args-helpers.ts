/**
 * toolCall.arguments 截断测试 — 共享辅助函数
 */
import { truncateToolCallArgs } from "../toolcall-args-truncator.js";

export { truncateToolCallArgs };

/** 生成大文本，1 token ≈ 4 字符 */
export function bigStr(tokens: number): string {
	return "x".repeat(tokens * 4);
}

/** 构造单条 assistant 消息，含一个 toolCall block */
export function makeAssistantMsg(
	tcId: string,
	toolName: string,
	args: Record<string, any>,
) {
	return {
		role: "assistant",
		content: [
			{ type: "toolCall", id: tcId, name: toolName, arguments: args },
		],
	};
}

/** 构造多条 assistant 消息 */
export function makeMessages(
	pairs: Array<{ id: string; name: string; args: Record<string, any> }>,
): any[] {
	return pairs.map((p) => makeAssistantMsg(p.id, p.name, p.args));
}
