import { expect, test } from "bun:test";
import { registerDefaultEffects, buildDefaultEffectInstance } from "@/effects";
import { resolveEffectPassGroups } from "@/services/renderer/resolve";
import { mediaTimeFromSeconds } from "@/wasm";

test("clip transitions receive local time and duration and render after color effects", () => {
	registerDefaultEffects();
	const transition = buildDefaultEffectInstance({
		effectType: "clip-transition",
	});
	transition.params.inMode = 1;
	const sepia = buildDefaultEffectInstance({ effectType: "sepia" });
	const resolve = () =>
		resolveEffectPassGroups({
			effects: [transition, sepia],
			animations: undefined,
			localTime: mediaTimeFromSeconds({ seconds: 0.25 }),
			duration: mediaTimeFromSeconds({ seconds: 4 }),
			width: 1920,
			height: 1080,
		});
	const passes = resolve();
	expect(passes[0][0].shader).toBe("creative");
	expect(passes[1][0].shader).toBe("clip-transition");
	expect(passes[1][0].uniforms.time).toBe(0.25);
	expect(passes[1][0].uniforms.duration).toBe(4);
	transition.enabled = false;
	expect(resolve()).toHaveLength(1);
});
