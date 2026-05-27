import path from "node:path";
import { createConfig } from "../vitest.config.base";

export default createConfig({
	alias: {
		"@earendil-works/pi-coding-agent": true,
		"@pi-atelier/shared-utils": path.resolve(__dirname, "../pi-shared-utils"),
		"@pi-atelier/context-manager": path.resolve(__dirname, "./lib"),
	"typebox": path.resolve(__dirname, "node_modules/@sinclair/typebox/build/esm/index.mjs"),

	},
	fileParallelism: false,
	include: ["tests/**/*.test.ts"],
	test: {
		testTimeout: 10000,
	},
});
