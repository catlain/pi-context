import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";

// recording.ts 用的是模块级变量，需要动态导入来隔离
describe("recording", () => {
	describe("setRecording / isRecording", () => {
		it("setRecording 返回设置的值", async () => {
			const { setRecording, isRecording } = await import("./recording.js");
			const result = setRecording(true);
			expect(result).toBe(true);
			expect(isRecording()).toBe(true);
		});

		it("toggle: setRecording(false) 返回 false", async () => {
			const { setRecording, isRecording } = await import("./recording.js");
			setRecording(true);
			const result = setRecording(false);
			expect(result).toBe(false);
			expect(isRecording()).toBe(false);
		});
	});

	describe("cleanRecordings", () => {
		it("目录不存在时返回 0", async () => {
			const { cleanRecordings, RECORDINGS_DIR } = await import(
				"./recording.js"
			);
			// 确保目录不存在
			if (existsSync(RECORDINGS_DIR)) rmSync(RECORDINGS_DIR, { recursive: true });
			const count = cleanRecordings();
			expect(count).toBe(0);
		});

		it("清理文件并返回数量", async () => {
			const { cleanRecordings, RECORDINGS_DIR } = await import(
				"./recording.js"
			);
			mkdirSync(RECORDINGS_DIR, { recursive: true });
			writeFileSync(join(RECORDINGS_DIR, "test1.json"), "{}");
			writeFileSync(join(RECORDINGS_DIR, "test2.json"), "{}");
			const count = cleanRecordings();
			expect(count).toBe(2);
			expect(existsSync(RECORDINGS_DIR)).toBe(true); // 目录本身还在
			expect(existsSync(join(RECORDINGS_DIR, "test1.json"))).toBe(false);
		});
	});
});
