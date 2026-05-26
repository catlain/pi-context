/** recording.ts — payload 录制状态管理 */
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { DISTILL_DIR } from "./shared.js";

export const RECORDINGS_DIR = join(DISTILL_DIR, "recordings");

let recording = false;

export function isRecording(): boolean {
	return recording;
}

export function setRecording(v: boolean): boolean {
	recording = v;
	return v;
}

export function cleanRecordings(): number {
	let count = 0;
	if (existsSync(RECORDINGS_DIR)) {
		for (const f of readdirSync(RECORDINGS_DIR)) {
			rmSync(join(RECORDINGS_DIR, f), { recursive: true, force: true });
			count++;
		}
	}
	return count;
}
