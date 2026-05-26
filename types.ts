export interface RecordItem {
	summary: string;
	callTokens: number;
	resultTokens: number;
	/** Level 3 详情页内容（按行，支持翻页） */
	lines: string[];
	/** 是否已被 auto-distill 压缩 */
	distilled?: boolean;
	/** 关联的 toolCallId（仅 toolResult 类型有值，用于手动删除） */
	toolCallId?: string;
	/** 是否已被手动标记删除 */
	manuallyDeleted?: boolean;
	/** 已随请求发送给 LLM 的次数（aging 计数） */
	agingCount?: number;
}

export interface DetailItem {
	label: string;
	value: number;
	callTokens: number;
	resultTokens: number;
	color: string;
	enterable: boolean;
	records: RecordItem[];
}

export interface CategoryItem {
	label: string;
	value: number;
	color: string;
	enterable: boolean;
	children: DetailItem[];
}

export interface ContextData {
	categories: CategoryItem[];
	totalActual: number;
	limit: number;
	percent: number;
}

/** collectData 需要的外部数据（纯函数参数） */
export interface CollectOpts {
	/** 最后一次发给 LLM 的 messages（aging/distill 后） */
	messages: any[];
	/** 最后一次 provider payload */
	payload: any;
	/** aging 计数快照（tcId → count） */
	agingSnapshot: Map<string, number>;
	/** 用户手动删除的 tcId 集合 */
	manuallyDeletedIds: Set<string>;
}

/** context.ts 需要的状态引用（由 index.ts 闭包提供） */
export interface ContextStateRef {
	/** aging 计数快照（tcId → count） */
	readonly agingSnapshot: Map<string, number>;
	/** 用户手动删除的 tcId 集合 */
	readonly manuallyDeletedIds: Set<string>;
	/** 获取最后一次发给 LLM 的 messages */
	getLastContextMessages(): any[];
	/** 获取最后一次 provider payload（从文件缓存读取） */
	getLastProviderPayload(): any;
	/** 标记工具结果为手动删除 */
	markManuallyDeleted(tcId: string): void;
}
