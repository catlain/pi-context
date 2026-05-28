import path from "node:path";
import { createConfig } from "../vitest.config.base";

const globalNodeModules =
	"/home/lain/.local/share/fnm/node-versions/v22.22.2/installation/lib/node_modules";

export default createConfig({
	alias: {
		"@earendil-works/pi-coding-agent": true,
		"@earendil-works/pi-tui": path.resolve(
			globalNodeModules,
			"@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/esm/index.js",
		),
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
