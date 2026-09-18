// Bun can cache a file: dependency with an unchanged version. Refresh only the
// installed copies of our locally built package after rebuilding WebAssembly.
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "rust/wasm/pkg");
for (const relative of [
	"node_modules/opencut-wasm",
	"apps/web/node_modules/opencut-wasm",
]) {
	const destination = resolve(root, relative);
	if (!existsSync(destination)) continue;
	for (const name of readdirSync(source)) {
		if (name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".wasm"))
			copyFileSync(resolve(source, name), resolve(destination, name));
	}
}
