// Bun treats bundler-target .wasm imports as file paths. Test against the real
// Rust module through wasm-bindgen's Node entry point instead.
import { mock } from "bun:test";
import * as wasm from "../rust/wasm/pkg-node/opencut_wasm.js";

mock.module("opencut-wasm", () => wasm);

mock.module(
	new URL(
		"../apps/web/node_modules/opencut-wasm/opencut_wasm.js",
		import.meta.url,
	).pathname,
	() => wasm,
);
